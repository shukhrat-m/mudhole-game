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
    this._ui          = null;
    this._minimap     = null;

    this._projList = [];
  }

  async init(ui) {
    ui.innerHTML = '';
    const hudEl = document.getElementById('hud');
    hudEl.style.display = 'block';

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

    net.on('state',          msg => this._onState(msg));
    net.on('turn_start',     msg => this._onTurnStart(msg));
    net.on('turn_end',       ()  => this._onTurnEnd());
    net.on('timer',          msg => { this._timeLeft = msg.timeLeft; });
    net.on('projectile',     msg => this._onProjectile(msg));
    net.on('explosion',      msg => this._onExplosion(msg));
    net.on('terrain_update', msg => this._onTerrainUpdate(msg));
    net.on('worm_died',      msg => this._onWormDied(msg));
    net.on('mine_placed',    msg => this._onMinePlaced(msg));
    net.on('game_over',      msg => { setTimeout(() => showScreen('gameOver', msg), 1000); });
    net.on('disconnect',     ()  => showScreen('mainMenu'));

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

    ['state','turn_start','turn_end','timer','projectile','explosion',
     'terrain_update','worm_died','mine_placed','game_over','disconnect']
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

    // Client-side projectile simulation for smooth rendering + trail building
    this._projList.forEach(p => {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 14) p.trail.shift();
      p.vy += p.gravity * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
    });

    Object.values(this._worms).forEach(w => {
      if (w.hurtFlash > 0) w.hurtFlash--;
    });

    // Camera
    const targetWorm = this._worms[this._currentId || this._myId];
    if (targetWorm) {
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

    // Particles
    r.clearFx();
    fxCtx.save();
    r.applyCamera(fxCtx);
    this._particles.render(fxCtx);
    fxCtx.restore();

    // HUD update
    const wormsArr = Object.values(this._worms);
    if (wormsArr.length) {
      const myAmmo = (this._worms[this._myId] || {}).ammo;
      this._ui.update({
        worms: wormsArr,
        currentPlayerId: this._currentId,
        myId: this._myId,
        timeLeft: this._timeLeft,
        myTurn: this._myTurn,
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
    // Trail
    if (p.trail && p.trail.length > 1) {
      ctx.save();
      const trailColor = this._trailColor(p.type);
      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.55;
        const width = (i / p.trail.length) * (p.type === 'bullet' ? 2 : 4);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = trailColor;
        ctx.lineWidth   = width;
        ctx.lineCap     = 'round';
        ctx.shadowColor = trailColor;
        ctx.shadowBlur  = 6;
        ctx.beginPath();
        ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y);
        ctx.lineTo(p.trail[i].x,   p.trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);

    ctx.shadowBlur = 8;

    switch (p.type) {
      case 'grenade': {
        ctx.shadowColor = '#aaa';
        ctx.fillStyle = '#666';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#999';
        ctx.fillRect(-1.5, -10, 3, 8);
        break;
      }
      case 'holy_grenade': {
        ctx.shadowColor = '#ffd700';
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = 'rgba(180,130,0,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Glow ring
        ctx.globalAlpha = 0.35;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#fff6a0';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'bazooka': {
        ctx.shadowColor = '#ff6600';
        // Rocket body
        ctx.fillStyle = '#8aaa6a';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(-14, -4, 28, 8, 3);
        ctx.fill(); ctx.stroke();
        // Tip
        ctx.fillStyle = '#cc5500';
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(22, -3); ctx.lineTo(22, 3); ctx.closePath();
        ctx.fill();
        // Exhaust flame
        const flicker = 0.7 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(255,140,0,${flicker})`;
        ctx.beginPath();
        ctx.moveTo(-14, -4); ctx.lineTo(-14 - 10 * flicker, 0); ctx.lineTo(-14, 4);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,240,80,${flicker * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(-14, -2); ctx.lineTo(-14 - 6 * flicker, 0); ctx.lineTo(-14, 2);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'bullet': {
        ctx.shadowColor = '#ffdd00';
        ctx.fillStyle = '#ffcc00';
        ctx.strokeStyle = '#cc8800';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(-5, -2, 10, 4, 2);
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'airstrike_bomb': {
        ctx.shadowColor = '#ff6600';
        ctx.fillStyle = '#444';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Fins
        ctx.fillStyle = '#666';
        ctx.fillRect(-7, 6, 14, 4);
        // Nose shine
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.ellipse(-1, -7, 2, 4, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'mine': {
        ctx.shadowColor = '#ff4444';
        ctx.fillStyle = '#555';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(-10, -7, 20, 14, 3);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ee3333';
        ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill();
        // LED blink
        const blink = Math.floor(Date.now() / 400) % 2 === 0;
        if (blink) {
          ctx.fillStyle = '#ff8888';
          ctx.beginPath(); ctx.arc(0, -2, 2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _trailColor(type) {
    switch (type) {
      case 'bullet':        return '#ffdd40';
      case 'bazooka':       return '#ff8040';
      case 'holy_grenade':  return '#ffd700';
      case 'airstrike_bomb':return '#ff6020';
      case 'grenade':       return '#88ccff';
      default:              return '#aaaaaa';
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
    this._currentId = msg.playerId;
    this._timeLeft  = msg.timeLeft;
    this._myTurn    = msg.playerId === this._myId;
    if (msg.scores) this._scores = msg.scores;
    if (this._input) this._input.setTurn(this._myTurn);
    this._projList = [];

    if (this._myTurn && this._worms[this._myId]) {
      this._worms[this._myId].weapon = 'grenade';
      this._ui.setWeapon('grenade');
      if (this._input) this._input.setWeapon('grenade');
    }

    const worm = this._worms[msg.playerId];
    if (worm && this._renderer) this._renderer.snapTo(worm.x, worm.y);
  }

  _onTurnEnd() {
    this._myTurn = false;
    if (this._input) this._input.setTurn(false);
  }

  _onProjectile(msg) {
    this._projList.push({ ...msg, gravity: msg.type === 'bullet' ? 0.1 : 0.4, trail: [] });
    this._sound.playShot(msg.weapon || msg.type, msg.x);
  }

  _onExplosion(msg) {
    this._particles.spawnExplosion(msg.x, msg.y, msg.radius);
    this._renderer.triggerShake(msg.radius / 8);
    this._sound.playExplosion(msg.x);

    this._projList = this._projList.filter(p =>
      Math.hypot(p.x - msg.x, p.y - msg.y) > 20
    );

    (msg.damages || []).forEach(d => {
      if (this._worms[d.id]) {
        this._worms[d.id].hp = d.hp;
        this._worms[d.id].hurtFlash = 15;
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

  _onMinePlaced(msg) {
    this._projList.push({ ...msg, type: 'mine', vx: 0, vy: 0, gravity: 0, trail: [] });
  }
}
