module.exports = {
  PORT: process.env.PORT || 3000,
  MAX_PLAYERS: 15,
  TEAM_COUNT: 2,
  WORM_HP: 100,
  TURN_TIME: 30,
  HP_BALANCE_BONUS: 1.2,   // bonus for smaller team when size diff >= 2
  FRIENDLY_FIRE: false,
  PUBLIC_URL: process.env.PUBLIC_URL || null, // set via env: PUBLIC_URL=http://your-ip:3000

  // Physics
  GRAVITY: 0.5,
  WALK_SPEED: 3,
  JUMP_FORCE: -12,
  FALL_DAMAGE_THRESHOLD: 150,
  FALL_DAMAGE_MULTIPLIER: 0.3,

  // Terrain
  TERRAIN_WIDTH: 1920,
  TERRAIN_HEIGHT: 800,
  WATER_LEVEL: 740,

  // Server tick
  TICK_RATE: 20, // ms between state broadcasts during a turn
};
