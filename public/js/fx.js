// Звук (синтез WebAudio), частицы на поле и фоновая анимация. Без внешних файлов.
let actx = null;
export const sfx = {
  muted: (() => { try { return localStorage.muted === '1'; } catch { return false; } })(),
  toggle() { this.muted = !this.muted; try { localStorage.muted = this.muted ? '1' : '0'; } catch {} return this.muted; },
  tone(f, d = 0.12, type = 'sine', v = 0.07, at = 0, slide = 0) {
    if (this.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + at, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
    } catch {}
  },
  play(n) {
    switch (n) {
      case 'tick': this.tone(260 + Math.random() * 200, 0.05, 'square', 0.03); break;
      case 'roll': this.tone(520, 0.12, 'triangle', 0.08); this.tone(780, 0.16, 'triangle', 0.07, 0.07); break;
      case 'move': this.tone(420, 0.14, 'sine', 0.09, 0, 240); break;
      case 'wall': this.tone(150, 0.2, 'sawtooth', 0.08, 0, -60); this.tone(90, 0.25, 'square', 0.06, 0.03); break;
      case 'break': this.tone(220, 0.3, 'sawtooth', 0.09, 0, -170); break;
      case 'bonus': [660, 880, 1170].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, i * 0.07)); break;
      case 'freeze': this.tone(1200, 0.3, 'sine', 0.06, 0, -700); break;
      case 'error': this.tone(140, 0.2, 'sawtooth', 0.07); break;
      case 'turn': this.tone(700, 0.08, 'sine', 0.05); this.tone(940, 0.1, 'sine', 0.05, 0.08); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.09, i * 0.1)); break;
      case 'emote': this.tone(900, 0.08, 'sine', 0.05); break;
    }
  },
};

export class Particles {
  constructor(canvas, boardEl) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.board = boardEl; this.ps = []; this.raf = 0; this.vb = 612;
    this.resize(); new ResizeObserver(() => this.resize()).observe(boardEl);
  }
  resize() {
    const r = this.board.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.c.width = r.width * dpr; this.c.height = r.height * dpr;
    this.c.style.width = r.width + 'px'; this.c.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  burst(bx, by, color, n = 26, power = 1) {
    const k = this.w / this.vb;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.6 + Math.random() * 2.6) * power;
      this.ps.push({ x: bx * k, y: by * k, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.014 + Math.random() * 0.02, size: 1.5 + Math.random() * 3, color });
    }
    this.run();
  }
  line(x1, y1, x2, y2, color, n = 22) {
    const k = this.w / this.vb;
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      this.ps.push({ x: (x1 + (x2 - x1) * t) * k, y: (y1 + (y2 - y1) * t) * k, vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6, life: 1, decay: 0.02 + Math.random() * 0.02, size: 1.5 + Math.random() * 2.5, color });
    }
    this.run();
  }
  confetti(colors) {
    for (let i = 0; i < 140; i++) {
      this.ps.push({ x: Math.random() * this.w, y: -10, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3, life: 1, decay: 0.006 + Math.random() * 0.006, size: 3 + Math.random() * 4, color: colors[i % colors.length], g: 0.04 });
    }
    this.run();
  }
  run() { if (!this.raf) this.raf = requestAnimationFrame(() => this.step()); }
  step() {
    const ctx = this.ctx; ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';
    this.ps = this.ps.filter((p) => p.life > 0);
    for (const p of this.ps) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.vx *= 0.985; p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + p.life * 0.6), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.raf = this.ps.length ? requestAnimationFrame(() => this.step()) : 0;
  }
}

export function bgFx(canvas) {
  const ctx = canvas.getContext('2d'); let w, h, dots = [];
  const init = () => {
    w = canvas.width = innerWidth; h = canvas.height = innerHeight;
    dots = Array.from({ length: Math.round(w * h / 22000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + 0.3, s: Math.random() * 0.25 + 0.05, a: Math.random() }));
  };
  init(); addEventListener('resize', init);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  (function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.y -= d.s; d.a += 0.012; if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
      ctx.globalAlpha = 0.25 + Math.sin(d.a) * 0.2; ctx.fillStyle = '#9fb4ff';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill();
    }
    requestAnimationFrame(frame);
  })();
}
