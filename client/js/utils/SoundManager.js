export default class SoundManager {
  constructor() {
    this._ctx = null;
    this._master = null;
    this._buffers = {};
    this._muted = false;
    this._volume = 0.7;
    this._cameraX = 0;
    this._screenW = window.innerWidth;
  }

  async init() {
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._volume;
    this._master.connect(this._ctx.destination);

    const sounds = {
      explosion:  '/assets/sounds/explosion.wav',
      bazooka:    '/assets/sounds/bazooka.wav',
      machinegun: '/assets/sounds/machinegun.wav',
      jump:       '/assets/sounds/jump.wav',
      step:       '/assets/sounds/step.wav',
      hurt:       '/assets/sounds/hurt.wav',
      death:      '/assets/sounds/death.wav',
      airstrike:  '/assets/sounds/airstrike.wav',
      win:        '/assets/sounds/win.wav',
      splash:     '/assets/sounds/splash.wav',
      click:      '/assets/sounds/click.wav',
      tick:       '/assets/sounds/tick.wav',
    };

    await Promise.allSettled(
      Object.entries(sounds).map(([name, url]) => this._load(name, url))
    );
  }

  async _load(name, url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const buf = await r.arrayBuffer();
      this._buffers[name] = await this._ctx.decodeAudioData(buf);
    } catch { /* звук отсутствует — пропустить */ }
  }

  play(name, options = {}) {
    if (this._muted || !this._ctx || !this._buffers[name]) return;
    if (this._ctx.state === 'suspended') this._ctx.resume();

    const buf = this._buffers[name];
    const src = this._ctx.createBufferSource();
    src.buffer = buf;

    // Питч-рандомизация
    if (options.pitch !== false) {
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
    }

    // Дистанционное затухание
    const gain = this._ctx.createGain();
    if (options.x !== undefined) {
      const dist = Math.abs(options.x - (this._cameraX + this._screenW / 2));
      const falloff = Math.max(0.05, 1 - dist / (this._screenW * 0.8));
      gain.gain.value = falloff * (options.volume || 1);
    } else {
      gain.gain.value = options.volume || 1;
    }

    src.connect(gain);
    gain.connect(this._master);
    src.start();
  }

  setCameraX(x) { this._cameraX = x; }
  setVolume(v)  { this._volume = v; if (this._master) this._master.gain.value = v; }
  setMuted(m)   { this._muted = m; }

  playExplosion(x, y) { this.play('explosion', { x, pitch: true }); }
  playJump()          { this.play('jump',      { pitch: true, volume: 0.6 }); }
  playHurt()          { this.play('hurt',      { pitch: true, volume: 0.7 }); }
  playDeath()         { this.play('death',     { pitch: false }); }
  playSplash(x)       { this.play('splash',    { x, pitch: true }); }
  playWin()           { this.play('win',       { pitch: false, volume: 0.8 }); }
  playClick()         { this.play('click',     { pitch: false, volume: 0.5 }); }
  playTick()          { this.play('tick',      { pitch: false, volume: 0.4 }); }
  playShot(weapon, x) {
    const map = { bazooka: 'bazooka', machinegun: 'machinegun', airstrike: 'airstrike' };
    this.play(map[weapon] || 'explosion', { x, volume: 0.8 });
  }
}
