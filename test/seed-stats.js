// Демо-данные для дашборда: партии ботов «как будто людей» за последние две недели.
// Запуск: DATA_DIR=/tmp/wd-demo node test/seed-stats.js [партий], затем DATA_DIR=/tmp/wd-demo npm start → /stats
import { openTelemetry } from '../telemetry.js';
import { Room } from '../public/js/room.js';
import { botAct } from '../public/js/engine.js';

const dir = process.env.DATA_DIR;
if (!dir) { console.error('Задайте DATA_DIR, чтобы не смешать демо с настоящей статистикой'); process.exit(1); }
const tel = openTelemetry(dir), N = Number(process.argv[2]) || 120, DAY = 86_400_000;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const vids = Array.from({ length: 40 }, (_, i) => 'demo' + String(i).padStart(4, '0') + 'aa');

for (let k = 0; k < N; k++) {
  const t = Date.now() - Math.random() * 14 * DAY, vid = pick(vids), sid = 'sess' + k + 'xx';
  tel.events({ vid, sid, ev: [
    { type: 'visit', data: { device: pick(['phone', 'phone', 'desktop', 'tablet']), lang: pick(['ru-RU', 'ru-RU', 'en-US']), ref: pick(['', '', 't.me', 'vk.com']) } },
    { type: 'screen', data: { s: 'home' } }, { type: 'screen', data: { s: pick(['local', 'create', 'find']) } }, { type: 'screen', data: { s: 'game' } },
    ...(Math.random() < 0.3 ? [{ type: 'rules', data: {} }] : []),
    ...(Math.random() < 0.05 ? [{ type: 'error', data: { msg: "Cannot read properties of null (reading 'turn')", src: 'ui.js:331:12' } }] : []),
  ] }, t);
  if (Math.random() < 0.15) continue; // зашёл и не стал играть

  let rec;
  const room = new Room('D', { onRecord: (r) => { rec = r; } });
  const n = pick([2, 2, 2, 3, 4]), humans = Math.random() < 0.3 ? 2 : 1;
  for (let i = 0; i < n; i++) room.sit({ token: 't' + i, name: 'P' + i, bot: i >= humans, local: i < humans, vid: i === 0 ? vid : null });
  room.opts.size = pick([7, 9, 9, 9, 11]); room.opts.botLevel = pick(['easy', 'normal']);
  room.start(0); clearTimeout(room.timer);
  const quit = Math.random() < 0.25 ? 4 + Math.floor(Math.random() * 60) : Infinity;
  while (!room.game.over && room.rec.actions.length < quit) {
    const human = !room.seats[room.game.turn].bot;
    room.apply(room.game.turn, botAct(room.game, Math.random, human ? 'easy' : room.opts.botLevel));
  }
  if (room.game.over) room.afterPlay(); else room.destroy();
  clearTimeout(room.timer);
  // растягиваем время: человек думает 3–20 с на действие, бот — секунду
  let ms = 0;
  rec.actions.forEach((a) => { ms += room.seats[a[1]].bot ? 900 : 3000 + Math.random() * 17000; a[0] = Math.round(ms); });
  rec.t0 = t; rec.t1 = t + ms; rec.id = 'demo' + k + Math.random().toString(36).slice(2, 8);
  tel.game(rec, humans === 2 && Math.random() < 0.5 ? 'online' : 'local');
}
console.log(`демо: ${N} визитов → ${dir}`);
