function uid() { return Math.random().toString(36).slice(2, 10); }
const TICK_RATE_S = 0.02; // 20ms in seconds

const Weapons = {
  createProjectile(worm, weapon, angleDeg, power) {
    const angle = (angleDeg * Math.PI) / 180;
    const spd = (power || 0.8) * 18;
    const base = {
      id: uid(),
      ownerId: worm.id,
      x: worm.x,
      y: worm.y - 20,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      bounces: 0,
      gravity: 0.4,
    };

    switch (weapon) {
      case 'grenade':
        return { ...base, type: 'grenade', timer: Math.round(3 / TICK_RATE_S), bounces: 3, radius: 60, maxDamage: 32 };

      case 'bazooka':
        return { ...base, type: 'bazooka', radius: 40, maxDamage: 38 };

      case 'machinegun':
        // Machine gun uses createBurst instead
        return null;

      case 'holy_grenade':
        return { ...base, type: 'holy_grenade', timer: Math.round(5 / TICK_RATE_S), bounces: 2, radius: 120, maxDamage: 60 };

      default:
        return null;
    }
  },

  // Machine gun — returns 8 bullets with staggered delays (in ticks)
  createBurst(worm, angleDeg) {
    const bullets = [];
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 0.15; // ±8° spread
      const angle = (angleDeg * Math.PI) / 180 + spread;
      const spd = 22;
      bullets.push({
        id: uid(),
        ownerId: worm.id,
        type: 'bullet',
        x: worm.x,
        y: worm.y - 20,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        bounces: 0,
        gravity: 0.1,
        radius: 8,
        maxDamage: 8,
        delay: i * 4,
      });
    }
    return bullets;
  },

  // Airstrike — 3 bombs from above
  createAirstrike(targetX, terrain) {
    const offsets = [-35, 0, 35];
    return offsets.map((dx, i) => ({
      id: uid(),
      ownerId: null,
      type: 'airstrike_bomb',
      x: targetX + dx,
      y: 0,
      vx: 0,
      vy: 8,
      bounces: 0,
      gravity: 0.3,
      radius: 80,
      maxDamage: 45,
      delay: i * 15,
    }));
  },

  // Mine — stationary object
  createMine(worm) {
    return {
      id: uid(),
      ownerId: worm.id,
      type: 'mine',
      x: worm.x,
      y: worm.y,
      vx: 0, vy: 0,
      gravity: 0,
      bounces: 0,
      radius: 50,
      maxDamage: 50,
      armTimer: 150, // 3s at 50 Hz — safe window for owner to retreat
    };
  },

  // Full weapon list (for clients)
  list() {
    return [
      { id: 'grenade',     label: 'Grenade',      key: '1', icon: '💣' },
      { id: 'bazooka',     label: 'Bazooka',      key: '2', icon: '🚀' },
      { id: 'machinegun',  label: 'Machine Gun',  key: '3', icon: '🔫' },
      { id: 'airstrike',   label: 'Airstrike',    key: '4', icon: '✈️' },
      { id: 'holy_grenade',label: 'Holy Grenade', key: '5', icon: '✝️' },
      { id: 'mine',        label: 'Mine',         key: '6', icon: '⚡' },
    ];
  },
};

module.exports = Weapons;
