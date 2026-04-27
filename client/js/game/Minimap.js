const MM_W    = 210;
const MM_H    = 70;
const WORLD_W = 3840;
const WORLD_H = 800;
const SX      = MM_W / WORLD_W;
const SY      = MM_H / WORLD_H;
const WATER_Y = Math.round(740 * SY);

export default class Minimap {
  constructor() {
    this._canvas = document.createElement('canvas');
    this._canvas.width  = MM_W;
    this._canvas.height = MM_H;
    Object.assign(this._canvas.style, {
      position:      'fixed',
      bottom:        '16px',
      left:          '16px',
      width:         MM_W + 'px',
      height:        MM_H + 'px',
      borderRadius:  '7px',
      border:        '1px solid rgba(255,255,255,0.18)',
      boxShadow:     '0 2px 12px rgba(0,0,0,0.6)',
      zIndex:        '18',
      pointerEvents: 'none',
      imageRendering: 'pixelated',
    });
    document.body.appendChild(this._canvas);
    this._ctx          = this._canvas.getContext('2d');
    this._terrainCache = null;
    this._dirty        = true;
    this._mask         = null;
  }

  destroy() {
    if (this._canvas) { this._canvas.remove(); this._canvas = null; }
  }

  setTerrain(mask) {
    this._mask  = mask;
    this._dirty = true;
  }

  markDirty() { this._dirty = true; }

  render(renderer, worms, currentId) {
    const ctx = this._ctx;
    if (!ctx) return;

    // Rebuild terrain cache when mask changes
    if (this._dirty && this._mask) {
      this._buildCache();
      this._dirty = false;
    }

    ctx.clearRect(0, 0, MM_W, MM_H);

    // Sky background
    ctx.fillStyle = 'rgba(12,22,45,0.92)';
    ctx.fillRect(0, 0, MM_W, MM_H);

    // Terrain
    if (this._terrainCache) ctx.drawImage(this._terrainCache, 0, 0);

    // Water
    ctx.fillStyle = 'rgba(20,70,180,0.45)';
    ctx.fillRect(0, WATER_Y, MM_W, MM_H - WATER_Y);

    // Camera viewport
    const vx = Math.round(renderer.camX * SX);
    const vy = Math.round(renderer.camY * SY);
    const vw = Math.max(4, Math.round(renderer.gameCanvas.width  * SX));
    const vh = Math.max(4, Math.round(renderer.gameCanvas.height * SY));
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(vx, vy, vw, vh);
    // Dim area outside viewport
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    // left strip
    if (vx > 0) ctx.fillRect(0, 0, vx, MM_H);
    // right strip
    if (vx + vw < MM_W) ctx.fillRect(vx + vw, 0, MM_W - (vx + vw), MM_H);

    // Worm dots
    Object.values(worms).forEach(w => {
      if (!w.alive) return;
      const mx = Math.round(w.x * SX);
      const my = Math.round(w.y * SY);
      const active = w.id === currentId;
      const r = active ? 3.5 : 2.5;

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(mx + 0.5, my + 0.5, r, 0, Math.PI * 2); ctx.fill();

      // Dot
      ctx.fillStyle   = w.team === 'A' ? '#4a9eff' : '#ff4a4a';
      ctx.strokeStyle = active ? '#fff' : 'rgba(0,0,0,0.6)';
      ctx.lineWidth   = active ? 1.5 : 0.8;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Crown for active worm
      if (active) {
        ctx.fillStyle = '#ffd700';
        ctx.font      = '7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('♛', mx, my - r - 2);
        ctx.textAlign = 'left';
      }
    });

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0.5, 0.5, MM_W - 1, MM_H - 1);
  }

  _buildCache() {
    const oc  = new OffscreenCanvas(MM_W, MM_H);
    const ctx = oc.getContext('2d');
    const img = ctx.createImageData(MM_W, MM_H);
    const d   = img.data;
    const mask = this._mask;

    for (let my = 0; my < MM_H; my++) {
      const wy = Math.min(WORLD_H - 1, Math.floor(my / SY));
      for (let mx = 0; mx < MM_W; mx++) {
        const wx = Math.min(WORLD_W - 1, Math.floor(mx / SX));
        if (mask[wy * WORLD_W + wx] !== 1) continue;

        const i     = (my * MM_W + mx) * 4;
        const depth = my / MM_H;

        if (depth < 0.12) {
          // Grass
          d[i] = 60; d[i+1] = 160; d[i+2] = 45; d[i+3] = 255;
        } else if (depth < 0.45) {
          // Topsoil
          const t = (depth - 0.12) / 0.33;
          d[i]   = Math.round(110 - t * 30);
          d[i+1] = Math.round(75  - t * 15);
          d[i+2] = Math.round(35  - t * 5);
          d[i+3] = 255;
        } else {
          // Rock
          const t = Math.min(1, (depth - 0.45) / 0.55);
          d[i]   = Math.round(80 + t * 10);
          d[i+1] = Math.round(65 + t * 5);
          d[i+2] = Math.round(55 + t * 5);
          d[i+3] = 255;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    this._terrainCache = oc;
  }
}
