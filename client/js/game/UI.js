const WEAPONS = [
  { id: 'grenade',      label: 'Grenade',      key: '1' },
  { id: 'bazooka',      label: 'Bazooka',      key: '2' },
  { id: 'machinegun',   label: 'Machine Gun',  key: '3' },
  { id: 'airstrike',    label: 'Airstrike',    key: '4' },
  { id: 'holy_grenade', label: 'Holy Grenade', key: '5' },
  { id: 'mine',         label: 'Mine',         key: '6' },
];

export default class UI {
  constructor(hudEl) {
    this._hud          = hudEl;
    this._myTurn       = false;
    this._activeWeapon = 'grenade';
    this._onWeaponSelect = null;
    this._onLeave        = null;
    this._iconCanvases   = {};
    this._render();
  }

  setOnWeaponSelect(fn) { this._onWeaponSelect = fn; }
  setOnLeave(fn)        { this._onLeave = fn; }

  update({ worms, currentPlayerId, nextPlayerId, myId, timeLeft, myTurn, retreating, wind, scores, myAmmo }) {
    this._myTurn = myTurn;

    const seenA = new Set(), seenB = new Set();
    const tA = [], tB = [];
    worms.forEach(w => {
      if (w.team === 'A' && !seenA.has(w.id)) { seenA.add(w.id); tA.push(w); }
      if (w.team === 'B' && !seenB.has(w.id)) { seenB.add(w.id); tB.push(w); }
    });

    const topEl = this._hud.querySelector('.hud-top');
    if (!topEl) return;

    const currentWorm = worms.find(w => w.id === currentPlayerId);
    topEl.querySelector('#hud-turn-name').textContent = currentWorm ? currentWorm.name : '—';

    const labelEl = topEl.querySelector('.hud-turn-label');
    if (labelEl) {
      labelEl.textContent = retreating ? 'RETREAT!' : 'NOW PLAYING';
      labelEl.style.color = retreating ? '#ff9900' : '';
    }

    const timerEl = topEl.querySelector('#hud-timer');
    timerEl.textContent = timeLeft;
    timerEl.classList.toggle('urgent', timeLeft <= 10 && !retreating);
    timerEl.classList.toggle('retreat', !!retreating);

    const nextEl = topEl.querySelector('#hud-next');
    if (nextEl) {
      const nw = nextPlayerId ? worms.find(w => w.id === nextPlayerId) : null;
      if (nw) {
        nextEl.textContent = `▶ ${this._esc(nw.name)}`;
        nextEl.style.color = nw.team === 'A' ? '#4a9eff' : '#ff4a4a';
      } else {
        nextEl.textContent = '';
      }
    }

    const windEl = topEl.querySelector('#hud-wind');
    if (windEl) {
      const abs = Math.abs(wind ?? 0);
      if (abs === 0) {
        windEl.innerHTML = '<span class="hud-wind-calm">CALM</span>';
      } else {
        const dir    = wind < 0 ? '←' : '→';
        const filled = '▮'.repeat(abs);
        const empty  = '▯'.repeat(5 - abs);
        const bars   = wind < 0 ? `${filled}${empty}` : `${empty}${filled}`;
        windEl.innerHTML = wind < 0
          ? `<span class="hud-wind-arrow">${dir}</span><span class="hud-wind-bars">${bars}</span>`
          : `<span class="hud-wind-bars">${bars}</span><span class="hud-wind-arrow">${dir}</span>`;
        windEl.style.color = abs >= 4 ? '#ff9900' : '#cce4ff';
      }
    }

    topEl.querySelector('#hud-team-a').innerHTML =
      `<div class="hud-team-title hud-team-title-a">Team Alpha <span class="hud-score">${(scores || {}).A ?? 0}</span></div>` +
      tA.map(w => this._wormRow(w, w.id === currentPlayerId)).join('');

    topEl.querySelector('#hud-team-b').innerHTML =
      `<div class="hud-team-title hud-team-title-b">Team Bravo <span class="hud-score">${(scores || {}).B ?? 0}</span></div>` +
      tB.map(w => this._wormRow(w, w.id === currentPlayerId)).join('');

    const wpEl = this._hud.querySelector('#hud-weapons');
    if (wpEl) wpEl.style.display = (myTurn && !retreating) ? 'flex' : 'none';

    const hintEl = this._hud.querySelector('#hud-controls-hint');
    if (hintEl) hintEl.style.display = (myTurn && !retreating) ? 'block' : 'none';

    // Update ammo badges
    if (myAmmo) {
      WEAPONS.forEach(w => {
        const badge = this._hud.querySelector(`.ammo-badge[data-weapon="${w.id}"]`);
        if (badge) {
          const count = myAmmo[w.id] ?? '∞';
          badge.textContent = count;
          badge.style.color = count === 0 ? '#ff4444' : count <= 1 ? '#ffaa22' : '#88ff88';
        }
      });
    }
  }

  setWeapon(weapon) {
    this._activeWeapon = weapon;
    this._hud.querySelectorAll('.weapon-slot').forEach(el => {
      el.classList.toggle('active', el.dataset.weapon === weapon);
    });
    // Update label
    const lbl = this._hud.querySelector('#hud-weapon-label');
    const w   = WEAPONS.find(w => w.id === weapon);
    if (lbl && w) lbl.textContent = w.label;
  }

  _wormRow(w, isActive) {
    const hp     = Math.max(0, w.hp / w.maxHp);
    const hpColor = hp > 0.6 ? '#4aff88' : hp > 0.3 ? '#ffb84a' : '#ff4a4a';
    const glow    = isActive ? 'box-shadow:0 0 8px currentColor;' : '';
    return `
      <div class="hud-player-row${isActive ? ' active' : ''}" style="${glow}">
        <span class="hud-worm-icon">${w.alive ? (w.team === 'A' ? '🪖' : '🎯') : '💀'}</span>
        <span class="hud-worm-name">${this._esc(w.name)}</span>
        <div class="hud-hp-bar">
          <div class="hud-hp-fill" style="width:${hp*100}%;background:${hpColor}"></div>
        </div>
        <span class="hud-hp-num">${w.hp}</span>
      </div>`;
  }

  _render() {
    this._hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-team" id="hud-team-a"></div>

        <div class="hud-center">
          <div class="hud-turn-label">NOW PLAYING</div>
          <div class="hud-turn-name" id="hud-turn-name">—</div>
          <div class="hud-timer" id="hud-timer">30</div>
          <div id="hud-wind" class="hud-wind"><span class="hud-wind-calm">CALM</span></div>
          <div id="hud-next" class="hud-next"></div>
        </div>

        <div class="hud-team right" id="hud-team-b"></div>

        <button id="hud-leave">✕</button>
      </div>

      <div id="hud-controls-hint" style="display:none">
        ← → Move &nbsp;|&nbsp; Space Jump &nbsp;|&nbsp; ↑↓ Aim &nbsp;|&nbsp; Enter Fire &nbsp;|&nbsp; 1–6 Weapon &nbsp;|&nbsp; Tab End
      </div>

      <div id="hud-weapons" style="display:none">
        <div id="hud-weapon-label" class="hud-weapon-label">Grenade</div>
        <div class="weapon-slots-row">
          ${WEAPONS.map(w => `
            <div class="weapon-slot${w.id === this._activeWeapon ? ' active' : ''}" data-weapon="${w.id}" title="${w.label} [${w.key}]">
              <canvas class="weapon-icon-canvas" width="34" height="34" data-weapon="${w.id}"></canvas>
              <div class="weapon-slot-footer">
                <span class="weapon-key-badge">${w.key}</span>
                <span class="ammo-badge" data-weapon="${w.id}">—</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Weapon clicks
    this._hud.querySelectorAll('.weapon-slot').forEach(el => {
      el.onclick = () => {
        const w = el.dataset.weapon;
        this.setWeapon(w);
        if (this._onWeaponSelect) this._onWeaponSelect(w);
      };
    });

    // Leave button
    const leaveBtn = document.getElementById('hud-leave');
    if (leaveBtn) leaveBtn.onclick = () => { if (this._onLeave) this._onLeave(); };

    // Draw canvas weapon icons (after DOM is ready)
    requestAnimationFrame(() => this._drawAllIcons());
  }

  // ─── Canvas weapon icon drawing ──────────────────────────────────────────

  _drawAllIcons() {
    WEAPONS.forEach(w => {
      const c = this._hud.querySelector(`.weapon-icon-canvas[data-weapon="${w.id}"]`);
      if (c) this._drawIcon(c, w.id);
    });
  }

  _drawIcon(canvas, weapon) {
    const ctx = canvas.getContext('2d');
    const S   = 34;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);

    switch (weapon) {
      case 'grenade': {
        // Body
        ctx.fillStyle = '#778866';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(2, 4, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Segments
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        for (let a = 0; a < 360; a += 60) {
          const rad = a * Math.PI / 180;
          ctx.beginPath();
          ctx.moveTo(2 + Math.cos(rad) * 4, 4 + Math.sin(rad) * 4);
          ctx.lineTo(2 + Math.cos(rad) * 9, 4 + Math.sin(rad) * 9);
          ctx.stroke();
        }
        // Handle
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(2, -13); ctx.stroke();
        // Safety pin
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(-1, -12, 3, 0, Math.PI); ctx.stroke();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(-1, 0, 4, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'bazooka': {
        ctx.rotate(-0.4);
        // Tube
        const tg = ctx.createLinearGradient(-15, -3, -15, 3);
        tg.addColorStop(0, '#8aaa6a'); tg.addColorStop(1, '#5a7a4a');
        ctx.fillStyle = tg;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(-15, -4, 30, 8, 4); ctx.fill(); ctx.stroke();
        // Exhaust
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(-15, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Front tip
        ctx.fillStyle = '#cc5500';
        ctx.beginPath();
        ctx.moveTo(15, -3); ctx.lineTo(22, 0); ctx.lineTo(15, 3); ctx.closePath(); ctx.fill();
        // Grip
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(-4, 4, 6, 7);
        break;
      }
      case 'machinegun': {
        ctx.rotate(-0.25);
        // Main body
        const mg = ctx.createLinearGradient(-12, -5, -12, 5);
        mg.addColorStop(0, '#666'); mg.addColorStop(1, '#333');
        ctx.fillStyle = mg;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(-12, -5, 26, 10, 3); ctx.fill(); ctx.stroke();
        // Barrel (longer)
        ctx.fillStyle = '#555';
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.roundRect(14, -2.5, 5, 5, 2); ctx.fill(); ctx.stroke();
        // Cooling vents
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-8 + i * 4, -5); ctx.lineTo(-8 + i * 4, 5); ctx.stroke();
        }
        // Mag
        ctx.fillStyle = '#444';
        ctx.fillRect(-6, 5, 10, 8);
        // Sight
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(8, -8); ctx.stroke();
        ctx.beginPath(); ctx.arc(8, -9, 1.5, 0, Math.PI*2); ctx.stroke();
        break;
      }
      case 'airstrike': {
        // Plane body
        ctx.fillStyle = '#667788';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, -3); ctx.lineTo(-14, 0);
        ctx.lineTo(-8, 3); ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Wing
        ctx.fillStyle = '#889aaa';
        ctx.beginPath();
        ctx.moveTo(-2, 0); ctx.lineTo(-8, -12); ctx.lineTo(-12, -12);
        ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-2, 0); ctx.lineTo(-8, 12); ctx.lineTo(-12, 12);
        ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Cockpit
        ctx.fillStyle = '#aaccff';
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.ellipse(4, 0, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // Engines glow
        ctx.shadowColor = '#ff9900'; ctx.shadowBlur = 6;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath(); ctx.arc(-13, 0, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'holy_grenade': {
        // Glow aura
        const hgGrad = ctx.createRadialGradient(0, 3, 0, 0, 3, 15);
        hgGrad.addColorStop(0, 'rgba(255,255,120,0.4)');
        hgGrad.addColorStop(1, 'rgba(255,200,0,0)');
        ctx.fillStyle = hgGrad;
        ctx.beginPath(); ctx.arc(0, 3, 15, 0, Math.PI * 2); ctx.fill();
        // Body
        const hg = ctx.createRadialGradient(-3, -2, 1, 0, 3, 9);
        hg.addColorStop(0, '#ffffc0'); hg.addColorStop(0.5, '#ffd700'); hg.addColorStop(1, '#cc9900');
        ctx.fillStyle = hg;
        ctx.strokeStyle = 'rgba(160,100,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 3, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Cross
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(5, 2); ctx.stroke();
        // Handle
        ctx.strokeStyle = '#bbaa55';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -14); ctx.stroke();
        break;
      }
      case 'mine': {
        // Body disc
        const mg2 = ctx.createRadialGradient(-2, -2, 1, 0, 0, 11);
        mg2.addColorStop(0, '#888'); mg2.addColorStop(1, '#444');
        ctx.fillStyle = mg2;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 2, 11, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Prongs
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 1.5;
        [-5, 0, 5].forEach(dx => {
          ctx.beginPath(); ctx.moveTo(dx, -6); ctx.lineTo(dx, -13); ctx.stroke();
          ctx.fillStyle = '#888';
          ctx.beginPath(); ctx.arc(dx, -13, 1.5, 0, Math.PI * 2); ctx.fill();
        });
        // Red LED
        ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#ee2222';
        ctx.beginPath(); ctx.arc(0, 2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff8888';
        ctx.beginPath(); ctx.arc(-1, 1, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
    }

    ctx.restore();
  }

  showDead() {
    const existing = this._hud.querySelector('#dead-overlay');
    if (!existing) {
      const d = document.createElement('div');
      d.id = 'dead-overlay';
      d.className = 'hud-dead-overlay';
      d.innerHTML = '<div class="hud-dead-msg">You\'re eliminated. Spectating...</div>';
      this._hud.appendChild(d);
    }
  }

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  destroy() { this._hud.innerHTML = ''; }
}
