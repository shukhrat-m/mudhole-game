import { showScreen } from '../main.js';

export default class MainMenu {
  constructor() {
    this._raf        = null;
    this._canvas     = null;
    this._ctx        = null;
    this._t          = 0;
    this._stars      = [];
    this._clouds     = [];
    this._particles  = [];
    this._projectiles = [];
    this._teamA      = [];
    this._teamB      = [];
    this._groundY    = 0;
    this._nextShot   = 80;
    this._W          = 0;
    this._H          = 0;
  }

  init(ui) {
    this._canvas = document.getElementById('canvas-bg');
    this._ctx    = this._canvas.getContext('2d');
    this._syncSize();
    this._initScene();

    ui.innerHTML = `
      <div class="mm-screen">
        <div class="mm-panel">
          <div class="mm-logo-wrap">
            <div class="mm-logo">MUDHOLE</div>
            <div class="mm-logo-glow"></div>
          </div>
          <div class="mm-tagline">Multiplayer worm warfare &nbsp;·&nbsp; Battle to the last</div>

          <div class="mm-btns">
            <button class="mm-btn mm-btn-host" id="btn-create">
              <svg class="mm-btn-icon" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5L10 2Z" fill="currentColor"/>
              </svg>
              Host Game
            </button>
            <button class="mm-btn mm-btn-join" id="btn-join">
              <svg class="mm-btn-icon" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3.5 10 Q7 5 10 10 Q13 15 16.5 10" stroke="currentColor" stroke-width="1.4" fill="none"/>
                <line x1="3" y1="7.5" x2="17" y2="7.5" stroke="currentColor" stroke-width="1.2"/>
                <line x1="3" y1="12.5" x2="17" y2="12.5" stroke="currentColor" stroke-width="1.2"/>
              </svg>
              Join Game
            </button>
            <button class="mm-btn mm-btn-settings" id="btn-settings">Settings</button>
          </div>

          <div class="mm-footer">
            <span class="mm-key">Enter</span> Host &nbsp;·&nbsp; <span class="mm-key">Tab</span> Join
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-create').onclick   = () => showScreen('createServer');
    document.getElementById('btn-join').onclick     = () => showScreen('joinServer');
    document.getElementById('btn-settings').onclick = () => showScreen('settings', { from: 'mainMenu' });

    window.addEventListener('keydown', this._onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); showScreen('createServer'); }
      if (e.key === 'Tab')   { e.preventDefault(); showScreen('joinServer'); }
    });

    this._loop();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKey);
    if (this._ctx) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  // ─── Setup ─────────────────────────────────────────────────────────────

  _syncSize() {
    const W = window.innerWidth, H = window.innerHeight;
    if (this._canvas.width !== W || this._canvas.height !== H) {
      this._canvas.width  = W;
      this._canvas.height = H;
    }
    this._W = W;
    this._H = H;
  }

  _initScene() {
    const W = this._W, H = this._H;
    this._groundY = Math.round(H * 0.72);
    const gY = this._groundY;

    // Stars
    this._stars = Array.from({ length: 160 }, (_, i) => ({
      x: (i * 137.508) % W,
      y: (i * 97.314)  % (H * 0.52),
      r: 0.4 + ((i * 0.618) % 1) * 1.3,
      phase: (i * 2.399) % (Math.PI * 2),
      speed: 0.006 + ((i * 0.317) % 1) * 0.014,
    }));

    // Clouds (very subtle)
    this._clouds = Array.from({ length: 6 }, (_, i) => ({
      x: (i / 6) * W * 1.4,
      y: H * 0.04 + ((i * 0.618) % 1) * H * 0.14,
      w: 100 + ((i * 0.414) % 1) * 200,
      h: 35  + ((i * 0.618) % 1) * 35,
      spd: 0.08 + ((i * 0.272) % 1) * 0.12,
      alpha: 0.035 + ((i * 0.618) % 1) * 0.05,
    }));

    // Worm positions — placed on the terrain surface
    const tyA1 = this._terrainY(W * 0.11, W, gY);
    const tyA2 = this._terrainY(W * 0.19, W, gY);
    const tyB1 = this._terrainY(W * 0.81, W, gY);
    const tyB2 = this._terrainY(W * 0.89, W, gY);

    const defaultAngle = 0.1;

    this._teamA = [
      this._mkWorm('A', W * 0.11, tyA1,  1, -defaultAngle, 'Sergeant'),
      this._mkWorm('A', W * 0.19, tyA2, -1, -defaultAngle * 0.6, 'Corporal'),
    ];
    this._teamB = [
      this._mkWorm('B', W * 0.81, tyB1,  1, Math.PI + defaultAngle * 0.6, 'Kilo'),
      this._mkWorm('B', W * 0.89, tyB2, -1, Math.PI + defaultAngle, 'Lima'),
    ];

    this._nextShot = 100;
    this._particles  = [];
    this._projectiles = [];
  }

  _mkWorm(team, x, y, dir, aimAngle, name) {
    return { team, x, y, dir, aimAngle, name,
      hp: 72 + Math.random() * 28, maxHp: 100,
      animT: Math.random() * 100, hurtFlash: 0, alive: true };
  }

  // ─── Terrain math ──────────────────────────────────────────────────────

  _terrainY(x, W, gY) {
    const t = x / W;
    // Two raised platforms with Gaussian bumps at 15% and 85%
    const bL = Math.exp(-Math.pow(t - 0.15, 2) / 0.018) * 58;
    const bR = Math.exp(-Math.pow(t - 0.85, 2) / 0.018) * 58;
    // Long smooth wave + small detail
    const w1 = Math.sin(t * 6.28) * 12;
    const w2 = Math.sin(t * 14.1 + 1.0) * 6;
    const w3 = Math.sin(t * 31.4 + 2.5) * 3;
    return gY - bL - bR + w1 + w2 + w3;
  }

  // ─── Main loop ─────────────────────────────────────────────────────────

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this._t++;

    this._syncSize();
    const W = this._W, H = this._H;

    this._updateBattle(W, H);
    this._updateParticles();
    this._updateProjectiles(W, H);

    const ctx = this._ctx;
    ctx.clearRect(0, 0, W, H);

    this._drawSky(ctx, W, H);
    this._drawStars(ctx, W, H);
    this._drawMountains(ctx, W, H);
    this._drawClouds(ctx, W, H);
    this._drawTerrain(ctx, W, H);
    this._drawParticles(ctx);
    this._drawProjectiles(ctx);
    this._drawWorms(ctx, W, H);
    this._drawVignette(ctx, W, H);
  }

  // ─── Battle AI ─────────────────────────────────────────────────────────

  _updateBattle(W, H) {
    this._nextShot--;
    [...this._teamA, ...this._teamB].forEach(w => {
      w.animT++;
      if (w.hurtFlash > 0) w.hurtFlash--;
    });

    if (this._nextShot <= 0) {
      this._shootFromRandomWorm(W, H);
      this._nextShot = 120 + Math.floor(Math.random() * 100);
    }
  }

  _shootFromRandomWorm(W, H) {
    const fromA = Math.random() < 0.5;
    const shooters = fromA ? this._teamA : this._teamB;
    const targets  = fromA ? this._teamB : this._teamA;

    const shooter = shooters[Math.floor(Math.random() * shooters.length)];
    const target  = targets[Math.floor(Math.random() * targets.length)];
    if (!shooter || !target) return;

    const dx    = target.x - shooter.x;
    const dy    = (target.y - 24) - (shooter.y - 24);
    const dist  = Math.hypot(dx, dy);
    const spd   = 8 + Math.random() * 5;
    // Aim slightly above target to compensate for gravity arc
    const loft  = dist * 0.12;
    const angle = Math.atan2(dy - loft, dx);

    shooter.aimAngle = angle;
    shooter.dir      = dx > 0 ? 1 : -1;

    const type = Math.random() < 0.55 ? 'grenade' : 'bazooka';

    this._projectiles.push({
      type,
      x: shooter.x + Math.cos(angle) * 20,
      y: shooter.y - 22 + Math.sin(angle) * 20,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      gravity: 0.22,
      bounces: type === 'grenade' ? 2 : 0,
      timer:   type === 'grenade' ? 90 + Math.floor(Math.random() * 30) : -1,
      trail: [],
    });
  }

  _updateProjectiles(W, H) {
    const gY = this._groundY;
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 14) p.trail.shift();

      p.vy += p.gravity;
      p.x  += p.vx;
      p.y  += p.vy;
      if (p.timer > 0) p.timer--;

      const sy = this._terrainY(p.x, W, gY);
      const hitTerrain = p.y >= sy;
      const oob        = p.x < -100 || p.x > W + 100 || p.y > H;
      const fused      = p.timer === 0;

      if (hitTerrain && p.bounces > 0) {
        p.bounces--;
        p.vy *= -0.45;
        p.vx *= 0.7;
        p.y   = sy - 2;
      } else if (hitTerrain || oob || fused) {
        if (!oob) {
          this._spawnExplosion(p.x, Math.min(p.y, sy), 30 + Math.random() * 20);
          [...this._teamA, ...this._teamB].forEach(w => {
            if (Math.hypot(w.x - p.x, w.y - p.y) < 90) {
              w.hurtFlash = 20;
              w.hp = Math.max(8, w.hp - (28 * (1 - Math.hypot(w.x - p.x, w.y - p.y) / 90)));
            }
          });
        }
        this._projectiles.splice(i, 1);
      }
    }
  }

  _spawnExplosion(x, y, r) {
    this._particles.push({ type: 'flash', x, y, r, life: 10, maxLife: 10 });
    this._particles.push({ type: 'ring',  x, y, maxR: r * 2.4, life: 24, maxLife: 24 });

    const cnt = Math.round(20 + r * 0.9);
    for (let i = 0; i < cnt; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * r * 0.14;
      const isDirt = Math.random() > 0.3;
      this._particles.push({
        type: 'debris', x, y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1.8,
        life: isDirt ? 48 + Math.random() * 28 : 16 + Math.random() * 12,
        maxLife: isDirt ? 76 : 28,
        size: isDirt ? 2.5 + Math.random() * 4 : 1.5 + Math.random() * 2.5,
        color: isDirt
          ? `hsl(${20 + Math.random() * 18},${40 + Math.random() * 18}%,${28 + Math.random() * 16}%)`
          : `hsl(${30 + Math.random() * 30},92%,${58 + Math.random() * 18}%)`,
        grav: 0.2,
      });
    }
    // Smoke puffs
    for (let i = 0; i < 5; i++) {
      this._particles.push({
        type: 'smoke', x: x + (Math.random() - 0.5) * r * 0.6, y,
        vx: (Math.random() - 0.5) * 0.5, vy: -0.45 - Math.random() * 0.5,
        life: 55 + Math.random() * 35, maxLife: 90,
        size: 7 + Math.random() * 14, grav: -0.018,
      });
    }
  }

  _updateParticles() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life--;
      if (p.life <= 0) { this._particles.splice(i, 1); continue; }
      if (p.type === 'debris' || p.type === 'smoke') {
        p.vy += p.grav; p.x += p.vx; p.y += p.vy; p.vx *= 0.985;
      }
    }
  }

  // ─── Draw ──────────────────────────────────────────────────────────────

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,    '#020610');
    g.addColorStop(0.20, '#040d20');
    g.addColorStop(0.50, '#071530');
    g.addColorStop(0.72, '#0c1c38');
    g.addColorStop(0.88, '#101824');
    g.addColorStop(1,    '#080f18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Team A aurora (blue, left)
    const aA = ctx.createRadialGradient(W * 0.13, H * 0.28, 0, W * 0.13, H * 0.28, W * 0.32);
    aA.addColorStop(0, 'rgba(40,90,220,0.07)');
    aA.addColorStop(1, 'rgba(40,90,220,0)');
    ctx.fillStyle = aA; ctx.fillRect(0, 0, W, H * 0.8);

    // Team B aurora (red, right)
    const aB = ctx.createRadialGradient(W * 0.87, H * 0.24, 0, W * 0.87, H * 0.24, W * 0.32);
    aB.addColorStop(0, 'rgba(220,40,40,0.065)');
    aB.addColorStop(1, 'rgba(220,40,40,0)');
    ctx.fillStyle = aB; ctx.fillRect(0, 0, W, H * 0.8);

    // Subtle horizon haze
    const hz = ctx.createLinearGradient(0, H * 0.58, 0, H * 0.76);
    hz.addColorStop(0, 'rgba(15,30,60,0)');
    hz.addColorStop(0.5, 'rgba(12,22,45,0.18)');
    hz.addColorStop(1, 'rgba(8,14,28,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, H * 0.58, W, H * 0.18);
  }

  _drawStars(ctx, W, H) {
    const t = this._t;
    this._stars.forEach(s => {
      const a = 0.3 + 0.5 * Math.sin(t * s.speed + s.phase);
      ctx.globalAlpha = a;
      // Brighter stars get a tiny cross sparkle
      if (s.r > 1.4) {
        ctx.strokeStyle = '#cce0ff';
        ctx.lineWidth = s.r * 0.6;
        ctx.beginPath();
        ctx.moveTo(s.x - s.r * 2, s.y); ctx.lineTo(s.x + s.r * 2, s.y);
        ctx.moveTo(s.x, s.y - s.r * 2); ctx.lineTo(s.x, s.y + s.r * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#d8ecff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  _drawMountains(ctx, W, H) {
    const gY = this._groundY;

    // Far distant layer
    ctx.fillStyle = 'rgba(14,22,48,0.6)';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      ctx.lineTo(x, gY - 70 - Math.sin(x * 0.0028 + 0.4) * 55 - Math.sin(x * 0.0062) * 30);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    // Mid layer
    ctx.fillStyle = 'rgba(10,16,36,0.75)';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      ctx.lineTo(x, gY - 38 - Math.sin(x * 0.004 + 1.1) * 40 - Math.sin(x * 0.009 + 0.5) * 20);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    // Foreground base (connects to terrain)
    ctx.fillStyle = 'rgba(6,10,22,0.9)';
    ctx.beginPath(); ctx.moveTo(0, H);
    ctx.lineTo(0, gY + 8); ctx.lineTo(W, gY + 8); ctx.lineTo(W, H);
    ctx.closePath(); ctx.fill();
  }

  _drawClouds(ctx, W, H) {
    const t = this._t;
    this._clouds.forEach(c => {
      c.x -= c.spd;
      if (c.x + c.w < 0) c.x = W + 80;
      ctx.globalAlpha = c.alpha * (0.8 + 0.2 * Math.sin(t * 0.008 + c.x));
      ctx.fillStyle = '#b4ccf0';
      const pts = [
        [c.x + c.w * 0.18, c.y + c.h * 0.55, c.w * 0.25],
        [c.x + c.w * 0.48, c.y + c.h * 0.28, c.w * 0.33],
        [c.x + c.w * 0.80, c.y + c.h * 0.52, c.w * 0.22],
        [c.x + c.w * 0.50, c.y + c.h * 0.66, c.w * 0.30],
      ];
      pts.forEach(([bx, by, br]) => {
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      });
    });
    ctx.globalAlpha = 1;
  }

  _drawTerrain(ctx, W, H) {
    const gY = this._groundY;

    // Build terrain path
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 3) {
      const y = this._terrainY(x, W, gY);
      x === 0 ? ctx.moveTo(0, H) || ctx.lineTo(0, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath();

    // Terrain body gradient (topsoil → deep rock)
    const tg = ctx.createLinearGradient(0, gY - 75, 0, H);
    tg.addColorStop(0,    '#3d6b28');
    tg.addColorStop(0.055,'#5a3415');
    tg.addColorStop(0.20, '#3c2010');
    tg.addColorStop(0.55, '#241408');
    tg.addColorStop(1,    '#100a04');
    ctx.fillStyle = tg;
    ctx.fill();

    // Rock detail - darker vertical streaks via additive overdraw
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const strk = ctx.createLinearGradient(0, gY, 0, H * 0.95);
    strk.addColorStop(0, 'rgba(40,25,12,0)');
    strk.addColorStop(1, 'rgba(20,12,6,0.5)');
    ctx.fillStyle = strk;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 3) ctx.lineTo(x, this._terrainY(x, W, gY));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Grass line — glowing green strip on top surface
    ctx.save();
    ctx.shadowColor = '#2aaa10';
    ctx.shadowBlur  = 5;
    ctx.strokeStyle = '#4ac428';
    ctx.lineWidth   = 3.5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const y = this._terrainY(x, W, gY);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Bright highlight on grass top
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(180,255,100,0.18)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const y = this._terrainY(x, W, gY) - 1.5;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Team color glow pooling near each platform base
    const glowA = ctx.createRadialGradient(W * 0.15, gY - 15, 0, W * 0.15, gY - 15, W * 0.14);
    glowA.addColorStop(0, 'rgba(74,158,255,0.065)');
    glowA.addColorStop(1, 'rgba(74,158,255,0)');
    ctx.fillStyle = glowA; ctx.fillRect(0, gY - 80, W * 0.35, H);

    const glowB = ctx.createRadialGradient(W * 0.85, gY - 15, 0, W * 0.85, gY - 15, W * 0.14);
    glowB.addColorStop(0, 'rgba(255,74,74,0.065)');
    glowB.addColorStop(1, 'rgba(255,74,74,0)');
    ctx.fillStyle = glowB; ctx.fillRect(W * 0.65, gY - 80, W * 0.35, H);

    // Ground fog
    const fog = ctx.createLinearGradient(0, gY - 8, 0, gY + 55);
    fog.addColorStop(0, 'rgba(8,18,36,0)');
    fog.addColorStop(0.4, 'rgba(8,16,32,0.28)');
    fog.addColorStop(1, 'rgba(4,8,18,0.55)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, gY - 8, W, 65);
  }

  _drawParticles(ctx) {
    this._particles.forEach(p => {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;

      if (p.type === 'flash') {
        const r  = p.r * (1.3 - (1 - a) * 0.5);
        const gd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gd.addColorStop(0,   'rgba(255,245,190,0.95)');
        gd.addColorStop(0.25,'rgba(255,165,40,0.75)');
        gd.addColorStop(1,   'rgba(255,60,0,0)');
        ctx.fillStyle = gd;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'ring') {
        const prog = 1 - a;
        ctx.strokeStyle = `rgba(255,175,55,${a * 0.7})`;
        ctx.lineWidth = 2.8 * a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.maxR * prog, 0, Math.PI * 2); ctx.stroke();
      } else if (p.type === 'smoke') {
        const r = p.size * (1 + (1 - a) * 1.8);
        ctx.fillStyle = `rgba(55,55,65,${a * 0.32})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      } else {
        // debris / sparks
        ctx.shadowColor = p.color; ctx.shadowBlur = 3;
        ctx.fillStyle   = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur  = 0;
      }
    });
    ctx.globalAlpha = 1;
  }

  _drawProjectiles(ctx) {
    this._projectiles.forEach(p => {
      if (p.trail.length > 1) {
        const col = p.type === 'bazooka' ? '#ff8840' : '#88ccff';
        for (let i = 1; i < p.trail.length; i++) {
          const a = (i / p.trail.length) * 0.5;
          ctx.globalAlpha = a;
          ctx.strokeStyle = col;
          ctx.lineWidth   = (i / p.trail.length) * 4;
          ctx.shadowColor = col; ctx.shadowBlur = 5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y);
          ctx.lineTo(p.trail[i].x,   p.trail[i].y);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.shadowBlur = 10;

      if (p.type === 'bazooka') {
        ctx.shadowColor = '#ff7020';
        ctx.fillStyle = '#8aaa6a'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(-11, -3.5, 23, 7, 3); ctx.fill(); ctx.stroke();
        const fl = 0.7 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(255,150,20,${fl})`;
        ctx.beginPath();
        ctx.moveTo(-11, -3.5); ctx.lineTo(-11 - 9 * fl, 0); ctx.lineTo(-11, 3.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,245,100,${fl * 0.75})`;
        ctx.beginPath();
        ctx.moveTo(-11, -2); ctx.lineTo(-11 - 5 * fl, 0); ctx.lineTo(-11, 2);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.shadowColor = '#99ccff';
        ctx.fillStyle = '#667799'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#999bbb';
        ctx.fillRect(-1.8, -10, 3.6, 8);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }

  _drawWorms(ctx, W, H) {
    [...this._teamA, ...this._teamB].forEach(w => this._drawOneWorm(ctx, w, W, H));
  }

  _drawOneWorm(ctx, w, W, H) {
    const PAL = {
      A: { fill:'#4a9eff', light:'#9ad4ff', dark:'#1a5abf', outline:'#0a2060' },
      B: { fill:'#ff4a4a', light:'#ff9a9a', dark:'#bf1a1a', outline:'#600a0a' },
    };
    const pal = PAL[w.team];
    const fr  = w.dir > 0;

    // Breathing offset
    const breathe = Math.sin(w.animT * 0.04) * 1.5;

    ctx.save();
    ctx.translate(w.x, w.y + breathe);
    if (w.hurtFlash > 0) ctx.globalAlpha = w.hurtFlash % 4 < 2 ? 1 : 0.25;
    ctx.scale(fr ? 1 : -1, 1);

    // Body segments
    this._oval(ctx, pal, 0,   2, 7,   5.5);
    this._oval(ctx, pal, 0,  -6, 9,   7.5);
    this._oval(ctx, pal, 0, -14, 10,  9.0);

    // Head
    this._head(ctx, pal, w.aimAngle, fr);

    // Hat
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
    if (w.team === 'A') {
      ctx.fillStyle = '#7a9a3a';
      ctx.beginPath(); ctx.ellipse(3, -37, 11, 5.5, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a7a1a';
      ctx.beginPath(); ctx.ellipse(3, -37, 13.5, 3.5, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#cc2222';
      ctx.beginPath(); ctx.ellipse(5, -36, 11, 6.5, 0.15, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#aa1111';
      ctx.beginPath(); ctx.arc(2, -38, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Weapon (bazooka)
    ctx.save();
    ctx.rotate(fr ? w.aimAngle : Math.PI - w.aimAngle);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2;
    ctx.fillStyle = '#4a5a3a';
    ctx.beginPath(); ctx.roundRect(6, -26, 28, 7, 3.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.arc(6, -22.5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.restore();

    // HP bar + name (world space)
    this._drawHpBar(ctx, w);
  }

  _oval(ctx, pal, dx, dy, rx, ry) {
    ctx.strokeStyle = pal.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(dx, dy, rx + 1.5, ry + 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(dx - rx * 0.35, dy - ry * 0.35, 0, dx, dy, Math.max(rx, ry));
    g.addColorStop(0, pal.light); g.addColorStop(0.45, pal.fill); g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }

  _head(ctx, pal, aimAngle, fr) {
    const hx = 3, hy = -25, rx = 12, ry = 11;
    ctx.strokeStyle = pal.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(hx, hy, rx + 1.5, ry + 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(hx - 4, hy - 3, 0, hx, hy, rx * 1.1);
    g.addColorStop(0, pal.light); g.addColorStop(0.4, pal.fill); g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();

    const cl = 1.5;
    const px = Math.max(-cl, Math.min(cl, Math.cos(aimAngle) * (fr ? 1 : -1) * 1.6));
    const py = Math.max(-cl, Math.min(cl, Math.sin(aimAngle) * 1.2));

    [{ x: 3, y: hy - 3, r: 4.2 }, { x: 9.5, y: hy - 3, r: 4.2 }].forEach(({ x: ex, y: ey, r: er }) => {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a1a38';
      ctx.beginPath(); ctx.arc(ex + px, ey + py, er * 0.56, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(ex + px - 1.3, ey + py - 1.3, 1.3, 0, Math.PI * 2); ctx.fill();
    });
  }

  _drawHpBar(ctx, w) {
    const bw = 44, bh = 5;
    const bx = w.x - bw / 2, by = w.y - 58;
    const r  = Math.max(0, w.hp / w.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(bx - 1, by - 1, bw + 2, bh + 2, 3); ctx.fill();
    ctx.fillStyle = r > 0.6 ? '#4aff88' : r > 0.3 ? '#ffb84a' : '#ff4a4a';
    if (r > 0) { ctx.beginPath(); ctx.roundRect(bx, by, bw * r, bh, 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 10px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(w.name, w.x, by - 4);
    ctx.textAlign = 'left';
  }

  _drawVignette(ctx, W, H) {
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.88);
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(0.55,'rgba(0,0,0,0.08)');
    vig.addColorStop(1,   'rgba(0,0,0,0.75)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Top dark band (heaviest darkness at very top)
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.12);
    top.addColorStop(0, 'rgba(0,0,0,0.55)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.12);

    // Bottom band
    const bot = ctx.createLinearGradient(0, H * 0.82, 0, H);
    bot.addColorStop(0, 'rgba(0,0,0,0)');
    bot.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = bot; ctx.fillRect(0, H * 0.82, W, H * 0.18);
  }
}
