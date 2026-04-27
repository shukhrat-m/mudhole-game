import { showScreen, net } from '../main.js';

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

          <div class="form-group">
            <label>Server Address</label>
            <input id="js-addr" type="text" placeholder="localhost:3000 or ngrok URL" />
          </div>

          <div class="divider"></div>

          <button class="btn btn-primary" id="js-btn">Connect</button>
          <button class="btn btn-ghost" id="js-back">← Back</button>

          <div class="error-msg" id="js-err"></div>
        </div>
      </div>
    `;

    const savedName = localStorage.getItem('mudhole_name') || '';
    const savedAddr = localStorage.getItem('mudhole_addr') || 'localhost:3000';
    document.getElementById('js-name').value = savedName;
    document.getElementById('js-addr').value = savedAddr;

    document.getElementById('js-back').onclick = () => showScreen('mainMenu');
    document.getElementById('js-btn').onclick   = () => this._join();

    ['js-name', 'js-addr'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') this._join();
      });
    });
  }

  async _join() {
    const name = document.getElementById('js-name').value.trim();
    const addr = document.getElementById('js-addr').value.trim();
    const err  = document.getElementById('js-err');

    if (!name) { err.textContent = 'Enter a name'; return; }
    if (!addr) { err.textContent = 'Enter server address'; return; }

    // Построить WS URL
    let wsUrl;
    if (addr.startsWith('wss://') || addr.startsWith('ws://')) {
      wsUrl = addr;
    } else if (addr.startsWith('https://')) {
      wsUrl = addr.replace('https://', 'wss://');
    } else if (addr.startsWith('http://')) {
      wsUrl = addr.replace('http://', 'ws://');
    } else {
      // host:port или просто host
      wsUrl = `ws://${addr}`;
    }

    err.textContent = 'Connecting...';
    localStorage.setItem('mudhole_name', name);
    localStorage.setItem('mudhole_addr', addr);

    try {
      const msg = await net.connect(wsUrl, name);
      showScreen('lobby', { initialData: msg });
    } catch (e) {
      err.textContent = e.message || 'Could not connect';
    }
  }

  destroy() {}
}
