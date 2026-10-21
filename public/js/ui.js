import * as E from './engine.js';
import { RemoteNet, LocalNet } from './net.js';
import { sfx } from './fx.js';
import * as A from './art.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { cx, cy, S, VB, GP, PAD, P, N } = A;
const START_DIST = N - 1;

let net = null, view = null, g = null, gameId = null, seen = 0;
let mode = 'move', preview = null, turnKey = '', prevWalls = 0, pending = false, lastPtr = 'mouse';
let isLocal = false, wasOnline = false, listTimer = 0, rollTimer = 0, dieShown = null, rolling = false;
const localCfg = { n: 2, names: ['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4'], bot: [false, true, true, true], bonus: true };

/* ---------- тема, иконки, мелочи ---------- */
const THEMES = ['auto', 'light', 'dark'];
const applyTheme = (t) => (t === 'auto' ? document.documentElement.removeAttribute('data-theme') : (document.documentElement.dataset.theme = t));
let theme = 'auto'; try { theme = localStorage.wd_theme || 'auto'; } catch {}
applyTheme(theme);
function cycleTheme() {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; applyTheme(theme);
  try { localStorage.wd_theme = theme; } catch {}
  toast({ auto: 'Тема как в системе', light: 'Светлая тема', dark: 'Тёмная тема' }[theme]);
}
$$('[data-icon]').forEach((el) => {
  const svg = A.icon(el.dataset.icon, +el.dataset.size || 20);
  el.outerHTML = el.id ? svg.replace('<svg', `<svg id="${el.id}"`) : svg;
});
$$('[data-logo]').forEach((el) => { el.outerHTML = A.logo(+el.dataset.logo); });
A.installDefs();

let toastT; const toastEl = $('#toast');
function toast(t, err = false) {
  toastEl.textContent = t; toastEl.classList.toggle('err', err); toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  document.body.classList.remove('sheet-open');
  clearInterval(listTimer);
  if (id === 'find') { net && net.send({ t: 'list' }); listTimer = setInterval(() => net && net.send({ t: 'list' }), 2500); }
  window.scrollTo(0, 0);
}
const name = () => { const v = $('#name').value.trim() || 'Игрок'; try { localStorage.wd_name = v; } catch {} return v; };
try { $('#name').value = localStorage.wd_name || ''; } catch {}
const setSwitch = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-checked', on); };
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 15 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
const copy = async (txt, ok) => { try { await navigator.clipboard.writeText(txt); toast(ok); } catch { toast(txt); } };

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
    gameId = ng.id; g = ng; seen = ng.fxSeq; prevWalls = g.walls.length; turnKey = ''; dieShown = null; mode = 'move'; preview = null;
    buildBoard(); $('#win').classList.add('hidden'); show('game');
    if (g.roll) setDie(g.roll);
    if (g.over) showWin(g.winner);
  } else {
    const evs = ng.fx.filter((e) => e.seq > seen); g = ng; seen = ng.fxSeq;
    evs.forEach(playFx);
  }
  renderGame();
}

/* ---------- главная ---------- */
$('#heroBoard').innerHTML = A.staticBoard(A.demoGame(), 0);
if (!canOnline) { $('#offlineNote').classList.remove('hidden'); $('#bCreate').disabled = true; $('#bFind').disabled = true; }
$$('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));
$('#bCreate').onclick = () => { $('#roomTitle').value ||= name() + ': партия'; show('create'); setTimeout(() => $('#roomTitle').focus(), 50); };
$('#bFind').onclick = () => { useRemote(); show('find'); updateCode(); setTimeout(() => cells[0].focus(), 50); };
$('#bLocal').onclick = () => { renderLocal(); show('local'); };
$$('[data-act=rules]').forEach((b) => (b.onclick = () => { $('#rules').classList.remove('hidden'); $('#rules .ibtn').focus(); }));
$$('[data-close]').forEach((b) => (b.onclick = () => $('#rules').classList.add('hidden')));
$('#rules').addEventListener('click', (e) => { if (e.target.id === 'rules') $('#rules').classList.add('hidden'); });
$$('[data-act=theme]').forEach((b) => (b.onclick = cycleTheme));
$('[data-act=mute]').onclick = () => { sfx.toggle(); muteLabel(); toast(sfx.muted ? 'Звук выключен' : 'Звук включён'); };
function muteLabel() { const b = $('[data-act=mute]'); b.innerHTML = A.icon(sfx.muted ? 'mute' : 'sound'); b.setAttribute('aria-label', sfx.muted ? 'Включить звук' : 'Выключить звук'); }
muteLabel();
$('[data-act=exit]').onclick = () => exitGame();
$('[data-act=sheet]').onclick = () => document.body.classList.add('sheet-open');
$('[data-act=sheet-close]').onclick = () => document.body.classList.remove('sheet-open');
$('#scrim').onclick = () => document.body.classList.remove('sheet-open');

/* ---------- создание и поиск ---------- */
$('#roomPublic').onclick = (e) => setSwitch(e.currentTarget, !e.currentTarget.classList.contains('on'));
$('#bCreateGo').onclick = () => useRemote().send({ t: 'create', name: name(), title: $('#roomTitle').value, isPublic: $('#roomPublic').classList.contains('on') });
$('#roomTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#bCreateGo').click(); });

const cells = $$('#codeCells .cd');
const codeVal = () => cells.map((c) => c.value).join('').toUpperCase();
function updateCode() { $('#bJoinCode').disabled = codeVal().length !== 4; }
cells.forEach((c, i) => {
  c.addEventListener('input', () => {
    c.value = c.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
    if (c.value && cells[i + 1]) cells[i + 1].focus(); updateCode();
  });
  c.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !c.value && cells[i - 1]) { cells[i - 1].focus(); cells[i - 1].value = ''; updateCode(); }
    if (e.key === 'Enter' && codeVal().length === 4) joinCode(codeVal());
  });
  c.addEventListener('paste', (e) => {
    const t = (e.clipboardData.getData('text') || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
    if (!t) return; e.preventDefault(); cells.forEach((x, k) => (x.value = t[k] || '')); cells[Math.min(t.length, 3)].focus(); updateCode();
  });
});
function joinCode(c) { c = String(c).trim().toUpperCase(); if (c.length !== 4) return toast('Введите код из 4 букв', true); useRemote().send({ t: 'join', code: c, name: name() }); }
$('#bJoinCode').onclick = () => joinCode(codeVal());
function renderRooms(rooms) {
  $('#roomsCount').textContent = rooms.length ? `${rooms.length} · обновляется само` : '';
  $('#roomsEmpty').classList.toggle('hidden', rooms.length > 0);
  $('#roomList').innerHTML = rooms.map((r) => `<li class="room"><div><b>${esc(r.title)}</b><span class="host">хост: ${esc(r.host)}</span></div>
    <div class="seatdots" aria-label="${r.players} из ${r.max}">${Array.from({ length: r.max }, (_, i) => `<i class="${i < r.players ? 'on' : ''}"></i>`).join('')}<span>${r.players}/${r.max}</span></div>
    <span class="code">${r.code}</span><button class="btn sm" data-join="${r.code}">Войти</button></li>`).join('');
  $$('[data-join]').forEach((b) => (b.onclick = () => joinCode(b.dataset.join)));
}

/* ---------- локальная игра ---------- */
function renderLocal() {
  const seg = $('#segN'); seg.innerHTML = '';
  [2, 3, 4].forEach((n) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n + ' игрока'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', localCfg.n === n); b.onclick = () => { localCfg.n = n; renderLocal(); }; seg.appendChild(b); });
  const box = $('#localSeats'); box.innerHTML = '';
  for (let i = 0; i < localCfg.n; i++) {
    const r = document.createElement('div'); r.className = 'lrow';
    r.innerHTML = `${A.shape(i, 32)}<input class="input" maxlength="14" value="${esc(localCfg.names[i])}" aria-label="Имя игрока ${i + 1}"><label class="tog">Бот<button type="button" class="sw${localCfg.bot[i] ? ' on' : ''}" role="switch" aria-checked="${localCfg.bot[i]}" aria-label="Игрок ${i + 1} — бот"><span></span></button></label>`;
    r.querySelector('input').oninput = (e) => (localCfg.names[i] = e.target.value || 'Игрок ' + (i + 1));
    r.querySelector('.sw').onclick = (e) => { localCfg.bot[i] = !localCfg.bot[i]; setSwitch(e.currentTarget, localCfg.bot[i]); };
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
  $('#lbSeats').innerHTML = Array.from({ length: 4 }, (_, i) => {
    const s = v.seats[i];
    if (!s) {
      const act = host && i === v.seats.length ? `<button class="btn sm" data-addbot>${A.icon('plus', 18)}Бот</button>` : !host ? '<span class="note">ждём игрока</span>' : '';
      return `<li class="slot free">${A.shape(i, 32, { ghost: true })}<div class="nm">Свободно</div>${act}</li>`;
    }
    const tags = (i === v.host ? `<span class="tag">${A.icon('crown', 14)}хост</span>` : '') + (s.bot ? `<span class="tag">${A.icon('bot', 14)}бот</span>` : '') + (!s.connected && !s.bot ? `<span class="tag">${A.icon('offline', 14)}офлайн</span>` : '');
    const x = host && i !== v.you ? `<button class="xbtn" data-kick="${i}" aria-label="Убрать ${esc(s.name)}">${A.icon('x')}</button>` : '<span class="pad44"></span>';
    return `<li class="slot">${A.shape(i, 32)}<div class="nm">${esc(s.name)}${i === v.you ? ' <i>· вы</i>' : ''}</div><span class="tags">${tags}</span>${x}</li>`;
  }).join('');
  $$('[data-kick]').forEach((b) => (b.onclick = () => net.send({ t: 'kick', i: +b.dataset.kick })));
  $$('[data-addbot]').forEach((b) => (b.onclick = () => net.send({ t: 'addBot' })));
  const bonus = $('#optBonus'), pub = $('#optPublic');
  setSwitch(bonus, v.opts.bonus); setSwitch(pub, v.isPublic);
  bonus.disabled = pub.disabled = !host;
  $('#optBonusTxt').textContent = host ? '' : (v.opts.bonus ? 'Включены' : 'Выключены');
  $('#optPublicTxt').textContent = host ? '' : (v.isPublic ? 'Видна' : 'Только по коду');
  $('#lbStart').classList.toggle('hidden', !host); $('#lbWait').classList.toggle('hidden', host);
  $('#lbStart').disabled = v.seats.length < 2;
  $('#lbNote').textContent = host && v.seats.length < 2 ? 'Нужно минимум 2 игрока: позовите друга по коду или добавьте бота.' : '';
}
$('#optBonus').onclick = (e) => net.send({ t: 'opts', bonus: !e.currentTarget.classList.contains('on') });
$('#optPublic').onclick = (e) => net.send({ t: 'opts', isPublic: !e.currentTarget.classList.contains('on') });
$('#lbStart').onclick = () => net.send({ t: 'start' });
$('#lbLeave').onclick = () => net.send({ t: 'leave' });
$('#lbLink').onclick = () => copy(`${location.origin}/?room=${view.code}`, 'Ссылка-приглашение скопирована');
$('#lbCopy').onclick = $('#lbCode').onclick = () => copy(view.code, 'Код скопирован');
$('#gRoom').onclick = () => { if (!isLocal && view) copy(`${location.origin}/?room=${view.code}`, 'Ссылка на комнату скопирована'); };

/* ---------- поле ---------- */
const board = $('#board');
function buildBoard() {
  board.innerHTML = `<g id="base">${A.boardBase(g)}</g><g id="goal"></g><g id="bonuses"></g><g id="slots"></g><g id="walls"></g><g id="overlay"></g><g id="pawns">` +
    g.players.map((p) => A.pawnGroup(p, { id: 'pawn' + p.i })).join('') + '</g><g id="fxl"></g>';
  $('#gCode').textContent = isLocal ? 'здесь' : view.code;
  $('#gRoom').disabled = isLocal;
  $('#chips').style.setProperty('--n', g.n);
  buildDie();
}
function drawDynamic() {
  const my = canAct(), p = E.cur(g);
  $('#goal').innerHTML = g.over ? '' : A.goalLayer(g, g.turn);
  $('#bonuses').innerHTML = A.bonusLayer(g);
  $('#slots').innerHTML = my && mode === 'wall' ? A.slotLayer() : '';
  $('#walls').innerHTML = A.wallLayer(g, { fromIndex: prevWalls, breakable: my && mode === 'break' });
  prevWalls = g.walls.length;
  let o = '';
  if (my && mode === 'move') o = A.hintLayer(g, p, E.reach(g, p, E.maxSteps(g.roll)));
  else if (my && mode === 'wall' && preview) o = A.previewLayer(preview, E.wallLegal(g, preview.o, preview.x, preview.y).ok, p);
  $('#overlay').innerHTML = o;
  g.players.forEach((q) => {
    const el = $('#pawn' + q.i); if (!el) return;
    el.style.transform = `translate(${cx(q.x) + S / 2}px,${cy(q.y) + S / 2}px)`;
    el.classList.toggle('turn', q.i === g.turn && !g.over);
    const fz = el.querySelector('.fz'), had = el.classList.contains('frozen');
    if ((q.skip > 0) !== had) { el.classList.toggle('frozen', q.skip > 0); fz.innerHTML = q.skip > 0 ? A.frozenMark() : ''; }
  });
}

/* ---------- кубик ---------- */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieEl = $('#die');
function buildDie() { dieEl.innerHTML = '<i></i>'.repeat(9); setDie(null); }
function setDie(v) {
  dieEl.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', !!v && PIPS[v].includes(i)));
  dieEl.classList.toggle('idle', !v); dieShown = v;
}
function rollAnim(final) {
  clearInterval(rollTimer); rolling = true; let n = 0;
  dieEl.animate([{ transform: 'rotate(-5deg)' }, { transform: 'rotate(-200deg) translateY(-12px) scale(1.05)', offset: .4 }, { transform: 'rotate(370deg) translateY(-4px)', offset: .75 }, { transform: 'rotate(-8deg) translateY(1px)', offset: .9 }, { transform: 'rotate(-5deg)' }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
  rollTimer = setInterval(() => {
    setDie(1 + Math.floor(Math.random() * 6)); sfx.play('tick');
    if (++n >= 7) { clearInterval(rollTimer); setDie(final); rolling = false; renderGame(); }
  }, 95);
}

/* ---------- эффекты событий ---------- */
function playFx(e) {
  const pl = g.players[e.p];
  switch (e.type) {
    case 'roll': rollAnim(e.r); setTimeout(() => sfx.play('roll'), 700); break;
    case 'move': {
      $('#pawn' + e.p)?.querySelector('.pawn-body')?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-12px)', offset: .45 }, { transform: 'translateY(1px) scale(1.04,.96)', offset: .85 }, { transform: 'translateY(0)' }], { duration: 160 + 120 * Math.min(3, e.steps), easing: 'cubic-bezier(.2,.8,.2,1)' });
      sfx.play('move'); break;
    }
    case 'wall': sfx.play('wall'); board.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(1.5px)' }, { transform: 'translateY(0)' }], { duration: 160 }); break;
    case 'break': {
      const r = A.wallRect(e.o, e.x, e.y);
      $('#fxl').insertAdjacentHTML('beforeend', `<rect class="ghost" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3.5" fill="${A.pv(e.p)}" stroke="var(--ink)" stroke-width="1.75"/>`);
      setTimeout(() => $('#fxl .ghost')?.remove(), 400); sfx.play('break'); break;
    }
    case 'bonus': sfx.play(e.type === 'freeze' ? 'freeze' : 'bonus'); toast(`${pl.name}: ${E.BONUS[e.type]}`); break;
    case 'skip': toast(e.why === 'freeze' ? `${pl.name} заморожен и пропускает ход` : `${pl.name}: ходов нет, пропуск`); break;
    case 'win': sfx.play('win'); fillGoal(e.p); setTimeout(() => showWin(e.p), 1300); break;
  }
}
function fillGoal(i) {
  const p = g.players[i], goal = E.SIDES[p.side].goal; let h = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (goal(x, y)) h += `<rect class="sweep" x="${cx(x)}" y="${cy(y)}" width="${S}" height="${S}" rx="7" fill="${A.pv(i)}" fill-opacity=".55"/>`;
  $('#fxl').insertAdjacentHTML('beforeend', h);
  $$('#fxl .sweep').forEach((r, k) => r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: k * 50, fill: 'both' }));
}

/* ---------- победа ---------- */
const EDGE = ['верхнего', 'правого', 'нижнего', 'левого'];
function showWin(i) {
  if (!g || !g.over) return;
  const p = g.players[i];
  $('#winTrophy').innerHTML = A.trophy(84); $('#winTrophy').style.setProperty('--win', A.pv(i));
  $('#winT').textContent = p.name; $('#winSub').textContent = `первым дошёл до ${EDGE[p.side]} края`;
  const t = Math.max(0, Math.round(((g.t1 || Date.now()) - g.t0) / 1000));
  $('#winStats').innerHTML = [[g.turns + 1, plural(g.turns + 1, 'ход', 'хода', 'ходов')], [g.walls.length, 'стен на поле'], [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 'время']].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
  const rank = [...g.players].sort((a, b) => (b.i === i) - (a.i === i) || E.dist(g, a) - E.dist(g, b));
  $('#winRows').innerHTML = rank.map((q, k) => `<tr><td class="mono" style="${k ? 'color:var(--muted)' : 'font-weight:700'}">${k + 1}</td><td><span class="pn" style="${k ? '' : 'font-weight:600'}">${A.shape(q.i, 20)}${esc(q.name)}${q.bot ? ' <span class="tag">бот</span>' : ''}</span></td><td class="mono r">${q.walls}</td><td class="mono r">${E.dist(g, q)}</td></tr>`).join('');
  $('#winBoard').innerHTML = A.staticBoard(g);
  const can = isLocal || (view && view.you === view.host);
  $('#bAgain').classList.toggle('hidden', !can);
  $('#winNote').innerHTML = can ? '' : '<span class="dots"><i></i><i></i><i></i></span> Ждём хоста: реванш запускает он';
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
const progress = (q) => Math.max(0, Math.min(1, 1 - E.dist(g, q) / START_DIST));
function playerInfo(q) {
  const off = !isLocal && view.seats[q.i] && !view.seats[q.i].connected && !q.bot;
  const me = q.i === view.you && !isLocal;
  const flag = q.skip > 0 ? A.icon('freeze', 14) : q.bot ? A.icon('bot', 14) : off ? A.icon('offline', 14) : '';
  return { off, me, flag, cur: q.i === g.turn && !g.over, d: E.dist(g, q), pr: Math.round(progress(q) * 100) };
}
function renderGame() {
  const p = E.cur(g), myTurn = !g.over && view.you === g.turn;
  $('#gTurn').textContent = g.turns + 1;

  $('#players').innerHTML = g.players.map((q) => {
    const f = playerInfo(q);
    return `<li class="prow${f.cur ? ' cur' : ''}${f.off ? ' off' : ''}" data-i="${q.i}" style="--c:${A.pv(q.i)}">${A.shape(q.i, 28)}
      <div class="nm"><span>${esc(q.name)}</span>${f.me ? '<i>вы</i>' : ''}${f.flag}</div>
      <span class="wl" title="Стен в запасе">${A.icon('wall', 16)}${q.walls}</span>
      <div class="prog"><div class="bar-t"><b style="width:${f.pr}%"></b></div><span title="Клеток до цели">${A.goalArrow(q.side, 12)}${f.d}</span></div></li>`;
  }).join('');
  $('#chips').innerHTML = g.players.map((q) => {
    const f = playerInfo(q);
    return `<li class="chip${f.cur ? ' cur' : ''}${f.off ? ' off' : ''}" data-i="${q.i}" style="--c:${A.pv(q.i)}"><div class="top">${A.shape(q.i, 16)}<span>${esc(q.name)}</span></div>
      <div class="bar-t"><b style="width:${f.pr}%"></b></div><div class="meta"><span title="Клеток до цели">${A.goalArrow(q.side, 11)}${f.d}</span><span title="Стен в запасе">${A.icon('wall', 11)}${q.walls}</span></div></li>`;
  }).join('');

  const key = `${g.id}:${g.turns}:${g.turn}:${g.phase}:${g.roll}`;
  if (key !== turnKey) {
    turnKey = key; preview = null;
    if (myTurn && g.phase === 'act') { const o = E.options(g); mode = o.move ? 'move' : o.wall ? 'wall' : 'break'; }
    if (myTurn && g.phase === 'roll' && !isLocal) sfx.play('turn');
  }
  if (g.roll && dieShown !== g.roll && !rolling) setDie(g.roll);
  if (!g.roll && !rolling && dieShown) setDie(null);

  const o = myTurn && g.phase === 'act' ? E.options(g) : { move: false, wall: false, brk: false };
  const canRoll = myTurn && g.phase === 'roll' && !pending;
  $('#tcWho').innerHTML = `${A.shape(p.i, 24)}<span>${esc(p.name)}</span>${myTurn && !isLocal ? '<i>· вы</i>' : ''}`;
  let st;
  if (g.over) st = 'Партия окончена';
  else if (rolling) st = 'Кубик катится…';
  else if (g.phase === 'roll') st = myTurn ? 'Ваш ход: бросьте кубик' : (p.bot || !myTurn && isLocal ? 'Думает…' : 'Бросает кубик…');
  else st = `Выпало <b>${g.roll}</b> · ход до <b>${E.maxSteps(g.roll)}</b> ${plural(E.maxSteps(g.roll), 'клетки', 'клеток', 'клеток')}`;
  $('#tcStatus').innerHTML = st;
  $('#rollBtn').classList.toggle('hidden', !canRoll);
  $('#dieBtn').disabled = !canRoll;
  $('#dieBtn').setAttribute('aria-label', canRoll ? 'Бросить кубик' : g.roll ? `Кубик: ${g.roll}` : 'Кубик');

  $('#aMove').textContent = g.roll ? `до ${E.maxSteps(g.roll)}` : '1–3';
  $('#aWall').textContent = `${p.walls} шт.`;
  $('#aBreak').textContent = g.roll === 6 ? `${g.walls.length} шт.` : 'на 6';
  $$('#acts button').forEach((b) => {
    const m = b.dataset.m, active = myTurn && g.phase === 'act';
    b.disabled = !active || (m === 'move' && !o.move) || (m === 'wall' && !o.wall) || (m === 'break' && !o.brk);
    b.setAttribute('aria-pressed', active && mode === m);
  });

  const coarse = matchMedia('(pointer:coarse)').matches;
  let hint, ic = 'move';
  if (g.over) hint = 'Партия окончена.';
  else if (!myTurn) hint = isLocal ? 'Ходит бот…' : `Ждём ход игрока ${p.name}…`;
  else if (g.phase === 'roll') { hint = coarse ? 'Нажмите на кубик или «Бросить».' : 'Бросьте кубик: кнопка или <kbd>Пробел</kbd>.'; ic = 'dice'; }
  else if (mode === 'move') hint = 'Выберите клетку: цифра — сколько шагов. Цель подсвечена.';
  else if (mode === 'wall') { hint = coarse ? 'Коснитесь линии между клетками, затем «Поставить».' : 'Наведите на точку между клетками и кликните. <kbd>R</kbd> или правый клик — повернуть.'; ic = 'wall'; }
  else { hint = 'Выберите стену, которую хотите сломать.'; ic = 'break'; }
  $('#hint').innerHTML = `${A.icon(ic, 18)}<span>${hint}</span>`;

  $('#log').innerHTML = g.log.slice(0, 10).map((l) => `<li>${l.p >= 0 ? A.shape(l.p, 14) : '<span></span>'}<span>${esc(l.t)}</span><small>${l.n}</small></li>`).join('');
  $('#emotes').classList.toggle('hidden', isLocal);
  $('#confirm').classList.toggle('hidden', !(canAct() && mode === 'wall' && preview && lastPtr === 'touch'));
  drawDynamic();
}

const EMOJIS = ['👍', '👏', '😮', '😂', '🤔', '😤'];
$('#emotes').innerHTML = EMOJIS.map((e, i) => `<button aria-label="Реакция ${i + 1}">${e}</button>`).join('');
$$('#emotes button').forEach((b) => (b.onclick = () => { net.send({ t: 'emote', e: b.textContent }); document.body.classList.remove('sheet-open'); }));
function showEmote(seat, e) {
  for (const card of $$(`.prow[data-i="${seat}"], .chip[data-i="${seat}"]`)) {
    const s = document.createElement('div'); s.className = 'bubble'; s.textContent = e; card.appendChild(s);
    setTimeout(() => s.remove(), 2500);
  }
  sfx.play('emote');
}

/* ---------- ввод на поле ---------- */
function svgPoint(e) { const r = board.getBoundingClientRect(), k = VB / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; }
function wallAt(e) {
  const [px, py] = svgPoint(e);
  const fx = (px - PAD + GP / 2) / P - 1, fy = (py - PAD + GP / 2) / P - 1;
  const ix = Math.max(0, Math.min(N - 2, Math.round(fx))), iy = Math.max(0, Math.min(N - 2, Math.round(fy)));
  return { o: Math.abs(fx - ix) >= Math.abs(fy - iy) ? 'h' : 'v', x: ix, y: iy };
}
let forcedO = null; // ориентация, выбранная поворотом; сбрасывается при смене позиции курсора на другую точку
board.addEventListener('pointerdown', (e) => { lastPtr = e.pointerType; });
board.addEventListener('pointermove', (e) => {
  if (!canAct() || mode !== 'wall' || e.pointerType === 'touch') return;
  const w = wallAt(e);
  if (forcedO && preview && preview.x === w.x && preview.y === w.y) w.o = forcedO; else forcedO = null;
  if (!preview || preview.o !== w.o || preview.x !== w.x || preview.y !== w.y) { preview = w; drawDynamic(); }
});
board.addEventListener('pointerleave', (e) => { if (g && mode === 'wall' && preview && e.pointerType !== 'touch') { preview = null; forcedO = null; drawDynamic(); } });
board.addEventListener('contextmenu', (e) => { if (canAct() && mode === 'wall') { e.preventDefault(); rotatePreview(); } });
function rotatePreview() {
  if (!preview) return;
  preview = { ...preview, o: preview.o === 'h' ? 'v' : 'h' }; forcedO = preview.o; drawDynamic();
}
function send(m) { pending = true; renderGame(); net.send(m); setTimeout(() => { if (pending) { pending = false; if (g) renderGame(); } }, 2500); }
function placePreview() {
  const lg = E.wallLegal(g, preview.o, preview.x, preview.y);
  if (!lg.ok) { toast(lg.why, true); sfx.play('error'); return; }
  const w = preview; preview = null; forcedO = null; send({ t: 'wall', ...w });
}
board.addEventListener('click', (e) => {
  if (!canAct()) return;
  if (mode === 'move') {
    const c = e.target.closest('[data-cell]'); if (c) { const [x, y] = c.dataset.cell.split(',').map(Number); send({ t: 'move', x, y }); }
  } else if (mode === 'wall') {
    if (lastPtr === 'touch') { preview = wallAt(e); renderGame(); return; }
    if (!preview) preview = wallAt(e);
    placePreview();
  } else if (mode === 'break') {
    const c = e.target.closest('[data-wall]'); if (c) send({ t: 'break', i: +c.dataset.wall });
  }
});
$('#cfRot').onclick = rotatePreview;
$('#cfNo').onclick = () => { preview = null; renderGame(); };
$('#cfYes').onclick = () => { if (preview) placePreview(); };
function setMode(m) { if (!canAct()) return; const b = $(`#acts [data-m=${m}]`); if (b.disabled) return; mode = m; preview = null; forcedO = null; renderGame(); }
$('#acts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });
const doRoll = () => { if (g && g.phase === 'roll' && view.you === g.turn && !pending && !g.over) send({ t: 'roll' }); };
$('#rollBtn').onclick = doRoll; $('#dieBtn').onclick = doRoll;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('#rules').classList.add('hidden'); document.body.classList.remove('sheet-open'); if (g) { preview = null; renderGame(); } return; }
  if (!g || $('#game').classList.contains('hidden') || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); doRoll(); }
  else if (k === 'm' || k === 'ь') setMode('move');
  else if (k === 'w' || k === 'ц') setMode('wall');
  else if (k === 'b' || k === 'и') setMode('break');
  else if ((k === 'r' || k === 'к') && mode === 'wall') rotatePreview();
});

// Возврат в комнату после перезагрузки и вход по ссылке ?room=CODE
if (canOnline) {
  useRemote();
  const code = new URLSearchParams(location.search).get('room');
  if (code && /^[A-Za-z]{4}$/.test(code)) {
    code.toUpperCase().split('').forEach((c, i) => (cells[i].value = c)); updateCode();
    // если это перезагрузка в своей комнате, сервер вернёт нас сам; иначе показываем вход по коду
    setTimeout(() => { if (!view) { show('find'); toast('Приглашение в комнату: нажмите «Войти»'); } }, 900);
  }
}
