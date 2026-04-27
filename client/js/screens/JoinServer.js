import { showScreen, net } from '../main.js';

function autoWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export default class JoinServer {
  init(ui) {
    ui.innerHTML = `
      <div class="screen">
        <div class="panel" style="width:380px">
          <h2>Join Game</h2>

          <div class="form-group">
            <label>Your Name</label>
            <input id="js-name" type="text" placeholder="Enter nickname" maxlength="20" />
          </div>

          <div class="divider"></div>

          <button class="btn btn-primary" id="js-btn">Connect</button>
          <button class="btn btn-ghost" id="js-back">← Back</button>

          <div class="error-msg" id="js-err"></div>
        </div>
      </div>
    `;

    document.getElementById('js-name').value = localStorage.getItem('mudhole_name') || '';
    document.getElementById('js-back').onclick = () => showScreen('mainMenu');
    document.getElementById('js-btn').onclick   = () => this._join();
    document.getElementById('js-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._join();
    });
  }

  async _join() {
    const name = document.getElementById('js-name').value.trim();
    const err  = document.getElementById('js-err');
    if (!name) { err.textContent = 'Enter a name'; return; }

    err.textContent = 'Connecting...';
    localStorage.setItem('mudhole_name', name);

    try {
      const msg = await net.connect(autoWsUrl(), name);
      showScreen('lobby', { initialData: msg });
    } catch (e) {
      err.textContent = e.message || 'Could not connect';
    }
  }

  destroy() {}
}
