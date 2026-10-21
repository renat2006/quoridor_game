import assert from 'node:assert/strict';
import { newGame, doRoll, act, botAct, dist, wallLegal, reach, hydrate, snapshot, cur, rebuild, SIZES } from '../public/js/engine.js';

const seats = (n) => Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), bot: true }));
const setRoll = (g, r, other = 1) => { g.dice = [r, other]; g.sel = 0; g.roll = r; g.phase = 'act'; };

// 1. Боты обоих уровней доигрывают партии на всех полях, правила не нарушаются.
for (const size of SIZES) for (const n of [2, 3, 4]) for (const level of ['easy', 'normal']) {
  const g = newGame(seats(n), { size });
  let guard = 0;
  while (!g.over && guard++ < 4000) {
    assert.ok(doRoll(g).ok);
    if (g.phase === 'roll') continue; // авто-пропуск
    const a = botAct(g, Math.random, level);
    const r = act(g, a);
    assert.ok(r.ok, `ход бота отклонён: ${JSON.stringify(a)} ${r.err}`);
    g.players.forEach((p) => assert.ok(dist(g, p) < Infinity, 'путь к цели закрыт'));
  }
  assert.ok(g.over, `партия ${size}×${size} на ${n} (${level}) не закончилась`);
}

// 2. Размеры поля: старты по центру сторон, запас стен растёт с полем.
{
  const s = newGame(seats(2), { size: 7 }), l = newGame(seats(4), { size: 11 });
  assert.deepEqual([s.players[0].x, s.players[0].y], [3, 6]);
  assert.deepEqual([l.players[1].x, l.players[1].y], [0, 5]);
  assert.equal(dist(s, s.players[0]), 6);
  assert.ok(newGame(seats(2), { size: 11 }).players[0].walls > s.players[0].walls);
  assert.equal(newGame(seats(2), { size: 5 }).size, 9, 'неизвестный размер → среднее поле');
}

// 3. Стены: нельзя пересекать и нельзя перекрывать путь полностью.
{
  const gg = newGame(seats(2), { bonus: false });
  gg.walls.push({ o: 'h', x: 3, y: 7, owner: 0 }, { o: 'v', x: 4, y: 7, owner: 0 });
  rebuild(gg);
  assert.equal(wallLegal(gg, 'v', 2, 7).ok, false, 'эта стена заперла бы фишку');
  assert.equal(wallLegal(gg, 'v', 3, 7).ok, false, 'пересечение с горизонтальной стеной');
  assert.equal(wallLegal(gg, 'h', 0, 3).ok, true);
  assert.equal(wallLegal(newGame(seats(2), { size: 7 }), 'h', 6, 0).ok, false, 'стена за краем малого поля');
  hydrate(snapshot(gg));
}

// 4. Движение на 1–2 клетки; ходить можно только после броска.
{
  const g = newGame(seats(2), { bonus: false });
  setRoll(g, 6);
  const r = reach(g, cur(g), 2);
  assert.ok(r.has('4,6') && !r.has('4,5'));
  assert.equal(act(g, { t: 'move', x: 4, y: 5 }).ok, false);
  assert.ok(act(g, { t: 'move', x: 4, y: 6 }).ok);
  assert.equal(g.turn, 1);
  assert.equal(act(g, { t: 'move', x: 4, y: 7 }).ok, false, 'нельзя ходить, не бросив кубики');
}

// 5. Прыжок через соседнюю фишку, а при стене за ней — обход по диагонали.
{
  const g = newGame(seats(2), { bonus: false });
  g.players[1].x = 4; g.players[1].y = 7; // соперник прямо перед нами
  assert.ok(reach(g, cur(g), 1).has('4,6'), 'прыжок через фишку');
  g.walls.push({ o: 'h', x: 4, y: 6, owner: 1 }); rebuild(g); // стена за соперником
  const r = reach(g, cur(g), 1);
  assert.ok(!r.has('4,6') && r.has('3,7') && r.has('5,7'), 'обход по диагонали');
}

// 6. Два кубика: выбранный ходит, второй уходит следующему игроку.
{
  const seq = [0.99, 0.01, 0.5]; let k = 0; const rng = () => seq[k++ % seq.length]; // 6, 1, потом 4
  const g = newGame(seats(2), { bonus: false });
  doRoll(g, rng);
  assert.deepEqual(g.dice, [1, 6]); assert.equal(g.sel, 1, 'по умолчанию выбран больший');
  assert.ok(act(g, { t: 'move', x: 4, y: 7, d: 0 }).ok, 'ходим единицей');
  assert.equal(g.pass, 6, 'шестёрка ушла сопернику');
  doRoll(g, rng);
  assert.equal(g.turn, 1); assert.equal(g.dice[0], 6); assert.equal(g.diceFrom, 0);
  assert.ok(act(g, { t: 'select', d: 1 }).ok); assert.equal(g.roll, g.dice[1]); assert.equal(g.phase, 'act', 'выбор кубика не завершает ход');
  assert.equal(act(g, { t: 'select', d: 2 }).ok, false);
}

// 7. Ломать стены можно только шестёркой.
{
  const g = newGame(seats(2), { bonus: false });
  setRoll(g, 1); act(g, { t: 'wall', o: 'h', x: 0, y: 3 });
  setRoll(g, 5);
  assert.equal(act(g, { t: 'break', i: 0 }).ok, false);
  setRoll(g, 6);
  assert.ok(act(g, { t: 'break', i: 0 }).ok);
  assert.equal(g.walls.length, 0);
}

// 8. Бонусы: «ещё ход» и заморозка.
{
  const g = newGame(seats(2), { bonus: false });
  g.bonus['4,7'] = 'again'; setRoll(g, 2);
  act(g, { t: 'move', x: 4, y: 7 });
  assert.equal(g.turn, 0); assert.equal(g.phase, 'roll');
  g.bonus['4,6'] = 'freeze'; setRoll(g, 2);
  act(g, { t: 'move', x: 4, y: 6 });
  assert.equal(g.players[1].skip, 0, 'пропуск уже потрачен');
  assert.equal(g.turn, 0, 'соперник заморожен — снова наш ход');
}

// 9. Бонусы расставлены симметрично на всех полях.
for (const size of SIZES) {
  const g = newGame(seats(2), { size });
  for (const k of Object.keys(g.bonus)) {
    const [x, y] = k.split(',').map(Number);
    assert.equal(g.bonus[`${size - 1 - y},${x}`], g.bonus[k], `симметрия бонусов ${size}×${size}`);
  }
}
console.log('engine: OK');
