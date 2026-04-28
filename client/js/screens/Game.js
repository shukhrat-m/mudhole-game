import { showScreen, net } from '../main.js';
import Renderer     from '../game/Renderer.js';
import WormRenderer from '../game/WormRenderer.js';
import InputHandler from '../game/InputHandler.js';
import Particles    from '../utils/Particles.js';
import SoundManager from '../utils/SoundManager.js';
import UI           from '../game/UI.js';
import Minimap      from '../game/Minimap.js';

const W = 3840, H = 800;
const WEAPONS_LIST = ['grenade','bazooka','machinegun','airstrike','holy_grenade','mine'];

export default class GameScreen {
  constructor(data) {
    this._map = data.map || 'grassland';
    this._worms = {};
    this._myId       = net.playerId;
    this._currentId  = null;
    this._myTurn     = false;
    this._timeLeft   = 30;
    this._scores     = { A: 0, B: 0 };
    this._raf        = null;
    this._dt         = 0;
    this._lastTime   = 0;

    this._renderer    = null;
    this._wormRender  = null;
    this._input       = null;
    this._particles   = null;
    this._sound       = null;
    this._ui             = null;
    this._minimap        = null;
    this._toastContainer = null;
    this._isRetreating   = false;
    this._wind           = 0;
    this._nextId         = null;
    this._floatTexts     = [];

    this._projList = [];
  }

  async init(ui) {
    ui.innerHTML = '';
    const hudEl = document.getElementById('hud');
    hudEl.style.display = 'block';

    this._toastContainer = document.createElement('div');
    this._toastContainer.id = 'game-toasts';
    document.body.appendChild(this._toastContainer);

    this._renderer   = new Renderer();
    this._wormRender = new WormRenderer();
    this._particles  = new Particles();
    this._sound      = new SoundManager();
    await this._sound.init().catch(() => {});

    this._ui = new UI(hudEl);
    this._ui.setOnWeaponSelect(w => {
      if (this._input) this._input.setWeapon(w);
    });
    this._ui.setOnLeave(() => {
      net.disconnect();
      showScreen('mainMenu');
    });

    const rle = window._mudhole_terrain;
    if (rle) this._renderer.loadTerrain(rle, this._map, W, H);

    this._minimap = new Minimap();
    if (this._renderer.mask) this._minimap.setTerrain(this._renderer.mask);

    const startData = window._mudhole_gameStart;
    if (startData) {
      (startData.worms || []).forEach(w => {
        this._worms[w.id] = { ...w, hurtFlash: 0, anim: 'idle' };
      });
      if (startData.scores) this._scores = startData.scores;
    }

    this._input = new InputHandler(
      document.getElementById('canvas-ui-game'),
      net,
      () => this._worms[this._myId],
      () => this._renderer
    );
    document.getElementById('canvas-ui-game').style.pointerEvents = 'auto';

    if (startData && startData.currentPlayerId) {
      this._currentId = startData.currentPlayerId;
      this._timeLeft  = startData.timeLeft || 30;
      this._myTurn    = this._currentId === this._myId;
      this._input.setTurn(this._myTurn);
      if (this._myTurn && this._worms[this._myId]) {
        this._worms[this._myId].weapon = 'grenade';
      }
    }

    window.addEventListener('weapon_changed', this._onWeaponChanged = (e) => {
      this._ui.setWeapon(e.detail);
      // Keep local worm weapon in sync so renderer shows correct weapon in hand
      if (this._worms[this._myId]) this._worms[this._myId].weapon = e.detail;
    });

    net.on('state',             msg => this._onState(msg));
    net.on('turn_start',        msg => this._onTurnStart(msg));
    net.on('turn_end',          ()  => this._onTurnEnd());
    net.on('timer',             msg => { this._timeLeft = msg.timeLeft; });
    net.on('projectile',        msg => this._onProjectile(msg));
    net.on('projectile_bounce', msg => this._onProjectileBounce(msg));
    net.on('explosion',         msg => this._onExplosion(msg));
    net.on('terrain_update',    msg => this._onTerrainUpdate(msg));
    net.on('worm_died',         msg => this._onWormDied(msg));
    net.on('mine_placed',       msg => this._onMinePlaced(msg));
    net.on('retreat',           msg => this._onRetreat(msg));
    net.on('player_left',       msg => this._onPlayerLeft(msg));
    net.on('game_over',         msg => { setTimeout(() => showScreen('gameOver', msg), 1000); });
    net.on('disconnect',        ()  => showScreen('mainMenu'));

    this._loop(0);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._input)   this._input.destroy();
    if (this._ui)      this._ui.destroy();
    if (this._minimap) this._minimap.destroy();

    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.style.display = 'none';
    document.getElementById('canvas-ui-game').style.pointerEvents = 'none';

    window.removeEventListener('weapon_changed', this._onWeaponChanged);

    if (this._toastContainer) { this._toastContainer.remove(); this._toastContainer = null; }

    ['state','turn_start','turn_end','timer','projectile','projectile_bounce',
     'explosion','terrain_update','worm_died','mine_placed','retreat','player_left','game_over','disconnect']
      .forEach(t => net.off(t));

    ['canvas-bg','canvas-terrain','canvas-game','canvas-effects','canvas-ui-game'].forEach(id => {
      const c = document.getElementById(id);
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    });
  }

  // ─── Game loop ────────────────────────────────────────────────────────────

  _loop(ts) {
    this._raf = requestAnimationFrame(t => this._loop(t));
    const dt = Math.min((ts - this._lastTime) / 16.67, 3);
    this._lastTime = ts;
    this._update(dt);
    this._draw(dt);
  }

  _update(dt) {
    if (this._input) this._input.tick(dt);
    this._wormRender.tick();
    this._particles.update();

    this._floatTexts.forEach(t => { t.y -= 1.5 * dt; t.alpha -= 0.012 * dt; });
    this._floatTexts = this._floatTexts.filter(t => t.alpha > 0);

    // Normalize physics step to server tick rate (50 Hz = 20ms/tick).
    const PHYS_STEP = dt * (16.67 / 20); // ≈ 0.8335 at 60fps

    this._projList.forEach(p => {
      if (p.type === 'mine') return;
      const maxTrail = p.type === 'bullet' ? 20 : 60;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > maxTrail) p.trail.shift();
      if (p.type === 'grenade' || p.type === 'holy_grenade') {
        p._spin = ((p._spin || 0) + 4 * PHYS_STEP);
      }
      if (p.type !== 'bullet') p.vx += this._wind * 0.01 * PHYS_STEP;
      p.vy += p.gravity * PHYS_STEP;
      p.x  += p.vx * PHYS_STEP;
      p.y  += p.vy * PHYS_STEP;
      // Smoke puff every 3 frames for non-bullet projectiles
      if (p.type !== 'bullet') {
        p._smokeFrame = ((p._smokeFrame || 0) + 1);
        if (p._smokeFrame % 3 === 0) {
          const sc = p.type === 'bazooka'        ? 'rgba(110,80,40,0.6)'
                   : p.type === 'holy_grenade'   ? 'rgba(255,215,50,0.4)'
                   : p.type === 'airstrike_bomb' ? 'rgba(65,65,65,0.55)'
                   :                               'rgba(90,105,70,0.5)';
          this._particles.spawnProjectileSmoke(p.x, p.y, sc);
        }
      }
    });

    Object.values(this._worms).forEach(w => {
      if (w.hurtFlash > 0) w.hurtFlash--;
    });

    // Camera: follow flying projectile so all players see it in flight.
    // Fall back to airstrike cursor or active worm when no projectile is airborne.
    const flyingProj = this._projList.find(p => p.type !== 'mine');
    const targetWorm = this._worms[this._currentId || this._myId];
    if (flyingProj) {
      this._renderer.followTarget(flyingProj.x, flyingProj.y, 0.14);
    } else if (targetWorm) {
      if (this._myTurn && this._input && this._input.getWeapon() === 'airstrike') {
        this._renderer.followTarget(this._input.getAirstrikeX(), targetWorm.y);
      } else {
        this._renderer.followTarget(targetWorm.x, targetWorm.y);
      }
    }

    this._sound.setCameraX(this._renderer.camX);
  }

  _draw(dt) {
    const r     = this._renderer;
    const gCtx  = r.gameCtx;
    const fxCtx = r.fxCtx;

    r.drawBackground(dt);
    r.drawTerrain();

    r.clearGame();
    gCtx.save();
    r.applyCamera(gCtx);

    const myWorm   = this._worms[this._myId];
    const aimAngle = this._input ? this._input.getAimAngle() : 0;

    Object.values(this._worms).forEach(w => {
      this._wormRender.draw(
        gCtx, w,
        w.id === this._myId && this._myTurn,
        w.id === this._myId ? aimAngle : undefined
      );
    });

    // Projectiles with trails
    this._projList.forEach(p => this._drawProjectile(gCtx, p));

    // Aim indicator
    if (this._myTurn && myWorm && myWorm.alive) {
      this._drawAimLine(gCtx, myWorm, aimAngle);
    }

    gCtx.restore();

    // Particles + floating damage numbers
    r.clearFx();
    fxCtx.save();
    r.applyCamera(fxCtx);
    this._particles.render(fxCtx);
    this._floatTexts.forEach(t => {
      const a = Math.max(0, t.alpha);
      fxCtx.globalAlpha = a;
      fxCtx.font = `bold ${t.size}px "Segoe UI"`;
      fxCtx.textAlign = 'center';
      fxCtx.lineWidth = 4;
      fxCtx.strokeStyle = 'rgba(0,0,0,0.85)';
      fxCtx.strokeText(t.text, t.x, t.y);
      fxCtx.fillStyle = t.color;
      fxCtx.fillText(t.text, t.x, t.y);
    });
    fxCtx.globalAlpha = 1;
    fxCtx.textAlign = 'left';
    fxCtx.restore();

    // HUD update
    const wormsArr = Object.values(this._worms);
    if (wormsArr.length) {
      const myAmmo = (this._worms[this._myId] || {}).ammo;
      this._ui.update({
        worms: wormsArr,
        currentPlayerId: this._currentId,
        nextPlayerId: this._nextId,
        myId: this._myId,
        timeLeft: this._timeLeft,
        myTurn: this._myTurn,
        retreating: this._isRetreating,
        wind: this._wind,
        scores: this._scores,
        myAmmo,
      });
    }

    if (this._minimap) {
      this._minimap.render(this._renderer, this._worms, this._currentId);
    }

    r.clearUiGame();
  }

  // ─── Aim indicators ──────────────────────────────────────────────────────

  _drawAimLine(ctx, worm, angle) {
    const weapon = this._input ? this._input.getWeapon() : 'grenade';

    if (weapon === 'airstrike') {
      const ax = this._input.getAirstrikeX();
      const sy = this._renderer.getTerrainSurfaceY(ax);

      // Drop column — glow
      ctx.save();
      ctx.strokeStyle = 'rgba(255,70,70,0.25)';
      ctx.lineWidth = 14;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, sy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,70,70,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, sy); ctx.stroke();
      ctx.setLineDash([]);

      // Crosshair
      const r = 26;
      ctx.strokeStyle = '#ff4040';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(ax, sy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - r - 12, sy); ctx.lineTo(ax + r + 12, sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, sy - r - 12); ctx.lineTo(ax, sy + r + 12); ctx.stroke();

      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.shadowBlur = 6;
      ctx.font = 'bold 13px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText('✈ AIRSTRIKE', ax, sy - r - 18);
      ctx.textAlign = 'left';
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    if (weapon === 'mine') {
      const t   = Date.now() * 0.003;
      const r   = 14 + Math.sin(t) * 5;
      ctx.save();
      ctx.shadowColor = '#ffb800'; ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(255,180,0,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(worm.x, worm.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,180,0,0.15)';
      ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 12px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText('MINE', worm.x, worm.y - r - 8);
      ctx.textAlign = 'left';
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    if (weapon === 'machinegun') {
      const spread = 0.14, len = 180;
      const ox = worm.x, oy = worm.y - 20;
      ctx.save();
      // Cone fill
      ctx.fillStyle = 'rgba(255,220,60,0.07)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(angle - spread) * len, oy + Math.sin(angle - spread) * len);
      ctx.lineTo(ox + Math.cos(angle + spread) * len, oy + Math.sin(angle + spread) * len);
      ctx.closePath(); ctx.fill();
      // Outer edges
      ctx.strokeStyle = 'rgba(255,210,50,0.45)';
      ctx.lineWidth = 1.5;
      [angle - spread, angle + spread].forEach(a => {
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
        ctx.stroke();
      });
      // Center glow line
      ctx.shadowColor = '#ffdb4a'; ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(255,235,90,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(angle) * len, oy + Math.sin(angle) * len);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    // ─── Trajectory arc: grenade / bazooka / holy_grenade ─────────────────
    const spd = 0.85 * 18;
    let px = worm.x, py = worm.y - 20;
    let vx = Math.cos(angle) * spd, vy = Math.sin(angle) * spd;

    const pts = [];
    for (let i = 0; i < 100; i++) {
      vy += 0.38;
      px += vx; py += vy;
      pts.push({ x: px, y: py });
      if (py > H || px < 0 || px > W) break;
    }

    ctx.save();
    // Glow pass
    ctx.shadowColor = weapon === 'holy_grenade' ? '#ffe040' : '#60c8ff';
    ctx.shadowBlur  = 10;

    // Draw dots along trajectory (not dashes — looks much cleaner)
    const dotColor = weapon === 'holy_grenade' ? 'rgba(255,215,0,' : 'rgba(120,200,255,';
    for (let i = 0; i < pts.length; i++) {
      const alpha = (1 - i / pts.length) * 0.7;
      const r     = i % 4 === 0 ? 2.5 : (i % 2 === 0 ? 1.5 : 0);
      if (r === 0) continue;
      ctx.fillStyle = dotColor + alpha + ')';
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Landing zone ring
    const last = pts[pts.length - 1];
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = weapon === 'holy_grenade' ? 'rgba(255,220,0,0.9)' : 'rgba(100,200,255,0.85)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(last.x, last.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(last.x - 14, last.y); ctx.lineTo(last.x + 14, last.y);
    ctx.moveTo(last.x, last.y - 14); ctx.lineTo(last.x, last.y + 14);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ─── Projectile render ───────────────────────────────────────────────────

  _drawProjectile(ctx, p) {
    if (p.type === 'mine') { this._drawMine(ctx, p); return; }

    // ── Trail ────────────────────────────────────────────────────────────
    if (p.trail && p.trail.length > 1) {
      ctx.save();
      const col = this._trailColor(p.type);
      const isBullet = p.type === 'bullet';
      const len = p.trail.length;

      // Outer glow pass
      for (let i = 1; i < len; i++) {
        const t = i / len;
        ctx.globalAlpha  = t * (isBullet ? 0.50 : 0.45);
        ctx.strokeStyle  = col;
        ctx.lineWidth    = t * (isBullet ? 8 : 20);
        ctx.lineCap      = 'round';
        ctx.shadowColor  = col;
        ctx.shadowBlur   = 14;
        ctx.beginPath();
        ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y);
        ctx.lineTo(p.trail[i].x,   p.trail[i].y);
        ctx.stroke();
      }
      // Inner bright core pass
      for (let i = 1; i < len; i++) {
        const t = i / len;
        ctx.globalAlpha  = t;
        ctx.strokeStyle  = col;
        ctx.lineWidth    = t * (isBullet ? 3 : 9);
        ctx.lineCap      = 'round';
        ctx.shadowBlur   = 0;
        ctx.beginPath();
        ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y);
        ctx.lineTo(p.trail[i].x,   p.trail[i].y);
        ctx.stroke();
      }
      // White hot core — newest 40% of trail
      const hotStart = Math.max(1, Math.floor(len * 0.6));
      for (let i = hotStart; i < len; i++) {
        const t = (i / len - 0.6) / 0.4;
        ctx.globalAlpha  = Math.max(0, t) * 0.55;
        ctx.strokeStyle  = '#ffffff';
        ctx.lineWidth    = Math.max(0.5, t * (isBullet ? 1.5 : 3.5));
        ctx.beginPath();
        ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y);
        ctx.lineTo(p.trail[i].x,   p.trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();
    }

    // ── Body ─────────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(p.x, p.y);
    const flightAngle = Math.atan2(p.vy, p.vx);

    switch (p.type) {

      case 'grenade': {
        ctx.rotate(p._spin || 0);
        ctx.shadowColor = '#88ccff'; ctx.shadowBlur = 32;
        const gBody = ctx.createRadialGradient(-3, -3, 0, 0, 0, 14);
        gBody.addColorStop(0, '#c0d8a0');
        gBody.addColorStop(0.5, '#6a8050');
        gBody.addColorStop(1, '#384520');
        ctx.fillStyle = gBody;
        ctx.strokeStyle = '#202c12'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.stroke();
        ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -22); ctx.stroke();
        ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 18;
        ctx.fillStyle = `rgba(255,${120 + Math.random()*100|0},0,${0.85 + Math.random()*0.15})`;
        ctx.beginPath(); ctx.arc(0, -22, 3.5, 0, Math.PI * 2); ctx.fill();
        break;
      }

      case 'holy_grenade': {
        ctx.rotate(p._spin || 0);
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 42;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.006);
        ctx.globalAlpha = 0.3 * pulse;
        ctx.fillStyle = '#fff8a0';
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        const hBody = ctx.createRadialGradient(-4, -4, 0, 0, 0, 16);
        hBody.addColorStop(0, '#fff8c0');
        hBody.addColorStop(0.5, '#ffd700');
        hBody.addColorStop(1, '#b8860b');
        ctx.fillStyle = hBody;
        ctx.strokeStyle = '#8b6000'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
        break;
      }

      case 'bazooka': {
        ctx.rotate(flightAngle);
        ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 32;
        ctx.fillStyle = '#8aaa6a'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-22, -7, 42, 14, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#cc4400';
        ctx.beginPath(); ctx.moveTo(20,-7); ctx.lineTo(33,0); ctx.lineTo(20,7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-6, -7, 5, 14);
        const fl = 0.65 + Math.random() * 0.35;
        ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 22;
        ctx.fillStyle = `rgba(255,130,0,${fl})`;
        ctx.beginPath(); ctx.moveTo(-22,-7); ctx.lineTo(-22-18*fl,0); ctx.lineTo(-22,7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,240,80,${fl*0.85})`;
        ctx.beginPath(); ctx.moveTo(-22,-4); ctx.lineTo(-22-11*fl,0); ctx.lineTo(-22,4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,255,220,${fl*0.55})`;
        ctx.beginPath(); ctx.moveTo(-22,-2); ctx.lineTo(-22-5*fl,0); ctx.lineTo(-22,2); ctx.closePath(); ctx.fill();
        break;
      }

      case 'bullet': {
        ctx.rotate(flightAngle);
        ctx.shadowColor = '#ffee44'; ctx.shadowBlur = 22;
        const bGrad = ctx.createLinearGradient(-9, -3.5, 9, 3.5);
        bGrad.addColorStop(0, '#ffee88');
        bGrad.addColorStop(0.5, '#ffcc00');
        bGrad.addColorStop(1, '#cc8800');
        ctx.fillStyle = bGrad;
        ctx.strokeStyle = '#884400'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.roundRect(-9, -3.5, 18, 7, 3.5); ctx.fill(); ctx.stroke();
        break;
      }

      case 'airstrike_bomb': {
        ctx.rotate(Math.PI / 2);
        ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 28;
        ctx.fillStyle = '#3a3a3a'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#cc2200';
        ctx.beginPath(); ctx.ellipse(0, -20, 6, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(-11, -6, 22, 4);
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.moveTo(-11, 14); ctx.lineTo(-20, 26); ctx.lineTo(-11, 22); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo( 11, 14); ctx.lineTo( 20, 26); ctx.lineTo( 11, 22); ctx.closePath(); ctx.fill();
        ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 30;
        ctx.fillStyle = `rgba(255,100,0,${0.5 + Math.random()*0.4})`;
        ctx.beginPath(); ctx.arc(0, -24, 6, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawMine(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const blink = Math.floor(Date.now() / 400) % 2 === 0;
    ctx.shadowColor = blink ? '#ff4444' : '#882222';
    ctx.shadowBlur  = blink ? 16 : 6;
    // Body
    ctx.fillStyle = '#4a4a4a'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(-12, -8, 24, 16, 4); ctx.fill(); ctx.stroke();
    // Warning stripe
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-12, -2, 24, 4);
    ctx.fillStyle = '#333';
    for (let i = -10; i < 12; i += 6) {
      ctx.fillRect(i, -2, 3, 4);
    }
    // LED
    ctx.fillStyle = blink ? '#ff4444' : '#660000';
    ctx.beginPath(); ctx.arc(0, -3, 3.5, 0, Math.PI * 2); ctx.fill();
    if (blink) {
      ctx.fillStyle = '#ffaaaa';
      ctx.beginPath(); ctx.arc(0, -3, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _trailColor(type) {
    switch (type) {
      case 'bullet':         return '#ffee44';
      case 'bazooka':        return '#ff8830';
      case 'holy_grenade':   return '#ffe040';
      case 'airstrike_bomb': return '#ff5010';
      case 'grenade':        return '#90ddff';
      default:               return '#aabbcc';
    }
  }

  // ─── Network events ──────────────────────────────────────────────────────

  _onState(msg) {
    (msg.worms || []).forEach(w => {
      if (this._worms[w.id]) {
        const old = this._worms[w.id];
        if (w.hp < old.hp) { old.hurtFlash = 12; this._sound.playHurt(); }
        // Preserve local weapon selection so hand shows correct weapon
        const localWeapon = old.weapon;
        Object.assign(old, w);
        if (w.id === this._myId) old.weapon = localWeapon;
        // Sync ammo from server
        if (w.ammo) old.ammo = w.ammo;
      }
    });
  }

  _onTurnStart(msg) {
    this._currentId    = msg.playerId;
    this._timeLeft     = msg.timeLeft;
    this._myTurn       = msg.playerId === this._myId;
    this._isRetreating = false;
    this._wind         = msg.wind ?? 0;
    this._nextId       = msg.nextPlayerId || null;
    if (msg.scores) this._scores = msg.scores;
    if (this._input) this._input.setTurn(this._myTurn);
    this._projList = this._projList.filter(p => p.type === 'mine');

    if (this._myTurn && this._worms[this._myId]) {
      this._worms[this._myId].weapon = 'grenade';
      this._ui.setWeapon('grenade');
      if (this._input) this._input.setWeapon('grenade');
    }

    const worm = this._worms[msg.playerId];
    if (worm && this._renderer) this._renderer.snapTo(worm.x, worm.y);
  }

  _onTurnEnd() {
    this._myTurn       = false;
    this._isRetreating = false;
    if (this._input) this._input.setTurn(false);
  }

  _onProjectile(msg) {
    this._projList.push({ ...msg, gravity: msg.type === 'bullet' ? 0.1 : 0.4, trail: [] });
    this._sound.playShot(msg.weapon || msg.type, msg.x);
    if (this._renderer) this._renderer.snapTo(msg.x, msg.y);
  }

  _onProjectileBounce(msg) {
    const p = this._projList.find(p => p.id === msg.id);
    if (p) {
      p.x  = msg.x;  p.y  = msg.y;
      p.vx = msg.vx; p.vy = msg.vy;
    }
  }

  _onExplosion(msg) {
    this._particles.spawnExplosion(msg.x, msg.y, msg.radius);
    this._renderer.triggerShake(msg.radius / 8);
    this._sound.playExplosion(msg.x);

    this._projList = this._projList.filter(p =>
      Math.hypot(p.x - msg.x, p.y - msg.y) > 20
    );

    (msg.damages || []).forEach(d => {
      const w = this._worms[d.id];
      if (w) {
        w.hp = d.hp;
        w.hurtFlash = 15;
        const size = d.dmg >= 26 ? 26 : d.dmg >= 11 ? 20 : 16;
        this._floatTexts.push({ x: w.x, y: w.y - 30, text: `-${d.dmg}`, alpha: 1.0, size, color: '#ffdd44' });
      }
    });
  }

  _onTerrainUpdate(msg) {
    this._renderer.applyTerrainUpdate(msg);
    this._renderer.drawTerrain();
    if (this._minimap) this._minimap.markDirty();
  }

  _onWormDied(msg) {
    const w = this._worms[msg.id];
    if (w) {
      this._particles.spawnWormDeath(w.x, w.y, w.team === 'A' ? '#4a9eff' : '#ff4a4a');
      w.alive = false;
      w.hp    = 0;
      this._sound.playDeath();
    }
    if (msg.scores) this._scores = msg.scores;
    if (msg.id === this._myId) this._ui.showDead();
  }

  _onRetreat(msg) {
    this._timeLeft     = msg.timeLeft;
    this._isRetreating = true;
    if (this._input && this._myTurn) this._input.setRetreat(true);
  }

  _onMinePlaced(msg) {
    this._projList.push({ ...msg, type: 'mine', vx: 0, vy: 0, gravity: 0, trail: [] });
  }

  _onPlayerLeft(msg) {
    const color = msg.team === 'A' ? '#4a9eff' : '#ff4a4a';
    this._showToast(`${msg.name} disconnected`, color);
    const w = this._worms[msg.id];
    if (w) { w.alive = false; w.hp = 0; }
  }

  _showToast(text, color = '#fff') {
    if (!this._toastContainer) return;
    const el = document.createElement('div');
    el.className = 'game-toast';
    el.style.color = color;
    el.textContent = text;
    this._toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('game-toast-fade');
      setTimeout(() => el.remove(), 500);
    }, 2500);
  }
}
