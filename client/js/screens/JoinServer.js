import { showScreen, net } from '../main.js';

function autoWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export default class JoinServer {
  constructor() {
    this._pollTimer = null;
  }

  init(ui) {
    ui.innerHTML = `
      <div class="screen">
        <div class="panel" style="width:460px">
          <h2>Join Game</h2>

          <div class="form-group">
            <label>Your Nickname</label>
            <input id="js-name" type="text" placeholder="Enter nickname" maxlength="20" />
          </div>

          <div class="divider"></div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">Available Games</div>
            <button class="btn-copy" id="js-refresh" style="font-size:11px;padding:4px 10px">↻ Refresh</button>
          </div>

          <div id="js-rooms" style="min-height:80px;max-height:240px;overflow-y:auto;margin-bottom:12px"></div>

          <button class="btn btn-ghost" id="js-back">← Back</button>
          <div class="error-msg" id="js-err"></div>
        </div>
      </div>
    `;

    document.getElementById('js-name').value = localStorage.getItem('mudhole_name') || '';
    document.getElementById('js-back').onclick    = () => showScreen('mainMenu');
    document.getElementById('js-refresh').onclick = () => this._loadRooms();

    this._loadRooms();
    this._pollTimer = setInterval(() => this._loadRooms(), 4000);
  }

  async _loadRooms() {
    try {
      const res  = await fetch('/rooms');
      const list = await res.json();
      this._renderRooms(list);
    } catch {
      // silent on poll failure
    }
  }

  _renderRooms(list) {
    const el = document.getElementById('js-rooms');
    if (!el) return;

    if (list.length === 0) {
      el.innerHTML = `
        <div style="color:rgba(255,255,255,0.25);font-size:13px;text-align:center;padding:24px 0">
          No open games yet — create one first!
        </div>`;
      return;
    }

    el.innerHTML = list.map(r => `
      <div class="room-row player-item" data-id="${r.id}"
           style="justify-content:space-between;cursor:pointer;transition:background 0.15s">
        <div>
          <div style="font-size:14px;font-weight:600">${this._esc(r.name)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px">
            ${r.players} / ${r.maxPlayers} players
          </div>
        </div>
        <span style="font-size:12px;color:rgba(255,255,255,0.4)">Join →</span>
      </div>
    `).join('');

    el.querySelectorAll('.room-row').forEach(row => {
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.09)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('click', () => this._join(row.dataset.id));
    });
  }

  async _join(roomId) {
    const name = document.getElementById('js-name').value.trim();
    const err  = document.getElementById('js-err');
    if (!name) { err.textContent = 'Enter a nickname first'; return; }

    err.textContent = 'Connecting...';
    localStorage.setItem('mudhole_name', name);

    try {
      const msg = await net.joinRoom(autoWsUrl(), name, roomId);
      showScreen('lobby', { initialData: msg });
    } catch (e) {
      err.textContent = e.message || 'Could not join';
    }
  }

  destroy() {
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  }

  _esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
