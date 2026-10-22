// Сервер: раздаёт статику и держит комнаты по WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room } from './public/js/room.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0'; // на сервере за прокси: HOST=127.0.0.1
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
// ключ дашборда /stats; без него дашборд открывается только напрямую с этой машины (localhost без прокси)
const STATS_KEY = process.env.STATS_KEY || '';
// необязательная запись сессий в PostHog Cloud: ключ проекта (phc_…) и адрес региона
const POSTHOG = process.env.POSTHOG_KEY ? { key: process.env.POSTHOG_KEY, host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com' } : null;
// телеметрия на встроенном SQLite (Node 22.13+); TELEMETRY=off выключает её, и тогда хватит любого Node 18+
const tel = process.env.TELEMETRY === 'off' ? null : (await import('./telemetry.js')).openTelemetry(DATA_DIR);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon',
};

const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };

function readBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { resolve(null); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

// Простое ограничение частоты по адресу: защищает базу от мусора, сами адреса никуда не пишутся.
const hits = new Map();
function limited(req, max) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { t: now, n: 1 }); return false; }
  return ++h.n > max;
}

const cookieOf = (req, name) => (String(req.headers.cookie || '').match(new RegExp(`(?:^|; )${name}=([^;]*)`)) || [])[1];
const sameKey = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function statsAllowed(req) {
  if (STATS_KEY) return sameKey(decodeURIComponent(cookieOf(req, 'wd_stats') || ''), STATS_KEY);
  const a = req.socket.remoteAddress;
  return !req.headers['x-forwarded-for'] && (a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1');
}

async function api(req, res, p) {
  if (!tel) return json(res, 404, { err: 'Телеметрия выключена' });
  if (req.method === 'POST' && p === '/api/e') {
    if (limited(req, 120)) return json(res, 429, { ok: false });
    const body = await readBody(req, 32_000);
    return json(res, 200, { ok: true, n: body ? tel.events(body) : 0 });
  }
  if (req.method === 'POST' && p === '/api/game') {
    if (limited(req, 30)) return json(res, 429, { ok: false });
    const body = await readBody(req, 400_000);
    return json(res, 200, { ok: !!(body && tel.game(body, 'local')) });
  }
  if (req.method === 'POST' && p === '/api/stats/login') {
    if (limited(req, 10)) return json(res, 429, { ok: false });
    const body = await readBody(req, 1000);
    if (!STATS_KEY || !sameKey(body?.key, STATS_KEY)) return json(res, 403, { ok: false });
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return json(res, 200, { ok: true }, { 'Set-Cookie': `wd_stats=${encodeURIComponent(STATS_KEY)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}` });
  }
  if (req.method === 'GET' && p.startsWith('/api/stats')) {
    if (!statsAllowed(req)) return json(res, 401, { err: 'Нужен ключ', login: !!STATS_KEY });
    const q = new URL(req.url, 'http://x').searchParams;
    if (p === '/api/stats') return json(res, 200, tel.stats(Math.max(0, Math.min(3650, Number(q.get('days')) || 0))));
    if (p === '/api/stats/games') return json(res, 200, tel.list(Math.min(200, Number(q.get('limit')) || 60), Number(q.get('before')) || Infinity));
    if (p === '/api/stats/game') { const r = tel.record(q.get('id')); return r ? json(res, 200, r) : json(res, 404, { err: 'Нет такой партии' }); }
  }
  return json(res, 404, { err: 'Not found' });
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.startsWith('/api/')) return void api(req, res, p).catch((err) => { console.error(err); json(res, 500, { err: 'Ошибка сервера' }); });
  if (p === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(`window.WD_CONFIG = ${JSON.stringify({ telemetry: !!tel, posthog: POSTHOG })};`);
  }
  if (p === '/') p = '/index.html';
  if (p === '/stats') p = '/stats.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

/** @type {Map<string,{room:Room,socks:Set<any>}>} */
const rooms = new Map();
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ'; // без гласных: коды не складываются в слова
const newCode = () => {
  for (;;) {
    let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
};
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

function broadcast(entry) {
  for (const ws of entry.socks) send(ws, { t: 'room', ...entry.room.view(entry.room.idxOf(ws.token)) });
}
function createRoom(opts) {
  const code = newCode();
  const entry = { socks: new Set(), room: null };
  entry.room = new Room(code, {
    ...opts,
    onUpdate: () => broadcast(entry),
    onEmote: (seat, e) => { for (const ws of entry.socks) send(ws, { t: 'emote', seat, e }); },
    onRecord: (rec) => { try { tel?.game(rec, 'online'); } catch (err) { console.error('телеметрия', err); } },
  });
  rooms.set(code, entry);
  return entry;
}
function detach(ws) {
  const entry = ws.entry; if (!entry) return;
  entry.socks.delete(ws); ws.entry = null;
  if ([...entry.socks].some((s) => s.token === ws.token)) return; // тот же игрок уже переподключился
  entry.room.drop(ws.token);
  if (!entry.room.humans().length) { entry.room.destroy(); rooms.delete(entry.room.code); }
}
function attach(ws, entry, name) {
  const r = entry.room.sit({ token: ws.token, name, vid: ws.vid });
  if (r.err) return send(ws, { t: 'err', msg: r.err });
  ws.entry = entry; entry.socks.add(ws);
  broadcast(entry);
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws) => {
  ws.token = null; ws.entry = null; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') {
      if (typeof m.token !== 'string' || m.token.length < 8 || m.token.length > 64) return;
      ws.token = m.token;
      ws.vid = typeof m.vid === 'string' && /^[a-z0-9]{6,40}$/i.test(m.vid) ? m.vid : null;
      for (const entry of rooms.values()) if (entry.room.idxOf(ws.token) >= 0) { detach(ws); attach(ws, entry); break; }
      return;
    }
    if (!ws.token) return;
    const entry = ws.entry, room = entry && entry.room, me = room ? room.idxOf(ws.token) : -1;
    switch (m.t) {
      case 'list':
        return send(ws, { t: 'list', rooms: [...rooms.values()].map((e) => e.room).filter((r) => r.isPublic && r.phase === 'lobby' && r.seats.length < 4).map((r) => r.info()) });
      case 'create': {
        detach(ws);
        const e = createRoom({ title: m.title, isPublic: m.isPublic !== false });
        return attach(ws, e, m.name);
      }
      case 'join': {
        const e = rooms.get(String(m.code || '').toUpperCase());
        if (!e) return send(ws, { t: 'err', msg: 'Комната не найдена' });
        detach(ws); return attach(ws, e, m.name);
      }
      case 'leave': detach(ws); return send(ws, { t: 'left' });
      case 'addBot': return room && room.addBot(me);
      case 'kick': {
        if (!room) return;
        const t = room.kick(me, m.i);
        if (t) for (const s of entry.socks) if (s.token === t) { entry.socks.delete(s); s.entry = null; send(s, { t: 'left', msg: 'Вас исключили из комнаты' }); }
        return;
      }
      case 'opts': return room && room.setOpts(me, m);
      case 'start': return room && room.start(me);
      case 'rematch': return room && room.rematch(me);
      case 'emote': return room && room.emote(me, m.e);
      case 'move': case 'wall': case 'card': case 'break': case 'rotate': case 'end': {
        if (!room) return;
        const r = room.play(me, m);
        if (!r.ok) send(ws, { t: 'err', msg: r.err });
        return;
      }
    }
  });
  ws.on('close', () => detach(ws));
});

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  for (const [code, e] of rooms) if (!e.room.hasConnected() && Date.now() - e.room.lastActive > 5 * 60_000) { e.room.destroy(); rooms.delete(code); }
}, 15_000);

server.listen(PORT, HOST, () => {
  const port = server.address().port;
  console.log(`WALL DUEL на http://localhost:${port}`);
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || [])
    if (i.family === 'IPv4' && !i.internal) console.log(`   в локальной сети: http://${i.address}:${port}`);
});
export { server, rooms };
