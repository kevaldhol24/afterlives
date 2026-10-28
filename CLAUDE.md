# Afterlives — project context

Prototype of a Limbo-style silhouette puzzle platformer. Owner: Keval (playtests and gives feedback; Claude builds, tests and designs).

## Status
- Prototype built and live on GitHub Pages: https://kevaldhol24.github.io/afterlives/ (auto-deploys on push to `main` via `.github/workflows/pages.yml`).
- Keval has played it and is **not happy with it**: the look, the core mechanic and the feel/controls all fall short.
  The genre itself (silhouette puzzle-platformer) is still fine.
- **Now: mechanic toys** (`src/toys/`), the start screen: three one-room tests of a new core mechanic, plain shapes,
  snappier feel (`kit.js`: acceleration, variable jump, apex hang, coyote, buffer). Keval picks the one worth a second
  room. `#lantern` (light makes planks solid, withers thorns; carry, drop, throw), `#rope` (body + spirit on a rope:
  the spirit flies through walls and is the anchor to swing from / climb; Space lets go), `#possess` (a wisp borrowing
  a brute / bird / crawler; bodies stay where left). Room logic has no Phaser imports, so it runs in Node for scripted
  solve tests. The old prototype is item 4 on the menu (or `#l1`..`#l4`).
- **Forest** (`src/forest/`, `#forest`, menu item 5): the painted forest, chapter 1 of the puzzle game. Its own
  Phaser game at 1920x1080. A boy walks a 7600 px misty forest: five painted background layers (scroll 0.1 to 0.86,
  each paler and blurrier the farther it is, mist baked at their feet), drifting fog bands and god rays between them,
  a canopy layer, the black play plane, and a blurred foreground layer (scroll 1.42); vignette, film grain, flicker.
  Live: grass that sways and parts round the boy, verlet ropes he brushes past, crows that fly off, flies, dust in the
  light, falling leaves, far flocks, synthesised wind / footsteps / wings (M mutes). `layers.js` holds the layer
  specs; `art.js` paints trees, ferns, bushes and the light/fog/grain textures in canvas once at boot (canvas blur
  filter, down/up-scale fallback) and `addLayer` cuts them into 2048 px textures. `world.js` (ground, solids, movement)
  has no Phaser.
  - **Puzzles, Limbo-style** (Keval's call: no lantern or other special power, just walk / jump / grab). Controls:
    ← → walk, Space (or ↑) jump, hold Shift (or E / X / Ctrl) to grab; walking into a box pushes it, grabbing and
    walking away pulls it. He catches ledges in reach (`findLedge` in `world.js`: cliff and stump tops, boxes, the
    pit lips) and climbs up holding towards / up / jump (down or away drops); hands reach ~310 px above his feet at
    the top of a jump. On a rope ↑ ↓ climb, ← → pump the swing, Space lets go. Chapter 1, in order:
    1 push the crate to cliff A (`CLIFF_H` 340: out of reach from the ground, in reach from the crate); 2 a stump
    block flush against cliff A's far wall, so it can only be pulled, to cliff B; 3 push the log over a row of five
    bear traps; 4 swing over the pit on a rope (black water at the bottom, `WATER_Y`: going under drowns him);
    5 the hound wakes when he gets close: run back over the trap you jumped on the way in and it catches itself.
    Rules in `world.js` (ground, cliffs `STATIC`, boxes, ledges, traps, the boy) and `play.js` (`stepPlay`: one step
    of everything, returns events the scene turns into sound and particles); `hazards.js` draws boxes (painted
    canvas textures: plank crate, sawn block, log), traps, the pit fog and water, and the hound; ropes in `life.js`.
    All of it has no Phaser: a scripted playthrough in Node proves the chapter can be solved and that cliff A is out
    of reach without the crate (keep one when changing puzzles). Death (trap, drowning, hound) restarts at the last
    checkpoint with every puzzle reset.
  - **The boy** (`boy.js`): a black silhouette after Keval's reference (a kid in a baseball cap, open jacket,
    backpack, knee shorts, chunky shoes), two white eyes under the brim, no colour accent. Posed every frame: each
    state (stand with idle strap-fiddle, walk / run on a distance-driven cycle so feet don't slide, jump rise / top /
    fall, landing squash, push, pull, rope hang tilted with the rope and hand-over-hand climbing, ledge hang and a
    keyframed climb-up relative to the corner) gives targets for hips, lean, head, hands and ankles; targets are
    eased (so states blend, and a turn sweeps the limbs across), then two-bone IK places knees and elbows. Arms
    stretch 25 % while hanging so the grip shows above the cap. Poses must push arms outside the outline or the
    silhouette swallows them. Death = a verlet ragdoll from the last pose (`makeRagdoll`): the trap holds an ankle,
    the hound holds the neck in its jaws (`houndMouth`) and shakes, water slows and sinks it with bubbles.
  - Look: **painted colour, kept dark** (chosen over silhouette and papercut; darkened after Keval found it too
    bright): `style.js` holds the palette `S` (green-black up close to grey-green haze and a dim ochre sky), a heavy
    vignette, a camera colour grade (`postFX` colour matrix: less saturation, more contrast), bark shading on trunks
    (`shadeLimb` in `art.js`: shadow side, lit edge, grooves, knots) and lit tops on rocks. Everything that paints
    reads `S`. Particles (`fx.js`, Phaser emitters): footstep / landing / box dust, splash and bubbles, trap
    splinters, crow feathers. Crows have two-jointed wings; leaves tumble. Free ready-made art was considered and
    passed over: nothing free matches this painted style, and mixed styles look worse than one consistent one.
  - Testing: in headless Chrome (swiftshader) a frame takes ~0.9 s (game update ~3 ms; the rest is the software
    GPU), so don't wait on wall time: step `scene.update(0, 16.7)` in a loop with `scene.read` replaced by scripted
    input, then let one frame render for the screenshot. `scene.zoomOn = 3` zooms the camera on the boy (tests only).

- **Tether** (`src/tether/`, `#tether`, menu item 6): a *different game* prototyped in this repo: a 1920s salvage
  diver on an air hose (Limbo-style ocean, side view). Its own Phaser game at 1280x720. The site (Wreck Graveyard,
  `world.js`) slopes down to the right from the boat: reef, cliff, a wreck, a trench; deeper = darker, the helmet
  lamp is cut out of a darkness render texture. The question the MVP answers: **is managing the hose fun or annoying?**
  - Hose (`sim.js`, no Phaser): verlet rope, 14 px links, anchored at the boat. The crew pays out when the hose pulls
    at the boat (`pull`, smoothed) and takes up slack after 1.5 s of none. Rigid (inextensible from the boat) only
    when fully paid out or on the winch; the rigid pass may move the diver at most `MAX_YANK` px/step, or he gets
    pulled through thin timbers. **Kink**: hose folded > ~125° at a contact point while taut (`KINK_ON`) -> no air,
    the emergency tank drains, and the winch stalls. Thin things (< 24 px: spires, the arch, deck edges, masts,
    yards) kink; round rocks don't. Reeling drags him home along the hose's own path.
  - Air from the hose; the tank (12 s base) only drains when kinked or leaking (eel bites, -30 % flow each, max 3).
    Run out = black out, sack lost. Salvage auto-picks up (sack cap 6 weight; crates 3, idol 2 slow you down) and
    only counts once back at the boat. Boat screen: bank, 3 upgrades (hose length, tank, winch), saved in
    localStorage `tether.save.v1`. The logbook page in the trench is the story hook.
  - Controls: arrows / WASD swim, hold Space / Shift / R to reel; touch: stick anywhere on the left 60 %, reel button
    bottom right. Tests: `node tests/tether.test.mjs` (payout, max length, reel home, kink under the reef arch,
    winch stall, eel bite, drowning, reachability per hose level). In the browser: `window.__tether` is the scene;
    replace `scene.read` and step `scene.update(0, 16.7)` like the forest.

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
- `npm install`, `npm run dev`, `npm run build` (dist/), `npm run build:single` (one-file HTML), `npm test` (Tether sim)
- URL `#l1`..`#l4` starts at a room; `N` skips a room. `#forest`, `#tether` open those games.
