// Логика комнаты: места, лобби, ход партии, боты. Не зависит от транспорта,
// поэтому одинаково работает на сервере (онлайн) и в браузере (локальная игра).
import { newGame, act, botAct, snapshot, cleanAction, seededRng, BOT_LEVELS, SIZES, RULES_VERSION } from './engine.js';

const MAX = 4;
const clean = (s, n = 14) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, n);

export class Room {
  constructor(code, { title = 'Комната', isPublic = true, onUpdate = () => {}, onEmote = () => {}, onRecord = () => {} } = {}) {
    this.code = code; this.title = clean(title, 24) || 'Комната'; this.isPublic = !!isPublic;
    this.onUpdate = onUpdate; this.onEmote = onEmote; this.onRecord = onRecord; this.rec = null;
    this.seats = []; this.host = -1; this.phase = 'lobby';
    this.opts = { bonus: true, roles: true, botLevel: 'normal', size: 9 }; this.game = null; this.timer = null; this.lastActive = Date.now();
  }

  idxOf(token) { return this.seats.findIndex((s) => s.token === token); }
  humans() { return this.seats.filter((s) => !s.bot); }
  hasConnected() { return this.seats.some((s) => !s.bot && s.connected); }

  sit({ token, name, bot = false, local = false, vid = null }) {
    const ex = token ? this.idxOf(token) : -1;
    if (ex >= 0) { this.seats[ex].connected = true; this.touch(); this.schedule(); return { idx: ex }; }
    if (this.phase !== 'lobby') return { err: 'Игра уже идёт' };
    if (this.seats.length >= MAX) return { err: 'Комната заполнена' };
    this.seats.push({ token, name: clean(name) || 'Игрок', bot, local, vid, connected: true });
    const idx = this.seats.length - 1;
    if (this.host < 0 && !bot) this.host = idx;
    this.touch(); return { idx };
  }

  drop(token) {
    const i = this.idxOf(token); if (i < 0) return;
    if (this.phase === 'lobby') this.removeSeat(i);
    else { this.seats[i].connected = false; this.schedule(); }
    this.touch();
  }

  removeSeat(i) {
    this.seats.splice(i, 1);
    if (this.host === i) this.host = this.seats.findIndex((s) => !s.bot);
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
    this.seats = this.seats.filter((s) => s.bot || s.connected);
    this.host = this.seats.findIndex((s) => !s.bot);
    this.game = null; this.phase = 'lobby'; this.touch();
  }

  play(idx, m) {
    const g = this.game;
    if (this.phase !== 'playing' || !g || g.turn !== idx) return { ok: false, err: 'Сейчас не ваш ход' };
    for (const k of ['x', 'y', 'i', 'c']) if (k in m && !Number.isInteger(m[k])) return { ok: false, err: 'Некорректный ход' };
    if (!['move', 'wall', 'card', 'break', 'rotate', 'end'].includes(m.t)) return { ok: false, err: 'Неизвестная команда' };
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
    const s = this.seats[g.turn];
    if (!s || !(s.bot || (!s.connected && !s.local))) return;
    // бот делает по одному действию с паузой, чтобы за ходом можно было уследить
    this.timer = setTimeout(() => { this.apply(g.turn, botAct(g, Math.random, this.opts.botLevel)); this.afterPlay(); }, 750);
  }

  destroy() { clearTimeout(this.timer); this.closeRecord('abandoned'); }

  view(you) {
    return {
      code: this.code, title: this.title, isPublic: this.isPublic, phase: this.phase,
      host: this.host, opts: this.opts, you,
      seats: this.seats.map((s) => ({ name: s.name, bot: s.bot, connected: s.connected })),
      game: this.game ? snapshot(this.game, you) : null,
    };
  }
  info() {
    return { code: this.code, title: this.title, players: this.seats.length, max: MAX, host: this.seats[this.host]?.name || '' };
  }
}
