// What the puzzles are made of, drawn: the boxes he pushes and pulls, bear traps, the fog pit, the dark stretch
// and the hound that sleeps in it.
import { groundY, PIT, DARK as DARK_X, HOUND_X, HOUND_WAKE_X, WATER_Y } from './world.js';
import { mkCanvas, rng } from './art.js';
import { S, hex } from './style.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const lerpColor = (a, b, t) => {
  const ch = (s) => Math.round(mix((a >> s) & 255, (b >> s) & 255, t)) << s;
  return ch(16) | ch(8) | ch(0);
};
const RIM = 0xffd682;

// ---------- boxes ----------

// Painted once: a plank crate, a sawn block of trunk standing on end, a log lying on its side. Near black like
// the play plane, with the wood showing faintly and the edges facing the light catching it.
const PAD = 6;
const WOOD = 'rgba(255,226,170,', SHADE = 'rgba(0,0,0,', LIT = 'rgba(236,196,126,';
function boxCanvas(kind, w, h) {
  const c = mkCanvas(w + PAD * 2, h + PAD * 2), ctx = c.getContext('2d'), r = rng(kind.length * 31 + w);
  ctx.translate(PAD, PAD);
  const ink = S.ink;
  const grain = (x0, y0, x1, y1, n, horiz, a = 0.07) => {
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = r() < 0.7 ? `${WOOD}${a * (0.4 + r())})` : `${SHADE}0.35)`;
      ctx.beginPath();
      if (horiz) {
        const y = y0 + r() * (y1 - y0);
        ctx.moveTo(x0, y);
        for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.2 + (r() - 0.5) * 0.6);
      } else {
        const x = x0 + r() * (x1 - x0);
        ctx.moveTo(x, y0);
        for (let y = y0; y <= y1; y += 8) ctx.lineTo(x + Math.sin(y * 0.06 + i) * 1.3 + (r() - 0.5) * 0.6, y);
      }
      ctx.stroke();
    }
  };
  if (kind === 'crate') {
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, w, h);
    // three boards across, behind a frame and a diagonal brace
    const bh = (h - 24) / 3;
    for (let i = 0; i < 3; i++) {
      const y = 12 + i * bh;
      ctx.fillStyle = `${WOOD}${0.025 + r() * 0.03})`;
      ctx.fillRect(12, y + 1.5, w - 24, bh - 3);
      grain(12, y + 3, w - 12, y + bh - 3, 4, true);
      ctx.fillStyle = `${SHADE}0.7)`;
      ctx.fillRect(12, y + bh - 2, w - 24, 2.5);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(12, 12, w - 24, h - 24); ctx.clip();
    ctx.translate(w / 2, h / 2); ctx.rotate(Math.atan2(h - 24, w - 24));
    const len = Math.hypot(w - 24, h - 24);
    ctx.fillStyle = ink; ctx.fillRect(-len / 2, -9, len, 18);
    ctx.fillStyle = `${WOOD}0.05)`; ctx.fillRect(-len / 2, -9, len, 18);
    grain(-len / 2, -7, len / 2, 7, 3, true, 0.09);
    ctx.fillStyle = `${WOOD}0.16)`; ctx.fillRect(-len / 2, -9, len, 1.5);
    ctx.fillStyle = `${SHADE}0.6)`; ctx.fillRect(-len / 2, 8, len, 2);
    ctx.restore();
    // the frame
    for (const [x, y, fw, fh, horiz] of [[0, 0, w, 12, 1], [0, h - 12, w, 12, 1], [0, 0, 12, h, 0], [w - 12, 0, 12, h, 0]]) {
      ctx.fillStyle = ink; ctx.fillRect(x, y, fw, fh);
      ctx.fillStyle = `${WOOD}0.06)`; ctx.fillRect(x, y, fw, fh);
      grain(x + 1, y + 1, x + fw - 1, y + fh - 1, 2, horiz, 0.1);
    }
    ctx.fillStyle = `${SHADE}0.65)`;
    ctx.fillRect(12, 12, w - 24, 2); ctx.fillRect(12, 12, 2, h - 24);
    // nails
    for (const [x, y] of [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6], [w / 2, 6], [w / 2, h - 6], [6, h / 2], [w - 6, h / 2]]) {
      ctx.fillStyle = `${WOOD}0.28)`; ctx.beginPath(); ctx.arc(x - 0.5, y - 0.5, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // light along the top and left edges, a chipped corner, shadow down the right
    ctx.fillStyle = `${LIT}0.55)`; ctx.fillRect(1, 0, w - 4, 2);
    ctx.fillStyle = `${LIT}0.2)`; ctx.fillRect(0, 2, 2, h - 6);
    ctx.fillStyle = `${SHADE}0.5)`; ctx.fillRect(w - 3, 2, 3, h - 2);
    ctx.clearRect(w - 7, 0, 7, 3); ctx.clearRect(w - 3, 0, 3, 6);
  } else if (kind === 'block') {
    // bark sides, a flat sawn top with rings
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.roundRect(0, 8, w, h - 8, [6, 6, 2, 2]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w / 2, 9, w / 2, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, 8, w, h - 8, [6, 6, 2, 2]); ctx.clip();
    grain(2, 16, w - 2, h, 16, false, 0.08);
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = `${SHADE}0.55)`; ctx.lineWidth = 1.5 + r() * 2;
      const x = r() * w; ctx.beginPath(); ctx.moveTo(x, 16); ctx.bezierCurveTo(x + 4, h * 0.4, x - 4, h * 0.7, x + (r() - 0.5) * 6, h); ctx.stroke();
    }
    const sg = ctx.createLinearGradient(0, 0, w, 0);
    sg.addColorStop(0, `${LIT}0.12)`); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(1, `${SHADE}0.5)`);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.lineWidth = 1;
    for (const k of [0.85, 0.62, 0.42, 0.24]) {
      ctx.strokeStyle = `${WOOD}${0.1 + (1 - k) * 0.1})`;
      ctx.beginPath(); ctx.ellipse(w / 2 + (1 - k) * 3, 9, (w / 2) * k, 9 * k, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = `${LIT}0.5)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(w / 2, 9, w / 2 - 1.5, 7.5, 0, Math.PI * 0.95, Math.PI * 2.02); ctx.stroke();
    // a split down from the top
    ctx.strokeStyle = `${SHADE}0.8)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.62, 4); ctx.lineTo(w * 0.58, 22); ctx.lineTo(w * 0.61, 38); ctx.stroke();
  } else {
    // log: bark along it, the sawn end showing rings on the right
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, h / 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, w - 8, h, [h / 2, 4, 4, h / 2]); ctx.clip();
    grain(8, 4, w - 20, h - 4, 12, true, 0.08);
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = `${SHADE}0.6)`; ctx.lineWidth = 1.5 + r() * 1.5;
      const y = 6 + r() * (h - 12); ctx.beginPath(); ctx.moveTo(10 + r() * 40, y);
      ctx.bezierCurveTo(w * 0.35, y + 3, w * 0.6, y - 3, w - 30 - r() * 40, y + (r() - 0.5) * 4); ctx.stroke();
    }
    const vg = ctx.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, `${LIT}0.16)`); vg.addColorStop(0.3, 'rgba(0,0,0,0)'); vg.addColorStop(1, `${SHADE}0.55)`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.lineWidth = 1;
    const ex = w - h * 0.28;
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(ex, h / 2, h * 0.28, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    for (const k of [0.85, 0.6, 0.38, 0.18]) {
      ctx.strokeStyle = `${WOOD}${0.1 + (1 - k) * 0.12})`;
      ctx.beginPath(); ctx.ellipse(ex, h / 2, h * 0.28 * k, (h / 2) * k, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = `${LIT}0.45)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ex, h / 2, h * 0.28 - 1, h / 2 - 1.5, 0, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h / 2, 1.5); ctx.lineTo(ex - 6, 1.5); ctx.stroke();
    // a broken-off branch stub
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(w * 0.4, 4); ctx.lineTo(w * 0.43, -5); ctx.lineTo(w * 0.47, -4); ctx.lineTo(w * 0.47, 4); ctx.fill();
  }
  return c;
}

// One image per box (made once per scene).
export function makeBoxSprites(scene, boxes, depth) {
  return boxes.map((b) => {
    const key = `f_box_${b.kind}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, boxCanvas(b.kind, b.w, b.h));
    return scene.add.image(0, 0, key).setOrigin(0).setDepth(depth);
  });
}

export function drawBoxes(sprites, boxes) {
  sprites.forEach((s, i) => {
    const b = boxes[i];
    s.setVisible(!!b && !b.gone);
    if (b) s.setPosition(b.x - PAD, b.y - PAD);
  });
}

// ---------- bear traps ----------

// Open: two toothed jaws lying flat either side of the plate. Sprung: they swing up and meet over it.
export function drawTraps(g, traps) {
  const ink = hex(S.ink);
  for (const tr of traps) {
    const x = tr.x, y = groundY(x) + 1;
    const snap = tr.sprung ? Math.min(1, tr.t / 0.07) : 0;
    g.fillStyle(ink, 1);
    g.fillRect(x - 12, y - 5, 24, 6);
    g.fillCircle(x, y - 4, 5);
    for (const side of [-1, 1]) {
      // a jaw point at u (0 = hinge, 1 = tip), open (flat, outward) blended to shut (an arc up to the middle)
      const at = (u) => {
        const ox = x + side * (8 + u * 52), oy = y - 3 - Math.sin(u * Math.PI) * 11;
        const th = u * Math.PI / 2;
        const cx = x + side * 30 * Math.cos(th), cy = y - 3 - 36 * Math.sin(th);
        return { x: mix(ox, cx, snap), y: mix(oy, cy, snap) };
      };
      const pts = [];
      for (let i = 0; i <= 10; i++) pts.push(at(i / 10));
      g.lineStyle(4, ink, 1);
      g.strokePoints(pts, false);
      for (let i = 2; i <= 9; i++) {
        const p = at(i / 10);
        // teeth point up while open, in towards the middle when shut
        const tx = mix(p.x, p.x + (x - p.x) * 0.3, snap), ty = mix(p.y - 9, p.y + (y - 20 - p.y) * 0.3, snap);
        g.fillTriangle(p.x - 2.4, p.y, p.x + 2.4, p.y, tx, ty);
      }
    }
    // light along the top of the steel, so it reads in the grass
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 1; i <= 9; i++) {
        const u = i / 10, th = u * Math.PI / 2;
        const ox = x + side * (8 + u * 52), oy = y - 3 - Math.sin(u * Math.PI) * 11;
        const cx = x + side * 30 * Math.cos(th), cy = y - 3 - 36 * Math.sin(th);
        pts.push({ x: mix(ox, cx, snap) - 0.8, y: mix(oy, cy, snap) - 1.8 });
      }
      g.lineStyle(1.2, RIM, side < 0 ? 0.4 : 0.22);
      g.strokePoints(pts, false);
    }
    g.fillStyle(RIM, 0.6);
    g.fillCircle(x - 30, y - 13, 1.4);
    // chained to a stake
    g.lineStyle(1.6, ink, 1);
    for (let i = 0; i < 5; i++) g.strokeEllipse(x + 16 + i * 6, y - 1 + Math.sin(i * 0.9) * 1.2, 7, 4);
    g.fillStyle(ink, 1);
    g.fillRect(x + 46, y - 9, 4, 10);
    g.fillStyle(RIM, 0.35);
    g.fillRect(x + 46, y - 9, 1.2, 7);
  }
}

// ---------- the fog pit ----------

// A chasm darkening into the deep, filled with soft mist puffs that swallow a fall.
export function makePitFog(scene, back, puffDepth) {
  const lip = groundY(PIT[0] - 10);
  for (let y = lip - 6; y < 1300; y += 8) {
    back.fillStyle(lerpColor(S.pitTop, S.pitDeep, clamp((y - lip) / 120, 0, 1)), 1);
    back.fillRect(PIT[0] + 4, y, PIT[1] - PIT[0] - 8, 8.5);
  }
  // clipped to the hole, so it never spills over the ground
  const hole = scene.make.graphics({}, false).fillRect(PIT[0] + 16, lip - 30, PIT[1] - PIT[0] - 32, 1400);
  const mask = hole.createGeometryMask();
  const puffs = [];
  // pale mist at the top darkening into the deep: [depth, size, alpha, inset, how dark]
  const rows = [[-14, 46, 0.12, 70, 0.3], [22, 70, 0.2, 0, 0.45], [60, 90, 0.22, 0, 0.6], [110, 110, 0.25, 0, 0.7],
    [148, 90, 0.3, 0, 0.5]];
  for (const [dy, size, alpha, inset, dark] of rows) {
    for (let x = PIT[0] + 40 + inset; x <= PIT[1] - 40 - inset; x += size * 0.55) {
      const img = scene.add.image(x, lip + dy, 'f_glow').setTint(lerpColor(S.pitFog, S.pitDeep, dark)).setDepth(puffDepth)
        .setScale((size * 2.6) / 256, (size * 1.5) / 256).setAlpha(alpha);
      img.setMask(mask);
      puffs.push({ img, x, y: lip + dy, ph: Math.random() * 6, sp: 0.3 + Math.random() * 0.4 });
    }
  }
  return puffs;
}

export function updatePitFog(puffs, t) {
  for (const p of puffs) p.img.setPosition(p.x + Math.sin(t * p.sp + p.ph) * 14, p.y + Math.sin(t * p.sp * 0.7 + p.ph * 2) * 5);
}

// Black water in the pit: a still surface catching a little light, rings where something goes in.
export function drawWater(g, t, rings, dt) {
  const x0 = PIT[0] + 10, x1 = PIT[1] - 10, y = WATER_Y;
  g.fillStyle(S.water, 0.94);
  g.fillRect(x0, y, x1 - x0, 700);
  g.fillStyle(S.waterHi, 0.06);
  g.fillRect(x0, y, x1 - x0, 14);
  g.lineStyle(1.5, S.waterHi, 0.22);
  g.beginPath();
  for (let x = x0; x <= x1; x += 8) {
    const yy = y + Math.sin(x * 0.03 + t * 1.3) * 0.8 + Math.sin(x * 0.011 - t * 0.7) * 0.6;
    if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
  }
  g.strokePath();
  for (let i = 0; i < 9; i++) {
    const gx = x0 + ((i * 97 + t * 9) % (x1 - x0)), gy = y + 6 + (i % 4) * 7;
    g.fillStyle(S.waterHi, 0.08 + 0.05 * Math.sin(t * 1.7 + i));
    g.fillRect(gx, gy, 18 + (i % 3) * 10, 1.2);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    if (r.t > 2.2) { rings.splice(i, 1); continue; }
    for (const k of [0, 0.35, 0.7]) {
      const rt = r.t - k;
      if (rt <= 0) continue;
      g.lineStyle(1.4, S.waterHi, 0.35 * Math.max(0, 1 - rt / 1.6) * r.power);
      g.strokeEllipse(r.x, y + 2, 20 + rt * 140 * r.power, 4 + rt * 12);
    }
  }
}

// ---------- the dark stretch and the hound ----------

// Shade over the background where the hound sleeps: one image, softly edged at both ends.
export function addDark(scene, depth) {
  const key = 'f_dark';
  if (!scene.textures.exists(key)) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 4;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, `rgba(${S.dark},0)`);
    g.addColorStop(0.2, `rgba(${S.dark},0.62)`);
    g.addColorStop(0.8, `rgba(${S.dark},0.62)`);
    g.addColorStop(1, `rgba(${S.dark},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 4);
    scene.textures.addCanvas(key, c);
  }
  const w = DARK_X[1] - DARK_X[0] + 600;
  return scene.add.image(DARK_X[0] - 300, -200, key).setOrigin(0).setScale(w / 256, 1500 / 4).setDepth(depth);
}

export function makeHound() {
  return { x: HOUND_X, state: 'sleep', t: 0, breath: 0, face: -1 };
}

// Wakes when the boy comes too close, rises, growls and charges; an open trap in its path catches it.
// Returns an event name.
export function stepHound(h, dt, b, traps) {
  h.breath += dt;
  const bx = b.x + b.w / 2;
  if (h.state === 'sleep') {
    if (bx > HOUND_WAKE_X) { h.state = 'wake'; h.t = 0; h.face = Math.sign(bx - h.x) || -1; return 'wake'; }
    return null;
  }
  h.t += dt;
  if (h.state === 'caught' || h.state === 'feed') return null;
  if (h.state === 'wake') {
    h.face = Math.sign(bx - h.x) || h.face;
    if (h.t > 0.8) { h.state = 'lunge'; h.t = 0; return 'lunge'; }
    return null;
  }
  // charging
  h.x += h.face * Math.min(1300, 300 + h.t * 2600) * dt;
  for (const tr of traps) {
    if (!tr.sprung && Math.abs(h.x - tr.x) < 40) { tr.sprung = 'hound'; tr.t = 0; h.x = tr.x; h.state = 'caught'; h.t = 0; return 'trapped'; }
  }
  if (Math.abs(bx - h.x) < 70 && Math.abs(b.y + b.h - groundY(bx)) < 140) { h.state = 'feed'; h.t = 0; return 'caught'; }
  if (Math.abs(bx - h.x) > 1400) { h.state = 'sleep'; h.x = HOUND_X; }
  return null;
}

// A big wolf-hound, drawn facing +x locally (flipped to face the boy). Asleep: curled low, head on its paws,
// flank rising with each breath. Awake: up on four legs, hackles raised, jaws working. Caught: down on its
// belly, a foreleg in the trap, jerking against it.
const SLEEP = [
  [-205, -2], [-196, -10], [-172, -16], [-152, -34], [-134, -60], [-96, -78], [-44, -86], [12, -88], [56, -82],
  [84, -70], [94, -74], [102, -108], [114, -78], [122, -80], [132, -110], [140, -74], [150, -66], [186, -50],
  [202, -40], [198, -30], [162, -26], [146, -22], [156, -14], [208, -10], [210, 0], [60, 0], [10, -4],
  [-60, -2], [-118, 0], [-150, -4], [-182, -2],
];
const STAND = [
  [-118, -104], [-124, -124], [-104, -140], [-50, -146], [10, -150], [48, -158], [70, -172], [86, -186],
  [92, -214], [102, -190], [110, -218], [116, -190], [134, -182], [176, -160], [186, -150], [170, -146],
  [128, -142], [110, -128], [88, -112], [70, -94], [30, -92], [-40, -96], [-90, -98],
];

export function drawHound(g, glow, h, t) {
  const f = h.face;
  const caught = h.state === 'caught';
  // caught, its front paw is in the trap at h.x: the body lies behind it
  const cx = caught ? h.x - f * 150 : h.x;
  const gy = groundY(cx) + 6;
  const jerk = caught ? Math.max(0, Math.sin(h.t * 9)) * Math.exp(-h.t * 0.25) * 10 : 0;
  const X = (dx) => cx + dx * f - jerk * f * 0.5, Y = (dy) => gy + dy;
  const P = (pts, sy = 1) => pts.map(([x, y]) => ({ x: X(x), y: Y(y * sy) }));
  const ink = hex(S.ink);
  g.fillStyle(ink, 1);
  if (h.state === 'sleep') {
    const breathe = 1 + Math.sin(h.breath * 1.4) * 0.035;
    g.fillPoints(SLEEP.map(([x, y]) => ({ x: X(x * 0.82), y: Y(y < -40 && x < 90 ? y * breathe : y) })), true);
    for (let i = 0; i < 12; i++) {
      const x = (-130 + i * 16) * 0.82, y = -80 - Math.sin((i / 11) * Math.PI) * 8;
      g.fillTriangle(X(x - 7), Y(y * breathe + 6), X(x + 7), Y(y * breathe + 6), X(x - 12), Y(y * breathe - 5 - (i % 2) * 4));
    }
    const p = (h.breath * 0.7) % 1;
    g.fillStyle(S.puff, 0.22 * Math.sin(p * Math.PI));
    g.fillCircle(X(174 + p * 30), Y(-34 - p * 14), 6 + p * 12);
    return;
  }
  const rise = h.state === 'wake' ? clamp(h.t / 0.5, 0, 1) : 1;
  const sy = caught ? 0.62 : mix(0.5, 1, 1 - (1 - rise) ** 2);
  const run = h.state === 'lunge' || h.state === 'feed';
  for (const [lx, ph, w] of [[-96, 0, 17], [-76, Math.PI, 15], [50, Math.PI * 0.5, 16], [68, Math.PI * 1.5, 14]]) {
    const sw = run ? Math.sin(t * 15 + ph) * 0.7 : 0;
    const hip = { x: lx, y: -100 * sy }, len = 100 * sy;
    // caught: the front legs stretch forward to the trapped paw
    const reach = caught && lx > 0 ? 70 + jerk : 0;
    const knee = { x: lx + Math.sin(sw) * len * 0.5 + 6 + reach * 0.5, y: hip.y + len * 0.5 };
    const foot = { x: knee.x + Math.sin(sw * 1.4) * len * 0.45 - 4 + reach * 0.5, y: Math.min(0, hip.y + len) };
    seg(g, X(hip.x), Y(hip.y), X(knee.x), Y(knee.y), w * 1.3, w * 0.8);
    seg(g, X(knee.x), Y(knee.y), X(foot.x), Y(foot.y), w * 0.8, w * 0.55);
    g.fillEllipse(X(foot.x + 6), Y(foot.y - 3), 18, 7);
  }
  g.fillPoints(P(STAND, sy), true);
  seg(g, X(-118), Y(-124 * sy), X(-150), Y((-132 + Math.sin(t * 8) * 3) * sy), 18, 12);
  seg(g, X(-150), Y((-132 + Math.sin(t * 8) * 3) * sy), X(-182), Y((caught ? -40 : -126 + Math.sin(t * 8) * 8) * sy), 12, 2);
  for (let i = 0; i < 9; i++) {
    const x = -100 + i * 19, y = -146 - (i / 8) * 12;
    g.fillTriangle(X(x - 8), Y((y + 8) * sy), X(x + 8), Y((y + 8) * sy), X(x - 14), Y((y - 14 - (i % 2) * 6) * sy));
  }
  const jaw = h.state === 'wake' ? clamp((h.t - 0.25) * 3, 0, 1) * 0.7 : caught ? 0.3 + 0.3 * Math.sin(h.t * 6) : 0.5 + 0.5 * Math.sin(t * 22);
  g.fillTriangle(X(128), Y(-142 * sy), X(180 - jaw * 6), Y((-140 + jaw * 28) * sy), X(118), Y(-128 * sy));
  const ex = X(142), ey = Y(-172 * sy);
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(ex, ey, 11, 4 * rise + 0.6);
  glow.fillStyle(0xffffff, 0.1 * rise);
  glow.fillCircle(ex, ey, 8);
}

// Where the hound's jaws are (it holds what it catches there), shaking its head.
export function houndMouth(h, t) {
  const gy = groundY(h.x) + 6;
  return { x: h.x + h.face * (158 + Math.sin(t * 31) * 6), y: gy - 132 + Math.sin(t * 23) * 7 };
}

// A tapered limb segment with rounded ends.
function seg(g, ax, ay, bx, by, w0, w1) {
  const d = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / d, ny = (bx - ax) / d;
  g.fillPoints([
    { x: ax + nx * w0 / 2, y: ay + ny * w0 / 2 }, { x: bx + nx * w1 / 2, y: by + ny * w1 / 2 },
    { x: bx - nx * w1 / 2, y: by - ny * w1 / 2 }, { x: ax - nx * w0 / 2, y: ay - ny * w0 / 2 },
  ], true);
  g.fillCircle(ax, ay, w0 / 2);
  g.fillCircle(bx, by, w1 / 2);
}
