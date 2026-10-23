// Дашборд /stats: сводка из /api/stats и повтор партий ход за ходом (движок тот же, что в игре).
import * as E from './engine.js';
import * as A from './art.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('ru-RU'));
const pct = (w, n) => (n ? Math.round((100 * w) / n) : 0);
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 15 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
function dur(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60); if (m < 60) return `${m} мин${s % 60 ? ` ${s % 60} с` : ''}`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}
function when(ts) {
  const d = Date.now() - ts;
  if (d < 60_000) return 'только что';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} мин назад`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} ч назад`;
  return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ---------- тема, иконки ---------- */
const THEMES = ['auto', 'light', 'dark'];
const applyTheme = (t) => (t === 'auto' ? document.documentElement.removeAttribute('data-theme') : (document.documentElement.dataset.theme = t));
let theme = 'auto'; try { theme = localStorage.wd_theme || 'auto'; } catch {}
applyTheme(theme);
$('#themeBtn').onclick = () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; applyTheme(theme); try { localStorage.wd_theme = theme; } catch {} };
$$('[data-icon]').forEach((el) => { el.outerHTML = A.icon(el.dataset.icon, 20, el.getAttribute('style') ? `style="${el.getAttribute('style')}"` : ''); });
$$('[data-logo]').forEach((el) => { el.outerHTML = A.logo(+el.dataset.logo); });
A.installDefs();

/* ---------- всплывающие подсказки у графиков ---------- */
const tip = $('#tip');
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (!t) return tip.classList.remove('on');
  tip.innerHTML = t.dataset.tip; tip.classList.add('on');
});
document.addEventListener('pointermove', (e) => {
  if (!tip.classList.contains('on')) return;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px';
  tip.style.top = (e.clientY - h - 12 < 8 ? e.clientY + 18 : e.clientY - h - 12) + 'px';
});

/* ---------- загрузка ---------- */
let days = 7; try { days = +(localStorage.wd_stats_days ?? 7); } catch {}
const setSeg = (el, attr, val) => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b.dataset[attr] === String(val)));
setSeg($('#period'), 'd', days);
$('#period').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; days = +b.dataset.d; try { localStorage.wd_stats_days = days; } catch {} setSeg($('#period'), 'd', days); load(); };
$('#reload').onclick = () => load();

let stats = null, roleWho = 'all';
async function load() {
  const r = await fetch(`/api/stats?days=${days}`);
  if (r.status === 401) {
    const j = await r.json().catch(() => ({}));
    $('#dash').classList.add('hidden'); $('#period').classList.add('hidden'); $('#login').classList.remove('hidden');
    if (!j.login) { $('#loginText').textContent = 'На сервере не задан STATS_KEY: дашборд открывается только напрямую с этой машины.'; $('#loginForm').classList.add('hidden'); }
    else $('#key').focus();
    return;
  }
  if (!r.ok) { $('#rangeNote').textContent = 'Не удалось загрузить статистику'; return; }
  stats = await r.json();
  $('#login').classList.add('hidden'); $('#dash').classList.remove('hidden'); $('#period').classList.remove('hidden');
  render(stats);
  loadGames(true);
}
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch('/api/stats/login', { method: 'POST', body: JSON.stringify({ key: $('#key').value }) });
  if (r.ok) { $('#key').value = ''; load(); } else { $('#loginText').textContent = 'Ключ не подошёл.'; $('#key').select(); }
};

/* ---------- примитивы графиков ---------- */
// rows: [{ label, icon?, v (0..1 или значение), max?, text, ref? (0..1), tip, dim?, alt? }]
function bars(rows, { empty = 'Пока нет данных' } = {}) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  const max = Math.max(...rows.map((r) => r.max ?? r.v), 1e-9);
  return `<div class="hb">${rows.map((r) => {
    const w = Math.max(0, Math.min(100, (100 * r.v) / (r.max ?? max)));
    return `<div class="hb-row${r.dim ? ' dim' : ''}" data-tip="${esc(r.tip || '')}">
      <div class="hb-l">${r.icon || ''}<span>${esc(r.label)}</span></div>
      <div class="hb-t"><b class="${r.alt ? 'alt' : ''}" style="width:${w}%"></b>${r.ref != null ? `<em style="left:${Math.min(100, 100 * r.ref)}%"></em>` : ''}</div>
      <div class="hb-v">${r.text}</div></div>`;
  }).join('')}</div>`;
}
const niceMax = (v) => { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

function daily(rows) {
  const top = niceMax(Math.max(1, ...rows.map((d) => Math.max(d.visitors, d.games))));
  const grid = [0, 0.5, 1].map((f) => `<div class="grid${f ? '' : ' zero'}" style="bottom:${f * 100}%"><span>${num(Math.round(top * f))}</span></div>`).join('');
  const day = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const cols = rows.map((d) => `<div class="day" data-tip="<b>${day(d.day)}</b><br>Посетители: <b>${d.visitors}</b><br>Партии: <b>${d.games}</b>, доиграно <b>${d.finished}</b>">
    <i class="a" style="height:${(100 * d.visitors) / top}%"></i><i class="b" style="height:${(100 * d.games) / top}%"></i></div>`).join('');
  const every = Math.ceil(rows.length / 7);
  // по оси — только число; месяц у первой подписи и там, где он сменился
  let lastMonth = '';
  const xl = rows.map((d, i) => {
    if (i % every && i !== rows.length - 1) return '<span></span>';
    const m = d.day.slice(5, 7), lab = m !== lastMonth ? day(d.day) : String(+d.day.slice(8));
    lastMonth = m; return `<span>${lab}</span>`;
  }).join('');
  return `<div class="cols" role="img" aria-label="Посетители и партии по дням">${grid}<div class="days">${cols}</div></div><div class="xlab">${xl}</div>`;
}

/* ---------- сводка ---------- */
function render(s) {
  const k = s.kpi;
  $('#rangeNote').textContent = s.range.days
    ? `С ${new Date(s.range.from).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} по сейчас`
    : 'За всё время';
  const tile = (label, value, sub) => `<div class="kpi"><span class="eyebrow">${label}</span><b>${value}</b><small>${sub}</small></div>`;
  $('#kpis').innerHTML = [
    tile('Посетители', num(k.visitors), `новых ${num(k.newVisitors)} · вернулись ${num(k.returning)}`),
    tile('Партии', num(k.games), `доиграно ${num(k.finished)} · ${pct(k.finished, k.games)}%`),
    tile('С людьми', num(k.humanGames), `онлайн ${num(k.online)}`),
    tile('Длина партии', dur(k.medianDur), k.medianTurns != null ? `медиана · ${k.medianTurns} ${plural(Math.round(k.medianTurns), 'ход', 'хода', 'ходов')}` : 'медиана'),
    tile('Раздумья над ходом', dur(k.medianThink), 'медиана у людей'),
    tile('Отрыв победителя', k.medianMargin != null ? `${k.medianMargin} кл.` : '—', 'медиана: столько оставалось второму'),
  ].join('');

  $('#daily').innerHTML = daily(s.daily);
  const f0 = s.funnel[0].n;
  $('#funnel').innerHTML = bars(s.funnel.map((f, i) => ({ label: f.label, v: f.n, max: f0 || 1, text: `${num(f.n)}<small>${f0 ? pct(f.n, f0) + '%' : ''}</small>`,
    tip: `${f.label}: <b>${f.n}</b>${i && s.funnel[i - 1].n ? ` — ${pct(f.n, s.funnel[i - 1].n)}% от предыдущего шага` : ''}` })), { empty: 'Пока никто не заходил' });

  renderRoles();
  $('#seat0').innerHTML = bars(Object.entries(s.seat0).map(([size, v]) => ({ label: `${size}×${size}`, v: v.w / v.n, max: 1, ref: v.exp / v.n,
    text: `${pct(v.w, v.n)}%<small>${v.n}</small>`, dim: v.n < 10,
    tip: `Поле ${size}×${size}: первый игрок выиграл <b>${v.w}</b> из <b>${v.n}</b>. При равных шансах — ${pct(v.exp, v.n)}%` })));
  const LV = { easy: 'лёгкие', normal: 'средние', hard: 'сильные' };
  $('#vsBots').innerHTML = bars(s.vsBots.sort((a, b) => a.size - b.size || a.level.localeCompare(b.level)).map((v) => ({
    label: `${LV[v.level] || v.level} · ${v.size}×${v.size}`, v: v.w / v.n, max: 1, ref: v.exp / v.n, text: `${pct(v.w, v.n)}%<small>${v.n}</small>`, dim: v.n < 10,
    tip: `Боты ${LV[v.level] || v.level}, поле ${v.size}×${v.size}: люди выиграли <b>${v.w}</b> из <b>${v.n}</b>` })), { empty: 'Люди ещё не играли с ботами' });

  const per = (m, key) => (m.turns ? m[key] / m.turns : 0);
  const mixRows = [['moves', 'Шаги', 'move'], ['walls', 'Стены', 'wall'], ['cards', 'Карты', 'cards'], ['role', 'Срабатывания роли', 'crown']];
  const mmax = Math.max(1e-9, ...mixRows.flatMap(([key]) => [per(s.mix.human, key), per(s.mix.bot, key)]));
  $('#mix').innerHTML = s.mix.human.turns + s.mix.bot.turns === 0 ? '<p class="empty">Пока нет данных</p>' :
    `<div class="legend" style="margin-top:12px"><span><i style="background:var(--c1)"></i>Люди</span><span><i style="background:var(--c2)"></i>Боты</span></div>` +
    mixRows.map(([key, label, ic]) => bars([
      { label, icon: A.icon(ic, 16), v: per(s.mix.human, key), max: mmax, text: per(s.mix.human, key).toFixed(2), tip: `${label}: люди — <b>${per(s.mix.human, key).toFixed(2)}</b> за ход` },
      { label: '', v: per(s.mix.bot, key), max: mmax, alt: true, text: per(s.mix.bot, key).toFixed(2), tip: `${label}: боты — <b>${per(s.mix.bot, key).toFixed(2)}</b> за ход` },
    ])).join('');

  const cards = Object.entries(s.cards).sort((a, b) => b[1].human - a[1].human);
  const ctot = cards.reduce((t, [, c]) => t + c.human, 0);
  $('#cards').innerHTML = ctot ? bars(cards.map(([c, v]) => ({ label: v.name, icon: A.icon(A.CARD_ICON[c], 16), v: v.human, text: num(v.human),
    tip: `«${v.name}»: люди — <b>${v.human}</b> (${pct(v.human, ctot)}%), боты — <b>${v.bot}</b>` }))) : '<p class="empty">Люди ещё не играли карты</p>';

  const ab = Object.entries(s.abandonAt), atot = ab.reduce((t, [, n]) => t + n, 0);
  $('#abandon').innerHTML = atot ? bars(ab.map(([b, n]) => ({ label: b === '0' ? 'до первого хода' : `ходы ${b}`, v: n, alt: true, text: num(n),
    tip: `Брошено ${b === '0' ? 'до первого хода' : `на ходах ${b}`}: <b>${n}</b> (${pct(n, atot)}%)` }))) : '<p class="empty">Брошенных партий нет</p>';

  const list = (o, names = {}, icons = {}) => {
    const e = Array.isArray(o) ? o : Object.entries(o).sort((a, b) => b[1] - a[1]), tot = e.reduce((t, [, n]) => t + n, 0);
    return bars(e.map(([k2, n]) => ({ label: names[k2] || k2, icon: icons[k2] ? A.icon(icons[k2], 16) : '', v: n, text: `${num(n)}<small>${pct(n, tot)}%</small>`, tip: `${esc(names[k2] || k2)}: <b>${n}</b>` })));
  };
  $('#devices').innerHTML = list(s.devices, { phone: 'Телефон', tablet: 'Планшет', desktop: 'Компьютер' });
  $('#langs').innerHTML = list(s.langs);
  $('#screens').innerHTML = list(s.screens, { home: 'Главная', create: 'Создание комнаты', find: 'Поиск комнат', local: 'Игра здесь: настройка', lobby: 'Лобби', game: 'Партия', rules: 'Правила' });
  $('#refs').innerHTML = s.refs.length ? list(s.refs) : '<p class="empty">Все пришли по прямой ссылке</p>';
  const tot = s.optsUse.total;
  $('#setups').innerHTML =
    `<table class="mini-t"><thead><tr><th></th><th>партий</th><th>%</th></tr></thead><tbody>` +
    [...Object.entries(s.modes).map(([m, n]) => [m === 'online' ? 'Онлайн' : 'На одном экране', n]),
      ...Object.entries(s.bySize).map(([z, n]) => [`Поле ${z}×${z}`, n]),
      ...Object.entries(s.byN).map(([z, n]) => [`${z} ${plural(+z, 'игрок', 'игрока', 'игроков')}`, n]),
      ...Object.entries(s.botLevels).map(([l, n]) => [`Боты ${LV[l] || l}`, n]),
      ['С ролями', s.optsUse.roles], ['С бонус-клетками', s.optsUse.bonus]]
      .map(([l, n]) => `<tr><td>${esc(l)}</td><td>${num(n)}</td><td>${pct(n, tot)}</td></tr>`).join('') + '</tbody></table>';

  $('#errCount').textContent = s.errors.length ? `${s.errors.reduce((t, e) => t + e.n, 0)} за период` : '';
  $('#errors tbody').innerHTML = s.errors.length ? s.errors.map((e) => `<tr><td class="err-msg">${esc(e.msg)}</td><td class="err-msg" title="${esc(e.ua)}">${esc(e.src)}</td><td class="r">${e.n}</td><td class="when">${when(e.last)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Ошибок нет</td></tr>';
}

function renderRoles() {
  const s = stats, h = roleWho === 'human';
  const rows = Object.entries(s.roles).filter(([, r]) => (h ? r.hn : r.n)).map(([key, r]) => {
    const n = h ? r.hn : r.n, w = h ? r.hw : r.w, exp = h ? r.hexp : r.exp;
    return { key, label: r.name, n, w, exp, use: s.roles[key].use || 0 };
  }).sort((a, b) => b.w / b.n - a.w / a.n);
  $('#roles').innerHTML = bars(rows.map((r) => ({ label: r.label, icon: A.icon(A.ROLE_ICON[r.key], 16), v: r.w / r.n, max: 1, ref: r.exp / r.n,
    text: `${pct(r.w, r.n)}%<small>${r.n}</small>`, dim: r.n < 10,
    tip: `${r.label}: <b>${r.w}</b> побед из <b>${r.n}</b>. При идеальном балансе — ${pct(r.exp, r.n)}%. Роль сработала <b>${(r.use / r.n).toFixed(1)}</b> раза за партию${r.n < 10 ? '<br>Мало партий: цифра пока шумная' : ''}` })), { empty: 'Пока нет доигранных партий с ролями' });
}
$('#roleWho').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; roleWho = b.dataset.w; setSeg($('#roleWho'), 'w', roleWho); renderRoles(); };

/* ---------- список партий ---------- */
let oldest = Infinity;
async function loadGames(reset) {
  if (reset) { oldest = Infinity; $('#games tbody').innerHTML = ''; }
  const r = await fetch(`/api/stats/games?limit=40${Number.isFinite(oldest) ? `&before=${oldest}` : ''}`);
  if (!r.ok) return;
  const games = await r.json();
  if (games.length) oldest = games[games.length - 1].ts;
  $('#moreGames').classList.toggle('hidden', games.length < 40);
  if (reset && !games.length) { $('#games tbody').innerHTML = '<tr><td colspan="7" class="empty">Партий пока нет</td></tr>'; return; }
  $('#games tbody').insertAdjacentHTML('beforeend', games.map(gameRow).join(''));
}
$('#moreGames').onclick = () => loadGames(false);
const LVL = { easy: 'лёгкий', normal: 'средний', hard: 'сильный' };
function seatLabel(p, i) { return p.bot ? `Бот ${i + 1}${p.level ? ` · ${LVL[p.level] || p.level}` : ''}` : `Игрок ${i + 1}`; }
function gameRow(g) {
  const who = g.players.map((p, i) => `<span class="pl${g.winner === i ? ' win' : ''}" title="${esc(seatLabel(p, i) + (p.role ? ' · ' + E.ROLES[p.role].name : ''))}">${A.shape(i, 14)}${A.icon(p.bot ? 'bot' : 'people', 13)}${p.role ? A.icon(A.ROLE_ICON[p.role], 13) : ''}</span>`).join('');
  const res = g.status === 'over'
    ? `${A.shape(g.winner, 14)} победил ${g.players[g.winner].bot ? 'бот' : 'человек'}${g.margin != null ? `<span class="note">второму оставалось ${g.margin} кл.</span>` : ''}`
    : `<span class="note">брошена на ходу ${g.turns + 1}</span>`;
  return `<tr data-id="${esc(g.id)}"><td class="when">${when(g.ts)}</td><td class="mode">${g.mode === 'online' ? 'онлайн' : 'здесь'} · ${g.size}×${g.size}</td>
    <td><div class="who">${who}</div></td><td class="res">${res}</td><td class="r">${g.turns}</td><td class="r">${dur(g.dur)}</td><td><button class="btn sm">Смотреть</button></td></tr>`;
}
$('#games').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openReplay(tr.dataset.id); });

/* ---------- повтор партии ---------- */
const rp = { rec: null, summary: null, k: 0, timer: null, speed: 1, r: null };
async function openReplay(id) {
  const r = await fetch('/api/stats/game?id=' + encodeURIComponent(id));
  if (!r.ok) return;
  const { rec, summary, mode } = await r.json();
  Object.assign(rp, { rec, summary, k: 0 });
  $('#rpTitle').textContent = `Партия ${mode === 'online' ? 'онлайн' : 'на одном экране'} · ${summary.size}×${summary.size}`;
  $('#rpMeta').textContent = `${new Date(rec.t0).toLocaleString('ru-RU')} · ${summary.turns} ${plural(summary.turns, 'ход', 'хода', 'ходов')} · ${dur(summary.dur)}` +
    `${summary.opts.roles ? '' : ' · без ролей'}${summary.opts.bonus ? '' : ' · без бонусов'}`;
  $('#rpWarn').classList.toggle('hidden', rec.rv === E.RULES_VERSION);
  $('#rpWarn').textContent = 'Партия сыграна по старой версии правил — повтор может разойтись с оригиналом.';
  $('#rpSeek').max = rec.actions.length;
  $('#replay').classList.remove('hidden');
  seek(0);
  $('#rpPlay').focus();
}
function seek(k) {
  k = Math.max(0, Math.min(rp.rec.actions.length, k));
  // вперёд на один шаг — дешёвый шаг проигрывателя, иначе переигрываем с начала
  if (rp.r && k === rp.k + 1 && rp.r.k === rp.k) { if (!rp.r.step()) return stop(); }
  else { rp.r = E.replayer(rp.rec); while (rp.r.k < k) if (!rp.r.step()) break; }
  rp.k = rp.r.k;
  drawReplay();
}
function drawReplay() {
  const g = rp.r.g, rec = rp.rec, vb = A.vbOf(g.size);
  const svg = $('#rpBoard'); svg.setAttribute('viewBox', `0 0 ${vb} ${vb}`);
  svg.innerHTML = A.staticBoard(g, g.over ? -1 : g.turn);
  const ms = rp.k ? rec.actions[rp.k - 1][0] : 0;
  $('#rpSeek').value = rp.k;
  $('#rpPos').textContent = `${rp.k}/${rec.actions.length} · ${clock(ms)}`;
  $('#rpPlayers').innerHTML = g.players.map((p) => {
    const s = rp.summary.players[p.i];
    return `<li class="${!g.over && g.turn === p.i ? 'cur' : ''}">${A.shape(p.i, 22)}
      <div class="nm"><b>${esc(seatLabel(s, p.i))}${g.winner === p.i ? ' — победа' : ''}</b><small>${p.role ? `${A.icon(A.ROLE_ICON[p.role], 12)}${E.ROLES[p.role].name}` : 'без роли'}${s.think != null ? ` · думал ~${dur(s.think)}` : ''}</small></div>
      <span class="st" title="Стен · карт · клеток до цели">${A.icon('wall', 12).replace('class="ic"', 'class="ic" style="display:inline;vertical-align:-2px"')} ${p.walls} · ${p.hand.length} карт · ${E.dist(g, p)} кл.</span></li>`;
  }).join('');
  const last = rp.k ? rec.actions[rp.k - 1] : null;
  $('#rpNow').innerHTML = g.over ? `<b>Партия окончена.</b> Победил ${esc(seatLabel(rp.summary.players[g.winner], g.winner))}.`
    : last ? `${A.shape(last[1], 14)} ${esc(g.log[0]?.t || '')}` : 'Начало партии. Нажмите «Пуск» или →.';
  if (!g.over && rp.k === rec.actions.length && rec.status !== 'over') $('#rpNow').innerHTML += '<br><span class="note">Здесь игру бросили.</span>';
  $('#rpLog').innerHTML = g.log.slice(0, 30).map((l) => `<li>${l.p >= 0 ? A.shape(l.p, 12) : ''}<span>${esc(l.t)}</span><small>${l.n}</small></li>`).join('');
}
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function play() {
  if (rp.k >= rp.rec.actions.length) seek(0);
  $('#rpPlay').textContent = 'Пауза'; $('#rpPlay').setAttribute('aria-label', 'Пауза');
  clearInterval(rp.timer);
  rp.timer = setInterval(() => { if (rp.k >= rp.rec.actions.length) return stop(); seek(rp.k + 1); }, 700 / rp.speed);
}
function stop() { clearInterval(rp.timer); rp.timer = null; $('#rpPlay').textContent = 'Пуск'; $('#rpPlay').setAttribute('aria-label', 'Пуск'); }
const closeReplay = () => { stop(); $('#replay').classList.add('hidden'); };
$('#rpPlay').onclick = () => (rp.timer ? stop() : play());
$('#rpPrev').onclick = () => { stop(); seek(rp.k - 1); };
$('#rpNext').onclick = () => { stop(); seek(rp.k + 1); };
$('#rpFirst').onclick = () => { stop(); seek(0); };
$('#rpSeek').oninput = (e) => { stop(); seek(+e.target.value); };
$('#rpSpeed').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; rp.speed = +b.dataset.s; setSeg($('#rpSpeed'), 's', rp.speed); if (rp.timer) play(); };
$('#rpClose').onclick = closeReplay;
$('#replay').addEventListener('click', (e) => { if (e.target.id === 'replay') closeReplay(); });
document.addEventListener('keydown', (e) => {
  if ($('#replay').classList.contains('hidden') || e.target.matches('input:not([type=range])')) return;
  if (e.key === 'Escape') closeReplay();
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('#rpNext').click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); $('#rpPrev').click(); }
  else if (e.key === 'Home') $('#rpFirst').click();
  else if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); $('#rpPlay').click(); }
});

load();
