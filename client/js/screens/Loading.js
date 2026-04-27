import { showScreen, net } from '../main.js';

export default class Loading {
  constructor(data) {
    this._map = data.map || 'grassland';
    this._progress = 0;
    this._raf = null;
  }

  init(ui) {
    ui.innerHTML = `
      <div class="screen">
        <div style="text-align:center">
          <div class="logo" style="font-size:40px;margin-bottom:8px">MUDHOLE</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.5);margin-bottom:30px">
            Loading map...
          </div>
          <div class="loading-bar-wrap">
            <div class="loading-bar-fill" id="load-bar" style="width:0%"></div>
          </div>
          <div class="loading-text" id="load-text">Generating terrain...</div>
        </div>
      </div>
    `;

    // Симулировать прогресс (реальная работа на сервере)
    this._animate();

    net.on('terrain', msg => {
      this._progress = 90;
      this._updateBar('Decoding map...');
      // Сохранить terrain для Game экрана
      window._mudhole_terrain = msg.rle;
      setTimeout(() => {
        this._progress = 100;
        this._updateBar('Done!');
      }, 200);
    });

    net.on('game_start', msg => {
      cancelAnimationFrame(this._raf);
      window._mudhole_gameStart = msg;
      setTimeout(() => showScreen('game', { map: this._map }), 300);
    });

    net.on('disconnect', () => showScreen('mainMenu'));
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    net.off('terrain');
    net.off('game_start');
    net.off('disconnect');
  }

  _animate() {
    const steps = [
      [20, 'Generating terrain...'],
      [45, 'Placing worms...'],
      [70, 'Syncing...'],
      [85, 'Almost ready...'],
    ];
    let si = 0;
    const tick = () => {
      if (si < steps.length && this._progress >= steps[si][0] - 5) {
        this._updateBar(steps[si][1]);
        si++;
      }
      if (this._progress < 85) {
        this._progress += 0.4;
        this._updateBar();
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _updateBar(text) {
    const bar = document.getElementById('load-bar');
    const txt = document.getElementById('load-text');
    if (bar) bar.style.width = Math.min(100, this._progress) + '%';
    if (txt && text) txt.textContent = text;
  }
}
