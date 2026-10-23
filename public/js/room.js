// Логика комнаты: места, лобби, ход партии, боты. Не зависит от транспорта,
// поэтому одинаково работает на сервере (онлайн) и в браузере (локальная игра).
import { newGame, act, botAct, snapshot, cleanAction, seededRng, replayer, BOT_LEVELS, SIZES, RULES_VERSION } from './engine.js';

const MAX = 4;
// Сколько ждём отключившегося игрока: в партии — до того, как за него начнёт ходить бот, в лобби — до того, как место освободится.
// Телефон, свёрнутый на минуту, или метро не должны выкидывать человека из игры.
export const GRACE = { play: 30_000, lobby: 90_000 };
const clean = (s, n = 14) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, n);

export class Room {
  constructor(code, { title = 'Комната', isPublic = true, onUpdate = () => {}, onEmote = () => {}, onRecord = () => {} } = {}) {
    this.code = code; this.title = clean(title, 24) || 'Комната'; this.isPublic = !!isPublic;
    this.onUpdate = onUpdate; this.onEmote = onEmote; this.onRecord = onRecord; this.rec = null;
    this.seats = []; this.host = -1; this.phase = 'lobby';
    this.opts = { bonus: true, roles: true, botLevel: 'hard', size: 9 }; this.game = null; this.timer = null; this.lastActive = Date.now();
    this.away = new Map(); // токен → таймер, который освободит место в лобби
  }

  idxOf(token) { return this.seats.findIndex((s) => s.token === token); }
  humans() { return this.seats.filter((s) => !s.bot); }
  hasConnected() { return this.seats.some((s) => !s.bot && s.connected); }

  sit({ token, name, bot = false, local = false, vid = null }) {
    const ex = token ? this.idxOf(token) : -1;
    if (ex >= 0) {
      const s = this.seats[ex];
      s.connected = true; s.offAt = null; s.left = false;
      clearTimeout(this.away.get(token)); this.away.delete(token);
      this.touch(); this.schedule(); return { idx: ex };
    }
    if (this.phase !== 'lobby') return { err: 'Игра уже идёт' };
    if (this.seats.length >= MAX) return { err: 'Комната заполнена' };
    this.seats.push({ token, name: clean(name) || 'Игрок', bot, local, vid, connected: true });
    const idx = this.seats.length - 1;
    if (this.host < 0 && !bot) this.host = idx;
    this.touch(); return { idx };
  }

  /* Игрок пропал. left — ушёл сам: в лобби место освобождается сразу, в партии бот подменяет его без ожидания.
     Иначе это обрыв связи: место держится GRACE, и за это время можно вернуться с тем же токеном. */
  drop(token, { left = false } = {}) {
    const i = this.idxOf(token); if (i < 0) return;
    const s = this.seats[i];
    if (this.phase === 'lobby' && left) { this.removeSeat(i); this.touch(); return; }
    s.connected = false; s.left = left; s.offAt = Date.now();
    if (this.phase === 'lobby') {
      this.holdSeat(s);
      // хост пропал из лобби — кнопку «Начать» получает тот, кто на связи
      const other = this.seats.findIndex((q) => !q.bot && q.connected);
      if (this.host === i && other >= 0) this.host = other;
    }
    this.touch(); this.schedule();
  }
  holdSeat(s) {
    clearTimeout(this.away.get(s.token));
    this.away.set(s.token, setTimeout(() => {
      this.away.delete(s.token);
      const i = this.seats.indexOf(s);
      if (i >= 0 && !s.connected && this.phase === 'lobby') { this.removeSeat(i); this.touch(); }
    }, GRACE.lobby));
  }

  removeSeat(i) {
    this.seats.splice(i, 1);
    if (this.host === i) { this.host = this.seats.findIndex((s) => !s.bot && s.connected); if (this.host < 0) this.host = this.seats.findIndex((s) => !s.bot); }
    else if (this.host > i) this.host--;
  }

  touch() { this.lastActive = Date.now(); this.onUpdate(); }
  isHost(i) { return i >= 0 && i === this.host; }

  addBot(by) {
    if (!this.isHost(by) || this.phase !== 'lobby' || this.seats.length >= MAX) return;
    const n = this.seats.filter((s) => s.bot).length + 1;
    this.seats.push({ token: null, name: 'Бот ' + n, bot: true, connected: true });
    this.touch();
  }
  kick(by, i) {
    if (!this.isHost(by) || this.phase !== 'lobby' || i === by || !this.seats[i]) return null;
    const t = this.seats[i].token; this.removeSeat(i); this.touch(); return t;
  }
  setOpts(by, o) {
    if (!this.isHost(by) || this.phase !== 'lobby') return;
    if (typeof o.bonus === 'boolean') this.opts.bonus = o.bonus;
    if (typeof o.roles === 'boolean') this.opts.roles = o.roles;
    if (typeof o.isPublic === 'boolean') this.isPublic = o.isPublic;
    if (BOT_LEVELS.includes(o.botLevel)) this.opts.botLevel = o.botLevel;
    if (SIZES.includes(o.size)) this.opts.size = o.size;
    this.touch();
  }
  start(by) {
    if (!this.isHost(by) || this.phase !== 'lobby' || this.seats.length < 2) return;
    // зерно и список действий — это вся запись партии: по ним её можно повторить ход за ходом
    const seed = Math.floor(Math.random() * 2 ** 32);
    this.rng = seededRng(seed);
    this.game = newGame(this.seats, this.opts, this.rng);
    this.rec = { id: this.game.id, rv: RULES_VERSION, seed, opts: { ...this.opts }, t0: Date.now(), actions: [],
      seats: this.seats.map((s) => ({ bot: !!s.bot, ...(s.bot ? { level: this.opts.botLevel } : {}), ...(s.vid ? { vid: s.vid } : {}) })) };
    this.phase = 'playing'; this.touch(); this.schedule();
  }
  rematch(by) {
    if (!this.isHost(by) || this.phase === 'lobby') return;
    clearTimeout(this.timer); this.closeRecord('abandoned');
    // в новое лобби берём всех, кроме ушедших; у временно отключившихся снова идёт отсчёт
    const hostToken = this.seats[by].token;
    this.seats = this.seats.filter((s) => s.bot || !s.left);
    this.host = this.idxOf(hostToken);
    this.game = null; this.phase = 'lobby';
    for (const s of this.seats) if (!s.bot && !s.connected) { s.offAt = Date.now(); this.holdSeat(s); }
    this.touch();
  }

  play(idx, m) {
    const g = this.game;
    if (this.phase !== 'playing' || !g || g.turn !== idx) return { ok: false, err: 'Сейчас не ваш ход' };
    for (const k of ['x', 'y', 'i', 'c']) if (k in m && !Number.isInteger(m[k])) return { ok: false, err: 'Некорректный ход' };
    if (!['move', 'wall', 'card', 'break', 'rotate', 'ability', 'end'].includes(m.t)) return { ok: false, err: 'Неизвестная команда' };
    const res = this.apply(idx, m);
    if (res.ok) this.afterPlay();
    return res;
  }

  apply(seat, m) {
    const a = cleanAction(m), res = act(this.game, a, this.rng);
    if (res.ok && this.rec) this.rec.actions.push([Date.now() - this.rec.t0, seat, a]);
    return res;
  }

  afterPlay() {
    if (this.game.over) { this.phase = 'over'; this.closeRecord('over'); }
    this.touch(); this.schedule();
  }

  // Запись уходит наружу один раз: при победе, реванше посреди партии или закрытии комнаты.
  closeRecord(status) {
    const r = this.rec; if (!r) return;
    this.rec = null; r.status = status; r.t1 = Date.now();
    try { this.onRecord(r); } catch (err) { console.error('запись партии', err); }
  }

  emote(idx, e) {
    if (idx < 0 || !['👍', '👏', '😮', '😂', '🤔', '😤'].includes(e)) return;
    this.onEmote(idx, e);
  }

  // Боты и отключившиеся игроки ходят автоматически.
  schedule() {
    clearTimeout(this.timer);
    const g = this.game;
    if (this.phase !== 'playing' || !g || g.over) return;
    // все люди отключились (перезапуск сервера, телефоны заснули) — партия ждёт их, боты тоже не ходят
    if (!this.hasConnected()) return;
    const s = this.seats[g.turn];
    if (!s || !(s.bot || (!s.connected && !s.local))) return;
    // за отключившегося бот ходит только после паузы на переподключение; дальше — как обычный бот
    const wait = s.bot || s.left ? 0 : Math.max(0, (s.offAt || 0) + GRACE.play - Date.now());
    if (wait > 0) { this.timer = setTimeout(() => this.schedule(), wait); return; }
    // бот делает по одному действию с паузой, чтобы за ходом можно было уследить
    this.timer = setTimeout(() => { this.apply(g.turn, botAct(g, Math.random, this.opts.botLevel)); this.afterPlay(); }, 750);
  }

  destroy() { clearTimeout(this.timer); for (const t of this.away.values()) clearTimeout(t); this.away.clear(); this.closeRecord('abandoned'); }

  view(you) {
    return {
      code: this.code, title: this.title, isPublic: this.isPublic, phase: this.phase,
      host: this.host, opts: this.opts, you,
      // away — сколько ещё ждём отключившегося (мс): потом за него походит бот или место освободится
      seats: this.seats.map((s) => ({ name: s.name, bot: s.bot, connected: s.connected,
        ...(s.connected || s.bot ? {} : { away: s.left ? 0 : Math.max(0, (s.offAt || 0) + (this.phase === 'lobby' ? GRACE.lobby : GRACE.play) - Date.now()) }) })),
      game: this.game ? snapshot(this.game, you) : null,
    };
  }
  /* Снимок для перезапуска сервера. Партия хранится записью (зерно + действия) и при загрузке переигрывается. */
  save() {
    return { code: this.code, title: this.title, isPublic: this.isPublic, host: this.host, opts: this.opts,
      phase: this.phase === 'playing' && this.rec ? 'playing' : 'lobby', rec: this.phase === 'playing' ? this.rec : null,
      seats: this.seats.map(({ token, name, bot, local, vid }) => ({ token, name, bot, local, vid })) };
  }
  static load(d, cbs) {
    const r = new Room(d.code, { title: d.title, isPublic: d.isPublic, ...cbs });
    r.opts = { ...r.opts, ...d.opts }; r.host = d.host;
    const now = Date.now();
    // после перезапуска все люди считаются отключившимися: у них снова есть время вернуться
    r.seats = d.seats.map((s) => ({ ...s, connected: !!s.bot, offAt: s.bot ? null : now, left: false }));
    if (d.phase === 'playing' && d.rec) {
      const rp = replayer(d.rec, r.seats.map((s) => s.name));
      while (rp.k < d.rec.actions.length) if (!rp.step()) return null;
      if (rp.g.over) return null;
      r.game = rp.g; r.rng = rp.rng; r.rec = d.rec; r.phase = 'playing';
    } else for (const s of r.seats) if (!s.bot) r.holdSeat(s);
    return r;
  }

  info() {
    return { code: this.code, title: this.title, players: this.seats.length, max: MAX, host: this.seats[this.host]?.name || '' };
  }
}
