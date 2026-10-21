// Чистые правила игры. Работает и в Node (сервер), и в браузере (клиент).
export const N = 9;
export const COLORS = ['#1fb5a8', '#f2687b', '#f5b83d', '#8fc27a'];
export const SIDES = [
  { start: [4, 8], goal: (x, y) => y === 0 },
  { start: [0, 4], goal: (x, y) => x === 8 },
  { start: [4, 0], goal: (x, y) => y === 8 },
  { start: [8, 4], goal: (x, y) => x === 0 },
];
export const ORDER = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
export const BONUS = { wall: '+2 стены', again: 'ещё бросок', freeze: 'заморозка' };
export const maxSteps = (r) => Math.ceil(r / 2);
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
export const key = (x, y) => x + ',' + y;

export function rebuild(g) {
  g.H = new Set(); g.V = new Set();
  for (const w of g.walls) (w.o === 'h' ? g.H : g.V).add(key(w.x, w.y));
  return g;
}
export function snapshot(g) { const { H, V, ...rest } = g; return JSON.parse(JSON.stringify(rest)); }
export function hydrate(s) { return rebuild(JSON.parse(JSON.stringify(s))); }

export const cur = (g) => g.players[g.turn];

function log(g, t) { g.log.unshift(t); if (g.log.length > 40) g.log.pop(); }
function fx(g, type, data = {}) { g.fx.push({ seq: ++g.fxSeq, type, ...data }); if (g.fx.length > 24) g.fx.shift(); }

export function newGame(seats, opts = {}, rng = Math.random) {
  const n = seats.length, order = ORDER[n];
  const stock = n === 2 ? 10 : n === 3 ? 8 : 6;
  const g = {
    id: Date.now().toString(36) + Math.floor(rng() * 1e6).toString(36),
    n, turn: 0, phase: 'roll', roll: null, over: false, winner: null, turns: 0,
    walls: [], bonus: {}, log: [], fx: [], fxSeq: 0,
    players: seats.map((s, i) => ({
      i, side: order[i], name: s.name, bot: !!s.bot, color: COLORS[i],
      x: SIDES[order[i]].start[0], y: SIDES[order[i]].start[1], walls: stock, skip: 0,
    })),
  };
  rebuild(g);
  if (opts.bonus !== false) placeBonuses(g, rng);
  log(g, `Старт! Первым ходит ${cur(g).name}`);
  return g;
}

function placeBonuses(g, rng) {
  const types = ['wall', 'again', 'freeze'];
  const cand = [];
  for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) cand.push([x, y]);
  cand.sort(() => rng() - 0.5);
  types.forEach((t, i) => {
    let [x, y] = cand[i];
    for (let r = 0; r < 4; r++) { g.bonus[key(x, y)] = t; [x, y] = [8 - y, x]; }
  });
  g.bonus[key(4, 4)] = 'wall';
}

export function blocked(g, x, y, nx, ny) {
  if (nx < 0 || ny < 0 || nx >= N || ny >= N) return true;
  if (nx === x) { const t = Math.min(y, ny); return g.H.has(key(x, t)) || g.H.has(key(x - 1, t)); }
  const l = Math.min(x, nx);
  return g.V.has(key(l, y)) || g.V.has(key(l, y - 1));
}

export function dist(g, p) {
  const goal = SIDES[p.side].goal;
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

export function reach(g, p, max) {
  const occ = new Set(g.players.filter((q) => q !== p).map((q) => key(q.x, q.y)));
  const res = new Map(); const seen = new Set([key(p.x, p.y)]);
  let fr = [[p.x, p.y]];
  for (let d = 1; d <= max; d++) {
    const nx = [];
    for (const [x, y] of fr) for (const [dx, dy] of DIRS) {
      const a = x + dx, b = y + dy;
      if (blocked(g, x, y, a, b)) continue;
      const k = key(a, b); if (seen.has(k) || occ.has(k)) continue;
      seen.add(k); nx.push([a, b]); res.set(k, d);
    }
    fr = nx;
  }
  return res;
}

export function wallFree(g, o, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > N - 2 || y > N - 2) return false;
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

export function options(g) {
  const p = cur(g);
  if (g.over || g.phase !== 'act') return { move: false, wall: false, brk: false, any: false };
  const move = reach(g, p, maxSteps(g.roll)).size > 0;
  const wall = p.walls > 0, brk = g.roll === 6 && g.walls.length > 0;
  return { move, wall, brk, any: move || wall || brk };
}

export function endTurn(g) {
  g.roll = null; g.phase = 'roll'; g.turns++;
  for (let k = 0; k < g.n; k++) {
    g.turn = (g.turn + 1) % g.n;
    const p = cur(g);
    if (p.skip > 0) { p.skip--; log(g, `${p.name} пропускает ход ❄️`); fx(g, 'skip', { p: p.i, why: 'freeze' }); continue; }
    break;
  }
}

export function doRoll(g, rng = Math.random) {
  if (g.over || g.phase !== 'roll') return { ok: false, err: 'Сейчас нельзя бросать' };
  const p = cur(g), r = 1 + Math.floor(rng() * 6);
  g.roll = r; g.phase = 'act';
  log(g, `${p.name} бросает ${r}`); fx(g, 'roll', { p: p.i, r });
  if (!options(g).any) {
    log(g, `${p.name}: ходов нет, пропуск`); fx(g, 'skip', { p: p.i, why: 'stuck' });
    endTurn(g);
  }
  return { ok: true };
}

const bad = (err) => ({ ok: false, err });

export function act(g, a) {
  if (g.over || g.phase !== 'act') return bad('Сначала бросьте кубик');
  const p = cur(g);
  switch (a.t) {
    case 'move': {
      const steps = reach(g, p, maxSteps(g.roll)).get(key(a.x, a.y));
      if (!steps) return bad('Туда не дойти');
      const from = [p.x, p.y]; p.x = a.x; p.y = a.y;
      log(g, `${p.name} идёт на ${steps} кл.`);
      fx(g, 'move', { p: p.i, from, to: [p.x, p.y], steps });
      if (SIDES[p.side].goal(p.x, p.y)) {
        g.over = true; g.winner = p.i; g.phase = 'over';
        log(g, `🏆 ${p.name} побеждает!`); fx(g, 'win', { p: p.i });
        return { ok: true };
      }
      const bk = key(p.x, p.y), t = g.bonus[bk]; let extra = false;
      if (t) {
        delete g.bonus[bk];
        log(g, `${p.name}: ${BONUS[t]}`); fx(g, 'bonus', { p: p.i, type: t, at: [p.x, p.y] });
        if (t === 'wall') p.walls += 2;
        if (t === 'again') extra = true;
        if (t === 'freeze') g.players[(g.turn + 1) % g.n].skip++;
      }
      if (extra) { g.roll = null; g.phase = 'roll'; } else endTurn(g);
      return { ok: true };
    }
    case 'wall': {
      if (p.walls <= 0) return bad('Стены закончились');
      const lg = wallLegal(g, a.o, a.x, a.y);
      if (!lg.ok) return bad(lg.why);
      (a.o === 'h' ? g.H : g.V).add(key(a.x, a.y));
      g.walls.push({ o: a.o, x: a.x, y: a.y, owner: p.i }); p.walls--;
      log(g, `${p.name} ставит стену`); fx(g, 'wall', { p: p.i, o: a.o, x: a.x, y: a.y });
      endTurn(g); return { ok: true };
    }
    case 'break': {
      const w = g.walls[a.i];
      if (g.roll !== 6) return bad('Ломать стены можно только на шестёрке');
      if (!w) return bad('Такой стены нет');
      (w.o === 'h' ? g.H : g.V).delete(key(w.x, w.y)); g.walls.splice(a.i, 1);
      log(g, `🔨 ${p.name} ломает стену`); fx(g, 'break', { p: p.i, o: w.o, x: w.x, y: w.y });
      endTurn(g); return { ok: true };
    }
    case 'pass':
      if (options(g).any) return bad('Есть доступные действия');
      endTurn(g); return { ok: true };
  }
  return bad('Неизвестное действие');
}

// ИИ: выбирает действие для текущего игрока (ничего не применяет).
export function botAct(g, rng = Math.random) {
  const p = cur(g), r = g.roll, base = dist(g, p);
  const opps = g.players.filter((q) => q !== p);
  const oBase = opps.map((q) => dist(g, q));
  const leader = Math.min(...oBase);
  let best = null;
  const consider = (s, a) => { s += rng() * 2; if (!best || s > best.s) best = { s, a }; };

  reach(g, p, maxSteps(r)).forEach((d, k) => {
    const [x, y] = k.split(',').map(Number), ox = p.x, oy = p.y;
    p.x = x; p.y = y; const nd = dist(g, p); p.x = ox; p.y = oy;
    let s = (base - nd) * 10;
    const b = g.bonus[k];
    if (b === 'wall') s += p.walls < 3 ? 6 : 3;
    if (b === 'again') s += 8;
    if (b === 'freeze') s += 5;
    consider(s, { t: 'move', x, y });
  });
  if (p.walls > 0) for (const o of ['h', 'v']) for (let x = 0; x < N - 1; x++) for (let y = 0; y < N - 1; y++) {
    if (!wallLegal(g, o, x, y).ok) continue;
    const set = o === 'h' ? g.H : g.V; set.add(key(x, y));
    let s = -1 - (p.walls <= 2 ? 4 : 0);
    opps.forEach((q, i) => { s += (dist(g, q) - oBase[i]) * 10 * (oBase[i] === leader ? 1.8 : 0.7) * (oBase[i] <= 3 ? 1.4 : 1); });
    s -= (dist(g, p) - base) * 13;
    set.delete(key(x, y));
    consider(s, { t: 'wall', o, x, y });
  }
  if (r === 6) g.walls.forEach((w, i) => {
    const set = w.o === 'h' ? g.H : g.V; set.delete(key(w.x, w.y));
    let s = (base - dist(g, p)) * 10 - 12;
    opps.forEach((q, j) => { s += (dist(g, q) - oBase[j]) * 6; });
    set.add(key(w.x, w.y));
    consider(s, { t: 'break', i });
  });
  return best ? best.a : { t: 'pass' };
}
