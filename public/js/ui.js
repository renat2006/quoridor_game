import * as E from './engine.js';
import { RemoteNet, LocalNet } from './net.js';
import { sfx } from './fx.js';
import * as A from './art.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { cx, cy, S, VB, GP, PAD, P, N } = A;

let net = null, view = null, g = null, gameId = null, seen = 0;
let mode = 'move', preview = null, turnKey = '', prevWalls = 0, pending = false, lastPtr = 'mouse';
let isLocal = false, wasOnline = false, listTimer = 0, rollTimer = 0, dieShown = null, rolling = false;
const localCfg = { n: 2, names: ['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4'], bot: [false, true, true, true], bonus: true };

/* ---------- тема, иконки, общие мелочи ---------- */
const THEMES = ['auto', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}
let theme = 'auto'; try { theme = localStorage.wd_theme || 'auto'; } catch {}
applyTheme(theme);
function cycleTheme() {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; applyTheme(theme);
  try { localStorage.wd_theme = theme; } catch {}
  toast({ auto: 'Тема: как в системе', light: 'Тема: светлая', dark: 'Тема: тёмная' }[theme]);
}
$$('[data-icon]').forEach((el) => {
  const svg = A.icon(el.dataset.icon, +el.dataset.size || 20);
  el.outerHTML = el.id ? svg.replace('<svg', `<svg id="${el.id}"`) : svg;
});
$$('[data-logo]').forEach((el) => { el.outerHTML = A.logo(+el.dataset.logo); });

let toastT; const toastEl = $('#toast');
function toast(t, err = false) {
  toastEl.textContent = t; toastEl.classList.toggle('err', err); toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  clearInterval(listTimer);
  if (id === 'find') { net && net.send({ t: 'list' }); listTimer = setInterval(() => net && net.send({ t: 'list' }), 2500); }
  window.scrollTo(0, 0);
}
const name = () => { const v = $('#name').value.trim() || 'Игрок'; try { localStorage.wd_name = v; } catch {} return v; };
try { $('#name').value = localStorage.wd_name || ''; } catch {}
const setSwitch = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-checked', on); };

/* ---------- транспорт ---------- */
const canOnline = location.protocol.startsWith('http');
function useRemote() {
  if (net instanceof RemoteNet) return net;
  net?.close?.(); net = new RemoteNet(); net.onmsg = onMsg; return net;
}
function useLocal() { net?.close?.(); net = new LocalNet(); net.onmsg = onMsg; return net; }

function onMsg(m) {
  switch (m.t) {
    case 'status': if (m.online) wasOnline = true; $('#conn').classList.toggle('hidden', m.online || !wasOnline); break;
    case 'room': onRoom(m); break;
    case 'list': renderRooms(m.rooms); break;
    case 'err': pending = false; toast(m.msg, true); sfx.play('error'); if (g) renderGame(); break;
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
    gameId = ng.id; g = ng; seen = ng.fxSeq; prevWalls = 0; turnKey = ''; dieShown = null; mode = 'move'; preview = null;
    buildBoard(); $('#win').classList.add('hidden'); show('game');
    if (g.roll) setDie(g.roll, false);
    if (g.over) showWin(g.winner);
  } else {
    const evs = ng.fx.filter((e) => e.seq > seen); g = ng; seen = ng.fxSeq;
    evs.forEach(playFx);
  }
  renderGame();
}

/* ---------- главная ---------- */
$('#heroBoard').innerHTML = A.staticBoard(A.demoGame());
if (!canOnline) { $('#offlineNote').classList.remove('hidden'); $('#bCreate').disabled = true; $('#bFind').disabled = true; }
$$('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));
$('#bCreate').onclick = () => { $('#roomTitle').value ||= name() + ': партия'; show('create'); };
$('#bFind').onclick = () => { useRemote(); show('find'); updateCode(); };
$('#bLocal').onclick = () => { renderLocal(); show('local'); };
$$('[data-act=rules]').forEach((b) => (b.onclick = () => $('#rules').classList.remove('hidden')));
$$('[data-close]').forEach((b) => (b.onclick = () => $('#rules').classList.add('hidden')));
$$('[data-act=theme]').forEach((b) => (b.onclick = cycleTheme));
$('[data-act=mute]').onclick = () => { sfx.toggle(); muteLabel(); };
function muteLabel() { $('#muteIc').closest('button').querySelector('span').textContent = sfx.muted ? 'Без звука' : 'Звук'; $('#muteIc').outerHTML = A.icon(sfx.muted ? 'mute' : 'sound').replace('<svg', '<svg id="muteIc"'); }
muteLabel();
$('[data-act=exit]').onclick = () => exitGame();
$('[data-act=log]').onclick = () => $('#logbox').scrollIntoView({ behavior: 'smooth', block: 'center' });

/* ---------- создание, поиск ---------- */
$('#roomPublic').onclick = (e) => setSwitch(e.currentTarget, !e.currentTarget.classList.contains('on'));
$('#bCreateGo').onclick = () => useRemote().send({ t: 'create', name: name(), title: $('#roomTitle').value, isPublic: $('#roomPublic').classList.contains('on') });

const cells = $$('#codeCells .cd');
const codeVal = () => cells.map((c) => c.value).join('').toUpperCase();
function updateCode() { $('#bJoinCode').disabled = codeVal().length !== 4; }
cells.forEach((c, i) => {
  c.addEventListener('input', () => {
    c.value = c.value.replace(/[^A-Za-zА-Яа-я]/g, '').toUpperCase().slice(0, 1);
    if (c.value && cells[i + 1]) cells[i + 1].focus(); updateCode();
  });
  c.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !c.value && cells[i - 1]) { cells[i - 1].focus(); cells[i - 1].value = ''; updateCode(); }
    if (e.key === 'Enter' && codeVal().length === 4) joinCode(codeVal());
  });
  c.addEventListener('paste', (e) => {
    const t = (e.clipboardData.getData('text') || '').replace(/[^A-Za-zА-Яа-я]/g, '').toUpperCase().slice(0, 4);
    if (!t) return; e.preventDefault(); cells.forEach((x, k) => (x.value = t[k] || '')); (cells[Math.min(t.length, 3)]).focus(); updateCode();
  });
});
function joinCode(c) { c = String(c).trim().toUpperCase(); if (c.length !== 4) return toast('Введите 4-буквенный код', true); useRemote().send({ t: 'join', code: c, name: name() }); }
$('#bJoinCode').onclick = () => joinCode(codeVal());
function renderRooms(rooms) {
  $('#roomsCount').textContent = rooms.length ? `обновляется сама · ${rooms.length}` : '';
  $('#roomsEmpty').classList.toggle('hidden', rooms.length > 0);
  $('.table-wrap').classList.toggle('hidden', rooms.length === 0);
  $('#roomList').innerHTML = rooms.map((r) => `<tr><td><b>${esc(r.title)}</b></td><td class="muted-2">${esc(r.host)}</td>
    <td>${Array.from({ length: r.max }, (_, i) => `<span class="dot${i < r.players ? ' on' : ''}"></span>`).join('')}<span class="mono note"> ${r.players}/${r.max}</span></td>
    <td class="code-cell">${r.code}</td><td style="text-align:right"><button class="btn line sm" data-join="${r.code}">Войти</button></td></tr>`).join('');
  $$('[data-join]').forEach((b) => (b.onclick = () => joinCode(b.dataset.join)));
}

/* ---------- локальная игра ---------- */
function renderLocal() {
  const seg = $('#segN'); seg.innerHTML = '';
  [2, 3, 4].forEach((n) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n + ' игрока'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', localCfg.n === n); b.onclick = () => { localCfg.n = n; renderLocal(); }; seg.appendChild(b); });
  const box = $('#localSeats'); box.innerHTML = '';
  for (let i = 0; i < localCfg.n; i++) {
    const r = document.createElement('div'); r.className = 'lrow';
    r.innerHTML = `${A.shape(i, 36)}<input class="input" maxlength="14" value="${esc(localCfg.names[i])}" aria-label="Имя игрока ${i + 1}"><label class="tog">ИИ<button type="button" class="sw${localCfg.bot[i] ? ' on' : ''}" role="switch" aria-checked="${localCfg.bot[i]}" aria-label="Бот"><span></span></button></label>`;
    r.querySelector('input').oninput = (e) => (localCfg.names[i] = e.target.value || 'Игрок ' + (i + 1));
    r.querySelector('.sw').onclick = (e) => { const b = e.currentTarget; localCfg.bot[i] = !localCfg.bot[i]; setSwitch(b, localCfg.bot[i]); };
    box.appendChild(r);
  }
  setSwitch($('#localBonus'), localCfg.bonus);
}
$('#localBonus').onclick = (e) => { localCfg.bonus = !localCfg.bonus; setSwitch(e.currentTarget, localCfg.bonus); };
$('#bLocalGo').onclick = () => {
  const seats = Array.from({ length: localCfg.n }, (_, i) => ({ name: localCfg.names[i].trim() || 'Игрок ' + (i + 1), bot: localCfg.bot[i] }));
  useLocal().setup(seats, { bonus: localCfg.bonus });
};

/* ---------- лобби ---------- */
function renderLobby() {
  const v = view, host = v.you === v.host;
  $('#lbCode').textContent = v.code; $('#lbTitle').textContent = v.title; $('#lbCount').textContent = `${v.seats.length} / 4`;
  const box = $('#lbSeats'); box.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const s = v.seats[i], d = document.createElement('div');
    if (s) {
      d.className = 'slot';
      const tags = (i === v.host ? `<span class="tag">${A.icon('crown', 14)}хост</span>` : '') + (s.bot ? `<span class="tag">${A.icon('bot', 14)}бот</span>` : '') + (!s.connected && !s.bot ? `<span class="tag">${A.icon('offline', 14)}офлайн</span>` : '');
      d.innerHTML = `${A.shape(i, 36)}<div class="nm">${esc(s.name)}${i === v.you ? ' <i>· вы</i>' : ''}</div>${tags}`;
      if (host && i !== v.you) { const x = document.createElement('button'); x.className = 'xbtn'; x.innerHTML = A.icon('x'); x.setAttribute('aria-label', 'Убрать ' + s.name); x.onclick = () => net.send({ t: 'kick', i }); d.appendChild(x); } else d.insertAdjacentHTML('beforeend', '<span class="pad44"></span>');
    } else {
      d.className = 'slot dashed'; d.style.paddingRight = '12px';
      d.innerHTML = `${A.shape(i, 36, 1.75).replace('<svg', '<svg style="opacity:.35"')}<div class="nm" style="color:var(--muted);font-weight:400">Свободно</div>`;
      if (host && i === v.seats.length) { const b = document.createElement('button'); b.className = 'btn line sm'; b.innerHTML = A.icon('plus', 18) + 'Добавить бота'; b.onclick = () => net.send({ t: 'addBot' }); d.appendChild(b); }
      else if (!host) d.insertAdjacentHTML('beforeend', '<span class="note">ждём игрока</span>');
    }
    box.appendChild(d);
  }
  const bonus = $('#optBonus'), pub = $('#optPublic');
  setSwitch(bonus, v.opts.bonus); setSwitch(pub, v.isPublic);
  bonus.disabled = pub.disabled = !host;
  $('#optBonusTxt').textContent = host ? '' : (v.opts.bonus ? 'Включены' : 'Выключены');
  $('#optPublicTxt').textContent = host ? '' : (v.isPublic ? 'Видна' : 'Только по коду');
  $('#lbStart').classList.toggle('hidden', !host); $('#lbWait').classList.toggle('hidden', host);
  $('#lbStart').disabled = v.seats.length < 2;
  $('#lbNote').textContent = host ? (v.seats.length < 2 ? 'Нужно минимум 2 игрока: позовите друга по коду или добавьте бота.' : '') : '';
}
$('#optBonus').onclick = (e) => net.send({ t: 'opts', bonus: !e.currentTarget.classList.contains('on') });
$('#optPublic').onclick = (e) => net.send({ t: 'opts', isPublic: !e.currentTarget.classList.contains('on') });
$('#lbStart').onclick = () => net.send({ t: 'start' });
$('#lbLeave').onclick = () => net.send({ t: 'leave' });
const copy = async (txt, ok) => { try { await navigator.clipboard.writeText(txt); toast(ok); } catch { toast(txt); } };
$('#lbLink').onclick = () => copy(`${location.origin}/?room=${view.code}`, 'Ссылка-приглашение скопирована');
$('#lbCopy').onclick = () => copy(view.code, 'Код скопирован');

/* ---------- поле ---------- */
const board = $('#board');
function buildBoard() {
  board.innerHTML = A.boardDefs + `<g id="base">${A.boardBase(g)}</g><g id="bonuses"></g><g id="walls"></g><g id="overlay"></g><g id="pawns">` +
    g.players.map((p) => A.pawnGroup(p, { id: 'pawn' + p.i })).join('') + '</g>';
  $('#gCode').textContent = isLocal ? 'локально' : view.code;
  $('#plN').textContent = g.n;
  buildDie();
}

function drawDynamic() {
  $('#bonuses').innerHTML = A.bonusLayer(g);
  const my = canAct();
  $('#walls').innerHTML = A.wallLayer(g, { fromIndex: prevWalls, breakable: my && mode === 'break' });
  prevWalls = g.walls.length;
  let o = '';
  if (my) {
    const p = E.cur(g);
    if (mode === 'move') o = A.hintLayer(g, p, E.reach(g, p, E.maxSteps(g.roll)));
    else if (mode === 'wall' && preview) o = A.previewLayer(preview, E.wallLegal(g, preview.o, preview.x, preview.y).ok, p);
  }
  $('#overlay').innerHTML = o;
  g.players.forEach((p) => {
    const el = $('#pawn' + p.i); if (!el) return;
    el.style.transform = `translate(${cx(p.x) + S / 2}px,${cy(p.y) + S / 2}px)`;
    el.classList.toggle('turn', p.i === g.turn && !g.over);
    const fz = el.querySelector('.fz'), had = el.classList.contains('frozen');
    if ((p.skip > 0) !== had) { el.classList.toggle('frozen', p.skip > 0); fz.innerHTML = p.skip > 0 ? A.frozenMark() : ''; }
  });
}

/* ---------- кубик ---------- */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieEl = $('#die');
function buildDie() { dieEl.innerHTML = Array.from({ length: 9 }, () => '<i></i>').join(''); setDie(null, false); }
function setDie(v, label = true) {
  dieEl.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', !!v && PIPS[v].includes(i)));
  dieEl.classList.toggle('idle', !v);
  dieEl.setAttribute('aria-label', v ? `Кубик: ${v}` : 'Кубик'); dieShown = v;
}
function rollAnim(final) {
  clearInterval(rollTimer); rolling = true;
  let n = 0;
  dieEl.animate([{ transform: 'rotate(-6deg)' }, { transform: 'rotate(-180deg) translateY(-14px)', offset: 0.35 }, { transform: 'rotate(360deg) translateY(-6px)', offset: 0.7 }, { transform: 'rotate(-3deg) translateY(2px)', offset: 0.88 }, { transform: 'rotate(-6deg)' }], { duration: 1000, easing: 'cubic-bezier(.2,.8,.2,1)' });
  rollTimer = setInterval(() => { setDie(1 + Math.floor(Math.random() * 6)); sfx.play('tick'); if (++n >= 8) { clearInterval(rollTimer); setDie(final); rolling = false; } }, 90);
}

/* ---------- эффекты событий ---------- */
function playFx(e) {
  const pl = g.players[e.p];
  switch (e.type) {
    case 'roll': rollAnim(e.r); setTimeout(() => sfx.play('roll'), 800); break;
    case 'move': {
      const el = $('#pawn' + e.p)?.querySelector('.pawn-body');
      el?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-12px)', offset: 0.45 }, { transform: 'translateY(0)' }], { duration: 120 + 160 * Math.min(3, e.steps), easing: 'cubic-bezier(.2,.8,.2,1)' });
      sfx.play('move'); break;
    }
    case 'wall': sfx.play('wall'); break;
    case 'break': {
      const r = A.wallRect(e.o, e.x, e.y);
      $('#overlay').insertAdjacentHTML('beforeend', `<rect class="ghost" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="${A.pv(e.p)}" stroke="var(--stroke)" stroke-width="1.5" style="transform-box:fill-box;transform-origin:center"/>`);
      sfx.play('break'); break;
    }
    case 'bonus': sfx.play(e.type === 'freeze' ? 'freeze' : 'bonus'); toast(`${pl.name}: ${E.BONUS[e.type]}`); break;
    case 'skip': toast(e.why === 'freeze' ? `${pl.name} пропускает ход: заморожен` : `${pl.name}: ходов нет, пропуск`); break;
    case 'win': sfx.play('win'); fillGoal(e.p); setTimeout(() => showWin(e.p), 1200); break;
  }
}
function fillGoal(i) {
  const p = g.players[i], goal = E.SIDES[p.side].goal; let h = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (goal(x, y)) h += `<rect class="sweep" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="6" fill="${A.pv(i)}" fill-opacity=".5" style="transform-box:fill-box;transform-origin:left"/>`;
  $('#overlay').insertAdjacentHTML('beforeend', h);
  $$('#overlay .sweep').forEach((r, k) => r.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 500, delay: k * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }));
}

/* ---------- победа ---------- */
const EDGE = ['верхнего', 'правого', 'нижнего', 'левого'];
function showWin(i) {
  if (!g || !g.over) return;
  const p = g.players[i];
  $('#winTrophy').innerHTML = A.trophy(88);
  $('#winT').textContent = p.name; $('#winSub').textContent = `первым дошёл до ${EDGE[p.side]} края`;
  const t = Math.max(0, Math.round(((g.t1 || Date.now()) - g.t0) / 1000));
  $('#winStats').innerHTML = [[g.turns + 1, 'ходов'], [g.walls.length, 'стен на поле'], [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 'партия']].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
  const rank = [...g.players].sort((a, b) => (b.i === i) - (a.i === i) || E.dist(g, a) - E.dist(g, b));
  $('#winRows').innerHTML = rank.map((q, k) => `<tr><td class="mono" style="${k ? 'color:var(--muted)' : 'font-weight:600'}">${k + 1}</td><td><span class="pn" style="${k ? '' : 'font-weight:600'}">${A.shape(q.i, 18, 1.75)}${esc(q.name)}${q.bot ? ' <small class="note">бот</small>' : ''}</span></td><td class="mono r">${q.walls}</td><td class="mono r">${E.dist(g, q)}</td></tr>`).join('');
  $('#winBoard').innerHTML = A.staticBoard(g);
  const can = isLocal || (view && view.you === view.host);
  $('#bAgain').classList.toggle('hidden', !can);
  $('#winNote').textContent = can ? '' : 'Ждём хоста: реванш запускает он.';
  $('#win').classList.remove('hidden');
}
$('#bAgain').onclick = () => net.send({ t: 'rematch' });
$('#bWinExit').onclick = () => exitGame(true);
function exitGame(force) {
  if (!force && g && !g.over && !confirm('Выйти из партии?')) return;
  $('#win').classList.add('hidden');
  if (isLocal) { net.close(); net = null; view = null; g = null; gameId = null; show('home'); } else net.send({ t: 'leave' });
}

/* ---------- панель партии ---------- */
const canAct = () => !!g && !!view && !g.over && !pending && view.you === g.turn && g.phase === 'act';
const logLine = (l) => `<li>${l.p >= 0 ? A.shape(l.p, 12, 2) : '<span></span>'}<span>${esc(l.t)}</span><small>${l.n}</small></li>`;
function renderGame() {
  const p = E.cur(g), you = view.you, myTurn = !g.over && you === g.turn;
  $('#gTurn').textContent = g.turns + 1;
  $('#players').innerHTML = g.players.map((q) => {
    const off = !isLocal && view.seats[q.i] && !view.seats[q.i].connected && !q.bot;
    const cur = q.i === g.turn && !g.over;
    const badge = cur ? '<span class="badge">Ходит</span>' : q.skip > 0 ? `<span class="badge dash">${A.icon('snow', 14)}пропуск</span>` : q.bot ? `<span class="badge soft">${A.icon('bot', 14)}бот</span>` : off ? `<span class="badge soft">${A.icon('offline', 14)}офлайн</span>` : '<span></span>';
    return `<div class="pc${cur ? ' cur' : ''}${q.skip > 0 ? ' frozen' : ''}${off ? ' off' : ''}" data-i="${q.i}">${A.shape(q.i, 40)}
      <div style="min-width:0"><div class="n">${esc(q.name)}${q.i === you && !isLocal ? ' <i>· вы</i>' : ''}</div>
      <div class="st"><span title="Стены">${A.icon('wall', 16)}<b class="mono" style="font-weight:500">${q.walls}</b><span class="lab">${plural(q.walls, 'стена', 'стены', 'стен')}</span></span><span title="До цели">${A.icon('flag', 16)}<b class="mono" style="font-weight:500">${E.dist(g, q)}</b><span class="lab">до цели</span></span></div></div>${badge}</div>`;
  }).join('');
  $('#whoShape').innerHTML = A.shape(p.i, 32); $('#whoName').textContent = p.name;
  $('#turnrow').innerHTML = `<div class="t">${A.shape(p.i, 20, 2.5)}Ходит ${esc(p.name)}${myTurn && !isLocal ? ' <i>· вы</i>' : ''}</div><span class="note">Ход <b class="mono" style="color:var(--ink)">${g.turns + 1}</b></span>`;

  const key = `${g.id}:${g.turns}:${g.turn}:${g.phase}:${g.roll}`;
  if (key !== turnKey) {
    turnKey = key; preview = null;
    if (myTurn && g.phase === 'act') { const o = E.options(g); mode = o.move ? 'move' : o.wall ? 'wall' : 'break'; }
    if (myTurn && g.phase === 'roll' && !isLocal) sfx.play('turn');
  }
  const o = myTurn && g.phase === 'act' ? E.options(g) : { move: false, wall: false, brk: false };
  if (g.roll && dieShown !== g.roll && !rolling) setDie(g.roll);
  $('#dNum').textContent = g.roll ?? '–';
  $('#dTxt').textContent = g.roll && g.phase === 'act' ? `ход до ${E.maxSteps(g.roll)} ${plural(E.maxSteps(g.roll), 'клетки', 'клеток', 'клеток')}` : (myTurn ? 'ваш бросок' : '');
  const canRoll = myTurn && g.phase === 'roll';
  $('#rollBtn').disabled = !canRoll || pending;
  $('#rollTxt').textContent = canRoll ? 'Бросить кубик' : g.roll ? 'Кубик брошен' : 'Ждём бросок';
  $('#dieBtn').disabled = !canRoll || pending;
  $('#dock').classList.toggle('mine', myTurn);
  $('#aWall').textContent = `${p.walls} шт.`; $('#aBreak').textContent = g.roll === 6 ? `${g.walls.length} шт.` : 'нужна 6';
  $$('#acts button').forEach((b) => {
    const m = b.dataset.m;
    b.disabled = !myTurn || g.phase !== 'act' || (m === 'move' && !o.move) || (m === 'wall' && !o.wall) || (m === 'break' && !o.brk);
    b.setAttribute('aria-pressed', myTurn && g.phase === 'act' && mode === m);
  });
  let hint = '';
  if (g.over) hint = 'Игра окончена.';
  else if (!myTurn) hint = isLocal ? 'Думает бот…' : `Ходит ${p.name}…`;
  else if (g.phase === 'roll') hint = 'Ваш ход: бросьте кубик (Пробел).';
  else if (mode === 'move') hint = 'Выберите клетку. Цифра: сколько шагов до неё.';
  else if (mode === 'wall') hint = 'Наведите на линию между клетками и кликните. Цель: ' + `${EDGE[p.side]} край.`;
  else hint = 'Кликните по стене, которую хотите сломать.';
  $('#hint').innerHTML = `${A.icon('walk')}<span>${esc(hint)}</span>`;
  $('#log').innerHTML = g.log.slice(0, 8).map(logLine).join('');
  $('#emotes').classList.toggle('hidden', isLocal); $('#reactL').classList.toggle('hidden', isLocal);
  const touchConfirm = myTurn && mode === 'wall' && preview && lastPtr === 'touch';
  $('#confirm').classList.toggle('hidden', !touchConfirm);
  drawDynamic();
}
function plural(n, a, b, c) { const m = n % 100, k = n % 10; return m > 10 && m < 15 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; }

const EMOJIS = ['👍', '👏', '😮', '😂', '🤔', '😤'];
$('#emotes').innerHTML = EMOJIS.map((e, i) => `<button aria-label="Реакция ${i + 1}">${e}</button>`).join('');
$$('#emotes button').forEach((b) => (b.onclick = () => net.send({ t: 'emote', e: b.textContent })));
function showEmote(seat, e) {
  const card = $(`.pc[data-i="${seat}"]`); if (!card) return;
  const s = document.createElement('div'); s.className = 'bubble'; s.textContent = e; card.appendChild(s);
  sfx.play('emote'); setTimeout(() => s.remove(), 2500);
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
board.addEventListener('pointerleave', (e) => { if (g && mode === 'wall' && preview && e.pointerType !== 'touch') { preview = null; drawDynamic(); } });
function send(m) { pending = true; renderGame(); net.send(m); setTimeout(() => { if (pending) { pending = false; if (g) renderGame(); } }, 2500); }
function placePreview() {
  const lg = E.wallLegal(g, preview.o, preview.x, preview.y);
  if (!lg.ok) { toast(lg.why, true); sfx.play('error'); return; }
  const w = preview; preview = null; send({ t: 'wall', ...w });
}
board.addEventListener('click', (e) => {
  if (!canAct()) return;
  if (mode === 'move') {
    const c = e.target.closest('[data-cell]'); if (c) { const [x, y] = c.dataset.cell.split(',').map(Number); send({ t: 'move', x, y }); }
  } else if (mode === 'wall') {
    const w = wallAt(e);
    if (lastPtr === 'touch') { preview = w; renderGame(); return; }
    preview = w; placePreview();
  } else if (mode === 'break') {
    const c = e.target.closest('[data-wall]'); if (c) send({ t: 'break', i: +c.dataset.wall });
  }
});
$('#cfNo').onclick = () => { preview = null; renderGame(); };
$('#cfYes').onclick = () => { if (preview) placePreview(); };
function setMode(m) { if (!canAct()) return; const b = $(`#acts [data-m=${m}]`); if (b.disabled) return; mode = m; preview = null; renderGame(); }
$('#acts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });
const doRoll = () => { if (g && g.phase === 'roll' && view.you === g.turn && !pending) send({ t: 'roll' }); };
$('#rollBtn').onclick = doRoll; $('#dieBtn').onclick = doRoll;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('#rules').classList.add('hidden'); if (g) { preview = null; setMode('move'); } return; }
  if (!g || $('#game').classList.contains('hidden') || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); doRoll(); }
  else if (e.key === 'm' || e.key === 'M') setMode('move');
  else if (e.key === 'w' || e.key === 'W') setMode('wall');
  else if (e.key === 'b' || e.key === 'B') setMode('break');
});

// Возврат в комнату после обновления страницы и вход по ссылке ?room=CODE
if (canOnline) {
  useRemote();
  const code = new URLSearchParams(location.search).get('room');
  if (code && /^[A-Za-z]{4}$/.test(code)) {
    show('find'); code.toUpperCase().split('').forEach((c, i) => (cells[i].value = c)); updateCode(); cells[3].focus();
    toast('Приглашение: нажмите «Войти»');
  }
}
