import { showScreen, net } from '../main.js';

const MAPS = ['grassland', 'cave', 'island', 'industrial', 'hell', 'snowfield'];
const MAP_LABELS = {
  grassland:  'Grassland',
  cave:       'Caves',
  island:     'Island',
  industrial: 'Industrial',
  hell:       'Hell',
  snowfield:  'Snowfield',
};
const MAP_COLORS = {
  grassland:  ['#1a3a1a', '#2d7a2d'],
  cave:       ['#1a1a1a', '#3a3a3a'],
  island:     ['#0a2a4a', '#1a6a8a'],
  industrial: ['#2a2a1a', '#5a5a3a'],
  hell:       ['#3a0a0a', '#8a2020'],
  snowfield:  ['#1a2a3a', '#4a7aaa'],
};

export default class Lobby {
  constructor(data) {
    this._data = data;
    this._players = {};   // id → player
    this._settings = { map: 'grassland' };
    this._mapIndex = 0;
    this._ngrokUrl = null;
    this._mapCanvas = null;
  }

  init(ui) {
    // Заполнить из initialData
    const init = this._data.initialData;
    (init.players || []).forEach(p => { this._players[p.id] = p; });
    if (init.settings) this._settings = { ...init.settings };
    this._mapIndex = MAPS.indexOf(this._settings.map);
    if (this._mapIndex < 0) this._mapIndex = 0;

    ui.innerHTML = `
      <div id="lobby-screen" class="screen" style="flex-direction:column;gap:12px;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <div class="logo" style="font-size:32px;margin:0">MUDHOLE</div>
          <div style="display:flex;gap:8px">
            <div class="share-url" id="share-url-box">Loading link...</div>
            <button class="btn-copy" id="btn-copy">Copy</button>
          </div>
          <button class="btn btn-ghost" id="btn-leave" style="width:auto;margin:0">Leave</button>
        </div>

        <div style="display:flex;gap:12px;flex:1;width:100%;overflow:hidden">
          <!-- Команда A -->
          <div class="team-panel team-a" style="flex:1">
            <div class="team-header">
              <div class="team-dot a"></div>
              <div class="team-name">Team A</div>
              <div class="team-count" id="count-a">0 players</div>
            </div>
            <div class="player-list" id="list-a"></div>
          </div>

          <!-- Команда B -->
          <div class="team-panel team-b" style="flex:1">
            <div class="team-header">
              <div class="team-dot b"></div>
              <div class="team-name">Team B</div>
              <div class="team-count" id="count-b">0 players</div>
            </div>
            <div class="player-list" id="list-b"></div>
          </div>

          <!-- Сайдбар -->
          <div class="lobby-sidebar">
            <div class="lobby-box">
              <h3>Map</h3>
              <div class="map-selector">
                <button class="map-arrow" id="map-prev">‹</button>
                <div class="map-name" id="map-name">${MAP_LABELS[this._settings.map]}</div>
                <button class="map-arrow" id="map-next">›</button>
              </div>
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

    this._mapCanvas = document.getElementById('map-preview');

    // Нарисовать превью
    this._drawMapPreview();
    this._render();

    // Кнопки
    document.getElementById('btn-leave').onclick  = () => this._leave();
    document.getElementById('btn-copy').onclick   = () => this._copyUrl();
    document.getElementById('btn-start').onclick  = () => this._startGame();
    document.getElementById('map-prev').onclick   = () => this._changeMap(-1);
    document.getElementById('map-next').onclick   = () => this._changeMap(1);

    // Отключить стрелки карты если не хост
    if (!net.isHost) {
      document.getElementById('map-prev').disabled = true;
      document.getElementById('map-next').disabled = true;
    }

    // Загрузить ngrok URL
    this._loadNgrokUrl();

    // Сетевые события
    net.on('player_joined', msg => { this._players[msg.player.id] = msg.player; this._render(); });
    net.on('player_left',   msg => { delete this._players[msg.id]; this._render(); });
    net.on('team_swapped',  msg => {
      if (this._players[msg.id]) { this._players[msg.id].team = msg.newTeam; this._render(); }
    });
    net.on('settings', msg => {
      this._settings = { ...msg.settings };
      this._mapIndex = MAPS.indexOf(this._settings.map);
      if (this._mapIndex < 0) this._mapIndex = 0;
      this._updateMapUI();
    });
    net.on('host_changed', msg => {
      Object.values(this._players).forEach(p => { p.isHost = p.id === msg.id; });
      if (msg.id === net.playerId) {
        net.isHost = true;
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-start').textContent = 'START';
        document.getElementById('map-prev').disabled = false;
        document.getElementById('map-next').disabled = false;
      }
      this._render();
    });
    net.on('loading', msg => {
      showScreen('loading', { map: msg.map });
    });
    net.on('disconnect', () => showScreen('mainMenu'));
  }

  destroy() {
    ['player_joined','player_left','team_swapped','settings','host_changed','loading','disconnect']
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
        const isMe = p.id === net.playerId;
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

    // Баланс
    const diff = Math.abs(teams.A.length - teams.B.length);
    const box  = document.getElementById('balance-box');
    const note = document.getElementById('balance-note');
    if (diff >= 2) {
      box.style.display = 'block';
      const smaller = teams.A.length < teams.B.length ? 'A' : 'B';
      note.textContent = `Team ${smaller} is smaller — they get +20% HP for balance`;
    } else {
      box.style.display = 'none';
    }

    // Кнопка старт
    const canStart = net.isHost && teams.A.length >= 1 && teams.B.length >= 1;
    const btn = document.getElementById('btn-start');
    if (btn) btn.disabled = !canStart;
  }

  _changeMap(dir) {
    if (!net.isHost) return;
    this._mapIndex = (this._mapIndex + dir + MAPS.length) % MAPS.length;
    const map = MAPS[this._mapIndex];
    net.send({ type: 'select_map', map });
    this._settings.map = map;
    this._updateMapUI();
  }

  _updateMapUI() {
    const map = MAPS[this._mapIndex] || 'grassland';
    const nameEl = document.getElementById('map-name');
    if (nameEl) nameEl.textContent = MAP_LABELS[map] || map;
    this._drawMapPreview();
  }

  _drawMapPreview() {
    const c = this._mapCanvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    const map = MAPS[this._mapIndex] || 'grassland';
    const [bg, ground] = MAP_COLORS[map] || ['#1a1a1a', '#3a3a3a'];

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);

    // Нарисовать схематичный профиль карты
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.moveTo(0, c.height);

    if (map === 'industrial') {
      // Платформы
      ctx.lineTo(0, 75); ctx.lineTo(60, 75); ctx.lineTo(60, 60);
      ctx.lineTo(100, 60); ctx.lineTo(100, 75); ctx.lineTo(160, 75);
      ctx.lineTo(160, 65); ctx.lineTo(220, 65); ctx.lineTo(220, 75);
    } else if (map === 'cave') {
      ctx.lineTo(0, 90); ctx.lineTo(220, 90);
    } else {
      const pts = 12;
      for (let i = 0; i <= pts; i++) {
        const x = (i / pts) * c.width;
        const base = map === 'snowfield' ? 65 : 55;
        const amp  = map === 'hell' ? 25 : map === 'island' ? 15 : 18;
        const y    = base + Math.sin(i * 1.8 + this._mapIndex * 0.7) * amp;
        ctx.lineTo(x, y);
      }
    }

    ctx.lineTo(c.width, c.height);
    ctx.closePath();
    ctx.fill();

    // Вода
    if (map === 'island') {
      ctx.fillStyle = 'rgba(30,100,180,0.5)';
      ctx.fillRect(0, 80, 30, 20);
      ctx.fillRect(190, 80, 30, 20);
    }

    // Надпись
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px Segoe UI';
    ctx.fillText(MAP_LABELS[map], 8, 14);
  }

  _startGame() {
    net.send({ type: 'start_game' });
  }

  _leave() {
    net.disconnect();
    showScreen('mainMenu');
  }

  _loadNgrokUrl() {
    const url = window.location.origin;
    const urlBox = document.getElementById('share-url-box');
    if (urlBox) { urlBox.textContent = url; urlBox.title = url; }
    this._ngrokUrl = url;
  }

  _copyUrl() {
    const text = this._ngrokUrl || window.location.origin;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
    });
  }

  _esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
