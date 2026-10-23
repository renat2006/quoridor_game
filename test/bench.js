// Турниры ботов: сила уровней, баланс ролей, преимущество первого хода, длина партий.
// Запуск: npm run bench [число партий] [размер поля]
import { newGame, act, botAct, ROLES } from '../public/js/engine.js';

const GAMES = Number(process.argv[2]) || 60, SIZE = Number(process.argv[3]) || 9;

function play(levels, opts = {}) {
  const g = newGame(levels.map((l, i) => ({ name: l + i, bot: true })), { size: SIZE, ...opts });
  let guard = 0, slow = 0;
  while (!g.over && guard++ < 3000) {
    const t = performance.now();
    const a = botAct(g, Math.random, levels[g.turn]);
    slow = Math.max(slow, performance.now() - t);
    const r = act(g, a);
    if (!r.ok) throw new Error(`ход отклонён: ${JSON.stringify(a)} ${r.err}`);
  }
  return { g, slow };
}

function match(a, b) {
  let winsA = 0, maxMs = 0, turns = 0;
  for (let k = 0; k < GAMES; k++) {
    const seats = k % 2 ? [b, a] : [a, b];
    const { g, slow } = play(seats);
    if (seats[g.winner] === a) winsA++;
    maxMs = Math.max(maxMs, slow); turns += g.turns;
  }
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}: ${a} выиграл ${Math.round(100 * winsA / GAMES)}%, ходов ${Math.round(turns / GAMES)}, самый долгий ход бота ${maxMs.toFixed(0)} мс`);
}

function roles() {
  const stat = Object.fromEntries(Object.keys(ROLES).map((r) => [r, { w: 0, n: 0, use: 0 }]));
  let first = 0, turns = 0;
  for (let k = 0; k < GAMES; k++) {
    const { g } = play(['normal', 'normal']);
    g.players.forEach((p) => { stat[p.role].use += p.roleUses; });
    g.players.forEach((p) => { stat[p.role].n++; if (p.i === g.winner) stat[p.role].w++; });
    if (g.winner === 0) first++;
    turns += g.turns;
  }
  console.log(`роли (${SIZE}×${SIZE}, normal vs normal, ${GAMES} партий, ходов в среднем ${Math.round(turns / GAMES)}; первый ход выигрывает ${Math.round(100 * first / GAMES)}%):`);
  for (const [r, s] of Object.entries(stat)) console.log(`  ${ROLES[r].name.padEnd(11)} ${s.n ? Math.round(100 * s.w / s.n) : '—'}%  (${s.n} партий, роль сработала ${s.n ? (s.use / s.n).toFixed(1) : 0} раз за партию)`);
}

const only = process.argv[4];
if (!only || only === 'levels') { match('hard', 'normal'); match('normal', 'easy'); }
if (!only || only === 'roles') roles();
