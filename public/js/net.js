// Два транспорта с одинаковым интерфейсом: онлайн (WebSocket) и локальный (комната в браузере).
import { Room } from './room.js';
import { vid, trackGame } from './track.js';

const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
const SEAT_TTL = 3 * 3600_000;
/* Место в онлайн-комнате (код и токен) живёт и в localStorage: если вкладку выгрузили или игрок открыл
   ссылку заново, он вернётся на своё место, а не войдёт новым игроком. */
export const seat = {
  get() { try { const v = JSON.parse(localStorage.wd_seat || 'null'); return v && Date.now() - v.t < SEAT_TTL ? v : null; } catch { return null; } },
  set(code, token) { try { localStorage.wd_seat = JSON.stringify({ code, token, t: Date.now() }); } catch {} },
  clear() { try { localStorage.removeItem('wd_seat'); } catch {} },
};
function token() {
  try {
    let t = sessionStorage.getItem('wd_token') || seat.get()?.token;
    if (!t) t = rid();
    sessionStorage.setItem('wd_token', t);
    return t;
  } catch { return 'anon' + Math.random().toString(36).slice(2, 14); }
}

export class RemoteNet {
  constructor() {
    this.onmsg = () => {}; this.queue = []; this.retry = 0; this.token = token(); this.lastMsg = Date.now();
    // браузер не сообщает о «тихо умершем» соединении (телефон заснул, сменилась сеть) —
    // поэтому сами шлём ping и переподключаемся, если ответа давно нет
    this.beat = setInterval(() => this.check(25_000), 8_000);
    this.wake = () => { if (document.visibilityState !== 'hidden') this.check(0); };
    addEventListener('visibilitychange', this.wake); addEventListener('online', this.wake); addEventListener('pageshow', this.wake);
    this.connect();
  }
  connect() {
    clearTimeout(this.again);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.retry = 0; this.lastMsg = Date.now();
      ws.send(JSON.stringify({ t: 'hello', token: this.token, vid }));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      this.onmsg({ t: 'status', online: true });
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      this.lastMsg = Date.now();
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') return;
      if (m.t === 'hello') { if (!m.room) this.onmsg({ t: 'gone' }); return; }
      this.onmsg(m);
    };
    ws.onclose = () => {
      if (ws !== this.ws || this.closed) return;
      this.onmsg({ t: 'status', online: false });
      // первая попытка сразу, дальше реже, но не реже раза в 4 секунды
      this.again = setTimeout(() => this.connect(), Math.min(4000, this.retry++ ? 400 * 2 ** this.retry : 150));
    };
  }
  /* Соединение живо? silentMs — сколько можно молчать; 0 — проверить прямо сейчас (вернулись во вкладку). */
  check(silentMs) {
    if (this.closed) return;
    const ws = this.ws;
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) { this.retry = 0; return this.connect(); }
    if (ws.readyState !== WebSocket.OPEN) return;
    if (silentMs && Date.now() - this.lastMsg > silentMs) return this.restart();
    const sent = Date.now();
    ws.send('{"t":"ping"}');
    if (!silentMs) setTimeout(() => { if (this.ws === ws && this.lastMsg < sent) this.restart(); }, 3000);
  }
  restart() { const ws = this.ws; this.retry = 0; this.onmsg({ t: 'status', online: false }); this.connect(); try { ws.close(); } catch {} }
  send(m) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); else this.queue.push(m);
  }
  close() {
    this.closed = true; this.onmsg = () => {}; clearInterval(this.beat); clearTimeout(this.again);
    removeEventListener('visibilitychange', this.wake); removeEventListener('online', this.wake); removeEventListener('pageshow', this.wake);
    this.ws.close();
  }
}

// Локальная игра: все люди за одним экраном, остальные места занимают боты.
export class LocalNet {
  constructor() {
    this.onmsg = () => {}; this.room = null; this.seats = []; this.opts = {};
    // вкладку закрыли посреди партии — запись уходит как брошенная
    addEventListener('pagehide', this.hide = () => this.room?.closeRecord('abandoned'));
  }
  emit() {
    const r = this.room; if (!r) return;
    const g = r.game, you = g && r.phase === 'playing' && !r.seats[g.turn].bot ? g.turn : (g && r.phase === 'over' ? g.winner : -1);
    // ошибка в интерфейсе не должна прерывать ход ботов внутри комнаты
    try { this.onmsg({ t: 'room', ...r.view(you), local: true, host: 0 }); } catch (err) { console.error(err); }
  }
  setup(seats, opts) {
    this.seats = seats; this.opts = opts;
    this.room?.destroy();
    this.room = new Room('LOCAL', { title: 'Локальная игра', isPublic: false, onUpdate: () => this.emit(), onRecord: trackGame });
    this.room.opts = { bonus: opts.bonus !== false, roles: opts.roles !== false, botLevel: opts.botLevel || 'hard', size: opts.size || 9 };
    seats.forEach((s, i) => this.room.sit({ token: 'l' + i, name: s.name, bot: s.bot, local: !s.bot }));
    this.room.host = 0; this.room.start(0);
  }
  send(m) {
    const r = this.room; if (!r) return;
    if (['move', 'wall', 'card', 'break', 'rotate', 'ability', 'end'].includes(m.t)) {
      const g = r.game; if (!g || r.seats[g.turn].bot) return;
      const res = r.play(g.turn, m);
      if (!res.ok) this.onmsg({ t: 'err', msg: res.err });
    } else if (m.t === 'rematch') this.setup(this.seats, this.opts);
    else if (m.t === 'emote') { /* в локальной игре без эмоций */ }
  }
  close() { removeEventListener('pagehide', this.hide); this.room?.destroy(); this.room = null; }
}
