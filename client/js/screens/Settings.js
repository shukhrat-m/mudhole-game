import { showScreen } from '../main.js';

export default class Settings {
  constructor(data) {
    this._from = data.from || 'mainMenu';
  }

  init(ui) {
    const vol  = parseFloat(localStorage.getItem('mudhole_vol')  || '0.7');
    const muted = localStorage.getItem('mudhole_muted') === 'true';

    ui.innerHTML = `
      <div class="screen">
        <div class="panel" style="width:380px">
          <h2>Settings</h2>

          <div class="form-group">
            <label>Volume</label>
            <input id="s-vol" type="range" min="0" max="1" step="0.05" value="${vol}"
              style="width:100%;accent-color:#ff6b35;margin-bottom:4px" />
            <div style="text-align:right;font-size:12px;color:rgba(255,255,255,0.4)" id="s-vol-val">
              ${Math.round(vol * 100)}%
            </div>
          </div>

          <div class="form-group">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input id="s-muted" type="checkbox" ${muted ? 'checked' : ''}
                style="width:16px;height:16px;accent-color:#ff6b35" />
              Mute Sound
            </label>
          </div>

          <div class="divider"></div>

          <div class="form-group">
            <label>Controls</label>
            <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8">
              ← → — move<br>
              ↑ — jump<br>
              Mouse — aim<br>
              LMB — fire<br>
              1-6 — weapon<br>
              Tab — end turn
            </div>
          </div>

          <div class="divider"></div>

          <button class="btn btn-primary" id="s-save">Save</button>
          <button class="btn btn-ghost" id="s-back">← Back</button>
        </div>
      </div>
    `;

    document.getElementById('s-vol').addEventListener('input', e => {
      document.getElementById('s-vol-val').textContent = Math.round(e.target.value * 100) + '%';
    });

    document.getElementById('s-save').onclick = () => {
      const v = document.getElementById('s-vol').value;
      const m = document.getElementById('s-muted').checked;
      localStorage.setItem('mudhole_vol',   v);
      localStorage.setItem('mudhole_muted', m);
      showScreen(this._from);
    };

    document.getElementById('s-back').onclick = () => showScreen(this._from);
  }

  destroy() {}
}
