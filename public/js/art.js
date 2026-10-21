// Графика «Бумага и тушь»: иконки, фишки, поле. Всё строки SVG, цвета через CSS-переменные темы.
import * as E from './engine.js';

export const N = E.N, S = 56, GP = 10, PAD = 14, P = S + GP, VB = 612;
export const cx = (x) => PAD + x * P;
export const cy = (y) => PAD + y * P;
export const pv = (i) => `var(--p${i + 1})`;

const IC = {
  walk: '<path d="M4 19h4v-4h4v-4h4V7h4"/>',
  wall: '<rect x="3" y="10.5" width="18" height="3" rx="1.5" fill="currentColor"/><path d="M5 4h5v4H5zM14 4h5v4h-5zM5 16h5v4H5zM14 16h5v4h-5z"/>',
  hammer: '<path d="M3 10.5h6l1.5 1.5L9 13.5H3z M21 10.5h-6l-1.5 1.5 1.5 1.5h6z M12 4v3M8 5.5l1.2 2M16 5.5l-1.2 2"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none"/>',
  flag: '<path d="M6 20V4 M6 5h10l-2 3.5 2 3.5H6"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z M15.5 9a4 4 0 0 1 0 6 M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z M16 9.5l5 5M21 9.5l-5 5"/>',
  exit: '<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10 M14 8l4 4-4 4 M18 12H9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  crown: '<path d="M4 17.5 5.5 8l4 4L12 6l2.5 6 4-4 1.5 9.5z"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9.5 13v1M14.5 13v1"/>',
  offline: '<path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10.2 16.5a3 3 0 0 1 3.6 0M4 4l16 16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  again: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  bonuswall: '<rect x="3" y="7" width="12" height="3" rx="1.5"/><rect x="3" y="14" width="12" height="3" rx="1.5"/><path d="M19 9v6M16 12h6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
export const icon = (n, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
export const BONUS_ICON = { wall: 'bonuswall', again: 'again', freeze: 'snow' };

export const logo = (size = 28, sw = 1.5) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2.5" stroke="var(--ink)" stroke-width="${sw}"/><rect x="18" y="3" width="11" height="11" rx="2.5" stroke="var(--ink)" stroke-width="${sw}"/><rect x="3" y="18" width="11" height="11" rx="2.5" stroke="var(--ink)" stroke-width="${sw}"/><rect x="18" y="18" width="11" height="11" rx="2.5" stroke="var(--ink)" stroke-width="${sw}"/><rect x="3" y="14.75" width="26" height="2.5" rx="1.25" fill="var(--p1)"/></svg>`;

export const trophy = (size = 88) => `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12 42h24" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round"/><rect x="18" y="34" width="12" height="8" rx="1.5" stroke="var(--ink)" stroke-width="1.5"/><path d="M24 28v6" stroke="var(--ink)" stroke-width="1.5"/><path d="M14 8h20v10a10 10 0 0 1-20 0z" fill="var(--p1)" stroke="var(--stroke)" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 12H9a5 5 0 0 0 6 7M34 12h5a5 5 0 0 1-6 7" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round"/><circle cx="24" cy="16" r="3.5" fill="var(--surface)" stroke="var(--stroke)" stroke-width="1.5"/></svg>`;

/* Фишка-значок на сетке 40: форма важнее цвета (круг, квадрат, треугольник, ромб). */
export function shape(i, size = 24, sw = 1.75, extra = '') {
  const f = `fill="${pv(i)}" stroke="var(--stroke)" stroke-width="${sw}" stroke-linejoin="round"`;
  const body = [
    `<circle cx="20" cy="20" r="13" ${f}/>`,
    `<rect x="7.5" y="7.5" width="25" height="25" rx="4" ${f}/>`,
    `<polygon points="20,5.5 35,32 5,32" ${f}/>`,
    `<polygon points="20,4.5 35.5,20 20,35.5 4.5,20" ${f}/>`,
  ][i % 4];
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" ${extra}>${body}</svg>`;
}

/* Фишка на поле: центр в (0,0), тень сдвинута вниз (лежит на столе). */
export function pawnShape(i) {
  const f = `fill="${pv(i)}" stroke="var(--stroke)" stroke-width="2" stroke-linejoin="round"`;
  const sh = 'fill="var(--stroke)" fill-opacity=".18"';
  switch (i % 4) {
    case 0: return `<circle cx="0" cy="3" r="17" ${sh}/><circle r="17" ${f}/>`;
    case 1: return `<rect x="-17" y="-14" width="34" height="34" rx="5" ${sh}/><rect x="-17" y="-17" width="34" height="34" rx="5" ${f}/>`;
    case 2: return `<polygon points="0,-15 20,22 -20,22" ${sh}/><polygon points="0,-18 20,18 -20,18" ${f}/>`;
    default: return `<polygon points="0,-17 20,3 0,23 -20,3" ${sh}/><polygon points="0,-20 20,0 0,20 -20,0" ${f}/>`;
  }
}
/* Узор «заморожен»: штриховка под фишкой и значок-снежинка. */
export function frozenMark() {
  return `<circle r="27" fill="url(#wd-hatch)" opacity=".45"/><circle cx="20" cy="-20" r="10" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.25"/><g transform="translate(12.5 -27.5) scale(.625)" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round">${IC.snow}</g>`;
}

export const wallRect = (o, x, y) => (o === 'h' ? { x: cx(x), y: cy(y) + S, w: 2 * S + GP, h: GP } : { x: cx(x) + S, y: cy(y), w: GP, h: 2 * S + GP });

/* Знак хозяина на стене: та же форма, что у фишки, мелко цветом бумаги. */
function wallMark(owner, x, y, o) {
  const r = wallRect(o, x, y), mx = r.x + r.w / 2, my = r.y + r.h / 2, f = 'fill="var(--surface)"';
  switch (owner % 4) {
    case 0: return `<circle cx="${mx}" cy="${my}" r="2" ${f}/>`;
    case 1: return `<rect x="${mx - 2}" y="${my - 2}" width="4" height="4" ${f}/>`;
    case 2: return `<polygon points="${mx},${my - 2.5} ${mx + 2.8},${my + 2.5} ${mx - 2.8},${my + 2.5}" ${f}/>`;
    default: return `<polygon points="${mx},${my - 2.5} ${mx + 2.5},${my} ${mx},${my + 2.5} ${mx - 2.5},${my}" ${f}/>`;
  }
}

export const boardDefs = `<defs><pattern id="wd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-2)" stroke-width="1.5"/></pattern></defs>`;

/* Постоянный слой: ложе, клетки, цветные кромки домашних сторон, цель каждого игрока. */
export function boardBase(g) {
  let h = `<rect width="${VB}" height="${VB}" rx="16" fill="var(--sunk)"/>`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h += `<rect x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="6" fill="var(--surface)"/>`;
  g.players.forEach((p) => {
    const c = pv(p.i);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      if (E.SIDES[p.side].goal(x, y)) h += `<rect x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="6" fill="${c}" fill-opacity=".1"/>`;
    const bar = [[14, 603, 584, 4], [5, 14, 4, 584], [14, 5, 584, 4], [603, 14, 4, 584]][p.side];
    h += `<rect x="${bar[0]}" y="${bar[1]}" width="${bar[2]}" height="${bar[3]}" rx="2" fill="${c}"/>`;
  });
  return h;
}

export function bonusLayer(g) {
  let h = '';
  for (const [k, t] of Object.entries(g.bonus)) {
    const [x, y] = k.split(',').map(Number);
    h += `<rect x="${cx(x) + 4}" y="${cy(y) + 4}" width="48" height="48" rx="4" fill="none" stroke="var(--ink-2)" stroke-width="1.25" stroke-dasharray="3 3"/>` +
      `<g transform="translate(${cx(x) + 10} ${cy(y) + 10}) scale(1.1667)" fill="none" stroke="var(--ink-2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${IC[BONUS_ICON[t]]}</g>`;
  }
  return h;
}

export function wallLayer(g, { fromIndex = 1e9, breakable = false } = {}) {
  let h = '';
  g.walls.forEach((w, i) => {
    const r = wallRect(w.o, w.x, w.y);
    h += `<g class="wallg${i >= fromIndex ? ' fresh' : ''}${breakable ? ' breakable' : ''}" data-wall="${i}">` +
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="${pv(w.owner)}" stroke="var(--stroke)" stroke-width="1.5"/>${wallMark(w.owner, w.x, w.y, w.o)}</g>`;
    if (breakable) h += `<rect x="${r.x - 5}" y="${r.y - 5}" width="${r.w + 10}" height="${r.h + 10}" rx="6" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 3" pointer-events="none"/>`;
  });
  return h;
}

export function hintLayer(g, p, steps) {
  let h = '';
  steps.forEach((d, k) => {
    const [x, y] = k.split(',').map(Number), mx = cx(x) + S / 2, my = cy(y) + S / 2;
    h += `<g class="hint" data-cell="${k}" role="button" aria-label="Пойти на ${d}"><rect x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="6" fill="transparent"/>` +
      `<circle cx="${mx}" cy="${my}" r="14" fill="${pv(p.i)}" fill-opacity=".16"/><text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="central" class="mono hint-n">${d}</text></g>`;
  });
  return h;
}

export function previewLayer(w, ok, p) {
  const r = wallRect(w.o, w.x, w.y), mx = r.x + r.w / 2, my = r.y + r.h / 2, c = ok ? pv(p.i) : 'var(--danger)';
  return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="${c}" fill-opacity=".35" stroke="${c}" stroke-width="1.5" stroke-dasharray="4 3"/>` +
    `<circle cx="${mx}" cy="${my}" r="11" fill="${ok ? 'var(--ink)' : 'var(--danger)'}"/>` +
    (ok ? `<path d="m${mx - 5} ${my + .5} 3.5 3.5 6-7" fill="none" stroke="var(--surface)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="M${mx - 4} ${my - 4}l8 8M${mx + 4} ${my - 4}l-8 8" stroke="var(--surface)" stroke-width="1.75" stroke-linecap="round"/>`);
}

/* Группа фишки; ring — кольцо «ходит», frozen — штриховка. */
export function pawnGroup(p, { turn = false, frozen = false, id = '' } = {}) {
  const x = cx(p.x) + S / 2, y = cy(p.y) + S / 2;
  return `<g class="pawn${turn ? ' turn' : ''}${frozen ? ' frozen' : ''}" ${id ? `id="${id}"` : ''} style="transform:translate(${x}px,${y}px)">` +
    `<g class="pawn-fx"><g class="fz">${frozen ? frozenMark() : ''}</g><circle class="ring" r="25" fill="none" stroke="var(--ink)" stroke-width="2"/><g class="pawn-body">${pawnShape(p.i)}</g></g></g>`;
}

/* Полностью статичное поле (картинка на главной, подложка победы). */
export function staticBoard(g) {
  return boardDefs + boardBase(g) + bonusLayer(g) + wallLayer(g) + g.players.map((p) => pawnGroup(p, { frozen: p.skip > 0 })).join('');
}

/* Красивое демонстрационное поле для главной. */
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
