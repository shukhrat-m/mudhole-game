export default class InputHandler {
  constructor(canvas, net, getMyWorm, getRenderer) {
    this._canvas      = canvas;
    this._net         = net;
    this._getMyWorm   = getMyWorm;
    this._getRenderer = getRenderer;
    this._keys        = new Set();
    this._aimAngle    = 0;
    this._mouseWorld  = { x: 0, y: 0 };
    this._myTurn      = false;
    this._moveInterval = null;
    this._moveDir     = null;
    this._aimInterval  = null;
    this._weapon      = 'grenade';
    this._mobileEl    = null;
    this._isTouch     = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this._onKey       = this._onKey.bind(this);
    this._onKeyUp     = this._onKeyUp.bind(this);
    this._onMouse     = this._onMouse.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd  = this._onTouchEnd.bind(this);

    canvas.style.touchAction = 'none';

    window.addEventListener('keydown',   this._onKey);
    window.addEventListener('keyup',     this._onKeyUp);
    canvas.addEventListener('mousemove', this._onMouse);
    canvas.addEventListener('click',     this._onClick);
    canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    canvas.addEventListener('touchend',  this._onTouchEnd,  { passive: false });

    this._buildMobileControls();
  }

  setTurn(isMyTurn) {
    this._myTurn = isMyTurn;
    if (!isMyTurn) { this._stopMove(); this._stopAim(); this._keys.clear(); }
    if (this._mobileEl) {
      this._mobileEl.style.display = (isMyTurn && this._isTouch) ? 'flex' : 'none';
    }
  }

  setWeapon(weapon) { this._weapon = weapon; }
  getAimAngle()     { return this._aimAngle; }
  getMouseWorld()   { return this._mouseWorld; }
  getWeapon()       { return this._weapon; }

  // Called every frame from Game._update(dt) — handles held ↑↓ aim keys
  tick(dt) {
    if (!this._myTurn) return;
    if (this._keys.has('ArrowUp'))   this._aimAngle -= 0.04 * dt;
    if (this._keys.has('ArrowDown')) this._aimAngle += 0.04 * dt;
  }

  destroy() {
    window.removeEventListener('keydown',   this._onKey);
    window.removeEventListener('keyup',     this._onKeyUp);
    this._canvas.removeEventListener('mousemove', this._onMouse);
    this._canvas.removeEventListener('click',     this._onClick);
    this._canvas.removeEventListener('touchmove', this._onTouchMove);
    this._canvas.removeEventListener('touchend',  this._onTouchEnd);
    this._stopMove();
    this._stopAim();
    if (this._mobileEl) { this._mobileEl.remove(); this._mobileEl = null; }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  _onKey(e) {
    if (!this._myTurn) return;
    this._keys.add(e.key);

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this._startMove('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._startMove('right');
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        // aim rotation handled in tick()
        break;
      case ' ':
        e.preventDefault();
        this._net.send({ type: 'jump' });
        break;
      case 'Enter':
        e.preventDefault();
        this._fire();
        break;
      case '1': this._selectWeapon('grenade');      break;
      case '2': this._selectWeapon('bazooka');      break;
      case '3': this._selectWeapon('machinegun');   break;
      case '4': this._selectWeapon('airstrike');    break;
      case '5': this._selectWeapon('holy_grenade'); break;
      case '6': this._selectWeapon('mine');         break;
      case 'Tab':
        e.preventDefault();
        this._net.send({ type: 'end_turn' });
        break;
    }
  }

  _onKeyUp(e) {
    this._keys.delete(e.key);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if      (e.key === 'ArrowLeft'  && this._keys.has('ArrowRight')) this._startMove('right');
      else if (e.key === 'ArrowRight' && this._keys.has('ArrowLeft'))  this._startMove('left');
      else this._stopMove();
    }
  }

  _startMove(dir) {
    this._moveDir = dir;
    this._net.send({ type: 'move', direction: dir });
    if (!this._moveInterval) {
      this._moveInterval = setInterval(() => {
        if (this._moveDir && this._myTurn) {
          this._net.send({ type: 'move', direction: this._moveDir });
        }
      }, 80);
    }
  }

  _stopMove() {
    this._moveDir = null;
    clearInterval(this._moveInterval);
    this._moveInterval = null;
  }

  _stopAim() {
    clearInterval(this._aimInterval);
    this._aimInterval = null;
  }

  // ── Mouse ─────────────────────────────────────────────────────────────────

  _onMouse(e) { this._updateAim(e.clientX, e.clientY); }

  _onClick(e) {
    if (!this._myTurn) return;
    this._fire();
  }

  // ── Touch ─────────────────────────────────────────────────────────────────

  _onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    if (t) this._updateAim(t.clientX, t.clientY);
  }

  _onTouchEnd(e) {
    e.preventDefault();
    if (!this._myTurn) return;
    const t = e.changedTouches[0];
    if (!t) return;
    this._updateAim(t.clientX, t.clientY);
    if (this._weapon === 'airstrike') {
      this._net.send({ type: 'airstrike', x: Math.round(this._mouseWorld.x) });
    }
  }

  // ── Shared aim & fire ─────────────────────────────────────────────────────

  _updateAim(clientX, clientY) {
    const renderer = this._getRenderer();
    if (!renderer) return;
    const rect = this._canvas.getBoundingClientRect();
    this._mouseWorld = renderer.screenToWorld(clientX - rect.left, clientY - rect.top);
    const worm = this._getMyWorm();
    if (worm) {
      this._aimAngle = Math.atan2(
        this._mouseWorld.y - (worm.y - 20),
        this._mouseWorld.x - worm.x
      );
    }
  }

  _fire() {
    const worm = this._getMyWorm();
    if (!worm || !worm.alive) return;
    if (this._weapon === 'airstrike') {
      this._net.send({ type: 'airstrike', x: Math.round(this._mouseWorld.x) });
      return;
    }
    if (this._weapon === 'mine') {
      this._net.send({ type: 'place_mine' });
      return;
    }
    this._net.send({ type: 'fire', weapon: this._weapon, angle: this._aimAngleDeg(), power: 0.85 });
  }

  _aimAngleDeg() { return Math.round(this._aimAngle * 180 / Math.PI); }

  _selectWeapon(w) {
    this._weapon = w;
    window.dispatchEvent(new CustomEvent('weapon_changed', { detail: w }));
  }

  // ── Mobile virtual buttons ────────────────────────────────────────────────

  _buildMobileControls() {
    const el = document.createElement('div');
    el.id = 'mc-root';
    Object.assign(el.style, {
      position: 'fixed', bottom: '90px', left: '0', right: '0',
      display: 'none', justifyContent: 'space-between', alignItems: 'flex-end',
      padding: '0 12px', pointerEvents: 'none', zIndex: '20',
    });
    el.innerHTML = `
      <div class="mc-group">
        <button id="mc-left"  class="mc-btn">◀</button>
        <button id="mc-jump"  class="mc-btn mc-jump-btn">▲</button>
        <button id="mc-right" class="mc-btn">▶</button>
      </div>
      <div class="mc-group">
        <div style="display:flex;flex-direction:column;gap:6px">
          <button id="mc-aim-up"   class="mc-btn mc-aim-btn">↑</button>
          <button id="mc-aim-down" class="mc-btn mc-aim-btn">↓</button>
        </div>
        <button id="mc-fire" class="mc-btn mc-fire-btn">FIRE</button>
        <button id="mc-end"  class="mc-btn mc-end-btn">END</button>
      </div>
    `;
    document.body.appendChild(el);
    this._mobileEl = el;

    this._holdBtn('mc-left',  () => this._startMove('left'),  () => this._stopMove());
    this._holdBtn('mc-right', () => this._startMove('right'), () => this._stopMove());
    this._tapBtn ('mc-jump',  () => this._net.send({ type: 'jump' }));
    this._tapBtn ('mc-fire',  () => this._fire());
    this._tapBtn ('mc-end',   () => this._net.send({ type: 'end_turn' }));
    this._holdAimBtn('mc-aim-up',   -0.05);
    this._holdAimBtn('mc-aim-down',  0.05);
  }

  _holdBtn(id, onStart, onEnd) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart',  (e) => { e.preventDefault(); if (this._myTurn) onStart(); }, { passive: false });
    btn.addEventListener('touchend',    (e) => { e.preventDefault(); onEnd(); }, { passive: false });
    btn.addEventListener('touchcancel', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
  }

  _tapBtn(id, fn) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); if (this._myTurn) fn(); }, { passive: false });
  }

  _holdAimBtn(id, delta) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const start = (e) => {
      e.preventDefault();
      if (!this._myTurn) return;
      this._stopAim();
      this._aimInterval = setInterval(() => { this._aimAngle += delta; }, 30);
    };
    const stop = (e) => { e.preventDefault(); this._stopAim(); };
    btn.addEventListener('touchstart',  start, { passive: false });
    btn.addEventListener('touchend',    stop,  { passive: false });
    btn.addEventListener('touchcancel', stop,  { passive: false });
  }
}
