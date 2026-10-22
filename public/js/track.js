// Анонимная статистика: какие экраны открывают, на чём играют, где падает интерфейс, как идут локальные партии.
// Имена, IP и содержимое полей не отправляются. «Не отслеживать» в браузере выключает всё, кроме онлайн-партий
// (их ходы и так проходят через сервер).
const CFG = window.WD_CONFIG || {};
const off = !CFG.telemetry || !location.protocol.startsWith('http') || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;

const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
function keep(store, k) {
  try { let v = store.getItem(k); if (!v) { v = rid(); store.setItem(k, v); } return v; } catch { return rid(); }
}
export const vid = off ? null : keep(localStorage, 'wd_vid');
const sid = off ? null : keep(sessionStorage, 'wd_sid');

let queue = [], timer = null, ph = null; // ph — PostHog, когда загрузится
function flush(beacon = false) {
  clearTimeout(timer); timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ vid, sid, ev: queue.splice(0, 50) });
  post('/api/e', body, beacon);
  if (queue.length) flush(beacon);
}
function post(url, body, beacon) {
  try {
    if (beacon && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    fetch(url, { method: 'POST', body, keepalive: body.length < 60_000, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  } catch { /* статистика не должна мешать игре */ }
}

export function track(type, data = {}) {
  if (off) return;
  try {
    queue.push({ type, data });
    ph?.capture(type, data);
    if (!timer) timer = setTimeout(flush, 4000);
  } catch { /* статистика не должна мешать игре */ }
}

/** Запись локальной партии — сервер переиграет её движком и посчитает статистику. */
export function trackGame(rec) {
  if (off || !rec) return;
  rec.seats.forEach((s) => { if (!s.bot) s.vid = vid; });
  post('/api/game', JSON.stringify(rec), true);
}

addEventListener('pagehide', () => flush(true));
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });

if (!off) {
  const w = Math.min(screen.width, screen.height), coarse = matchMedia('(pointer:coarse)').matches;
  let ref = '';
  try { const r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) ref = r.host; } catch {}
  track('visit', {
    device: coarse ? (w < 600 ? 'phone' : 'tablet') : 'desktop', w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
    lang: navigator.language, dark: matchMedia('(prefers-color-scheme: dark)').matches, ref,
    standalone: matchMedia('(display-mode: standalone)').matches,
  });
  const ua = navigator.userAgent.slice(0, 160);
  addEventListener('error', (e) => track('error', { msg: String(e.message).slice(0, 200), src: `${String(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`, ua }));
  addEventListener('unhandledrejection', (e) => track('error', { msg: String(e.reason?.message || e.reason).slice(0, 200), src: 'promise', ua }));
}

/* ---------- PostHog: запись сессий, если на сервере задан POSTHOG_KEY ---------- */
if (!off && CFG.posthog?.key) loadPostHog(2);
function loadPostHog(tries) {
  const s = document.createElement('script');
  s.src = CFG.posthog.host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
  s.async = true; s.crossOrigin = 'anonymous';
  // первое соединение на мобильной сети иногда обрывается — пробуем ещё раз
  s.onerror = () => { s.remove(); if (tries > 1) setTimeout(() => loadPostHog(tries - 1), 3000); };
  s.onload = () => {
    const lib = window.posthog; if (!lib?.init) return;
    lib.init(CFG.posthog.key, {
      api_host: CFG.posthog.host, person_profiles: 'identified_only', persistence: 'localStorage',
      autocapture: true, capture_pageview: true, disable_session_recording: false,
      session_recording: { maskAllInputs: true },
    });
    lib.register({ wd_vid: vid });
    ph = lib;
  };
  document.head.append(s);
}
