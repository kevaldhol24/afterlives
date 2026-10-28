// The boy: a black silhouette in a baseball cap, open jacket, backpack, knee-length shorts and chunky shoes,
// with two white eyes under the brim. Posed by hand every frame: each state (stand, walk / run, jump, land, push,
// pull, hang from a rope, hang from a ledge and climb up) gives targets for the hips, lean, hands and feet;
// the targets are eased so states blend into each other, and two-bone IK places the knees and elbows, so hands
// grip what they hold and feet stay planted. When he dies he becomes a ragdoll.
import { S, hex } from './style.js';
import { FEEL, surfaceY, groundY, WATER_Y, PIT } from './world.js';

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// Body sizes (px).
const THIGH = 27, SHIN = 24, UPPER = 21, FORE = 20, TORSO = 32, NECK = 14, HEAD_R = 15, ANKLE = 6;
const RIM = 0xffd682;
// The rope pose hangs from this point (his hands, relative to his feet), the pivot when the rope tilts him.
const PIVOT = { x: 0, y: -108 };

// ---------- animation state ----------

export function makeLook() {
  return {
    phase: 0, move: 0, air: 0, squash: 0, blink: 0, nextBlink: 2.5, breath: 0, idle: 0,
    hold: 0, pull: 0, hang: 0, ledge: 0, rot: 0, faceVis: 1, ropeT: 0, ropeHand: 0, ropeI: -1,
    pack: 0, packV: 0, ctl: null, J: null, root: { x: 0, y: 0 },
  };
}

// ---------- target poses (local, facing right, origin at his feet, y down) ----------

const P = (x, y) => ({ x, y });
// controls: hip, lean (rad, + forward), head tilt, hands [near, far], ankles [near, far], toe angles
const pose = (hip, lean, hands, ankles, toes = [0, 0], head = 0) => ({ hip, lean, hands, ankles, toes, head });

function standPose(lk) {
  const br = Math.sin(lk.breath * 2.1);
  const shift = Math.sin(lk.breath * 0.37) * 1.4;
  // every so often, a hand goes up to the backpack strap
  const strap = smooth(Math.min(1, (lk.idle % 9 - 5) * 3)) * smooth(Math.min(1, (6.6 - lk.idle % 9) * 3));
  const idle = lk.idle > 4 ? strap : 0;
  return pose(P(-1 + shift, -53 + br * 0.6), 0.03 + br * 0.01,
    [P(mix(3, 7, idle), mix(-48, -80, idle) + br * 0.4), P(-3, -49 + br * 0.4)],
    [P(5 + shift * 0.3, -ANKLE), P(-6 + shift * 0.3, -ANKLE)], [0, 0], -0.03 + Math.sin(lk.breath * 0.23) * 0.04);
}

// The gait at speed share r: stride and lift grow with speed; the cycle runs on distance so feet never slide.
function gaitPose(lk, r, o = {}) {
  const L = o.stride ?? (30 + 44 * r), lift = o.lift ?? (7 + 13 * r);
  const ankles = [], toes = [], hands = [];
  for (let k = 0; k < 2; k++) {
    const c = (((lk.phase + k * Math.PI) / TAU) % 1 + 1) % 1;
    let x, y = -ANKLE, toe = 0;
    if (c < 0.5) {
      const s = c / 0.5;
      x = L / 2 - L * s;
      if (s > 0.68) toe = ((s - 0.68) / 0.32) * 0.55;  // heel coming up
    } else {
      const s = (c - 0.5) / 0.5, e = smooth(s);
      x = -L / 2 + L * e;
      y -= lift * Math.sin(Math.PI * s) + (o.kick ?? r) * 16 * Math.sin(Math.PI * Math.min(1, s * 1.7)) * (s < 0.6 ? 1 : 0);
      toe = 0.5 * (1 - s) - 0.3 * Math.sin(Math.PI * s * 0.9) * (s > 0.7 ? 1 : 0);
    }
    ankles.push(P(x + (o.feetX ?? 0), y));
    toes.push(toe);
    // arms swing against the legs; running pulls the hands up and bends the elbows
    const fwd = -Math.cos(lk.phase + k * Math.PI);
    const b = fwd * (0.3 + 0.6 * r) + 0.12 * r;
    const reach = (UPPER + FORE) * mix(0.86, 0.6, r);
    hands.push(P(Math.sin(b) * reach + 2, -84 + Math.cos(b) * reach));
  }
  const bob = (0.8 + 2.4 * r) * Math.cos(2 * lk.phase);
  const lean = 0.04 + 0.17 * r;
  return pose(P(2 * r, -53 + bob - r * 1.5), lean, hands, ankles, toes, -lean * 0.5);
}

function airPose(lk, t) {
  const up = lk.air < 0 ? -lk.air : 0, down = lk.air > 0 ? lk.air : 0;
  const flail = Math.sin(t * 9) * down;
  // arms reach up and out past the outline (inside it, the silhouette would swallow them)
  const rise = pose(P(0, -58), 0.14, [P(24, -112), P(-26, -62)], [P(12, -30), P(-11, -12)], [-0.2, 0.5], -0.12);
  const fall = pose(P(0, -55), -0.06, [P(26 + flail * 3, -108 + flail * 5), P(-26 - flail * 2, -104 - flail * 4)],
    [P(9, -6), P(-8, -16)], [0.3, 0.2], 0.14);
  const top = pose(P(0, -57), 0.06, [P(31, -80), P(-30, -86)], [P(11, -20), P(-9, -10)], [0.1, 0.4], 0);
  return up > 0 ? blend(top, rise, up) : blend(top, fall, down);
}

// Hanging from a rope link: arms up, legs dangling and trailing the swing; climbing goes hand over hand.
function ropePose(lk, swing) {
  const lead = P(0, PIVOT.y), trail = P(1, PIVOT.y + 17 * (1 - lk.ropeT));
  const hands = lk.ropeHand ? [trail, lead] : [lead, trail];
  const trailLegs = clamp(-swing * 0.018, -14, 14), pullUp = Math.sin(lk.ropeT * Math.PI) * 12;
  // the body leans back off the rope with the face turned up to the hands, so the grip shows clear of the head
  return pose(P(-10, PIVOT.y + 75), -0.2, hands,
    [P(-6 + trailLegs, 8 - pullUp), P(-13 + trailLegs * 1.2, 4 - pullUp * 0.5)], [0.6, 0.8], 0.5);
}

// Ledge: keyframes relative to the corner he holds (x onto the ledge, y down), u = climb progress.
const LEDGE = [
  [0, pose(P(-12, 60), 0.05, [P(1, -1), P(-3, 0)], [P(-6, 114), P(-11, 110)], [0.6, 0.7], 0.2)],
  [0.35, pose(P(-9, 24), 0.35, [P(1, -1), P(-3, 0)], [P(-6, 72), P(-12, 78)], [0.5, 0.6], 0.1)],
  [0.6, pose(P(-5, 4), 0.72, [P(7, -2), P(3, -2)], [P(10, -6), P(-10, 52)], [0, 0.6], -0.1)],
  [0.82, pose(P(12, -34), 0.42, [P(16, -14), P(9, -6)], [P(21, -6), P(5, -12)], [0, 0.3], -0.05)],
  [1, pose(P(22, -53), 0.04, [P(25, -49), P(19, -50)], [P(28, -6), P(17, -6)], [0, 0], 0)],
];
function ledgePose(u, t) {
  let i = 0;
  while (i < LEDGE.length - 2 && u > LEDGE[i + 1][0]) i++;
  const [u0, a] = LEDGE[i], [u1, b] = LEDGE[i + 1];
  const p = blend(a, b, smooth((u - u0) / (u1 - u0)));
  if (u === 0) { // feet scrabble a little against the wall
    p.ankles[0].y += Math.sin(t * 3) * 2;
    p.hip.x += Math.sin(t * 1.3) * 1;
  }
  return p;
}

function blend(a, b, t) {
  const lp = (p, q) => P(mix(p.x, q.x, t), mix(p.y, q.y, t));
  return {
    hip: lp(a.hip, b.hip), lean: mix(a.lean, b.lean, t), head: mix(a.head, b.head, t),
    hands: [lp(a.hands[0], b.hands[0]), lp(a.hands[1], b.hands[1])],
    ankles: [lp(a.ankles[0], b.ankles[0]), lp(a.ankles[1], b.ankles[1])],
    toes: [mix(a.toes[0], b.toes[0], t), mix(a.toes[1], b.toes[1], t)],
  };
}
const shift = (p, dx, dy) => ({
  ...p, hip: P(p.hip.x + dx, p.hip.y + dy), hands: p.hands.map((h) => P(h.x + dx, h.y + dy)),
  ankles: p.ankles.map((a) => P(a.x + dx, a.y + dy)),
});

// ---------- per frame ----------

// Advance the look from the body. root = his feet as drawn (interpolated). Returns 'step' on a footfall.
export function animate(look, b, root, dt, t) {
  const lk = look;
  const speed = Math.abs(b.vx);
  const k = (rate) => 1 - Math.exp(-dt * rate);
  const box = b.grab || b.pushing;
  const pulling = b.grab && Math.abs(b.vx) > 10 && Math.sign(b.vx) === -b.grabSide;
  const moving = b.onGround && speed > 8;
  // the cycle runs on distance: half a cycle per stride
  const r = clamp(speed / FEEL.run, 0, 1);
  const stride = box ? 24 : 30 + 44 * r;
  const before = lk.phase;
  if (b.onGround) lk.phase += (speed * dt * Math.PI / stride) * (pulling ? -1 : 1);
  lk.move = mix(lk.move, moving ? 1 : 0, k(moving ? 14 : 9));
  lk.hold = mix(lk.hold, box && b.onGround ? 1 : 0, k(12));
  lk.pull = mix(lk.pull, pulling ? 1 : 0, k(8));
  lk.hang = mix(lk.hang, b.hang ? 1 : 0, k(16));
  const tgt = b.onGround || b.hang || b.ledge ? 0 : clamp(b.vy / 700, -1, 1);
  lk.air = mix(lk.air, tgt, k(b.onGround || b.ledge ? 20 : 7));
  lk.squash = Math.max(0, lk.squash - dt * 3);
  if (b.impact > 300) lk.squash = Math.min(1, b.impact / 1500);
  lk.breath += dt;
  lk.idle = moving || !b.onGround || box ? 0 : lk.idle + dt;
  lk.nextBlink -= dt;
  if (lk.nextBlink <= 0) { lk.blink = 0.13; lk.nextBlink = 2 + Math.random() * 4; }
  lk.blink = Math.max(0, lk.blink - dt);
  // the backpack bounces on a spring
  lk.packV += (-lk.pack * 260 - lk.packV * 14) * dt + (moving ? Math.cos(2 * lk.phase) * r * 40 * dt : 0) + (b.jumped ? -60 : 0);
  if (b.impact > 300) lk.packV += Math.min(90, b.impact * 0.06);
  lk.pack += lk.packV * dt;

  // rope: tilt with the rope where he holds it; climbing alternates hands
  let ropeAng = 0;
  if (b.hang) {
    const pts = b.hang.rope.pts, i = b.hang.i;
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    ropeAng = Math.atan2(-(c.x - a.x), c.y - a.y);
    if (lk.ropeI !== i) { if (lk.ropeI >= 0) { lk.ropeT = 1; lk.ropeHand ^= 1; } lk.ropeI = i; }
  } else lk.ropeI = -1;
  lk.ropeT = Math.max(0, lk.ropeT - dt / 0.14);
  lk.rot = mix(lk.rot, b.hang ? ropeAng : 0, k(b.hang ? 9 : 14));

  // the target pose for this frame
  let tp;
  if (b.ledge) {
    const L = b.ledge;
    const u = L.phase === 'climb' ? clamp(L.t / FEEL.climb, 0, 1) : 0;
    const corner = P((L.x - root.x) * b.face, L.y - root.y);
    tp = shift(ledgePose(u, t), corner.x, corner.y);
  } else if (b.hang) {
    tp = ropePose(lk, b.vx * b.face);
  } else {
    tp = blend(standPose(lk), gaitPose(lk, box ? 0.25 : r, box ? { stride, lift: 6, kick: 0, feetX: -8 } : {}), lk.move);
    if (lk.hold > 0.01) {
      // both hands on the box face; lean in to push, back to pull
      const top = box ? box.h : 116;
      const hy = -Math.min(72, top - 7), low = clamp((72 - Math.min(72, top - 7)) / 30, 0, 1);
      const push = pose(P(-10, -52 + low * 4), 0.42 + low * 0.3, [P(19, hy), P(18, hy + 5)], tp.ankles, tp.toes, -0.25);
      const pull = pose(P(-12, -54), -0.24, [P(19, hy + 6), P(18, hy + 10)], tp.ankles.map((a) => P(a.x - 4, a.y)), tp.toes, 0.1);
      push.ankles = tp.ankles.map((a) => P(a.x - 6, a.y));
      tp = blend(tp, blend(push, pull, lk.pull), lk.hold);
    }
    if (lk.air !== 0) tp = blend(tp, airPose(lk, t), Math.min(1, Math.abs(lk.air) * 1.6 + (b.onGround ? 0 : 0.5)));
    if (lk.squash > 0) {
      const s = smooth(lk.squash);
      tp.hip = P(tp.hip.x - 2 * s, tp.hip.y + 15 * s);
      tp.lean += 0.3 * s;
      tp.hands = tp.hands.map((h, i) => P(mix(h.x, 12 - i * 8, s), mix(h.y, -38, s)));
    }
  }

  // mirror to the way he faces, then ease every control towards its target
  const f = b.face;
  const m = {
    hip: P(tp.hip.x * f, tp.hip.y), lean: tp.lean * f, head: tp.head * f,
    hands: tp.hands.map((h) => P(h.x * f, h.y)), ankles: tp.ankles.map((a) => P(a.x * f, a.y)),
    toes: tp.toes.map((x) => x * f),
  };
  const snap = !lk.ctl || Math.hypot(root.x - lk.root.x, root.y - lk.root.y) > 300;
  if (snap) lk.ctl = m;
  const c = lk.ctl, kk = k(b.ledge ? 30 : 26), kf = k(b.onGround && !box ? 60 : 28);
  const ease = (p, q, w) => { p.x += (q.x - p.x) * w; p.y += (q.y - p.y) * w; };
  ease(c.hip, m.hip, kk); c.lean += (m.lean - c.lean) * kk; c.head += (m.head - c.head) * kk;
  for (let i = 0; i < 2; i++) {
    ease(c.hands[i], m.hands[i], kk);
    ease(c.ankles[i], m.ankles[i], kf);
    c.toes[i] += (m.toes[i] - c.toes[i]) * kf;
  }
  lk.faceVis = mix(lk.faceVis, f, k(22));
  lk.root = { x: root.x, y: root.y };
  lk.J = solve(c, lk, root, f);

  // a footfall: a foot comes down (the cycle passes a stance start)
  const crossed = Math.floor(before / Math.PI) !== Math.floor(lk.phase / Math.PI);
  return b.onGround && speed > 50 && crossed ? 'step' : null;
}

// Two-bone IK: from a towards target t; the middle joint bends to the side where its offset has the sign `side`
// along x (knees forward, elbows back).
function ik(a, t, l1, l2, side) {
  let dx = t.x - a.x, dy = t.y - a.y;
  let d = Math.hypot(dx, dy) || 0.001;
  const dm = clamp(d, Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  dx /= d; dy /= d;
  const cos = clamp((l1 * l1 + dm * dm - l2 * l2) / (2 * l1 * dm), -1, 1);
  const along = l1 * cos, out = l1 * Math.sqrt(1 - cos * cos);
  let nx = -dy, ny = dx;
  if (nx * side < 0 || (Math.abs(nx) < 0.05 && ny * side > 0)) { nx = -nx; ny = -ny; }
  const mid = P(a.x + dx * along + nx * out, a.y + dy * along + ny * out);
  const end = P(a.x + dx * dm, a.y + dy * dm);
  return [mid, end];
}

// Joint positions in the world from the controls.
function solve(c, lk, root, f) {
  const rot = lk.rot, cs = Math.cos(rot), sn = Math.sin(rot);
  const W = (p) => {
    const x = p.x - PIVOT.x, y = p.y - PIVOT.y;
    return P(root.x + PIVOT.x + x * cs - y * sn, root.y + PIVOT.y + x * sn + y * cs);
  };
  const hip = c.hip;
  const up = P(Math.sin(c.lean), -Math.cos(c.lean));
  const neck = P(hip.x + up.x * TORSO, hip.y + up.y * TORSO);
  const sh = P(neck.x - up.x * 5, neck.y - up.y * 5);
  const ha = c.lean + c.head;
  const headUp = P(Math.sin(ha), -Math.cos(ha));
  const head = P(neck.x + headUp.x * NECK, neck.y + headUp.y * NECK);
  const J = { hip: W(hip), neck: W(neck), sh: W(sh), head: W(head), elbows: [], hands: [], knees: [], ankles: [], toeDirs: [] };
  for (let i = 0; i < 2; i++) {
    // hanging, the arms stretch a little under his weight (so the grip shows above the cap)
    const stretch = 1 + 0.25 * lk.hang;
    const [el, hd] = ik(sh, c.hands[i], UPPER * stretch, FORE * stretch, -f);
    J.elbows.push(W(el)); J.hands.push(W(hd));
    const [kn, an] = ik(hip, c.ankles[i], THIGH, SHIN, f);
    J.knees.push(W(kn)); J.ankles.push(W(an));
    const ta = c.toes[i] + rot;
    J.toeDirs.push(P(Math.cos(ta) * f, Math.sin(ta) * f));
  }
  J.up = P(J.neck.x - J.hip.x, J.neck.y - J.hip.y);
  const hu = P(J.head.x - J.neck.x, J.head.y - J.neck.y);
  J.headUp = hu;
  return J;
}

// ---------- drawing ----------

export function drawBoy(g, glow, look, rim = 1) {
  if (!look.J) return;
  const fv = look.faceVis;
  const f = fv >= 0 ? 1 : -1, sq = Math.max(0.3, Math.abs(fv));
  const eyes = look.blink > 0 ? 0.15 : 1;
  if (rim > 0) drawFigure(g, look.J, f, sq, RIM, 0.32 * rim, -1.4, -1.3, look.pack);
  drawFigure(g, look.J, f, sq, hex(S.ink), 1, 0, 0, look.pack);
  drawEyes(g, glow, look.J, f, sq, eyes);
}

const norm = (v) => { const d = Math.hypot(v.x, v.y) || 1; return P(v.x / d, v.y / d); };

// The whole silhouette in one colour. f = which way he faces, sq = how side-on (turning squeezes it).
function drawFigure(g, J, f, sq, color, alpha, ox, oy, pack = 0) {
  g.fillStyle(color, alpha);
  const O = (p) => P(p.x + ox, p.y + oy);
  const seg = (a, b, w0, w1) => {
    const A = O(a), B = O(b);
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    g.fillPoints([P(A.x + nx * w0 / 2, A.y + ny * w0 / 2), P(B.x + nx * w1 / 2, B.y + ny * w1 / 2),
      P(B.x - nx * w1 / 2, B.y - ny * w1 / 2), P(A.x - nx * w0 / 2, A.y - ny * w0 / 2)], true);
    g.fillCircle(A.x, A.y, w0 / 2);
    g.fillCircle(B.x, B.y, w1 / 2);
  };
  // a frame along the torso: u up the spine, v forward
  const u = norm(J.up), v = P(-u.y * f, u.x * f);
  const T = (o, a, b) => O(P(o.x + v.x * a * sq + u.x * b, o.y + v.y * a * sq + u.y * b));

  // legs: shorts over the thigh, thin shins, chunky shoes
  for (let i = 0; i < 2; i++) {
    const hip = J.hip, kn = J.knees[i], an = J.ankles[i];
    const hem = P(mix(hip.x, kn.x, 0.82), mix(hip.y, kn.y, 0.82));
    seg(hip, hem, 15, 13.5);
    seg(hip, kn, 8, 6.5);
    seg(kn, an, 6.5, 5.5);
    // shoe: heel behind the ankle, sole flat along the toe direction, a rounded toe
    const t = J.toeDirs[i], n = P(-t.y * f, t.x * f);
    const S_ = (a, b) => O(P(an.x + t.x * a * sq + n.x * b, an.y + t.y * a * sq + n.y * b));
    g.fillPoints([S_(-5, -2), S_(-7, 4), S_(-6, 7.5), S_(12, 7.5), S_(15.5, 5.5), S_(16, 2.5), S_(12, -0.5), S_(4, -3.5)], true);
    const toe = S_(12.5, 4);
    g.fillCircle(toe.x, toe.y, 3.6);
  }
  // torso: an open jacket, a little wider at the hem
  g.fillPoints([T(J.hip, -7.5, -4), T(J.hip, 8, -5), T(J.hip, 8, 10), T(J.hip, 7, 24), T(J.hip, 3, 31),
    T(J.hip, -3, 31.5), T(J.hip, -6.5, 26), T(J.hip, -7.5, 10)], true);
  const hp = O(J.hip);
  g.fillCircle(hp.x, hp.y, 7.5);
  // backpack on his back, bouncing a little
  {
    const b0 = 7 + pack, b1 = 29 + pack;
    const pts = [];
    const corner = (a, b, a0) => { for (let k = 0; k <= 4; k++) { const an = a0 + (k / 4) * Math.PI / 2; pts.push(T(J.hip, a + Math.cos(an) * 4.5, b + Math.sin(an) * 4.5)); } };
    corner(-8, b1 - 4.5, 0); corner(-15.5, b1 - 4.5, Math.PI / 2); corner(-15.5, b0 + 4.5, Math.PI); corner(-8, b0 + 4.5, Math.PI * 1.5);
    g.fillPoints(pts, true);
    const handle = T(J.hip, -10, b1 + 1.5);
    g.fillCircle(handle.x, handle.y, 2.6);
  }
  seg(J.neck, P(mix(J.neck.x, J.head.x, 0.6), mix(J.neck.y, J.head.y, 0.6)), 8, 7.5);
  // arms: rolled sleeves to the elbow, thin forearms, small hands
  for (let i = 0; i < 2; i++) {
    seg(J.sh, J.elbows[i], 8, 7.5);
    seg(J.elbows[i], J.hands[i], 5, 4.4);
    const h = O(J.hands[i]);
    g.fillCircle(h.x, h.y, 3.9);
  }
  // head, nose, cap with its brim forward, hair poking out at the back
  const hu = norm(J.headUp), hv = P(-hu.y * f, hu.x * f);
  const H = (a, b) => O(P(J.head.x + hv.x * a * sq + hu.x * b, J.head.y + hv.y * a * sq + hu.y * b));
  const hc = H(0, 0);
  g.fillCircle(hc.x, hc.y, HEAD_R);
  const nose = H(14.6, -3.5);
  g.fillCircle(nose.x, nose.y, 2.9);
  // the cap: a dome a little bigger than the head, and a thick bill over the eyes, curving down
  const cap = [];
  for (let k = 0; k <= 14; k++) {
    const a = -1.9 + (k / 14) * (1.9 + 1.32); // from behind, over the top, to the forehead
    cap.push(H(Math.sin(a) * 17.4, Math.cos(a) * 18.2 + 1.5));
  }
  cap.push(H(14.5, 5)); cap.push(H(-13, 1.5));
  g.fillPoints(cap, true);
  g.fillPoints([H(9, 10.5), H(19, 9.5), H(26.5, 7), H(29, 4.6), H(27.5, 3), H(19, 4.2), H(10, 4.5)], true);
  const button = H(0, 20);
  g.fillCircle(button.x, button.y, 2.3);
  for (const [a, b, l] of [[-15, 2, 6], [-13.5, -3, 7], [-11, -7, 5]]) {
    const p0 = H(a, b + 2.5), p1 = H(a, b - 2.5), tip = H(a - l, b - 1);
    g.fillTriangle(p0.x, p0.y, p1.x, p1.y, tip.x, tip.y);
  }
}

function drawEyes(g, glow, J, f, sq, open) {
  const hu = norm(J.headUp), hv = P(-hu.y * f, hu.x * f);
  const H = (a, b) => P(J.head.x + hv.x * a * sq + hu.x * b, J.head.y + hv.y * a * sq + hu.y * b);
  const e1 = H(7, -0.6), e2 = H(12, -0.4);
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(e1.x, e1.y, 4.4 * sq, 4.6 * open);
  g.fillEllipse(e2.x, e2.y, 3.4 * sq, 3.8 * open);
  if (glow) {
    glow.fillStyle(0xffffff, 0.05 * open);
    glow.fillCircle((e1.x + e2.x) / 2, e1.y, 13);
    glow.fillStyle(0xffffff, 0.12 * open);
    glow.fillCircle(e1.x, e1.y, 4.6);
    glow.fillCircle(e2.x, e2.y, 4);
  }
}

// ---------- ragdoll ----------

// The body goes limp from the pose it was in: verlet points joined by its bones.
// kind: 'trap' (an ankle held by the jaws), 'hound' (held in the jaws, shaken, dropped), 'drown' (sinks).
export function makeRagdoll(look, b, kind) {
  const J = look.J;
  const names = ['head', 'neck', 'hip', 'e0', 'e1', 'h0', 'h1', 'k0', 'k1', 'a0', 'a1'];
  const at = { head: J.head, neck: J.neck, hip: J.hip, e0: J.elbows[0], e1: J.elbows[1], h0: J.hands[0], h1: J.hands[1],
    k0: J.knees[0], k1: J.knees[1], a0: J.ankles[0], a1: J.ankles[1] };
  const vx = (b.vx || 0) / 60, vy = (b.vy || 0) / 60;
  const pts = {};
  for (const n of names) pts[n] = { x: at[n].x, y: at[n].y, px: at[n].x - vx, py: at[n].y - vy };
  const bones = [['head', 'neck'], ['neck', 'hip'], ['head', 'hip'], ['neck', 'e0'], ['e0', 'h0'], ['neck', 'e1'], ['e1', 'h1'],
    ['hip', 'k0'], ['k0', 'a0'], ['hip', 'k1'], ['k1', 'a1'], ['k0', 'k1', 0.4]];
  const cons = bones.map(([a, c, soft]) => ({ a: pts[a], b: pts[c], len: Math.hypot(pts[a].x - pts[c].x, pts[a].y - pts[c].y), soft: soft ?? 1 }));
  return { kind, pts, cons, t: 0, f: look.faceVis >= 0 ? 1 : -1, pin: null, pack: 0, toe: [0, 0] };
}

// One step. pin: { name, x, y } holds a point (a trapped ankle, the neck in the hound's jaws).
export function stepRagdoll(rd, dt, pin) {
  rd.t += dt;
  const P_ = Object.values(rd.pts);
  for (const p of P_) {
    const wet = p.y > WATER_Y && p.x > PIT[0] && p.x < PIT[1];
    const damp = wet ? 0.86 : 0.995;
    const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
    p.px = p.x; p.py = p.y;
    p.x += vx;
    p.y += vy + (wet ? 160 : 2600) * dt * dt;
  }
  for (let it = 0; it < 6; it++) {
    for (const c of rd.cons) {
      const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y, d = Math.hypot(dx, dy) || 0.001;
      if (c.soft < 1 && d > c.len * 0.6 && d < c.len * 1.8) continue;
      const k = ((d - c.len) / d) * 0.5;
      c.a.x += dx * k; c.a.y += dy * k; c.b.x -= dx * k; c.b.y -= dy * k;
    }
    if (pin) { const p = rd.pts[pin.name]; p.x = pin.x; p.y = pin.y; }
    for (const p of P_) {
      const floor = (p.x > PIT[0] && p.x < PIT[1] ? groundY(p.x) : surfaceY(p.x)) - 3;
      if (p.y > floor) {
        p.y = floor;
        p.px = p.x - (p.x - p.px) * 0.4; // friction
      }
    }
  }
}

export function drawRagdoll(g, glow, rd, rim = 1) {
  const p = rd.pts, f = rd.f;
  // feet point forward from the shin; the head's up is away from the neck
  const J = {
    hip: p.hip, neck: p.neck, head: p.head, sh: P(mix(p.neck.x, p.hip.x, 0.15), mix(p.neck.y, p.hip.y, 0.15)),
    elbows: [p.e0, p.e1], hands: [p.h0, p.h1], knees: [p.k0, p.k1], ankles: [p.a0, p.a1],
    toeDirs: [0, 1].map((i) => { const d = norm(P(p['a' + i].x - p['k' + i].x, p['a' + i].y - p['k' + i].y)); return P(d.y * f, -d.x * f); }),
    up: P(p.neck.x - p.hip.x, p.neck.y - p.hip.y), headUp: P(p.head.x - p.neck.x, p.head.y - p.neck.y),
  };
  if (rim > 0) drawFigure(g, J, f, 1, RIM, 0.3 * rim, -1.4, -1.3);
  drawFigure(g, J, f, 1, hex(S.ink), 1, 0, 0);
  // eyes go out
  const open = Math.max(0, 1 - rd.t * 2.5);
  if (open > 0) drawEyes(g, glow, J, f, 1, open);
}
