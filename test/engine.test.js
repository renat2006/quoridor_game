import assert from 'node:assert/strict';
import { newGame, act, botAct, dist, wallLegal, reach, hydrate, snapshot, cur, rebuild, SIZES, options, rotateLegal, ROLES, replay, BOT_LEVELS, freshTurn, stepBudget, wallBudget, RULES } from '../public/js/engine.js';
import { Room } from '../public/js/room.js';

const seats = (n) => Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), bot: true }));
// партия без бонусов и ролей, как будто первый ход уже прошёл: у игрока все слоты; role — роль текущего игрока
const plain = (n = 2, extra = {}, role = null) => {
  const g = newGame(seats(n), { bonus: false, roles: false, ...extra });
  // рука предсказуемая: с играбельной картой ход не закончится сам посреди проверки
  g.turns = n; cur(g).role = role; cur(g).hand = ['reserve']; g.t = freshTurn(g, cur(g)); return g;
};

// 1. Боты всех уровней доигрывают партии на всех полях, правила не нарушаются.
for (const size of SIZES) for (const n of [2, 4]) for (const level of BOT_LEVELS) {
  if (level === 'hard' && (n > 2 || size > 9)) continue; // сильный бот медленный: полные поля проверяет турнир (npm run bench)
  const g = newGame(seats(n), { size });
  let guard = 0;
  while (!g.over && guard++ < 3000) {
    const a = botAct(g, Math.random, level), r = act(g, a);
    assert.ok(r.ok, `ход бота отклонён: ${JSON.stringify(a)} ${r.err}`);
    g.players.forEach((p) => assert.ok(dist(g, p) < Infinity, 'путь к цели закрыт'));
  }
  assert.ok(g.over, `партия ${size}×${size} на ${n} (${level}) не закончилась`);
}

// 2. Поля и роли: старты по центру сторон, роли у всех разные; в первый ход партии стену не ставят.
{
  const s = newGame(seats(2), { size: 7, roles: false }), l = newGame(seats(4), { size: 11 });
  assert.deepEqual([s.players[0].x, s.players[0].y], [3, 6]);
  assert.deepEqual([l.players[1].x, l.players[1].y], [0, 5]);
  assert.equal(new Set(l.players.map((p) => p.role)).size, 4);
  assert.ok(l.players.every((p) => ROLES[p.role]));
  assert.equal(s.players[0].role, null);
  assert.equal(options(s).wall, false, 'компенсация темпа: первый ход без стены');
  act(s, { t: 'end' }); assert.equal(options(s).wall, true, 'у второго игрока стена есть');
}

// 3. Ход — три слота: один шаг, одна стена, одна карта; когда делать нечего, ход заканчивается сам.
{
  const g = plain(); cur(g).hand = ['reserve'];
  assert.ok(!reach(g).has('4,6'), 'за ход только один шаг');
  assert.ok(act(g, { t: 'move', x: 4, y: 7 }).ok);
  assert.equal(options(g).move, false, 'второй шаг нельзя');
  assert.ok(act(g, { t: 'wall', o: 'h', x: 0, y: 2 }).ok);
  assert.equal(act(g, { t: 'wall', o: 'h', x: 2, y: 2 }).ok, false, 'вторая стена нельзя');
  assert.equal(g.turn, 0, 'карту ещё можно сыграть — ход не закончен');
  assert.ok(act(g, { t: 'card', c: 0 }).ok); assert.equal(g.turn, 1, 'слоты кончились — ход перешёл сам');
}
{
  const g = plain(); cur(g).hand = ['dash', 'dash'];
  assert.ok(act(g, { t: 'card', c: 0 }).ok);
  assert.equal(act(g, { t: 'card', c: 0 }).ok, false, 'вторая карта за ход нельзя');
  assert.ok(reach(g).has('4,6') && !reach(g).has('4,5'), 'с рывком — два шага');
}
{
  // карта приходит раз в два хода
  const g = newGame(seats(2), { bonus: false, roles: false }), h0 = g.players[0].hand.length;
  act(g, { t: 'end' }); act(g, { t: 'end' }); assert.equal(g.players[0].hand.length, h0, 'на втором своём ходу карты нет');
  act(g, { t: 'end' }); act(g, { t: 'end' }); assert.equal(g.players[0].hand.length, Math.min(3, h0 + 1), 'на третьем — новая');
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

// 5. Роли — постоянные свойства, и ни одна не повторяет карту.
{
  const r = plain(2, {}, 'runner');
  assert.equal(stepBudget(r), 2, 'Бегун: второй шаг…');
  assert.ok(act(r, { t: 'move', x: 4, y: 6 }).ok); assert.equal(wallBudget(r), 0, '…вместо стены');
  const r2 = plain(2, {}, 'runner');
  act(r2, { t: 'wall', o: 'h', x: 0, y: 2 }); assert.equal(stepBudget(r2), 1, 'поставил стену — шаг один');

  const a = plain(2, {}, 'architect');
  assert.ok(act(a, { t: 'wall', o: 'h', x: 0, y: 2 }).ok && act(a, { t: 'wall', o: 'h', x: 2, y: 2 }).ok, 'Архитектор: две стены за ход');
  assert.equal(act(a, { t: 'wall', o: 'h', x: 4, y: 2 }).ok, false);

  const gh = plain(2, {}, 'ghost'); gh.walls.push({ o: 'h', x: 4, y: 7, owner: 1 }); rebuild(gh);
  const stock = cur(gh).walls;
  assert.ok(reach(gh).has('4,7'), 'Призрак проходит сквозь стену');
  assert.ok(act(gh, { t: 'move', x: 4, y: 7 }).ok);
  assert.equal(wallBudget(gh), 0, 'вместо своей стены'); assert.equal(cur(gh).walls, stock - RULES.ghostCost, 'и тратит стену из запаса');

  const m = plain(2, {}, 'mason'); act(m, { t: 'wall', o: 'h', x: 0, y: 2 }); act(m, { t: 'end' });
  cur(m).hand = ['demolish', 'turn'];
  assert.equal(act(m, { t: 'card', c: 0, i: 0 }).ok, false, 'стену Каменщика не снести');
  assert.equal(act(m, { t: 'card', c: 1, i: 0 }).ok, false, 'и не повернуть');

  const s = plain(2, {}, 'sapper'); s.walls.push({ o: 'h', x: 4, y: 7, owner: 1 }, { o: 'h', x: 0, y: 2, owner: 1 }); rebuild(s);
  const before = cur(s).walls;
  assert.equal(act(s, { t: 'break', i: 1 }).ok, false, 'Сапёр ломает только стену рядом');
  assert.ok(act(s, { t: 'break', i: 0 }).ok); assert.equal(cur(s).walls, before + 1, 'и забирает её себе');
  assert.equal(options(s).wall, false, 'это заменило стену в этом ходу');

  const c = plain(2, {}, 'gambler'); cur(c).hand = ['reserve', 'reserve'];
  assert.ok(act(c, { t: 'card', c: 0 }).ok && act(c, { t: 'card', c: 0 }).ok, 'Картёжник играет две карты за ход');
}

// 6. Карты: заморозка, снос, поворот, смещение, запас; поворот не может закрыть путь.
{
  const g = plain(); cur(g).hand = ['freeze'];
  act(g, { t: 'card', c: 0 }); act(g, { t: 'end' });
  assert.equal(options(g).move, false, 'замороженный в этот ход не шагает');
  assert.ok(options(g).wall, 'но стену ставит');
}
{
  const g = plain(); g.walls.push({ o: 'h', x: 0, y: 3, owner: 1 }); rebuild(g); cur(g).hand = ['demolish'];
  assert.equal(act(g, { t: 'card', c: 0 }).ok, false, 'Сносу нужна цель');
  assert.ok(act(g, { t: 'card', c: 0, i: 0 }).ok); assert.equal(g.walls.length, 0);
}
{
  const g = plain(); cur(g).hand = ['shift', 'reserve'];
  assert.equal(act(g, { t: 'card', c: 0, x: 4, y: 3 }).ok, false, 'смещение только по своему ряду');
  assert.ok(act(g, { t: 'card', c: 0, x: 0, y: 8 }).ok); assert.deepEqual([cur(g).x, cur(g).y], [0, 8]);
  const w = plain(); cur(w).hand = ['reserve']; const k = cur(w).walls;
  act(w, { t: 'card', c: 0 }); assert.equal(w.players[0].walls, k + 2, 'Запас: +2 стены');
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
  act(g, { t: 'move', x: 4, y: 7 }); assert.equal(stepBudget(g), 1, '+шаг');
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
