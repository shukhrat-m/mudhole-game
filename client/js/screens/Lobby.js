import { showScreen, net } from '../main.js';

export default class Lobby {
  constructor(data) {
    this._data    = data;
    this._players = {};
  }

  init(ui) {
    const init = this._data.initialData;
    (init.players || []).forEach(p => { this._players[p.id] = p; });
    const roomName = init.roomName || 'MUDHOLE';

    ui.innerHTML = `
      <div id="lobby-screen" class="screen" style="flex-direction:column;gap:12px;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <div style="display:flex;flex-direction:column">
            <div class="logo" style="font-size:32px;margin:0">MUDHOLE</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.45);margin-top:2px">${this._esc(roomName)}</div>
          </div>
          <div style="display:flex;gap:8px">
            <div class="share-url" id="share-url-box">${window.location.origin}</div>
            <button class="btn-copy" id="btn-copy">Copy</button>
          </div>
          <button class="btn btn-ghost" id="btn-leave" style="width:auto;margin:0">Leave</button>
        </div>

        <div style="display:flex;gap:12px;flex:1;width:100%;overflow:hidden">
          <!-- Team A -->
          <div class="team-panel team-a" style="flex:1">
            <div class="team-header">
              <div class="team-dot a"></div>
              <div class="team-name">Team A</div>
              <div class="team-count" id="count-a">0 players</div>
            </div>
            <div class="player-list" id="list-a"></div>
          </div>

          <!-- Team B -->
          <div class="team-panel team-b" style="flex:1">
            <div class="team-header">
              <div class="team-dot b"></div>
              <div class="team-name">Team B</div>
              <div class="team-count" id="count-b">0 players</div>
            </div>
            <div class="player-list" id="list-b"></div>
          </div>

          <!-- Sidebar -->
          <div class="lobby-sidebar">
            <div class="lobby-box" style="text-align:center">
              <h3>Map</h3>
              <div style="font-size:15px;font-weight:600;margin-bottom:10px">Grassland</div>
              <canvas id="map-preview" class="map-preview" width="220" height="100"></canvas>
            </div>

            <div class="lobby-box" id="balance-box" style="display:none">
              <div class="balance-note" id="balance-note"></div>
            </div>

            <button id="btn-start" ${net.isHost ? '' : 'disabled'}>
              ${net.isHost ? 'START' : 'Waiting for host...'}
            </button>
          </div>
        </div>
      </div>
    `;

    this._drawMapPreview();
    this._render();

    document.getElementById('btn-leave').onclick  = () => this._leave();
    document.getElementById('btn-copy').onclick   = () => this._copyUrl();
    document.getElementById('btn-start').onclick  = () => net.send({ type: 'start_game' });

    net.on('player_joined', msg => { this._players[msg.player.id] = msg.player; this._render(); });
    net.on('player_left',   msg => { delete this._players[msg.id]; this._render(); });
    net.on('team_swapped',  msg => {
      if (this._players[msg.id]) { this._players[msg.id].team = msg.newTeam; this._render(); }
    });
    net.on('host_changed', msg => {
      Object.values(this._players).forEach(p => { p.isHost = p.id === msg.id; });
      if (msg.id === net.playerId) {
        net.isHost = true;
        const btn = document.getElementById('btn-start');
        if (btn) { btn.disabled = false; btn.textContent = 'START'; }
      }
      this._render();
    });
    net.on('loading',    msg => showScreen('loading', { map: msg.map }));
    net.on('disconnect', ()  => showScreen('mainMenu'));
  }

  destroy() {
    ['player_joined','player_left','team_swapped','host_changed','loading','disconnect']
      .forEach(t => net.off(t));
  }

  _render() {
    const teams = { A: [], B: [] };
    Object.values(this._players).forEach(p => (p.team === 'A' ? teams.A : teams.B).push(p));

    ['A', 'B'].forEach(t => {
      const list  = document.getElementById(`list-${t.toLowerCase()}`);
      const count = document.getElementById(`count-${t.toLowerCase()}`);
      if (!list) return;
      count.textContent = `${teams[t].length} player${teams[t].length !== 1 ? 's' : ''}`;
      list.innerHTML = teams[t].map(p => {
        const isMe     = p.id === net.playerId;
        const swapLabel = p.team === 'A' ? 'To B →' : '← To A';
        return `
          <div class="player-item ${isMe ? 'me' : ''}">
            <span class="player-crown">${p.isHost ? '👑' : '🪱'}</span>
            <span class="player-name">${this._esc(p.name)}</span>
            ${isMe ? `<button class="btn-swap" data-id="${p.id}">${swapLabel}</button>` : ''}
          </div>
        `;
      }).join('');
    });

    document.querySelectorAll('.btn-swap').forEach(btn => {
      btn.onclick = () => net.send({ type: 'swap_team' });
    });

    const diff = Math.abs(teams.A.length - teams.B.length);
    const box  = document.getElementById('balance-box');
    const note = document.getElementById('balance-note');
    if (box && note) {
      if (diff >= 2) {
        box.style.display = 'block';
        const smaller = teams.A.length < teams.B.length ? 'A' : 'B';
        note.textContent = `Team ${smaller} is smaller — they get +20% HP for balance`;
      } else {
        box.style.display = 'none';
      }
    }

    const canStart = net.isHost && teams.A.length >= 1 && teams.B.length >= 1;
    const btn = document.getElementById('btn-start');
    if (btn) btn.disabled = !canStart;
  }

  _drawMapPreview() {
    const c = document.getElementById('map-preview');
    if (!c) return;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = '#2d7a2d';
    ctx.beginPath();
    ctx.moveTo(0, c.height);
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * c.width;
      const y = 55 + Math.sin(i * 1.8) * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(c.width, c.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px Segoe UI';
    ctx.fillText('Grassland', 8, 14);
  }

  _leave() {
    net.disconnect();
    showScreen('mainMenu');
  }

  _copyUrl() {
    const text = window.location.origin;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
    });
  }

  _esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
