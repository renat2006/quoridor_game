import assert from 'node:assert/strict';
import { newGame, act, botAct, dist, wallLegal, reach, hydrate, snapshot, cur, rebuild, SIZES, options, rotateLegal, ROLES, replay } from '../public/js/engine.js';
import { Room } from '../public/js/room.js';

const seats = (n) => Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), bot: true }));
// партия без бонусов и ролей; первый ход уже прошёл — у игрока полные 2 ОД
const plain = (n = 2, extra = {}) => { const g = newGame(seats(n), { bonus: false, roles: false, ...extra }); g.ap = 2; return g; };

// 1. Боты всех уровней доигрывают партии на всех полях, правила не нарушаются.
for (const size of SIZES) for (const n of [2, 4]) for (const level of ['easy', 'normal']) {
  const g = newGame(seats(n), { size });
  let guard = 0;
  while (!g.over && guard++ < 3000) {
    const a = botAct(g, Math.random, level), r = act(g, a);
    assert.ok(r.ok, `ход бота отклонён: ${JSON.stringify(a)} ${r.err}`);
    g.players.forEach((p) => assert.ok(dist(g, p) < Infinity, 'путь к цели закрыт'));
  }
  assert.ok(g.over, `партия ${size}×${size} на ${n} (${level}) не закончилась`);
}

// 2. Поля и роли: старты по центру сторон, роли у всех разные; первый ход партии — 1 ОД.
{
  const s = newGame(seats(2), { size: 7, roles: false }), l = newGame(seats(4), { size: 11 });
  assert.deepEqual([s.players[0].x, s.players[0].y], [3, 6]);
  assert.deepEqual([l.players[1].x, l.players[1].y], [0, 5]);
  assert.equal(new Set(l.players.map((p) => p.role)).size, 4);
  assert.ok(l.players.every((p) => ROLES[p.role]));
  assert.equal(s.players[0].role, null);
  assert.equal(s.ap, 1, 'компенсация темпа: первый ход короче');
  act(s, { t: 'end' }); assert.equal(s.ap, 3, 'на 7×7 второй игрок в первый ход получает +1 ОД');
  act(s, { t: 'end' }); assert.equal(s.ap, 2);
}

// 3. Ход: шаг и стена стоят по 1 ОД, не больше двух стен; карта бесплатно, одна за ход.
{
  const g = plain();
  assert.equal(cur(g).hand.length, 3, 'две карты на старте + одна в начале хода');
  assert.ok(act(g, { t: 'move', x: 4, y: 7 }).ok); assert.equal(g.ap, 1);
  assert.ok(act(g, { t: 'wall', o: 'h', x: 0, y: 2 }).ok);
  assert.equal(g.turn, 0, 'ОД кончились, но карту ещё можно сыграть — ход не закончен');
  assert.ok(options(g).card && !options(g).move);
  assert.ok(act(g, { t: 'end' }).ok); assert.equal(g.turn, 1);
}
{
  const g = plain(); g.ap = 3;
  assert.ok(act(g, { t: 'wall', o: 'h', x: 0, y: 2 }).ok && act(g, { t: 'wall', o: 'h', x: 2, y: 2 }).ok);
  assert.equal(act(g, { t: 'wall', o: 'h', x: 4, y: 2 }).ok, false, 'третья стена за ход нельзя');
}
{
  const g = plain(); cur(g).hand = ['dash', 'dash', 'freeze'];
  assert.ok(act(g, { t: 'card', c: 0 }).ok); assert.equal(g.ap, 3);
  assert.equal(act(g, { t: 'card', c: 0 }).ok, false, 'вторая карта за ход нельзя');
  assert.ok(reach(g).has('4,5'), 'с рывком дальность 3');
}

// 4. Прыжок через фишку и обход по диагонали.
{
  const g = plain();
  g.players[1].x = 4; g.players[1].y = 7;
  assert.ok(reach(g, cur(g), 1).has('4,6'), 'прыжок через фишку');
  g.walls.push({ o: 'h', x: 4, y: 6, owner: 1 }); rebuild(g);
  const r = reach(g, cur(g), 1);
  assert.ok(!r.has('4,6') && r.has('3,7') && r.has('5,7'), 'обход по диагонали');
}

// 5. Сквозь стену: карта и Призрак.
{
  const g = plain(); g.walls.push({ o: 'h', x: 4, y: 7, owner: 1 }); rebuild(g);
  assert.ok(!reach(g).has('4,7'));
  cur(g).hand = ['phase'];
  act(g, { t: 'card', c: 0 });
  assert.ok(reach(g).has('4,7'), 'карта даёт пройти сквозь стену');
  assert.ok(act(g, { t: 'move', x: 4, y: 7 }).ok); assert.equal(g.t.cross, 0);
}
{
  const g = plain(); cur(g).role = 'ghost'; g.walls.push({ o: 'h', x: 4, y: 7, owner: 1 }); rebuild(g);
  assert.ok(act(g, { t: 'move', x: 4, y: 7 }).ok);
  assert.equal(cur(g).ghostCd, 3, 'способность Призрака ушла на перезарядку');
}

// 6. Роли.
{
  const g = plain(); cur(g).role = 'runner'; g.t.freeStep = true;
  assert.ok(reach(g).has('4,5'), 'Бегун проходит 3 клетки');
  act(g, { t: 'move', x: 4, y: 5 }); assert.equal(cur(g).runCd, 2, 'следующий бесплатный шаг — через 3 хода');

  const m = plain(); cur(m).role = 'mason'; m.t.masonFree = true;
  assert.ok(act(m, { t: 'wall', o: 'h', x: 0, y: 2 }).ok); assert.equal(m.ap, 2, 'стена Каменщика бесплатная');
  assert.ok(act(m, { t: 'wall', o: 'h', x: 2, y: 2 }).ok); assert.equal(m.ap, 1);
  assert.equal(act(m, { t: 'wall', o: 'h', x: 4, y: 2 }).ok, false, 'лимит две стены и для Каменщика');

  const s = plain(); cur(s).role = 'sapper'; s.walls.push({ o: 'h', x: 0, y: 3, owner: 1 }, { o: 'h', x: 4, y: 3, owner: 1 }); rebuild(s);
  const before = cur(s).walls;
  assert.ok(act(s, { t: 'break', i: 0 }).ok); assert.equal(s.walls.length, 1); assert.equal(s.ap, 2, 'снос бесплатный');
  assert.equal(cur(s).walls, before + 1, 'Сапёр забрал стену себе');
  assert.equal(act(s, { t: 'break', i: 0 }).ok, false, 'перезарядка');

  const a = plain(); cur(a).role = 'architect'; a.walls.push({ o: 'h', x: 0, y: 3, owner: 1 }, { o: 'h', x: 4, y: 3, owner: 1 }); rebuild(a);
  assert.ok(act(a, { t: 'rotate', i: 0 }).ok); assert.equal(a.walls[0].o, 'v'); assert.equal(a.ap, 2, 'поворот бесплатный');
  assert.equal(act(a, { t: 'rotate', i: 1 }).ok, false, 'раз за ход');

  const c = plain(); cur(c).role = 'gambler'; cur(c).hand = ['dash', 'freeze', 'dash'];
  assert.ok(act(c, { t: 'card', c: 0 }).ok && act(c, { t: 'card', c: 0 }).ok, 'Картёжник играет две карты');
  const c2 = newGame(seats(2), { roles: false }); c2.players[1].role = 'gambler';
  act(c2, { t: 'end' }); assert.equal(c2.players[1].hand.length, 4, 'и добирает по две');
}

// 7. Заморозка, снос и поворот картой; поворот не может закрыть путь.
{
  const g = plain(); cur(g).hand = ['freeze'];
  act(g, { t: 'card', c: 0 }); act(g, { t: 'end' });
  assert.equal(g.ap, 1, 'замороженный получил 1 ОД');
}
{
  const g = plain(); g.walls.push({ o: 'h', x: 0, y: 3, owner: 1 }); rebuild(g); cur(g).hand = ['demolish'];
  assert.equal(act(g, { t: 'card', c: 0 }).ok, false, 'Сносу нужна цель');
  assert.ok(act(g, { t: 'card', c: 0, i: 0 }).ok); assert.equal(g.walls.length, 0);
}
{
  const g = plain();
  g.walls.push({ o: 'h', x: 3, y: 7, owner: 1 }, { o: 'v', x: 4, y: 7, owner: 1 }, { o: 'h', x: 1, y: 6, owner: 1 });
  rebuild(g);
  assert.equal(wallLegal(g, 'v', 2, 7).ok, false, 'эта стена заперла бы фишку');
  assert.equal(rotateLegal(g, 2).ok, true);
}

// 8. Скрытая информация: чужие руки и колода не уходят в снимок.
{
  const g = newGame(seats(2));
  const s = snapshot(g, 0);
  assert.ok(s.players[0].hand.every(Boolean)); assert.ok(s.players[1].hand.every((c) => c === null));
  assert.equal(s.deck, undefined); assert.equal(typeof s.deckN, 'number');
  const h = hydrate(s); assert.ok(options(h).any);
}

// 9. Бонусы: симметрия и эффекты.
for (const size of SIZES) {
  const g = newGame(seats(2), { size });
  for (const k of Object.keys(g.bonus)) { const [x, y] = k.split(',').map(Number); assert.equal(g.bonus[`${size - 1 - y},${x}`], g.bonus[k]); }
}
{
  const g = plain(); g.bonus['4,7'] = 'energy';
  act(g, { t: 'move', x: 4, y: 7 }); assert.equal(g.ap, 2, '+1 ОД');
  const ev = g.fx[g.fx.length - 1];
  assert.equal(ev.type, 'bonus', 'тип события не перетирается'); assert.equal(ev.bonus, 'energy');
}
// 10. Запись партии: зерно и действия повторяют партию точь-в-точь, в том числе добор карт из перетасованной колоды.
for (const size of SIZES) for (const n of [2, 4]) {
  let rec;
  const room = new Room('T', { onRecord: (r) => { rec = r; } });
  for (let i = 0; i < n; i++) room.sit({ token: 't' + i, name: 'P' + i, local: true });
  room.opts.size = size; room.start(0); clearTimeout(room.timer);
  while (!room.game.over) room.apply(room.game.turn, botAct(room.game));
  room.afterPlay(); clearTimeout(room.timer);
  assert.equal(rec.status, 'over');
  const { g, bad } = replay(rec);
  assert.equal(bad, -1, 'все действия записи проходят по правилам');
  const sig = (x) => JSON.stringify([x.winner, x.turns, x.walls, x.players.map((p) => [p.x, p.y, p.walls, p.hand, p.role])]);
  assert.equal(sig(g), sig(room.game), `повтор ${size}×${size} на ${n} совпадает с партией`);
}
console.log('engine: OK');
