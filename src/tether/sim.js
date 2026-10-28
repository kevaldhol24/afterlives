// Tether: one dive. A diver on an air hose from the boat. The hose is a verlet rope that pays out as you swim,
// wraps round rocks and timbers, kinks when pulled tight round something thin (air stops, the tank drains),
// and can be reeled in by the crew along its own path (it stalls if the path is snagged).
// No Phaser here: runs in Node for scripted tests (see tests/tether.test.mjs).

import { SURF, BOAT_X, PX_PER_M, ITEMS, EEL, pushGround, pushObst } from './world.js';

export const STEP = 1 / 60;
export const SEG = 14;            // hose link length
export const DIVER_R = 20;
const ROPE_R = 3;
const THRUST = 700;               // px/s² at full stick
const DRAG = 2.4;                 // water drag on the diver (terminal swim ~230 px/s)
const SINK = 40;                  // weighted boots
const SINK_PER_W = 24;            // each unit of sack weight
const THRUST_LOSS_PER_W = 0.07;
const ROPE_G = 3;                 // the hose sinks slowly
const ROPE_DRAG = 0.5;
const DIVER_W = 0.04;             // diver's inverse mass vs a hose link (he drags the hose, not the other way round)
const ITERS = 10;
const PAYOUT = 420;               // crew pays out hose as fast as you pull it
const TAKEUP = 35;                // ...and takes up slack when you stop pulling
const SACK_CAP = 6;
const MAX_YANK = 3.5;             // px per step a rigid hose may move the diver
const TAUT_AT = 0.05;             // px/step a rigid hose holds the diver back by
const PAY_AT = 0.06;              // px/step the hose pulls at the boat before the crew pays out
const KINK_ON = 2.15;             // fold angle (rad) at a contact point: ~125°
const KINK_OFF = 1.85;

export const UPGRADES = {
  hose: { name: 'Hose length', values: [1700, 2300, 2900, 3500, 4100, 4800], costs: [60, 140, 260, 420, 650], fmt: (v) => `${Math.round(v / PX_PER_M)} m` },
  tank: { name: 'Emergency tank', values: [12, 18, 24, 30, 36], costs: [50, 120, 220, 350], fmt: (v) => `${v} s of air` },
  winch: { name: 'Winch', values: [90, 130, 170, 210, 250], costs: [40, 100, 180, 300], fmt: (v) => `${(v / PX_PER_M).toFixed(1)} m/s` },
};
export const gear = (lv) => ({
  hoseMax: UPGRADES.hose.values[lv.hose], tankMax: UPGRADES.tank.values[lv.tank], winch: UPGRADES.winch.values[lv.winch],
});

const pt = (x, y) => ({ x, y, px: x, py: y, c: false });

export class Dive {
  constructor(levels, opts = {}) {
    this.g = gear(levels);
    this.anchor = { ...pt(BOAT_X, SURF), fixed: true };
    this.diver = pt(BOAT_X + 30, SURF + 40);
    this.P = [this.anchor, this.diver];
    this.r0 = Math.hypot(30, 40);
    this.items = ITEMS.filter((it) => !(it.kind === 'page' && opts.havePage)).map((it) => ({ ...it, got: false }));
    this.sack = []; this.t = 0;
    this.tank = this.g.tankMax;
    this.taut = 0; this.slackTime = 0; this.pull = 0;
    this.kinked = false; this.kinkAt = -1; this.fold = 0; this.untautTime = 0;
    this.leaks = [];              // links counted from the diver end, so they stay put as hose pays out
    this.stalled = false; this.reelTime = 0; this.trail = [];
    this.face = { x: 1, y: 0.2 };
    this.eel = { timer: 0, cool: 0, lunge: 0, tx: EEL.x, ty: EEL.y };
    this.state = 'dive';          // dive | docked | dead
    this.events = [];
    this.sackFullNote = 0;
    this.away = false;            // has left the boat; docking only counts after that
  }

  get L() { return this.r0 + (this.P.length - 2) * SEG; }
  get weight() { return this.sack.reduce((s, it) => s + it.w, 0); }
  get value() { return this.sack.reduce((s, it) => s + it.value, 0); }
  get depthM() { return Math.max(0, Math.round((this.diver.y - SURF) / PX_PER_M)); }
  get flow() { return this.kinked ? 0 : Math.max(0, 1 - 0.3 * this.leaks.length); }
  rest(i) { return i === 0 ? this.r0 : SEG; }

  payout(d) {
    this.r0 += d;
    while (this.r0 > SEG) {
      const a = this.P[0], b = this.P[1];
      const dx = a.x - b.x, dy = a.y - b.y, dl = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, SEG / dl);
      this.P.splice(1, 0, pt(b.x + dx * k, b.y + dy * k));
      this.r0 -= SEG;
    }
  }

  reel(d) {
    this.r0 -= d;
    while (this.r0 <= 0.5 && this.P.length > 2) { this.P.splice(1, 1); this.r0 += SEG; }
    if (this.P.length === 2) this.r0 = Math.max(this.r0, 10);
  }

  // inp: { x, y } stick (-1..1), reel: bool
  step(inp, dt = STEP) {
    this.events.length = 0;
    if (this.state !== 'dive') return this.events;
    this.t += dt;
    const d = this.diver, P = this.P, W = this.weight;
    const reeling = !!inp.reel;

    // ---- diver ----
    let ix = inp.x || 0, iy = inp.y || 0;
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    if (m > 0.2) { this.face.x += (ix - this.face.x) * 0.12; this.face.y += (iy - this.face.y) * 0.12; }
    const thrust = THRUST * Math.max(0.4, 1 - THRUST_LOSS_PER_W * W) * (reeling ? 0.35 : 1);
    const ax = ix * thrust, ay = iy * thrust + SINK + SINK_PER_W * W;
    const vx = (d.x - d.px) * (1 - DRAG * dt), vy = (d.y - d.py) * (1 - DRAG * dt);
    d.px = d.x; d.py = d.y;
    d.x += vx + ax * dt * dt; d.y += vy + ay * dt * dt;

    // ---- hose links ----
    for (let i = 1; i < P.length - 1; i++) {
      const p = P[i];
      const hx = (p.x - p.px) * (1 - ROPE_DRAG * dt), hy = (p.y - p.py) * (1 - ROPE_DRAG * dt);
      p.px = p.x; p.py = p.y;
      p.x += hx; p.y += hy + ROPE_G * dt * dt;
    }

    const collideRope = () => {
      for (let i = 1; i < P.length - 1; i++) {
        const p = P[i];
        const a = pushGround(p, ROPE_R), b = pushObst(p, ROPE_R);
        p.c = a || b;
        if (p.y < SURF - 2) p.y = SURF - 2;
      }
    };

    const dx0 = d.x, dy0 = d.y;
    let boatPull = 0;   // how hard the hose pulls at the boat (the tender feels this and pays out more)
    for (let it = 0; it < ITERS; it++) {
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy), r = this.rest(i);
        if (dl <= r || dl < 1e-6) continue;   // a hose doesn't push, only pulls
        if (i === 0) boatPull += dl - r;
        const wa = a.fixed ? 0 : 1, wb = b === d ? DIVER_W : 1, s = wa + wb;
        const k = (dl - r) / dl / s;
        a.x += dx * k * wa; a.y += dy * k * wa;
        b.x -= dx * k * wb; b.y -= dy * k * wb;
      }
      if (it % 2 === 1) collideRope();
    }

    // Inextensible pass from the boat outwards, only when the hose is all paid out or the winch is pulling:
    // then the hose can't stretch, so it holds the diver back / drags him in along its own path.
    const rigid = reeling || this.L >= this.g.hoseMax - 0.5;
    if (rigid) {
      const bx = d.x, by = d.y;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy), r = this.rest(i);
        if (dl > r) { const k = (dl - r) / dl; b.x -= dx * k; b.y -= dy * k; }
      }
      // never yank him more than a few px in one step, or he could be pulled straight through a thin timber
      const mx = d.x - bx, my = d.y - by, ml = Math.hypot(mx, my);
      if (ml > MAX_YANK) { d.x = bx + (mx / ml) * MAX_YANK; d.y = by + (my / ml) * MAX_YANK; }
    }
    const corr = Math.hypot(d.x - dx0, d.y - dy0);   // how hard the hose held the diver back this step
    collideRope();
    pushGround(d, DIVER_R); pushObst(d, DIVER_R);
    if (d.y < SURF + 12) d.y = SURF + 12;

    this.dbg = { corr, boatPull };
    this.pull += (boatPull - this.pull) * 0.2;
    // taut = the pull reaches the boat (or the hose is all out / on the winch and holding him)
    const tight = this.pull > PAY_AT || (rigid && corr > TAUT_AT);
    this.taut += ((tight ? 1 : 0) - this.taut) * 0.25;
    const taut = this.taut > 0.3;

    // ---- crew: pay out, take up slack, reel ----
    if (reeling) {
      this.reelTime += dt;
      this.trail.push(d.x, d.y); if (this.trail.length > 80) this.trail.splice(0, 2);
      const moved = this.trail.length >= 80 ? Math.hypot(d.x - this.trail[0], d.y - this.trail[1]) : 99;
      const wasStalled = this.stalled;
      this.stalled = this.kinked || (this.reelTime > 0.8 && taut && moved < 10);   // a kinked hose won't pull through
      if (this.stalled && !wasStalled) this.events.push({ type: 'stall' });
      if (!this.stalled) this.reel(this.g.winch * dt);
    } else {
      this.reelTime = 0; this.trail.length = 0; this.stalled = false;
      if (this.pull > PAY_AT && this.L < this.g.hoseMax) {
        const left = this.g.hoseMax - this.L;
        this.payout(left < 20 ? left : Math.min(PAYOUT * dt, boatPull * 1.2 + 0.2, left)); this.slackTime = 0;
      } else if (!taut && this.pull < PAY_AT * 0.4) {
        this.slackTime += dt;
        if (this.slackTime > 1.5 && this.L > 80) this.reel(TAKEUP * dt);
      } else this.slackTime = 0;
    }
    this.atMax = taut && !reeling && this.L >= this.g.hoseMax - 1;

    // ---- kinks: hose folded tight round something thin ----
    let fold = 0, at = -1;
    for (let i = 3; i < P.length - 4; i++) {
      if (!P[i].c) continue;
      const a = P[i - 3], b = P[i], c = P[i + 3];
      const ux = b.x - a.x, uy = b.y - a.y, wx = c.x - b.x, wy = c.y - b.y;
      const n = Math.hypot(ux, uy) * Math.hypot(wx, wy);
      if (n < 1e-6) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy) / n)));
      if (ang > fold) { fold = ang; at = i; }
    }
    this.fold = fold;
    this.untautTime = taut ? 0 : this.untautTime + dt;
    if (!this.kinked && fold > KINK_ON && taut) { this.kinked = true; this.events.push({ type: 'kink' }); }
    else if (this.kinked && (fold < KINK_OFF || this.untautTime > 0.5)) { this.kinked = false; this.events.push({ type: 'unkink' }); }
    this.kinkAt = this.kinked ? at : -1;

    // ---- air ----
    const flow = this.flow;
    if (flow >= 1) this.tank = Math.min(this.g.tankMax, this.tank + 0.6 * dt);
    else this.tank -= (1 - flow) * dt;
    if (this.tank <= 0) { this.tank = 0; this.state = 'dead'; this.events.push({ type: 'dead' }); return this.events; }

    // ---- salvage ----
    for (const it of this.items) {
      if (it.got || Math.hypot(it.x - d.x, it.y - d.y) > DIVER_R + 18) continue;
      if (W + it.w > SACK_CAP) { if (this.t - this.sackFullNote > 2) { this.sackFullNote = this.t; this.events.push({ type: 'full' }); } continue; }
      it.got = true; this.sack.push(it); this.events.push({ type: 'pickup', item: it });
    }

    // ---- the eel ----
    const e = this.eel;
    e.cool = Math.max(0, e.cool - dt); e.lunge = Math.max(0, e.lunge - dt);
    let near = -1, nd = 130;
    for (let i = 1; i < P.length - 1; i++) {
      const q = Math.hypot(P[i].x - EEL.x, P[i].y - EEL.y);
      if (q < nd) { nd = q; near = i; }
    }
    e.timer = near >= 0 ? e.timer + dt : Math.max(0, e.timer - dt);
    if (near >= 0 && e.timer > 1.1 && e.cool <= 0) {
      e.cool = 5; e.lunge = 0.5; e.timer = 0; e.tx = P[near].x; e.ty = P[near].y;
      if (this.leaks.length < 3) this.leaks.push(P.length - 1 - near);
      this.events.push({ type: 'bite' });
    }

    // ---- back on the boat ----
    if (d.y > SURF + 160 || Math.abs(d.x - BOAT_X) > 200) this.away = true;
    if (this.away && ((Math.abs(d.x - BOAT_X) < 110 && d.y < SURF + 46) || (this.P.length <= 3 && this.L < 60))) {
      this.state = 'docked'; this.events.push({ type: 'dock' });
    }
    return this.events;
  }

  leakPoints() {
    return this.leaks.map((k) => this.P[this.P.length - 1 - k]).filter(Boolean);
  }
}
