// sfx.js — every sound and the music, synthesised live with WebAudio.
// Why no sound files: nothing to license or download, tiny repo, and every
// squeak can be pitched a little differently so a swarm doesn't sound like a loop.
//
// Sounds are positional: quieter with distance from your cat, panned left/right
// relative to where the camera faces. Busy sounds (squeaks, hits) are rate-limited
// so 200 dying mice is a chorus, not a wall of noise.

const STORE = 'catcastle.audio';
function loadPrefs() { try { return { master: 0.8, music: 0.45, sfx: 0.9, muted: false, ...JSON.parse(localStorage.getItem(STORE)) }; } catch { return { master: 0.8, music: 0.45, sfx: 0.9, muted: false }; } }
function savePrefs(p) { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* private window */ } }

// Note name -> frequency (A4 = 440).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sfx {
  constructor() {
    this.prefs = loadPrefs();
    this.ctx = null;
    this.lx = 0; this.lz = 0; this.lyaw = 0;     // listener (your cat + camera yaw)
    this.last = new Map();                       // rate limiting: sound name -> [times]
    this.musicMode = 'menu';
  }

  // Browsers only allow audio after a click/key press; call this from one.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    // One second of white noise, reused by every noisy sound.
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const p = this.prefs, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(p.muted ? 0 : p.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(p.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(p.music * 0.5, t, 0.05);
  }
  set(key, v) { this.prefs[key] = v; savePrefs(this.prefs); this.applyVolumes(); }
  toggleMute() { this.set('muted', !this.prefs.muted); return this.prefs.muted; }

  listener(x, z, yaw) { this.lx = x; this.lz = z; this.lyaw = yaw; }

  // ---------- building blocks ----------
  // Output chain for one sound: gain (volume/distance) -> stereo pan -> sfx bus.
  out(vol, x, z) {
    const c = this.ctx, g = c.createGain();
    let v = vol, pan = 0;
    if (x !== undefined) {
      const dx = x - this.lx, dz = z - this.lz, d = Math.hypot(dx, dz);
      if (d > 60) return null;
      v *= 1 / (1 + d / 10);
      // Camera right = (-cos yaw, sin yaw).
      if (d > 0.5) pan = Math.max(-1, Math.min(1, (dx * -Math.cos(this.lyaw) + dz * Math.sin(this.lyaw)) / d)) * 0.8;
    }
    g.gain.value = v;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfxBus); }
    else g.connect(this.sfxBus);
    return g;
  }
  // Tone: oscillator with a pitch slide and an attack/decay envelope.
  tone(dest, { type = 'sine', f = 440, f2 = null, t = 0, dur = 0.2, vol = 0.5, att = 0.005, vib = 0 }) {
    const c = this.ctx, s = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, s);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), s + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 7; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(s); l.stop(s + dur + 0.05); }
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + att); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.connect(g); g.connect(dest); o.start(s); o.stop(s + dur + 0.05);
  }
  // Noise burst through a filter (bandpass/lowpass/highpass), optionally sweeping.
  noise(dest, { t = 0, dur = 0.2, vol = 0.5, type = 'bandpass', f = 1000, f2 = null, q = 1, att = 0.003 }) {
    const c = this.ctx, s = c.currentTime + t, src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf; src.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, s); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, s + dur);
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + att); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    src.connect(fl); fl.connect(g); g.connect(dest); src.start(s, Math.random() * 0.5); src.stop(s + dur + 0.05);
  }
  // Max `n` plays of one sound per `win` seconds.
  allow(name, n = 4, win = 0.1) {
    const now = this.ctx.currentTime, arr = (this.last.get(name) || []).filter(t => now - t < win);
    if (arr.length >= n) { this.last.set(name, arr); return false; }
    arr.push(now); this.last.set(name, arr); return true;
  }

  // ---------- the sound library ----------
  play(name, x, z, opt = {}) {
    if (!this.ctx || this.prefs.muted) return;
    const R = Math.random, fn = SOUNDS[name]; if (!fn) return;
    const lim = LIMITS[name] || [6, 0.1];
    if (!this.allow(name, lim[0], lim[1])) return;
    const o = this.out(opt.vol ?? 1, x, z); if (!o) return;
    fn(this, o, R, opt);
  }

  // ---------- music ----------
  // A sneaky plucked bass line (Tom & Jerry tiptoe) while you build; drums and a
  // faster tempo once the mice come; a heavier groove for boss waves.
  setMusic(mode) { this.musicMode = mode; }
  startMusic() {
    const c = this.ctx; this.step = 0; this.nextT = c.currentTime + 0.1;
    const tick = () => {
      if (!this.ctx) return;
      if (this.nextT < this.ctx.currentTime - 0.5) this.nextT = this.ctx.currentTime + 0.05;   // tab was asleep: skip ahead
      while (this.nextT < this.ctx.currentTime + 0.25) { this.musicStep(this.nextT); }
    };
    this.musicTimer = setInterval(tick, 60);
  }
  musicStep(t) {
    const mode = this.musicMode, bpm = mode === 'wave' ? 132 : mode === 'boss' ? 120 : 96;
    const s16 = 60 / bpm / 4, st = this.step++, bar = Math.floor(st / 16) % 4, b = st % 16;
    const c = this.ctx, dest = this.musicBus, at = t - c.currentTime;
    this.nextT += s16;
    if (at < -0.05) return;
    // Bass: D minor walk, plucked.
    const roots = mode === 'boss' ? [38, 38, 41, 37] : [38, 43, 41, 45];
    const walk = [0, null, null, 7, null, null, 12, null, 10, null, 7, null, 5, null, 3, null];
    if (walk[b] !== null && (mode !== 'menu' || b % 4 === 0)) {
      const f = NOTE(roots[bar] + walk[b]);
      this.tone(dest, { type: 'triangle', f, t: at, dur: mode === 'build' || mode === 'menu' ? 0.18 : 0.12, vol: 0.32 });
    }
    // Tiptoe plucks on top (sparse, staccato).
    if (mode !== 'menu' && b % 4 === 2 && (st * 7) % 5 < 2) this.tone(dest, { type: 'square', f: NOTE(roots[bar] + 24 + [0, 3, 7, 10][(st >> 2) % 4]), t: at, dur: 0.06, vol: 0.05 });
    if (mode === 'wave' || mode === 'boss') {
      if (b % 4 === 0) this.tone(dest, { type: 'sine', f: 110, f2: 40, t: at, dur: 0.18, vol: mode === 'boss' ? 0.6 : 0.45 });   // kick
      if (b === 4 || b === 12) this.noise(dest, { t: at, dur: 0.12, vol: 0.18, type: 'highpass', f: 1500 });                     // snare
      if (b % 2 === 1) this.noise(dest, { t: at, dur: 0.03, vol: 0.06, type: 'highpass', f: 7000 });                            // hat
    } else if (b === 8) this.noise(dest, { t: at, dur: 0.04, vol: 0.08, type: 'bandpass', f: 1800, q: 6 });                       // woodblock tick
  }
}

// Rate limits: [max plays, per seconds]. Unlisted sounds: 6 per 0.1 s.
const LIMITS = { sizzle: [2, 0.3], chill: [2, 0.3], salt: [1, 0.4], slip: [2, 0.2], darts: [2, 0.2], combo_chain: [2, 0.15], combo_blaze: [2, 0.2], combo_freeze: [3, 0.15], combo_spread: [1, 0.3], combo_knockdown: [3, 0.1], combo_steam: [1, 0.3], execute: [3, 0.1], toySqueak: [3, 0.2], pebble: [4, 0.1], claw: [3, 0.1], whisker: [4, 0.1], burr: [3, 0.1], dodge: [2, 0.2], squeak: [5, 0.12], hit: [4, 0.08], pellet: [6, 0.1], tack: [2, 0.15], dmg: [4, 0.1], splat: [4, 0.12], pickup: [3, 0.1], grind: [2, 0.25] };

// Each sound: (sfx, output node, random, options).
const SOUNDS = {
  // Mice
  squeak: (a, o, R, { big }) => {
    if (big) { a.tone(o, { type: 'sawtooth', f: 520, f2: 260, dur: 0.35, vol: 0.25, vib: 30 }); a.noise(o, { dur: 0.3, vol: 0.15, type: 'lowpass', f: 900 }); return; }
    const f = 1700 + R() * 1200;
    a.tone(o, { f, f2: f * 1.5, dur: 0.07, vol: 0.18 }); a.tone(o, { f: f * 1.2, f2: f * 0.8, t: 0.07, dur: 0.08, vol: 0.14 });
  },
  leak: (a, o) => { a.tone(o, { type: 'square', f: 600, f2: 150, dur: 0.45, vol: 0.12 }); },
  ratSpit: (a, o) => { a.noise(o, { dur: 0.18, vol: 0.4, f: 900, f2: 400, q: 2 }); a.tone(o, { f: 380, f2: 180, dur: 0.15, vol: 0.2 }); },
  globSplat: (a, o) => { a.noise(o, { dur: 0.15, vol: 0.35, type: 'lowpass', f: 700, f2: 200 }); },
  burst: (a, o, R) => { a.noise(o, { dur: 0.12, vol: 0.5, type: 'lowpass', f: 1200 }); for (let k = 0; k < 3; k++) a.tone(o, { f: 2200 + R() * 800, f2: 3000, t: 0.04 + k * 0.05, dur: 0.05, vol: 0.12 }); },
  bossRoar: (a, o) => {
    a.tone(o, { type: 'sawtooth', f: 95, f2: 55, dur: 1.3, vol: 0.5, att: 0.08, vib: 8 });
    a.tone(o, { type: 'sawtooth', f: 142, f2: 70, dur: 1.2, vol: 0.3, att: 0.1, vib: 12 });
    a.noise(o, { dur: 1.2, vol: 0.35, type: 'lowpass', f: 500, f2: 150, att: 0.1 });
  },
  stompWarn: (a, o) => { a.tone(o, { type: 'square', f: 220, f2: 520, dur: 0.6, vol: 0.12 }); },
  stomp: (a, o) => { a.tone(o, { f: 70, f2: 30, dur: 0.6, vol: 0.9 }); a.noise(o, { dur: 0.5, vol: 0.5, type: 'lowpass', f: 400, f2: 80 }); },
  // Cats
  pellet: (a, o, R) => { a.noise(o, { dur: 0.05, vol: 0.25, f: 2200 + R() * 600, q: 3 }); a.tone(o, { f: 900, f2: 500, dur: 0.04, vol: 0.06 }); },
  hit: (a, o, R) => { a.noise(o, { dur: 0.05, vol: 0.2, type: 'lowpass', f: 1600 + R() * 600 }); },
  hairball: (a, o) => { a.noise(o, { dur: 0.35, vol: 0.45, type: 'lowpass', f: 900, f2: 300 }); a.tone(o, { type: 'sawtooth', f: 160, f2: 90, dur: 0.3, vol: 0.12 }); },
  hairSplat: (a, o) => { a.noise(o, { dur: 0.25, vol: 0.5, type: 'lowpass', f: 600, f2: 150 }); },
  bite: (a, o, R) => { a.noise(o, { dur: 0.06, vol: 0.4, f: 1400 + R() * 400, q: 2 }); a.noise(o, { t: 0.05, dur: 0.06, vol: 0.3, f: 1000, q: 2 }); },
  eat: (a, o) => { a.noise(o, { dur: 0.08, vol: 0.4, f: 1300, q: 2 }); a.tone(o, { f: 320, f2: 110, t: 0.12, dur: 0.18, vol: 0.3 }); },
  pounce: (a, o) => { a.noise(o, { dur: 0.3, vol: 0.35, f: 400, f2: 2200, q: 1.5 }); },
  pounceLand: (a, o) => { a.tone(o, { f: 130, f2: 40, dur: 0.3, vol: 0.7 }); a.noise(o, { dur: 0.25, vol: 0.4, type: 'lowpass', f: 600 }); },
  leap: (a, o) => { a.noise(o, { dur: 0.2, vol: 0.25, f: 600, f2: 1800, q: 1 }); },
  jump: (a, o) => { a.noise(o, { dur: 0.08, vol: 0.12, f: 1200, f2: 2400, q: 1 }); },
  wallkick: (a, o) => { a.tone(o, { type: 'triangle', f: 260, f2: 160, dur: 0.07, vol: 0.25 }); },
  catHurt: (a, o) => { a.noise(o, { dur: 0.3, vol: 0.35, type: 'highpass', f: 2500, att: 0.02 }); },
  catDeath: (a, o) => { a.tone(o, { type: 'sawtooth', f: 520, f2: 300, dur: 0.8, vol: 0.18, att: 0.05, vib: 40 }); a.noise(o, { dur: 0.5, vol: 0.2, type: 'highpass', f: 2500 }); },
  whip: (a, o) => { a.noise(o, { dur: 0.12, vol: 0.25, f: 800, f2: 4000, q: 1 }); a.noise(o, { t: 0.1, dur: 0.03, vol: 0.8, type: 'highpass', f: 3500 }); },
  hiss: (a, o) => { a.noise(o, { dur: 0.9, vol: 0.55, type: 'highpass', f: 3200, att: 0.05 }); a.noise(o, { dur: 0.7, vol: 0.2, f: 6000, q: 2, att: 0.08 }); },
  whisker: (a, o, R) => { a.tone(o, { type: 'triangle', f: 3200 + R() * 400, f2: 1800, dur: 0.07, vol: 0.08 }); a.noise(o, { dur: 0.04, vol: 0.12, type: 'highpass', f: 6000 }); },
  purr: (a, o) => { a.tone(o, { type: 'sawtooth', f: 26, dur: 1.4, vol: 0.5, att: 0.15, vib: 6 }); a.noise(o, { dur: 1.3, vol: 0.25, type: 'lowpass', f: 220, att: 0.15 });
    [523, 659, 784].forEach((f, k) => a.tone(o, { f, t: 0.2 + k * 0.12, dur: 0.5, vol: 0.06 })); },
  dodge: (a, o) => { a.noise(o, { dur: 0.15, vol: 0.2, f: 2500, f2: 800, q: 1 }); },
  claw: (a, o, R, { hits }) => { a.noise(o, { dur: 0.07, vol: 0.3, f: 3000 + R() * 1000, f2: 1500, q: 2 }); if (hits) a.noise(o, { t: 0.03, dur: 0.05, vol: 0.25, type: 'lowpass', f: 1200 }); },
  frenzy: (a, o) => { a.tone(o, { type: 'sawtooth', f: 400, f2: 900, dur: 0.5, vol: 0.2, att: 0.03, vib: 60 }); a.noise(o, { dur: 0.5, vol: 0.3, type: 'highpass', f: 2500 }); },
  burr: (a, o) => { a.tone(o, { f: 500, f2: 260, dur: 0.06, vol: 0.18 }); },
  yawn: (a, o) => { a.tone(o, { type: 'triangle', f: 520, f2: 180, dur: 1.2, vol: 0.25, att: 0.2, vib: 8 }); a.noise(o, { dur: 1.0, vol: 0.12, type: 'lowpass', f: 900, f2: 300, att: 0.2 });
    [784, 659, 523].forEach((f, k) => a.tone(o, { f, t: 0.6 + k * 0.15, dur: 0.4, vol: 0.06 })); },
  pebble: (a, o, R) => { a.tone(o, { type: 'triangle', f: 900 + R() * 300, f2: 500, dur: 0.05, vol: 0.12 }); },
  roar: (a, o) => { a.tone(o, { type: 'sawtooth', f: 160, f2: 70, dur: 1.1, vol: 0.45, att: 0.05, vib: 14 }); a.tone(o, { type: 'sawtooth', f: 240, f2: 110, dur: 0.9, vol: 0.2, att: 0.05, vib: 20 });
    a.noise(o, { dur: 1.0, vol: 0.45, type: 'lowpass', f: 900, f2: 200, att: 0.05 }); },
  birdIn: (a, o, R, { kind }) => { const f = kind === 'crow' ? 700 : 1400; for (let k = 0; k < 2; k++) a.tone(o, { type: 'sawtooth', f, f2: f * 0.7, t: k * 0.22, dur: 0.16, vol: 0.12 }); },
  birdKill: (a, o) => { a.noise(o, { dur: 0.3, vol: 0.4, f: 2000, f2: 600, q: 1 }); a.tone(o, { type: 'sawtooth', f: 900, f2: 300, dur: 0.25, vol: 0.12 }); },
  steal: (a, o) => { a.tone(o, { type: 'square', f: 1600, f2: 2200, dur: 0.12, vol: 0.08 }); a.tone(o, { type: 'square', f: 1800, f2: 2400, t: 0.14, dur: 0.12, vol: 0.08 }); },
  birdDrop: (a, o, R) => { for (let k = 0; k < 3; k++) a.tone(o, { f: 2000 + R() * 800, f2: 1200, t: k * 0.06, dur: 0.08, vol: 0.12 }); },
  dash: (a, o) => { a.noise(o, { dur: 0.22, vol: 0.35, f: 600, f2: 3000, q: 1 }); },
  sit: (a, o) => { a.tone(o, { f: 90, f2: 35, dur: 0.5, vol: 0.9 }); a.noise(o, { dur: 0.4, vol: 0.5, type: 'lowpass', f: 500, f2: 120 }); },
  tinker: (a, o) => { [1200, 1600, 2000, 2400].forEach((f, k) => a.tone(o, { type: 'square', f, t: k * 0.05, dur: 0.06, vol: 0.06 })); a.noise(o, { t: 0.2, dur: 0.1, vol: 0.2, f: 4000, q: 4 }); },
  showoff: (a, o) => { a.tone(o, { type: 'sawtooth', f: 300, f2: 600, dur: 0.4, vol: 0.2, vib: 20 }); a.tone(o, { type: 'sawtooth', f: 450, f2: 900, t: 0.1, dur: 0.4, vol: 0.12, vib: 20 }); },
  groom: (a, o) => { for (let k = 0; k < 3; k++) a.noise(o, { t: k * 0.12, dur: 0.1, vol: 0.18, f: 3000, f2: 1500, q: 2 }); [659, 880].forEach((f, k) => a.tone(o, { f, t: 0.35 + k * 0.1, dur: 0.3, vol: 0.08 })); },
  skyswipe: (a, o) => { a.noise(o, { dur: 0.35, vol: 0.3, f: 500, f2: 3000, q: 1 }); },
  toySqueak: (a, o, R) => { const f = 1500 + R() * 500; a.tone(o, { f, f2: f * 1.6, dur: 0.12, vol: 0.2 }); },
  decoyGone: (a, o) => { a.tone(o, { f: 1800, f2: 600, dur: 0.3, vol: 0.15 }); },
  item_laser: (a, o) => { a.tone(o, { type: 'sine', f: 2400, dur: 0.25, vol: 0.06 }); },
  item_bola: (a, o) => { a.noise(o, { dur: 0.3, vol: 0.3, f: 800, f2: 300, q: 2 }); },
  item_catnip: (a, o) => { a.noise(o, { dur: 0.5, vol: 0.35, type: 'lowpass', f: 1500, f2: 400 }); [523, 659, 784].forEach((f, k) => a.tone(o, { f, t: k * 0.08, dur: 0.3, vol: 0.06 })); },
  item_flea: (a, o) => { a.noise(o, { dur: 0.6, vol: 0.3, type: 'highpass', f: 5000, att: 0.05 }); },
  item_tonic: (a, o) => { for (let k = 0; k < 4; k++) a.tone(o, { f: 300 + k * 40, f2: 200, t: k * 0.09, dur: 0.08, vol: 0.2 }); },
  item_squeaky: (a, o) => { a.tone(o, { f: 1600, f2: 2600, dur: 0.15, vol: 0.25 }); a.tone(o, { f: 2600, f2: 1400, t: 0.15, dur: 0.15, vol: 0.2 }); },
  // Traps
  snap: (a, o) => { a.noise(o, { dur: 0.04, vol: 0.7, type: 'highpass', f: 2500 }); a.tone(o, { type: 'triangle', f: 1500, dur: 0.25, vol: 0.12 }); a.tone(o, { f: 160, f2: 60, dur: 0.1, vol: 0.4 }); },
  flip: (a, o) => { a.tone(o, { f: 180, f2: 520, dur: 0.12, vol: 0.4 }); a.tone(o, { f: 520, f2: 240, t: 0.12, dur: 0.25, vol: 0.3, vib: 25 }); },
  zap: (a, o) => { a.tone(o, { type: 'sawtooth', f: 60, dur: 0.3, vol: 0.25 }); a.noise(o, { dur: 0.25, vol: 0.35, type: 'highpass', f: 4000 }); a.tone(o, { type: 'square', f: 1800, f2: 900, dur: 0.12, vol: 0.06 }); },
  punch: (a, o) => { a.tone(o, { f: 300, f2: 700, dur: 0.1, vol: 0.3, vib: 30 }); a.tone(o, { f: 110, f2: 50, t: 0.06, dur: 0.15, vol: 0.6 }); },
  glue: (a, o) => { a.noise(o, { dur: 0.2, vol: 0.3, type: 'lowpass', f: 800, f2: 150, q: 4 }); },
  tack: (a, o) => { a.tone(o, { type: 'triangle', f: 2600, dur: 0.03, vol: 0.06 }); },
  grind: (a, o) => { a.tone(o, { type: 'sawtooth', f: 90, dur: 0.25, vol: 0.12 }); a.noise(o, { dur: 0.25, vol: 0.15, f: 3000, q: 1 }); },
  splat: (a, o, R, { big }) => { a.noise(o, { dur: big ? 0.25 : 0.14, vol: big ? 0.6 : 0.4, type: 'lowpass', f: 900, f2: 200 }); a.tone(o, { f: 120, f2: 50, dur: 0.12, vol: 0.3 }); },
  splash: (a, o) => { a.noise(o, { dur: 0.45, vol: 0.4, f: 1500, f2: 500, q: 0.8 }); },
  place: (a, o) => { a.tone(o, { type: 'triangle', f: 220, f2: 150, dur: 0.1, vol: 0.4 }); a.noise(o, { dur: 0.06, vol: 0.2, f: 900, q: 3 }); },
  sell: (a, o) => { [1300, 1700].forEach((f, k) => a.tone(o, { type: 'triangle', f, t: k * 0.06, dur: 0.15, vol: 0.15 })); },
  // Gate, barricades
  gateHit: (a, o, R) => { a.tone(o, { type: 'triangle', f: 160 + R() * 40, f2: 110, dur: 0.1, vol: 0.4 }); a.noise(o, { dur: 0.06, vol: 0.2, f: 700, q: 2 }); },
  barricadeHit: (a, o, R) => { a.tone(o, { type: 'triangle', f: 240 + R() * 60, f2: 180, dur: 0.07, vol: 0.25 }); },
  gateBreak: (a, o) => { a.noise(o, { dur: 0.15, vol: 0.8, type: 'highpass', f: 1500 }); a.tone(o, { f: 70, f2: 30, t: 0.05, dur: 0.8, vol: 0.9 }); a.noise(o, { t: 0.05, dur: 0.7, vol: 0.4, type: 'lowpass', f: 500, f2: 100 }); },
  boom: (a, o) => { a.tone(o, { f: 60, f2: 25, dur: 0.7, vol: 0.9 }); a.noise(o, { dur: 0.6, vol: 0.5, type: 'lowpass', f: 700, f2: 100 }); },
  // Loot, money, UI
  pickup: (a, o, R) => { a.tone(o, { f: 900 + R() * 200, f2: 1400, dur: 0.06, vol: 0.12 }); },
  stash: (a, o) => { [988, 1319, 1568, 1976].forEach((f, k) => a.tone(o, { type: 'triangle', f, t: k * 0.05, dur: 0.25, vol: 0.18 })); a.noise(o, { t: 0.2, dur: 0.15, vol: 0.15, type: 'highpass', f: 5000 }); },
  trinket: (a, o) => { [784, 988, 1175, 1568, 1976].forEach((f, k) => a.tone(o, { f, t: k * 0.06, dur: 0.3, vol: 0.12 })); },
  waveStart: (a, o, R, { boss }) => {
    const base = boss ? 110 : 147;
    a.tone(o, { type: 'sawtooth', f: base, dur: 0.9, vol: 0.18, att: 0.15, vib: 3 });
    a.tone(o, { type: 'sawtooth', f: base * 1.5, t: 0.45, dur: 1.0, vol: 0.14, att: 0.15, vib: 3 });
    if (boss) a.tone(o, { type: 'sawtooth', f: base * 0.75, t: 0.9, dur: 1.2, vol: 0.18, att: 0.1, vib: 4 });
  },
  waveClear: (a, o) => { [523, 659, 784, 1047].forEach((f, k) => a.tone(o, { type: 'triangle', f, t: k * 0.11, dur: k === 3 ? 0.6 : 0.2, vol: 0.2 })); },
  intro: (a, o) => { [880, 1175].forEach((f, k) => a.tone(o, { type: 'triangle', f, t: k * 0.12, dur: 0.3, vol: 0.18 })); },
  win: (a, o) => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, k) => a.tone(o, { type: 'triangle', f, t: k * 0.14, dur: 0.4, vol: 0.2 })); },
  lose: (a, o) => { [392, 370, 349, 262].forEach((f, k) => a.tone(o, { type: 'sawtooth', f, t: k * 0.35, dur: 0.5, vol: 0.12, vib: 4 })); },
  // New traps and items (0.11).
  sizzle: (a, o) => { a.noise(o, { dur: 0.5, vol: 0.35, type: 'highpass', f: 3000, att: 0.02 }); a.noise(o, { dur: 0.3, vol: 0.15, f: 6000, q: 3 }); },
  chill: (a, o, R) => { for (let k = 0; k < 3; k++) a.tone(o, { type: 'triangle', f: 3000 + R() * 1500, t: k * 0.05, dur: 0.1, vol: 0.06 }); },
  roll: (a, o) => { a.noise(o, { dur: 0.45, vol: 0.4, type: 'lowpass', f: 300, f2: 500 }); a.tone(o, { f: 70, f2: 60, dur: 0.45, vol: 0.4 }); },
  darts: (a, o, R) => { for (let k = 0; k < 4; k++) a.noise(o, { t: k * 0.03, dur: 0.06, vol: 0.25, f: 3500 + R() * 1500, f2: 1500, q: 3 }); },
  gust: (a, o) => { a.noise(o, { dur: 0.6, vol: 0.5, type: 'lowpass', f: 400, f2: 1400, att: 0.05 }); a.tone(o, { type: 'sawtooth', f: 60, dur: 0.3, vol: 0.12 }); },
  flame: (a, o) => { a.noise(o, { dur: 0.5, vol: 0.5, type: 'lowpass', f: 800, f2: 2500, att: 0.02 }); },
  hypno: (a, o) => { a.tone(o, { type: 'sine', f: 400, f2: 800, dur: 0.6, vol: 0.12, vib: 30 }); a.tone(o, { type: 'sine', f: 600, f2: 300, t: 0.1, dur: 0.6, vol: 0.08, vib: 30 }); },
  potDrop: (a, o) => { a.noise(o, { dur: 0.08, vol: 0.7, type: 'highpass', f: 1800 }); a.noise(o, { t: 0.05, dur: 0.4, vol: 0.4, type: 'lowpass', f: 900, f2: 200 }); a.tone(o, { f: 160, f2: 60, dur: 0.2, vol: 0.4 }); },
  splashDown: (a, o) => { a.noise(o, { dur: 0.6, vol: 0.5, f: 1200, f2: 400, q: 0.7 }); },
  salt: (a, o) => { a.noise(o, { dur: 0.25, vol: 0.12, type: 'highpass', f: 7000 }); },
  slip: (a, o) => { a.tone(o, { f: 600, f2: 1400, dur: 0.15, vol: 0.12 }); a.tone(o, { f: 150, f2: 70, t: 0.15, dur: 0.12, vol: 0.3 }); },
  stickBird: (a, o) => { a.noise(o, { dur: 0.25, vol: 0.3, type: 'lowpass', f: 700, f2: 200, q: 4 }); a.tone(o, { type: 'sawtooth', f: 1200, f2: 600, dur: 0.3, vol: 0.08 }); },
  squirt: (a, o) => { a.noise(o, { dur: 0.35, vol: 0.4, f: 2500, f2: 1200, q: 1 }); },
  item_bell: (a, o) => { [1568, 2093, 1568, 2093].forEach((f, k) => a.tone(o, { type: 'sine', f, t: k * 0.09, dur: 0.6, vol: 0.12 })); },
  item_pistol: (a, o) => { a.noise(o, { dur: 0.3, vol: 0.4, f: 2500, f2: 1200, q: 1 }); },
  item_matches: (a, o) => { a.noise(o, { dur: 0.1, vol: 0.4, type: 'highpass', f: 2500 }); a.noise(o, { t: 0.08, dur: 0.6, vol: 0.35, type: 'lowpass', f: 600, f2: 2000 }); },
  item_holy: (a, o) => { [1047, 1319, 1568, 2093].forEach((f, k) => a.tone(o, { type: 'triangle', f, t: k * 0.05, dur: 0.8, vol: 0.08 })); a.noise(o, { dur: 0.4, vol: 0.3, f: 1500, f2: 600, q: 0.8 }); },
  // Element combos.
  combo_chain: (a, o) => { a.noise(o, { dur: 0.35, vol: 0.45, type: 'highpass', f: 3500 }); a.tone(o, { type: 'sawtooth', f: 90, dur: 0.35, vol: 0.3 }); a.tone(o, { type: 'square', f: 2400, f2: 600, dur: 0.2, vol: 0.08 }); },
  combo_blaze: (a, o) => { a.noise(o, { dur: 0.7, vol: 0.55, type: 'lowpass', f: 300, f2: 2500, att: 0.04 }); a.tone(o, { f: 80, f2: 160, dur: 0.5, vol: 0.4 }); },
  combo_freeze: (a, o, R) => { for (let k = 0; k < 5; k++) a.tone(o, { type: 'triangle', f: 2600 + R() * 1200, t: k * 0.04, dur: 0.12, vol: 0.08 }); a.noise(o, { dur: 0.3, vol: 0.25, type: 'highpass', f: 6000 }); },
  combo_spread: (a, o) => { a.noise(o, { dur: 0.6, vol: 0.35, f: 400, f2: 1600, q: 0.7, att: 0.08 }); },
  combo_knockdown: (a, o) => { a.tone(o, { f: 140, f2: 45, dur: 0.25, vol: 0.6 }); a.noise(o, { dur: 0.12, vol: 0.3, type: 'lowpass', f: 900 }); },
  combo_steam: (a, o) => { a.noise(o, { dur: 0.6, vol: 0.4, type: 'highpass', f: 2800, att: 0.03 }); },
  execute: (a, o) => { a.tone(o, { type: 'sawtooth', f: 220, f2: 55, dur: 0.6, vol: 0.18, vib: 10 }); a.tone(o, { f: 110, f2: 40, t: 0.1, dur: 0.5, vol: 0.4 }); },
  click: (a, o) => { a.tone(o, { type: 'triangle', f: 700, f2: 500, dur: 0.05, vol: 0.15 }); },
  deny: (a, o) => { a.tone(o, { type: 'square', f: 180, dur: 0.12, vol: 0.08 }); },
};
export const SOUND_NAMES = Object.keys(SOUNDS);   // for the self-test
