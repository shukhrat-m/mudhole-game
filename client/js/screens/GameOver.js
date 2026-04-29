import { showScreen, net } from '../main.js';
import Particles from '../utils/Particles.js';

export default class GameOver {
  constructor(data) {
    this._winner = data.winner;
    this._stats  = data.stats || [];
    this._particles = new Particles();
    this._raf = null;
    this._canvas = null;
  }

  init(ui) {
    const winColor = this._winner === 'A' ? '#4a9eff' : '#ff4a4a';
    const winLabel = this._winner === 'A' ? 'Team Alpha' : 'Team Bravo';

    const sorted = [...this._stats].sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0));

    ui.innerHTML = `
      <div id="gameover-screen" class="screen">
        <canvas id="go-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></canvas>

        <div class="gameover-content">
          <div class="gameover-title" style="color:${winColor}">${winLabel}</div>
          <div class="gameover-subtitle">wins!</div>

          <table class="stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Dealt</th>
                <th>Taken</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(p => {
                const teamColor = p.team === 'A' ? '#4a9eff' : '#ff4a4a';
                const teamName  = p.team === 'A' ? 'Team Alpha' : 'Team Bravo';
                return `
                <tr style="border-left: 3px solid ${teamColor}">
                  <td>${this._esc(p.name)}</td>
                  <td style="color:${teamColor}">${teamName}</td>
                  <td class="stat-dealt">${p.damageDealt || 0}</td>
                  <td class="stat-taken">${p.damageTaken || 0}</td>
                  <td class="${p.alive ? 'alive' : 'dead'}">${p.alive ? '✓ Alive' : '✗ Dead'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>

          <div class="gameover-btns">
            ${net.isHost ? '<button class="btn btn-primary" id="go-rematch">Rematch</button>' : ''}
            <button class="btn btn-secondary" id="go-menu">Main Menu</button>
          </div>
        </div>
      </div>
    `;

    this._canvas = document.getElementById('go-canvas');
    this._canvas.width  = window.innerWidth;
    this._canvas.height = window.innerHeight;

    // Конфетти
    this._particles.spawnConfetti(this._canvas.width, this._canvas.height);
    this._loop();

    if (net.isHost) {
      document.getElementById('go-rematch').onclick = () => {
        net.send({ type: 'rematch' });
      };
    }
    document.getElementById('go-menu').onclick = () => {
      net.disconnect();
      showScreen('mainMenu');
    };

    net.on('rematch', msg => {
      showScreen('lobby', { initialData: { ...msg, settings: { map: 'grassland' } } });
    });
    net.on('disconnect', () => showScreen('mainMenu'));

    // Очистить игровые canvas
    ['canvas-bg','canvas-terrain','canvas-game','canvas-effects','canvas-ui-game'].forEach(id => {
      const c = document.getElementById(id);
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    });
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    net.off('rematch');
    net.off('disconnect');
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this._particles.update();
    const ctx = this._canvas.getContext('2d');
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Тёмный фон
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    this._particles.render(ctx);
  }

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
