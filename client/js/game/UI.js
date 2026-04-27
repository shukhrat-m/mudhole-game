const WEAPONS = [
  { id: 'grenade',      label: 'Grenade',      key: '1', icon: '💣' },
  { id: 'bazooka',      label: 'Bazooka',      key: '2', icon: '🚀' },
  { id: 'machinegun',   label: 'Machine Gun',  key: '3', icon: '🔫' },
  { id: 'airstrike',    label: 'Airstrike',    key: '4', icon: '✈️' },
  { id: 'holy_grenade', label: 'Holy Grenade', key: '5', icon: '✝️' },
  { id: 'mine',         label: 'Mine',         key: '6', icon: '⚡' },
];

export default class UI {
  constructor(hudEl) {
    this._hud = hudEl;
    this._myTurn = false;
    this._activeWeapon = 'grenade';
    this._onWeaponSelect = null;
    this._onLeave = null;
    this._render();
  }

  setOnWeaponSelect(fn) { this._onWeaponSelect = fn; }
  setOnLeave(fn)        { this._onLeave = fn; }

  update({ worms, currentPlayerId, myId, timeLeft, myTurn }) {
    this._myTurn = myTurn;

    const teams = { A: [], B: [] };
    worms.forEach(w => (teams[w.team] === undefined ? null : (teams[w.team] || (teams[w.team] = [])).push(w)));
    worms.forEach(w => { if (!teams[w.team]) teams[w.team] = []; teams[w.team].push(w); });

    // Деdup
    const seenA = new Set(), seenB = new Set();
    const tA = [], tB = [];
    worms.forEach(w => {
      if (w.team === 'A' && !seenA.has(w.id)) { seenA.add(w.id); tA.push(w); }
      if (w.team === 'B' && !seenB.has(w.id)) { seenB.add(w.id); tB.push(w); }
    });

    const currentWorm = worms.find(w => w.id === currentPlayerId);
    const currentName = currentWorm ? currentWorm.name : '—';

    const topEl = this._hud.querySelector('.hud-top');
    if (!topEl) return;

    topEl.querySelector('#hud-turn-name').textContent = currentName;

    const timerEl = topEl.querySelector('#hud-timer');
    timerEl.textContent = timeLeft;
    timerEl.classList.toggle('urgent', timeLeft <= 10);

    // Команда A
    const aEl = topEl.querySelector('#hud-team-a');
    aEl.innerHTML = tA.map(w => this._wormRow(w, w.id === currentPlayerId)).join('');

    // Команда B
    const bEl = topEl.querySelector('#hud-team-b');
    bEl.innerHTML = tB.map(w => this._wormRow(w, w.id === currentPlayerId)).join('');

    // Панель оружий + подсказка управления
    const wpEl = this._hud.querySelector('#hud-weapons');
    if (wpEl) wpEl.style.display = myTurn ? 'flex' : 'none';

    const hintEl = this._hud.querySelector('#hud-controls-hint');
    if (hintEl) hintEl.style.display = myTurn ? 'block' : 'none';
  }

  setWeapon(weapon) {
    this._activeWeapon = weapon;
    this._hud.querySelectorAll('.weapon-slot').forEach(el => {
      el.classList.toggle('active', el.dataset.weapon === weapon);
    });
  }

  _wormRow(w, isActive) {
    const hp = Math.max(0, w.hp / w.maxHp);
    const hpColor = hp > 0.6 ? '#4aff88' : hp > 0.3 ? '#ffb84a' : '#ff4a4a';
    return `
      <div class="hud-player-row" style="${isActive ? 'opacity:1' : 'opacity:0.6'}">
        <span style="font-size:11px">${w.alive ? '🪱' : '💀'}</span>
        <span style="font-size:12px;flex:1;max-width:80px;overflow:hidden;text-overflow:ellipsis">${this._esc(w.name)}</span>
        <div class="hud-hp-bar">
          <div class="hud-hp-fill" style="width:${hp*100}%;background:${hpColor}"></div>
        </div>
        <span style="font-size:11px;min-width:28px;text-align:right">${w.hp}</span>
      </div>
    `;
  }

  _render() {
    this._hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-team" id="hud-team-a">
          <div style="font-size:11px;color:#4a9eff;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
            Team A
          </div>
        </div>

        <div class="hud-center">
          <div class="hud-turn-label">Current Turn</div>
          <div class="hud-turn-name" id="hud-turn-name">—</div>
          <div class="hud-timer" id="hud-timer">30</div>
        </div>

        <div class="hud-team right" id="hud-team-b">
          <div style="font-size:11px;color:#ff4a4a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
            Team B
          </div>
        </div>

        <button id="hud-leave" style="
          position:absolute;top:10px;right:12px;
          background:rgba(255,60,60,0.18);border:1px solid rgba(255,60,60,0.3);
          color:rgba(255,255,255,0.55);border-radius:6px;
          padding:4px 10px;font-size:11px;cursor:pointer;
          pointer-events:auto;transition:all 0.15s;
        ">✕ Leave</button>
      </div>

      <div id="hud-controls-hint" style="
        position:absolute;bottom:80px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;padding:6px 14px;font-size:11px;
        color:rgba(255,255,255,0.45);letter-spacing:0.5px;
        white-space:nowrap;pointer-events:none;display:none;
      ">← → Move &nbsp;|&nbsp; Space Jump &nbsp;|&nbsp; ↑↓ Aim &nbsp;|&nbsp; Enter Fire &nbsp;|&nbsp; 1–6 Weapon &nbsp;|&nbsp; Tab End</div>

      <div class="hud-weapons" id="hud-weapons" style="display:none">
        ${WEAPONS.map(w => `
          <div class="weapon-slot ${w.id === this._activeWeapon ? 'active' : ''}" data-weapon="${w.id}" title="${w.label}">
            ${w.icon}
            <div class="weapon-key">${w.key}</div>
          </div>
        `).join('')}
      </div>
    `;

    this._hud.querySelectorAll('.weapon-slot').forEach(el => {
      el.onclick = () => {
        const w = el.dataset.weapon;
        this.setWeapon(w);
        if (this._onWeaponSelect) this._onWeaponSelect(w);
      };
    });

    const leaveBtn = document.getElementById('hud-leave');
    if (leaveBtn) {
      leaveBtn.onmouseenter = () => { leaveBtn.style.color = '#fff'; leaveBtn.style.background = 'rgba(255,60,60,0.4)'; };
      leaveBtn.onmouseleave = () => { leaveBtn.style.color = 'rgba(255,255,255,0.55)'; leaveBtn.style.background = 'rgba(255,60,60,0.18)'; };
      leaveBtn.onclick = () => { if (this._onLeave) this._onLeave(); };
    }
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

  destroy() {
    this._hud.innerHTML = '';
  }
}
