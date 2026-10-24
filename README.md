# Afterlives (prototype)

Limbo-style silhouette puzzle platformer. Phaser 3 + Vite.

Core rule: when you die, your body stays where it fell (a platform), and in rooms
with ghosts your past lives replay from the start every time you respawn.
Blue spirit plates are pressed only by ghosts and open doors.

## Run

```bash
npm install
npm run dev            # local dev server (also reachable from your phone on the same Wi-Fi)
npm run build          # dist/ — for CrazyGames/Poki uploads or a Capacitor wrapper
npm run build:single   # dist-single/index.html — one self-contained file for quick testing
```

## Controls

- Keyboard: Arrows / A D move, Space / W / Up jump, Q give up your body, R restart room
- Touch: on-screen buttons (skull = give up your body, top-right = restart)
- Testing: N skips the room, `#l1`..`#l4` in the URL starts at a room

## Files

- `src/levels.js` — the 4 rooms as data (solids, spikes, plates, doors, exit, death limit)
- `src/GameScene.js` — player, corpses, ghost record/replay, plates, doors, HUD, touch input
- `src/textures.js` — all art generated at runtime (characters, forest, fog, light)
- `src/constants.js` — feel tuning (run speed, jump, ghost cap, door grace)

All gameplay runs on fixed 60 Hz physics steps so ghost replays line up exactly.
