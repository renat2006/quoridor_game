// Звук: короткие синтезированные сигналы WebAudio, без внешних файлов.
let actx = null;
export const sfx = {
  muted: (() => { try { return localStorage.wd_muted === '1'; } catch { return false; } })(),
  toggle() { this.muted = !this.muted; try { localStorage.wd_muted = this.muted ? '1' : '0'; } catch {} return this.muted; },
  tone(f, d = 0.12, type = 'sine', v = 0.06, at = 0, slide = 0) {
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
      case 'tick': this.tone(240 + Math.random() * 160, 0.04, 'triangle', 0.035); break;
      case 'roll': this.tone(420, 0.1, 'triangle', 0.07); this.tone(620, 0.14, 'triangle', 0.06, 0.07); break;
      case 'move': this.tone(360, 0.14, 'sine', 0.07, 0, 200); break;
      case 'wall': this.tone(150, 0.18, 'triangle', 0.09, 0, -60); this.tone(95, 0.2, 'sine', 0.07, 0.03); break;
      case 'break': this.tone(200, 0.26, 'sawtooth', 0.05, 0, -140); break;
      case 'bonus': [560, 740, 990].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.06, i * 0.07)); break;
      case 'freeze': this.tone(1000, 0.3, 'sine', 0.05, 0, -600); break;
      case 'error': this.tone(150, 0.16, 'sawtooth', 0.05); break;
      case 'turn': this.tone(600, 0.08, 'sine', 0.05); this.tone(800, 0.1, 'sine', 0.05, 0.08); break;
      case 'win': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.07, i * 0.11)); break;
      case 'emote': this.tone(780, 0.07, 'sine', 0.045); break;
    }
  },
};
