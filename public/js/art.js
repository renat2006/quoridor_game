// Графика WALL DUEL: единый мотив «клетки и стена». Контур тушью, плоский цвет, жёсткая тень.
// Всё — строки SVG; цвета берутся из CSS-переменных темы.
import * as E from './engine.js';

export const N = E.N, S = 56, GP = 10, PAD = 14, P = S + GP, VB = 612;
export const cx = (x) => PAD + x * P;
export const cy = (y) => PAD + y * P;
export const pv = (i) => `var(--p${i + 1})`;

/* Иконки: сетка 24, линия 1.75, скруглённые концы. Игровые иконки собраны из того же мотива,
   что и логотип: клетка (скруглённый квадрат) и стена (толстая черта). */
const IC = {
  move: '<rect x="2.5" y="8.5" width="7" height="7" rx="1.75" fill="currentColor"/><rect x="14.5" y="8.5" width="7" height="7" rx="1.75"/><path d="M10.5 12h2.5M11.5 10l2 2-2 2"/>',
  wall: '<rect x="2.5" y="6.5" width="7" height="11" rx="1.75"/><rect x="14.5" y="6.5" width="7" height="11" rx="1.75"/><rect x="11" y="3" width="2" height="18" rx="1" fill="currentColor" stroke="none"/>',
  break: '<rect x="2.5" y="6.5" width="7" height="11" rx="1.75"/><rect x="14.5" y="6.5" width="7" height="11" rx="1.75"/><rect x="11" y="2.5" width="2" height="6.5" rx="1" fill="currentColor" stroke="none"/><rect x="11" y="15" width="2" height="6.5" rx="1" fill="currentColor" stroke="none"/><path d="M10 12h.01M14 12h.01"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  plusWall: '<rect x="3.5" y="5" width="2.75" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="8.75" y="5" width="2.75" height="14" rx="1.4" fill="currentColor" stroke="none"/><path d="M17.5 8.5v7M14 12h7"/>',
  again: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19.5 4.5V8H16"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  freeze: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.8 4.8 12 6.8l2.2-2M9.8 19.2 12 17.2l2.2 2"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5h11l-2.5 4 2.5 4h-11"/>',
  people: '<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 19.5c.4-3 2.7-5 5.5-5s5.1 2 5.5 5M14.5 14.6c3 .1 5.6 1.8 6 4.9"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"/>',
  exit: '<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 8l4 4-4 4M18 12H9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  crown: '<path d="M4 17.5 5.5 8l4 4L12 6l2.5 6 4-4 1.5 9.5z"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8M9.5 13v1M14.5 13v1"/>',
  offline: '<path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10.2 16.5a3 3 0 0 1 3.6 0M4 4l16 16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  rotate: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M17.5 3v4h-4M6.5 21v-4h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrow: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  chat: '<path d="M5 18.5V6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H8z"/><path d="M9 9.5h6M9 12.5h4"/>',
};
export const icon = (n, size = 20, extra = '') => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${IC[n]}</svg>`;
export const BONUS_ICON = { wall: 'plusWall', again: 'again', freeze: 'freeze' };
/* Стрелка в сторону цели: сторона 0 идёт вверх, 1 вправо, 2 вниз, 3 влево. */
export const goalArrow = (side, size = 14) => icon('arrow', size, `style="transform:rotate(${side * 90}deg)"`);

export const logo = (size = 28) => `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true"><g stroke="var(--ink)" stroke-width="1.75"><rect x="3" y="3" width="11" height="11" rx="2.5"/><rect x="18" y="3" width="11" height="11" rx="2.5"/><rect x="3" y="18" width="11" height="11" rx="2.5"/><rect x="18" y="18" width="11" height="11" rx="2.5"/></g><rect x="2" y="14.5" width="28" height="3" rx="1.5" fill="var(--p1)" stroke="var(--ink)" stroke-width="1"/></svg>`;

export const trophy = (size = 88) => `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12 42h24" stroke="var(--ink)" stroke-width="1.75" stroke-linecap="round"/><rect x="18" y="34" width="12" height="8" rx="1.5" stroke="var(--ink)" stroke-width="1.75"/><path d="M24 28v6" stroke="var(--ink)" stroke-width="1.75"/><path d="M14 8h20v10a10 10 0 0 1-20 0z" fill="var(--win, var(--p1))" stroke="var(--ink)" stroke-width="1.75" stroke-linejoin="round"/><path d="M14 12H9a5 5 0 0 0 6 7M34 12h5a5 5 0 0 1-6 7" stroke="var(--ink)" stroke-width="1.75" stroke-linecap="round"/><circle cx="24" cy="16" r="3.5" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.75"/></svg>`;

/* Форма игрока (сетка 40). Форма важнее цвета: круг, квадрат, треугольник, ромб. */
function shapeBody(i, attrs) {
  return [
    `<circle cx="20" cy="20" r="13" ${attrs}/>`,
    `<rect x="7.5" y="7.5" width="25" height="25" rx="5" ${attrs}/>`,
    `<path d="M20 6.5 34 31.5H6z" ${attrs}/>`,
    `<path d="M20 4.5 35.5 20 20 35.5 4.5 20z" ${attrs}/>`,
  ][i % 4];
}
export function shape(i, size = 24, { ghost = false } = {}) {
  const a = ghost
    ? 'fill="none" stroke="var(--line-2)" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round"'
    : `fill="${pv(i)}" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"`;
  return `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${shapeBody(i, a)}</svg>`;
}

/* Фишка на поле, центр в (0,0): жёсткая тень снизу, заливка цветом, контур тушью, блик-штрих. */
export function pawnShape(i) {
  const sh = `transform="translate(-20 -17)"`, body = `transform="translate(-20 -20)"`;
  const f = `fill="${pv(i)}" stroke="var(--ink)" stroke-width="2.25" stroke-linejoin="round"`;
  const shadow = `fill="var(--hard)" stroke="var(--hard)" stroke-width="2.25" stroke-linejoin="round"`;
  const shine = ['<path d="M13 15a8 8 0 0 1 5-4" fill="none" stroke="var(--shine)" stroke-width="2.2" stroke-linecap="round"/>',
    '<path d="M12 13v-1.5a2 2 0 0 1 2-2h4" fill="none" stroke="var(--shine)" stroke-width="2.2" stroke-linecap="round"/>',
    '<path d="M17 14l2.5-4.3" fill="none" stroke="var(--shine)" stroke-width="2.2" stroke-linecap="round"/>',
    '<path d="M13 17l4-4" fill="none" stroke="var(--shine)" stroke-width="2.2" stroke-linecap="round"/>'][i % 4];
  return `<g ${sh}>${shapeBody(i, shadow)}</g><g ${body}>${shapeBody(i, f)}${shine}</g>`;
}

export const wallRect = (o, x, y) => (o === 'h' ? { x: cx(x), y: cy(y) + S, w: 2 * S + GP, h: GP } : { x: cx(x) + S, y: cy(y), w: GP, h: 2 * S + GP });

export const boardDefs = `<defs><pattern id="wd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-2)" stroke-width="1.5"/></pattern></defs>`;

/* Постоянный слой: ложе поля, клетки и цветные кромки «домов» игроков. */
export function boardBase(g) {
  let h = `<rect x="1" y="1" width="${VB - 2}" height="${VB - 2}" rx="18" fill="var(--board)" stroke="var(--ink)" stroke-width="2"/>`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h += `<rect class="cell" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="7"/>`;
  g.players.forEach((p) => {
    const b = [[60, 600, 492, 6], [6, 60, 6, 492], [60, 6, 492, 6], [600, 60, 6, 492]][p.side];
    h += `<rect x="${b[0]}" y="${b[1]}" width="${b[2]}" height="${b[3]}" rx="3" fill="${pv(p.i)}" stroke="var(--ink)" stroke-width="1.25"/>`;
  });
  return h;
}

/* Подсветка цели: только у того, кто ходит, чтобы поле не пестрело. */
export function goalLayer(g, i) {
  const p = g.players[i]; if (!p) return '';
  let h = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (E.SIDES[p.side].goal(x, y)) h += `<rect x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="7" fill="${pv(i)}" fill-opacity=".16"/>` +
      `<g transform="translate(${cx(x) + S / 2} ${cy(y) + S / 2}) rotate(${p.side * 90})" opacity=".55"><path d="M-6 3 0-3l6 6" fill="none" stroke="${pv(i)}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return h;
}

export function bonusLayer(g) {
  let h = '';
  for (const [k, t] of Object.entries(g.bonus)) {
    const [x, y] = k.split(',').map(Number);
    h += `<g class="bonus"><rect x="${cx(x) + 5}" y="${cy(y) + 5}" width="46" height="46" rx="5" fill="none" stroke="var(--ink-2)" stroke-width="1.25" stroke-dasharray="3.5 3"/>` +
      `<g transform="translate(${cx(x) + 13} ${cy(y) + 13}) scale(1.25)" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" color="var(--ink)">${IC[BONUS_ICON[t]]}</g></g>`;
  }
  return h;
}

/* Знак хозяина на стене — его форма в миниатюре. */
function wallMark(owner, r) {
  const mx = r.x + r.w / 2, my = r.y + r.h / 2, f = 'fill="var(--surface)"';
  switch (owner % 4) {
    case 0: return `<circle cx="${mx}" cy="${my}" r="2.2" ${f}/>`;
    case 1: return `<rect x="${mx - 2}" y="${my - 2}" width="4" height="4" rx=".6" ${f}/>`;
    case 2: return `<path d="M${mx} ${my - 2.6}l2.8 5h-5.6z" ${f}/>`;
    default: return `<path d="M${mx} ${my - 2.8}l2.8 2.8-2.8 2.8-2.8-2.8z" ${f}/>`;
  }
}
export function wallLayer(g, { fromIndex = 1e9, breakable = false } = {}) {
  let h = '';
  g.walls.forEach((w, i) => {
    const r = wallRect(w.o, w.x, w.y), hs = w.o === 'h' ? 'translate(0 2)' : 'translate(2 0)';
    h += `<g class="wallg${i >= fromIndex ? ' fresh' : ''}${breakable ? ' breakable' : ''}" data-wall="${i}">` +
      `<rect transform="${hs}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3.5" fill="var(--hard)"/>` +
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3.5" fill="${pv(w.owner)}" stroke="var(--ink)" stroke-width="1.75"/>${wallMark(w.owner, r)}` +
      (breakable ? `<rect class="brk" x="${r.x - 6}" y="${r.y - 6}" width="${r.w + 12}" height="${r.h + 12}" rx="8" fill="transparent" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"/>` : '') + '</g>';
  });
  return h;
}

/* Точки-пазы: где вообще может стоять стена (видны в режиме «Стена»). */
export function slotLayer() {
  let h = '';
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) h += `<circle cx="${cx(x) + S + GP / 2}" cy="${cy(y) + S + GP / 2}" r="2.6"/>`;
  return `<g class="wslots">${h}</g>`;
}

export function hintLayer(g, p, steps) {
  let h = '';
  steps.forEach((d, k) => {
    const [x, y] = k.split(',').map(Number), mx = cx(x) + S / 2, my = cy(y) + S / 2;
    h += `<g class="hint" data-cell="${k}" style="--c:${pv(p.i)}"><rect class="hit" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="7"/>` +
      `<circle cx="${mx}" cy="${my}" r="15"/><text x="${mx}" y="${my + .5}" text-anchor="middle" dominant-baseline="central">${d}</text></g>`;
  });
  return h;
}

export function previewLayer(w, ok, p) {
  const r = wallRect(w.o, w.x, w.y), mx = r.x + r.w / 2, my = r.y + r.h / 2, c = ok ? pv(p.i) : 'var(--danger)';
  return `<rect x="${r.x - 1}" y="${r.y - 1}" width="${r.w + 2}" height="${r.h + 2}" rx="4" fill="${c}" fill-opacity=".45" stroke="${c}" stroke-width="2" stroke-dasharray="5 3"/>` +
    `<circle cx="${mx}" cy="${my}" r="12" fill="${ok ? 'var(--ink)' : 'var(--danger)'}" stroke="var(--surface)" stroke-width="2"/>` +
    (ok ? `<path d="m${mx - 5} ${my + .5} 3.5 3.5 6.5-7" fill="none" stroke="var(--surface)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M${mx - 4} ${my - 4}l8 8M${mx + 4} ${my - 4}l-8 8" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/>`);
}

/* Узор «заморожен»: штриховка под фишкой и значок-снежинка. */
export function frozenMark() {
  return `<circle r="27" fill="url(#wd-hatch)" opacity=".5"/><g transform="translate(20 -21)"><circle r="10" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/><g transform="translate(-7 -7) scale(.58)" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round">${IC.freeze}</g></g>`;
}
export function pawnGroup(p, { turn = false, frozen = false, id = '' } = {}) {
  const x = cx(p.x) + S / 2, y = cy(p.y) + S / 2;
  return `<g class="pawn${turn ? ' turn' : ''}${frozen ? ' frozen' : ''}" ${id ? `id="${id}"` : ''} style="transform:translate(${x}px,${y}px)">` +
    `<g class="pawn-fx"><circle class="ring" r="26" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 4"/><g class="fz">${frozen ? frozenMark() : ''}</g><g class="pawn-body">${pawnShape(p.i)}</g></g></g>`;
}

/* Полностью статичное поле (обложка на главной, подложка победы). */
export function staticBoard(g, goalOf = -1) {
  return boardDefs + boardBase(g) + (goalOf >= 0 ? goalLayer(g, goalOf) : '') + bonusLayer(g) + wallLayer(g) + g.players.map((p) => pawnGroup(p, { frozen: p.skip > 0 })).join('');
}

export function demoGame() {
  const g = E.newGame([{ name: 'Ренат' }, { name: 'Алиса' }, { name: 'Марк' }, { name: 'Тихон' }], { bonus: false });
  const set = (i, x, y) => { g.players[i].x = x; g.players[i].y = y; };
  set(0, 4, 6); set(1, 2, 4); set(2, 4, 2); set(3, 6, 4);
  g.walls = [
    { o: 'h', x: 3, y: 4, owner: 1 }, { o: 'v', x: 4, y: 5, owner: 2 }, { o: 'h', x: 4, y: 1, owner: 0 }, { o: 'v', x: 1, y: 1, owner: 3 },
    { o: 'h', x: 0, y: 6, owner: 3 }, { o: 'v', x: 6, y: 2, owner: 0 }, { o: 'h', x: 5, y: 5, owner: 2 }, { o: 'v', x: 2, y: 0, owner: 1 },
  ];
  g.bonus = { '6,1': 'wall', '1,5': 'again', '6,6': 'freeze' };
  return g;
}
