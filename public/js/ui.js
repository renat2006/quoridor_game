import * as E from './engine.js';
import { RemoteNet, LocalNet } from './net.js';
import { sfx, Particles, bgFx } from './fx.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const N = E.N, S = 56, GP = 10, PAD = 14, P = S + GP, VB = PAD * 2 + N * S + (N - 1) * GP;
const cx = (x) => PAD + x * P, cy = (y) => PAD + y * P;
const COLORS = E.COLORS;

let net = null, view = null, g = null, gameId = null, seen = 0;
let mode = 'move', preview = null, turnKey = '', prevWalls = 0, cubeK = 0, pending = false;
let particles = null, wasOnline = false, listTimer = 0, isLocal = false, lastPtr = 'mouse';
const localCfg = { n: 2, names: ['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4'], bot: [false, true, true, true], bonus: true };

/* ---------- общие SVG-определения (градиенты, свечение) ---------- */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), k = 1 + f;
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c})`;
}
(function injectDefs() {
  let d = `<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2548"/><stop offset="1" stop-color="#0e132b"/></linearGradient>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>`;
  COLORS.forEach((c, i) => {
    d += `<radialGradient id="orb${i}" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".22" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.6)}"/></radialGradient>`;
  });
  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><defs>${d}</defs></svg>`);
})();

function glyph(i, x, y, r = 9) {
  const f = 'fill="#fff" opacity=".93"';
  if (i === 0) return `<polygon ${f} points="${x},${y - r} ${x + r * 0.95},${y + r * 0.7} ${x - r * 0.95},${y + r * 0.7}"/>`;
  if (i === 1) return `<polygon ${f} points="${x},${y - r * 1.1} ${x + r},${y} ${x},${y + r * 1.1} ${x - r},${y}"/>`;
  if (i === 2) return `<circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="none" stroke="#fff" stroke-width="3.2" opacity=".93"/>`;
  const pts = Array.from({ length: 6 }, (_, k) => `${x + r * Math.cos(k * Math.PI / 3)},${y + r * Math.sin(k * Math.PI / 3)}`).join(' ');
  return `<polygon ${f} points="${pts}"/>`;
}
const avatar = (i, size = 42) => `<img class="av" src="img/pawn${i}.webp" width="${size}" height="${size}" alt="">`;

/* ---------- экраны ---------- */
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  clearInterval(listTimer);
  if (id === 'browse') { listTimer = setInterval(() => net && net.send({ t: 'list' }), 2500); }
  window.scrollTo(0, 0);
}
const toastEl = $('#toast'); let toastT;
function toast(t) { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2000); }
const name = () => { const v = $('#name').value.trim() || 'Игрок'; try { localStorage.wd_name = v; } catch {} return v; };
try { $('#name').value = localStorage.wd_name || ''; } catch {}

const canOnline = location.protocol.startsWith('http');
function useRemote() {
  if (net instanceof RemoteNet) return net;
  net?.close?.(); net = new RemoteNet(); net.onmsg = onMsg; return net;
}
function useLocal() { net?.close?.(); net = new LocalNet(); net.onmsg = onMsg; return net; }

/* ---------- сообщения от сервера ---------- */
function onMsg(m) {
  switch (m.t) {
    case 'status': if (m.online) wasOnline = true; $('#conn').classList.toggle('hidden', m.online || !wasOnline); break;
    case 'room': onRoom(m); break;
    case 'list': renderList(m.rooms); break;
    case 'err': pending = false; toast('🚫 ' + m.msg); sfx.play('error'); break;
    case 'left': view = null; g = null; gameId = null; show('home'); history.replaceState(null, '', location.pathname); if (m.msg) toast(m.msg); break;
    case 'emote': showEmote(m.seat, m.e); break;
  }
}
function onRoom(m) {
  pending = false; view = m; isLocal = !!m.local;
  if (m.phase === 'lobby') {
    g = null; gameId = null; $('#win').classList.add('hidden');
    renderLobby(); show('lobby');
    if (!isLocal) history.replaceState(null, '', `?room=${m.code}`);
    return;
  }
  const ng = E.hydrate(m.game);
  if (ng.id !== gameId) {
    gameId = ng.id; g = ng; seen = ng.fxSeq; prevWalls = 0; turnKey = '';
    buildBoard(); $('#win').classList.add('hidden'); show('game');
  } else {
    const evs = ng.fx.filter((e) => e.seq > seen); g = ng; seen = ng.fxSeq;
    evs.forEach(playFx);
  }
  renderGame();
}

/* ---------- главная / создание / поиск / локальная ---------- */
if (!canOnline) { $('#offlineNote').classList.remove('hidden'); $('#bCreate').disabled = true; $('#bBrowse').disabled = true; }
$('#bCreate').onclick = () => { $('#roomTitle').value ||= name() + ' · дуэль'; show('create'); };
$('#bCreateGo').onclick = () => { useRemote().send({ t: 'create', name: name(), title: $('#roomTitle').value, isPublic: $('#roomPublic').checked }); };
$('#bBrowse').onclick = () => { useRemote().send({ t: 'list' }); show('browse'); };
$('#bJoinCode').onclick = () => joinCode($('#codeIn').value);
$('#codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCode($('#codeIn').value); });
function joinCode(c) { c = String(c).trim().toUpperCase(); if (c.length !== 4) return toast('Введите 4-буквенный код'); useRemote().send({ t: 'join', code: c, name: name() }); }
function renderList(rooms) {
  const el = $('#roomList');
  el.innerHTML = rooms.length ? '' : '<div class="empty">Открытых комнат пока нет.<br>Создайте свою!</div>';
  rooms.forEach((r) => {
    const b = document.createElement('button'); b.className = 'room-item';
    b.innerHTML = `<div class="t"><b>${esc(r.title)}</b><span class="tiny">хост: ${esc(r.host)} · ${r.players}/${r.max}</span></div><span class="c">${r.code}</span>`;
    b.onclick = () => joinCode(r.code); el.appendChild(b);
  });
}
$$('[data-back]').forEach((b) => (b.onclick = () => show('home')));
$('#bLocal').onclick = () => { renderLocal(); show('local'); };
function renderLocal() {
  const seg = $('#segN'); seg.innerHTML = '';
  [2, 3, 4].forEach((n) => { const b = document.createElement('button'); b.textContent = n + ' игрока'; b.className = localCfg.n === n ? 'on' : ''; b.onclick = () => { localCfg.n = n; renderLocal(); }; seg.appendChild(b); });
  const box = $('#localSeats'); box.innerHTML = '';
  for (let i = 0; i < localCfg.n; i++) {
    const r = document.createElement('div'); r.className = 'prow';
    r.innerHTML = `<span class="dot" style="color:${COLORS[i]}"></span><input maxlength="14" value="${esc(localCfg.names[i])}"><label class="tog"><input type="checkbox" ${localCfg.bot[i] ? 'checked' : ''}> ИИ</label>`;
    r.querySelector('input').oninput = (e) => (localCfg.names[i] = e.target.value || 'Игрок ' + (i + 1));
    r.querySelector('input[type=checkbox]').onchange = (e) => (localCfg.bot[i] = e.target.checked);
    box.appendChild(r);
  }
  $('#localBonus').checked = localCfg.bonus;
}
$('#localBonus').onchange = (e) => (localCfg.bonus = e.target.checked);
$('#bLocalGo').onclick = () => {
  const seats = Array.from({ length: localCfg.n }, (_, i) => ({ name: localCfg.names[i].trim() || 'Игрок ' + (i + 1), bot: localCfg.bot[i] }));
  useLocal().setup(seats, { bonus: localCfg.bonus });
};

/* ---------- лобби ---------- */
function renderLobby() {
  const v = view, host = v.you === v.host;
  $('#lbTitle').textContent = v.title; $('#lbCode').textContent = v.code;
  const box = $('#lbSeats'); box.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const s = v.seats[i], d = document.createElement('div');
    if (!s) { d.className = 'seat empty'; d.textContent = 'Свободно'; }
    else {
      d.className = 'seat'; d.style.color = COLORS[i];
      const tags = [i === v.host ? '👑 хост' : '', s.bot ? '🤖 бот' : '', i === v.you ? 'вы' : ''].filter(Boolean).join(' · ');
      d.innerHTML = `${avatar(i)}<div style="min-width:0"><div class="nm" style="color:var(--text)">${esc(s.name)}</div><div class="tag">${tags || '&nbsp;'}</div></div>`;
      if (host && i !== v.you) { const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.title = 'Убрать'; x.onclick = () => net.send({ t: 'kick', i }); d.appendChild(x); }
    }
    box.appendChild(d);
  }
  $('#optBonus').checked = v.opts.bonus; $('#optPublic').checked = v.isPublic;
  $('#optBonus').disabled = $('#optPublic').disabled = !host;
  $('#lbBot').disabled = !host || v.seats.length >= 4;
  $('#lbStart').disabled = !host || v.seats.length < 2;
  $('#lbWait').textContent = host ? (v.seats.length < 2 ? 'Нужно минимум 2 игрока: позовите друга по коду или добавьте бота' : 'Всё готово, можно начинать') : 'Ждём, пока хост начнёт игру…';
}
$('#lbBot').onclick = () => net.send({ t: 'addBot' });
$('#lbStart').onclick = () => net.send({ t: 'start' });
$('#optBonus').onchange = (e) => net.send({ t: 'opts', bonus: e.target.checked });
$('#optPublic').onchange = (e) => net.send({ t: 'opts', isPublic: e.target.checked });
$('#lbLeave').onclick = () => net.send({ t: 'leave' });
$('#lbCode').onclick = async () => {
  const url = `${location.origin}/?room=${view.code}`;
  try { await navigator.clipboard.writeText(url); toast('Ссылка-приглашение скопирована'); } catch { toast(url); }
};

/* ---------- игровое поле ---------- */
const board = $('#board');
function buildBoard() {
  let h = '<g id="cells">';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    h += `<rect class="tile${(x + y) % 2 ? ' alt' : ''}" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="9"/>`;
    g.players.forEach((p) => {
      const sd = E.SIDES[p.side], c = p.color;
      if (sd.goal(x, y)) {
        const ang = p.side * 90;
        h += `<rect x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="9" fill="${c}" opacity=".1"/>` +
          `<g transform="translate(${cx(x) + S / 2} ${cy(y) + S / 2}) rotate(${ang})"><polyline class="chev" style="animation-delay:${((x + y) % 5) * 0.25}s" points="-9,6 0,-5 9,6" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/></g>`;
      }
      const [sx, sy] = sd.start, home = p.side % 2 === 0 ? y === sy : x === sx;
      if (home) h += `<rect x="${cx(x) + 3}" y="${cy(y) + 3}" width="${S - 6}" height="${S - 6}" rx="7" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 5" opacity=".5"/>`;
    });
  }
  h += '</g><g id="bonuses"></g><g id="walls"></g><g id="overlay"></g><g id="pawns">';
  g.players.forEach((p, i) => {
    h += `<g class="pawn" id="pawn${i}" style="transform:translate(${cx(p.x)}px,${cy(p.y)}px)">
      <ellipse cx="28" cy="47" rx="17" ry="5" fill="#000" opacity=".45" filter="url(#soft)"/>
      <ellipse class="ring" cx="28" cy="48" rx="25" ry="9" fill="none" stroke="${p.color}" stroke-width="2.5" filter="url(#glow)"/>
      <image class="bob" href="img/pawn${i}.webp" x="0" y="-8" width="56" height="56"/></g>`;
  });
  board.innerHTML = h + '</g>';
  if (!particles) particles = new Particles($('#pfx'), board);
  particles.vb = VB; particles.resize();
  buildCube(); if (g.roll) setCube(g.roll, false);
}

const wallRect = (o, x, y) => (o === 'h' ? { x: cx(x), y: cy(y) + S, w: 2 * S + GP, h: GP } : { x: cx(x) + S, y: cy(y), w: GP, h: 2 * S + GP });
function drawDynamic() {
  let b = '';
  Object.entries(g.bonus).forEach(([k, t]) => { const [x, y] = k.split(',').map(Number); b += `<image class="bonus" href="img/bonus_${t}.webp" x="${cx(x) + 9}" y="${cy(y) + 9}" width="38" height="38" style="animation-delay:${(x + y) % 4 * 0.3}s"/>`; });
  $('#bonuses').innerHTML = b;

  const my = canAct(), breakable = my && mode === 'break';
  let w = '';
  g.walls.forEach((wl, i) => {
    const r = wallRect(wl.o, wl.x, wl.y), c = COLORS[wl.owner], fresh = i >= prevWalls;
    const core = wl.o === 'h' ? `x="${r.x + 5}" y="${r.y + r.h / 2 - 1}" width="${r.w - 10}" height="2"` : `x="${r.x + r.w / 2 - 1}" y="${r.y + 5}" width="2" height="${r.h - 10}"`;
    w += `<g class="wallg${fresh ? ' fresh' : ''}${breakable ? ' breakable' : ''}" data-wall="${i}" style="color:${c}">
      <rect x="${r.x - 1}" y="${r.y - 1}" width="${r.w + 2}" height="${r.h + 2}" rx="6" fill="${c}" opacity=".55" filter="url(#soft)"/>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="${c}"/>
      <rect ${core} rx="1" fill="#fff" opacity=".9"/></g>`;
  });
  $('#walls').innerHTML = w; prevWalls = g.walls.length;

  let o = '';
  if (my && g.phase === 'act') {
    const p = E.cur(g);
    if (mode === 'move') {
      E.reach(g, p, E.maxSteps(g.roll)).forEach((d, k) => {
        const [x, y] = k.split(',').map(Number);
        o += `<rect class="hint" data-cell="${k}" x="${cx(x) + 3}" y="${cy(y) + 3}" width="${S - 6}" height="${S - 6}" rx="8" style="color:${p.color}"/><text class="hint-n" x="${cx(x) + S / 2}" y="${cy(y) + S / 2 + 5}" text-anchor="middle">${d}</text>`;
      });
    } else if (mode === 'wall' && preview) {
      const r = wallRect(preview.o, preview.x, preview.y), ok = E.wallLegal(g, preview.o, preview.x, preview.y).ok;
      o += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="${ok ? p.color : '#ef4444'}" opacity=".75" filter="url(#glow)"/>`;
    }
  }
  $('#overlay').innerHTML = o;
  g.players.forEach((p, i) => {
    const el = $('#pawn' + i); if (!el) return;
    el.style.transform = `translate(${cx(p.x)}px,${cy(p.y)}px)`;
    el.classList.toggle('turn', i === g.turn && !g.over);
  });
}

/* ---------- кубик ---------- */
const FACE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function buildCube() {
  $('#cube').style.transition = 'none';
  $('#cube').innerHTML = [1, 2, 3, 4, 5, 6].map((v) => `<div class="face f${v}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`).join('');
  $('#cube').style.transform = 'rotateX(-18deg) rotateY(24deg)';
  requestAnimationFrame(() => ($('#cube').style.transition = ''));
}
function setCube(v, anim = true) {
  const [ax, ay] = FACE[v];
  if (anim) cubeK++;
  const spin = anim ? 720 * cubeK : 0;
  $('#cube').style.transition = anim ? '' : 'none';
  $('#cube').style.transform = `rotateX(${ax + spin}deg) rotateY(${ay + spin}deg)`;
}

/* ---------- эффекты событий ---------- */
const center = (x, y) => [cx(x) + S / 2, cy(y) + S / 2];
function playFx(e) {
  const pl = g.players[e.p];
  switch (e.type) {
    case 'roll': setCube(e.r); for (let i = 0; i < 6; i++) setTimeout(() => sfx.play('tick'), i * 120); setTimeout(() => sfx.play('roll'), 800); break;
    case 'move': { const [x, y] = center(...e.to); setTimeout(() => particles.burst(x, y, pl.color, 22), 250); sfx.play('move'); break; }
    case 'wall': {
      const r = wallRect(e.o, e.x, e.y); particles.line(r.x, r.y + r.h / 2, r.x + r.w, r.y + r.h / 2, pl.color); if (e.o === 'v') particles.line(r.x + r.w / 2, r.y, r.x + r.w / 2, r.y + r.h, pl.color);
      sfx.play('wall'); const bw = $('#boardWrap'); bw.classList.remove('shake'); void bw.offsetWidth; bw.classList.add('shake'); break;
    }
    case 'break': { const r = wallRect(e.o, e.x, e.y); particles.burst(r.x + r.w / 2, r.y + r.h / 2, '#ffffff', 34, 1.4); sfx.play('break'); break; }
    case 'bonus': { const [x, y] = center(...e.at); particles.burst(x, y, '#fbbf24', 34, 1.3); sfx.play(e.type === 'freeze' ? 'freeze' : 'bonus'); toast(`${{ wall: '🧱', again: '🎲', freeze: '❄️' }[e.type]} ${pl.name}: ${E.BONUS[e.type]}`); break; }
    case 'skip': toast(e.why === 'freeze' ? `❄️ ${pl.name} пропускает ход` : `${pl.name}: ходов нет, пропуск`); break;
    case 'win': sfx.play('win'); particles.confetti(COLORS); setTimeout(() => showWin(e.p), 1200); break;
  }
}
function showWin(p) {
  if (!g || !g.over) return;
  const pl = g.players[p];
  $('#winName').innerHTML = `<span style="color:${pl.color};text-shadow:0 0 22px ${pl.color}">${esc(pl.name)}</span><br>побеждает!`;
  $('#winInfo').textContent = `Ходов: ${g.turns + 1} · Стен на поле: ${g.walls.length}`;
  const can = isLocal || view.you === view.host;
  $('#bAgain').classList.toggle('hidden', !can);
  $('#winWait').textContent = can ? '' : 'Ждём, пока хост предложит реванш…';
  $('#win').classList.remove('hidden');
}
$('#bAgain').onclick = () => net.send({ t: 'rematch' });
$('#bWinExit').onclick = $('#bExit').onclick = () => exitGame();
function exitGame() {
  if (g && !g.over && !confirm('Выйти из партии?')) return;
  $('#win').classList.add('hidden');
  if (isLocal) { net.close(); net = null; view = null; g = null; gameId = null; show('home'); } else net.send({ t: 'leave' });
}

/* ---------- интерфейс партии ---------- */
const canAct = () => !!g && !!view && !g.over && !pending && view.you === g.turn && g.phase === 'act';
function renderGame() {
  const p = E.cur(g), you = view.you;
  const myTurn = !g.over && you === g.turn;
  $('#boardWrap').style.setProperty('--cur', p.color);
  $('#players').innerHTML = g.players.map((q, i) => {
    const off = !isLocal && view.seats[i] && !view.seats[i].connected;
    return `<div class="pl ${i === g.turn && !g.over ? 'cur' : ''} ${q.skip > 0 ? 'frozen' : ''} ${off ? 'off' : ''}" data-i="${i}" style="color:${q.color}">
      <div class="nm">${avatar(i, 22)}${esc(q.name)}${i === you && !isLocal ? ' <small style="color:var(--mute)">(вы)</small>' : ''}${q.bot ? ' <small style="color:var(--mute)">🤖</small>' : ''}${off ? ' <small style="color:var(--mute)">офлайн</small>' : ''}</div>
      <div class="st"><span>🧱 <b>${q.walls}</b></span><span>→ <b>${E.dist(g, q)}</b> кл.</span></div></div>`;
  }).join('');
  $('#whoName').textContent = p.name; $('#whoName').style.color = p.color;
  $('.scene').classList.toggle('idle', g.roll === null);

  const key = `${g.id}:${g.turns}:${g.turn}:${g.phase}:${g.roll}`;
  if (key !== turnKey) {
    turnKey = key; preview = null;
    if (myTurn && g.phase === 'act') { const o = E.options(g); mode = o.move ? 'move' : o.wall ? 'wall' : 'break'; }
    if (myTurn && g.phase === 'roll' && !isLocal) sfx.play('turn');
  }
  const o = myTurn && g.phase === 'act' ? E.options(g) : { move: false, wall: false, brk: false };
  $('#rollInfo').textContent = g.roll ? (g.phase === 'act' ? `выпало ${g.roll}: ход до ${E.maxSteps(g.roll)} кл.` : '') : '';
  $('#rollBtn').classList.toggle('hidden', !(myTurn && g.phase === 'roll'));
  $('#rollBtn').disabled = pending;
  $('#acts').classList.toggle('hidden', !(myTurn && g.phase === 'act'));
  $$('#acts button').forEach((b) => {
    const m = b.dataset.m;
    b.classList.toggle('on', mode === m);
    b.disabled = (m === 'move' && !o.move) || (m === 'wall' && !o.wall) || (m === 'break' && !o.brk);
  });
  let hint = '';
  if (g.over) hint = 'Игра окончена';
  else if (you < 0 || !myTurn) hint = isLocal ? 'Думает ИИ…' : `Ходит ${p.name}…`;
  else if (g.phase === 'roll') hint = 'Ваш ход: бросьте кубик (Пробел)';
  else if (mode === 'move') hint = 'Выберите клетку. Можно остановиться раньше.';
  else if (mode === 'wall') hint = 'Наведите на линию между клетками и кликните. Зелёное можно, красное нельзя.';
  else hint = 'Кликните по стене, которую хотите сломать.';
  $('#hint').textContent = hint;
  $('#log').innerHTML = g.log.slice(0, 12).map((l) => `<div>${esc(l)}</div>`).join('');
  $('#emotes').classList.toggle('hidden', isLocal);
  drawDynamic();
}
const EMOJIS = ['😀', '😎', '😡', '😭', '👍', '🔥'];
$('#emotes').innerHTML = EMOJIS.map((e) => `<button>${e}</button>`).join('');
$$('#emotes button').forEach((b) => (b.onclick = () => net.send({ t: 'emote', e: b.textContent })));
function showEmote(seat, e) {
  const card = $(`.pl[data-i="${seat}"]`); if (!card) return;
  const s = document.createElement('span'); s.className = 'bubble'; s.textContent = e; card.appendChild(s);
  sfx.play('emote'); setTimeout(() => s.remove(), 2300);
}

/* ---------- ввод ---------- */
function svgPoint(e) { const r = board.getBoundingClientRect(), k = VB / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; }
function wallAt(e) {
  const [px, py] = svgPoint(e);
  const fx = (px - PAD + GP / 2) / P - 1, fy = (py - PAD + GP / 2) / P - 1;
  const ix = Math.max(0, Math.min(N - 2, Math.round(fx))), iy = Math.max(0, Math.min(N - 2, Math.round(fy)));
  return { o: Math.abs(fx - ix) >= Math.abs(fy - iy) ? 'h' : 'v', x: ix, y: iy };
}
board.addEventListener('pointerdown', (e) => { lastPtr = e.pointerType; });
board.addEventListener('pointermove', (e) => {
  if (!canAct() || mode !== 'wall' || e.pointerType === 'touch') return;
  const w = wallAt(e);
  if (!preview || preview.o !== w.o || preview.x !== w.x || preview.y !== w.y) { preview = w; drawDynamic(); }
});
board.addEventListener('pointerleave', () => { if (g && mode === 'wall' && preview) { preview = null; drawDynamic(); } });
function send(m) { pending = true; net.send(m); setTimeout(() => { if (pending) { pending = false; if (g) renderGame(); } }, 2500); }
board.addEventListener('click', (e) => {
  if (!canAct()) return;
  if (mode === 'move') {
    const c = e.target.closest('[data-cell]'); if (c) { const [x, y] = c.dataset.cell.split(',').map(Number); send({ t: 'move', x, y }); }
  } else if (mode === 'wall') {
    const w = wallAt(e);
    if (lastPtr === 'touch' && !(preview && preview.o === w.o && preview.x === w.x && preview.y === w.y)) { preview = w; drawDynamic(); return; }
    const lg = E.wallLegal(g, w.o, w.x, w.y);
    if (!lg.ok) { toast('🚫 ' + lg.why); sfx.play('error'); return; }
    send({ t: 'wall', ...w });
  } else if (mode === 'break') {
    const c = e.target.closest('[data-wall]'); if (c) send({ t: 'break', i: +c.dataset.wall });
  }
});
function setMode(m) { if (!canAct()) return; const b = $(`#acts [data-m=${m}]`); if (b.disabled) return; mode = m; preview = null; renderGame(); }
$('#acts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });
$('#rollBtn').onclick = () => { if (g && g.phase === 'roll' && view.you === g.turn) send({ t: 'roll' }); };
document.addEventListener('keydown', (e) => {
  if (!g || $('#game').classList.contains('hidden') || /INPUT/.test(document.activeElement.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); if (g.phase === 'roll' && view.you === g.turn && !pending) send({ t: 'roll' }); }
  else if (e.key === 'm' || e.key === 'M') setMode('move');
  else if (e.key === 'w' || e.key === 'W') setMode('wall');
  else if (e.key === 'b' || e.key === 'B') setMode('break');
  else if (e.key === 'Escape') { preview = null; $('#rules').classList.add('hidden'); setMode('move'); }
});

/* ---------- прочее ---------- */
const openRules = () => $('#rules').classList.remove('hidden');
$('#bRules').onclick = $('#bRules2').onclick = openRules;
$$('[data-close]').forEach((b) => (b.onclick = () => $('#rules').classList.add('hidden')));
const muteLabel = () => ($('#bMute').textContent = sfx.muted ? '🔇 Без звука' : '🔊 Звук');
$('#bMute').onclick = () => { sfx.toggle(); muteLabel(); }; muteLabel();
bgFx($('#bgfx'));

// Возврат в комнату после обновления страницы и вход по ссылке ?room=CODE
if (canOnline) {
  useRemote();
  const code = new URLSearchParams(location.search).get('room');
  if (code) { $('#codeIn').value = code.toUpperCase().slice(0, 4); show('browse'); net.send({ t: 'list' }); toast('Введите имя на главной или сразу нажмите «Войти»'); }
}
