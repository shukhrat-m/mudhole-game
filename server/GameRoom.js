const cfg = require('./config');
const Terrain = require('./Terrain');
const Physics = require('./Physics');
const Weapons = require('./Weapons');

function uid() { return Math.random().toString(36).slice(2, 10); }

const TEAM_COLORS = { A: '#4a9eff', B: '#ff4a4a' };
const VALID_WEAPONS = new Set(['grenade', 'bazooka', 'machinegun', 'holy_grenade']);
const VALID_DIRS    = new Set(['left', 'right']);

class GameRoom {
  constructor(id, name) {
    this.id = id;
    this.name = name || 'Game';
    this.players = new Map(); // id → player
    this.state = 'lobby';     // lobby | loading | playing | gameover
    this.settings = { map: 'grassland' };
    this.terrain = null;
    this.turnQueue = [];      // [playerId, ...]
    this.turnIndex = 0;
    this.timer = null;
    this.tickInterval = null;
    this.timeLeft = cfg.TURN_TIME;
    this.projectiles = [];
    this.scores = { A: 0, B: 0 };
    this.wind = 0;
  }

  // ─── Connect / Disconnect ────────────────────────────────────────────────

  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'join':        return this._onJoin(ws, msg);
      case 'swap_team':   return this._onSwapTeam(ws);
      case 'select_map':  return this._onSelectMap(ws, msg);
      case 'start_game':  return this._onStartGame(ws);
      case 'move':        return this._onMove(ws, msg);
      case 'jump':        return this._onJump(ws);
      case 'fire':        return this._onFire(ws, msg);
      case 'airstrike':   return this._onAirstrike(ws, msg);
      case 'place_mine':  return this._onPlaceMine(ws);
      case 'end_turn':    return this._onEndTurn(ws);
      case 'rematch':     return this._onRematch(ws);
    }
  }

  _onJoin(ws, msg) {
    if (this.state !== 'lobby') {
      this._send(ws, { type: 'error', message: 'Game already in progress' });
      return;
    }
    if (this.players.size >= cfg.MAX_PLAYERS) {
      this._send(ws, { type: 'error', message: 'Server is full' });
      return;
    }

    const id = uid();
    const isHost = this.players.size === 0;
    const team = this._assignTeam();

    const player = {
      id,
      name: (msg.name || 'Player').slice(0, 20),
      team,
      ws,
      isHost,
      worm: null, // assigned at game start
      alive: true,
    };

    this.players.set(id, player);
    ws._playerId = id;

    // Send full lobby state to the new player
    this._send(ws, {
      type: 'joined',
      id,
      team,
      isHost,
      roomName: this.name,
      settings: this.settings,
      players: this._serializePlayers(),
    });

    // Notify everyone else
    this._broadcastExcept(id, {
      type: 'player_joined',
      player: this._serializePlayer(player),
    });
  }

  removePlayer(ws) {
    const id = ws._playerId;
    if (!id || !this.players.has(id)) return;

    const player = this.players.get(id);

    // Must check BEFORE removing from turn queue
    const wasCurrentPlayer = this.state === 'playing' && id === this._currentPlayerId();

    this.players.delete(id);

    this._broadcast({ type: 'player_left', id, name: player.name, team: player.team });

    // If host left, assign a new one
    if (player.isHost) {
      const next = this.players.values().next().value;
      if (next) {
        next.isHost = true;
        this._broadcast({ type: 'host_changed', id: next.id });
      }
    }

    // During a game, skip their turn if it was their turn
    if (this.state === 'playing') {
      if (player.worm) player.worm.alive = false;
      this._rebuildTurnQueue();
      if (wasCurrentPlayer) {
        clearInterval(this.timer);
        this._nextTurn();
      }
      this._checkWinCondition();
    }
  }

  // ─── Lobby ───────────────────────────────────────────────────────────────

  _onSwapTeam(ws) {
    const player = this._getPlayer(ws);
    if (!player || this.state !== 'lobby') return;
    player.team = player.team === 'A' ? 'B' : 'A';
    this._broadcast({ type: 'team_swapped', id: player.id, newTeam: player.team });
  }

  _onSelectMap() {
    // Map selection disabled — grassland only
  }

  _onStartGame(ws) {
    const player = this._getPlayer(ws);
    if (!player || !player.isHost || this.state !== 'lobby') return;

    const teams = this._getTeams();
    if (teams.A.length === 0 || teams.B.length === 0) {
      this._send(ws, { type: 'error', message: 'Need at least 1 player on each team' });
      return;
    }

    this.state = 'loading';
    this._broadcast({ type: 'loading', map: this.settings.map });

    // Generate terrain synchronously with a small UX delay
    setTimeout(() => this._initGame(), 100);
  }

  _initGame() {
    // Apply HP balance bonus
    const teams = this._getTeams();
    const diff = Math.abs(teams.A.length - teams.B.length);
    const smallerTeam = teams.A.length < teams.B.length ? 'A' : 'B';

    // Create worms
    this.players.forEach(p => {
      const baseHp = cfg.WORM_HP;
      const hp = (diff >= 2 && p.team === smallerTeam)
        ? Math.round(baseHp * cfg.HP_BALANCE_BONUS)
        : baseHp;

      p.alive = true;
      p.worm = {
        id: p.id,
        name: p.name,
        team: p.team,
        x: 0, y: 0,   // positions set after terrain generation
        vx: 0, vy: 0,
        onGround: false,
        hp,
        maxHp: hp,
        alive: true,
        weapon: 'grenade',
        fallStartY: null,
        ammo: { ...cfg.WEAPON_AMMO },
      };
    });

    // Terrain
    this.terrain = new Terrain(this.settings.map);
    this._spawnWorms();

    // Turn queue: interleave A/B
    this._buildTurnQueue();

    const rle = this.terrain.serialize();
    const worms = this._serializeWorms();
    const turnQueue = this.turnQueue;
    const currentPlayerId = turnQueue[0] || null;

    this._broadcast({ type: 'terrain', rle });
    this._broadcast({ type: 'game_start', worms, turnQueue, currentPlayerId, timeLeft: cfg.TURN_TIME, scores: this.scores });

    this.state = 'playing';
    this._startTurn();
  }

  _spawnWorms() {
    const total = this.players.size;
    const w = cfg.TERRAIN_WIDTH;
    const margin = 80;
    const minDist = 130;

    // Generate random, well-separated X positions
    const positions = [];
    let attempts = 0;
    while (positions.length < total && attempts < 3000) {
      const x = margin + Math.floor(Math.random() * (w - margin * 2));
      if (positions.every(p => Math.abs(p - x) >= minDist)) {
        positions.push(x);
      }
      attempts++;
    }
    // Fallback: evenly spaced if random couldn't place everyone
    while (positions.length < total) {
      const i = positions.length;
      positions.push(Math.round((i + 1) * w / (total + 1)));
    }

    // Shuffle so teams aren't always on the same side
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    let idx = 0;
    this.players.forEach(p => {
      p.worm.x = positions[idx++];
      p.worm.y = this.terrain.getHeightAt(p.worm.x) - 20;
    });
  }

  // ─── Turn system ─────────────────────────────────────────────────────────

  _buildTurnQueue() {
    const teams = this._getTeams();
    const maxLen = Math.max(teams.A.length, teams.B.length);
    this.turnQueue = [];
    for (let i = 0; i < maxLen; i++) {
      if (i < teams.A.length) this.turnQueue.push(teams.A[i].id);
      if (i < teams.B.length) this.turnQueue.push(teams.B[i].id);
    }
    this.turnIndex = 0;
  }

  _rebuildTurnQueue() {
    this.turnQueue = this.turnQueue.filter(id => {
      const p = this.players.get(id);
      return p && p.worm && p.worm.alive;
    });
  }

  _currentPlayerId() {
    if (this.turnQueue.length === 0) return null;
    return this.turnQueue[this.turnIndex % this.turnQueue.length];
  }

  _startTurn() {
    this._rebuildTurnQueue();
    if (this.turnQueue.length === 0) return;

    this._shotFired = false;
    this.timeLeft = cfg.TURN_TIME;
    this.wind = Math.round((Math.random() * 2 - 1) * cfg.WIND_MAX);
    const currentId = this._currentPlayerId();
    const nextIdx = (this.turnIndex + 1) % this.turnQueue.length;
    const nextPlayerId = this.turnQueue.length > 1 ? this.turnQueue[nextIdx] : null;

    this._broadcast({ type: 'turn_start', playerId: currentId, nextPlayerId, timeLeft: this.timeLeft, scores: this.scores, wind: this.wind });

    // Turn timer
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this._nextTurn();
      } else {
        this._broadcast({ type: 'timer', timeLeft: this.timeLeft });
      }
    }, 1000);

    // State broadcast tick
    clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this._tickPhysics(), cfg.TICK_RATE);
  }

  _nextTurn() {
    clearInterval(this.timer);
    this._broadcast({ type: 'turn_end' });

    this._rebuildTurnQueue();
    if (this.turnQueue.length === 0) return;

    this.turnIndex = (this.turnIndex + 1) % this.turnQueue.length;

    // Brief pause before next turn
    setTimeout(() => this._startTurn(), 1500);
  }

  _startRetreat(seconds) {
    clearInterval(this.timer);
    this.timeLeft = seconds;
    this._broadcast({ type: 'retreat', timeLeft: seconds });
    this.timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this._nextTurn();
      } else {
        this._broadcast({ type: 'timer', timeLeft: this.timeLeft });
      }
    }, 1000);
  }

  _onEndTurn(ws) {
    const player = this._getPlayer(ws);
    if (!player || this.state !== 'playing') return;
    if (player.id !== this._currentPlayerId()) return;
    clearInterval(this.timer);
    this._nextTurn();
  }

  // ─── Physics tick ────────────────────────────────────────────────────────

  _tickPhysics() {
    let changed = false;

    this.players.forEach(p => {
      if (!p.worm || !p.worm.alive) return;
      const moved = Physics.step(p.worm, this.terrain);
      if (moved) changed = true;
    });

    // Projectiles
    const toRemove = [];
    this.projectiles.forEach((proj, i) => {
      const result = Physics.stepProjectile(proj, this.terrain, this._getAliveWorms(), this.wind);
      if (result.exploded) {
        this._handleExplosion({ ...result, projId: proj.id });
        toRemove.push(i);
      } else if (result.bounced) {
        this._broadcast({ type: 'projectile_bounce', id: result.id, x: result.x, y: result.y, vx: result.vx, vy: result.vy });
        changed = true;
      } else if (result.moved) {
        changed = true;
      }
    });
    toRemove.reverse().forEach(i => this.projectiles.splice(i, 1));

    if (changed) {
      this._broadcast({ type: 'state', worms: this._serializeWorms() });
    }
  }

  // ─── Player actions ──────────────────────────────────────────────────────

  _onMove(ws, msg) {
    const player = this._getPlayer(ws);
    if (!player || !this._isCurrentPlayer(player)) return;
    if (!VALID_DIRS.has(msg.direction)) return;
    Physics.moveWorm(player.worm, msg.direction, this.terrain);
    this._broadcast({ type: 'state', worms: this._serializeWorms() });
  }

  _onJump(ws) {
    const player = this._getPlayer(ws);
    if (!player || !this._isCurrentPlayer(player)) return;
    Physics.jumpWorm(player.worm);
    this._broadcast({ type: 'state', worms: this._serializeWorms() });
  }

  _onFire(ws, msg) {
    const player = this._getPlayer(ws);
    if (!player || !this._isCurrentPlayer(player)) return;
    if (this._shotFired) return;

    // Whitelist: airstrike and mine have dedicated handlers
    const weapon = VALID_WEAPONS.has(msg.weapon) ? msg.weapon : player.worm.weapon;
    if (!VALID_WEAPONS.has(weapon)) return;

    // Ammo check (0 default closes the ?? 1 loophole)
    if ((player.worm.ammo[weapon] ?? 0) <= 0) return;

    // Sanitise numeric inputs
    const angle = (typeof msg.angle === 'number' && isFinite(msg.angle)) ? msg.angle : 0;
    const power = (typeof msg.power === 'number' && isFinite(msg.power))
      ? Math.max(0.1, Math.min(1, msg.power)) : 0.85;

    this._shotFired = true;
    player.worm.ammo[weapon]--;
    player.worm.weapon = weapon;

    if (weapon === 'machinegun') {
      const bullets = Weapons.createBurst(player.worm, angle);
      bullets.forEach(b => {
        setTimeout(() => {
          if (this.state !== 'playing') return;
          this.projectiles.push(b);
          this._broadcast({ weaponType: b.type, ...b, type: 'projectile', weapon: 'machinegun' });
        }, b.delay * cfg.TICK_RATE);
      });
      this._startRetreat(4);
    } else {
      const proj = Weapons.createProjectile(player.worm, weapon, angle, power);
      if (proj) {
        this.projectiles.push(proj);
        this._broadcast({ weaponType: proj.type, ...proj, type: 'projectile' });
      }
      this._startRetreat(3);
    }

    this._broadcast({ type: 'state', worms: this._serializeWorms() });
  }

  _onAirstrike(ws, msg) {
    const player = this._getPlayer(ws);
    if (!player || !this._isCurrentPlayer(player)) return;
    if (this._shotFired) return;
    if ((player.worm.ammo.airstrike ?? 1) <= 0) return;
    this._shotFired = true;
    if (player.worm.ammo.airstrike !== undefined) player.worm.ammo.airstrike--;

    const rawX  = typeof msg.x === 'number' && isFinite(msg.x) ? msg.x : cfg.TERRAIN_WIDTH / 2;
    const targetX = Math.max(0, Math.min(cfg.TERRAIN_WIDTH, rawX));
    const projs = Weapons.createAirstrike(targetX, this.terrain);
    projs.forEach((p, i) => {
      setTimeout(() => {
        if (this.state !== 'playing') return;
        this.projectiles.push(p);
        this._broadcast({ weaponType: p.type, ...p, type: 'projectile' });
      }, i * 400);
    });

    this._startRetreat(5);
    this._broadcast({ type: 'state', worms: this._serializeWorms() });
  }

  _onPlaceMine(ws) {
    const player = this._getPlayer(ws);
    if (!player || !this._isCurrentPlayer(player)) return;
    if (this._shotFired) return;
    if ((player.worm.ammo.mine ?? 1) <= 0) return;
    this._shotFired = true;
    if (player.worm.ammo.mine !== undefined) player.worm.ammo.mine--;

    const mine = Weapons.createMine(player.worm);
    this.projectiles.push(mine);
    this._broadcast({ type: 'mine_placed', x: mine.x, y: mine.y, id: mine.id, armTimer: mine.armTimer });
    this._broadcast({ type: 'state', worms: this._serializeWorms() });

    this._startRetreat(3);
  }

  _onRematch(ws) {
    const player = this._getPlayer(ws);
    if (!player || !player.isHost) return;

    clearInterval(this.timer);
    clearInterval(this.tickInterval);
    this.projectiles = [];
    this.turnQueue = [];
    this.state = 'lobby';
    this.scores = { A: 0, B: 0 };

    this.players.forEach(p => { p.worm = null; p.alive = true; });
    this._broadcast({ type: 'rematch', players: this._serializePlayers() });
  }

  // ─── Explosion ───────────────────────────────────────────────────────────

  _handleExplosion(result) {
    const { x, y, radius, maxDamage, projId } = result;
    const damages = [];

    this._getAliveWorms().forEach(worm => {
      const dist = Math.hypot(worm.x - x, worm.y - y);
      if (dist < radius) {
        const dmg = Math.round(maxDamage * (1 - dist / radius));
        if (dmg > 0) {
          worm.hp = Math.max(0, worm.hp - dmg);
          // Knockback
          const angle = Math.atan2(worm.y - y, worm.x - x);
          worm.vx += Math.cos(angle) * 8;
          worm.vy += Math.sin(angle) * 8 - 4;
          damages.push({ id: worm.id, dmg, hp: worm.hp });
          if (worm.hp <= 0) this._killWorm(worm.id);
        }
      }
    });

    this._broadcast({ type: 'explosion', x, y, radius, projId, damages });

    this._checkWinCondition();
  }

  _killWorm(id) {
    const player = this.players.get(id);
    if (!player || !player.worm) return;
    player.worm.alive = false;
    player.worm.hp = 0;
    player.alive = false;
    // Award kill point to the opposing team
    const opposingTeam = player.team === 'A' ? 'B' : 'A';
    this.scores[opposingTeam] = (this.scores[opposingTeam] || 0) + 1;
    this._broadcast({ type: 'worm_died', id, scores: this.scores });
  }

  _checkWinCondition() {
    const teams = this._getTeams();
    const aAlive = teams.A.filter(p => p.worm && p.worm.alive).length;
    const bAlive = teams.B.filter(p => p.worm && p.worm.alive).length;

    if (aAlive === 0 || bAlive === 0) {
      const winner = aAlive > 0 ? 'A' : 'B';
      clearInterval(this.timer);
      clearInterval(this.tickInterval);
      this.state = 'gameover';

      const stats = [];
      this.players.forEach(p => {
        stats.push({ id: p.id, name: p.name, team: p.team, alive: p.worm && p.worm.alive });
      });

      this.scores[winner] = (this.scores[winner] || 0) + 3; // win bonus
      this._broadcast({ type: 'game_over', winner, stats, scores: this.scores });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _getPlayer(ws) {
    return this.players.get(ws._playerId);
  }

  _isCurrentPlayer(player) {
    return this.state === 'playing' && player.id === this._currentPlayerId();
  }

  _getTeams() {
    const A = [], B = [];
    this.players.forEach(p => (p.team === 'A' ? A : B).push(p));
    return { A, B };
  }

  _getAliveWorms() {
    const worms = [];
    this.players.forEach(p => { if (p.worm && p.worm.alive) worms.push(p.worm); });
    return worms;
  }

  _assignTeam() {
    const teams = this._getTeams();
    return teams.A.length <= teams.B.length ? 'A' : 'B';
  }

  _serializePlayers() {
    return [...this.players.values()].map(p => this._serializePlayer(p));
  }

  _serializePlayer(p) {
    return { id: p.id, name: p.name, team: p.team, isHost: p.isHost };
  }

  _serializeWorms() {
    const worms = [];
    this.players.forEach(p => {
      if (p.worm) worms.push({ ...p.worm, ws: undefined });
    });
    return worms;
  }

  _send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  _broadcast(msg) {
    const data = JSON.stringify(msg);
    this.players.forEach(p => {
      if (p.ws.readyState === 1) p.ws.send(data);
    });
  }

  _broadcastExcept(excludeId, msg) {
    const data = JSON.stringify(msg);
    this.players.forEach(p => {
      if (p.id !== excludeId && p.ws.readyState === 1) p.ws.send(data);
    });
  }
}

module.exports = GameRoom;
