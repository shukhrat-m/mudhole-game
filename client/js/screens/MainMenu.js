import { showScreen } from '../main.js';

const WORM_COLORS = ['#4a9eff', '#ff4a4a', '#4aff88', '#ffb84a', '#c44aff', '#ff4ac4'];

export default class MainMenu {
  constructor() {
    this._raf = null;
    this._worms = [];
    this._canvas = null;
    this._ctx = null;
    this._t = 0;
  }

  init(ui) {
    // Canvas фон
    this._canvas = document.getElementById('canvas-bg');
    this._ctx = this._canvas.getContext('2d');
    this._spawnWorms();

    ui.innerHTML = `
      <div class="screen" id="main-menu-screen">
        <div style="text-align:center">
          <div class="logo">MUDHOLE</div>
          <div class="logo-sub">Multiplayer Worms</div>
          <div style="display:flex;flex-direction:column;gap:0;width:240px;margin:0 auto">
            <button class="btn btn-primary" id="btn-create">Host Game</button>
            <button class="btn btn-secondary" id="btn-join">Join Game</button>
            <button class="btn btn-ghost" id="btn-settings">Settings</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-create').onclick   = () => showScreen('createServer');
    document.getElementById('btn-join').onclick     = () => showScreen('joinServer');
    document.getElementById('btn-settings').onclick = () => showScreen('settings', { from: 'mainMenu' });

    this._loop();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._ctx) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  _spawnWorms() {
    this._worms = [];
    for (let i = 0; i < 8; i++) {
      this._worms.push(this._newWorm());
    }
  }

  _newWorm() {
    const W = this._canvas.width;
    return {
      x: Math.random() * W,
      y: -40 - Math.random() * 400,
      vy: 1.5 + Math.random() * 2,
      rot: (Math.random() - 0.5) * 0.05,
      angle: 0,
      color: WORM_COLORS[Math.floor(Math.random() * WORM_COLORS.length)],
      scale: 0.7 + Math.random() * 0.6,
      wobble: Math.random() * Math.PI * 2,
    };
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this._t++;

    const W = this._canvas.width, H = this._canvas.height;
    const ctx = this._ctx;
    ctx.clearRect(0, 0, W, H);

    // Фон-градиент
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0a1a');
    grad.addColorStop(1, '#12121f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Звёзды (статичные точки)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 137.5) % W);
      const sy = ((i * 97.3) % (H * 0.6));
      const alpha = 0.3 + 0.4 * Math.sin(this._t * 0.02 + i);
      ctx.globalAlpha = alpha;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // Черви
    this._worms.forEach(w => {
      w.y += w.vy;
      w.angle += w.rot;
      w.wobble += 0.04;

      if (w.y > H + 60) Object.assign(w, { ...this._newWorm(), x: Math.random() * W });

      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      ctx.scale(w.scale, w.scale);
      this._drawWorm(ctx, w.color);
      ctx.restore();
    });
  }

  _drawWorm(ctx, color) {
    // Тело
    ctx.fillStyle = color;
    this._roundRect(ctx, -8, -12, 16, 24, 8);
    ctx.fill();

    // Голова
    ctx.fillStyle = this._lighten(color, 20);
    ctx.beginPath();
    ctx.ellipse(0, -20, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Глаза
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4, -21, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -21, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(-3.5, -21, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4.5, -21, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (n >> 16) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }
}
