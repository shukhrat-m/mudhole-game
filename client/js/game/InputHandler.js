export default class InputHandler {
  constructor(canvas, net, getMyWorm, getRenderer) {
    this._canvas     = canvas;
    this._net        = net;
    this._getMyWorm  = getMyWorm;
    this._getRenderer = getRenderer;
    this._keys       = new Set();
    this._aimAngle   = 0;
    this._mouseWorld = { x: 0, y: 0 };
    this._myTurn     = false;
    this._moveInterval = null;
    this._weapon     = 'grenade';

    this._onKey    = this._onKey.bind(this);
    this._onKeyUp  = this._onKeyUp.bind(this);
    this._onMouse  = this._onMouse.bind(this);
    this._onClick  = this._onClick.bind(this);

    window.addEventListener('keydown',   this._onKey);
    window.addEventListener('keyup',     this._onKeyUp);
    canvas.addEventListener('mousemove', this._onMouse);
    canvas.addEventListener('click',     this._onClick);
  }

  setTurn(isMyTurn) {
    this._myTurn = isMyTurn;
    if (!isMyTurn) {
      clearInterval(this._moveInterval);
      this._moveInterval = null;
    }
  }

  setWeapon(weapon) {
    this._weapon = weapon;
  }

  getAimAngle() { return this._aimAngle; }
  getMouseWorld() { return this._mouseWorld; }
  getWeapon() { return this._weapon; }

  destroy() {
    window.removeEventListener('keydown',   this._onKey);
    window.removeEventListener('keyup',     this._onKeyUp);
    this._canvas.removeEventListener('mousemove', this._onMouse);
    this._canvas.removeEventListener('click',     this._onClick);
    clearInterval(this._moveInterval);
  }

  _onKey(e) {
    if (!this._myTurn) return;
    this._keys.add(e.key);

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        if (!this._moveInterval) {
          const dir = e.key === 'ArrowLeft' ? 'left' : 'right';
          this._net.send({ type: 'move', direction: dir });
          this._moveInterval = setInterval(() => {
            if (this._keys.has('ArrowLeft'))  this._net.send({ type: 'move', direction: 'left' });
            if (this._keys.has('ArrowRight')) this._net.send({ type: 'move', direction: 'right' });
          }, 80);
        }
        break;

      case 'ArrowUp':
      case ' ':
        if (e.key === 'ArrowUp') this._net.send({ type: 'jump' });
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
      if (!this._keys.has('ArrowLeft') && !this._keys.has('ArrowRight')) {
        clearInterval(this._moveInterval);
        this._moveInterval = null;
      }
    }
  }

  _onMouse(e) {
    const renderer = this._getRenderer();
    if (!renderer) return;

    const rect = this._canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    this._mouseWorld = renderer.screenToWorld(sx, sy);

    // Обновить угол прицела
    const worm = this._getMyWorm();
    if (worm) {
      this._aimAngle = Math.atan2(
        this._mouseWorld.y - (worm.y - 20),
        this._mouseWorld.x - worm.x
      );
    }
  }

  _onClick(e) {
    if (!this._myTurn) return;
    const worm = this._getMyWorm();
    if (!worm) return;

    if (this._weapon === 'airstrike') {
      this._net.send({ type: 'airstrike', x: Math.round(this._mouseWorld.x) });
      return;
    }
    if (this._weapon === 'mine') {
      this._net.send({ type: 'place_mine' });
      return;
    }
    if (this._weapon === 'machinegun') {
      this._net.send({ type: 'fire', weapon: 'machinegun', angle: this._aimAngleDeg(), power: 1 });
      return;
    }

    const power = 0.75 + Math.random() * 0.25; // TODO: зажатие кнопки для силы
    this._net.send({
      type: 'fire',
      weapon: this._weapon,
      angle: this._aimAngleDeg(),
      power,
    });
  }

  _aimAngleDeg() {
    return Math.round(this._aimAngle * 180 / Math.PI);
  }

  _selectWeapon(w) {
    this._weapon = w;
    window.dispatchEvent(new CustomEvent('weapon_changed', { detail: w }));
  }
}
