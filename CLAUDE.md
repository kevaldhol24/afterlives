# Afterlives — project context

Prototype of a Limbo-style silhouette puzzle platformer. Owner: Keval (playtests and gives feedback; Claude builds, tests and designs).

## Status
- Prototype built and live on GitHub Pages: https://kevaldhol24.github.io/afterlives/ (auto-deploys on push to `main` via `.github/workflows/pages.yml`).
- Keval has played it and is **not happy with it yet**. The reason is still open: feel/controls, look, the core mechanic, or the genre as a whole. Ask him which before changing anything.

## Decisions so far
- **Engine: Phaser 3 + Vite** (chosen over Three.js, Godot, Unity). 2D engine with physics, small web bundle for portals, and it keeps the workflow of Claude building and testing in a headless browser.
- **Targets:** web portals first (CrazyGames/Poki), Play Store later via a Capacitor wrapper. Keyboard play is natural on web; touch controls exist for phones.
- **Style:** silhouette art + fog + light, generated in code. Chosen because it hides the weak-art problem that got an earlier game (Casted) rejected on quality.
- **Core mechanic:** when you die, your body stays as a solid object (platform/weight), and in ghost rooms your last 3 lives replay from the start on every respawn. Blue spirit plates are pressed only by ghosts and open doors.
- **Scope plan:** small game (15–20 min, ~3 chapters). Teach corpses first, then ghosts, then combine. Story/setting deliberately deferred until the prototype feels promising.
- **Monetization note:** ads between chapters only; mid-puzzle ads would break the mood.

## Code map
- `src/levels.js` — the 4 rooms as data (solids, spikes, plates, doors, exit, death limit, ghosts on/off)
- `src/GameScene.js` — player, corpses, ghost record/replay, plates, doors, HUD, touch input
- `src/textures.js` — all art generated at runtime
- `src/constants.js` — feel tuning (run 210, jump 580, gravity 1400, ghost cap 3)
- All gameplay runs in the arcade `worldstep` handler (fixed 60 Hz) so ghost replays line up exactly.

## Gotchas found while building
- A physics sprite whose origin/size changes after creation must call `body.reset(x, y)`, or on slow frames (several physics steps in one frame) it can fall through the floor.
- When a corpse settles, copy the body position back to the sprite before setting `moves = false`.
- Headless Chromium runs the game in slow motion; write tests that wait on physics step counts, not wall-clock time.

## Commands
- `npm install`, `npm run dev`, `npm run build` (dist/), `npm run build:single` (one-file HTML)
- URL `#l1`..`#l4` starts at a room; `N` skips a room.
