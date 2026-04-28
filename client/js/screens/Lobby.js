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
      <div class="lobby-root">
        <!-- Header -->
        <div class="lobby-header">
          <div class="lobby-logo">MUDHOLE</div>
          <div class="lobby-room-name">${this._esc(roomName)}</div>
          <div class="lobby-header-spacer"></div>
          <div class="lobby-share">
            <span class="lobby-share-label">Invite</span>
            <div class="share-url" id="share-url-box">${window.location.origin}</div>
            <button class="btn-copy" id="btn-copy">Copy Link</button>
          </div>
          <button class="lobby-btn-leave" id="btn-leave">Leave</button>
        </div>

        <!-- Body -->
        <div class="lobby-body">
          <!-- Team A -->
          <div class="lobby-team team-a">
            <div class="lobby-team-header">
              <div class="lobby-team-badge">🔵</div>
              <div class="lobby-team-info">
                <div class="lobby-team-name">Team Alpha</div>
                <div class="lobby-team-count" id="count-a">0 players</div>
              </div>
              <div class="lobby-team-indicator"></div>
            </div>
            <div class="lobby-player-list" id="list-a"></div>
          </div>

          <!-- Team B -->
          <div class="lobby-team team-b">
            <div class="lobby-team-header">
              <div class="lobby-team-badge">🔴</div>
              <div class="lobby-team-info">
                <div class="lobby-team-name">Team Bravo</div>
                <div class="lobby-team-count" id="count-b">0 players</div>
              </div>
              <div class="lobby-team-indicator"></div>
            </div>
            <div class="lobby-player-list" id="list-b"></div>
          </div>

          <!-- Sidebar -->
          <div class="lobby-sidebar">
            <!-- Map preview -->
            <div class="lobby-box">
              <div class="lobby-box-header">Map</div>
              <div class="lobby-map-canvas-wrap">
                <canvas id="map-preview" class="map-preview" width="232" height="110"></canvas>
                <div class="lobby-map-name-overlay">Grassland</div>
              </div>
            </div>

            <!-- Player counts -->
            <div class="lobby-box">
              <div class="lobby-box-header">Teams</div>
              <div class="lobby-players-summary">
                <div class="lobby-team-summary a">
                  <div class="lobby-team-summary-label">Alpha</div>
                  <div class="lobby-team-summary-count" id="summary-a">0</div>
                </div>
                <div class="lobby-team-summary b">
                  <div class="lobby-team-summary-label">Bravo</div>
                  <div class="lobby-team-summary-count" id="summary-b">0</div>
                </div>
              </div>
              <div class="lobby-balance-note" id="balance-note"></div>
            </div>

            <button id="btn-start" ${net.isHost ? '' : 'disabled'}>
              ${net.isHost ? '▶  Start Game' : 'Waiting for host…'}
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
      const list    = document.getElementById(`list-${t.toLowerCase()}`);
      const count   = document.getElementById(`count-${t.toLowerCase()}`);
      const summary = document.getElementById(`summary-${t.toLowerCase()}`);
      if (!list) return;

      const n = teams[t].length;
      if (count)   count.textContent   = `${n} player${n !== 1 ? 's' : ''}`;
      if (summary) summary.textContent = n;

      const swapLabel = t === 'A' ? 'Switch →' : '← Switch';
      list.innerHTML = teams[t].map(p => {
        const isMe = p.id === net.playerId;
        return `
          <div class="lobby-player-card ${isMe ? 'is-me' : ''}">
            <div class="lobby-player-avatar">${p.isHost ? '👑' : '🪱'}</div>
            <div class="lobby-player-details">
              <div class="lobby-player-name">${this._esc(p.name)}</div>
              <div class="lobby-player-role">${p.isHost ? 'Host' : 'Player'}${isMe ? ' · You' : ''}</div>
            </div>
            ${p.isHost ? '<span class="lobby-host-badge">HOST</span>' : ''}
            ${isMe ? `<button class="btn-swap" data-id="${p.id}">${swapLabel}</button>` : ''}
          </div>
        `;
      }).join('');

      // Empty slot hint if no players
      if (n === 0) {
        list.innerHTML = `
          <div class="lobby-empty-slot">
            <div class="lobby-empty-icon">+</div>
            Waiting for players…
          </div>
        `;
      }
    });

    document.querySelectorAll('.btn-swap').forEach(btn => {
      btn.onclick = () => net.send({ type: 'swap_team' });
    });

    const diff = Math.abs(teams.A.length - teams.B.length);
    const note = document.getElementById('balance-note');
    if (note) {
      if (diff >= 2) {
        const smaller = teams.A.length < teams.B.length ? 'Alpha' : 'Bravo';
        note.textContent = `⚖ Team ${smaller} is smaller — they get +20% HP`;
        note.classList.add('visible');
      } else {
        note.classList.remove('visible');
      }
    }

    const canStart = net.isHost && teams.A.length >= 1 && teams.B.length >= 1;
    const btn = document.getElementById('btn-start');
    if (btn) {
      btn.disabled = !canStart;
      btn.textContent = net.isHost
        ? (canStart ? '▶  Start Game' : '▶  Need players on both teams')
        : 'Waiting for host…';
    }
  }

  _drawMapPreview() {
    const c = document.getElementById('map-preview');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0e1e38');
    sky.addColorStop(1, '#1a3a5a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 137) % W);
      const sy = ((i * 97)  % (H * 0.55));
      ctx.fillStyle = `rgba(255,255,255,${0.3 + (i % 3) * 0.15})`;
      ctx.beginPath(); ctx.arc(sx, sy, 0.8, 0, Math.PI * 2); ctx.fill();
    }

    // Terrain
    const tg = ctx.createLinearGradient(0, H * 0.45, 0, H);
    tg.addColorStop(0, '#3d6b28');
    tg.addColorStop(0.1, '#5a3415');
    tg.addColorStop(1, '#1a0e06');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * W;
      const y = H * 0.55 + Math.sin(i * 1.4) * 12 + Math.sin(i * 3.1) * 5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Grass line
    ctx.strokeStyle = '#4ac428';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#2aaa10'; ctx.shadowBlur = 4;
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * W;
      const y = H * 0.55 + Math.sin(i * 1.4) * 12 + Math.sin(i * 3.1) * 5;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
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
