// Чистые правила игры. Работает и в Node (сервер), и в браузере (клиент).
//
// Ход: у игрока два кубика — переданный предыдущим игроком и свежий. Он выбирает, каким ходить,
// а второй уходит следующему. Так случайность меньше, а у каждого хода есть решение: что взять себе
// и что отдать сопернику. Через соседнюю фишку можно перепрыгнуть (или обойти её по диагонали,
// если прыжку мешает стена), как в классическом Quoridor.
export const SIZES = [7, 9, 11];
export const SIZE_NAMES = { 7: 'Малое', 9: 'Среднее', 11: 'Большое' };
export const COLORS = ['#E5482E', '#2F6BD8', '#EFAA14', '#12946A'];
export const ORDER = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
export const BONUS = { wall: '+2 стены', again: 'ещё ход', freeze: 'заморозка' };
export const maxSteps = (r) => (r <= 3 ? 1 : 2); // 1–3 → 1 клетка, 4–6 → 2
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
export const key = (x, y) => x + ',' + y;

/* Стороны: 0 — низ (идёт вверх), 1 — лево (вправо), 2 — верх (вниз), 3 — право (влево). */
export function startOf(n, side) { const h = (n - 1) / 2; return [[h, n - 1], [0, h], [h, 0], [n - 1, h]][side]; }
export function goalOf(n, side) { return [(x, y) => y === 0, (x, y) => x === n - 1, (x, y) => y === n - 1, (x, y) => x === 0][side]; }
export const atGoal = (g, p) => goalOf(g.size, p.side)(p.x, p.y);

/* Запас стен растёт с размером поля и делится на число игроков. */
function wallStock(size, n) { const base = { 7: 8, 9: 10, 11: 14 }[size]; return Math.round(base * { 2: 1, 3: 0.8, 4: 0.6 }[n]); }

export function rebuild(g) {
  g.H = new Set(); g.V = new Set();
  for (const w of g.walls) (w.o === 'h' ? g.H : g.V).add(key(w.x, w.y));
  return g;
}
export function snapshot(g) { const { H, V, ...rest } = g; return JSON.parse(JSON.stringify(rest)); }
export function hydrate(s) { return rebuild(JSON.parse(JSON.stringify(s))); }

export const cur = (g) => g.players[g.turn];
const die = (rng) => 1 + Math.floor(rng() * 6);

function log(g, t, p = -1) { g.log.unshift({ t, p, n: g.turns + 1 }); if (g.log.length > 40) g.log.pop(); }
function fx(g, type, data = {}) { g.fx.push({ seq: ++g.fxSeq, type, ...data }); if (g.fx.length > 24) g.fx.shift(); }

export function newGame(seats, opts = {}, rng = Math.random) {
  const n = seats.length, order = ORDER[n], size = SIZES.includes(opts.size) ? opts.size : 9;
  const stock = wallStock(size, n);
  const g = {
    id: Date.now().toString(36) + Math.floor(rng() * 1e6).toString(36),
    t0: Date.now(), t1: null, n, size, turn: 0, phase: 'roll', roll: null, over: false, winner: null, turns: 0,
    dice: null, sel: 0, diceFrom: -1, pass: null, passFrom: -1,
    walls: [], bonus: {}, log: [], fx: [], fxSeq: 0,
    players: seats.map((s, i) => {
      const [x, y] = startOf(size, order[i]);
      return { i, side: order[i], name: s.name, bot: !!s.bot, color: COLORS[i], x, y, walls: stock, skip: 0 };
    }),
  };
  rebuild(g);
  if (opts.bonus !== false) placeBonuses(g, rng);
  log(g, `Старт! Первым ходит ${cur(g).name}`, 0);
  return g;
}

/* Бонусы ставятся симметрично (поворот на 90°), чтобы никому не было легче. */
function placeBonuses(g, rng) {
  const n = g.size, h = (n - 1) / 2, k = { 7: 2, 9: 3, 11: 4 }[n];
  const types = ['again', 'freeze', 'wall', 'wall'].slice(0, k).sort(() => rng() - 0.5);
  const cand = [];
  for (let x = 1; x < h; x++) for (let y = 1; y < h; y++) cand.push([x, y]);
  cand.sort(() => rng() - 0.5);
  types.forEach((t, i) => {
    let [x, y] = cand[i];
    for (let r = 0; r < 4; r++) { g.bonus[key(x, y)] = t; [x, y] = [n - 1 - y, x]; }
  });
  if (n >= 9) g.bonus[key(h, h)] = 'wall';
}

export function blocked(g, x, y, nx, ny) {
  if (nx < 0 || ny < 0 || nx >= g.size || ny >= g.size) return true;
  if (nx === x) { const t = Math.min(y, ny); return g.H.has(key(x, t)) || g.H.has(key(x - 1, t)); }
  const l = Math.min(x, nx);
  return g.V.has(key(l, y)) || g.V.has(key(l, y - 1));
}

/* Кратчайший путь до цели в клетках (фишки не мешают — их можно перепрыгнуть). */
export function dist(g, p) {
  const goal = goalOf(g.size, p.side);
  let fr = [[p.x, p.y]]; const seen = new Set([key(p.x, p.y)]); let d = 0;
  while (fr.length) {
    for (const [x, y] of fr) if (goal(x, y)) return d;
    const nx = [];
    for (const [x, y] of fr) for (const [dx, dy] of DIRS) {
      const a = x + dx, b = y + dy;
      if (blocked(g, x, y, a, b)) continue;
      const k = key(a, b); if (seen.has(k)) continue;
      seen.add(k); nx.push([a, b]);
    }
    fr = nx; d++;
  }
  return Infinity;
}

/* Клетки, куда можно дойти за max шагов. Соседнюю фишку можно перепрыгнуть (это один шаг),
   а если за ней стена или край — обойти по диагонали. */
export function reach(g, p, max) {
  const occ = new Set(g.players.filter((q) => q !== p).map((q) => key(q.x, q.y)));
  const res = new Map(); const seen = new Set([key(p.x, p.y)]);
  let fr = [[p.x, p.y]];
  const land = (a, b, d, nx) => { const k = key(a, b); if (seen.has(k) || occ.has(k)) return; seen.add(k); nx.push([a, b]); res.set(k, d); };
  for (let d = 1; d <= max; d++) {
    const nx = [];
    for (const [x, y] of fr) for (const [dx, dy] of DIRS) {
      const a = x + dx, b = y + dy;
      if (blocked(g, x, y, a, b)) continue;
      if (!occ.has(key(a, b))) { land(a, b, d, nx); continue; }
      if (!blocked(g, a, b, a + dx, b + dy) && !occ.has(key(a + dx, b + dy))) { land(a + dx, b + dy, d, nx); continue; }
      for (const [px, py] of dx ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) if (!blocked(g, a, b, a + px, b + py)) land(a + px, b + py, d, nx);
    }
    fr = nx;
  }
  return res;
}

export function wallFree(g, o, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > g.size - 2 || y > g.size - 2) return false;
  if (o === 'h') return !(g.H.has(key(x, y)) || g.H.has(key(x - 1, y)) || g.H.has(key(x + 1, y)) || g.V.has(key(x, y)));
  if (o === 'v') return !(g.V.has(key(x, y)) || g.V.has(key(x, y - 1)) || g.V.has(key(x, y + 1)) || g.H.has(key(x, y)));
  return false;
}
export function wallLegal(g, o, x, y) {
  if (!wallFree(g, o, x, y)) return { ok: false, why: 'Стены пересекаются' };
  const set = o === 'h' ? g.H : g.V; set.add(key(x, y));
  const ok = g.players.every((p) => dist(g, p) < Infinity);
  set.delete(key(x, y));
  return ok ? { ok: true } : { ok: false, why: 'Нельзя полностью закрывать путь к цели' };
}

/* Что доступно с кубиком roll (по умолчанию — с выбранным). */
export function options(g, roll = g.roll) {
  const p = cur(g);
  if (g.over || g.phase !== 'act' || !roll) return { move: false, wall: false, brk: false, any: false };
  const move = reach(g, p, maxSteps(roll)).size > 0;
  const wall = p.walls > 0, brk = roll === 6 && g.walls.length > 0;
  return { move, wall, brk, any: move || wall || brk };
}

export function endTurn(g) {
  g.roll = null; g.dice = null; g.phase = 'roll'; g.turns++;
  for (let k = 0; k < g.n; k++) {
    g.turn = (g.turn + 1) % g.n;
    const p = cur(g);
    if (p.skip > 0) { p.skip--; log(g, `${p.name} пропускает ход`, p.i); fx(g, 'skip', { p: p.i, why: 'freeze' }); continue; }
    break;
  }
}

/* Неиспользованный кубик уходит следующему игроку. */
function passDie(g, p) { g.pass = g.dice[1 - g.sel]; g.passFrom = p.i; }

export function doRoll(g, rng = Math.random) {
  if (g.over || g.phase !== 'roll') return { ok: false, err: 'Сейчас нельзя бросать' };
  const p = cur(g), fresh = die(rng);
  const given = g.pass ?? die(rng);
  g.diceFrom = g.pass != null ? g.passFrom : -1; g.pass = null;
  g.dice = [given, fresh]; g.sel = fresh > given ? 1 : 0; g.roll = g.dice[g.sel]; g.phase = 'act';
  log(g, g.diceFrom >= 0 ? `${p.name}: получил ${given}, выбросил ${fresh}` : `${p.name} выбросил ${given} и ${fresh}`, p.i);
  fx(g, 'roll', { p: p.i, dice: g.dice, from: g.diceFrom });
  if (!options(g, g.dice[0]).any && !options(g, g.dice[1]).any) {
    g.sel = g.dice[0] >= g.dice[1] ? 0 : 1; passDie(g, p); // при пропуске отдаём меньший
    log(g, `${p.name}: ходов нет, пропуск`, p.i); fx(g, 'skip', { p: p.i, why: 'stuck' });
    endTurn(g);
  }
  return { ok: true };
}

const bad = (err) => ({ ok: false, err });

export function act(g, a) {
  if (g.over || g.phase !== 'act') return bad('Сначала бросьте кубики');
  const p = cur(g);
  if (a.d !== undefined) {
    if (a.d !== 0 && a.d !== 1) return bad('Нет такого кубика');
    g.sel = a.d; g.roll = g.dice[a.d];
    if (a.t === 'select') return { ok: true };
  }
  switch (a.t) {
    case 'move': {
      const steps = reach(g, p, maxSteps(g.roll)).get(key(a.x, a.y));
      if (!steps) return bad('Туда не дойти');
      const from = [p.x, p.y]; p.x = a.x; p.y = a.y; passDie(g, p);
      log(g, `${p.name} прошёл ${steps} кл.`, p.i);
      fx(g, 'move', { p: p.i, from, to: [p.x, p.y], steps });
      if (atGoal(g, p)) {
        g.over = true; g.winner = p.i; g.phase = 'over'; g.t1 = Date.now();
        log(g, `${p.name} побеждает`, p.i); fx(g, 'win', { p: p.i });
        return { ok: true };
      }
      const bk = key(p.x, p.y), t = g.bonus[bk]; let extra = false;
      if (t) {
        delete g.bonus[bk];
        log(g, `${p.name} взял «${BONUS[t]}»`, p.i); fx(g, 'bonus', { p: p.i, type: t, at: [p.x, p.y] });
        if (t === 'wall') p.walls += 2;
        if (t === 'again') extra = true;
        if (t === 'freeze') g.players[(g.turn + 1) % g.n].skip++;
      }
      if (extra) { g.roll = null; g.dice = null; g.phase = 'roll'; } else endTurn(g);
      return { ok: true };
    }
    case 'wall': {
      if (p.walls <= 0) return bad('Стены закончились');
      const lg = wallLegal(g, a.o, a.x, a.y);
      if (!lg.ok) return bad(lg.why);
      (a.o === 'h' ? g.H : g.V).add(key(a.x, a.y));
      g.walls.push({ o: a.o, x: a.x, y: a.y, owner: p.i }); p.walls--; passDie(g, p);
      log(g, `${p.name} поставил стену`, p.i); fx(g, 'wall', { p: p.i, o: a.o, x: a.x, y: a.y });
      endTurn(g); return { ok: true };
    }
    case 'break': {
      const w = g.walls[a.i];
      if (g.roll !== 6) return bad('Ломать стены можно только шестёркой');
      if (!w) return bad('Такой стены нет');
      (w.o === 'h' ? g.H : g.V).delete(key(w.x, w.y)); g.walls.splice(a.i, 1); passDie(g, p);
      log(g, `${p.name} сломал стену`, p.i); fx(g, 'break', { p: p.i, o: w.o, x: w.x, y: w.y });
      endTurn(g); return { ok: true };
    }
    case 'pass':
      if (options(g, g.dice[0]).any || options(g, g.dice[1]).any) return bad('Есть доступные действия');
      passDie(g, p); endTurn(g); return { ok: true };
  }
  return bad('Неизвестное действие');
}

/* ======================== ИИ ========================
   Оценка позиции — разница кратчайших путей до цели (стандартный подход для Quoridor),
   переведённая в ожидаемое число ходов, плюс цена стен в запасе: жадный бот иначе тратит стены сразу.
   Вариантов стен ~130, поэтому рассматриваются только стены, перерезающие кратчайший путь лидеров.
   Бот перебирает оба кубика и учитывает, что второй достанется следующему игроку.
   Уровни: easy — жадный бот с шумом; normal — оценка с подобранными весами; hard — ещё и защищает свой
   маршрут: штрафует позиции, где одна стена соперника сильно удлиняет путь (+10–13 п. п. побед над normal
   на полях 9×9 и 11×11 по турнирам test/bench.js). */
export const BOT_LEVELS = ['easy', 'normal', 'hard'];

const WIN = 10000;

/* Один кратчайший путь (список рёбер) для игрока p, без учёта фишек. */
function shortestPath(g, p) {
  const goal = goalOf(g.size, p.side), start = key(p.x, p.y);
  const prev = new Map([[start, null]]); let fr = [[p.x, p.y]], end = null;
  while (fr.length && !end) {
    const nx = [];
    for (const [x, y] of fr) {
      if (goal(x, y)) { end = key(x, y); break; }
      for (const [dx, dy] of DIRS) {
        const a = x + dx, b = y + dy;
        if (blocked(g, x, y, a, b)) continue;
        const k = key(a, b); if (prev.has(k)) continue;
        prev.set(k, key(x, y)); nx.push([a, b]);
      }
    }
    fr = nx;
  }
  const edges = [];
  for (let k = end; k && prev.get(k); k = prev.get(k)) edges.push([prev.get(k), k]);
  return edges.map(([u, v]) => [...u.split(',').map(Number), ...v.split(',').map(Number)]);
}

/* Стены, перекрывающие хотя бы одно ребро кратчайшего пути целей. */
function wallCandidates(g, targets) {
  const seen = new Set(), out = [];
  const add = (o, x, y) => { const k = o + x + ',' + y; if (seen.has(k)) return; seen.add(k); if (wallLegal(g, o, x, y).ok) out.push({ t: 'wall', o, x, y }); };
  for (const t of targets) for (const [x, y, a, b] of shortestPath(g, t)) {
    if (a === x) { const top = Math.min(y, b); add('h', x, top); add('h', x - 1, top); }
    else { const l = Math.min(x, a); add('v', l, y); add('v', l, y - 1); }
  }
  return out;
}

/* Ожидаемое число ходов, чтобы пройти d клеток, если за ход проходишь 1 или 2 клетки. */
const TURNS = (() => { const t = [0]; for (let d = 1; d < 200; d++) t[d] = 1 + (t[d - 1] + t[Math.max(0, d - 2)]) / 2; return t; })();
const turnsTo = (d) => (d === Infinity ? 99 : TURNS[Math.min(d, 199)]);

/* Настройки оценки (подобраны турнирами ботов, см. test/bench.js). */
export const AI = { wallValue: [0.2, 0.6, 1], bonus: { wall: 2, again: 12, freeze: 8 }, passStep: 2, pass6: 1, defend: 0.4 };
let defendWeight = 0; // включается на уровне hard

/* Оценка с точки зрения игрока me — в «десятых долях хода»: насколько ближе я к финишу, чем лидер
   среди соперников, плюс цена стен в запасе (она падает, когда соперник у цели и стену пора тратить). */
function evaluate(g, me) {
  if (atGoal(g, me)) return WIN;
  let lead = Infinity;
  for (const q of g.players) if (q !== me) {
    if (atGoal(g, q)) return -WIN;
    lead = Math.min(lead, dist(g, q));
  }
  const lt = turnsTo(lead), wv = AI.wallValue[lt <= 2 ? 0 : lt <= 3.5 ? 1 : 2];
  let v = 10 * (lt - turnsTo(dist(g, me))) + wv * me.walls;
  if (defendWeight && g.players.some((q) => q !== me && q.walls > 0)) v -= 10 * defendWeight * vulnerability(g, me);
  return v;
}

/* Уязвимость пути: на сколько ходов одна стена соперника может удлинить путь игрока p. */
function vulnerability(g, p) {
  const base = turnsTo(dist(g, p)); let worst = 0;
  for (const w of wallCandidates(g, [p])) {
    const s = w.o === 'h' ? g.H : g.V, k = key(w.x, w.y);
    s.add(k); const t = turnsTo(dist(g, p)); s.delete(k);
    if (t - base > worst) worst = t - base;
  }
  return worst;
}

/* Применить действие «понарошку» и вернуть функцию отката. */
function tryAction(g, p, a) {
  if (a.t === 'move') { const ox = p.x, oy = p.y; p.x = a.x; p.y = a.y; return () => { p.x = ox; p.y = oy; }; }
  if (a.t === 'wall') { const s = a.o === 'h' ? g.H : g.V, k = key(a.x, a.y); s.add(k); p.walls--; return () => { s.delete(k); p.walls++; }; }
  if (a.t === 'break') { const w = g.walls[a.i], s = w.o === 'h' ? g.H : g.V, k = key(w.x, w.y); s.delete(k); return () => s.add(k); }
  return () => {};
}

function candidates(g, p, roll) {
  const acts = [];
  reach(g, p, maxSteps(roll)).forEach((d, k) => { const [x, y] = k.split(',').map(Number); acts.push({ t: 'move', x, y, bonus: g.bonus[k] }); });
  if (p.walls > 0) {
    const opps = g.players.filter((q) => q !== p).sort((a, b) => dist(g, a) - dist(g, b)).slice(0, 2);
    acts.push(...wallCandidates(g, opps));
  }
  if (roll === 6) g.walls.forEach((w, i) => acts.push({ t: 'break', i }));
  return acts;
}

export function botAct(g, rng = Math.random, level = 'normal') {
  if (level === 'easy') return greedyAct(g, rng);
  defendWeight = level === 'hard' ? AI.defend : 0;
  const p = cur(g);
  let best = null, bestV = -Infinity, walls = null;
  for (const d of g.dice[0] === g.dice[1] ? [g.sel] : [0, 1]) {
    const roll = g.dice[d], given = g.dice[1 - d];
    // отдать сопернику кубик с большим шагом (или шестёрку) — минус
    const passCost = AI.passStep * maxSteps(given) + (given === 6 ? AI.pass6 : 0);
    const acts = candidates(g, p, roll);
    for (const a of acts) {
      if (a.t === 'wall' && walls && walls.has(a.o + a.x + ',' + a.y)) {
        // оценка стены не зависит от кубика — берём посчитанную ранее
        const v = walls.get(a.o + a.x + ',' + a.y) - passCost + rng() * 0.5;
        if (v > bestV) { bestV = v; best = { ...a, d }; }
        continue;
      }
      const undo = tryAction(g, p, a);
      let v = atGoal(g, p) ? WIN * 2 : evaluate(g, p);
      undo();
      if (a.t === 'wall') (walls ||= new Map()).set(a.o + a.x + ',' + a.y, v);
      if (a.bonus) v += AI.bonus[a.bonus];
      if (a.t === 'break') v -= 3; // ломать стоит, только если это заметно лучше
      v += rng() * 0.5 - passCost;
      if (v > bestV) { bestV = v; best = { ...a, d }; }
    }
  }
  if (!best) return { t: 'pass' };
  const { bonus, ...act } = best;
  return act;
}

/* Лёгкий уровень: жадный бот с заметным шумом, всегда ходит большим кубиком. */
function greedyAct(g, rng) {
  const p = cur(g), r = g.roll, base = dist(g, p);
  const opps = g.players.filter((q) => q !== p);
  const oBase = opps.map((q) => dist(g, q));
  const leader = Math.min(...oBase);
  let best = null;
  const consider = (s, a) => { s += rng() * 12; if (!best || s > best.s) best = { s, a }; };
  reach(g, p, maxSteps(r)).forEach((d, k) => {
    const [x, y] = k.split(',').map(Number), ox = p.x, oy = p.y;
    p.x = x; p.y = y; const nd = dist(g, p); p.x = ox; p.y = oy;
    consider((base - nd) * 10 + (g.bonus[k] ? 5 : 0), { t: 'move', x, y });
  });
  if (p.walls > 0) for (const a of wallCandidates(g, opps)) {
    const undo = tryAction(g, p, a);
    let s = -6;
    opps.forEach((q, i) => { s += (dist(g, q) - oBase[i]) * 10 * (oBase[i] === leader ? 1.4 : 0.5); });
    s -= (dist(g, p) - base) * 12;
    undo();
    consider(s, a);
  }
  return best ? best.a : { t: 'pass' };
}
