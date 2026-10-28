// The forest chapter: ground, cliffs, boxes the boy can push and pull, bear traps, and his movement.
// No Phaser here, so it runs in Node too.

export const VIEW_W = 1920;
export const VIEW_H = 1080;
export const WORLD_W = 7600;
export const STEP = 1 / 60;
export const GRAV = 2900;

const bump = (x, c, w, a) => a * Math.exp(-(((x - c) / w) ** 2));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The puzzles, in order along the path.
export const PIT = [3800, 4280];            // 4: too wide to jump; a rope hangs over it
export const DARK = [5450, 6700];           // 5: a dark stretch where the hound sleeps
export const HOUND_X = 6060;
export const HOUND_WAKE_X = 5880;           // it wakes when the boy gets this far
export const END_X = 7050;
export const CHECKPOINTS = [260, 1880, 2960, 3700, 4420, 5420];
export const KILL_Y = 1180;                 // fell into the pit
export const TRAP_XS = [3380, 3450, 3520, 3590, 3660, 5700];
export const TRAP_REACH = 26;               // a foot this close to a trap's middle springs it

function surface(x) {
  return 838
    + 14 * Math.sin(x * 0.0019 + 0.6)
    + 8 * Math.sin(x * 0.0047 + 2.1)
    + 3 * Math.sin(x * 0.0131 + 0.3)
    - bump(x, 60, 240, 60)
    - bump(x, 7500, 320, 110);
}

// Top of the ground (y grows downwards), with the pit cut out.
export function groundY(x) {
  return surface(x) + 700 * smooth(PIT[0], PIT[0] + 36, x) * (1 - smooth(PIT[1] - 36, PIT[1], x));
}

// Black water down in the pit: going under drowns him.
export const WATER_Y = Math.round(surface(PIT[0] - 10) + 150);
export const DROWN_DEPTH = 70;

// A block of rock `height` above the ground under it (its sides are walls).
function cliff(x0, x1, height, kind) {
  let top = Infinity, bottom = -Infinity;
  for (let x = x0; x <= x1; x += 4) { top = Math.min(top, groundY(x)); bottom = Math.max(bottom, groundY(x)); }
  return { x: x0, y: top - height, w: x1 - x0, h: bottom - top + height + 12, kind };
}

// Things that never move: 1 and 2 are cliffs too high to climb from the ground. He can catch a ledge his hands
// reach (about 310 px above his feet at the top of a jump), so 340 needs a box under him.
export const CLIFF_H = 340;
export const STATIC = [
  cliff(1400, 1850, CLIFF_H, 'cliffA'),
  cliff(2450, 2900, CLIFF_H, 'cliffB'),
  cliff(4960, 5078, 112, 'stump'),
];

// Top of whatever is underfoot at x: the ground or a static block.
export function surfaceY(x) {
  let y = groundY(x);
  for (const s of STATIC) if (x >= s.x && x <= s.x + s.w) y = Math.min(y, s.y);
  return y;
}

// 1: a crate to push to cliff A. 2: a stump block flush against cliff A's far wall, so it can only be pulled.
// 3: a log to push over the traps.
const BOXES = [
  { kind: 'crate', x: 1100, w: 116, h: 116 },
  { kind: 'block', x: 1850, w: 116, h: 116 },
  { kind: 'log', x: 3100, w: 260, h: 56 }, // far enough from cliff B that he lands behind it, not on it
];

export function makeBoxes() {
  return BOXES.map((d) => {
    let floor = Infinity;
    for (let x = d.x + 2; x <= d.x + d.w - 2; x += 8) floor = Math.min(floor, groundY(x));
    return { ...d, y: floor - d.h, vx: 0, vy: 0, onGround: true, gone: false };
  });
}

export const makeTraps = () => TRAP_XS.map((x) => ({ x, sprung: null, t: 0 }));

// Where crows sit at the start.
export function perches() {
  return [[900, 1], [1520, -1], [1700, 1], [2620, -1], [2780, 1], [5020, -1], [4600, -1], [4680, 1], [6880, 1]]
    .map(([x, face]) => ({ x, y: surfaceY(x), face }));
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

// ---------- boxes ----------

// Slide a box sideways as far as it can go (up to dx); returns how far it went.
export function moveBoxX(box, dx, boxes) {
  if (!dx) return 0;
  const x0 = box.x;
  box.x += dx;
  for (const s of [...STATIC, ...boxes]) {
    if (s === box || s.gone) continue;
    if (box.y < s.y + s.h - 2 && box.y + box.h > s.y + 2 && box.x < s.x + s.w && box.x + box.w > s.x) {
      box.x = dx > 0 ? s.x - box.w : s.x + s.w;
    }
  }
  box.x = Math.max(40, Math.min(WORLD_W - 40 - box.w, box.x));
  return box.x - x0;
}

// Gravity, landing on the ground (its highest point under the box), on rock or on another box; a box that
// leaves the bottom of the screen is gone.
export function stepBoxes(boxes, dt) {
  for (const box of boxes) {
    if (box.gone) continue;
    const bottom = box.y + box.h;
    box.vy = Math.min(box.vy + GRAV * dt, 1800);
    box.y += box.vy * dt;
    let floor = Infinity;
    for (let x = box.x + 2; x <= box.x + box.w - 2; x += 8) floor = Math.min(floor, groundY(x));
    for (const s of [...STATIC, ...boxes]) {
      if (s === box || s.gone) continue;
      if (box.x < s.x + s.w - 2 && box.x + box.w > s.x + 2 && s.y >= bottom - 2) floor = Math.min(floor, s.y);
    }
    box.onGround = box.y + box.h >= floor;
    if (box.onGround) { box.y = floor - box.h; box.vy = 0; }
    if (box.y > 1500) box.gone = true;
  }
}

// ---------- the boy ----------

export const FEEL = {
  run: 370, accel: 2400, decel: 3000, airAccel: 1600, push: 150, pull: 130,
  jump: 980, maxFall: 1800, coyote: 0.1, buffer: 0.13, climb: 0.62,
};

// Ledges he can hang from besides the tops of solids: the lips of the pit.
const LIPS = [{ x: PIT[0] + 14, y: surface(PIT[0]), side: -1 }, { x: PIT[1] - 14, y: surface(PIT[1]), side: 1 }];
// His hands reach this far above the top of his head; a ledge between that and his chest can be caught.
const REACH = [34, 26];

export function makeBoy(x) {
  const w = 34, h = 112;
  return { x: x - w / 2, y: surfaceY(x) - h, w, h, vx: 0, vy: 0, face: 1, onGround: true,
    coyote: 0, buffer: 0, jumping: false, impact: 0, grab: null, grabSide: 0, pushing: null, hang: null, cool: 0,
    ledge: null, ledgeCool: 0, event: null };
}

// The box he could take hold of: beside him, standing on the same level.
function reachable(b, boxes) {
  for (const box of boxes) {
    if (box.gone || !box.onGround) continue;
    const level = Math.abs(box.y + box.h - (b.y + b.h)) < 24;
    if (level && Math.abs(box.x - (b.x + b.w)) < 10) return [box, 1];
    if (level && Math.abs(b.x - (box.x + box.w)) < 10) return [box, -1];
  }
  return null;
}

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// A ledge in reach as he flies past a wall he's facing: the top corner of a cliff, the stump, a box or a pit lip,
// with room above it to stand. Returns { x: corner x, y: top, side: which way the wall is from him, box }.
function findLedge(b, boxes) {
  const corners = [];
  for (const s of [...STATIC, ...boxes]) {
    if (s.gone || (s.onGround === false)) continue;
    corners.push({ x: s.x, y: s.y, side: 1, box: boxes.includes(s) ? s : null });
    corners.push({ x: s.x + s.w, y: s.y, side: -1, box: boxes.includes(s) ? s : null });
  }
  corners.push(...LIPS.map((l) => ({ ...l, box: null })));
  for (const c of corners) {
    if (c.side !== b.face) continue;
    const gap = c.side > 0 ? c.x - (b.x + b.w) : b.x - c.x;
    if (gap < -4 || gap > 10) continue;
    if (c.y < b.y - REACH[0] || c.y > b.y + REACH[1]) continue;
    // room to stand on top
    const top = { x: c.side > 0 ? c.x + 2 : c.x - b.w - 2, y: c.y - b.h - 2, w: b.w, h: b.h };
    if ([...STATIC, ...boxes].some((s) => !s.gone && overlap(top, s))) continue;
    if (surfaceY(top.x + b.w / 2) < c.y - 4) continue; // higher ground there: not a ledge
    return c;
  }
  return null;
}

// Hanging from a ledge, then pulling himself up onto it. Holding towards it (or up / jump) climbs, down or away
// lets go. The climb moves him up, then over, along the shape of the animation.
function stepLedge(b, inp, dt, f) {
  const L = b.ledge;
  L.t += dt;
  if (L.box) { L.x = L.side > 0 ? L.box.x : L.box.x + L.box.w; L.y = L.box.y; }
  const hangX = L.side > 0 ? L.x - b.w : L.x, hangY = L.y + 4;
  if (L.phase === 'hang') {
    const toward = L.side > 0 ? inp.right : inp.left, away = L.side > 0 ? inp.left : inp.right;
    // settle into the hang over a few steps rather than snapping to it
    b.x = hangX; b.y += (hangY - b.y) * (dt ? 0.35 : 0); b.vx = 0; b.vy = 0;
    if ((inp.down || away) && L.t > 0.1) {
      b.ledge = null; b.ledgeCool = 0.35; b.vx = -L.side * 80; b.event = 'drop';
      return;
    }
    if (L.t > 0.1 && (toward || inp.up || inp.jump)) { L.phase = 'climb'; L.t = 0; b.event = 'climb'; }
    return;
  }
  const u = clamp01(L.t / f.climb);
  if (L.t === dt) L.y0 = b.y;
  const topX = L.side > 0 ? L.x + 6 : L.x - b.w - 6, topY = L.y - b.h;
  b.y = (L.y0 ?? hangY) + (topY - (L.y0 ?? hangY)) * ease(clamp01(u / 0.7));
  b.x = hangX + (topX - hangX) * ease(clamp01((u - 0.45) / 0.55));
  b.vx = 0; b.vy = 0;
  if (u >= 1) {
    b.ledge = null; b.y = topY; b.onGround = true; b.coyote = 0; b.jumping = false; b.event = 'stand';
  }
}

// One fixed step on foot. Sets `impact` (fall speed) on the step he lands.
export function stepBoy(b, inp, dt, boxes, f = FEEL) {
  b.cool = Math.max(0, b.cool - dt);
  b.ledgeCool = Math.max(0, b.ledgeCool - dt);
  b.event = null;
  b.jumped = false;
  b.impact = 0;
  if (b.ledge) { b.pushing = null; b.grab = null; stepLedge(b, inp, dt, f); return; }
  // take hold of a box beside him while the grab key is down; let go when it's up or either leaves the ground
  if (b.grab && (!inp.grab || !b.onGround || !b.grab.onGround || b.grab.gone)) b.grab = null;
  if (!b.grab && inp.grab && b.onGround) {
    const r = reachable(b, boxes);
    if (r) { [b.grab, b.grabSide] = r; b.face = b.grabSide; }
  }
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const top = b.grab ? f.pull : b.pushing ? f.push : f.run;
  const a = dir ? (b.onGround ? f.accel : f.airAccel) : (b.onGround ? f.decel : f.airAccel * 0.4);
  b.vx = approach(b.vx, dir * top, a * dt);
  if (dir && !b.grab) b.face = dir;
  b.coyote = b.onGround ? f.coyote : Math.max(0, b.coyote - dt);
  b.buffer = inp.jumpPressed ? f.buffer : Math.max(0, b.buffer - dt);
  b.jumped = false;
  if (b.buffer > 0 && b.coyote > 0 && !b.grab) {
    b.vy = -f.jump; b.buffer = 0; b.coyote = 0; b.jumping = true; b.jumped = true;
  }
  if (b.jumping && !inp.jump && b.vy < 0) { b.vy *= 0.5; b.jumping = false; }
  if (b.vy >= 0) b.jumping = false;
  const hang = Math.abs(b.vy) < 90 && inp.jump ? 0.55 : 1;
  const fall = b.vy > 0 ? 1.2 : 1;
  b.vy = Math.min(b.vy + GRAV * hang * fall * dt, f.maxFall);

  const was = b.onGround, vy = b.vy;
  const live = boxes.filter((x) => !x.gone);
  const others = live.filter((x) => x !== b.grab);
  b.pushing = null;
  let dx = b.vx * dt;

  if (b.grab) {
    // pushing it ahead or pulling it along: the box and the boy move together, whichever is stopped stops both
    const box = b.grab;
    if (Math.sign(dx) === b.grabSide) {
      moveBoxX(box, dx, live);
    } else if (dx) {
      const x0 = b.x;
      b.x += dx;
      for (const s of [...STATIC, ...others]) if (overlap(b, s)) b.x = dx > 0 ? s.x - b.w : s.x + s.w;
      moveBoxX(box, b.x - x0, live);
    }
    b.x = b.grabSide > 0 ? box.x - b.w : box.x + box.w;
    if (dx) b.pushing = box;
  } else {
    b.x += dx;
    for (const s of [...STATIC, ...live]) {
      if (!overlap(b, s)) continue;
      // walking into a box on the ground pushes it (unless he's really standing on it)
      if (live.includes(s) && b.onGround && s.onGround && s.y < b.y + b.h - 10 && dx) {
        moveBoxX(s, dx > 0 ? b.x + b.w - s.x : b.x - (s.x + s.w), live);
        b.pushing = s;
      }
      if (overlap(b, s)) b.x = dx > 0 ? s.x - b.w : s.x + s.w;
    }
    if (b.pushing) b.vx = Math.max(-f.push, Math.min(f.push, b.vx));
  }
  b.x = Math.max(40, Math.min(WORLD_W - 40 - b.w, b.x));

  let landed = false;
  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  for (const s of [...STATIC, ...live]) if (overlap(b, s)) {
    if (prevBottom <= s.y + 4) { b.y = s.y - b.h; landed = true; } else if (b.vy < 0) b.y = s.y + s.h;
    else continue;
    b.vy = 0;
  }
  // ground (sampled under the middle of the feet)
  const gy = groundY(b.x + b.w / 2);
  const foot = b.y + b.h;
  if (!landed && (foot > gy || (b.vy >= 0 && foot >= gy - (was ? 26 : 0)))) {
    b.y = gy - b.h; b.vy = 0; landed = true;
  }
  b.onGround = landed;
  b.impact = !was && landed ? vy : 0;

  // catch a ledge on the way past
  if (!landed && b.ledgeCool <= 0 && b.vy > -520) {
    const c = findLedge(b, live);
    if (c) {
      b.ledge = { ...c, phase: 'hang', t: 0 };
      b.vx = 0; b.vy = 0; b.jumping = false; b.event = 'ledge';
      stepLedge(b, inp, 0, f);
    }
  }
}

// Traps: a foot or a box on one springs it (the hound springs its own). Returns the trap if it caught him.
export function stepTraps(traps, b, boxes, dt) {
  let hit = null;
  for (const t of traps) {
    if (t.sprung) { t.t += dt; continue; }
    for (const box of boxes) {
      if (!box.gone && box.onGround && box.x + 4 < t.x && box.x + box.w - 4 > t.x && Math.abs(box.y + box.h - groundY(t.x)) < 30) {
        t.sprung = 'box';
      }
    }
    if (!t.sprung && b.onGround && !b.hang && Math.abs(b.x + b.w / 2 - t.x) < TRAP_REACH && Math.abs(b.y + b.h - groundY(t.x)) < 20) {
      t.sprung = 'boy'; hit = t;
    }
  }
  return hit;
}
