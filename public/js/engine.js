// Чистые правила WALL DUEL. Работает и в Node (сервер), и в браузере (клиент).
//
// Ход — три слота: один ШАГ, одна СТЕНА и одна КАРТА, в любом порядке, любой можно пропустить.
// Когда делать больше нечего, ход заканчивается сам. Через соседнюю фишку можно перепрыгнуть,
// а если за ней стена — обойти по диагонали.
// Роли — постоянные свойства игрока (своя механика, которой нет у карт); карты — разовые приёмы.
// Подробно — docs/game-design.md.
export const SIZES = [7, 9, 11];
export const COLORS = ['#E5482E', '#2F6BD8', '#EFAA14', '#12946A'];
export const ORDER = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
/* Числа баланса подобраны турнирами ботов (test/bench.js, docs/game-design.md).
   firstWall — может ли самый первый ход партии ставить стену (компенсация темпа первого игрока);
   walls — запас стен на игрока по размеру поля, в партии на 3–4 его делят по коэффициенту share;
   roleWalls — поправка запаса стен для роли (главный рычаг баланса ролей);
   sapperSlot, architectTrade, ghostCost, gambler* — варианты свойств ролей, которые сравнивались турнирами. */
export const RULES = { firstWall: false, walls: { 7: 7, 9: 10, 11: 13 }, share: { 2: 1, 3: 0.8, 4: 0.6 },
  roleWalls: { runner: 3, architect: 4, ghost: -1, mason: -1, sapper: 0, gambler: 0 },
  sapperSlot: false, sapperRefund: true, masonSturdy: true, architectTrade: false, ghostCost: 1, gamblerHand: 3, gamblerDraw: 2, gamblerEvery: 2, reserve: 2,
  // карты редкие: новая карта раз в drawEvery своих ходов, в колоде мало карт против стен — стены решают исход
  drawEvery: 2, startHand: 2, deck: { dash: 3, demolish: 2, turn: 2, shift: 2, freeze: 3, reserve: 3 } };
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
export const key = (x, y) => x + ',' + y;

/* Карты — разовые приёмы, ни одна не повторяет свойство роли. target — карта применяется к стене на поле. */
export const CARDS = {
  dash: { name: 'Рывок', text: 'Ещё один шаг в этот ход' },
  demolish: { name: 'Снос', text: 'Убрать любую стену', target: 'wall' },
  turn: { name: 'Поворот', text: 'Повернуть стену на 90°', target: 'wall' },
  shift: { name: 'Смещение', text: 'Переставить фишку на любую свободную клетку своего ряда', target: 'cell' },
  freeze: { name: 'Заморозка', text: 'Следующий игрок не сможет шагнуть в свой ход' },
  reserve: { name: 'Запас', text: '+2 стены в запас' },
};
/* Роли — постоянные свойства, действуют всю партию. Каждая меняет одно правило игры. */
export const ROLES = {
  runner: { name: 'Бегун', text: 'Может сделать второй шаг вместо стены' },
  architect: { name: 'Архитектор', text: 'Ставит две стены за ход' },
  ghost: { name: 'Призрак', text: 'Может шагнуть сквозь стену вместо своей стены в этом ходу (тратит стену из запаса)' },
  mason: { name: 'Каменщик', text: 'Его стены нельзя снести, сломать или повернуть' },
  sapper: { name: 'Сапёр', text: 'Вместо стены может сломать стену рядом с собой и забрать её' },
  gambler: { name: 'Картёжник', text: 'Берёт по 2 карты, играет две за ход' },
};
export const BONUS = { wall: '+2 стены', card: '+карта', energy: '+шаг' };

/* Стороны: 0 — низ (идёт вверх), 1 — лево (вправо), 2 — верх (вниз), 3 — право (влево). */
export function startOf(n, side) { const h = (n - 1) / 2; return [[h, n - 1], [0, h], [h, 0], [n - 1, h]][side]; }
export function goalOf(n, side) { return [(x, y) => y === 0, (x, y) => x === n - 1, (x, y) => y === n - 1, (x, y) => x === 0][side]; }
export const atGoal = (g, p) => goalOf(g.size, p.side)(p.x, p.y);

const handLimit = (p) => (p.role === 'gambler' ? RULES.gamblerHand : 3);
export const cardLimit = (g) => g.t.cardCap;

export function rebuild(g) {
  g.H = new Map(); g.V = new Map(); // ключ стены → владелец
  for (const w of g.walls) (w.o === 'h' ? g.H : g.V).set(key(w.x, w.y), w.owner);
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
// роль сработала: счётчик для статистики и подсказка в журнале
function roleUsed(g, p) { p.roleUses = (p.roleUses || 0) + 1; }

export function newGame(seats, opts = {}, rng = Math.random) {
  const n = seats.length, order = ORDER[n], size = SIZES.includes(opts.size) ? opts.size : 9;
  const roles = opts.roles === false ? [] : shuffle(Object.keys(ROLES), rng);
  const stock = Math.round(RULES.walls[size] * RULES.share[n]);
  const g = {
    id: Date.now().toString(36) + Math.floor(rng() * 1e6).toString(36),
    t0: Date.now(), t1: null, n, size, turn: 0, phase: 'act', over: false, winner: null, turns: 0,
    t: null, walls: [], bonus: {}, deck: [], discard: [], log: [], fx: [], fxSeq: 0,
    players: seats.map((s, i) => {
      const [x, y] = startOf(size, order[i]), role = roles[i] || null;
      return { i, side: order[i], name: s.name, bot: !!s.bot, color: COLORS[i], x, y, role,
        walls: Math.max(0, stock + (RULES.roleWalls[role] || 0)), hand: [], frozen: false, roleUses: 0 };
    }),
  };
  for (const c of Object.keys(CARDS)) for (let k = 0; k < (RULES.deck[c] ?? 4); k++) g.deck.push(c);
  shuffle(g.deck, rng);
  rebuild(g);
  if (opts.bonus !== false) placeBonuses(g, rng);
  g.players.forEach((p) => { for (let k = 0; k < RULES.startHand; k++) draw(g, p, rng); });
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

/* Слоты нового хода игрока p: сколько шагов, стен и карт ему можно. */
export function freshTurn(g, p) {
  const first = g.turns === 0;
  return { steps: 0, stepCap: p.frozen ? 0 : 1, walls: 0, wallCap: first && !RULES.firstWall ? 0 : 1,
    cards: 0, cardCap: p.role === 'gambler' ? 2 : 1, broke: 0 };
}
function startTurn(g, rng) {
  const p = cur(g);
  // свой номер хода игрока: 0, 1, 2… — карта приходит на каждом drawEvery-м
  const own = Math.floor(g.turns / g.n);
  if (p.role === 'gambler') { if (own % RULES.gamblerEvery === 0) for (let k = 0; k < RULES.gamblerDraw; k++) draw(g, p, rng); }
  else if (own > 0 && own % RULES.drawEvery === 0) draw(g, p, rng);
  g.t = freshTurn(g, p);
  if (p.frozen) { log(g, `${p.name} заморожен: в этот ход без шага`, p.i); fx(g, 'frozen', { p: p.i }); }
  p.frozen = false;
}

export function endTurn(g, rng = Math.random) {
  if (g.sim) { g.t.ended = true; return; } // при переборе ходов бот смотрит только свой ход
  g.turns++;
  g.turn = (g.turn + 1) % g.n;
  startTurn(g, rng);
}

/* ---------- геометрия ---------- */
const outside = (g, x, y) => x < 0 || y < 0 || x >= g.size || y >= g.size;
/* Владельцы стен, перекрывающих проход между соседними клетками. */
function wallsOn(g, x, y, nx, ny) {
  const out = [];
  if (nx === x) { const t = Math.min(y, ny); for (const k of [key(x, t), key(x - 1, t)]) if (g.H.has(k)) out.push(g.H.get(k)); }
  else { const l = Math.min(x, nx); for (const k of [key(l, y), key(l, y - 1)]) if (g.V.has(k)) out.push(g.V.get(k)); }
  return out;
}
export function blocked(g, x, y, nx, ny) { return outside(g, nx, ny) || wallsOn(g, x, y, nx, ny).length > 0; }
export const blockedFor = (g, p, x, y, nx, ny) => blocked(g, x, y, nx, ny);

/* Кратчайший путь до цели в клетках (фишки не мешают — их можно перепрыгнуть). */
export function dist(g, p) {
  const goal = goalOf(g.size, p.side);
  let fr = [[p.x, p.y]]; const seen = new Set([key(p.x, p.y)]); let d = 0;
  while (fr.length) {
    for (const [x, y] of fr) if (goal(x, y)) return d;
    const nx = [];
    for (const [x, y] of fr) for (const [dx, dy] of DIRS) {
      const a = x + dx, b = y + dy;
      if (blockedFor(g, p, x, y, a, b)) continue;
      const k = key(a, b); if (seen.has(k)) continue;
      seen.add(k); nx.push([a, b]);
    }
    fr = nx; d++;
  }
  return Infinity;
}

/* Сколько шагов и проходов сквозь стену осталось в этом ходу.
   Призрак может пройти сквозь стену, пока в этом ходу не ставил стену: проход займёт её слот. */
export function stepBudget(g) {
  if (g.over) return 0;
  // Бегун: пока стена не поставлена, может потратить её слот на второй шаг
  const extra = cur(g).role === 'runner' && g.t.walls === 0 && g.t.wallCap > 0 && g.t.stepCap > 0 ? 1 : 0;
  return Math.max(0, g.t.stepCap + extra - g.t.steps);
}
/* Сколько стен ещё можно в этом ходу. Архитектор, пока не шагал, может потратить слот шага на вторую стену. */
export function wallBudget(g) {
  // Архитектор: вторая стена — либо просто бонус, либо (architectTrade) вместо шага
  const extra = cur(g).role === 'architect' && g.t.wallCap > 0 && (!RULES.architectTrade || (g.t.steps === 0 && g.t.stepCap > 0)) ? 1 : 0;
  return Math.max(0, g.t.wallCap + extra - g.t.walls);
}
export function crossBudget(g, p = cur(g)) { return p.role === 'ghost' && wallBudget(g) > 0 && p.walls >= RULES.ghostCost ? 1 : 0; }

/* Куда можно дойти: клетка → { d: шагов, c: проходов сквозь стену }. Соседнюю фишку можно перепрыгнуть
   (один шаг), а если за ней стена или край — обойти по диагонали. Бегун шагает и по диагонали. */
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
  const bl = (x, y, a, b) => blockedFor(g, p, x, y, a, b);
  for (let d = 1; d <= max; d++) {
    const nx = [];
    for (const [x, y, c] of fr) {
      for (const [dx, dy] of DIRS) {
        const a = x + dx, b = y + dy;
        if (outside(g, a, b)) continue;
        let cc = c;
        if (bl(x, y, a, b)) { if (c >= cross) continue; cc = c + 1; }
        if (!occ.has(key(a, b))) { land(a, b, cc, d, nx); continue; }
        if (!bl(a, b, a + dx, b + dy) && !occ.has(key(a + dx, b + dy))) { land(a + dx, b + dy, cc, d, nx); continue; }
        for (const [px, py] of dx ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) if (!bl(a, b, a + px, b + py)) land(a + px, b + py, cc, d, nx);
      }
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
export function wallLegal(g, o, x, y, owner = g.turn) {
  if (!wallFree(g, o, x, y)) return { ok: false, why: 'Стены пересекаются' };
  const set = o === 'h' ? g.H : g.V; set.set(key(x, y), owner);
  const ok = g.players.every((p) => dist(g, p) < Infinity);
  set.delete(key(x, y));
  return ok ? { ok: true } : { ok: false, why: 'Нельзя полностью закрывать путь к цели' };
}
/* Стены Каменщика нерушимы: их нельзя снести, повернуть или сломать. */
export const sturdy = (g, i) => { const w = g.walls[i]; return !!w && RULES.masonSturdy && g.players[w.owner]?.role === 'mason'; };
/* Можно ли повернуть стену i на 90° вокруг её центра. */
export function rotateLegal(g, i) {
  const w = g.walls[i]; if (!w) return { ok: false, why: 'Такой стены нет' };
  if (sturdy(g, i)) return { ok: false, why: 'Стены Каменщика не поворачиваются' };
  const from = w.o === 'h' ? g.H : g.V, k = key(w.x, w.y), o = w.o === 'h' ? 'v' : 'h';
  from.delete(k); const r = wallLegal(g, o, w.x, w.y, w.owner); from.set(k, w.owner);
  return r;
}
/* Касается ли стена i клетки, где стоит игрок p (Сапёр ломает только такие). */
export function wallNear(g, i, p = cur(g)) {
  const w = g.walls[i];
  return !!w && (w.x === p.x || w.x + 1 === p.x) && (w.y === p.y || w.y + 1 === p.y);
}
/* Клетки для «Смещения»: свободные клетки в ряду игрока поперёк его пути (для идущих вверх-вниз — та же строка). */
export function shiftCells(g, p = cur(g)) {
  const occ = new Set(g.players.map((q) => key(q.x, q.y))), out = [];
  for (let k = 0; k < g.size; k++) {
    const [x, y] = p.side % 2 === 0 ? [k, p.y] : [p.x, k];
    if (!occ.has(key(x, y))) out.push([x, y]);
  }
  return out;
}
/* Можно ли сыграть карту c прямо сейчас (с целью — есть ли подходящая стена или клетка). */
function cardPlayable(g, c) {
  if (c === 'demolish') return g.walls.some((w, i) => !sturdy(g, i));
  if (c === 'turn') return g.walls.some((w, i) => rotateLegal(g, i).ok);
  if (c === 'shift') return shiftCells(g).length > 0;
  return true;
}

/* Что доступно текущему игроку прямо сейчас. */
export function options(g) {
  const p = cur(g), none = { move: false, wall: false, card: false, brk: false, any: false };
  if (g.over || g.t.ended) return none;
  const move = stepBudget(g) > 0 && reach(g, p).size > 0;
  const wallSlot = wallBudget(g) > 0;
  const wall = wallSlot && p.walls > 0;
  const card = g.t.cards < g.t.cardCap && p.hand.some((c) => cardPlayable(g, c));
  const brkSlot = RULES.sapperSlot ? !g.t.broke : wallSlot;
  const brk = brkSlot && p.role === 'sapper' && g.walls.some((w, i) => wallNear(g, i, p) && !sturdy(g, i));
  return { move, wall, card, brk, any: move || wall || card || brk };
}

const bad = (err) => ({ ok: false, err });
function autoEnd(g, rng) { if (!g.over && !g.t.ended && !options(g).any) endTurn(g, rng); }

function removeWall(g, i) { const w = g.walls[i]; (w.o === 'h' ? g.H : g.V).delete(key(w.x, w.y)); g.walls.splice(i, 1); return w; }
function rotateWall(g, i) { const w = g.walls[i]; (w.o === 'h' ? g.H : g.V).delete(key(w.x, w.y)); w.o = w.o === 'h' ? 'v' : 'h'; (w.o === 'h' ? g.H : g.V).set(key(w.x, w.y), w.owner); return w; }

export function act(g, a, rng = Math.random) {
  if (g.over) return bad('Игра окончена');
  if (g.t.ended) return bad('Ход уже закончен');
  const p = cur(g);
  switch (a.t) {
    case 'move': {
      if (stepBudget(g) <= 0) return bad(g.t.stepCap ? 'Шаг в этом ходу уже сделан' : 'Вы заморожены: в этот ход без шага');
      const r = reach(g, p).get(key(a.x, a.y));
      if (!r) return bad('Туда не дойти');
      g.t.steps += r.d;
      if (r.c) { g.t.walls = g.t.wallCap; p.walls -= RULES.ghostCost; } // Призрак прошёл сквозь стену — вместо стены в этом ходу
      // второй шаг Бегуна занял слот стены
      if (p.role === 'runner' && g.t.steps > g.t.stepCap) { g.t.walls = g.t.wallCap; roleUsed(g, p); }
      if (r.c) roleUsed(g, p);
      const from = [p.x, p.y]; p.x = a.x; p.y = a.y;
      log(g, `${p.name} шагнул${r.c ? ' сквозь стену' : ''}`, p.i);
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
        if (t === 'energy') g.t.stepCap += 1;
        log(g, `${p.name} взял «${BONUS[t]}»`, p.i); fx(g, 'bonus', { p: p.i, bonus: t, at: [p.x, p.y] });
      }
      break;
    }
    case 'wall': {
      if (p.walls <= 0) return bad('Стены закончились');
      if (wallBudget(g) <= 0) return bad(g.t.wallCap ? 'Стена в этом ходу уже поставлена' : 'В самый первый ход партии стену не ставят');
      const lg = wallLegal(g, a.o, a.x, a.y);
      if (!lg.ok) return bad(lg.why);
      (a.o === 'h' ? g.H : g.V).set(key(a.x, a.y), p.i);
      g.walls.push({ o: a.o, x: a.x, y: a.y, owner: p.i }); p.walls--; g.t.walls++;
      // вторая стена Архитектора заняла слот шага
      if (g.t.walls > g.t.wallCap) { if (RULES.architectTrade) g.t.steps = g.t.stepCap; roleUsed(g, p); }
      log(g, `${p.name} поставил стену`, p.i); fx(g, 'wall', { p: p.i, o: a.o, x: a.x, y: a.y });
      break;
    }
    case 'card': {
      if (g.t.cards >= g.t.cardCap) return bad(g.t.cardCap > 1 ? 'Карты на этот ход кончились' : 'Одна карта за ход');
      const c = Number.isInteger(a.c) ? p.hand[a.c] : null;
      if (!c) return bad('Нет такой карты');
      if (CARDS[c].target === 'wall' && !(Number.isInteger(a.i) && g.walls[a.i])) return bad('Выберите стену');
      if (c === 'shift' && !shiftCells(g, p).some(([x, y]) => x === a.x && y === a.y)) return bad('Сместиться можно только по своему ряду на свободную клетку');
      if (c === 'demolish' && sturdy(g, a.i)) return bad('Стены Каменщика не сносятся');
      if (c === 'turn') { const lg = rotateLegal(g, a.i); if (!lg.ok) return bad(lg.why); }
      p.hand.splice(a.c, 1); g.discard.push(c); g.t.cards++;
      if (g.t.cards === 2) roleUsed(g, p); // вторая карта за ход — свойство Картёжника
      let w = null;
      if (c === 'dash') g.t.stepCap += 1;
      if (c === 'shift') { const from = [p.x, p.y]; p.x = a.x; p.y = a.y; fx(g, 'move', { p: p.i, from, to: [p.x, p.y], steps: 1 }); }
      if (c === 'freeze') g.players[(g.turn + 1) % g.n].frozen = true;
      if (c === 'reserve') p.walls += RULES.reserve;
      if (c === 'demolish') w = removeWall(g, a.i);
      if (c === 'turn') w = rotateWall(g, a.i);
      log(g, `${p.name} сыграл «${CARDS[c].name}»`, p.i);
      fx(g, 'card', { p: p.i, card: c, ...(w ? { o: w.o, x: w.x, y: w.y } : {}) });
      break;
    }
    case 'break': {
      if (p.role !== 'sapper') return bad('Ломать стены умеет только Сапёр');
      if (RULES.sapperSlot ? g.t.broke : wallBudget(g) <= 0) return bad(RULES.sapperSlot ? 'Сломать стену можно раз за ход' : 'В этом ходу стена уже была — сломать можно вместо неё');
      if (!(Number.isInteger(a.i) && g.walls[a.i])) return bad('Такой стены нет');
      if (!wallNear(g, a.i, p)) return bad('Сапёр ломает только стену рядом с собой');
      if (sturdy(g, a.i)) return bad('Стены Каменщика не ломаются');
      const w = removeWall(g, a.i); if (RULES.sapperRefund) p.walls++; roleUsed(g, p);
      if (RULES.sapperSlot) g.t.broke = 1; else g.t.walls++;
      log(g, `${p.name} сломал стену`, p.i); fx(g, 'break', { p: p.i, o: w.o, x: w.x, y: w.y });
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

/* ======================== Запись и повтор партий ======================== */
// Версия правил в записях: поднимайте при любом изменении правил или RULES — старые повторы иначе разойдутся.
export const RULES_VERSION = 3;
// Детерминированный генератор (mulberry32): то же зерно и те же действия дают ту же партию.
export function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// В записи и повторе остаются только поля действия, остальное (подсказки бота и т. п.) отбрасывается.
export const cleanAction = (a) => { const o = { t: a.t }; for (const k of ['x', 'y', 'o', 'i', 'c']) if (a[k] !== undefined) o[k] = a[k]; return o; };
/* Пошаговый повтор записи { seed, opts, seats, actions: [[мс, место, действие]] }:
   g — партия, step() применяет следующее действие и возвращает false, если оно не прошло по правилам;
   rng — генератор в том же состоянии, что у оригинала, поэтому партию можно продолжить. */
export function replayer(rec, names = null) {
  const rng = seededRng(rec.seed);
  const g = newGame(rec.seats.map((s, i) => ({ name: names?.[i] || (s.bot ? `Бот ${i + 1}` : `Игрок ${i + 1}`), bot: !!s.bot })), rec.opts, rng);
  let k = 0;
  return {
    g, rng, get k() { return k; },
    step() {
      if (k >= rec.actions.length) return false;
      const [, seat, a] = rec.actions[k];
      if (g.over || g.turn !== seat || !act(g, cleanAction(a), rng).ok) return false;
      k++; return true;
    },
  };
}
/* Повтор первых upto действий; bad — номер первого действия, которое не прошло (-1, если все прошли). */
export function replay(rec, upto = Infinity) {
  const r = replayer(rec), n = Math.min(upto, rec.actions.length);
  while (r.k < n) if (!r.step()) return { g: r.g, bad: r.k };
  return { g: r.g, bad: -1 };
}

/* ======================== ИИ ========================
   Бот планирует весь ход: лучевой поиск по цепочкам действий (шаги, стены, карты, способность роли)
   глубиной до четырёх действий, на каждом уровне оставляя лучшие ветви. Позиция оценивается
   по разнице кратчайших путей до цели (стандартный подход для Quoridor) плюс ресурсы:
   стены и карты в запасе. Стены рассматриваются только те, что перерезают путь лидеров.
   Уровни: easy — жадный выбор по одному действию с шумом; normal — планирование своего хода (63% против easy);
   hard — то же плюс проверка лучшего ответа соперника на каждый из лучших вариантов (79% против normal на 9×9).
   Бот не видит чужие руки: при расчёте ответа рука соперника считается пустой. */
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
const WIN = 10000;

/* Настройки оценки (подобраны турнирами ботов, см. test/bench.js). */
export const AI = { wall: [0.3, 1, 1.8], card: 2.5, beam: 5, depth: 4,
  // сильный уровень: шире поиск своего хода, лучшие deepTop вариантов проверяются ответом соперника
  deepBeam: 6, deepTop: 6, replyBeam: 3, replyDepth: 3, replyBy: 'next', budgetMs: 400 };

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
  // за ход фишка проходит одну клетку, поэтому разница путей — это разница в ходах
  const wv = AI.wall[lead <= 1.5 ? 0 : lead <= 3 ? 1 : 2];
  return 10 * (lead - dist(g, me)) + wv * me.walls + AI.card * me.hand.length;
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
    if (CARDS[c].target === 'wall') { for (const i of recent) if (c === 'turn' ? rotateLegal(g, i).ok : !sturdy(g, i)) acts.push({ t: 'card', c: ci, i }); }
    else if (CARDS[c].target === 'cell') {
      // смещение: только две клетки ряда с самым коротким путём до цели
      const at = [p.x, p.y], scored = shiftCells(g, p).map(([x, y]) => { p.x = x; p.y = y; return { x, y, d: dist(g, p) }; });
      [p.x, p.y] = at;
      scored.sort((u, v) => u.d - v.d).slice(0, 2).forEach(({ x, y }) => acts.push({ t: 'card', c: ci, x, y }));
    }
    else acts.push({ t: 'card', c: ci });
  });
  if (o.brk) g.walls.forEach((w, i) => { if (wallNear(g, i, p) && !sturdy(g, i)) acts.push({ t: 'break', i }); });
  acts.push({ t: 'end' });
  return acts;
}

/* Лучевой поиск по цепочкам действий в пределах одного хода.
   Возвращает концы цепочек (позиция после хода и первое действие), лучшие — первыми. */
function searchTurn(g, rng, beam = AI.beam, depth = AI.depth, noise = 0.3, deadline = Infinity) {
  const me = g.turn;
  let frontier = [{ s: cloneSim(g), first: null }];
  const finals = [];
  for (let d = 0; d < depth && frontier.length; d++) {
    // время вышло — дальше не углубляемся, берём лучшее из найденного
    if (d > 0 && Date.now() > deadline) break;
    const next = [];
    for (const node of frontier) for (const a of candidates(node.s)) {
      const s = cloneSim(node.s);
      if (!act(s, a, rng).ok) continue;
      const item = { first: node.first || a, s, v: evaluate(s, s.players[me]) + rng() * noise };
      (s.over || s.t.ended ? finals : next).push(item);
    }
    next.sort((a, b) => b.v - a.v);
    frontier = next.slice(0, beam);
  }
  finals.push(...frontier);
  return finals.sort((a, b) => b.v - a.v);
}
function planTurn(g, rng) {
  const [top] = searchTurn(g, rng, AI.beam, AI.depth, 0.3, Date.now() + AI.budgetMs);
  return top ? top.first : { t: 'end' };
}

/* Позиция s после моего хода: ходит соперник who (без добора — его колода неизвестна). */
function replyStart(s, who) {
  const r = cloneSim(s);
  r.turn = who; r.turns++;
  const p = cur(r);
  p.hand = []; // чужую руку бот не знает и не подглядывает
  r.t = freshTurn(r, p); p.frozen = false;
  return r;
}
/* Сильный бот: для лучших вариантов своего хода проверяет лучший ответ следующего игрока
   и выбирает ход, после которого ему хуже всего навредят (минимакс на глубину одного хода соперника). */
function planDeep(g, rng) {
  const me = g.turn, t0 = Date.now();
  const mine = searchTurn(g, rng, AI.deepBeam, AI.depth, 0.05, t0 + AI.budgetMs / 2).slice(0, AI.deepTop);
  let best = null;
  for (const f of mine) {
    // не задерживаем партию: если время вышло, оставшиеся варианты не проверяем
    if (best && Date.now() - t0 > AI.budgetMs) break;
    let v;
    if (f.s.over) v = WIN;
    else {
      const r = replyStart(f.s, replier(f.s, me));
      const [reply] = searchTurn(r, rng, AI.replyBeam, AI.replyDepth, 0, t0 + AI.budgetMs);
      const after = reply ? reply.s : r;
      v = after.over && after.winner !== me ? -WIN : evaluate(after, after.players[me]);
    }
    if (!best || v > best.v) best = { v, a: f.first };
  }
  return best ? best.a : { t: 'end' };
}

/* Кто ответит: вдвоём — соперник, в партии на 3–4 — по AI.replyBy: следующий по очереди или самый опасный. */
function replier(s, me) {
  if (s.n === 2 || AI.replyBy === 'next') return (me + 1) % s.n;
  let who = -1, d = Infinity;
  for (const q of s.players) if (q.i !== me) { const k = dist(s, q); if (k < d) { d = k; who = q.i; } }
  return who;
}

export function botAct(g, rng = Math.random, level = 'normal') {
  if (level === 'easy') return greedyAct(g, rng);
  if (level === 'hard') return planDeep(g, rng);
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
