import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { server } from '../server.js';
import { botAct, hydrate } from '../public/js/engine.js';

await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
const port = server.address().port;

function client(token) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const c = { ws, last: null, msgs: [] };
  ws.on('message', (d) => { const m = JSON.parse(d); c.msgs.push(m); if (m.t === 'room') c.last = m; });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.wait = async (pred, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (pred(c)) return; await new Promise((r) => setTimeout(r, 25)); }
    throw new Error('timeout; last=' + JSON.stringify(c.last && { phase: c.last.phase, seats: c.last.seats }));
  };
  return new Promise((res) => ws.on('open', () => { c.send({ t: 'hello', token }); res(c); }));
}

const a = await client('token-aaaaaaaa'), b = await client('token-bbbbbbbb');
a.send({ t: 'create', name: 'Аня', title: 'Тест', isPublic: true });
await a.wait((c) => c.last);
const code = a.last.code;
assert.equal(a.last.host, 0); assert.equal(a.last.you, 0);

b.send({ t: 'list' }); await b.wait((c) => c.msgs.some((m) => m.t === 'list'));
assert.ok(b.msgs.find((m) => m.t === 'list').rooms.some((r) => r.code === code), 'комната видна в списке');

b.send({ t: 'join', code, name: 'Боря' });
await b.wait((c) => c.last && c.last.seats.length === 2);
assert.equal(b.last.you, 1);

// Не-хост не может стартовать
b.send({ t: 'start' }); await new Promise((r) => setTimeout(r, 150));
assert.equal(a.last.phase, 'lobby');

a.send({ t: 'start' });
await a.wait((c) => c.last.phase === 'playing');
assert.equal(a.last.game.turn, 0);

// Чужой ход отклоняется
b.send({ t: 'end' });
await b.wait((c) => c.msgs.some((m) => m.t === 'err'));

// Скрытая информация: каждый видит только свою руку.
assert.ok(a.last.game.players[0].hand.every(Boolean) && a.last.game.players[1].hand.every((c) => c === null));
assert.ok(b.last.game.players[1].hand.every(Boolean) && b.last.game.players[0].hand.every((c) => c === null));
assert.equal(a.last.game.deck, undefined, 'колода не уходит клиентам');

// Играем: каждый ходит по своему снимку (со своей рукой), пока кто-то не победит.
const stamp = (c) => { const g = c.last.game; return `${g.turns}:${g.turn}:${g.ap}:${g.fxSeq}:${c.last.phase}`; };
let guard = 0;
while (a.last.phase === 'playing' && guard++ < 600) {
  const who = a.last.game.turn === 0 ? a : b, before = stamp(a);
  who.send(botAct(hydrate(who.last.game)));
  await a.wait((c) => stamp(c) !== before, 3000).catch(() => {});
}
assert.equal(a.last.phase, 'over', 'партия завершилась');
assert.ok(a.last.game.winner === 0 || a.last.game.winner === 1);

// Реванш возвращает в лобби
a.send({ t: 'rematch' });
await a.wait((c) => c.last.phase === 'lobby');

// Переподключение: тот же токен возвращает место в идущей партии
a.send({ t: 'addBot' }); // игра лобби: просто ещё один слот
await a.wait((c) => c.last.seats.length === 3);
a.send({ t: 'start' }); await a.wait((c) => c.last.phase === 'playing');
b.ws.close(); await new Promise((r) => setTimeout(r, 150));
assert.equal(a.last.seats[1].connected, false);
const b2 = await client('token-bbbbbbbb');
await b2.wait((c) => c.last && c.last.you === 1 && c.last.seats[1].connected);

a.ws.close(); b2.ws.close();
await new Promise((r) => setTimeout(r, 200));
console.log('server: OK');
server.close(); process.exit(0);
