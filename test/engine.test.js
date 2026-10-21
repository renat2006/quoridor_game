import assert from 'node:assert/strict';
import { newGame, doRoll, act, botAct, dist, wallLegal, reach, options, hydrate, snapshot, cur, rebuild } from '../public/js/engine.js';

const seats = (n) => Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), bot: true }));

// 1. Боты доигрывают партии до победы, правила не нарушаются.
for (const n of [2, 3, 4]) for (let k = 0; k < 5; k++) {
  const g = newGame(seats(n));
  let guard = 0;
  while (!g.over && guard++ < 3000) {
    assert.ok(doRoll(g).ok);
    if (g.phase === 'roll') continue; // авто-пропуск
    const a = botAct(g);
    const r = act(g, a);
    assert.ok(r.ok, `ход бота отклонён: ${JSON.stringify(a)} ${r.err}`);
    g.players.forEach((p) => assert.ok(dist(g, p) < Infinity, 'путь к цели закрыт'));
  }
  assert.ok(g.over, `партия на ${n} не закончилась`);
  assert.equal(g.phase, 'over');
}

// 2. Стены: нельзя пересекать и нельзя перекрывать путь полностью.
{
  const g = newGame(seats(2), { bonus: false });
  g.roll = 1; g.phase = 'act';
  assert.ok(act(g, { t: 'wall', o: 'h', x: 0, y: 3 }).ok);
  const g2 = newGame(seats(2), { bonus: false });
  g2.roll = 1; g2.phase = 'act';
  for (let x = 0; x < 8; x += 2) { g2.walls.push({ o: 'h', x, y: 3, owner: 0 }); }
  hydrate(snapshot(g2)); // снимок/восстановление не падает
  const gg = newGame(seats(2), { bonus: false });
  gg.walls.push({ o: 'h', x: 3, y: 7, owner: 0 }, { o: 'v', x: 4, y: 7, owner: 0 });
  rebuild(gg);
  assert.equal(wallLegal(gg, 'v', 2, 7).ok, false, 'эта стена заперла бы фишку в клетке');
  assert.equal(wallLegal(gg, 'v', 3, 7).ok, false, 'пересечение с горизонтальной стеной');
  assert.equal(wallLegal(gg, 'h', 0, 3).ok, true);
}

// 3. Движение: на 1–3 клетки, чужие фишки не проходимы, на ходу не по броску нельзя.
{
  const g = newGame(seats(2), { bonus: false });
  g.roll = 6; g.phase = 'act';
  const r = reach(g, cur(g), 3);
  assert.ok(r.has('4,5') && !r.has('4,4'));
  assert.equal(act(g, { t: 'move', x: 4, y: 4 }).ok, false);
  assert.ok(act(g, { t: 'move', x: 4, y: 5 }).ok);
  assert.equal(g.turn, 1);
  assert.equal(act(g, { t: 'move', x: 4, y: 7 }).ok, false, 'нельзя ходить, не бросив кубик');
}

// 4. Ломать стены можно только на шестёрке.
{
  const g = newGame(seats(2), { bonus: false });
  g.roll = 1; g.phase = 'act'; act(g, { t: 'wall', o: 'h', x: 0, y: 3 });
  g.roll = 5; g.phase = 'act';
  assert.equal(act(g, { t: 'break', i: 0 }).ok, false);
  g.roll = 6;
  assert.ok(act(g, { t: 'break', i: 0 }).ok);
  assert.equal(g.walls.length, 0);
}

// 5. Бонусы: заморозка, ещё бросок, +2 стены.
{
  const g = newGame(seats(2), { bonus: false });
  g.bonus['4,7'] = 'again'; g.roll = 2; g.phase = 'act';
  act(g, { t: 'move', x: 4, y: 7 });
  assert.equal(g.turn, 0); assert.equal(g.phase, 'roll');
  g.bonus['4,6'] = 'freeze'; g.roll = 2; g.phase = 'act';
  act(g, { t: 'move', x: 4, y: 6 });
  assert.equal(g.players[1].skip, 0, 'пропуск уже потрачен');
  assert.equal(g.turn, 0, 'соперник заморожен — снова наш ход');
  assert.ok(g.fx.some((e) => e.type === 'skip' && e.why === 'freeze'));
}
console.log('engine: OK');
