export default class Particles {
  constructor() {
    this._particles = [];
  }

  spawnExplosion(x, y, radius) {
    const count = Math.min(80, Math.round(radius * 1.2));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * (radius * 0.12);
      const isDirt = Math.random() > 0.3;
      this._particles.push({
        type: 'dirt',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: isDirt ? 40 + Math.random() * 30 : 15 + Math.random() * 15,
        maxLife: isDirt ? 70 : 30,
        size: isDirt ? 3 + Math.random() * 4 : 2 + Math.random() * 3,
        color: isDirt
          ? `hsl(${20 + Math.random()*20},${40+Math.random()*20}%,${30+Math.random()*20}%)`
          : `hsl(${20 + Math.random()*30},90%,${50+Math.random()*20}%)`,
        gravity: 0.25,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
      });
    }

    // Shockwave
    this._particles.push({
      type: 'ring',
      x, y,
      radius: 5,
      maxRadius: radius * 1.5,
      life: 20, maxLife: 20,
    });

    // Вспышка
    this._particles.push({
      type: 'flash',
      x, y,
      radius,
      life: 8, maxLife: 8,
    });
  }

  spawnBulletHit(x, y) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      this._particles.push({
        type: 'dirt',
        x, y,
        vx: Math.cos(angle) * (1 + Math.random() * 3),
        vy: Math.sin(angle) * (1 + Math.random() * 3) - 1,
        life: 12 + Math.random() * 8,
        maxLife: 20,
        size: 1.5 + Math.random() * 2,
        color: '#aaa',
        gravity: 0.2,
        rot: 0, rotSpeed: 0,
      });
    }
  }

  spawnWormDeath(x, y, color) {
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5;
      this._particles.push({
        type: 'dirt',
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 3,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        size: 4 + Math.random() * 5,
        color,
        gravity: 0.3,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  spawnWaterSplash(x, y) {
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.8;
      const spd = 2 + Math.random() * 5;
      this._particles.push({
        type: 'dirt',
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 20 + Math.random() * 10,
        maxLife: 30,
        size: 3 + Math.random() * 3,
        color: '#4a9eff',
        gravity: 0.3,
        rot: 0, rotSpeed: 0,
      });
    }
  }

  spawnConfetti(W, H) {
    const colors = ['#ff4a4a','#4a9eff','#ffd700','#4aff88','#ff88ff'];
    for (let i = 0; i < 60; i++) {
      this._particles.push({
        type: 'confetti',
        x: Math.random() * W,
        y: -10 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3,
        vy: 1 + Math.random() * 3,
        life: 120 + Math.random() * 60,
        maxLife: 180,
        size: 6 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 0.05,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  update() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life--;
      if (p.life <= 0) { this._particles.splice(i, 1); continue; }

      if (p.type === 'ring' || p.type === 'flash') continue;
      if (p.type === 'confetti' || p.type === 'dirt') {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpeed;
        p.vx *= 0.98;
      }
    }
  }

  render(ctx) {
    this._particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;

      if (p.type === 'ring') {
        const r = p.maxRadius * (1 - p.life / p.maxLife);
        ctx.strokeStyle = 'rgba(255,200,100,0.6)';
        ctx.lineWidth = 3 * alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'flash') {
        const r = p.radius * (1 - p.life / p.maxLife * 0.3);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grad.addColorStop(0, 'rgba(255,220,100,0.8)');
        grad.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
      }
    });
    ctx.globalAlpha = 1;
  }
}
