// Логика комнаты: места, лобби, ход партии, боты. Не зависит от транспорта,
// поэтому одинаково работает на сервере (онлайн) и в браузере (локальная игра).
import { newGame, doRoll, act, botAct, snapshot, cur, BOT_LEVELS, SIZES } from './engine.js';

const MAX = 4;
const clean = (s, n = 14) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, n);

export class Room {
  constructor(code, { title = 'Комната', isPublic = true, onUpdate = () => {}, onEmote = () => {} } = {}) {
    this.code = code; this.title = clean(title, 24) || 'Комната'; this.isPublic = !!isPublic;
    this.onUpdate = onUpdate; this.onEmote = onEmote;
    this.seats = []; this.host = -1; this.phase = 'lobby';
    this.opts = { bonus: true, botLevel: 'normal', size: 9 }; this.game = null; this.timer = null; this.lastActive = Date.now();
  }

  idxOf(token) { return this.seats.findIndex((s) => s.token === token); }
  humans() { return this.seats.filter((s) => !s.bot); }
  hasConnected() { return this.seats.some((s) => !s.bot && s.connected); }

  sit({ token, name, bot = false, local = false }) {
    const ex = token ? this.idxOf(token) : -1;
    if (ex >= 0) { this.seats[ex].connected = true; this.touch(); this.schedule(); return { idx: ex }; }
    if (this.phase !== 'lobby') return { err: 'Игра уже идёт' };
    if (this.seats.length >= MAX) return { err: 'Комната заполнена' };
    this.seats.push({ token, name: clean(name) || 'Игрок', bot, local, connected: true });
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
    if (typeof o.isPublic === 'boolean') this.isPublic = o.isPublic;
    if (BOT_LEVELS.includes(o.botLevel)) this.opts.botLevel = o.botLevel;
    if (SIZES.includes(o.size)) this.opts.size = o.size;
    this.touch();
  }
  start(by) {
    if (!this.isHost(by) || this.phase !== 'lobby' || this.seats.length < 2) return;
    this.game = newGame(this.seats, this.opts);
    this.phase = 'playing'; this.touch(); this.schedule();
  }
  rematch(by) {
    if (!this.isHost(by) || this.phase === 'lobby') return;
    clearTimeout(this.timer);
    this.seats = this.seats.filter((s) => s.bot || s.connected);
    this.host = this.seats.findIndex((s) => !s.bot);
    this.game = null; this.phase = 'lobby'; this.touch();
  }

  play(idx, m) {
    const g = this.game;
    if (this.phase !== 'playing' || !g || g.turn !== idx) return { ok: false, err: 'Сейчас не ваш ход' };
    const ints = ['x', 'y', 'i', 'd'];
    for (const k of ints) if (k in m && !Number.isInteger(m[k])) return { ok: false, err: 'Некорректный ход' };
    let res;
    if (m.t === 'roll') res = doRoll(g);
    else if (['move', 'wall', 'break', 'select'].includes(m.t)) res = act(g, m);
    else res = { ok: false, err: 'Неизвестная команда' };
    if (res.ok) this.afterPlay();
    return res;
  }

  afterPlay() {
    if (this.game.over) this.phase = 'over';
    this.touch(); this.schedule();
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
    if (g.phase === 'roll') this.timer = setTimeout(() => { doRoll(g); this.afterPlay(); }, 800);
    else this.timer = setTimeout(() => { act(g, botAct(g, Math.random, this.opts.botLevel)); this.afterPlay(); }, 1000);
  }

  destroy() { clearTimeout(this.timer); }

  view(you) {
    return {
      code: this.code, title: this.title, isPublic: this.isPublic, phase: this.phase,
      host: this.host, opts: this.opts, you,
      seats: this.seats.map((s) => ({ name: s.name, bot: s.bot, connected: s.connected })),
      game: this.game ? snapshot(this.game) : null,
    };
  }
  info() {
    return { code: this.code, title: this.title, players: this.seats.length, max: MAX, host: this.seats[this.host]?.name || '' };
  }
}
