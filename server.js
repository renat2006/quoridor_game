// Сервер: раздаёт статику и держит комнаты по WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './public/js/room.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
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
  const r = entry.room.sit({ token: ws.token, name });
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
      case 'roll': case 'move': case 'wall': case 'break': case 'select': {
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

server.listen(PORT, () => {
  console.log(`WALL DUEL на http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || [])
    if (i.family === 'IPv4' && !i.internal) console.log(`   в локальной сети: http://${i.address}:${PORT}`);
});
export { server, rooms };
