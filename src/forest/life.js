// What moves in the forest: grass in the wind, hanging ropes, crows, flies, dust in the light, leaves, puffs.
import { surfaceY, perches, VIEW_W, VIEW_H, TRAP_XS } from './world.js';
import { ROPES, ropeAnchor } from './layers.js';
import { S, hex } from './style.js';

const hash = (i) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// Wind: a slow breeze with gusts rolling through, shared by everything that sways (and the sound).
export function windAt(t, x = 0) {
  const gust = Math.max(0, Math.sin(t * 0.21 - x * 0.0006) * Math.sin(t * 0.53 + 1.3 - x * 0.0011));
  return 0.35 + 0.25 * Math.sin(t * 0.9 - x * 0.003) + gust * 1.3;
}

// ---------- grass ----------

const BLADE = 6.5;
// Blades along the ground near the camera; the ones every few blades stand in front of the boy.
export function drawGrass(back, front, camX, t, boy) {
  const i0 = Math.floor((camX - 40) / BLADE), i1 = Math.ceil((camX + VIEW_W + 40) / BLADE);
  const bx = boy.x + boy.w / 2, feet = boy.y + boy.h;
  back.fillStyle(hex(S.ink), 1);
  front.fillStyle(hex(S.ink), 1);
  for (let i = i0; i <= i1; i++) {
    const r1 = hash(i), r2 = hash(i + 7919), r3 = hash(i + 104729);
    const x = i * BLADE + (r1 - 0.5) * BLADE;
    const gy = surfaceY(x) + 4;
    const isFront = r3 < 0.22;
    let h = (isFront ? 18 : 12) + r2 * (isFront ? 30 : 26);
    if (Math.sin(x * 0.0031 + 2) + Math.sin(x * 0.0077) < -0.9) h *= 0.45;
    if (TRAP_XS.some((t) => Math.abs(x - t) < 48)) h *= 0.3; // keep the traps in plain sight
    const w = 1.6 + r1 * 1.8;
    const wind = windAt(t, x);
    let lean = (r3 - 0.5) * 0.7 + Math.sin(t * 2.1 + x * 0.02 + r1 * 6) * 0.12 * wind + wind * 0.18;
    // the boy parts the grass as he walks through it
    const dx = x - bx;
    if (Math.abs(dx) < 46 && feet > gy - h - 10) lean += Math.sign(dx || 1) * (1 - Math.abs(dx) / 46) * 1.0 + boy.vx * 0.0006;
    const tx = x + Math.sin(lean) * h, ty = gy - Math.cos(lean) * h;
    const mx = x + Math.sin(lean * 0.45) * h * 0.55, my = gy - Math.cos(lean * 0.45) * h * 0.55;
    const g = isFront ? front : back;
    g.fillTriangle(x - w, gy, x + w, gy, mx + w * 0.4, my);
    g.fillTriangle(x - w, gy, mx + w * 0.4, my, mx - w * 0.4, my);
    g.fillTriangle(mx - w * 0.4, my, mx + w * 0.4, my, tx, ty);
  }
}

// ---------- ropes ----------

const LINKS = 18;
export function makeRopes() {
  return ROPES.map((R) => {
    const a = ropeAnchor(R.x);
    const seg = (R.to ? R.to - a.y : R.len) / LINKS;
    const pts = [];
    for (let i = 0; i <= LINKS; i++) pts.push({ x: a.x, y: a.y + i * seg, px: a.x, py: a.y + i * seg });
    return { a, seg, pts, w: 3.6 + hash(R.x) * 2 };
  });
}

export function stepRopes(ropes, dt, t, boy) {
  for (const rope of ropes) {
    const { pts } = rope;
    const wind = windAt(t, rope.a.x);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985;
      p.px = p.x; p.py = p.y;
      p.x += vx + (wind * 22 + Math.sin(t * 1.7 + i * 0.4) * 10) * dt * dt * (i / pts.length);
      p.y += vy + 900 * dt * dt;
      // brushed aside by the boy (unless he's hanging from it)
      if (boy.hang?.rope !== rope && p.x > boy.x - 6 && p.x < boy.x + boy.w + 6 && p.y > boy.y && p.y < boy.y + boy.h) {
        const mid = boy.x + boy.w / 2;
        const out = p.x < mid ? boy.x - 6 : boy.x + boy.w + 6;
        p.x += (out - p.x) * 0.5;
        p.px -= boy.vx * dt * 0.25;
      }
    }
    pts[0].x = rope.a.x; pts[0].y = rope.a.y;
    for (let k = 0; k < 8; k++) for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const diff = (d - rope.seg) / d;
      if (i === 0) { b.x -= dx * diff; b.y -= dy * diff; } else {
        a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
      }
    }
  }
}

// Catch a rope he jumps into: any link level with his hands.
export function tryGrabRope(ropes, b) {
  if (b.onGround || b.cool > 0 || b.hang || b.ledge) return false;
  for (const rope of ropes) {
    for (let i = 3; i < rope.pts.length; i++) {
      const p = rope.pts[i];
      if (p.x > b.x - 10 && p.x < b.x + b.w + 10 && p.y > b.y - 16 && p.y < b.y + 70) {
        b.hang = { rope, i, climb: 0 };
        b.grab = null;
        return true;
      }
    }
  }
  return false;
}

// Before the rope moves: his weight on it, left / right to pump the swing, up / down to climb.
export function hangForces(b, inp, dt) {
  const { rope } = b.hang, pts = rope.pts;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  b.hang.climb += dt;
  if (b.hang.climb > 0.12) {
    if (inp.up && b.hang.i > 4) { b.hang.i--; b.hang.climb = 0; }
    else if (inp.down && b.hang.i < pts.length - 1) { b.hang.i++; b.hang.climb = 0; }
  }
  for (let k = b.hang.i; k < pts.length; k++) {
    pts[k].y += 600 * dt * dt;
    pts[k].x += dir * (k === b.hang.i ? 1300 : 500) * dt * dt;
  }
  if (dir) b.face = dir;
}

// After the rope moves: hang from the link; Space lets go with the swing's speed. Returns 'release' then.
export function hangPlace(b, inp, dt) {
  const p = b.hang.rope.pts[b.hang.i];
  b.vx = (p.x - p.px) / dt;
  b.vy = (p.y - p.py) / dt;
  b.x = p.x - b.w / 2;
  b.y = p.y - 4;
  b.onGround = false;
  if (inp.leapPressed) {
    b.hang = null;
    b.cool = 0.4;
    b.vx = Math.max(-560, Math.min(560, b.vx * 1.15));
    b.vy = Math.min(b.vy, 0) - 520;
    b.jumping = true;
    return 'release';
  }
  return null;
}

export function drawRopes(g, ropes) {
  g.fillStyle(hex(S.ink), 1);
  for (const rope of ropes) {
    const { pts } = rope;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const w = rope.w * (1 - (i / pts.length) * 0.35);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const nx = (-dy / d) * w / 2, ny = (dx / d) * w / 2;
      g.fillPoints([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }], true);
      g.fillCircle(b.x, b.y, w / 2);
    }
    // the twist of the strands, catching a little light down the lit side
    g.lineStyle(1, 0xffd682, 0.2);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const w = rope.w * (1 - (i / pts.length) * 0.35) / 2;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      for (let s = 0; s < d; s += 5) {
        const x = a.x + ux * s, y = a.y + uy * s;
        g.lineBetween(x - uy * w * 0.9, y + ux * w * 0.9, x + uy * w * 0.2 + ux * 3, y - ux * w * 0.2 + uy * 3);
      }
    }
    // frayed end
    const e = pts[pts.length - 1], q = pts[pts.length - 2];
    const ang = Math.atan2(e.y - q.y, e.x - q.x);
    for (const s of [-0.35, 0, 0.3]) {
      const tx = e.x + Math.cos(ang + s) * 12, ty = e.y + Math.sin(ang + s) * 12;
      g.fillTriangle(e.x - 1.6, e.y, e.x + 1.6, e.y, tx, ty);
    }
  }
}

// ---------- crows ----------

export function makeCrows() {
  return perches().map((p, i) => ({
    x: p.x, y: p.y, face: p.face, state: 'sit', vx: 0, vy: 0, flap: hash(i) * 6, peck: 0,
    nextPeck: 1 + hash(i + 3) * 3, hop: 0, scale: 0.9 + hash(i + 11) * 0.25,
  }));
}

// Returns how many took off this step (for the flutter sound).
export function stepCrows(crows, dt, boy) {
  let took = 0;
  const bx = boy.x + boy.w / 2;
  for (const c of crows) {
    if (c.state === 'sit') {
      c.nextPeck -= dt;
      if (c.nextPeck <= 0) {
        if (Math.random() < 0.25) { c.face = -c.face; c.nextPeck = 1 + Math.random() * 2; } else { c.peck = 0.45; c.nextPeck = 0.8 + Math.random() * 3; }
      }
      c.peck = Math.max(0, c.peck - dt);
      const near = Math.abs(bx - c.x) < 300 + (c.scale - 1) * 300;
      if (near && Math.abs(boy.vx) > 40 || Math.abs(bx - c.x) < 150) {
        c.state = 'fly';
        const away = Math.sign(c.x - bx) || 1;
        c.face = away;
        c.vx = away * (150 + Math.random() * 180);
        c.vy = -(380 + Math.random() * 220);
        c.delay = Math.random() * 0.25;
        took++;
      }
    } else if (c.state === 'fly') {
      if (c.delay > 0) { c.delay -= dt; continue; }
      c.flap += dt * 17;
      c.vx += c.face * 260 * dt;
      c.vy += (-260 - c.vy) * dt * 1.2;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.y < -200) c.state = 'gone';
    }
  }
  return took;
}

// Crows in silhouette. Sitting: a full chest, a long wedge tail that bobs, a heavy beak, the head turning and
// pecking. Flying: two-jointed wings that sweep down spread and fold on the way up, primaries splayed at the tips.
export function drawCrows(g, crows, t) {
  const ink = hex(S.ink);
  for (const c of crows) {
    if (c.state === 'gone') continue;
    const s = c.scale, f = c.face;
    const X = (dx) => c.x + dx * f * s, Y = (dy) => c.y + dy * s;
    const Pt = (dx, dy) => ({ x: X(dx), y: Y(dy) });
    g.fillStyle(ink, 1);
    if (c.state === 'sit' || c.delay > 0) {
      const pk = c.peck > 0 ? Math.sin((c.peck / 0.45) * Math.PI) : 0;
      const crouch = c.delay > 0 ? 3 : 0;
      const bob = Math.sin(t * 2.3 + c.flap) * 1.2;
      const tail = Math.sin(t * 1.7 + c.flap * 2) * 2 + pk * 2;
      g.lineStyle(1.8 * s, ink, 1);
      g.lineBetween(X(-2), Y(-9 + crouch), X(-4), Y(0));
      g.lineBetween(X(3), Y(-9 + crouch), X(2), Y(0));
      g.lineBetween(X(-4), Y(0), X(1), Y(0));
      g.lineBetween(X(2), Y(0), X(7), Y(0));
      g.fillPoints([Pt(-30, -10 + tail), Pt(-16, -18 + crouch), Pt(-4, -24 + crouch + bob * 0.3), Pt(8, -26 + crouch),
        Pt(14, -21 + crouch), Pt(12, -13 + crouch), Pt(4, -8 + crouch), Pt(-8, -9 + crouch), Pt(-31, -6 + tail)], true);
      const hx = 12 + pk * 6, hy = -28 + crouch + pk * 13 + bob * 0.4;
      g.fillCircle(X(hx), Y(hy), 6.6 * s);
      g.fillPoints([Pt(hx + 3, hy - 3.5), Pt(hx + 11, hy - 1.5), Pt(hx + 17, hy + 1.5), Pt(hx + 9, hy + 2.5), Pt(hx + 3, hy + 3)], true);
      for (const [a, b] of [[-2, -27], [2, -28]]) g.fillTriangle(X(a - 3), Y(b + crouch + 3), X(a + 3), Y(b + crouch + 3), X(a - 2), Y(b + crouch - 3));
      // light on the back and the eye catching it
      g.lineStyle(1.2, 0xffd682, 0.2);
      g.lineBetween(X(-14), Y(-18 + crouch), X(6), Y(-25.5 + crouch));
      g.fillStyle(0xd8d0b0, 0.55);
      g.fillCircle(X(hx + 2.5), Y(hy - 1.5), 0.9 * s);
    } else {
      const w = Math.sin(c.flap), up = Math.cos(c.flap) > 0;
      const tilt = Math.max(-0.5, Math.min(0.5, c.vy / 900));
      const R = (dx, dy) => Pt(dx * Math.cos(tilt) - dy * Math.sin(tilt) * f, dy * Math.cos(tilt) + dx * Math.sin(tilt) * f);
      const by = -w * 2;
      g.fillPoints([R(-14, by - 2), R(-2, by - 6), R(10, by - 5), R(16, by - 2), R(10, by + 3), R(-6, by + 4), R(-14, by + 2)], true);
      g.fillPoints([R(-12, by - 1), R(-30, by - 4 + w * 2), R(-31, by + 3 + w * 2), R(-12, by + 3)], true);
      g.fillCircle(R(17, by - 2).x, R(17, by - 2).y, 5.4 * s);
      g.fillPoints([R(20, by - 4.5), R(30, by - 1.5), R(20, by + 0.5)], true);
      // far wing a beat behind and shorter, near wing in front
      for (const [lag, k] of [[0.5, 0.75], [0, 1]]) {
        const ww = Math.sin(c.flap - lag), fold = Math.cos(c.flap - lag) > 0 ? 0.5 : 1;
        const sh = { x: 2, y: by - 3 };
        const el = { x: sh.x - 6, y: sh.y - 18 * ww * k };
        const tip = { x: el.x - (10 + 10 * fold) * k, y: el.y - 22 * ww * fold * k };
        g.fillPoints([R(sh.x + 7, sh.y), R(el.x + 3, el.y), R(tip.x, tip.y), R(tip.x - 3, tip.y + 6 * Math.sign(ww || 1)),
          R(el.x - 9, el.y + 7 * Math.sign(ww || 1)), R(sh.x - 10, sh.y + 2)], true);
        for (let q = 0; q < 3; q++) {
          const a = R(tip.x + q * 3, tip.y + q * 2 * Math.sign(ww || 1)), b = R(tip.x - 9 + q * 2, tip.y + (4 + q * 4) * Math.sign(ww || 1));
          g.fillTriangle(a.x, a.y, b.x, b.y, a.x + 3, a.y + 3);
        }
      }
      void up;
    }
  }
}

// ---------- far flocks (on the second layer) ----------

export function makeFlock(camX, f) {
  const n = 5 + Math.floor(Math.random() * 6);
  const dir = Math.random() < 0.5 ? -1 : 1;
  const y = 120 + Math.random() * 220;
  const x = camX * f + (dir > 0 ? -80 : VIEW_W + 80);
  return { f, dir, birds: Array.from({ length: n }, (_, i) => ({ dx: -dir * i * (14 + Math.random() * 16), dy: (Math.random() - 0.5) * 50 + Math.abs(i - n / 2) * 6, ph: Math.random() * 6 })), x, y, speed: 70 + Math.random() * 40 };
}

export function drawFlock(g, fl, camX, t, dt) {
  fl.x += fl.dir * fl.speed * dt;
  fl.y -= 6 * dt;
  g.lineStyle(1.6, S.flock, 0.85);
  for (const b of fl.birds) {
    const x = fl.x + b.dx - camX * fl.f, y = fl.y + b.dy + Math.sin(t * 1.2 + b.ph) * 3;
    const w = Math.sin(t * 12 + b.ph) * 4;
    g.lineBetween(x - 6, y - w, x, y);
    g.lineBetween(x, y, x + 6, y - w);
  }
  const sx = fl.x - camX * fl.f;
  return sx > -300 && sx < VIEW_W + 300;
}

// ---------- particles ----------

// Dust floating in the light (screen space, drawn additively). Brighter near the light.
export function makeDust(n, light) {
  return Array.from({ length: n }, (_, i) => ({
    x: Math.random() * (VIEW_W + 200), y: Math.random() * VIEW_H * 0.85, s: 1 + Math.random() * 2.4,
    ph: Math.random() * 6, f: 0.75 + Math.random() * 0.5, light,
  }));
}

export function drawDust(g, dust, camX, t) {
  const W = VIEW_W + 200;
  for (const d of dust) {
    const x = ((d.x - camX * d.f + Math.sin(t * 0.3 + d.ph) * 30 + t * 6) % W + W) % W - 100;
    const y = d.y + Math.sin(t * 0.21 + d.ph * 2) * 40 - ((t * 4 * d.f) % VIEW_H);
    const yy = ((y % VIEW_H) + VIEW_H) % VIEW_H;
    const near = Math.max(0, 1 - Math.hypot(x / VIEW_W - d.light.x, (yy / VIEW_H - d.light.y) * 0.8) * 1.25);
    const a = (0.08 + 0.5 * near) * (0.6 + 0.4 * Math.sin(t * 1.3 + d.ph * 3));
    if (a < 0.03) continue;
    g.fillStyle(S.dust, a);
    g.fillCircle(x, yy, d.s);
  }
}

// Leaves drifting down in front of the play plane (screen space).
export function makeLeaves(n) {
  return Array.from({ length: n }, () => ({
    x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, vy: 30 + Math.random() * 40, ph: Math.random() * 6, s: 4 + Math.random() * 5,
  }));
}

export function drawLeaves(g, leaves, camX, lastCam, t, dt) {
  g.fillStyle(S.leaf, 0.9);
  for (const l of leaves) {
    l.y += l.vy * dt;
    l.x += (Math.sin(t * 1.4 + l.ph) * 40 + windAt(t) * 30) * dt - (camX - lastCam) * 1.05;
    if (l.y > VIEW_H + 20 || l.x < -60 || l.x > VIEW_W + 60) {
      l.y = -20; l.x = Math.random() * (VIEW_W + 200) - 100;
    }
    // a pointed leaf tumbling: it turns in the plane and flips edge-on
    const spin = Math.sin(t * 2.6 + l.ph), a = t * 1.1 + l.ph * 3;
    const ca = Math.cos(a), sa = Math.sin(a), wy = Math.max(0.15, Math.abs(spin));
    const pt = (u, v) => ({ x: l.x + u * l.s * ca - v * l.s * wy * sa, y: l.y + u * l.s * sa + v * l.s * wy * ca });
    g.fillPoints([pt(-1.2, 0), pt(-0.4, -0.45), pt(0.6, -0.35), pt(1.2, 0), pt(0.6, 0.35), pt(-0.4, 0.45)], true);
    const st = pt(-1.2, 0), st2 = pt(-1.7, 0.1);
    g.lineStyle(1, S.leaf, 0.9);
    g.lineBetween(st.x, st.y, st2.x, st2.y);
  }
}

// Little dust puffs from the feet (world space).
export function puff(puffs, x, y, n, power) {
  for (let i = 0; i < n; i++) {
    puffs.push({ x: x + (Math.random() - 0.5) * 20, y: y - 2, vx: (Math.random() - 0.5) * 70 * power, vy: -(10 + Math.random() * 40) * power, life: 0, max: 0.6 + Math.random() * 0.5, s: 4 + Math.random() * 6 });
  }
}

export function drawPuffs(g, puffs, dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life += dt;
    if (p.life > p.max) { puffs.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
    const k = p.life / p.max;
    g.fillStyle(S.puff, 0.28 * (1 - k));
    g.fillCircle(p.x, p.y, p.s * (0.6 + k));
  }
}

// A cloud of flies over the stump.
export function drawFlies(g, x, y, t) {
  g.fillStyle(hex(S.ink), 1);
  for (let i = 0; i < 16; i++) {
    const a = t * (2 + hash(i) * 3) + i * 7;
    const fx = x + Math.sin(a) * (20 + hash(i + 3) * 40) + Math.sin(a * 2.7) * 8;
    const fy = y + Math.cos(a * 1.3) * (14 + hash(i + 5) * 26) + Math.sin(a * 3.1) * 6;
    g.fillCircle(fx, fy, 1.6);
  }
}

