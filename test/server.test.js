import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { botAct, hydrate, replay } from '../public/js/engine.js';
import { Room, GRACE } from '../public/js/room.js';

// тесты поднимают сервер на свободном порту и с пустой базой статистики, чтобы не мешать запущенной игре
process.env.PORT = '0';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-test-'));
delete process.env.STATS_KEY; delete process.env.TELEMETRY;
const { server } = await import('../server.js');

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

// Статистика: доигранная онлайн-партия записана и переигрывается движком
// (вторая ещё идёт: брошенной она станет, когда сервер уберёт пустую комнату).
const base = `http://localhost:${port}`;
const get = (u) => fetch(base + u).then((r) => r.json());
const post = (u, body) => fetch(base + u, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
let st = await get('/api/stats');
assert.equal(st.kpi.games, 1); assert.equal(st.kpi.finished, 1); assert.equal(st.kpi.online, 1);
const list = await get('/api/stats/games');
const done = list.find((x) => x.status === 'over');
const { rec } = await get('/api/stats/game?id=' + done.id);
const rp = replay(rec);
assert.equal(rp.bad, -1); assert.equal(rp.g.winner, done.winner, 'повтор приходит к тому же победителю');

// Локальная партия из браузера принимается только если честно переигрывается.
let local;
const room = new Room('L', { onRecord: (r) => { local = r; } });
room.sit({ token: 'l0', name: 'A', local: true, vid: 'abcdef123456' }); room.sit({ token: 'l1', name: 'B', bot: true });
room.start(0); clearTimeout(room.timer);
while (!room.game.over) room.apply(room.game.turn, botAct(room.game));
room.afterPlay(); clearTimeout(room.timer);
const fake = JSON.parse(JSON.stringify(local)); fake.id = 'fakegame1'; fake.actions[0][2] = { t: 'move', x: 0, y: 0 };
assert.equal((await post('/api/game', fake)).ok, false, 'подделанная запись отклонена');
assert.equal((await post('/api/game', local)).ok, true);
assert.equal((await post('/api/e', { vid: 'abcdef123456', sid: 'sess123456', ev: [{ type: 'visit', data: { device: 'phone' } }, { type: 'hack' }] })).n, 1);
st = await get('/api/stats?days=1');
assert.equal(st.kpi.games, 2); assert.equal(st.kpi.visitors, 1); assert.equal(st.funnel[2].n, 1, 'посетитель доиграл партию');
assert.equal(st.devices.phone, 1);

// Устойчивость: короткие паузы на переподключение, чтобы тест шёл быстро.
GRACE.lobby = 600; GRACE.play = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = await client('token-hhhhhhhh'), q = await client('token-qqqqqqqq');
h.send({ t: 'create', name: 'Хост', isPublic: false }); await h.wait((c) => c.last);
q.send({ t: 'join', code: h.last.code, name: 'Гость' }); await h.wait((c) => c.last.seats.length === 2);

// Обрыв в лобби: место держится, игрок возвращается на него с тем же токеном.
q.ws.terminate(); await h.wait((c) => c.last.seats[1] && !c.last.seats[1].connected);
assert.equal(h.last.seats.length, 2, 'место в лобби не освобождается сразу');
assert.ok(h.last.seats[1].away > 0, 'клиенты знают, сколько ещё ждать');
const q2 = await client('token-qqqqqqqq');
await h.wait((c) => c.last.seats[1]?.connected); assert.equal(q2.last.you, 1, 'вернулся на своё место');

// Посреди партии: пока идёт пауза, бот не ходит за отключившегося; после паузы — ходит.
h.send({ t: 'start' }); await h.wait((c) => c.last.phase === 'playing');
h.send({ t: 'end' }); await h.wait((c) => c.last.game.turn === 1);
const ap = h.last.game.ap;
q2.ws.terminate(); await sleep(300);
assert.equal(h.last.game.turn, 1); assert.equal(h.last.game.ap, ap, 'в паузе бот не тратит ОД гостя');
await h.wait((c) => c.last.game.turn === 0 || c.last.game.ap !== ap, 4000);
const q3 = await client('token-qqqqqqqq'); await q3.wait((c) => c.last?.phase === 'playing');

// Явный выход из лобби освобождает место сразу; незнакомый токен узнаёт, что комнаты нет.
h.send({ t: 'rematch' }); await h.wait((c) => c.last.phase === 'lobby');
q3.send({ t: 'leave' }); await h.wait((c) => c.last.seats.length === 1);
const z = await client('token-zzzzzzzz'); await z.wait((c) => c.msgs.some((m) => m.t === 'hello'));
assert.equal(z.msgs.find((m) => m.t === 'hello').room, null);
for (const c of [h, q3, z]) c.ws.close();

// Перезапуск сервера: комната с идущей партией сохраняется и поднимается с той же позиции.
const live = new Room('SAVE', {});
live.sit({ token: 'tok-1', name: 'Аня' }); live.sit({ token: 'tok-2', name: 'Боря' }); live.addBot(0);
live.start(0); clearTimeout(live.timer);
for (let i = 0; i < 25 && !live.game.over; i++) live.apply(live.game.turn, botAct(live.game));
clearTimeout(live.timer);
const back = Room.load(JSON.parse(JSON.stringify(live.save())), {});
const pos = (r) => JSON.stringify([r.game.turn, r.game.ap, r.game.walls, r.game.players.map((p) => [p.name, p.x, p.y, p.hand, p.walls])]);
assert.equal(pos(back), pos(live), 'партия восстановлена точно');
assert.ok(back.seats.filter((x) => !x.bot).every((x) => !x.connected), 'люди ждут переподключения');
assert.equal(back.sit({ token: 'tok-2' }).idx, 1, 'игрок возвращается на своё место');
assert.deepEqual(back.rng(), live.rng(), 'генератор продолжает с того же места');
back.destroy(); live.destroy();
console.log('server: OK');
server.close(); process.exit(0);
