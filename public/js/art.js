// Графика WALL DUEL: интерфейс — «бумага и тушь», поле — деревянная доска.
// Всё — строки SVG; цвета берутся из CSS-переменных темы.
import * as E from './engine.js';

export const N = E.N, S = 56, GP = 10, PAD = 26, P = S + GP, VB = PAD * 2 + N * S + (N - 1) * GP; // 636
export const cx = (x) => PAD + x * P;
export const cy = (y) => PAD + y * P;
export const pv = (i) => `var(--p${i + 1})`;

/* Иконки: сетка 24, линия 1.75, скруглённые концы. Игровые иконки собраны из того же мотива,
   что и логотип: клетка (скруглённый квадрат) и стена (толстая черта). */
const IC = {
  move: '<circle cx="7" cy="6.25" r="2.5"/><path d="M3.75 19.5h6.5M4.75 19.5c0-3.2.85-6.4 2.25-8.75 1.4 2.35 2.25 5.55 2.25 8.75"/><path d="M13.5 12.5h7M17.5 9.5l3 3-3 3"/>',
  wall: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M3 14.5h18M12 4.5v5M7.5 9.5v5M16.5 9.5v5M12 14.5v5"/>',
  break: '<path d="M13.4 3.6l7 7-2.8 2.8-7-7z"/><path d="M12.9 8.9 4.3 17.5a1.7 1.7 0 0 0 2.4 2.4l8.6-8.6"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  plusWall: '<rect x="2.5" y="8" width="12.5" height="11.5" rx="1.75"/><path d="M2.5 11.85h12.5M2.5 15.65h12.5M8.75 8v3.85M5.75 11.85v3.8M11.75 11.85v3.8M8.75 15.65v3.85"/><path d="M19 3.5v6M16 6.5h6"/>',
  again: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.75 3.75V7.5H16"/><rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1.25"/>',
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
    : `fill="url(#wd-p${i})" style="stroke:${dark(i)}" stroke-width="1.75" stroke-linejoin="round"`;
  return `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${shapeBody(i, a)}</svg>`;
}

/* ====================== ПОЛЕ: деревянная доска ======================
   Рама из ореха, плитки клёна с фаской, бороздки для стен, процедурная текстура дерева.
   Фишки — точёные лакированные жетоны, стены — крашеные планки, бонусы — латунные медальоны. */
const mix = (i, pct, to) => `color-mix(in srgb,var(--p${i + 1}) ${pct}%,${to})`;
const light = (i) => mix(i, 55, '#fff'), dark = (i) => mix(i, 55, '#000');

export const wallRect = (o, x, y) => (o === 'h' ? { x: cx(x), y: cy(y) + S, w: 2 * S + GP, h: GP } : { x: cx(x) + S, y: cy(y), w: GP, h: 2 * S + GP });

/* Определения градиентов и фильтров вставляются в документ один раз (installDefs):
   если продублировать их в каждой доске, браузер возьмёт копию из скрытого экрана и не отрисует их. */
export const boardDefs = (() => {
  let d = `<defs>
  <linearGradient id="wd-frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6B4428"/><stop offset=".5" stop-color="#4E301B"/><stop offset="1" stop-color="#3A2313"/></linearGradient>
  <linearGradient id="wd-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1DEBC"/><stop offset="1" stop-color="#DEC196"/></linearGradient>
  <linearGradient id="wd-tile-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="wd-brass" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#FFF0BE"/><stop offset=".45" stop-color="#E2B657"/><stop offset="1" stop-color="#9A6E1F"/></radialGradient>
  <radialGradient id="wd-vignette" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
  <filter id="wd-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .16" numOctaves="3" seed="11"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .2  0 0 0 0 .1  0 0 0 1.1 -.42"/></filter>
  <filter id="wd-pshadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3.5" stdDeviation="2.6" flood-color="#1A0E05" flood-opacity=".55"/></filter>
  <filter id="wd-wshadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="1.4" flood-color="#1A0E05" flood-opacity=".6"/></filter>
  <filter id="wd-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <pattern id="wd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#CFE8FF" stroke-width="2"/></pattern>`;
  for (let i = 0; i < 4; i++) {
    d += `<radialGradient id="wd-p${i}" cx=".36" cy=".3" r=".8"><stop offset="0" style="stop-color:${light(i)}"/><stop offset=".5" style="stop-color:var(--p${i + 1})"/><stop offset="1" style="stop-color:${dark(i)}"/></radialGradient>` +
      `<linearGradient id="wd-wh${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${light(i)}"/><stop offset=".45" style="stop-color:var(--p${i + 1})"/><stop offset="1" style="stop-color:${dark(i)}"/></linearGradient>` +
      `<linearGradient id="wd-wv${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:${light(i)}"/><stop offset=".45" style="stop-color:var(--p${i + 1})"/><stop offset="1" style="stop-color:${dark(i)}"/></linearGradient>`;
  }
  return d + '</defs>';
})();

/* Постоянный слой: рама, ложе с бороздками, плитки, текстура и цветные инкрустации «домов». */
export function boardBase(g) {
  const E2 = VB - PAD + 4, inner = PAD - 6;
  let h = `<rect width="${VB}" height="${VB}" rx="24" fill="url(#wd-frame)"/>` +
    `<rect x="2" y="2" width="${VB - 4}" height="${VB - 4}" rx="22" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>` +
    `<rect x="${inner}" y="${inner}" width="${VB - inner * 2}" height="${VB - inner * 2}" rx="12" fill="#2A170A"/>` +
    `<rect x="${inner}" y="${inner}" width="${VB - inner * 2}" height="${VB - inner * 2}" rx="12" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2"/>`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const X = cx(x), Y = cy(y);
    h += `<rect x="${X}" y="${Y + 2}" width="${S}" height="${S}" rx="7" fill="#1C0F06" opacity=".7"/>` +
      `<rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="7" fill="url(#wd-tile)"/>` +
      `<rect x="${X + .75}" y="${Y + .75}" width="${S - 1.5}" height="${S - 1.5}" rx="6.5" fill="none" stroke="url(#wd-tile-edge)" stroke-width="1.5"/>`;
  }
  h += `<rect width="${VB}" height="${VB}" rx="24" filter="url(#wd-grain)" style="mix-blend-mode:multiply" opacity=".55"/>` +
    `<rect width="${VB}" height="${VB}" rx="24" fill="url(#wd-vignette)"/>`;
  g.players.forEach((p) => {
    const len = VB - 120, t = 6, a = 60, b = PAD / 2 - t / 2;
    const r = [[a, VB - b - t, len, t, 'wd-wh'], [b, a, t, len, 'wd-wv'], [a, b, len, t, 'wd-wh'], [VB - b - t, a, t, len, 'wd-wv']][p.side];
    h += `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="3" fill="url(#${r[4]}${p.i})" stroke="#1C0F06" stroke-opacity=".6" stroke-width="1"/>`;
  });
  return h;
}

/* Цель того, кто ходит: плитки ряда окрашены его цветом, поверх — стрелки направления. */
export function goalLayer(g, i) {
  const p = g.players[i]; if (!p) return '';
  let h = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (E.SIDES[p.side].goal(x, y)) h += `<rect x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="7" style="fill:var(--p${i + 1})" fill-opacity=".32"/>` +
      `<g transform="translate(${cx(x) + S / 2} ${cy(y) + S / 2}) rotate(${p.side * 90})"><path d="M-7 4 0-3l7 7" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return h;
}

/* Бонус — латунный медальон, вделанный в плитку, с гравированной иконкой. */
export function bonusLayer(g) {
  let h = '';
  for (const [k, t] of Object.entries(g.bonus)) {
    const [x, y] = k.split(',').map(Number), mx = cx(x) + S / 2, my = cy(y) + S / 2;
    h += `<g class="bonus"><circle cx="${mx}" cy="${my + 1.5}" r="18.5" fill="#5A3A0E" opacity=".45"/>` +
      `<circle cx="${mx}" cy="${my}" r="18" fill="url(#wd-brass)" stroke="#7A5516" stroke-width="1.25"/>` +
      `<circle cx="${mx}" cy="${my}" r="14.5" fill="none" stroke="#7A5516" stroke-opacity=".55" stroke-width="1"/>` +
      `<g transform="translate(${mx - 9.6} ${my - 9.6}) scale(.8)" fill="none" stroke="#4A320C" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" color="#4A320C">${IC[BONUS_ICON[t]]}</g></g>`;
  }
  return h;
}

/* Знак хозяина на планке — его форма в миниатюре. */
function wallMark(owner, r) {
  const mx = r.x + r.w / 2, my = r.y + r.h / 2, f = 'fill="#fff" fill-opacity=".9"';
  switch (owner % 4) {
    case 0: return `<circle cx="${mx}" cy="${my}" r="2.2" ${f}/>`;
    case 1: return `<rect x="${mx - 2}" y="${my - 2}" width="4" height="4" rx=".6" ${f}/>`;
    case 2: return `<path d="M${mx} ${my - 2.6}l2.8 5h-5.6z" ${f}/>`;
    default: return `<path d="M${mx} ${my - 2.8}l2.8 2.8-2.8 2.8-2.8-2.8z" ${f}/>`;
  }
}
function slat(o, x, y, owner, extra = '') {
  const r = wallRect(o, x, y), gid = (o === 'h' ? 'wd-wh' : 'wd-wv') + owner;
  const hl = o === 'h' ? `M${r.x + 5} ${r.y + 2}h${r.w - 10}` : `M${r.x + 2} ${r.y + 5}v${r.h - 10}`;
  return `<g filter="url(#wd-wshadow)" ${extra}><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3.5" fill="url(#${gid})" stroke="${dark(owner)}" stroke-width="1"/>` +
    `<path d="${hl}" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>${wallMark(owner, r)}</g>`;
}
export function wallLayer(g, { fromIndex = 1e9, breakable = false } = {}) {
  let h = '';
  g.walls.forEach((w, i) => {
    const r = wallRect(w.o, w.x, w.y);
    h += `<g class="wallg${i >= fromIndex ? ' fresh' : ''}${breakable ? ' breakable' : ''}" data-wall="${i}">${slat(w.o, w.x, w.y, w.owner)}` +
      (breakable ? `<rect class="brk" x="${r.x - 6}" y="${r.y - 6}" width="${r.w + 12}" height="${r.h + 12}" rx="8" fill="transparent" stroke="#FFF4D6" stroke-width="2" stroke-dasharray="5 4"/>` : '') + '</g>';
  });
  return h;
}

/* Пазы: латунные заклёпки на перекрёстках, куда может встать стена. */
export function slotLayer() {
  let h = '';
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) h += `<circle cx="${cx(x) + S + GP / 2}" cy="${cy(y) + S + GP / 2}" r="3"/>`;
  return `<g class="wslots">${h}</g>`;
}

export function hintLayer(g, p, steps) {
  let h = '';
  steps.forEach((d, k) => {
    const [x, y] = k.split(',').map(Number), mx = cx(x) + S / 2, my = cy(y) + S / 2;
    h += `<g class="hint" data-cell="${k}"><rect class="hit" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="7"/>` +
      `<rect class="hl" x="${cx(x) + 2}" y="${cy(y) + 2}" width="${S - 4}" height="${S - 4}" rx="6" style="stroke:var(--p${p.i + 1})"/>` +
      `<circle cx="${mx}" cy="${my}" r="13" style="fill:var(--p${p.i + 1})" stroke="#fff" stroke-width="2"/>` +
      `<text x="${mx}" y="${my + .5}" text-anchor="middle" dominant-baseline="central">${d}</text></g>`;
  });
  return h;
}

export function previewLayer(w, ok, p) {
  const r = wallRect(w.o, w.x, w.y), mx = r.x + r.w / 2, my = r.y + r.h / 2;
  const body = ok ? `<g opacity=".8">${slat(w.o, w.x, w.y, p.i)}</g>`
    : `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3.5" fill="#C0392B" fill-opacity=".55" stroke="#fff" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  return body + `<circle cx="${mx}" cy="${my}" r="12" fill="${ok ? '#1F6B3A' : '#B3261E'}" stroke="#fff" stroke-width="2"/>` +
    (ok ? `<path d="m${mx - 5} ${my + .5} 3.5 3.5 6.5-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M${mx - 4} ${my - 4}l8 8M${mx + 4} ${my - 4}l-8 8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`);
}

/* Фишка: форма игрока, лакированная заливка, ободок, выточенная канавка и блик. */
function pawnPath(i, k) {
  switch (i % 4) {
    case 0: return `<circle r="${18 * k}" ATTR/>`;
    case 1: { const s = 33 * k; return `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${8 * k}" ATTR/>`; }
    case 2: { const a = 21 * k; return `<path d="M0 ${-a} L${a * 1.02} ${a * .78} Q${a * 1.08} ${a * .95} ${a * .88} ${a * .98} H${-a * .88} Q${-a * 1.08} ${a * .95} ${-a * 1.02} ${a * .78} Z" ATTR/>`; }
    default: { const a = 21 * k; return `<path d="M0 ${-a} L${a} 0 L0 ${a} L${-a} 0 Z" stroke-linejoin="round" ATTR/>`; }
  }
}
export function pawnShape(i) {
  const at = (s) => (str) => str.replace('ATTR', s);
  const dy = i % 4 === 2 ? 2 : 0;
  return `<g transform="translate(0 ${dy})" filter="url(#wd-pshadow)">` +
    at(`fill="url(#wd-p${i})" style="stroke:${dark(i)}" stroke-width="1.5"`)(pawnPath(i, 1)) +
    at(`fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"`)(pawnPath(i, .58)) +
    `<ellipse cx="-6" cy="-8" rx="6.5" ry="3.2" fill="#fff" opacity=".55" transform="rotate(-32 -6 -8)"/></g>`;
}

export function frozenMark() {
  return `<circle r="26" fill="url(#wd-hatch)" opacity=".55"/><circle r="26" fill="#BFE0FF" fill-opacity=".25" stroke="#CFE8FF" stroke-width="2"/>` +
    `<g transform="translate(19 -20)"><circle r="10" fill="#2F6FB5" stroke="#fff" stroke-width="2"/><g transform="translate(-6.6 -6.6) scale(.55)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round">${IC.freeze}</g></g>`;
}
export function pawnGroup(p, { turn = false, frozen = false, id = '' } = {}) {
  const x = cx(p.x) + S / 2, y = cy(p.y) + S / 2;
  return `<g class="pawn${turn ? ' turn' : ''}${frozen ? ' frozen' : ''}" ${id ? `id="${id}"` : ''} style="transform:translate(${x}px,${y}px)">` +
    `<g class="pawn-fx"><circle class="ring-glow" r="27" style="stroke:var(--p${p.i + 1})"/><circle class="ring" r="27"/><g class="fz">${frozen ? frozenMark() : ''}</g><g class="pawn-body">${pawnShape(p.i)}</g></g></g>`;
}

/* Полностью статичное поле (обложка на главной, подложка победы). */
export function staticBoard(g, goalOf = -1) {
  return boardBase(g) + (goalOf >= 0 ? goalLayer(g, goalOf) : '') + bonusLayer(g) + wallLayer(g) + g.players.map((p) => pawnGroup(p, { frozen: p.skip > 0 })).join('');
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

export function installDefs() {
  if (document.getElementById('wd-defs')) return;
  document.body.insertAdjacentHTML('afterbegin', `<svg id="wd-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${boardDefs}</svg>`);
}
