const cfg = require('./config');

const Physics = {
  // ─── Worm ────────────────────────────────────────────────────────────────

  moveWorm(worm, direction, terrain) {
    if (!worm.alive) return;
    // Allow movement on ground or when barely airborne (uneven terrain).
    // Block only when actively jumping up or falling fast.
    if (!worm.onGround && (worm.vy < -2 || worm.vy > 8)) return;
    const dx = direction === 'left' ? -cfg.WALK_SPEED : cfg.WALK_SPEED;
    const nx = worm.x + dx;

    // Stay within map bounds
    if (nx < 5 || nx > cfg.TERRAIN_WIDTH - 5) return;

    // Climb slopes (up to 3 pixels)
    for (let slopeUp = 0; slopeUp <= 3; slopeUp++) {
      if (!terrain.isBlocked(nx, worm.y - slopeUp)) {
        worm.x = nx;
        worm.y = worm.y - slopeUp;
        this._snapToGround(worm, terrain);
        return;
      }
    }
    // Blocked by wall — don't move
  },

  jumpWorm(worm) {
    if (!worm.onGround) return;
    worm.vy = cfg.JUMP_FORCE;
    worm.onGround = false;
    worm.fallStartY = worm.y;
  },

  // Single physics step for a worm (called every tick)
  step(worm, terrain) {
    if (!worm.alive) return false;
    let moved = false;

    // Gravity
    worm.vy = Math.min(worm.vy + cfg.GRAVITY, 20);

    // Y movement
    const ny = worm.y + worm.vy;
    if (terrain.isBlocked(worm.x, ny)) {
      // Landing
      if (worm.vy > 0 && worm.fallStartY !== null) {
        const fallDist = ny - worm.fallStartY;
        if (fallDist > cfg.FALL_DAMAGE_THRESHOLD) {
          const dmg = Math.round((fallDist - cfg.FALL_DAMAGE_THRESHOLD) * cfg.FALL_DAMAGE_MULTIPLIER);
          worm.hp = Math.max(0, worm.hp - dmg);
        }
        worm.fallStartY = null;
      }
      worm.vy = 0;
      worm.onGround = true;
      this._snapToGround(worm, terrain);
      moved = true;
    } else {
      if (worm.vy < 0 && worm.fallStartY === null) worm.fallStartY = worm.y;
      worm.y = ny;
      worm.onGround = false;
      moved = true;
    }

    // Death by water or out of bounds
    if (worm.y > cfg.WATER_LEVEL || worm.y < 0) {
      worm.hp = 0;
      worm.alive = false;
    }

    return moved;
  },

  _snapToGround(worm, terrain) {
    // Push worm to surface (not inside terrain and not floating)
    for (let dy = -3; dy <= 3; dy++) {
      if (!terrain.isBlocked(worm.x, worm.y + dy)) {
        worm.y = worm.y + dy;
        break;
      }
    }
    // Ensure worm is not inside ground
    while (terrain.isBlocked(worm.x, worm.y) && worm.y > 0) worm.y--;
  },

  // ─── Projectiles ─────────────────────────────────────────────────────────

  stepProjectile(proj, terrain, worms) {
    if (proj.type === 'mine') return this._stepMine(proj, worms);

    proj.vy += proj.gravity;
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Map boundary
    if (proj.x < 0 || proj.x > cfg.TERRAIN_WIDTH || proj.y > cfg.WATER_LEVEL) {
      return { exploded: true, x: proj.x, y: proj.y, radius: proj.radius, maxDamage: proj.maxDamage };
    }

    // Terrain collision
    if (terrain.isBlocked(proj.x, proj.y)) {
      if (proj.bounces > 0) {
        // Grenade bounces
        proj.bounces--;
        proj.vx *= -0.6;
        proj.vy *= -0.6;
        // Push out of terrain
        while (terrain.isBlocked(proj.x, proj.y)) proj.y--;
        return { moved: true };
      }
      return { exploded: true, x: proj.x, y: proj.y, radius: proj.radius, maxDamage: proj.maxDamage };
    }

    // Worm collision
    for (const worm of worms) {
      if (worm.id === proj.ownerId) continue;
      const dist = Math.hypot(worm.x - proj.x, worm.y - proj.y);
      if (dist < 15) {
        return { exploded: true, x: proj.x, y: proj.y, radius: proj.radius, maxDamage: proj.maxDamage };
      }
    }

    // Fuse timer (grenade / holy grenade)
    if (proj.timer !== undefined) {
      proj.timer--;
      if (proj.timer <= 0) {
        return { exploded: true, x: proj.x, y: proj.y, radius: proj.radius, maxDamage: proj.maxDamage };
      }
    }

    return { moved: true };
  },

  _stepMine(proj, worms) {
    for (const worm of worms) {
      if (worm.id === proj.ownerId) continue;
      const dist = Math.hypot(worm.x - proj.x, worm.y - proj.y);
      if (dist < 20) {
        return { exploded: true, x: proj.x, y: proj.y, radius: proj.radius, maxDamage: proj.maxDamage };
      }
    }
    return { moved: false };
  },
};

module.exports = Physics;
