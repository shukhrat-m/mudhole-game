const PAL = {
  A: { fill: '#4a9eff', light: '#9ad4ff', dark: '#1a5abf', outline: '#0a2060' },
  B: { fill: '#ff4a4a', light: '#ff9a9a', dark: '#bf1a1a', outline: '#600a0a' },
};

export default class WormRenderer {
  constructor() {
    this._t      = 0;
    this._facing = new Map(); // worm.id → facingRight
  }

  tick() { this._t++; }

  draw(ctx, worm, isActive, aimAngle) {
    if (!worm.alive) { this._drawTombstone(ctx, worm.x, worm.y); return; }

    const pal = PAL[worm.team] || PAL.A;
    const t   = this._t;

    // Update facing from aim angle
    if (aimAngle !== undefined) this._facing.set(worm.id, Math.cos(aimAngle) >= 0);
    const fr = this._facing.get(worm.id) ?? true; // facingRight

    // Jump / land squash-stretch
    let scaleX = 1, scaleY = 1;
    if      (worm.anim === 'jump') { scaleX = 0.80; scaleY = 1.22; }
    else if (worm.anim === 'land') { scaleX = 1.28; scaleY = 0.80; }

    // Walk body wobble
    const wb = worm.anim === 'walk' ? Math.sin(t * 0.3) * 1.8 : 0;

    ctx.save();
    ctx.translate(worm.x, worm.y);
    if (scaleX !== 1) ctx.scale(scaleX, scaleY);

    // Hurt flash: blink on/off
    if (worm.hurtFlash > 0) ctx.globalAlpha = worm.hurtFlash % 4 < 2 ? 1 : 0.3;

    // Mirror entire worm for facing direction
    ctx.scale(fr ? 1 : -1, 1);

    // ── Body segments (tail first so shoulders render on top) ──
    this._oval(ctx, pal,  0,           2,   7,   5.5); // tail
    this._oval(ctx, pal,  wb * -0.35, -6,   9,   7.5); // middle
    this._oval(ctx, pal,  wb * -0.15, -14,  10,  9.0); // shoulders

    // ── Head ──
    this._head(ctx, pal, aimAngle, fr, worm.hp / worm.maxHp);

    // ── Hat ──
    this._hat(ctx, worm.team);

    // ── Weapon ──
    if (isActive && aimAngle !== undefined) {
      this._weapon(ctx, worm.weapon || 'grenade', aimAngle, fr);
    }

    ctx.restore();

    // HP bar + name rendered in world space (after all transforms)
    this._hpBar(ctx, worm);
  }

  // ── Oval body segment with gradient fill + outline ──────────────────────
  _oval(ctx, pal, dx, dy, rx, ry) {
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.ellipse(dx, dy, rx + 1.5, ry + 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    const g = ctx.createRadialGradient(dx - rx * 0.35, dy - ry * 0.35, 0, dx, dy, Math.max(rx, ry));
    g.addColorStop(0,    pal.light);
    g.addColorStop(0.45, pal.fill);
    g.addColorStop(1,    pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Head ─────────────────────────────────────────────────────────────────
  _head(ctx, pal, aimAngle, fr, hpRatio) {
    const hx = 3, hy = -25, rx = 12, ry = 11;

    // Outline
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.ellipse(hx, hy, rx + 1.5, ry + 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Gradient fill
    const g = ctx.createRadialGradient(hx - 4, hy - 3, 0, hx, hy, rx * 1.1);
    g.addColorStop(0,   pal.light);
    g.addColorStop(0.4, pal.fill);
    g.addColorStop(1,   pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Two eyes ──
    const eyes = [{ x: 3, y: hy - 3, r: 4.2 }, { x: 9.5, y: hy - 3, r: 4.2 }];

    // Pupil offset tracks aim direction; clamped so pupils stay inside sclera
    let px = 0, py = 0;
    if (aimAngle !== undefined) {
      const clamp = 1.5;
      px = Math.max(-clamp, Math.min(clamp, Math.cos(aimAngle) * (fr ? 1 : -1) * 1.6));
      py = Math.max(-clamp, Math.min(clamp, Math.sin(aimAngle) * 1.2));
    }

    eyes.forEach(({ x: ex, y: ey, r: eyeR }) => {
      // Sclera
      ctx.fillStyle   = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Iris
      ctx.fillStyle = '#1a1a38';
      ctx.beginPath(); ctx.arc(ex + px, ey + py, eyeR * 0.56, 0, Math.PI * 2); ctx.fill();
      // Catchlight
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(ex + px - 1.3, ey + py - 1.3, 1.3, 0, Math.PI * 2); ctx.fill();
    });

    // ── Mouth ──
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    if (hpRatio > 0.5) {
      ctx.arc(hx, hy + 5, 4, 0.1 * Math.PI, 0.9 * Math.PI);    // smile
    } else {
      ctx.arc(hx, hy + 9, 4, -0.9 * Math.PI, -0.1 * Math.PI);  // grimace
    }
    ctx.stroke();
  }

  // ── Hat ──────────────────────────────────────────────────────────────────
  _hat(ctx, team) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth   = 1.5;
    if (team === 'A') {
      // Military helmet
      ctx.fillStyle = '#7a9a3a';
      ctx.beginPath(); ctx.ellipse(3, -37, 11, 5.5, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a7a1a';
      ctx.beginPath(); ctx.ellipse(3, -37, 13.5, 3.5, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    } else {
      // Red beret
      ctx.fillStyle = '#cc2222';
      ctx.beginPath(); ctx.ellipse(5, -36, 11, 6.5, 0.15, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#aa1111';
      ctx.beginPath(); ctx.arc(2, -38, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Weapon ───────────────────────────────────────────────────────────────
  _weapon(ctx, weapon, angle, fr) {
    ctx.save();
    // In mirrored space (fr=false), localAngle = π - angle maps world direction correctly
    ctx.rotate(fr ? angle : Math.PI - angle);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth   = 1.2;

    switch (weapon) {
      case 'grenade': {
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(18, -20, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#888';
        ctx.fillRect(17, -30, 3, 9);
        break;
      }
      case 'bazooka': {
        ctx.fillStyle = '#4a5a3a';
        this._rrect(ctx, 6, -26, 28, 7, 3.5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath(); ctx.arc(6, -22.5, 4, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'machinegun': {
        ctx.fillStyle = '#444';
        this._rrect(ctx, 5, -26, 24, 6, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#555';
        this._rrect(ctx, 8, -22, 12, 5, 2); ctx.fill();
        break;
      }
      case 'airstrike': {
        ctx.fillStyle = '#444';
        this._rrect(ctx, -8, -30, 16, 9, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5aaeee';
        ctx.beginPath(); ctx.arc(-3, -26, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc( 4, -26, 3.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'holy_grenade': {
        // Golden orb
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = 'rgba(160,120,0,0.7)';
        ctx.beginPath(); ctx.arc(18, -20, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Glow
        ctx.strokeStyle = 'rgba(255,255,100,0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(18, -20, 10, 0, Math.PI * 2); ctx.stroke();
        // Cross (lines — not text, so no mirroring issue)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.moveTo(18, -27); ctx.lineTo(18, -13); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(12, -22); ctx.lineTo(24, -22); ctx.stroke();
        break;
      }
      case 'mine': {
        ctx.fillStyle = '#666';
        this._rrect(ctx, 5, -29, 13, 10, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f44';
        ctx.beginPath(); ctx.arc(11, -24, 3.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // ── HP bar + name (world space, no transform) ─────────────────────────────
  _hpBar(ctx, worm) {
    const bw = 44, bh = 5;
    const bx = worm.x - bw / 2;
    const by = worm.y - 54;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this._rrect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 3); ctx.fill();

    const ratio    = Math.max(0, worm.hp / worm.maxHp);
    ctx.fillStyle  = ratio > 0.6 ? '#4aff88' : ratio > 0.3 ? '#ffb84a' : '#ff4a4a';
    this._rrect(ctx, bx, by, Math.max(0, bw * ratio), bh, 2); ctx.fill();

    ctx.fillStyle  = 'rgba(255,255,255,0.9)';
    ctx.font       = 'bold 11px Segoe UI';
    ctx.textAlign  = 'center';
    ctx.fillText(worm.name, worm.x, by - 4);
    ctx.textAlign  = 'left';
  }

  // ── Tombstone ─────────────────────────────────────────────────────────────
  _drawTombstone(ctx, x, y) {
    ctx.fillStyle   = '#6a6a7a';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - 20, 9, Math.PI, 0);
    ctx.lineTo(x + 9, y); ctx.lineTo(x - 9, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle  = 'rgba(255,255,255,0.55)';
    ctx.font       = 'bold 9px serif';
    ctx.textAlign  = 'center';
    ctx.fillText('RIP', x, y - 14);
    ctx.textAlign  = 'left';
  }

  // ── Rounded rect path ─────────────────────────────────────────────────────
  _rrect(ctx, x, y, w, h, r) {
    if (w <= 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
  }
}
