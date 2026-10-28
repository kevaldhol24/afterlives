// Canvas painting for the forest: trees, ground, plants, and the textures for light, fog and grain.
// Everything is drawn once at boot into offscreen canvases.
import { S } from './style.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const lerp = (a, b, t) => a + (b - a) * t;
const range = (r, [a, b]) => a + (b - a) * r();

// ---------- blur ----------

let filterOK;
function canFilter() {
  if (filterOK === undefined) {
    const ctx = mkCanvas(2, 2).getContext('2d');
    try { ctx.filter = 'blur(2px)'; filterOK = ctx.filter === 'blur(2px)'; } catch (e) { filterOK = false; }
  }
  return filterOK;
}

// Gaussian blur through the canvas filter, or (Safari before 18) a few down/up-scale passes.
export function blurCanvas(src, px) {
  if (px < 0.35) return src;
  const out = mkCanvas(src.width, src.height);
  const ctx = out.getContext('2d');
  if (canFilter()) {
    ctx.filter = `blur(${px}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    return out;
  }
  let cur = src;
  const k = Math.max(1.5, px / 1.2);
  for (let pass = 0; pass < 2; pass++) {
    const small = mkCanvas(src.width / k, src.height / k);
    const s = small.getContext('2d');
    s.imageSmoothingQuality = 'high';
    s.drawImage(cur, 0, 0, small.width, small.height);
    const back = mkCanvas(src.width, src.height);
    const b = back.getContext('2d');
    b.imageSmoothingQuality = 'high';
    b.drawImage(small, 0, 0, back.width, back.height);
    cur = back;
  }
  ctx.drawImage(cur, 0, 0);
  return out;
}

// ---------- shapes ----------

// Closed smooth path through points (quadratic curves through the midpoints). Returns the path.
function smoothShape(ctx, P) {
  const n = P.length;
  const path = new Path2D();
  const m0 = [(P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2];
  path.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n];
    path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  path.closePath();
  ctx.fill(path);
  return path;
}

// A tapered limb along a polyline, width w0 at the start to w1 at the end.
export function limb(ctx, pts, w0, w1, r, rough = 0.12) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const t = i / (n - 1);
    const w = lerp(w0, w1, Math.pow(t, 0.85)) / 2;
    const wl = w * (1 + (r() - 0.5) * rough), wr = w * (1 + (r() - 0.5) * rough);
    L.push([pts[i].x - dy * wl, pts[i].y + dx * wl]);
    R.push([pts[i].x + dy * wr, pts[i].y - dx * wr]);
  }
  const path = new Path2D();
  path.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) {
    const p = L[i - 1], q = L[i];
    path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  path.lineTo(L[n - 1][0], L[n - 1][1]);
  const tip = pts[n - 1];
  path.lineTo(tip.x, tip.y);
  path.lineTo(R[n - 1][0], R[n - 1][1]);
  for (let i = n - 2; i >= 0; i--) {
    const p = R[i + 1], q = R[i];
    path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  path.lineTo(R[0][0], R[0][1]);
  path.closePath();
  path.moveTo(pts[0].x + w0 / 2, pts[0].y);
  path.arc(pts[0].x, pts[0].y, w0 / 2, 0, Math.PI * 2);
  ctx.fill(path);
  return path;
}

// Shade a trunk or limb already filled along `pts` (its outline is `path`): the side away from the light in
// shadow, a thin lit edge on the side facing it (up and left), and bark: long wavy grooves and a few knots.
export function shadeLimb(ctx, r, path, pts, w0, w1, k = 1) {
  const n = pts.length;
  if (n < 2 || w0 < 6) return;
  ctx.save();
  ctx.clip(path);
  ctx.lineCap = 'round';
  const wAt = (i) => lerp(w0, w1, Math.pow(i / (n - 1), 0.85));
  const along = (u, wob = 0, ph = 0) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      // the normal that points right of the way up the trunk
      const nx = -dy, ny = dx;
      const s = (u + Math.sin(i * 0.9 + ph) * wob) * wAt(i) / 2;
      out.push([pts[i].x + nx * s * Math.sign(nx || 1), pts[i].y + ny * s * Math.sign(nx || 1)]);
    }
    return out;
  };
  const stroke = (line, width, style) => {
    ctx.strokeStyle = style; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
    ctx.stroke();
  };
  const w = (w0 + w1) / 2;
  stroke(along(0.62), w * 0.75, `rgba(0,0,0,${0.32 * k})`);
  stroke(along(0.9), w * 0.4, `rgba(0,0,0,${0.3 * k})`);
  stroke(along(-0.86), Math.max(1, w * 0.12), `rgba(255,224,160,${0.16 * k})`);
  const grooves = Math.min(14, 3 + Math.floor(w / 9));
  for (let g = 0; g < grooves; g++) {
    const u = -0.8 + r() * 1.6;
    stroke(along(u, 0.05, r() * 6), 0.8 + r() * Math.max(1, w * 0.04), r() < 0.75 ? `rgba(0,0,0,${(0.12 + r() * 0.16) * k})` : `rgba(255,230,180,${0.05 * k})`);
  }
  for (let q = 0; q < Math.floor(w / 25); q++) {
    const p = pts[1 + Math.floor(r() * (n - 2))], s = w * (0.06 + r() * 0.08);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * k})`;
    ctx.beginPath(); ctx.ellipse(p.x + (r() - 0.5) * w * 0.4, p.y, s * 0.7, s * 1.3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// A wandering path from (x, y) heading `ang` (radians, y down). droop pulls it towards the ground.
function path(r, x, y, ang, len, bend, droop = 0) {
  const n = Math.max(3, Math.round(len / 12));
  const seg = len / n;
  const pts = [{ x, y, a: ang }];
  let dx = Math.cos(ang), dy = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const turn = (r() - 0.5) * bend;
    const c = Math.cos(turn), s = Math.sin(turn);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
    dy += droop;
    const d = Math.hypot(dx, dy);
    dx /= d; dy /= d;
    x += dx * seg; y += dy * seg;
    pts.push({ x, y, a: Math.atan2(dy, dx) });
  }
  return pts;
}

// A branch with sub-branches. o: bend, droop, tip (end width share), leaves (draw fn at twig ends), vines.
export function branch(ctx, r, x, y, ang, len, w, depth, o = {}) {
  const pts = path(r, x, y, ang, len, o.bend ?? 0.14, o.droop ?? 0);
  const tip = o.tip ?? 0.22;
  limb(ctx, pts, w, Math.max(0.6, w * tip), r, o.rough ?? 0.1);
  const n = pts.length - 1;
  if (depth > 0) {
    const kids = 1 + Math.floor(r() * (o.kids ?? 2.6));
    for (let k = 0; k < kids; k++) {
      const t = 0.3 + r() * 0.65;
      const p = pts[Math.round(t * n)];
      const side = r() < 0.5 ? -1 : 1;
      const wk = lerp(w, w * tip, t) * (0.5 + r() * 0.25);
      branch(ctx, r, p.x, p.y, p.a + side * (0.35 + r() * 0.65), len * (0.3 + r() * 0.38), wk, depth - 1, o);
    }
    branch(ctx, r, pts[n].x, pts[n].y, pts[n].a + (r() - 0.5) * 0.5, len * (0.25 + r() * 0.3), w * tip * 0.9, depth - 1, o);
  } else if (o.leaves) {
    o.leaves(ctx, r, pts[n].x, pts[n].y, pts[n].a);
  }
  if (o.vines && r() < o.vines) vine(ctx, r, pts[Math.round(n * (0.5 + r() * 0.5))], range(r, o.vineLen ?? [60, 220]), Math.max(1, w * 0.12));
  return pts;
}

// A thin hanging strand with a little kink.
export function vine(ctx, r, p, len, w) {
  const pts = [];
  const sway = (r() - 0.5) * len * 0.25;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push({ x: p.x + sway * t * t + Math.sin(t * 6 + r()) * 2, y: p.y + len * t });
  }
  limb(ctx, pts, w, w * 0.5, r, 0.05);
}

// Small pointed leaves fanning around a twig end.
export function leafCluster(size) {
  return (ctx, r, x, y, a) => {
    const count = 3 + Math.floor(r() * 5);
    for (let i = 0; i < count; i++) {
      const la = a + (r() - 0.5) * 2.4 + 0.6;
      const len = size * (0.6 + r() * 0.6);
      const cx = x + Math.cos(la) * len * 0.5, cy = y + Math.sin(la) * len * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(la);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(0, -len * 0.28, len / 2, 0);
      ctx.quadraticCurveTo(0, len * 0.28, -len / 2, 0);
      ctx.fill();
      ctx.restore();
    }
  };
}

// A whole tree: flared base, roots into the ground, a tall trunk, stubs and high branches.
export function tree(ctx, r, x, gy, o) {
  const w = o.w, h = o.h;
  const lean = o.lean ?? (r() - 0.5) * 0.1;
  // roots
  const roots = 3 + Math.floor(r() * 3);
  for (let k = 0; k < roots; k++) {
    const side = k % 2 ? 1 : -1;
    const a = side > 0 ? 0.12 + r() * 0.5 : Math.PI - 0.12 - r() * 0.5;
    branch(ctx, r, x + side * w * (0.1 + r() * 0.25), gy - w * (0.15 + r() * 0.35), a,
      w * (0.9 + r() * 1.7), w * (0.32 + r() * 0.22), o.rootDepth ?? 0, { bend: 0.35, droop: 0.06, tip: 0.12, kids: 1.2 });
  }
  // flare
  const fw = w * (1.15 + r() * 0.45), fh = w * (1.2 + r() * 1.2);
  ctx.beginPath();
  ctx.moveTo(x - fw, gy + 6);
  ctx.quadraticCurveTo(x - w * 0.5, gy - fh * 0.15, x - w * 0.48, gy - fh);
  ctx.lineTo(x + w * 0.48, gy - fh);
  ctx.quadraticCurveTo(x + w * 0.5, gy - fh * 0.15, x + fw, gy + 6);
  ctx.closePath();
  ctx.fill();
  // trunk
  const pts = path(r, x, gy + 8, -Math.PI / 2 + lean, h, o.bend ?? 0.06);
  const outline = limb(ctx, pts, w, w * (o.top ?? 0.55), r, 0.06);
  const n = pts.length - 1;
  const at = (t) => pts[Math.min(n, Math.round(t * n))];
  const wAt = (t) => lerp(w, w * (o.top ?? 0.55), t);
  // knots / broken stubs
  const stubs = Math.floor(r() * (o.stubs ?? 3));
  for (let k = 0; k < stubs; k++) {
    const t = 0.12 + r() * 0.6;
    const p = at(t), side = r() < 0.5 ? -1 : 1;
    branch(ctx, r, p.x, p.y, -Math.PI / 2 + side * (0.7 + r() * 0.6), wAt(t) * (0.4 + r() * 0.9), wAt(t) * (0.2 + r() * 0.12), 0, { tip: 0.65, bend: 0.2 });
  }
  // branches high up
  const count = o.branches ?? 3;
  for (let k = 0; k < count; k++) {
    const t = (o.branchFrom ?? 0.42) + r() * (1 - (o.branchFrom ?? 0.42));
    const p = at(t), side = r() < 0.5 ? -1 : 1;
    branch(ctx, r, p.x, p.y, -Math.PI / 2 + side * (0.55 + r() * 0.75), h * range(r, o.branchLen ?? [0.12, 0.3]),
      wAt(t) * (0.28 + r() * 0.16), o.depth ?? 2,
      { droop: o.droop ?? 0.035, bend: 0.22, leaves: o.leaves, vines: o.vines, vineLen: o.vineLen });
  }
  // shade the trunk last, so the stubs and branch roots get it too
  if (o.shade) shadeLimb(ctx, r, outline, pts, w * 1.15, w * (o.top ?? 0.55), o.shade);
  return pts;
}

// Ground silhouette from a height function down to `bottom`.
export function ground(ctx, r, x0, x1, fn, bottom, rough = 1.5) {
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + 6; x += 6) ctx.lineTo(x, fn(x) + (r() - 0.5) * rough);
  ctx.lineTo(x1 + 6, bottom);
  ctx.closePath();
  ctx.fill();
}

// Tufts of grass blades along the ground. o: step, h, lean, w.
export function grass(ctx, r, x0, x1, fn, o) {
  for (let x = x0; x < x1; x += o.step * (0.4 + r() * 1.2)) {
    if (o.patchy && Math.sin(x * o.patchy + 1.7) + Math.sin(x * o.patchy * 2.3) < -0.6) continue;
    const blades = 2 + Math.floor(r() * 4);
    const big = o.h * (0.5 + r() * 0.8);
    for (let i = 0; i < blades; i++) {
      const bx = x + (r() - 0.5) * o.step;
      const by = fn(bx) + 3;
      const hh = big * (0.45 + r() * 0.65);
      const lean = (o.lean ?? 0) + (r() - 0.5) * 0.9;
      const bw = (o.w ?? 2.4) * (0.7 + r() * 0.6);
      const tx = bx + Math.sin(lean) * hh, ty = by - Math.cos(lean) * hh;
      const mx = bx + Math.sin(lean * 0.4) * hh * 0.55, my = by - hh * 0.6;
      ctx.beginPath();
      ctx.moveTo(bx - bw, by);
      ctx.quadraticCurveTo(mx - bw * 0.4, my, tx, ty);
      ctx.quadraticCurveTo(mx + bw * 0.4, my, bx + bw, by);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// An arching fern: several fronds with leaflets that shrink to the tip.
export function fern(ctx, r, x, y, size) {
  const fronds = 4 + Math.floor(r() * 4);
  for (let f = 0; f < fronds; f++) {
    const a = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * 2.4 + (r() - 0.5) * 0.3;
    const len = size * (0.6 + r() * 0.5);
    // fine steps so the leaflets sit close together
    const steps = Math.max(8, Math.round(len / 5));
    const pts = [{ x, y, a }];
    let px = x, py = y, dx = Math.cos(a), dy = Math.sin(a);
    const curl = 0.9 * Math.sign(Math.cos(a) || 1) / steps;
    for (let i = 0; i < steps; i++) {
      const c = Math.cos(curl), s = Math.sin(curl);
      [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
      dy += 0.012; const d = Math.hypot(dx, dy); dx /= d; dy /= d;
      px += dx * len / steps; py += dy * len / steps;
      pts.push({ x: px, y: py, a: Math.atan2(dy, dx) });
    }
    limb(ctx, pts, size * 0.03 + 1, 0.5, r, 0);
    for (let i = 2; i < pts.length - 1; i++) {
      const t = i / pts.length;
      const ll = size * 0.2 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 1.5;
      const lw = Math.max(1, ll * 0.16);
      for (const side of [-1, 1]) {
        const la = pts[i].a + side * 0.95;
        const ex = pts[i].x + Math.cos(la) * ll, ey = pts[i].y + Math.sin(la) * ll + ll * 0.15;
        const nx = -Math.sin(la) * lw, ny = Math.cos(la) * lw;
        ctx.beginPath();
        ctx.moveTo(pts[i].x - nx, pts[i].y - ny);
        ctx.quadraticCurveTo((pts[i].x + ex) / 2 + nx * 1.4, (pts[i].y + ey) / 2 + ny * 1.4, ex, ey);
        ctx.quadraticCurveTo((pts[i].x + ex) / 2 - nx * 1.4, (pts[i].y + ey) / 2 - ny * 1.4, pts[i].x + nx, pts[i].y + ny);
        ctx.fill();
      }
    }
  }
}

// A round bush of overlapping leafy lumps.
export function bush(ctx, r, x, y, size) {
  const lumps = 5 + Math.floor(r() * 5);
  for (let i = 0; i < lumps; i++) {
    const a = Math.PI + (i / (lumps - 1)) * Math.PI;
    const d = size * (0.35 + r() * 0.3);
    const cx = x + Math.cos(a) * d * 1.2, cy = y + Math.sin(a) * d * 0.8;
    const rad = size * (0.3 + r() * 0.25);
    const P = [];
    for (let k = 0; k < 14; k++) {
      const ka = (k / 14) * Math.PI * 2;
      const rr = rad * (k % 2 ? 0.86 : 1.06) * (0.92 + r() * 0.16);
      P.push([cx + Math.cos(ka) * rr, cy + Math.sin(ka) * rr]);
    }
    smoothShape(ctx, P);
  }
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.9, size * 0.4, 0, Math.PI, 0);
  ctx.fill();
}

// A lumpy boulder whose top sits near `top`.
export function rock(ctx, r, x, w, top, bottom) {
  const P = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI + t * Math.PI;
    const px = x + w / 2 + Math.cos(a) * w * 0.52;
    const lift = Math.pow(Math.sin(t * Math.PI), 0.35);
    P.push([px + (r() - 0.5) * 6, bottom - (bottom - top) * lift + (r() - 0.5) * 5]);
  }
  P.push([x + w + 10, bottom + 30]);
  P.push([x - 10, bottom + 30]);
  const path = smoothShape(ctx, P);
  // a lit top, a dark underside and a crack or two
  ctx.save();
  ctx.clip(path);
  const g = ctx.createLinearGradient(x, top, x + w * 0.6, bottom);
  g.addColorStop(0, 'rgba(255,224,160,0.13)');
  g.addColorStop(0.45, 'rgba(255,224,160,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 20, top - 10, w + 40, bottom - top + 50);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 2; k++) {
    let cx = x + w * (0.25 + r() * 0.5), cy = top + 3;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    for (let s = 0; s < 4; s++) { cx += (r() - 0.5) * 10; cy += (bottom - top) * 0.22; ctx.lineTo(cx, cy); }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- textures ----------

// A tileable value-noise fog band: wide wisps, densest a little below its middle.
export function fogTexture(seed, w = 1024, h = 256) {
  const c = mkCanvas(w, h);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  const octaves = [[8, 3, 0.5], [16, 5, 0.28], [32, 9, 0.15], [64, 14, 0.07]];
  const grids = octaves.map(([gx, gy]) => Array.from({ length: gx * gy }, () => r()));
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (k, u, v) => {
    const [gx, gy] = octaves[k];
    const x = u * gx, y = v * (gy - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const g = grids[k];
    const at = (i, j) => g[(Math.min(gy - 1, j)) * gx + (i % gx)];
    const a = lerp(at(x0, y0), at(x0 + 1, y0), fx);
    const b = lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx);
    return lerp(a, b, fy);
  };
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const profile = Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.08)), 1.6);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let n = 0;
      for (let k = 0; k < octaves.length; k++) n += sample(k, u, v) * octaves[k][2];
      const a = Math.max(0, Math.min(1, (n - 0.32) * 1.9)) * profile;
      const i = (y * w + x) * 4;
      img.data[i] = 228; img.data[i + 1] = 230; img.data[i + 2] = 224;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// A god ray: a few soft streaks, bright at the top, fading out before the bottom.
export function shaftTexture(seed, w = 256, h = 1024) {
  const c = mkCanvas(w, h);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const cx = w * (0.15 + r() * 0.7);
    const sw = w * (0.015 + Math.pow(r(), 2) * 0.12);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const a = 0.25 + r() * 0.5;
    g.addColorStop(0, `rgba(255,252,240,0)`);
    g.addColorStop(0.08, `rgba(255,252,240,${a})`);
    g.addColorStop(0.45 + r() * 0.2, `rgba(255,252,240,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,252,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - sw * 0.35, 0);
    ctx.lineTo(cx + sw * 0.35, 0);
    ctx.lineTo(cx + sw * 1.1, h);
    ctx.lineTo(cx - sw * 1.1, h);
    ctx.fill();
  }
  return blurCanvas(c, 3);
}

// The sky behind everything: a soft grey wash with the light breaking through up and left of centre.
export function skyTexture(w, h, light) {
  const c = mkCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, S.sky[0]);
  g.addColorStop(0.38, S.sky[1]);
  g.addColorStop(0.62, S.sky[2]);
  g.addColorStop(1, S.sky[3]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rg = ctx.createRadialGradient(light.x * w, light.y * h, 0, light.x * w, light.y * h, w * 0.62);
  rg.addColorStop(0, `rgba(${S.sun},1)`);
  rg.addColorStop(0.18, `rgba(${S.sun},0.8)`);
  rg.addColorStop(0.5, `rgba(${S.sun},0.3)`);
  rg.addColorStop(1, `rgba(${S.sun},0)`);
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  dither(ctx, w, h, 3);
  return c;
}

// A soft round glow (white, alpha falling off like a gaussian).
export function glowTexture(size = 256) {
  const c = mkCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const a = d >= 1 ? 0 : Math.exp(-d * d * 4.5) * (1 - d * d);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Dark corners and a heavier top, like an old lens: the middle stays clear, the edges close in to near black.
export function vignetteTexture(w, h) {
  const c = mkCanvas(w, h);
  const ctx = c.getContext('2d');
  const v = S.vignette;
  const rg = ctx.createRadialGradient(w * 0.5, h * 0.55, w * 0.14, w * 0.5, h * 0.55, w * 0.7);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(0.45, `rgba(0,0,0,${Math.min(1, 0.3 * v)})`);
  rg.addColorStop(0.75, `rgba(0,0,0,${Math.min(1, 0.68 * v)})`);
  rg.addColorStop(1, `rgba(0,0,0,${Math.min(1, 0.92 * v)})`);
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  const tg = ctx.createLinearGradient(0, 0, 0, h * 0.35);
  tg.addColorStop(0, `rgba(0,0,0,${Math.min(1, 0.55 * v)})`);
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, w, h * 0.35);
  const bg = ctx.createLinearGradient(0, h, 0, h * 0.8);
  bg.addColorStop(0, `rgba(0,0,0,${Math.min(1, 0.5 * v)})`);
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  return c;
}

// Film grain: each pixel a little lighter or darker.
export function grainTexture(size = 256, seed = 7) {
  const c = mkCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = r() < 0.5 ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = Math.pow(r(), 1.6) * (v ? 30 : 50);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function dither(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const r = rng(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (r() - 0.5) * amount * 2;
    img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d;
  }
  ctx.putImageData(img, 0, 0);
}
