const W_FULL = 3840;
const H_FULL = 800;

export default class Renderer {
  constructor() {
    this.bgCanvas      = document.getElementById('canvas-bg');
    this.terrainCanvas = document.getElementById('canvas-terrain');
    this.gameCanvas    = document.getElementById('canvas-game');
    this.fxCanvas      = document.getElementById('canvas-effects');
    this.uiGameCanvas  = document.getElementById('canvas-ui-game');

    this.bgCtx      = this.bgCanvas.getContext('2d');
    this.terrainCtx = this.terrainCanvas.getContext('2d');
    this.gameCtx    = this.gameCanvas.getContext('2d');
    this.fxCtx      = this.fxCanvas.getContext('2d');
    this.uiGameCtx  = this.uiGameCanvas.getContext('2d');

    // Camera
    this.camX  = 0;
    this.camY  = 0;
    this.zoom  = 1;
    this.shake = { x: 0, y: 0, intensity: 0 };

    // Terrain offscreen
    this.terrainOffscreen = null;
    this.mask = null;
    this.mapType = 'grassland';

    // Облака для параллакса
    this._clouds = this._genClouds();
    this._bgDrawn = false;
  }

  // ─── Terrain ─────────────────────────────────────────────────────────────

  loadTerrain(rleString, mapType, width, height) {
    this.mapType = mapType;
    this.mask = this._rleDecode(rleString, width * height);

    this.terrainOffscreen = new OffscreenCanvas(width, height);
    const ctx = this.terrainOffscreen.getContext('2d');
    this._paintTerrain(ctx, this.mask, width, height, mapType);
    this._bgDrawn = false;
  }

  applyTerrainUpdate(update) {
    const { x0, y0, w, h, rle } = update;
    const region = this._rleDecode(rle, w * h);
    const W = W_FULL;

    // Обновить mask
    for (let ry = 0; ry < h; ry++) {
      for (let rx = 0; rx < w; rx++) {
        const mx = x0 + rx, my = y0 + ry;
        if (mx >= 0 && mx < W && my >= 0 && my < H_FULL) {
          this.mask[my * W + mx] = region[ry * w + rx];
        }
      }
    }

    // Перерисовать регион на offscreen
    const ctx = this.terrainOffscreen.getContext('2d');
    this._paintTerrainRegion(ctx, x0, y0, w + 2, h + 2);
    this._bgDrawn = false;
  }

  _paintTerrain(ctx, mask, W, H, mapType) {
    const surfY  = this._computeSurfaceY(0, W, mask, W, H);
    const imgData = ctx.createImageData(W, H);
    const d       = imgData.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (mask[y * W + x] !== 1) continue;
        const rgb = this._terrainPixel(x, y, surfY[x], mapType);
        if (!rgb) continue;
        const i = (y * W + x) * 4;
        d[i] = rgb[0]; d[i+1] = rgb[1]; d[i+2] = rgb[2]; d[i+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  _paintTerrainRegion(ctx, rx, ry, rw, rh) {
    const W  = W_FULL;
    const x0 = Math.max(0, rx),      y0 = Math.max(0, ry);
    const x1 = Math.min(W_FULL - 1, rx + rw), y1 = Math.min(H_FULL - 1, ry + rh);

    // Recompute surfaceY for affected columns (must scan full height)
    const surfY = this._computeSurfaceY(x0, x1 + 1, this.mask, W, H_FULL);

    const imgData = ctx.createImageData(x1 - x0 + 1, y1 - y0 + 1);
    const d = imgData.data;
    let i = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.mask[y * W + x] === 1) {
          const rgb = this._terrainPixel(x, y, surfY[x - x0], this.mapType);
          if (rgb) { d[i] = rgb[0]; d[i+1] = rgb[1]; d[i+2] = rgb[2]; d[i+3] = 255; }
          else     { d[i+3] = 0; }
        } else {
          d[i+3] = 0;
        }
        i += 4;
      }
    }
    ctx.putImageData(imgData, x0, y0);
  }

  // ─── Terrain pixel helpers ───────────────────────────────────────────────

  _computeSurfaceY(x0, x1, mask, W, H) {
    const len   = x1 - x0;
    const surfY = new Int32Array(len);
    for (let xi = 0; xi < len; xi++) {
      const col = x0 + xi;
      surfY[xi]  = H - 1;
      for (let y = 0; y < H; y++) {
        if (mask[y * W + col] === 1) { surfY[xi] = y; break; }
      }
    }
    return surfY;
  }

  _nz(x, y) {
    let h = Math.imul(x * 1619, y * 31337 + 1) ^ Math.imul(y, 0x9e3779b9);
    h ^= h >>> 17;
    h  = Math.imul(h, 0xbf324c81);
    h ^= h >>> 13;
    return ((h >>> 0) & 0xffff) / 65535;
  }

  _terrainPixel(x, y, sy, mapType) {
    const d = y - sy;
    if (d < 0) return null;
    const n = this._nz(x, y);
    switch (mapType) {
      case 'cave':       return this._cavePx(d, n);
      case 'hell':       return this._hellPx(d, n);
      case 'snowfield':  return this._snowPx(d, n);
      case 'island':     return this._islandPx(d, n);
      case 'industrial': return this._industrialPx(d, n);
      default:           return this._grassPx(d, n);
    }
  }

  _grassPx(d, n) {
    const ni = Math.round(n * 18);
    if (d === 0) return [52 + ni, 165 + Math.round(n * 16), 30 + Math.round(n * 8)];
    if (d <= 2) {
      const t = d / 2;
      return [Math.round(52 + ni + t * (108 - 52)), Math.round(165 + t * (78 - 165)), Math.round(30 + t * (42 - 30))];
    }
    if (d <= 18) {
      const t = (d - 2) / 16;
      return [Math.round(108 - t * 22 + ni), Math.round(78 - t * 15 + Math.round(n * 8)), Math.round(42 - t * 9 + Math.round(n * 4))];
    }
    if (d <= 55) {
      const t = (d - 18) / 37;
      return [Math.round(86 - t * 12 + ni), Math.round(63 - t * 12 + Math.round(n * 8)), Math.round(33 - t * 7 + Math.round(n * 3))];
    }
    // Rock layer
    const t = Math.min(1, (d - 55) / 65);
    return [Math.round(68 + t * 24 + ni), Math.round(58 + t * 20 + Math.round(n * 14)), Math.round(50 + t * 16 + Math.round(n * 12))];
  }

  _cavePx(d, n) {
    const ni = Math.round(n * 22);
    if (d === 0) return [130 + ni, 130 + ni, 130 + ni];
    if (d <= 4)  return [85 + ni, 85 + ni, 82 + ni];
    return [Math.max(28, 60 - d + ni), Math.max(25, 55 - d + ni), Math.max(22, 50 - d + ni)];
  }

  _hellPx(d, n) {
    const ni = Math.round(n * 16);
    if (d === 0) return [230 + Math.round(n * 10), 80 + ni, 20];
    if (d <= 4)  return [165 + ni, 38 + ni, 10];
    const t = Math.min(1, (d - 4) / 80);
    return [Math.round(125 + t * 22 + ni), Math.round(14 + t * 6), 5];
  }

  _snowPx(d, n) {
    const ni = Math.round(n * 20);
    if (d === 0) return [225 + Math.round(n * 10), 240 + Math.round(n * 8), 255];
    if (d <= 3)  return [185 + ni, 205 + ni, 235];
    const t = Math.min(1, (d - 3) / 45);
    return [Math.round(135 + t * 32 + ni), Math.round(155 + t * 22 + ni), Math.round(185 + t * 22 + ni)];
  }

  _islandPx(d, n) {
    const ni = Math.round(n * 16);
    if (d === 0) return [225 + ni, 205 + ni, 125 + Math.round(n * 10)];
    if (d <= 3)  return [195 + ni, 165 + ni, 92];
    const t = Math.min(1, (d - 3) / 55);
    return [Math.round(145 + t * 22 + ni), Math.round(115 + t * 16 + ni), Math.round(62 + t * 10)];
  }

  _industrialPx(d, n) {
    const ni = Math.round(n * 14);
    if (d === 0) return [105 + ni, 105 + ni, 82 + ni];
    const t = Math.min(1, d / 65);
    return [Math.round(62 + t * 16 + ni), Math.round(62 + t * 10 + ni), Math.round(52 + t * 8 + ni)];
  }

  // kept for backwards compat with any external callers
  _mapColors(type) {
    const map = {
      grassland:  { top: [80,140,50],  deep: [60,40,20] },
      cave:       { top: [60,60,60],   deep: [30,30,30] },
      island:     { top: [200,160,80], deep: [100,70,30] },
      industrial: { top: [80,80,70],   deep: [40,40,35] },
      hell:       { top: [160,40,20],  deep: [80,10,5]  },
      snowfield:  { top: [200,220,255],deep: [120,150,200] },
    };
    return map[type] || map.grassland;
  }

  _lerpColor(a, b, t) {
    return [
      Math.round(a[0] + (b[0]-a[0])*t),
      Math.round(a[1] + (b[1]-a[1])*t),
      Math.round(a[2] + (b[2]-a[2])*t),
    ];
  }

  // ─── Background ──────────────────────────────────────────────────────────

  drawBackground(dt) {
    const W = this.bgCanvas.width, H = this.bgCanvas.height;
    const ctx = this.bgCtx;

    ctx.clearRect(0, 0, W, H);

    // Небо
    const skyColors = {
      grassland:  ['#1a2a4a','#3a5a8a'],
      cave:       ['#0a0a0a','#1a1a2a'],
      island:     ['#1a3a6a','#4a8aaa'],
      industrial: ['#1a1a2a','#2a2a3a'],
      hell:       ['#3a0a0a','#6a1a1a'],
      snowfield:  ['#1a2a3a','#3a5a7a'],
    };
    const [sky1, sky2] = skyColors[this.mapType] || skyColors.grassland;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, sky1);
    grad.addColorStop(1, sky2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Параллакс горы/холмы на фоне
    this._drawBgHills(ctx, W, H);

    // Облака
    this._clouds.forEach(c => {
      c.x -= c.speed * (dt || 1);
      if (c.x + c.w < -this.camX) c.x = W - this.camX + 50;

      const sx = (c.x - this.camX * 0.3) % (W + 200) - 100;
      this._drawCloud(ctx, sx, c.y, c.w, c.h, c.alpha);
    });

    // Вода
    if (this.mapType !== 'cave') {
      this._drawWater(ctx, W, H);
    }
  }

  _drawBgHills(ctx, W, H) {
    const colors = {
      grassland:  'rgba(30,60,30,0.4)',
      hell:       'rgba(60,10,10,0.4)',
      snowfield:  'rgba(60,80,120,0.3)',
      island:     'rgba(20,60,80,0.3)',
      industrial: 'rgba(30,30,20,0.4)',
      cave:       'rgba(10,10,10,0)',
    };
    ctx.fillStyle = colors[this.mapType] || colors.grassland;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const pts = 8;
    for (let i = 0; i <= pts; i++) {
      const x = (i / pts) * (W + 200) - 100;
      const y = H * 0.55 + Math.sin(i * 0.9 + 1) * 60;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  _drawWater(ctx, W, H) {
    const waterY = H * 0.92;
    const wGrad = ctx.createLinearGradient(0, waterY, 0, H);
    wGrad.addColorStop(0, 'rgba(20,80,180,0.7)');
    wGrad.addColorStop(1, 'rgba(10,40,120,0.9)');
    ctx.fillStyle = wGrad;
    ctx.beginPath();
    ctx.moveTo(0, waterY);
    const t = Date.now() * 0.001;
    for (let x = 0; x <= W; x += 8) {
      ctx.lineTo(x, waterY + Math.sin(x * 0.03 + t) * 3);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  _drawCloud(ctx, x, y, w, h, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    const blobs = [
      [x + w*0.2, y + h*0.5, w*0.25],
      [x + w*0.5, y + h*0.3, w*0.32],
      [x + w*0.78,y + h*0.5, w*0.22],
      [x + w*0.5, y + h*0.6, w*0.28],
    ];
    blobs.forEach(([bx, by, br]) => {
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  _genClouds() {
    const clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x: Math.random() * 2000,
        y: 30 + Math.random() * 150,
        w: 80 + Math.random() * 120,
        h: 40 + Math.random() * 40,
        speed: 0.1 + Math.random() * 0.2,
        alpha: 0.15 + Math.random() * 0.25,
      });
    }
    return clouds;
  }

  // ─── Рисовать terrain поверх экрана ──────────────────────────────────────

  drawTerrain() {
    if (!this.terrainOffscreen) return;
    const ctx = this.terrainCtx;
    const W = this.terrainCanvas.width, H = this.terrainCanvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    this._applyCamera(ctx);
    ctx.drawImage(this.terrainOffscreen, 0, 0);
    ctx.restore();
  }

  // ─── Camera ──────────────────────────────────────────────────────────────

  followTarget(tx, ty) {
    const W = this.gameCanvas.width, H = this.gameCanvas.height;
    const targetCamX = tx * this.zoom - W / 2;
    const targetCamY = ty * this.zoom - H / 2;
    this.camX += (targetCamX - this.camX) * 0.08;
    this.camY += (targetCamY - this.camY) * 0.08;
    this.camX = Math.max(0, Math.min(W_FULL * this.zoom - W, this.camX));
    this.camY = Math.max(0, Math.min(H_FULL * this.zoom - H, this.camY));
  }

  snapTo(tx, ty) {
    const W = this.gameCanvas.width, H = this.gameCanvas.height;
    this.camX = Math.max(0, Math.min(W_FULL * this.zoom - W, tx * this.zoom - W / 2));
    this.camY = Math.max(0, Math.min(H_FULL * this.zoom - H, ty * this.zoom - H / 2));
  }

  triggerShake(intensity) {
    this.shake.intensity = Math.min(20, this.shake.intensity + intensity);
  }

  _applyCamera(ctx) {
    this.shake.x = (Math.random() - 0.5) * this.shake.intensity;
    this.shake.y = (Math.random() - 0.5) * this.shake.intensity;
    this.shake.intensity *= 0.85;

    ctx.setTransform(
      this.zoom, 0, 0, this.zoom,
      -(this.camX + this.shake.x),
      -(this.camY + this.shake.y)
    );
  }

  applyCamera(ctx) { this._applyCamera(ctx); }

  resetTransform(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  clearGame() {
    this.gameCtx.clearRect(0, 0, this.gameCanvas.width, this.gameCanvas.height);
  }

  clearFx() {
    this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
  }

  clearUiGame() {
    this.uiGameCtx.clearRect(0, 0, this.uiGameCanvas.width, this.uiGameCanvas.height);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _rleDecode(rle, expectedLen) {
    const arr = new Uint8Array(expectedLen);
    const parts = rle.split(',');
    let pos = 0;
    for (let i = 0; i < parts.length - 1; i += 2) {
      const count = +parts[i];
      const val   = +parts[i+1];
      for (let j = 0; j < count && pos < expectedLen; j++) arr[pos++] = val;
    }
    return arr;
  }

  // Конвертировать экранные координаты → мировые
  screenToWorld(sx, sy) {
    return {
      x: (sx + this.camX) / this.zoom,
      y: (sy + this.camY) / this.zoom,
    };
  }

  getTerrainSurfaceY(x) {
    const ix = Math.max(0, Math.min(W_FULL - 1, Math.floor(x)));
    if (!this.mask) return Math.round(H_FULL * 0.75);
    for (let y = 0; y < H_FULL; y++) {
      if (this.mask[y * W_FULL + ix] === 1) return y;
    }
    return H_FULL - 1;
  }
}
