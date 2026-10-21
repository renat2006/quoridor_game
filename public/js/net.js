// Два транспорта с одинаковым интерфейсом: онлайн (WebSocket) и локальный (комната в браузере).
import { Room } from './room.js';

function token() {
  try {
    let t = sessionStorage.getItem('wd_token');
    if (!t) { t = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); sessionStorage.setItem('wd_token', t); }
    return t;
  } catch { return 'anon' + Math.random().toString(36).slice(2, 14); }
}

export class RemoteNet {
  constructor() { this.onmsg = () => {}; this.queue = []; this.retry = 0; this.token = token(); this.connect(); }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      this.retry = 0; ws.send(JSON.stringify({ t: 'hello', token: this.token }));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      this.onmsg({ t: 'status', online: true });
    };
    ws.onmessage = (e) => { try { this.onmsg(JSON.parse(e.data)); } catch {} };
    ws.onclose = () => {
      this.onmsg({ t: 'status', online: false });
      if (!this.closed) setTimeout(() => this.connect(), Math.min(4000, 500 * ++this.retry));
    };
  }
  send(m) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); else this.queue.push(m);
  }
  close() { this.closed = true; this.onmsg = () => {}; this.ws.close(); }
}

// Локальная игра: все люди за одним экраном, остальные места занимают боты.
export class LocalNet {
  constructor() { this.onmsg = () => {}; this.room = null; this.seats = []; this.opts = {}; }
  emit() {
    const r = this.room; if (!r) return;
    const g = r.game, you = g && r.phase === 'playing' && !r.seats[g.turn].bot ? g.turn : (g && r.phase === 'over' ? g.winner : -1);
    this.onmsg({ t: 'room', ...r.view(you), local: true, host: 0 });
  }
  setup(seats, opts) {
    this.seats = seats; this.opts = opts;
    this.room?.destroy();
    this.room = new Room('LOCAL', { title: 'Локальная игра', isPublic: false, onUpdate: () => this.emit() });
    this.room.opts = { bonus: opts.bonus !== false, botLevel: opts.botLevel || 'normal', size: opts.size || 9 };
    seats.forEach((s, i) => this.room.sit({ token: 'l' + i, name: s.name, bot: s.bot, local: !s.bot }));
    this.room.host = 0; this.room.start(0);
  }
  send(m) {
    const r = this.room; if (!r) return;
    if (['roll', 'move', 'wall', 'break', 'select'].includes(m.t)) {
      const g = r.game; if (!g || r.seats[g.turn].bot) return;
      const res = r.play(g.turn, m);
      if (!res.ok) this.onmsg({ t: 'err', msg: res.err });
    } else if (m.t === 'rematch') this.setup(this.seats, this.opts);
    else if (m.t === 'emote') { /* в локальной игре без эмоций */ }
  }
  close() { this.room?.destroy(); this.room = null; }
}
