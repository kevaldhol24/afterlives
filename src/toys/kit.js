// Shared physics and feel for the mechanic toys. No Phaser here: rooms run in Node for tests.

export const STEP = 1 / 60;
export const GRAV = 1500;
export const MAX_FALL = 950;

export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rect = (x, y, w, h, extra) => ({ x, y, w, h, ...extra });
export const cx = (b) => b.x + b.w / 2;
export const cy = (b) => b.y + b.h / 2;

export function body(x, y, w, h, extra) {
  return { x: x - w / 2, y: y - h, w, h, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, buffer: 0, ...extra };
}

// Move by (dx, dy) one axis at a time. A solid the body already overlaps is ignored, so a
// platform that appears around the body never traps it.
export function moveBy(b, dx, dy, solids) {
  const live = solids.filter((s) => !overlap(b, s));
  b.wallHit = 0;
  b.x += dx;
  for (const s of live) if (overlap(b, s)) {
    if (cx(b) < cx(s)) { b.x = s.x - b.w; b.wallHit = 1; } else { b.x = s.x + s.w; b.wallHit = -1; }
    b.vx = 0;
  }
  let landed = false;
  b.y += dy;
  for (const s of live) if (overlap(b, s)) {
    if (cy(b) < cy(s)) { b.y = s.y - b.h; landed = true; } else b.y = s.y + s.h;
    b.vy = 0;
  }
  return landed;
}

export function move(b, solids, dt) {
  b.onGround = moveBy(b, b.vx * dt, b.vy * dt, solids);
}

export const FEEL = {
  run: 230, accel: 2600, decel: 3400, airAccel: 1800,
  jump: 600, coyote: 0.1, buffer: 0.12, gravity: 1, maxFall: MAX_FALL,
};

// Snappy platformer control: quick start and stop, variable jump height (let go early = lower),
// a little hang at the apex, faster falls, coyote time and a jump buffer.
export function platformer(b, inp, dt, f = FEEL) {
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const a = dir ? (b.onGround ? f.accel : f.airAccel) : (b.onGround ? f.decel : f.airAccel * 0.4);
  b.vx = approach(b.vx, dir * f.run, a * dt);
  if (dir) b.face = dir;
  b.coyote = b.onGround ? f.coyote : Math.max(0, b.coyote - dt);
  b.buffer = inp.jumpPressed ? f.buffer : Math.max(0, b.buffer - dt);
  if (b.buffer > 0 && b.coyote > 0 && f.jump > 0) {
    b.vy = -f.jump; b.buffer = 0; b.coyote = 0; b.jumping = true;
  }
  if (b.jumping && !inp.jump && b.vy < 0) { b.vy *= 0.45; b.jumping = false; }
  if (b.vy >= 0) b.jumping = false;
  const hang = Math.abs(b.vy) < 70 && inp.jump ? 0.55 : 1;
  const fall = b.vy > 0 ? 1.25 : 1;
  b.vy = Math.min(b.vy + GRAV * f.gravity * hang * fall * dt, f.maxFall);
}

// Distance from a point to the nearest point of a rectangle.
export function distToRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

// Split a long rectangle into tiles so each part can be lit (or not) on its own.
export function tiles(x, y, w, h, size, vertical = false) {
  const out = [];
  if (vertical) for (let ty = y; ty < y + h; ty += size) out.push(rect(x, ty, w, Math.min(size, y + h - ty)));
  else for (let tx = x; tx < x + w; tx += size) out.push(rect(tx, y, Math.min(size, x + w - tx), h));
  return out;
}

export const INK = 0x0a0c0c;

// Draw a silhouette character: a rounded body with a glowing eye, squashed a little by speed.
export function drawCritter(g, b, opts = {}) {
  const sx = 1 + Math.min(Math.abs(b.vy) / 3000, 0.08) * (b.vy < 0 ? -1 : 1);
  const w = b.w / sx, h = b.h * sx;
  const x = cx(b) - w / 2, y = b.y + b.h - h;
  g.fillStyle(opts.color ?? INK, opts.alpha ?? 1);
  g.fillRoundedRect(x, y, w, h, Math.min(8, w / 2.5));
  if (opts.eye !== false) {
    const ex = cx(b) + b.face * w * 0.22, ey = y + h * 0.28;
    g.fillStyle(opts.eyeColor ?? 0xf3f0d8, opts.eyeAlpha ?? 1);
    g.fillCircle(ex, ey, opts.eyeSize ?? 2.6);
  }
}
