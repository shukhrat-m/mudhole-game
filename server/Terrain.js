const cfg = require('./config');

const W = cfg.TERRAIN_WIDTH;
const H = cfg.TERRAIN_HEIGHT;

class Terrain {
  constructor(mapType = 'grassland') {
    this.width = W;
    this.height = H;
    this.mapType = mapType;
    this.mask = new Uint8Array(W * H); // 1=земля, 0=воздух
    this.waterLevel = cfg.WATER_LEVEL;
    this._generate(mapType);
  }

  // ─── Генераторы карт ────────────────────────────────────────────────────

  _generate(type) {
    switch (type) {
      case 'cave':       this._genCave(); break;
      case 'island':     this._genIsland(); break;
      case 'industrial': this._genIndustrial(); break;
      case 'hell':       this._genHell(); break;
      case 'snowfield':  this._genSnowfield(); break;
      default:           this._genGrassland();
    }
  }

  // Базовый алгоритм: сумма синусоид → высота в каждой точке X
  _heightMap(seed) {
    const heights = new Float32Array(W);
    const rng = this._seededRng(seed);
    const waves = [
      { amp: 80, freq: 2 },
      { amp: 40, freq: 5 },
      { amp: 20, freq: 11 },
      { amp: 10, freq: 23 },
    ];
    const phases = waves.map(() => rng() * Math.PI * 2);

    for (let x = 0; x < W; x++) {
      let h = H * 0.55; // базовая высота
      waves.forEach((w, i) => {
        h += Math.sin((x / W) * Math.PI * 2 * w.freq + phases[i]) * w.amp;
      });
      heights[x] = Math.round(h);
    }
    return heights;
  }

  _fillBelow(heights, minY = 0) {
    for (let x = 0; x < W; x++) {
      const top = Math.max(minY, Math.min(H - 1, heights[x]));
      for (let y = top; y < H; y++) {
        this.mask[y * W + x] = 1;
      }
    }
  }

  _genGrassland() {
    const rng = this._seededRng(1337);
    const heights = new Float32Array(W);

    // Pre-generate phases so the loop stays deterministic
    const p = Array.from({ length: 8 }, () => rng() * Math.PI * 2);

    for (let x = 0; x < W; x++) {
      const t = x / W;
      let h = H * 0.52;
      // Mountains (1-3 peaks across the full map)
      h += Math.sin(t * Math.PI * 2 * 1.7 + p[0]) * 140;
      h += Math.sin(t * Math.PI * 2 * 2.9 + p[1]) * 90;
      // Hills
      h += Math.sin(t * Math.PI * 2 * 5.3 + p[2]) * 50;
      h += Math.sin(t * Math.PI * 2 * 8.7 + p[3]) * 28;
      // Surface detail
      h += Math.sin(t * Math.PI * 2 * 15.1 + p[4]) * 14;
      h += Math.sin(t * Math.PI * 2 * 27.3 + p[5]) * 7;
      heights[x] = Math.round(Math.max(80, Math.min(this.waterLevel - 80, h)));
    }
    this._fillBelow(heights);
  }

  _genSnowfield() {
    // Пологий рельеф
    const rng = this._seededRng(9999);
    const heights = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      heights[x] = H * 0.6 + Math.sin((x / W) * Math.PI * 4) * 30 + rng() * 15;
    }
    this._fillBelow(heights);
  }

  _genIsland() {
    const h = this._heightMap(4242);
    // Поднять края (вода по бокам)
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, W - 1 - x);
      const lift = Math.max(0, 200 - edge * 2);
      h[x] = Math.min(H - 1, h[x] + lift);
    }
    this._fillBelow(h);
  }

  _genCave() {
    // Пол и потолок, туннели через маску
    const rng = this._seededRng(5555);
    // Заполнить всё
    this.mask.fill(1);
    // Вырезать главный туннель по центру
    const midY = H * 0.5;
    for (let x = 0; x < W; x++) {
      const tunnelH = 120 + Math.sin((x / W) * Math.PI * 6) * 40 + rng() * 30;
      const top = midY - tunnelH / 2;
      const bot = midY + tunnelH / 2;
      for (let y = top; y < bot; y++) {
        if (y >= 0 && y < H) this.mask[Math.floor(y) * W + x] = 0;
      }
    }
    // Дополнительные боковые карманы
    for (let i = 0; i < 5; i++) {
      const cx = Math.floor(rng() * (W - 200) + 100);
      const cy = Math.floor(rng() * (H * 0.3) + H * 0.1);
      this.carveCircle(cx, cy, 60 + rng() * 40);
    }
    // Вода снизу
    for (let x = 0; x < W; x++) {
      for (let y = this.waterLevel; y < H; y++) {
        this.mask[y * W + x] = 1;
      }
    }
  }

  _genIndustrial() {
    // Плоское дно + прямоугольные платформы
    const baseY = H * 0.75;
    for (let x = 0; x < W; x++) {
      for (let y = baseY; y < H; y++) {
        this.mask[Math.floor(y) * W + x] = 1;
      }
    }
    // Платформы
    const platforms = [
      { x: 100, y: 550, w: 200, h: 30 },
      { x: 400, y: 480, w: 150, h: 30 },
      { x: 700, y: 520, w: 250, h: 30 },
      { x: 1050, y: 450, w: 180, h: 30 },
      { x: 1300, y: 500, w: 200, h: 30 },
      { x: 1600, y: 460, w: 160, h: 30 },
      { x: 250, y: 380, w: 120, h: 25 },
      { x: 900, y: 350, w: 200, h: 25 },
      { x: 1450, y: 360, w: 140, h: 25 },
    ];
    platforms.forEach(p => {
      for (let x = p.x; x < p.x + p.w; x++) {
        for (let y = p.y; y < p.y + p.h; y++) {
          if (x < W && y < H) this.mask[y * W + x] = 1;
        }
      }
    });
  }

  _genHell() {
    const rng = this._seededRng(6666);
    const heights = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      // Зазубренный рельеф
      heights[x] = H * 0.55 + Math.sin((x / W) * Math.PI * 8) * 60
        + Math.sin((x / W) * Math.PI * 17) * 25 + rng() * 20;
    }
    this._fillBelow(heights);
    // Лавовые ямы — вырезать снизу
    for (let i = 0; i < 4; i++) {
      const cx = Math.floor(rng() * (W - 200) + 100);
      this.carveCircle(cx, H - 30, 40 + rng() * 30);
    }
  }

  // ─── Методы работы с terrain ────────────────────────────────────────────

  isBlocked(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) return false;
    return this.mask[iy * W + ix] === 1;
  }

  getHeightAt(x) {
    const ix = Math.max(0, Math.min(W - 1, Math.floor(x)));
    for (let y = 0; y < H; y++) {
      if (this.mask[y * W + ix] === 1) return y;
    }
    return H - 1;
  }

  carveCircle(cx, cy, radius) {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(W - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(H - 1, Math.ceil(cy + radius));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
          this.mask[y * W + x] = 0;
        }
      }
    }
  }

  // ─── RLE сериализация ───────────────────────────────────────────────────

  serialize() {
    return this._rleEncode(this.mask);
  }

  serializeRegion(rx, ry, rw, rh) {
    const x0 = Math.max(0, Math.floor(rx));
    const y0 = Math.max(0, Math.floor(ry));
    const x1 = Math.min(W - 1, Math.ceil(rx + rw));
    const y1 = Math.min(H - 1, Math.ceil(ry + rh));
    const region = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        region.push(this.mask[y * W + x]);
      }
    }
    return {
      x0, y0,
      w: x1 - x0 + 1,
      h: y1 - y0 + 1,
      rle: this._rleEncode(region),
    };
  }

  _rleEncode(data) {
    if (!data.length) return '';
    const parts = [];
    let count = 1;
    let cur = data[0];
    for (let i = 1; i < data.length; i++) {
      if (data[i] === cur && count < 65535) {
        count++;
      } else {
        parts.push(count, cur);
        cur = data[i];
        count = 1;
      }
    }
    parts.push(count, cur);
    return parts.join(',');
  }

  // ─── Утилиты ────────────────────────────────────────────────────────────

  _seededRng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }
}

module.exports = Terrain;
