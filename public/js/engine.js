// Чистые правила WALL DUEL. Работает и в Node (сервер), и в браузере (клиент).
//
// Ход: игрок добирает карту и получает 2 очка действия (ОД). Шаг стоит 1 ОД, стена — 1 ОД
// (не больше двух за ход), карта — бесплатно (одна за ход). Самый первый ход партии — 1 ОД. У каждого игрока своя роль со способностью.
// Через соседнюю фишку можно перепрыгнуть, а если за ней стена — обойти по диагонали.
// Подробно — docs/game-design.md.
export const SIZES = [7, 9, 11];
export const COLORS = ['#E5482E', '#2F6BD8', '#EFAA14', '#12946A'];
export const ORDER = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
export const AP = 2;
/* Числа баланса (подобраны турнирами ботов, см. test/bench.js). */
/* Числа баланса подобраны турнирами ботов (test/bench.js): с ними все роли выигрывают 44–58%,
   первый ход — около 51%. Начальные значения (одна стена за ход, Бегун каждый ход) давали первому
   игроку 72% и Бегуну 89%. */
export const RULES = { wallLimit: 2, firstAp: 1, runnerEvery: 3, runnerWalls: 0, runnerNoWall: false, sapperCost: 0, sapperEvery: 2, sapperRefund: true,
  architectCost: 0, masonWalls: 0, masonFree: true, masonEvery: 2, gamblerCards: 2, secondBonus: { 7: 1, 9: 0, 11: 0 } };
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
export const key = (x, y) => x + ',' + y;

export const CARDS = {
  dash: { name: 'Рывок', text: '+1 ОД в этот ход' },
  demolish: { name: 'Снос', text: 'Убрать любую стену', target: 'wall' },
  phase: { name: 'Сквозь стену', text: 'Следующий шаг может пройти сквозь стену' },
  masonry: { name: 'Кладка', text: 'Бесплатная стена сверх лимита' },
  turn: { name: 'Поворот', text: 'Повернуть стену на 90°', target: 'wall' },
  freeze: { name: 'Заморозка', text: 'Следующий игрок получит на 1 ОД меньше' },
};
export const ROLES = {
  runner: { name: 'Бегун', text: 'Раз в 3 хода — бесплатный шаг' },
  mason: { name: 'Каменщик', text: 'Раз в 2 хода — бесплатная стена' },
  ghost: { name: 'Призрак', text: 'Раз в 3 хода шагает сквозь стену' },
  sapper: { name: 'Сапёр', text: 'Раз в 2 хода бесплатно ломает стену и забирает её себе' },
  gambler: { name: 'Картёжник', text: 'Берёт по 2 карты, играет до двух за ход' },
  architect: { name: 'Архитектор', text: 'Раз за ход бесплатно поворачивает стену' },
};
export const BONUS = { wall: '+2 стены', card: '+карта', energy: '+1 ОД' };

/* Стороны: 0 — низ (идёт вверх), 1 — лево (вправо), 2 — верх (вниз), 3 — право (влево). */
export function startOf(n, side) { const h = (n - 1) / 2; return [[h, n - 1], [0, h], [h, 0], [n - 1, h]][side]; }
export function goalOf(n, side) { return [(x, y) => y === 0, (x, y) => x === n - 1, (x, y) => y === n - 1, (x, y) => x === 0][side]; }
export const atGoal = (g, p) => goalOf(g.size, p.side)(p.x, p.y);

function wallStock(size, n) { const base = { 7: 7, 9: 10, 11: 13 }[size]; return Math.round(base * { 2: 1, 3: 0.8, 4: 0.6 }[n]); }
const handLimit = (p) => (p.role === 'gambler' ? 4 : 3);
const wallLimit = (p) => RULES.wallLimit + (p.role === 'mason' && !RULES.masonFree ? 1 : 0);
const cardLimit = (p) => (p.role === 'gambler' ? RULES.gamblerCards : 1);

export function rebuild(g) {
  g.H = new Set(); g.V = new Set();
  for (const w of g.walls) (w.o === 'h' ? g.H : g.V).add(key(w.x, w.y));
  return g;
}
/* Снимок для игрока viewer: чужие руки и порядок колоды скрыты. */
export function snapshot(g, viewer = -1) {
  const { H, V, deck, ...rest } = g;
  const s = JSON.parse(JSON.stringify(rest));
  s.deckN = deck.length;
  s.players.forEach((p) => { if (p.i !== viewer) p.hand = p.hand.map(() => null); });
  return s;
}
export function hydrate(s) { const g = JSON.parse(JSON.stringify(s)); g.deck = []; return rebuild(g); }

export const cur = (g) => g.players[g.turn];
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function log(g, t, p = -1) { if (g.sim) return; g.log.unshift({ t, p, n: g.turns + 1 }); if (g.log.length > 40) g.log.pop(); }
// тип события ставится последним, чтобы поле type в данных его не перетёрло
function fx(g, type, data = {}) { if (g.sim) return; g.fx.push({ ...data, seq: ++g.fxSeq, type }); if (g.fx.length > 24) g.fx.shift(); }

export function newGame(seats, opts = {}, rng = Math.random) {
  const n = seats.length, order = ORDER[n], size = SIZES.includes(opts.size) ? opts.size : 9;
  const roles = opts.roles === false ? [] : shuffle(Object.keys(ROLES), rng);
  const g = {
    id: Date.now().toString(36) + Math.floor(rng() * 1e6).toString(36),
    t0: Date.now(), t1: null, n, size, turn: 0, phase: 'act', over: false, winner: null, turns: 0,
    ap: 0, t: null, walls: [], bonus: {}, deck: [], discard: [], log: [], fx: [], fxSeq: 0,
    players: seats.map((s, i) => {
      const [x, y] = startOf(size, order[i]), role = roles[i] || null;
      return { i, side: order[i], name: s.name, bot: !!s.bot, color: COLORS[i], x, y, role,
        walls: wallStock(size, n) + (role === 'mason' ? RULES.masonWalls : 0) - (role === 'runner' ? RULES.runnerWalls : 0), hand: [], frozen: 0, ghostCd: 0, runCd: 0, masonCd: 0, sapCd: 0 };
    }),
  };
  for (const c of Object.keys(CARDS)) for (let k = 0; k < 4; k++) g.deck.push(c);
  shuffle(g.deck, rng);
  rebuild(g);
  if (opts.bonus !== false) placeBonuses(g, rng);
  g.players.forEach((p) => { draw(g, p, rng); draw(g, p, rng); });
  log(g, `Старт! Первым ходит ${cur(g).name}`, 0);
  startTurn(g, rng);
  return g;
}

/* Бонусы ставятся симметрично (поворот на 90°), чтобы никому не было легче. */
function placeBonuses(g, rng) {
  const n = g.size, h = (n - 1) / 2, k = { 7: 2, 9: 3, 11: 4 }[n];
  const types = shuffle(['wall', 'card', 'energy', 'card'].slice(0, k), rng);
  const cand = [];
  for (let x = 1; x < h; x++) for (let y = 1; y < h; y++) cand.push([x, y]);
  shuffle(cand, rng);
  types.forEach((t, i) => {
    let [x, y] = cand[i];
    for (let r = 0; r < 4; r++) { g.bonus[key(x, y)] = t; [x, y] = [n - 1 - y, x]; }
  });
  if (n >= 9) g.bonus[key(h, h)] = 'card';
}

function draw(g, p, rng = Math.random) {
  if (p.hand.length >= handLimit(p)) return false;
  if (!g.deck.length) { if (!g.discard.length) return false; g.deck = shuffle(g.discard, rng); g.discard = []; }
  p.hand.push(g.deck.pop());
  return true;
}

function startTurn(g, rng) {
  const p = cur(g);
  for (let k = 0; k < (p.role === 'gambler' ? 2 : 1); k++) draw(g, p, rng);
  // компенсация темпа: самый первый ход партии короче, на малом поле второй игрок ещё и получает +1 ОД в первый ход
  const base = g.turns === 0 ? RULES.firstAp : AP + (g.turns === 1 ? RULES.secondBonus[g.size] || 0 : 0);
  g.ap = Math.max(0, base - p.frozen);
  if (p.frozen) { log(g, `${p.name} заморожен: ${g.ap} ОД`, p.i); fx(g, 'frozen', { p: p.i }); }
  p.frozen = 0;
  if (p.ghostCd > 0) p.ghostCd--;
  const run = p.role === 'runner' && !(p.runCd > 0);
  if (p.runCd > 0) p.runCd--;
  const mason = p.role === 'mason' && RULES.masonFree && !(p.masonCd > 0);
  if (p.masonCd > 0) p.masonCd--;
  if (p.sapCd > 0) p.sapCd--;
  g.t = { freeStep: run, wallsPlaced: 0, cardsPlayed: 0, cross: 0, freeWalls: 0, masonFree: mason, rotated: false };
}

export function endTurn(g, rng = Math.random) {
  if (g.sim) { g.t.ended = true; return; } // при переборе ходов бот смотрит только свой ход
  g.turns++;
  g.turn = (g.turn + 1) % g.n;
  startTurn(g, rng);
}

/* ---------- геометрия ---------- */
export function blocked(g, x, y, nx, ny) {
  if (nx < 0 || ny < 0 || nx >= g.size || ny >= g.size) return true;
  if (nx === x) { const t = Math.min(y, ny); return g.H.has(key(x, t)) || g.H.has(key(x - 1, t)); }
  const l = Math.min(x, nx);
  return g.V.has(key(l, y)) || g.V.has(key(l, y - 1));
}
const outside = (g, x, y) => x < 0 || y < 0 || x >= g.size || y >= g.size;

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

/* Сколько шагов и проходов сквозь стену доступно сейчас. */
export function stepBudget(g) { return g.over ? 0 : g.ap + (g.t.freeStep ? 1 : 0); }
export function crossBudget(g, p = cur(g)) { return g.t.cross + (p.role === 'ghost' && p.ghostCd === 0 ? 1 : 0); }

/* Куда можно дойти: клетка → { d: шагов, c: проходов сквозь стену }. Соседнюю фишку можно перепрыгнуть
   (один шаг), а если за ней стена или край — обойти по диагонали. */
export function reach(g, p = cur(g), max = stepBudget(g), cross = crossBudget(g, p)) {
  const occ = new Set(g.players.filter((q) => q !== p).map((q) => key(q.x, q.y)));
  const res = new Map(), seen = new Set([key(p.x, p.y) + '|0']);
  let fr = [[p.x, p.y, 0]];
  const land = (a, b, c, d, nx) => {
    const k = key(a, b), sk = k + '|' + c;
    if (occ.has(k) || seen.has(sk) || (a === p.x && b === p.y)) return;
    seen.add(sk); nx.push([a, b, c]);
    const prev = res.get(k);
    if (!prev || prev.d > d || (prev.d === d && prev.c > c)) res.set(k, { d, c });
  };
  for (let d = 1; d <= max; d++) {
    const nx = [];
    for (const [x, y, c] of fr) for (const [dx, dy] of DIRS) {
      const a = x + dx, b = y + dy;
      if (outside(g, a, b)) continue;
      let cc = c;
      if (blocked(g, x, y, a, b)) { if (c >= cross) continue; cc = c + 1; }
      if (!occ.has(key(a, b))) { land(a, b, cc, d, nx); continue; }
      if (!blocked(g, a, b, a + dx, b + dy) && !occ.has(key(a + dx, b + dy))) { land(a + dx, b + dy, cc, d, nx); continue; }
      for (const [px, py] of dx ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) if (!blocked(g, a, b, a + px, b + py)) land(a + px, b + py, cc, d, nx);
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
/* Можно ли повернуть стену i на 90° вокруг её центра. */
export function rotateLegal(g, i) {
  const w = g.walls[i]; if (!w) return { ok: false, why: 'Такой стены нет' };
  const from = w.o === 'h' ? g.H : g.V, k = key(w.x, w.y), o = w.o === 'h' ? 'v' : 'h';
  from.delete(k); const r = wallLegal(g, o, w.x, w.y); from.add(k);
  return r;
}

/* Что доступно текущему игроку прямо сейчас. */
export function options(g) {
  const p = cur(g), none = { move: false, wall: false, card: false, brk: false, rot: false, any: false };
  if (g.over || g.t.ended) return none;
  const move = reach(g, p).size > 0;
  const wall = p.walls > 0 && (g.t.freeWalls > 0 || ((g.ap >= 1 || g.t.masonFree) && g.t.wallsPlaced < wallLimit(p) && !(RULES.runnerNoWall && g.t.ranFree)));
  const card = g.t.cardsPlayed < cardLimit(p) && p.hand.length > 0;
  const brk = p.role === 'sapper' && g.ap >= RULES.sapperCost && !(p.sapCd > 0) && g.walls.length > 0;
  const rot = p.role === 'architect' && g.ap >= RULES.architectCost && !g.t.rotated && g.walls.length > 0;
  return { move, wall, card, brk, rot, any: move || wall || card || brk || rot };
}

const bad = (err) => ({ ok: false, err });
function autoEnd(g, rng) { if (!g.over && !g.t.ended && !options(g).any) endTurn(g, rng); }

function removeWall(g, i) { const w = g.walls[i]; (w.o === 'h' ? g.H : g.V).delete(key(w.x, w.y)); g.walls.splice(i, 1); return w; }
function rotateWall(g, i) { const w = g.walls[i]; (w.o === 'h' ? g.H : g.V).delete(key(w.x, w.y)); w.o = w.o === 'h' ? 'v' : 'h'; (w.o === 'h' ? g.H : g.V).add(key(w.x, w.y)); return w; }

export function act(g, a, rng = Math.random) {
  if (g.over) return bad('Игра окончена');
  if (g.t.ended) return bad('Ход уже закончен');
  const p = cur(g);
  switch (a.t) {
    case 'move': {
      const r = reach(g, p).get(key(a.x, a.y));
      if (!r) return bad('Туда не дойти');
      let d = r.d;
      if (g.t.freeStep) { g.t.freeStep = false; g.t.ranFree = true; p.runCd = RULES.runnerEvery - 1; d--; }
      g.ap -= d;
      for (let c = r.c; c > 0; c--) { if (g.t.cross > 0) g.t.cross--; else p.ghostCd = 3; }
      const from = [p.x, p.y]; p.x = a.x; p.y = a.y;
      log(g, `${p.name} прошёл ${r.d} кл.${r.c ? ' сквозь стену' : ''}`, p.i);
      fx(g, 'move', { p: p.i, from, to: [p.x, p.y], steps: r.d });
      if (atGoal(g, p)) {
        g.over = true; g.winner = p.i; g.phase = 'over'; g.t1 = Date.now();
        log(g, `${p.name} побеждает`, p.i); fx(g, 'win', { p: p.i });
        return { ok: true };
      }
      const bk = key(p.x, p.y), t = g.bonus[bk];
      if (t) {
        delete g.bonus[bk];
        if (t === 'wall') p.walls += 2;
        if (t === 'card') draw(g, p, rng);
        if (t === 'energy') g.ap += 1;
        log(g, `${p.name} взял «${BONUS[t]}»`, p.i); fx(g, 'bonus', { p: p.i, bonus: t, at: [p.x, p.y] });
      }
      break;
    }
    case 'wall': {
      if (p.walls <= 0) return bad('Стены закончились');
      const free = g.t.freeWalls > 0;
      if (!free && g.t.wallsPlaced >= wallLimit(p)) return bad(p.role === 'mason' ? 'Не больше двух стен за ход' : 'Не больше одной стены за ход');
      const masonFree = !free && g.t.masonFree;
      if (!free && !masonFree && g.ap < 1) return bad('Не хватает ОД');
      if (!free && RULES.runnerNoWall && g.t.ranFree) return bad('После бесплатного шага Бегун не строит');
      const lg = wallLegal(g, a.o, a.x, a.y);
      if (!lg.ok) return bad(lg.why);
      (a.o === 'h' ? g.H : g.V).add(key(a.x, a.y));
      g.walls.push({ o: a.o, x: a.x, y: a.y, owner: p.i }); p.walls--;
      if (free) g.t.freeWalls--; else { if (masonFree) { g.t.masonFree = false; p.masonCd = RULES.masonEvery - 1; } else g.ap--; g.t.wallsPlaced++; }
      log(g, `${p.name} поставил стену`, p.i); fx(g, 'wall', { p: p.i, o: a.o, x: a.x, y: a.y });
      break;
    }
    case 'card': {
      if (g.t.cardsPlayed >= cardLimit(p)) return bad(cardLimit(p) > 1 ? 'Не больше двух карт за ход' : 'Одна карта за ход');
      const c = Number.isInteger(a.c) ? p.hand[a.c] : null;
      if (!c) return bad('Нет такой карты');
      if (CARDS[c].target === 'wall' && !(Number.isInteger(a.i) && g.walls[a.i])) return bad('Выберите стену');
      if (c === 'turn') { const lg = rotateLegal(g, a.i); if (!lg.ok) return bad(lg.why); }
      p.hand.splice(a.c, 1); g.discard.push(c); g.t.cardsPlayed++;
      let w = null;
      if (c === 'dash') g.ap += 1;
      if (c === 'phase') g.t.cross += 1;
      if (c === 'masonry') g.t.freeWalls += 1;
      if (c === 'freeze') g.players[(g.turn + 1) % g.n].frozen += 1;
      if (c === 'demolish') w = removeWall(g, a.i);
      if (c === 'turn') w = rotateWall(g, a.i);
      log(g, `${p.name} сыграл «${CARDS[c].name}»`, p.i);
      fx(g, 'card', { p: p.i, card: c, ...(w ? { o: w.o, x: w.x, y: w.y } : {}) });
      break;
    }
    case 'break': {
      if (p.role !== 'sapper') return bad('Ломать стены умеет только Сапёр');
      if (g.ap < RULES.sapperCost) return bad(`Нужно ${RULES.sapperCost} ОД`);
      if (p.sapCd > 0) return bad('Снос ещё перезаряжается');
      if (!(Number.isInteger(a.i) && g.walls[a.i])) return bad('Такой стены нет');
      const w = removeWall(g, a.i); g.ap -= RULES.sapperCost;
      if (RULES.sapperRefund) p.walls++;
      p.sapCd = RULES.sapperEvery;
      log(g, `${p.name} сломал стену`, p.i); fx(g, 'break', { p: p.i, o: w.o, x: w.x, y: w.y });
      break;
    }
    case 'rotate': {
      if (p.role !== 'architect') return bad('Поворачивать стены умеет только Архитектор');
      if (g.ap < RULES.architectCost) return bad('Не хватает ОД');
      if (g.t.rotated) return bad('Поворот — раз за ход');
      const lg = rotateLegal(g, a.i); if (!lg.ok) return bad(lg.why);
      const w = rotateWall(g, a.i); g.ap -= RULES.architectCost; g.t.rotated = true;
      log(g, `${p.name} повернул стену`, p.i); fx(g, 'rotate', { p: p.i, o: w.o, x: w.x, y: w.y });
      break;
    }
    case 'end':
      log(g, `${p.name} закончил ход`, p.i);
      endTurn(g, rng); return { ok: true };
    default:
      return bad('Неизвестное действие');
  }
  autoEnd(g, rng);
  return { ok: true };
}

/* ======================== ИИ ========================
   Бот планирует весь ход: лучевой поиск по цепочкам действий (шаги, стены, карты, способность роли)
   глубиной до четырёх действий, на каждом уровне оставляя лучшие ветви. Позиция оценивается
   по разнице кратчайших путей до цели (стандартный подход для Quoridor) плюс ресурсы:
   стены и карты в запасе. Стены рассматриваются только те, что перерезают путь лидеров.
   Уровни: easy — жадный выбор по одному действию с шумом; normal — планирование хода (≈77–79% против easy).
   Проверено турнирами и не дало устойчивого прироста: более широкий и глубокий поиск (44–58% против normal
   в разных прогонах) и штраф за уязвимый маршрут, поэтому в код они не вошли. */
export const BOT_LEVELS = ['easy', 'normal'];
const WIN = 10000;

/* Настройки оценки (подобраны турнирами ботов, см. test/bench.js). */
export const AI = { wall: [0.3, 1, 1.8], card: 2.5, beam: 5, depth: 4 };

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
/* Оценка позиции после хода игрока me — в «десятых долях хода». */
function evaluate(g, me) {
  if (atGoal(g, me)) return WIN;
  let lead = Infinity;
  for (const q of g.players) if (q !== me) lead = Math.min(lead, dist(g, q));
  const lt = lead / AP, wv = AI.wall[lt <= 1.5 ? 0 : lt <= 3 ? 1 : 2];
  return 10 * (lead - dist(g, me)) / AP + wv * me.walls + AI.card * me.hand.length;
}

/* Лёгкая копия состояния для перебора (без журнала и эффектов). */
function cloneSim(g) {
  const c = { ...g, sim: true, players: g.players.map((p) => ({ ...p, hand: p.hand.slice() })), walls: g.walls.map((w) => ({ ...w })),
    bonus: { ...g.bonus }, t: { ...g.t }, deck: [], discard: [], log: [], fx: [] };
  return rebuild(c);
}

/* Разумные действия для перебора. */
function candidates(g) {
  const p = cur(g), o = options(g), acts = [];
  if (o.move) reach(g, p).forEach((r, k) => { const [x, y] = k.split(',').map(Number); acts.push({ t: 'move', x, y }); });
  if (o.wall) acts.push(...wallCandidates(g, g.players.filter((q) => q !== p).sort((a, b) => dist(g, a) - dist(g, b)).slice(0, 2)));
  const recent = g.walls.map((w, i) => i).slice(-12); // цели для сноса и поворота
  if (o.card) p.hand.forEach((c, ci) => {
    if (p.hand.indexOf(c) !== ci) return; // одинаковые карты не перебираем дважды
    if (CARDS[c].target === 'wall') { for (const i of recent) if (c !== 'turn' || rotateLegal(g, i).ok) acts.push({ t: 'card', c: ci, i }); }
    else acts.push({ t: 'card', c: ci });
  });
  if (o.brk) for (const i of recent) acts.push({ t: 'break', i });
  if (o.rot) for (const i of recent) if (rotateLegal(g, i).ok) acts.push({ t: 'rotate', i });
  acts.push({ t: 'end' });
  return acts;
}

/* Лучевой поиск по цепочкам действий в пределах одного хода. Возвращает первое действие лучшей цепочки. */
function planTurn(g, rng) {
  const me = g.turn;
  let frontier = [{ s: cloneSim(g), first: null }];
  const finals = [];
  for (let depth = 0; depth < AI.depth && frontier.length; depth++) {
    const next = [];
    for (const node of frontier) for (const a of candidates(node.s)) {
      const s = cloneSim(node.s);
      if (!act(s, a, rng).ok) continue;
      const item = { first: node.first || a, s, v: evaluate(s, s.players[me]) + rng() * 0.3 };
      (s.over || s.t.ended ? finals : next).push(item);
    }
    next.sort((a, b) => b.v - a.v);
    frontier = next.slice(0, AI.beam);
  }
  finals.push(...frontier);
  let top = null;
  for (const f of finals) if (!top || f.v > top.v) top = f;
  return top ? top.first : { t: 'end' };
}

export function botAct(g, rng = Math.random, level = 'normal') {
  if (level === 'easy') return greedyAct(g, rng);
  return planTurn(g, rng);
}

/* Лёгкий уровень: по одному действию, без планирования хода, с заметным шумом. */
function greedyAct(g, rng) {
  const me = g.turn;
  let best = null;
  for (const a of candidates(g)) {
    if (a.t === 'card' && rng() < 0.6) continue; // новичок редко вспоминает про карты
    const s = cloneSim(g);
    if (!act(s, a, rng).ok) continue;
    const v = evaluate(s, s.players[me]) + rng() * 8 - (a.t === 'end' ? 3 : 0);
    if (!best || v > best.v) best = { v, a };
  }
  return best ? best.a : { t: 'end' };
}
