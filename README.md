# MUDHOLE

A browser-based multiplayer Worms-style game. Up to 15 players, 2 teams, destructible terrain, 6 weapons, real-time WebSocket gameplay.

## Quick Start

```bash
npm install
npm start
```

Open: **http://localhost:3000**

## Connecting Friends

### Same Network (Wi-Fi / LAN)
Find your IP: `ipconfig` → IPv4 address  
Friends connect to: `192.168.x.x:3000`

### Over the Internet (ngrok)
1. Download ngrok: https://ngrok.com/download
2. In a separate terminal:
```bash
ngrok http 3000
```
3. Copy the `https://abc123.ngrok.io` link and share it  
4. Friends paste it into the "Join" field  
   (Or click **Copy Link** in the lobby — the server picks up the ngrok URL automatically)

---

## Controls

| Key | Action |
|-----|--------|
| `← →` | Move |
| `↑ ↓` | Aim up / down |
| `Space` | Jump |
| Mouse | Aim (tracks cursor) |
| Click / `Enter` | Fire |
| `1` | Grenade |
| `2` | Bazooka |
| `3` | Machine Gun |
| `4` | Airstrike |
| `5` | Holy Grenade |
| `6` | Mine |
| `Tab` | End turn |

Mobile: virtual buttons appear automatically on touch devices.

---

## Weapons

| Weapon | Max Damage | Blast Radius | Notes |
|--------|-----------|--------------|-------|
| Grenade | 32 | 60 px | Bounces up to 3×, fuse 3 s |
| Bazooka | 38 | 40 px | Arced direct shot |
| Machine Gun | 8 × 8 bullets | 8 px | Spread fire, doesn't damage terrain |
| Airstrike | 45 | 80 px | 3 bombs drop at a chosen x-position |
| Holy Grenade | 60 | 120 px | 2 bounces, enormous 5 s fuse blast |
| Mine | 50 | 50 px | Placed at feet, triggers on enemy proximity |

Ammo per player per game: Grenade ×6 · Bazooka ×5 · Machine Gun ×4 · Airstrike ×1 · Holy Grenade ×1 · Mine ×3

---

## Game Rules

- Two teams: **Blue (A)** vs **Red (B)**
- Players take turns — 30 seconds each
- After firing you get a **retreat window** to move before the next turn
- Wind changes every turn and affects all projectiles except bullets
- Worms take **fall damage** for large drops
- Explosions apply **knockback**
- A worm that falls into the water dies instantly
- Last team standing wins
- If one team has 2+ fewer players, they receive a **+20% HP bonus**

---

## HUD

- **HP bar + name** above each worm
- **Turn timer** (turns orange → "RETREAT!" after firing)
- **Wind indicator** with directional bars and strength
- **Next player** preview
- **Score** per team
- **Minimap** (bottom-left corner)
- **Weapon panel** with ammo counts

---

## Maps

All maps are 3840 × 800 pixels.

| Map | Description |
|-----|-------------|
| Grassland | Rolling hills, standard gameplay |
| Cave | Enclosed underground tunnel system |
| Island | Central landmass, water on both sides |
| Industrial | Flat floor + elevated platforms |
| Hell | Jagged peaks, lava pit edges |
| Snowfield | Gentle slopes, open long-range combat |

---

## Architecture

```
mudhole/
├── server/
│   ├── index.js        — Express + WebSocket server
│   ├── GameRoom.js     — Room state, turn system, player actions
│   ├── Physics.js      — Worm movement, projectile simulation (50 Hz)
│   ├── Weapons.js      — Projectile factories, burst/airstrike/mine
│   ├── Terrain.js      — Procedural map generation, RLE serialization
│   └── config.js       — Shared constants (HP, ammo, physics, tick rate)
└── client/
    ├── index.html      — Canvas stack, HUD, CSS
    └── js/
        ├── main.js                 — Screen router, WebSocket wrapper
        ├── screens/
        │   ├── MainMenu.js         — Animated demo battle on title screen
        │   ├── Game.js             — Core game loop, network events, rendering
        │   ├── Lobby.js            — Pre-game room
        │   ├── GameOver.js         — End screen
        │   ├── CreateServer.js
        │   ├── JoinServer.js
        │   └── Settings.js
        └── game/
            ├── Renderer.js         — 5-layer canvas: bg / terrain / game / fx / ui-game
            ├── WormRenderer.js     — Per-worm drawing (body, hat, eyes, weapon)
            ├── InputHandler.js     — Keyboard, mouse, touch, virtual buttons
            ├── UI.js               — HUD panel updates
            └── Minimap.js          — Bottom-left minimap
        └── utils/
            ├── Particles.js        — Explosion debris, smoke, worm death, confetti
            └── SoundManager.js     — Web Audio sound effects
```

### Rendering pipeline (60 fps client, 50 Hz server)
```
canvas-bg       ← sky gradient, parallax hills, clouds
canvas-terrain  ← destructible terrain (OffscreenCanvas, RLE-patched on explosion)
canvas-game     ← worms, projectiles + trails, aim indicators
canvas-effects  ← particles, floating damage numbers
canvas-ui-game  ← aim line input capture (transparent, pointer-events)
```

### Network flow
- Server broadcasts `state` (worm positions) every 20 ms during active turns
- Projectile events: `projectile` (on fire), `projectile_bounce`, `explosion`
- Turn events: `turn_start`, `timer`, `retreat`, `turn_end`
- Terrain updates: RLE-encoded delta patches sent after each explosion

---

## Sound Files (optional)

Place CC0 audio files in `client/assets/sounds/` — game works fine without them:

`explosion.wav` · `bazooka.wav` · `machinegun.wav` · `jump.wav` · `step.wav`  
`hurt.wav` · `death.wav` · `airstrike.wav` · `win.wav` · `splash.wav` · `click.wav` · `tick.wav`
