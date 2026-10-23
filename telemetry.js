// Телеметрия: события из браузера и записи партий в SQLite, сводка для дашборда /stats.
// Никаких имён, IP и cookies игроков: только случайный анонимный id браузера (vid) и id вкладки (sid).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { replayer, dist, RULES_VERSION, CARDS, ROLES } from './public/js/engine.js';

const DAY = 86_400_000;
const ID = /^[a-z0-9]{6,40}$/i;
const EVENT_TYPES = new Set(['visit', 'screen', 'rules', 'local_start', 'room_create', 'room_join', 'error', 'theme', 'sound']);

export function openTelemetry(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'telemetry.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (ts INTEGER NOT NULL, vid TEXT, sid TEXT, type TEXT NOT NULL, data TEXT);
    CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY, ts INTEGER NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
      size INTEGER, n INTEGER, humans INTEGER, turns INTEGER, dur INTEGER, winner INTEGER, rv INTEGER,
      summary TEXT NOT NULL, rec TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS games_ts ON games (ts);
  `);
  const insEvent = db.prepare('INSERT INTO events (ts, vid, sid, type, data) VALUES (?, ?, ?, ?, ?)');
  const insGame = db.prepare(`INSERT OR IGNORE INTO games (id, ts, mode, status, size, n, humans, turns, dur, winner, rv, summary, rec)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  return {
    /** Пачка событий из браузера. Всё неизвестное и слишком большое отбрасывается. */
    events(body, now = Date.now()) {
      const vid = ID.test(body?.vid) ? body.vid : null, sid = ID.test(body?.sid) ? body.sid : null;
      if (!Array.isArray(body?.ev)) return 0;
      let n = 0;
      for (const e of body.ev.slice(0, 50)) {
        if (!e || !EVENT_TYPES.has(e.type)) continue;
        const data = JSON.stringify(e.data ?? {});
        if (data.length > 2000) continue;
        // время берём с сервера: часы в браузере бывают сбиты
        insEvent.run(now, vid, sid, e.type, data); n++;
      }
      return n;
    },
    event(type, vid, data = {}) { insEvent.run(Date.now(), vid, null, type, JSON.stringify(data)); },

    /** Запись партии. Онлайн-партии приходят из комнаты на сервере, локальные — из браузера,
        поэтому каждая запись переигрывается движком: подделанные и битые не сохраняются. */
    game(rec, mode) {
      const s = summarize(rec);
      if (!s) return false;
      insGame.run(String(rec.id).slice(0, 40), rec.t0, mode, s.status, s.size, s.n, s.humans, s.turns, s.dur,
        s.winner ?? -1, rec.rv, JSON.stringify(s), JSON.stringify(rec));
      return true;
    },

    stats(days) { return buildStats(db, days); },
    list(limit = 60, before = Infinity) {
      return db.prepare('SELECT id, ts, mode, summary FROM games WHERE ts < ? ORDER BY ts DESC LIMIT ?')
        .all(Number.isFinite(before) ? before : 8.64e15, limit)
        .map((r) => ({ id: r.id, ts: r.ts, mode: r.mode, ...JSON.parse(r.summary) }));
    },
    record(id) {
      const r = db.prepare('SELECT rec, mode, summary FROM games WHERE id = ?').get(String(id));
      return r ? { rec: JSON.parse(r.rec), mode: r.mode, summary: JSON.parse(r.summary) } : null;
    },
    close() { db.close(); },
  };
}

/* ---------- проверка и разбор записи ---------- */
export function summarize(rec) {
  if (!rec || typeof rec !== 'object' || !Number.isInteger(rec.seed) || !Array.isArray(rec.seats) || !Array.isArray(rec.actions)) return null;
  if (rec.seats.length < 2 || rec.seats.length > 4 || rec.actions.length > 4000 || !ID.test(String(rec.id))) return null;
  if (!Number.isFinite(rec.t0) || !Number.isFinite(rec.t1) || rec.t1 < rec.t0 || !['over', 'abandoned'].includes(rec.status)) return null;
  if (rec.rv !== RULES_VERSION) return null;
  for (const s of rec.seats) if (s.vid != null && !ID.test(s.vid)) return null;

  // переигрываем запись по одному действию: заодно считаем, кто что делал и сколько думал над ходом
  const r = replayer(rec), g = r.g;
  const per = g.players.map((p) => ({ role: p.role, bot: !!rec.seats[p.i].bot, level: rec.seats[p.i].level || null,
    moves: 0, steps: 0, walls: 0, cards: {}, breaks: 0, rotates: 0, turns: 0, think: [] }));
  let turnStart = 0;
  for (const [ms, seat, a] of rec.actions) {
    const p = g.players[seat], q = per[seat];
    const from = [p.x, p.y], card = a.t === 'card' ? p.hand[a.c] : null;
    if (!Number.isFinite(ms) || !r.step()) return null;
    if (a.t === 'move') { q.moves++; q.steps += Math.abs(p.x - from[0]) + Math.abs(p.y - from[1]); }
    if (a.t === 'wall') q.walls++;
    if (a.t === 'card') q.cards[card] = (q.cards[card] || 0) + 1;
    if (a.t === 'break') q.breaks++;
    if (g.turn !== seat || g.over) { // ход этого игрока закончился
      q.turns++;
      if (!q.bot) q.think.push(Math.max(0, ms - turnStart));
      turnStart = ms;
    }
  }
  if (rec.status === 'over' && !g.over) return null;

  const humans = rec.seats.filter((s) => !s.bot).length;
  return {
    status: g.over ? 'over' : 'abandoned', size: g.size, n: g.n, humans,
    opts: { bonus: rec.opts?.bonus !== false, roles: rec.opts?.roles !== false, botLevel: rec.opts?.botLevel || 'normal' },
    turns: g.turns, actions: rec.actions.length, dur: rec.t1 - rec.t0, winner: g.over ? g.winner : null,
    // насколько близкой была партия: сколько клеток оставалось ближайшему проигравшему
    margin: g.over ? Math.min(...g.players.filter((p) => p.i !== g.winner).map((p) => dist(g, p))) : null,
    vids: [...new Set(rec.seats.map((s) => s.vid).filter(Boolean))],
    // abilities — сколько раз сработало свойство роли (движок считает сам: второй шаг Бегуна, проход Призрака и т. д.)
    players: per.map((q, i) => ({ ...q, abilities: g.players[i].roleUses || 0, think: q.think.length ? Math.round(median(q.think)) : null })),
  };
}

function median(a) { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/* ---------- сводка для дашборда ---------- */
function buildStats(db, days) {
  const now = Date.now(), from = days > 0 ? now - days * DAY : 0;
  const ev = db.prepare('SELECT ts, vid, sid, type, data FROM events WHERE ts >= ?').all(from);
  const games = db.prepare('SELECT id, ts, mode, summary FROM games WHERE ts >= ? ORDER BY ts').all(from)
    .map((r) => ({ id: r.id, ts: r.ts, mode: r.mode, ...JSON.parse(r.summary) }));
  const firstSeen = new Map(db.prepare('SELECT vid, MIN(ts) t FROM events WHERE vid IS NOT NULL GROUP BY vid').all().map((r) => [r.vid, r.t]));

  const visitors = new Set(), sessions = new Set(), dayVis = new Map(), visDays = new Map();
  const devices = {}, refs = {}, screens = {}, langs = {}, errors = new Map();
  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  for (const e of ev) {
    const d = JSON.parse(e.data || '{}');
    if (e.vid) {
      visitors.add(e.vid);
      const k = dayKey(e.ts);
      if (!dayVis.has(k)) dayVis.set(k, new Set()); dayVis.get(k).add(e.vid);
      if (!visDays.has(e.vid)) visDays.set(e.vid, new Set()); visDays.get(e.vid).add(k);
    }
    if (e.sid) sessions.add(e.sid);
    if (e.type === 'visit') {
      inc(devices, d.device || '?'); inc(langs, String(d.lang || '?').slice(0, 2));
      if (d.ref) inc(refs, String(d.ref).slice(0, 60));
    }
    if (e.type === 'screen') inc(screens, d.s);
    if (e.type === 'rules') inc(screens, 'rules');
    if (e.type === 'error') {
      const key = String(d.msg || '?').slice(0, 200);
      const x = errors.get(key) || { msg: key, n: 0, last: 0, src: d.src || '', ua: d.ua || '' };
      x.n++; if (e.ts > x.last) { x.last = e.ts; x.src = d.src || x.src; x.ua = d.ua || x.ua; } errors.set(key, x);
    }
  }
  const newVisitors = [...visitors].filter((v) => firstSeen.get(v) >= from).length;
  const returning = [...visDays.values()].filter((s) => s.size >= 2).length;

  // воронка: зашёл → начал партию → доиграл → сыграл 2+ партии
  const started = new Map(), finished = new Set();
  for (const g of games) for (const v of g.vids || []) { started.set(v, (started.get(v) || 0) + 1); if (g.status === 'over') finished.add(v); }

  // по дням
  const daily = [];
  const span = days > 0 ? days : Math.max(1, Math.ceil((now - Math.min(now, ...games.map((g) => g.ts), ...ev.map((e) => e.ts))) / DAY));
  for (let i = Math.min(span, 90) - 1; i >= 0; i--) {
    const k = dayKey(now - i * DAY);
    const gs = games.filter((g) => dayKey(g.ts) === k);
    daily.push({ day: k, visitors: dayVis.get(k)?.size || 0, games: gs.length, finished: gs.filter((g) => g.status === 'over').length });
  }

  const over = games.filter((g) => g.status === 'over');
  const withHumans = games.filter((g) => g.humans > 0);

  // роли: доля побед (все игры и только люди)
  const roles = Object.fromEntries(Object.keys(ROLES).map((r) => [r, { name: ROLES[r].name, n: 0, w: 0, exp: 0, hn: 0, hw: 0, hexp: 0, use: 0 }]));
  // первый ход и размер поля
  const seat0 = {}, bySize = {}, byN = {}, modes = {}, botLevels = {}, optsUse = { roles: 0, bonus: 0, total: games.length };
  // люди против ботов
  const vsBots = {};
  const cards = Object.fromEntries(Object.keys(CARDS).map((c) => [c, { name: CARDS[c].name, human: 0, bot: 0 }]));
  const mix = { human: { moves: 0, walls: 0, cards: 0, role: 0, turns: 0 }, bot: { moves: 0, walls: 0, cards: 0, role: 0, turns: 0 } };
  const think = [];
  const abandonAt = { '0': 0, '1–3': 0, '4–10': 0, '11–20': 0, '21+': 0 };
  const durations = [], margins = [];

  for (const g of games) {
    inc(bySize, g.size); inc(byN, g.n); inc(modes, g.mode);
    if (g.opts.roles) optsUse.roles++; if (g.opts.bonus) optsUse.bonus++;
    if (g.players.some((p) => p.bot)) inc(botLevels, g.opts.botLevel);
    if (g.status !== 'over') { const t = g.turns; abandonAt[t === 0 ? '0' : t <= 3 ? '1–3' : t <= 10 ? '4–10' : t <= 20 ? '11–20' : '21+']++; continue; }
    durations.push(g.dur); if (g.margin != null) margins.push(g.margin);
    const s0 = seat0[g.size] ||= { n: 0, w: 0, exp: 0 }; s0.n++; s0.exp += 1 / g.n; if (g.winner === 0) s0.w++;
    g.players.forEach((p, i) => {
      const win = g.winner === i;
      // exp — сколько побед было бы при идеальном балансе (1 из n)
      if (p.role) { const r = roles[p.role]; r.n++; r.exp += 1 / g.n; r.use += p.abilities ?? p.breaks + p.rotates; if (win) r.w++; if (!p.bot) { r.hn++; r.hexp += 1 / g.n; if (win) r.hw++; } }
    });
    const hum = g.players.filter((p) => !p.bot), bots = g.players.filter((p) => p.bot);
    if (hum.length && bots.length) {
      const k = `${g.opts.botLevel}·${g.size}`;
      const v = vsBots[k] ||= { level: g.opts.botLevel, size: g.size, n: 0, w: 0, exp: 0 };
      v.n++; v.exp += hum.length / g.n; if (!g.players[g.winner].bot) v.w++;
    }
  }
  for (const g of games) for (const p of g.players) {
    const m = mix[p.bot ? 'bot' : 'human'];
    m.moves += p.moves; m.walls += p.walls; m.role += p.abilities ?? p.breaks + p.rotates; m.turns += p.turns;
    for (const [c, k] of Object.entries(p.cards)) { m.cards += k; if (cards[c]) cards[c][p.bot ? 'bot' : 'human'] += k; }
    if (!p.bot && p.think != null) think.push(p.think);
  }

  return {
    range: { days, from, to: now },
    kpi: {
      visitors: visitors.size, newVisitors, returning, sessions: sessions.size,
      games: games.length, finished: over.length, humanGames: withHumans.length,
      online: games.filter((g) => g.mode === 'online').length,
      medianDur: durations.length ? median(durations) : null,
      medianTurns: over.length ? median(over.map((g) => g.turns)) : null,
      medianThink: think.length ? median(think) : null,
      medianMargin: margins.length ? median(margins) : null,
    },
    funnel: [
      { label: 'Зашли', n: visitors.size },
      { label: 'Начали партию', n: [...started.keys()].filter((v) => visitors.has(v)).length },
      { label: 'Доиграли партию', n: [...finished].filter((v) => visitors.has(v)).length },
      { label: 'Сыграли 2+ партии', n: [...started].filter(([v, k]) => k >= 2 && visitors.has(v)).length },
    ],
    daily, roles, seat0, bySize, byN, modes, botLevels, optsUse, vsBots: Object.values(vsBots), cards, mix, abandonAt,
    devices, refs: top(refs, 10), langs, screens,
    errors: [...errors.values()].sort((a, b) => b.last - a.last).slice(0, 30),
  };
}
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
