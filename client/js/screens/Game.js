import { showScreen, net } from '../main.js';
import Renderer     from '../game/Renderer.js';
import WormRenderer from '../game/WormRenderer.js';
import InputHandler from '../game/InputHandler.js';
import Particles    from '../utils/Particles.js';
import SoundManager from '../utils/SoundManager.js';
import UI           from '../game/UI.js';

const W = 1920, H = 800;
const WEAPONS_LIST = ['grenade','bazooka','machinegun','airstrike','holy_grenade','mine'];

export default class GameScreen {
  constructor(data) {
    this._map = data.map || 'grassland';
    this._worms = {};        // id → worm
    this._projectiles = {};  // id → projectile
    this._myId       = net.playerId;
    this._currentId  = null;
    this._myTurn     = false;
    this._timeLeft   = 30;
    this._raf        = null;
    this._dt         = 0;
    this._lastTime   = 0;

    this._renderer    = null;
    this._wormRender  = null;
    this._input       = null;
    this._particles   = null;
    this._sound       = null;
    this._ui          = null;

    // Projectiles (client-side simulation for rendering)
    this._projList = [];
  }

  async init(ui) {
    // Hide UI overlay (using HUD instead)
    ui.innerHTML = '';
    const hudEl = document.getElementById('hud');
    hudEl.style.display = 'block';

    // Systems
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

    // Load terrain
    const rle = window._mudhole_terrain;
    if (rle) this._renderer.loadTerrain(rle, this._map, W, H);

    // Load initial game state
    const startData = window._mudhole_gameStart;
    if (startData) {
      (startData.worms || []).forEach(w => { this._worms[w.id] = { ...w, hurtFlash: 0, anim: 'idle' }; });
    }

    // Input
    this._input = new InputHandler(
      document.getElementById('canvas-ui-game'),
      net,
      () => this._worms[this._myId],
      () => this._renderer
    );
    document.getElementById('canvas-ui-game').style.pointerEvents = 'auto';

    // turn_start arrives before Game.js registers its handler (Loading.js has a 300ms delay).
    // Seed the first turn from the data already embedded in game_start.
    if (startData && startData.currentPlayerId) {
      this._currentId = startData.currentPlayerId;
      this._timeLeft  = startData.timeLeft || 30;
      this._myTurn    = this._currentId === this._myId;
      this._input.setTurn(this._myTurn);
    }

    // Weapon change
    window.addEventListener('weapon_changed', this._onWeaponChanged = (e) => {
      this._ui.setWeapon(e.detail);
    });

    // Network
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
    if (this._input) this._input.destroy();
    if (this._ui)    this._ui.destroy();

    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.style.display = 'none';
    document.getElementById('canvas-ui-game').style.pointerEvents = 'none';

    window.removeEventListener('weapon_changed', this._onWeaponChanged);

    ['state','turn_start','turn_end','timer','projectile','explosion',
     'terrain_update','worm_died','mine_placed','game_over','disconnect']
      .forEach(t => net.off(t));

    // Clear canvas
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

    // Клиентская симуляция снарядов для плавного рендера
    this._projList.forEach(p => {
      p.vy += p.gravity * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
    });

    // Обновить анимации червей
    Object.values(this._worms).forEach(w => {
      if (w.hurtFlash > 0) w.hurtFlash--;
    });

    // Camera: следить за активным червём
    const targetWorm = this._worms[this._currentId || this._myId];
    if (targetWorm) {
      this._renderer.followTarget(targetWorm.x, targetWorm.y);
    }

    this._sound.setCameraX(this._renderer.camX);
  }

  _draw(dt) {
    const r   = this._renderer;
    const gCtx  = r.gameCtx;
    const fxCtx = r.fxCtx;
    const uiCtx = r.uiGameCtx;

    r.drawBackground(dt);
    r.drawTerrain();

    // Game layer: черви + снаряды
    r.clearGame();
    gCtx.save();
    r.applyCamera(gCtx);

    const myWorm = this._worms[this._myId];
    const aimAngle = this._input ? this._input.getAimAngle() : 0;

    Object.values(this._worms).forEach(w => {
      this._wormRender.draw(
        gCtx, w,
        w.id === this._myId && this._myTurn,
        w.id === this._myId ? aimAngle : undefined
      );
    });

    // Снаряды
    this._projList.forEach(p => this._drawProjectile(gCtx, p));

    // Мины
    Object.values(this._worms); // (mines drawn separately if needed)

    // Прицел
    if (this._myTurn && myWorm && myWorm.alive) {
      this._drawAimLine(gCtx, myWorm, aimAngle);
    }

    gCtx.restore();

    // Effects layer: частицы
    r.clearFx();
    fxCtx.save();
    r.applyCamera(fxCtx);
    this._particles.render(fxCtx);
    fxCtx.restore();

    // UI layer: апдейт HUD данных
    const wormsArr = Object.values(this._worms);
    if (wormsArr.length) {
      this._ui.update({
        worms: wormsArr,
        currentPlayerId: this._currentId,
        myId: this._myId,
        timeLeft: this._timeLeft,
        myTurn: this._myTurn,
      });
    }

    r.clearUiGame();
  }

  // ─── Aim line ────────────────────────────────────────────────────────────

  _drawAimLine(ctx, worm, angle) {
    const weapon = this._input ? this._input.getWeapon() : 'grenade';

    if (weapon === 'airstrike') {
      const mw = this._input.getMouseWorld();
      ctx.strokeStyle = 'rgba(255,100,100,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(mw.x, 0);
      ctx.lineTo(mw.x, H);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    if (weapon === 'machinegun') {
      // Конус разброса
      ctx.strokeStyle = 'rgba(255,200,50,0.4)';
      ctx.lineWidth = 1;
      const spread = 0.15;
      [angle - spread, angle + spread].forEach(a => {
        ctx.beginPath();
        ctx.moveTo(worm.x, worm.y - 20);
        ctx.lineTo(worm.x + Math.cos(a) * 120, worm.y - 20 + Math.sin(a) * 120);
        ctx.stroke();
      });
      return;
    }

    // Траектория (граната/базука)
    const power = 0.8;
    const spd = power * 18;
    let sx = worm.x, sy = worm.y - 20;
    let vx = Math.cos(angle) * spd, vy = Math.sin(angle) * spd;
    const grav = weapon === 'bazooka' ? 0.4 : 0.4;

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);

    for (let i = 0; i < 60; i++) {
      vy += grav;
      sx += vx;
      sy += vy;
      ctx.lineTo(sx, sy);
      if (sy > H || sx < 0 || sx > W) break;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ─── Projectile render ───────────────────────────────────────────────────

  _drawProjectile(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);

    switch (p.type) {
      case 'grenade':
      case 'holy_grenade': {
        ctx.fillStyle = p.type === 'holy_grenade' ? '#ffd700' : '#555';
        ctx.beginPath(); ctx.arc(0, 0, p.type === 'holy_grenade' ? 7 : 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillRect(-1, -10, 2, 8);
        break;
      }
      case 'bazooka': {
        ctx.fillStyle = '#aaa';
        ctx.fillRect(-12, -3, 24, 6);
        ctx.fillStyle = '#ff6600';
        ctx.beginPath(); ctx.arc(-14, 0, 6, 0, Math.PI*2); ctx.fill();
        break;
      }
      case 'bullet': {
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-4, -1.5, 8, 3);
        break;
      }
      case 'airstrike_bomb': {
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 10, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#888';
        ctx.fillRect(-3, 8, 6, 5);
        break;
      }
      case 'mine': {
        ctx.fillStyle = '#666';
        ctx.fillRect(-8, -5, 16, 10);
        ctx.fillStyle = '#f44';
        ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI*2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // ─── Сетевые события ────────────────────────────────────────────────────

  _onState(msg) {
    (msg.worms || []).forEach(w => {
      if (this._worms[w.id]) {
        const old = this._worms[w.id];
        if (w.hp < old.hp) { old.hurtFlash = 12; this._sound.playHurt(); }
        Object.assign(old, w);
      }
    });
  }

  _onTurnStart(msg) {
    this._currentId = msg.playerId;
    this._timeLeft  = msg.timeLeft;
    this._myTurn    = msg.playerId === this._myId;
    if (this._input) this._input.setTurn(this._myTurn);
    this._projList = [];

    // Snap camera to the newly active worm so the pan is instant
    const worm = this._worms[msg.playerId];
    if (worm && this._renderer) this._renderer.snapTo(worm.x, worm.y);
  }

  _onTurnEnd() {
    this._myTurn = false;
    if (this._input) this._input.setTurn(false);
  }

  _onProjectile(msg) {
    this._projList.push({ ...msg, gravity: msg.type === 'bullet' ? 0.1 : 0.4 });
    this._sound.playShot(msg.weapon || msg.type, msg.x);
  }

  _onExplosion(msg) {
    this._particles.spawnExplosion(msg.x, msg.y, msg.radius);
    this._renderer.triggerShake(msg.radius / 8);
    this._sound.playExplosion(msg.x, msg.y);

    // Убрать снаряды в зоне взрыва
    this._projList = this._projList.filter(p => {
      return Math.hypot(p.x - msg.x, p.y - msg.y) > 20;
    });

    // Обновить HP червей
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
  }

  _onWormDied(msg) {
    const w = this._worms[msg.id];
    if (w) {
      this._particles.spawnWormDeath(w.x, w.y, w.team === 'A' ? '#4a9eff' : '#ff4a4a');
      w.alive = false;
      w.hp    = 0;
      this._sound.playDeath();
    }
    if (msg.id === this._myId) {
      this._ui.showDead();
    }
  }

  _onMinePlaced(msg) {
    this._projList.push({ ...msg, type: 'mine', vx: 0, vy: 0, gravity: 0 });
  }
}
