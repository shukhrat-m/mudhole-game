import { showScreen, net } from '../main.js';

function autoWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export default class CreateServer {
  init(ui) {
    ui.innerHTML = `
      <div class="screen">
        <div class="panel" style="width:380px">
          <h2>Host Game</h2>

          <div class="form-group">
            <label>Your Name</label>
            <input id="cs-name" type="text" placeholder="Enter nickname" maxlength="20" />
          </div>

          <div class="divider"></div>

          <button class="btn btn-primary" id="cs-btn">Create &amp; Join</button>
          <button class="btn btn-ghost" id="cs-back">← Back</button>

          <div class="error-msg" id="cs-err"></div>
        </div>
      </div>
    `;

    document.getElementById('cs-name').value = localStorage.getItem('mudhole_name') || '';
    document.getElementById('cs-back').onclick = () => showScreen('mainMenu');
    document.getElementById('cs-btn').onclick   = () => this._create();
    document.getElementById('cs-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._create();
    });
  }

  async _create() {
    const name = document.getElementById('cs-name').value.trim();
    const err  = document.getElementById('cs-err');
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
