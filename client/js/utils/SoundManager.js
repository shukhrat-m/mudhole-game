export default class SoundManager {
  constructor() {
    this._ctx    = null;
    this._master = null;
    this._muted  = false;
    this._volume = 0.6;
    this._cameraX = 0;
    this._screenW = window.innerWidth;
  }

  async init() {
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._volume;
    this._master.connect(this._ctx.destination);
  }

  // ─── private helpers ─────────────────────────────────────────────────────

  _resume() {
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
  }

  _dist(x) {
    if (x === undefined) return 1;
    const screenCenterX = this._cameraX + this._screenW / 2;
    return Math.max(0.04, 1 - Math.abs(x - screenCenterX) / (this._screenW * 0.85));
  }

  _out(vol, x) {
    const g = this._ctx.createGain();
    g.gain.value = vol * this._dist(x);
    g.connect(this._master);
    return g;
  }

  _osc(type, freq, freqEnd, dur, vol, x, startAt) {
    const t0 = (startAt ?? this._ctx.currentTime);
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    env.gain.setValueAtTime(vol, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(this._out(1, x));
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, freq, q, vol, x, startAt) {
    const t0 = (startAt ?? this._ctx.currentTime);
    const len  = Math.ceil(this._ctx.sampleRate * dur);
    const buf  = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = this._ctx.createBufferSource();
    src.buffer = buf;

    const filt = this._ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;

    const env = this._ctx.createGain();
    env.gain.setValueAtTime(vol, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filt);
    filt.connect(env);
    env.connect(this._out(1, x));
    src.start(t0);
  }

  // ─── public API ──────────────────────────────────────────────────────────

  setCameraX(x) { this._cameraX = x; }
  setVolume(v)  { this._volume = v; if (this._master) this._master.gain.value = v; }
  setMuted(m)   { this._muted = m; }

  playExplosion(x) {
    if (this._muted || !this._ctx) return;
    this._resume();
    this._osc('sine',     80,  18,  0.9, 0.55, x);
    this._noise(0.55, 180, 0.6, 0.8, x);
    this._noise(0.25, 900, 0.5, 0.4, x);
  }

  playJump() {
    if (this._muted || !this._ctx) return;
    this._resume();
    this._osc('square', 180, 380, 0.12, 0.12);
  }

  playHurt() {
    if (this._muted || !this._ctx) return;
    this._resume();
    this._noise(0.14, 1400, 0.8, 0.28);
    this._osc('sawtooth', 420, 200, 0.1, 0.18);
  }

  playDeath() {
    if (this._muted || !this._ctx) return;
    this._resume();
    this._osc('sawtooth', 320, 55, 0.55, 0.28);
    this._noise(0.5, 380, 0.5, 0.18);
  }

  playSplash(x) {
    if (this._muted || !this._ctx) return;
    this._resume();
    this._noise(0.35, 2200, 0.6, 0.2, x);
    this._osc('sine', 580, 180, 0.3, 0.14, x);
  }

  playWin() {
    if (this._muted || !this._ctx) return;
    this._resume();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const t = this._ctx.currentTime + i * 0.13;
      this._osc('sine', f, f * 1.002, 0.45, 0.28, undefined, t);
    });
  }

  playClick() {
    if (this._muted || !this._ctx) return;
    this._resume();
    this._osc('square', 900, 400, 0.04, 0.09);
  }

  playTick() {
    if (this._muted || !this._ctx) return;
    this._resume();
    this._osc('square', 1300, 900, 0.03, 0.08);
  }

  playShot(weapon, x) {
    if (this._muted || !this._ctx) return;
    this._resume();
    switch (weapon) {
      case 'bazooka':
        this._noise(0.18, 280, 0.5, 0.45, x);
        this._osc('sawtooth', 140, 70, 0.22, 0.28, x);
        break;
      case 'machinegun':
        this._noise(0.07, 2200, 0.7, 0.28, x);
        this._osc('square', 500, 280, 0.05, 0.18, x);
        break;
      case 'airstrike':
        this._osc('sawtooth', 880, 200, 1.8, 0.18, x);
        this._noise(0.4, 500, 0.4, 0.14, x);
        break;
      case 'holy_grenade':
        this._osc('sine', 660, 880, 0.15, 0.2, x);
        this._noise(0.12, 400, 0.6, 0.2, x);
        break;
      default: // grenade, mine
        this._noise(0.1, 450, 0.7, 0.3, x);
        this._osc('triangle', 260, 130, 0.1, 0.14, x);
    }
  }
}
