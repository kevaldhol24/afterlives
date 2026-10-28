// The parallax layers: what each one holds, how far it is (scroll factor), how soft (blur) and how pale.
import { rng, mkCanvas, blurCanvas, tree, ground, grass, fern, bush, rock, branch, limb, vine, leafCluster, shadeLimb } from './art.js';
import { S } from './style.js';
import { VIEW_W, VIEW_H, WORLD_W, groundY, STATIC, PIT, TRAP_XS } from './world.js';

// How far a layer reaches: its x runs 0 .. layerWidth while the camera crosses the world.
export const layerWidth = (f) => VIEW_W + (WORLD_W - VIEW_W) * f;
const CHUNK = 2048;
const Y_SPAN = [-140, VIEW_H + 140];

const wave = (seed, base, amp) => {
  const r = rng(seed);
  const p = [r() * 6, r() * 6, r() * 6];
  return (x) => base + amp * Math.sin(x * 0.0021 + p[0]) + amp * 0.55 * Math.sin(x * 0.0053 + p[1]) + amp * 0.2 * Math.sin(x * 0.017 + p[2]);
};

// Tint the bottom of whatever is already drawn with mist, and the top with a little haze.
function mist(ctx, lw, y0, y1, color, alpha, topAlpha = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(0.75, `rgba(${color},${alpha * 0.7})`);
  g.addColorStop(1, `rgba(${color},${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(-200, y0, lw + 400, VIEW_H + 400 - y0);
  if (topAlpha) {
    const t = ctx.createLinearGradient(0, Y_SPAN[0], 0, 420);
    t.addColorStop(0, `rgba(${color},${topAlpha})`);
    t.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = t;
    ctx.fillRect(-200, Y_SPAN[0] - 200, lw + 400, 620 - Y_SPAN[0]);
  }
  ctx.restore();
}

// A band of forest: trees spaced along it (with clearings), ground, plants, and mist at its feet.
function forest(spec) {
  return (ctx, lw, r) => {
    const gy = wave(spec.seed, spec.ground, spec.amp);
    ctx.fillStyle = S.layers[spec.tone];
    let x = -120 + r() * spec.gap[0];
    while (x < lw + 120) {
      const dense = Math.sin(x * 0.0017 + spec.seed) * 0.5 + Math.sin(x * 0.0041 + spec.seed * 2) * 0.5;
      if (dense > (spec.clear ?? -0.55)) {
        const w = spec.w[0] + (spec.w[1] - spec.w[0]) * Math.pow(r(), 1.5);
        tree(ctx, r, x, gy(x), {
          w, h: spec.h[0] + r() * (spec.h[1] - spec.h[0]), branches: spec.branches ?? 3, depth: spec.depth ?? 2,
          branchFrom: spec.branchFrom, branchLen: spec.branchLen, leaves: spec.leaves, vines: spec.vines,
          vineLen: spec.vineLen, lean: (r() - 0.5) * (spec.lean ?? 0.1), shade: spec.shade,
        });
      }
      x += spec.gap[0] + r() * (spec.gap[1] - spec.gap[0]);
    }
    if (spec.thin) {
      for (let tx = r() * 200; tx < lw; tx += spec.thin.gap * (0.5 + r())) {
        tree(ctx, r, tx, gy(tx), { w: spec.thin.w * (0.6 + r() * 0.8), h: 1500, branches: 1, depth: 1, stubs: 2, top: 0.7 });
      }
    }
    ground(ctx, r, -200, lw + 200, gy, Y_SPAN[1] + 200);
    if (spec.bushes) for (let bx = r() * 400; bx < lw; bx += spec.bushes.gap * (0.4 + r() * 1.2)) {
      bush(ctx, r, bx, gy(bx) + 4, spec.bushes.size * (0.6 + r() * 0.8));
    }
    if (spec.ferns) for (let fx = r() * 300; fx < lw; fx += spec.ferns.gap * (0.4 + r() * 1.2)) {
      fern(ctx, r, fx, gy(fx) + 3, spec.ferns.size * (0.6 + r() * 0.7));
    }
    if (spec.grass) grass(ctx, r, -100, lw + 100, gy, spec.grass);
    mist(ctx, lw, spec.ground - spec.mist[2], spec.ground + spec.amp + 40, S.mist, spec.mist[0] * S.mistAlpha, spec.mist[1] * S.mistAlpha);
  };
}

// Far to near. tone = which of the style's layer colours; mist = [alpha at the feet, haze at the top, mist height].
export const BACK = [
  {
    key: 'l1', f: 0.1, res: 0.25, blur: 9, depth: 2,
    draw: forest({ seed: 11, tone: 0, ground: 700, amp: 18, gap: [60, 150], w: [10, 26], h: [900, 1300],
      branches: 2, depth: 1, clear: -0.8, mist: [0.75, 0.35, 260], grass: { step: 10, h: 10 } }),
  },
  {
    key: 'l2', f: 0.24, res: 0.25, blur: 6.5, depth: 5,
    draw: forest({ seed: 23, tone: 1, ground: 728, amp: 24, gap: [90, 230], w: [16, 40], h: [900, 1400],
      branches: 3, depth: 2, clear: -0.6, mist: [0.7, 0.3, 300], grass: { step: 9, h: 14 },
      bushes: { gap: 500, size: 40 } }),
  },
  {
    key: 'l3', f: 0.44, res: 0.34, blur: 4, depth: 8,
    draw: forest({ seed: 37, tone: 2, ground: 760, amp: 30, gap: [140, 380], w: [24, 58], h: [1000, 1500],
      branches: 3, depth: 2, clear: -0.4, mist: [0.62, 0.22, 330], grass: { step: 8, h: 18, patchy: 0.004 },
      bushes: { gap: 420, size: 60 }, vines: 0.3, thin: { gap: 700, w: 9 }, shade: 0.45 }),
  },
  {
    key: 'l4', f: 0.66, res: 0.5, blur: 2.2, depth: 11,
    draw: forest({ seed: 41, tone: 3, ground: 790, amp: 34, gap: [240, 620], w: [36, 84], h: [1100, 1600],
      branches: 3, depth: 2, clear: -0.3, mist: [0.5, 0.12, 330], grass: { step: 7, h: 24, patchy: 0.003 },
      bushes: { gap: 600, size: 70 }, ferns: { gap: 520, size: 70 }, vines: 0.45, vineLen: [80, 320], thin: { gap: 900, w: 12 }, shade: 0.75 }),
  },
  {
    key: 'l5', f: 0.86, res: 0.5, blur: 1.1, depth: 14,
    draw: forest({ seed: 53, tone: 4, ground: 812, amp: 30, gap: [520, 1100], w: [56, 118], h: [1200, 1700],
      branches: 2, depth: 2, clear: -0.2, branchFrom: 0.5, mist: [0.32, 0.06, 300], grass: { step: 6, h: 30, patchy: 0.003 },
      bushes: { gap: 700, size: 80 }, ferns: { gap: 400, size: 90 }, vines: 0.5, vineLen: [120, 380], shade: 1 }),
  },
];

// Branches reaching in from the top over the play plane; ropes hang from these points.
// The pit rope hangs low enough to catch from a running jump (y 790); the others hang out of reach, scenery.
export const ROPES = [
  { x: 1030, len: 330 }, { x: 4040, to: 790 }, { x: 4470, len: 300 }, { x: 6760, len: 380 },
];
const OVERHANG = [
  { x0: 700, y0: -60, x1: 1400, y1: 250, sag: 70, w: 34 },
  { x0: 3780, y0: -80, x1: 4720, y1: 210, sag: 90, w: 40 },
  { x0: 6450, y0: -40, x1: 7100, y1: 260, sag: 60, w: 36 },
];

function overhangPts(o) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = o.x0 + (o.x1 - o.x0) * t;
    const y = o.y0 + (o.y1 - o.y0) * t + Math.sin(t * Math.PI) * o.sag;
    pts.push({ x, y, a: 0 });
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    pts[i].a = Math.atan2(b.y - a.y, b.x - a.x);
  }
  return pts;
}

// Where a rope ties on: the y of the overhanging branch above x.
export function ropeAnchor(x) {
  for (const o of OVERHANG) if (x >= o.x0 && x <= o.x1) {
    const pts = overhangPts(o);
    const i = pts.findIndex((p) => p.x >= x);
    return { x, y: pts[Math.max(0, i)].y + 4 };
  }
  return { x, y: 200 };
}

export const CANOPY = {
  key: 'canopy', f: 1, res: 0.5, blur: 1.4, depth: 17, y: [-140, 600],
  draw: (ctx, lw, r) => {
    ctx.fillStyle = S.ink;
    const leaves = leafCluster(22);
    for (const o of OVERHANG) {
      const pts = overhangPts(o);
      shadeLimb(ctx, r, limb(ctx, pts, o.w, o.w * 0.35, r, 0.15), pts, o.w, o.w * 0.35, 1.2);
      for (let k = 0; k < 7; k++) {
        const p = pts[5 + Math.floor(r() * 34)];
        const side = r() < 0.6 ? 1 : -1;
        branch(ctx, r, p.x, p.y, p.a + side * (0.5 + r() * 0.8), 80 + r() * 160, o.w * 0.3, 2, { droop: 0.06, leaves, bend: 0.3 });
      }
      for (let k = 0; k < 5; k++) vine(ctx, r, pts[4 + Math.floor(r() * 34)], 40 + r() * 140, 2.2);
    }
    // a few leafy clumps reaching down from the top edge
    for (let x = 300; x < lw; x += 900 + r() * 900) {
      branch(ctx, r, x, -150, Math.PI / 2 + (r() - 0.5) * 1.2, 260 + r() * 200, 28, 3, { droop: 0.05, leaves, bend: 0.35, vines: 0.3 });
    }
  },
};

// The play plane: the ground, the cliffs and the stump, roots and plants.
export const MAIN = {
  key: 'main', f: 1, res: 1, blur: 0, depth: 20, y: [380, VIEW_H + 160],
  draw: (ctx, lw, r) => {
    ctx.fillStyle = S.ink;
    ground(ctx, r, -50, lw + 50, groundY, VIEW_H + 400, 2.5);
    // roots snaking along the surface and lumps of earth
    const open = (x) => STATIC.every((s) => x < s.x - 80 || x > s.x + s.w + 20) && TRAP_XS.every((t) => Math.abs(x - t) > 120)
      && (x < 990 || x > 1260) && (x < 2950 || x > 3380);
    for (let x = 80; x < lw; x += 140 + r() * 380) {
      if (!open(x)) continue;
      const gy = groundY(x);
      const dir = r() < 0.5 ? 0 : Math.PI;
      branch(ctx, r, x, gy + 4, dir + (dir ? 0.12 : -0.12), 60 + r() * 140, 8 + r() * 12, 1, { bend: 0.4, droop: 0.04, tip: 0.15, kids: 1.4 });
      if (r() < 0.35) rock(ctx, r, x + 40, 24 + r() * 50, gy - 8 - r() * 16, gy + 6);
    }
    // the two cliffs: rock blocks with a lumpy top (never more than a few px off the walkable line),
    // grass along the top and roots hanging over the edges
    for (const c of STATIC.filter((x) => x.kind !== 'stump')) {
      const top = c.y, bot = c.y + c.h + 80;
      ctx.beginPath();
      ctx.moveTo(c.x + 3, bot);
      for (let y = bot - 20; y > top + 16; y -= 24) ctx.lineTo(c.x + r() * 7, y);
      ctx.quadraticCurveTo(c.x, top, c.x + 14, top + 1);
      for (let x = c.x + 30; x < c.x + c.w - 20; x += 22) ctx.lineTo(x, top + (r() - 0.35) * 4);
      ctx.quadraticCurveTo(c.x + c.w, top, c.x + c.w - r() * 3, top + 18);
      for (let y = top + 40; y < bot; y += 24) ctx.lineTo(c.x + c.w - r() * 7, y);
      ctx.closePath();
      ctx.fill();
      grass(ctx, r, c.x + 4, c.x + c.w - 4, () => top + 2, { step: 6, h: 16, w: 2 });
      for (const [x0, dir] of [[c.x + 6, -1], [c.x + c.w - 6, 1]]) {
        for (let k = 0; k < 3; k++) {
          branch(ctx, r, x0 - dir * k * 10, top + 8 + k * 6, Math.PI / 2 + dir * (0.25 + r() * 0.3), 50 + r() * 70, 6 + r() * 4, 1, { bend: 0.5, droop: 0.1, tip: 0.1 });
        }
      }
      fern(ctx, r, c.x + c.w * (0.3 + r() * 0.4), top + 3, 70);
    }
    // stump with a jagged top and roots
    {
      const stump = STATIC.find((x) => x.kind === 'stump');
      const top = stump.y, gy = groundY(stump.x + stump.w / 2);
      ctx.beginPath();
      ctx.moveTo(stump.x - 30, gy + 6);
      ctx.quadraticCurveTo(stump.x + 2, gy - 20, stump.x + 4, top + 10);
      const teeth = [[0.05, -6], [0.18, 8], [0.3, -18], [0.42, 4], [0.55, -10], [0.68, 6], [0.82, -26], [0.93, 2]];
      for (const [t, dy] of teeth) ctx.lineTo(stump.x + stump.w * t, top + dy + 6);
      ctx.lineTo(stump.x + stump.w - 4, top + 10);
      ctx.quadraticCurveTo(stump.x + stump.w - 2, gy - 20, stump.x + stump.w + 34, gy + 6);
      ctx.fill();
      for (const side of [-1, 1]) branch(ctx, r, stump.x + stump.w / 2 + side * 40, gy - 10, side > 0 ? 0.25 : Math.PI - 0.25, 90, 22, 0, { tip: 0.15, droop: 0.05, bend: 0.3 });
    }
    // the pit's walls: broken rock, jutting out and stepping back as they go down, an overhang at the lip
    for (const [x0, dir] of [[PIT[0], 1], [PIT[1], -1]]) {
      const lip = groundY(x0 - dir * 20);
      ctx.beginPath();
      ctx.moveTo(x0 - dir * 30, lip + 2);
      ctx.lineTo(x0 + dir * 22, lip + 4);
      let x = x0 + dir * 22;
      for (let y = lip + 16; y < lip + 620; y += 14 + r() * 22) {
        x = x0 + dir * (6 + r() * 26 + Math.max(0, 1 - (y - lip) / 60) * 10);
        ctx.lineTo(x, y);
        if (r() < 0.3) ctx.lineTo(x - dir * (6 + r() * 10), y + 6);
      }
      ctx.lineTo(x0 - dir * 30, lip + 640);
      ctx.closePath();
      ctx.fill();
    }
    // roots hanging off the lips of the pit
    for (const [x0, dir] of [[PIT[0] + 4, 1], [PIT[1] - 4, -1]]) {
      const gy = groundY(x0 - dir * 30);
      for (let k = 0; k < 4; k++) {
        branch(ctx, r, x0 - dir * (10 + k * 14), gy + 6 + k * 10, Math.PI / 2 + dir * (0.5 - r() * 0.4), 40 + r() * 70, 7 + r() * 5, 1, { bend: 0.5, droop: 0.08, tip: 0.1 });
      }
    }
    // the bones of something that woke the hound
    {
      const x = 5560, gy = groundY(x);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = S.ink;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x - 70, gy - 4); ctx.quadraticCurveTo(x, gy - 18, x + 70, gy - 6); ctx.stroke();
      ctx.lineWidth = 4.5;
      for (let i = 0; i < 7; i++) {
        const bx = x - 54 + i * 18, h = 34 + Math.sin(i / 6 * Math.PI) * 26;
        ctx.beginPath(); ctx.moveTo(bx, gy - 10); ctx.quadraticCurveTo(bx + 16, gy - 10 - h, bx + 30, gy - 10 - h * 0.55); ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(x + 104, gy - 12, 20, 14, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 112, gy - 20); ctx.lineTo(x + 150, gy - 8); ctx.lineTo(x + 112, gy - 4); ctx.fill();
    }
    // ferns and bushes along the way, leaving the solids clear
    const clear = (x) => STATIC.every((s) => x < s.x - 60 || x > s.x + s.w + 60) && (x < PIT[0] - 80 || x > PIT[1] + 80)
      && TRAP_XS.every((t) => Math.abs(x - t) > 90) && (x < 3040 || x > 3380);
    for (let x = 200; x < lw; x += 260 + r() * 520) {
      if (!clear(x)) continue;
      if (r() < 0.55) fern(ctx, r, x, groundY(x) + 3, 60 + r() * 60);
      else bush(ctx, r, x, groundY(x) + 6, 30 + r() * 30);
    }
    grass(ctx, r, -50, lw + 50, (x) => groundY(x) + 1, { step: 4, h: 9, w: 1.6 });
  },
};

// Blurred black shapes close to the lens: grass rising from below, a few huge trunks, leaves at the top.
export const FRONT = {
  key: 'front', f: 1.42, res: 0.25, blur: 15, depth: 40,
  draw: (ctx, lw, r) => {
    ctx.fillStyle = S.front;
    const leaves = leafCluster(48);
    const bottom = VIEW_H + 200;
    for (let x = 1500; x < lw; x += 2600 + r() * 1800) {
      tree(ctx, r, x, bottom, { w: 150 + r() * 120, h: 1700, branches: 1, depth: 1, stubs: 2, top: 0.8, shade: 0.6 });
    }
    for (let x = 400 + r() * 300; x < lw; x += 700 + r() * 1100) {
      grass(ctx, r, x, x + 160 + r() * 260, () => bottom - 120, { step: 14, h: 320, w: 9, lean: (r() - 0.5) * 0.6 });
      if (r() < 0.5) fern(ctx, r, x + 120, VIEW_H + 40, 300);
    }
    for (let x = 200; x < lw; x += 1800 + r() * 1400) {
      const side = r() < 0.5 ? -1 : 1;
      branch(ctx, r, x, -260, Math.PI / 2 + side * (0.9 + r() * 0.4), 300 + r() * 200, 70, 2, { droop: -0.03, leaves, bend: 0.25 });
    }
  },
};

// Paint a layer into a canvas, blur it, cut it into GPU-sized chunks and add them to the scene.
// Last touches on a painted layer (canvas pixels): warm light on the edges facing the sun, and the fibre
// pattern, faint, so the colour reads as paint on canvas.
function finish(src, L) {
  const k = L.res, w = src.width, h = src.height;
  const out = mkCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  // the shape minus itself shifted away from the light leaves its lit edges
  const d = Math.max(1, 4 * k);
  const e = mkCanvas(w, h), ec = e.getContext('2d');
  ec.drawImage(src, 0, 0);
  ec.globalCompositeOperation = 'source-in';
  ec.fillStyle = S.rim;
  ec.fillRect(0, 0, w, h);
  ec.globalCompositeOperation = 'destination-out';
  ec.drawImage(src, d, d * 0.6);
  ctx.drawImage(e, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = ctx.createPattern(fibre(), 'repeat');
  ctx.fillRect(0, 0, w, h);
  return out;
}

// Fibre: faint light and dark flecks and short strands, tiling.
let fibreCanvas;
function fibre() {
  if (fibreCanvas) return fibreCanvas;
  const c = fibreCanvas = mkCanvas(256, 256), ctx = c.getContext('2d'), r = rng(5);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.07})` : `rgba(0,0,0,${r() * 0.08})`;
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 160; i++) {
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 4 + r() * 12;
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  return c;
}

// Painted once per page; a restart reuses the textures.
const painted = new Map();
export function addLayer(scene, L) {
  const [y0, y1] = L.y ?? Y_SPAN;
  const place = (chunks) => chunks.map(({ key, x }) => scene.add.image(x / L.res, y0, key).setOrigin(0, 0)
    .setScale(1 / L.res).setScrollFactor(L.f, L.f).setDepth(L.depth));
  const id = L.key;
  if (painted.has(id)) return place(painted.get(id));
  const lw = layerWidth(L.f);
  const pad = Math.ceil(L.blur * 3 + 8);
  const c = mkCanvas((lw + pad * 2) * L.res, (y1 - y0 + pad * 2) * L.res);
  const ctx = c.getContext('2d');
  ctx.scale(L.res, L.res);
  ctx.translate(pad, pad - y0);
  L.draw(ctx, lw, rng(L.key.length * 977 + 13));
  const soft = finish(blurCanvas(c, L.blur * L.res), L);
  const px = Math.round(pad * L.res);
  const w = Math.round(lw * L.res), h = Math.round((y1 - y0) * L.res);
  const chunks = [];
  for (let cx = 0; cx < w; cx += CHUNK) {
    const cw = Math.min(CHUNK + 2, w - cx);
    const part = mkCanvas(cw, h);
    part.getContext('2d').drawImage(soft, px + cx, px, cw, h, 0, 0, cw, h);
    const key = `${id}_${cx}`;
    scene.textures.addCanvas(key, part);
    chunks.push({ key, x: cx });
  }
  painted.set(id, chunks);
  return place(chunks);
}
