// Графика WALL DUEL: «бумага и тушь» с печатью ризографа. Всё — строки SVG, цвета из CSS-переменных.
// Всё — строки SVG; цвета берутся из CSS-переменных темы.
import * as E from './engine.js';

export const N = E.N, S = 56, GP = 10, PAD = 26, P = S + GP, VB = PAD * 2 + N * S + (N - 1) * GP; // 636
export const cx = (x) => PAD + x * P;
export const cy = (y) => PAD + y * P;
export const pv = (i) => `var(--p${i + 1})`;

/* Иконки: сетка 24, линия 1.75, скруглённые концы. Игровые иконки собраны из того же мотива,
   что и логотип: клетка (скруглённый квадрат) и стена (толстая черта). */
const IC = {
  move: '<circle cx="7" cy="12" r="4"/><path d="M13.5 12h7.5M17.5 8.5 21 12l-3.5 3.5"/>',
  wall: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M3 14.5h18M12 4.5v5M7.5 9.5v5M16.5 9.5v5M12 14.5v5"/>',
  break: '<path d="M3 9.5h6.5M14.5 9.5H21M3 14.5h5M13 14.5h8M7.5 4.5v5M16.5 9.5v5M6.5 14.5v5M16 14.5v5"/><path d="M11 4.5H5A2 2 0 0 0 3 6.5v11a2 2 0 0 0 2 2h4.5M13.5 4.5H19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-5"/><path d="M12.6 3.5 10.8 8l2.6 2.6-2.2 3.6 1.8 2.3-1.5 4"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  plusWall: '<rect x="2.5" y="8" width="12.5" height="11.5" rx="1.75"/><path d="M2.5 11.85h12.5M2.5 15.65h12.5M8.75 8v3.85M5.75 11.85v3.8M11.75 11.85v3.8M8.75 15.65v3.85"/><path d="M19 3.5v6M16 6.5h6"/>',
  again: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.75 3.75V7.5H16"/><rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1.25"/>',
  freeze: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.8 4.8 12 6.8l2.2-2M9.8 19.2 12 17.2l2.2 2"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5h11l-2.5 4 2.5 4h-11"/>',
  people: '<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 19.5c.4-3 2.7-5 5.5-5s5.1 2 5.5 5M14.5 14.6c3 .1 5.6 1.8 6 4.9"/>',
  book: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.4a2.6 2.6 0 0 1 5 1c0 1.7-2.5 2.1-2.5 3.8"/><path d="M12 17.3h.01" stroke-width="2.4"/>',
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
  if (ghost) return `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${shapeBody(i, 'fill="none" stroke="var(--line-2)" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round"')}</svg>`;
  return `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><g transform="translate(2 2)" class="ink-fill">${shapeBody(i, `style="fill:var(--p${i + 1})"`)}</g>${shapeBody(i, 'fill="none" stroke="var(--ink)" stroke-width="2.25" stroke-linejoin="round"')}</svg>`;
}

/* ====================== ПОЛЕ: ризограф на бумаге ======================
   Отпечаток в два прогона: цвет (краска ризографа) ложится со сдвигом относительно контура тушью.
   Бороздки — растровые точки, цель — штриховка, бонусы — штампы, по углам метки обреза. */
const OFF = 2; // сдвиг цветового прогона, px
export const wallRect = (o, x, y) => (o === 'h' ? { x: cx(x), y: cy(y) + S, w: 2 * S + GP, h: GP } : { x: cx(x) + S, y: cy(y), w: GP, h: 2 * S + GP });

/* Определения вставляются в документ один раз (installDefs): копия в скрытом экране ломает ссылки. */
export const boardDefs = (() => {
  let d = `<defs>
  <pattern id="wd-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1" fill="var(--ink)" fill-opacity=".22"/></pattern>
  <pattern id="wd-dots-s" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="var(--ink)" fill-opacity=".55"/></pattern>
  <filter id="wd-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .38  0 0 0 0 .28  0 0 0 .9 -.38"/></filter>
  <filter id="wd-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter>
  <pattern id="wd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink)" stroke-width="1.6"/></pattern>`;
  for (let i = 0; i < 4; i++) d += `<pattern id="wd-goal${i}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" style="stroke:var(--p${i + 1})" stroke-width="2.6"/></pattern>`;
  return d + '</defs>';
})();
export function installDefs() {
  if (document.getElementById('wd-defs')) return;
  document.body.insertAdjacentHTML('afterbegin', `<svg id="wd-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${boardDefs}</svg>`);
}

/* Постоянный слой: лист, растровые бороздки, клетки, метки обреза, цветные «дома». */
export function boardBase(g) {
  const a = PAD - 8, w = VB - a * 2;
  let h = `<rect class="b-sheet" x="1" y="1" width="${VB - 2}" height="${VB - 2}" rx="16"/>` +
    `<rect x="${a}" y="${a}" width="${w}" height="${w}" rx="10" class="b-bed"/><rect x="${a}" y="${a}" width="${w}" height="${w}" rx="10" fill="url(#wd-dots)"/>`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h += `<rect class="b-cell" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="6"/>`;
  // метки обреза в углах листа
  const m = 10, L = 9, e = VB - m;
  h += `<path class="b-crop" d="M${m} ${m + L}V${m}H${m + L}M${e - L} ${m}H${e}V${m + L}M${e} ${e - L}V${e}H${e - L}M${m + L} ${e}H${m}V${e - L}"/>`;
  g.players.forEach((p) => {
    const len = VB - 2 * 64, t = 7, o = PAD / 2 - t / 2 - 3, s = 64;
    const r = [[s, VB - o - t], [o, s], [s, o], [VB - o - t, s]][p.side], hz = p.side % 2 === 0;
    const W = hz ? len : t, H = hz ? t : len;
    h += `<rect class="ink-fill" x="${r[0] + OFF}" y="${r[1] + OFF}" width="${W}" height="${H}" rx="3.5" style="fill:var(--p${p.i + 1})"/>` +
      `<rect x="${r[0]}" y="${r[1]}" width="${W}" height="${H}" rx="3.5" class="b-out"/>`;
  });
  return h + `<rect class="b-grain" x="1" y="1" width="${VB - 2}" height="${VB - 2}" rx="16" filter="url(#wd-paper)"/>`;
}

/* Цель того, кто ходит: штриховка его цветом и шевроны тушью. */
export function goalLayer(g, i) {
  const p = g.players[i]; if (!p) return '';
  let h = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (E.SIDES[p.side].goal(x, y)) h += `<rect class="blend" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="6" fill="url(#wd-goal${i})" opacity=".6"/>` +
      `<g transform="translate(${cx(x) + S / 2} ${cy(y) + S / 2}) rotate(${p.side * 90})"><path d="M-7 4 0-3l7 7" fill="none" stroke="var(--ink)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return h;
}

/* Бонус — оттиск штампа: двойное кольцо и иконка, слегка повёрнут, как поставленный рукой. */
export function bonusLayer(g) {
  let h = '';
  for (const [k, t] of Object.entries(g.bonus)) {
    const [x, y] = k.split(',').map(Number), mx = cx(x) + S / 2, my = cy(y) + S / 2, rot = ((x * 7 + y * 13) % 17) - 8;
    h += `<g class="bonus stamp blend" transform="rotate(${rot} ${mx} ${my})"><circle cx="${mx}" cy="${my}" r="19" class="st-ring"/><circle cx="${mx}" cy="${my}" r="15.5" class="st-ring2"/>` +
      `<g transform="translate(${mx - 9.6} ${my - 9.6}) scale(.8)" fill="none" stroke="var(--stamp)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" color="var(--stamp)">${IC[BONUS_ICON[t]]}</g></g>`;
  }
  return h;
}

/* Знак хозяина на стене — его форма в миниатюре. */
function wallMark(owner, r) {
  const mx = r.x + r.w / 2, my = r.y + r.h / 2, f = 'fill="var(--ink)"';
  switch (owner % 4) {
    case 0: return `<circle cx="${mx}" cy="${my}" r="2" ${f}/>`;
    case 1: return `<rect x="${mx - 1.9}" y="${my - 1.9}" width="3.8" height="3.8" ${f}/>`;
    case 2: return `<path d="M${mx} ${my - 2.4}l2.6 4.6h-5.2z" ${f}/>`;
    default: return `<path d="M${mx} ${my - 2.6}l2.6 2.6-2.6 2.6-2.6-2.6z" ${f}/>`;
  }
}
function slat(o, x, y, owner, alpha = 1) {
  const r = wallRect(o, x, y);
  return `<rect class="ink-fill" x="${r.x + OFF}" y="${r.y + OFF}" width="${r.w}" height="${r.h}" rx="3" style="fill:var(--p${owner + 1})" opacity="${alpha}"/>` +
    `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" class="b-out"/>${wallMark(owner, r)}`;
}
export function wallLayer(g, { fromIndex = 1e9, breakable = false } = {}) {
  let h = '';
  g.walls.forEach((w, i) => {
    const r = wallRect(w.o, w.x, w.y);
    h += `<g class="wallg${i >= fromIndex ? ' fresh' : ''}${breakable ? ' breakable' : ''}" data-wall="${i}">${slat(w.o, w.x, w.y, w.owner)}` +
      (breakable ? `<rect class="brk" x="${r.x - 7}" y="${r.y - 7}" width="${r.w + 14}" height="${r.h + 14}" rx="8"/>` : '') + '</g>';
  });
  return h;
}

/* Пазы для стен — крестики, как метки приводки. */
export function slotLayer() {
  let h = '';
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
    const X = cx(x) + S + GP / 2, Y = cy(y) + S + GP / 2;
    h += `M${X - 4} ${Y}h8M${X} ${Y - 4}v8`;
  }
  return `<path class="wslots" d="${h}"/>`;
}

export function hintLayer(g, p, steps) {
  let h = '';
  steps.forEach((d, k) => {
    const [x, y] = k.split(',').map(Number), mx = cx(x) + S / 2, my = cy(y) + S / 2;
    h += `<g class="hint" data-cell="${k}"><rect class="hit" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="6"/><rect class="hl" x="${cx(x) + 3}" y="${cy(y) + 3}" width="${S - 6}" height="${S - 6}" rx="4"/>` +
      `<g class="hdot"><circle class="ink-fill" cx="${mx + 1.5}" cy="${my + 1.5}" r="13" style="fill:var(--p${p.i + 1})"/><circle cx="${mx}" cy="${my}" r="13" class="b-out"/>` +
      `<text x="${mx}" y="${my + .5}" text-anchor="middle" dominant-baseline="central">${d}</text></g></g>`;
  });
  return h;
}

export function previewLayer(w, ok, p) {
  const r = wallRect(w.o, w.x, w.y), mx = r.x + r.w / 2, my = r.y + r.h / 2;
  const body = ok ? `<g opacity=".85">${slat(w.o, w.x, w.y, p.i, .8)}</g>`
    : `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="url(#wd-hatch)" stroke="var(--danger)" stroke-width="2"/>`;
  return body + `<circle cx="${mx}" cy="${my}" r="12" fill="${ok ? 'var(--ink)' : 'var(--danger)'}" stroke="var(--paper)" stroke-width="2.5"/>` +
    (ok ? `<path d="m${mx - 5} ${my + .5} 3.5 3.5 6.5-7" fill="none" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M${mx - 4} ${my - 4}l8 8M${mx + 4} ${my - 4}l-8 8" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round"/>`);
}

/* Фишка: растровая тень, цветной прогон со сдвигом, контур тушью и штрих-блик. */
function pawnPath(i, cls, dx = 0, dy = 0, extra = '') {
  const t = `transform="translate(${dx} ${dy})" class="${cls}" ${extra}`;
  switch (i % 4) {
    case 0: return `<circle r="17" ${t}/>`;
    case 1: return `<rect x="-16" y="-16" width="32" height="32" rx="6" ${t}/>`;
    case 2: return `<path d="M0-19 19 15H-19z" stroke-linejoin="round" ${t}/>`;
    default: return `<path d="M0-21 21 0 0 21-21 0z" stroke-linejoin="round" ${t}/>`;
  }
}
export function pawnShape(i) {
  const shine = ['M-9-4a10 10 0 0 1 6-7', 'M-10-4v-3a3 3 0 0 1 3-3h4', 'M-3-8l-4 7', 'M-7-6l5-5'][i % 4];
  return `<g class="pawn-dots">${pawnPath(i, 'p-shadow', 3, 5)}</g>` +
    pawnPath(i, 'ink-fill', OFF, OFF, `style="fill:var(--p${i + 1})"`) + pawnPath(i, 'p-out') +
    `<path d="${shine}" class="p-shine"/>`;
}
export function frozenMark() {
  return `<circle r="27" fill="url(#wd-hatch)" opacity=".35"/><g transform="translate(19 -20)"><circle r="10" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.75"/><g transform="translate(-6.6 -6.6) scale(.55)" fill="none" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round">${IC.freeze}</g></g>`;
}
export function pawnGroup(p, { turn = false, frozen = false, id = '' } = {}) {
  const x = cx(p.x) + S / 2, y = cy(p.y) + S / 2;
  return `<g class="pawn${turn ? ' turn' : ''}${frozen ? ' frozen' : ''}" ${id ? `id="${id}"` : ''} style="transform:translate(${x}px,${y}px)">` +
    `<g class="pawn-fx"><circle class="ring" r="27"/><g class="fz">${frozen ? frozenMark() : ''}</g><g class="pawn-body">${pawnShape(p.i)}</g></g></g>`;
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
