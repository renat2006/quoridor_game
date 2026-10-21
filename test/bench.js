// Турнир ботов: насколько уровни сильнее друг друга. Запуск: npm run bench [число партий]
import { newGame, doRoll, act, botAct } from '../public/js/engine.js';

const GAMES = Number(process.argv[2]) || 60;

function play(levels) {
  const g = newGame(levels.map((l, i) => ({ name: l + i, bot: true })));
  let guard = 0, slow = 0;
  while (!g.over && guard++ < 4000) {
    doRoll(g);
    if (g.phase === 'roll') continue;
    const t = performance.now();
    const a = botAct(g, Math.random, levels[g.turn]);
    slow = Math.max(slow, performance.now() - t);
    const r = act(g, a);
    if (!r.ok) throw new Error(`ход отклонён: ${JSON.stringify(a)} ${r.err}`);
  }
  return { winner: g.winner, turns: g.turns, slow };
}

function match(a, b) {
  let winsA = 0, maxMs = 0, turns = 0;
  for (let k = 0; k < GAMES; k++) {
    const seats = k % 2 ? [b, a] : [a, b]; // по очереди ходим первыми
    const r = play(seats);
    if (seats[r.winner] === a) winsA++;
    maxMs = Math.max(maxMs, r.slow); turns += r.turns;
  }
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}: ${a} выиграл ${winsA}/${GAMES} (${Math.round(100 * winsA / GAMES)}%), в среднем ${Math.round(turns / GAMES)} ходов, самый долгий ход бота ${maxMs.toFixed(0)} мс`);
  return winsA / GAMES;
}

match('normal', 'easy');
