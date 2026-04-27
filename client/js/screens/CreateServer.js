import { showScreen, net } from '../main.js';

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

          <div class="form-group">
            <label>Port</label>
            <input id="cs-port" type="number" value="3000" min="1024" max="65535" />
          </div>

          <div class="form-group">
            <label>Max Players</label>
            <input id="cs-max" type="number" value="15" min="2" max="15" />
          </div>

          <div class="divider"></div>

          <button class="btn btn-primary" id="cs-btn">Create &amp; Join</button>
          <button class="btn btn-ghost" id="cs-back">← Back</button>

          <div class="error-msg" id="cs-err"></div>
        </div>
      </div>
    `;

    // Сохранить последний ник
    const savedName = localStorage.getItem('mudhole_name') || '';
    document.getElementById('cs-name').value = savedName;

    document.getElementById('cs-back').onclick = () => showScreen('mainMenu');
    document.getElementById('cs-btn').onclick   = () => this._create();

    document.getElementById('cs-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._create();
    });
  }

  async _create() {
    const name = document.getElementById('cs-name').value.trim();
    const port = document.getElementById('cs-port').value;
    const err  = document.getElementById('cs-err');

    if (!name) { err.textContent = 'Enter a name'; return; }

    err.textContent = 'Connecting...';
    localStorage.setItem('mudhole_name', name);

    try {
      const msg = await net.connect(`ws://localhost:${port}`, name);
      showScreen('lobby', { initialData: msg });
    } catch (e) {
      err.textContent = e.message || 'Could not connect. Is the server running?';
    }
  }

  destroy() {}
}
