const TEAM_COLORS = { A: '#4a9eff', B: '#ff4a4a' };
const TEAM_COLORS_DARK = { A: '#2a6aaa', B: '#aa2a2a' };

export default class WormRenderer {
  constructor() {
    this._t = 0;
  }

  tick() { this._t++; }

  draw(ctx, worm, isActive, aimAngle) {
    if (!worm.alive) {
      this._drawTombstone(ctx, worm.x, worm.y);
      return;
    }

    const color     = TEAM_COLORS[worm.team]   || '#aaa';
    const darkColor = TEAM_COLORS_DARK[worm.team] || '#555';
    const t = this._t;

    // Squash & stretch
    let sx = 1, sy = 1;
    if (worm.anim === 'walk') {
      sx = 1 + Math.sin(t * 0.3) * 0.07;
      sy = 2 - sx;
    } else if (worm.anim === 'jump') {
      sy = 1.25; sx = 0.8;
    } else if (worm.anim === 'land') {
      sx = 1.35; sy = 0.75;
    } else {
      // Idle покачивание
      sy = 1 + Math.sin(t * 0.05) * 0.03;
    }

    ctx.save();
    ctx.translate(worm.x, worm.y);
    ctx.scale(sx, sy);

    // Hurt flash
    if (worm.hurtFlash > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(worm.hurtFlash * 0.8);
    }

    // Тело
    ctx.fillStyle = color;
    this._roundRect(ctx, -8, -20, 16, 22, 7);
    ctx.fill();

    // Тёмная полоска на теле
    ctx.fillStyle = darkColor;
    ctx.globalAlpha = 0.3;
    this._roundRect(ctx, -8, -20, 16, 22, 7);
    ctx.fill();
    ctx.globalAlpha = worm.hurtFlash > 0 ? (0.5 + 0.5*Math.sin(worm.hurtFlash*0.8)) : 1;

    // Голова
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -27, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Глаза
    const eyeOffX = isActive && aimAngle !== undefined
      ? Math.cos(aimAngle) * 3
      : 0;
    const eyeOffY = isActive && aimAngle !== undefined
      ? Math.sin(aimAngle) * 1.5
      : 0;

    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4, -28, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -28, 3.5, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(-4 + eyeOffX, -28 + eyeOffY, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + eyeOffX, -28 + eyeOffY, 2, 0, Math.PI*2); ctx.fill();

    // Бликованые зрачки
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(-3.5 + eyeOffX, -29 + eyeOffY, 0.7, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4.5 + eyeOffX, -29 + eyeOffY, 0.7, 0, Math.PI*2); ctx.fill();

    // Рот
    const hp = worm.hp / worm.maxHp;
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (hp > 0.5) {
      // Улыбка
      ctx.arc(0, -25.5, 4, 0.1*Math.PI, 0.9*Math.PI);
    } else {
      // Гримаса
      ctx.arc(0, -23.5, 4, -0.9*Math.PI, -0.1*Math.PI);
    }
    ctx.stroke();

    // Шляпа (A=каска, B=берет)
    this._drawHat(ctx, worm.team, color, darkColor);

    // Оружие
    if (isActive && aimAngle !== undefined) {
      this._drawWeapon(ctx, worm.weapon || 'grenade', aimAngle, worm.team);
    }

    ctx.restore();

    // HP бар и имя (без transform)
    this._drawHpBar(ctx, worm);
  }

  _drawHat(ctx, team, color, darkColor) {
    if (team === 'A') {
      // Военная каска
      ctx.fillStyle = '#8aaa44';
      ctx.beginPath();
      ctx.ellipse(0, -36, 10, 5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#6a8a24';
      ctx.fillRect(-12, -37, 24, 4);
      ctx.beginPath();
      ctx.ellipse(0, -37, 12, 3, 0, Math.PI, 0);
      ctx.fill();
    } else {
      // Красный берет
      ctx.fillStyle = '#cc2222';
      ctx.beginPath();
      ctx.ellipse(2, -35, 10, 6, 0.2, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#aa1111';
      ctx.beginPath();
      ctx.arc(0, -37, 3, 0, Math.PI*2);
      ctx.fill();
    }
  }

  _drawWeapon(ctx, weapon, angle, team) {
    ctx.save();
    ctx.rotate(angle);

    const dir = Math.cos(angle) < 0 ? -1 : 1;

    switch (weapon) {
      case 'grenade': {
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(14 * dir, -24, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillRect(13 * dir - 1, -34, 2, 8);
        break;
      }
      case 'bazooka': {
        ctx.fillStyle = '#445544';
        ctx.fillRect(4 * dir, -27, 22 * dir, 6);
        ctx.fillStyle = '#333';
        ctx.fillRect(24 * dir, -26, 4 * dir, 4);
        break;
      }
      case 'machinegun': {
        ctx.fillStyle = '#444';
        ctx.fillRect(4 * dir, -26, 18 * dir, 5);
        ctx.fillRect(8 * dir, -22, 8 * dir, 4);
        // Дульная вспышка (если стреляет)
        if (this._t % 3 < 1.5) {
          ctx.fillStyle = 'rgba(255,200,50,0.8)';
          ctx.beginPath(); ctx.arc(22 * dir, -24, 4, 0, Math.PI*2); ctx.fill();
        }
        break;
      }
      case 'airstrike': {
        // Бинокль
        ctx.fillStyle = '#555';
        ctx.fillRect(-6, -30, 12, 7);
        ctx.fillStyle = '#7af';
        ctx.beginPath(); ctx.arc(-3, -27, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -27, 3, 0, Math.PI*2); ctx.fill();
        break;
      }
      case 'holy_grenade': {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(14 * dir, -24, 6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '8px serif';
        ctx.fillText('✝', 11 * dir, -21);
        break;
      }
      case 'mine': {
        ctx.fillStyle = '#666';
        ctx.fillRect(4 * dir, -30, 10 * dir, 10);
        ctx.fillStyle = '#f44';
        ctx.beginPath(); ctx.arc(9 * dir, -25, 3, 0, Math.PI*2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  _drawHpBar(ctx, worm) {
    const bw = 40, bh = 5;
    const bx = worm.x - bw/2;
    const by = worm.y - 50;

    // Фон
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);

    // HP
    const hp = Math.max(0, worm.hp / worm.maxHp);
    const hpColor = hp > 0.6 ? '#4aff88' : hp > 0.3 ? '#ffb84a' : '#ff4a4a';
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, bw * hp, bh);

    // Имя
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(worm.name, worm.x, by - 4);
    ctx.textAlign = 'left';
  }

  _drawTombstone(ctx, x, y) {
    ctx.fillStyle = '#666';
    ctx.fillRect(x - 8, y - 20, 16, 20);
    ctx.beginPath();
    ctx.arc(x, y - 20, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIP', x, y - 14);
    ctx.textAlign = 'left';
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
