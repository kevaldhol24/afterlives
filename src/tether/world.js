// Tether: the dive site (Wreck Graveyard), seen from the side. The boat floats at the surface on the left;
// the seabed slopes down to the right, drops off a cliff onto a wreck field, then into a trench.
// No Phaser here: the sim runs in Node for scripted tests.

export const SURF = 160;          // water surface (world y)
export const BOAT_X = 500;        // hose anchor x, at the surface
export const PX_PER_M = 10;       // depth readout
export const WORLD = { left: -400, right: 5400, top: -360, bottom: 1950 };

// Seabed as a polyline, left to right; water is above it.
export const GROUND = [
  [-400, 110], [-150, 300], [100, 520], [200, 560], [600, 585], [900, 610], [1150, 650], [1400, 700],
  [1650, 745], [1900, 770], [2150, 790], [2200, 820], [2225, 1110], [2400, 1150], [2800, 1165],
  [3200, 1160], [3600, 1175], [3850, 1195], [3900, 1240], [3925, 1700], [4200, 1745], [4600, 1760],
  [4900, 1720], [5050, 1500], [5150, 1000], [5250, 600], [5400, 300], [5600, 120],
];

const R = (x, y, w, h, tag) => ({ k: 'r', x, y, w, h, tag });
const C = (x, y, r, tag) => ({ k: 'c', x, y, r, tag });

// Rocks (circles) and wreck timbers / spires (rects). Thin things (< 24 px) fold the hose into a kink;
// round rocks it just bends around.
export const OBST = [
  // the reef
  C(720, 590, 42), C(990, 625, 55), C(1160, 655, 24), C(1420, 705, 60), C(1720, 750, 46), C(1860, 768, 30),
  R(1250, 560, 18, 150, 'spire'), R(1960, 640, 16, 150, 'spire'),
  C(1530, 668, 30), R(1530, 626, 170, 16, 'arch'),   // a rock arch: go over it, then back under it, and the hose folds
  // the wreck: deck with a hole in the middle, two hull walls, a bulkhead, two masts with yards
  R(2470, 900, 380, 20, 'deck'), R(3060, 900, 440, 20, 'deck'),
  R(2470, 900, 22, 215, 'hull'),
  R(3478, 900, 22, 130, 'hull'),          // right wall: breached at the bottom (1030..1160)
  R(2470, 1110, 1030, 24, 'keel'),
  R(2920, 960, 16, 150, 'bulkhead'),      // gap above it (920..960) lets you through
  R(2690, 620, 16, 280, 'mast'), R(2600, 700, 190, 16, 'yard'),
  R(3270, 700, 16, 200, 'mast'), R(3200, 760, 150, 16, 'yard'),
  // past the wreck and the trench
  C(3720, 1160, 52), C(4110, 1720, 60), R(4310, 1530, 16, 230, 'spire'), C(4520, 1735, 40),
];

// Salvage. w = weight in the sack; heavy things slow you down.
export const ITEMS = [
  // reef: coins and pearls
  ...[[560, 540], [820, 555], [1060, 590], [1200, 610], [1330, 640], [1520, 690], [1610, 680], [1800, 700], [2050, 750]]
    .map(([x, y]) => ({ kind: 'coin', x, y, value: 5, w: 0 })),
  { kind: 'pearl', x: 990, y: 558, value: 20, w: 0 },
  { kind: 'pearl', x: 1720, y: 692, value: 20, w: 0 },
  // cliff foot
  { kind: 'coin', x: 2290, y: 1100, value: 5, w: 0 }, { kind: 'coin', x: 2360, y: 1110, value: 5, w: 0 },
  // the wreck
  { kind: 'coin', x: 2600, y: 1080, value: 5, w: 0 }, { kind: 'coin', x: 2780, y: 1080, value: 5, w: 0 },
  { kind: 'coin', x: 3000, y: 1080, value: 5, w: 0 }, { kind: 'coin', x: 3380, y: 1080, value: 5, w: 0 },
  { kind: 'pearl', x: 2800, y: 870, value: 20, w: 0 },
  { kind: 'crate', x: 2560, y: 1086, value: 90, w: 3 },
  { kind: 'crate', x: 3170, y: 1086, value: 90, w: 3 },
  // the trench
  { kind: 'pearl', x: 4150, y: 1645, value: 20, w: 0 }, { kind: 'coin', x: 4420, y: 1720, value: 5, w: 0 },
  { kind: 'idol', x: 4680, y: 1725, value: 300, w: 2 },
  { kind: 'page', x: 4760, y: 1735, value: 0, w: 0 },
];

// An eel in the breach of the wreck's right hull wall. It bites hose that lingers near its hole.
export const EEL = { x: 3500, y: 1080 };

export function groundY(x) {
  for (let i = 0; i < GROUND.length - 1; i++) {
    const a = GROUND[i], b = GROUND[i + 1];
    if (x >= a[0] && x <= b[0]) return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0] || 1));
  }
  return x < GROUND[0][0] ? GROUND[0][1] : GROUND[GROUND.length - 1][1];
}

const TOUCH = 1.5; // counts as touching within this many px
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Push point p (radius r) out of the seabed. Returns true on contact.
export function pushGround(p, r) {
  const under = p.y > groundY(p.x);
  let best = null, bd = Infinity;
  for (let i = 0; i < GROUND.length - 1; i++) {
    const a = GROUND[i], b = GROUND[i + 1];
    if (b[0] < p.x - r - 120 || a[0] > p.x + r + 120) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    const qx = a[0] + dx * t, qy = a[1] + dy * t;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < bd) { bd = d; best = { qx, qy, dx, dy }; }
  }
  if (!best || (!under && bd >= r + TOUCH)) return false;
  if (!under && bd >= r) return true;   // resting on it
  let nx, ny;
  if (bd > 1e-6) { nx = (p.x - best.qx) / bd; ny = (p.y - best.qy) / bd; if (under) { nx = -nx; ny = -ny; } }
  else { const l = Math.hypot(best.dx, best.dy); nx = best.dy / l; ny = -best.dx / l; }
  p.x = best.qx + nx * r; p.y = best.qy + ny * r;
  return true;
}

// Push point p (radius r) out of rocks and timbers. Returns true on contact.
export function pushObst(p, r) {
  let hit = false;
  for (const o of OBST) {
    if (o.k === 'c') {
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), m = o.r + r;
      if (d < m + TOUCH) hit = true;
      if (d < m) { const s = d > 1e-6 ? m / d : 0; p.x = d > 1e-6 ? o.x + dx * s : o.x; p.y = d > 1e-6 ? o.y + dy * s : o.y - m; }
    } else {
      if (p.x < o.x - r - TOUCH || p.x > o.x + o.w + r + TOUCH || p.y < o.y - r - TOUCH || p.y > o.y + o.h + r + TOUCH) continue;
      const qx = clamp(p.x, o.x, o.x + o.w), qy = clamp(p.y, o.y, o.y + o.h);
      const dx = p.x - qx, dy = p.y - qy, d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        if (d < r + TOUCH) hit = true;
        if (d < r) { p.x = qx + (dx / d) * r; p.y = qy + (dy / d) * r; }
      } else {
        // centre inside the rect: out through the nearest side
        hit = true;
        const l = p.x - o.x, rr = o.x + o.w - p.x, t = p.y - o.y, b = o.y + o.h - p.y, m = Math.min(l, rr, t, b);
        if (m === l) p.x = o.x - r; else if (m === rr) p.x = o.x + o.w + r; else if (m === t) p.y = o.y - r; else p.y = o.y + o.h + r;
      }
    }
  }
  return hit;
}
