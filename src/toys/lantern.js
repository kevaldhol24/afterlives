// Toy 1: the lantern. Its light makes faded planks solid and withers thorns.
// Carrying it is heavy (low jump), so you put it down or throw it where the light is needed.

import { body, move, platformer, FEEL, GRAV, overlap, rect, tiles, cx, cy, drawCritter, INK } from './kit.js';

const LIGHT = 150;
const CARRY = { ...FEEL, run: 190, jump: 380 };
const THROW = { vx: 300, vy: -700 };

export class LanternRoom {
  constructor() {
    this.name = 'The Lantern';
    this.hint = 'E pick up / put down   ·   F throw   ·   light makes faded planks real and withers thorns';
    this.dead = false;
    this.won = false;

    this.solids = [
      rect(0, 460, 260, 80),       // start floor
      rect(500, 460, 200, 80),     // middle floor
      rect(700, 320, 260, 220),    // high ledge
      rect(-40, -300, 40, 900), rect(960, -300, 40, 900),
      rect(260, 528, 240, 12),     // pit floor under the spikes
    ];
    this.spikes = [rect(260, 506, 240, 22)];
    this.planks = [
      ...tiles(260, 460, 240, 12, 40),   // bridge over the spike pit
      ...tiles(620, 390, 80, 12, 40),    // step up to the ledge
    ];
    this.thorns = tiles(840, 80, 30, 240, 40, true);
    this.exit = rect(905, 270, 40, 50);

    this.p = body(60, 460, 20, 36);
    this.lamp = { ...body(150, 460, 14, 18), held: false };
    this.t = 0;
  }

  lightPos() {
    return { x: cx(this.lamp), y: cy(this.lamp) };
  }

  isLit(r) {
    const l = this.lightPos();
    return Math.hypot(cx(r) - l.x, cy(r) - l.y) <= LIGHT;
  }

  solidsFor() {
    return [
      ...this.solids,
      ...this.planks.filter((r) => this.isLit(r)),
      ...this.thorns.filter((r) => !this.isLit(r)),
    ];
  }

  step(inp, dt) {
    this.t += dt;
    const p = this.p, L = this.lamp;
    const solids = this.solidsFor();

    if (inp.actionPressed) {
      if (L.held) {
        L.held = false;
        L.x = cx(p) + p.face * 16 - L.w / 2; L.y = p.y + p.h - L.h; L.vx = 0; L.vy = 0;
        if (solids.some((s) => overlap(L, s))) L.x = cx(p) - L.w / 2;
      } else if (Math.hypot(cx(L) - cx(p), cy(L) - cy(p)) < 44) {
        L.held = true;
      }
    }
    if (inp.throwPressed && L.held) {
      L.held = false;
      L.x = cx(p) - L.w / 2; L.y = p.y - 4; L.vx = THROW.vx * p.face + p.vx * 0.5; L.vy = THROW.vy;
    }

    platformer(p, inp, dt, L.held ? CARRY : FEEL);
    move(p, solids, dt);

    if (L.held) {
      L.x = cx(p) + p.face * 12 - L.w / 2; L.y = p.y + 8; L.vx = 0; L.vy = 0;
    } else {
      L.vy = Math.min(L.vy + GRAV * dt, 900);
      if (L.onGround) L.vx *= 0.8;
      move(L, [...this.solidsFor(), ...this.spikes], dt);
      if (L.y > 600) { L.x = 150 - L.w / 2; L.y = 400; L.vx = L.vy = 0; } // lost: it reappears at the start
    }

    if (this.spikes.some((s) => overlap(p, rect(s.x, s.y + 6, s.w, s.h)))) this.dead = true;
    if (p.y > 560) this.dead = true;
    if (overlap(p, this.exit)) this.won = true;
  }

  draw(g, fx) {
    const l = this.lightPos();
    const flick = 1 + Math.sin(this.t * 13) * 0.02 + Math.sin(this.t * 7.3) * 0.02;

    fx.fillStyle(0xffd27a, 0.07); fx.fillCircle(l.x, l.y, LIGHT * flick);
    fx.fillStyle(0xffd27a, 0.08); fx.fillCircle(l.x, l.y, LIGHT * 0.65 * flick);
    fx.fillStyle(0xffe6a8, 0.18); fx.fillCircle(l.x, l.y, 26);

    g.fillStyle(INK, 1);
    for (const s of this.solids) g.fillRect(s.x, s.y, s.w, s.h);
    for (const s of this.spikes) {
      for (let x = s.x; x < s.x + s.w; x += 12) g.fillTriangle(x, s.y + s.h, x + 6, s.y, x + 12, s.y + s.h);
    }
    for (const r of this.planks) {
      if (this.isLit(r)) {
        g.fillStyle(INK, 1); g.fillRect(r.x + 1, r.y, r.w - 2, r.h);
        fx.fillStyle(0xffd27a, 0.25); fx.fillRect(r.x + 1, r.y - 1, r.w - 2, 2);
      } else {
        g.lineStyle(1, INK, 0.35); g.strokeRect(r.x + 3, r.y + 2, r.w - 6, r.h - 4);
      }
    }
    for (const r of this.thorns) {
      const lit = this.isLit(r);
      g.fillStyle(INK, lit ? 0.18 : 1);
      g.fillRect(r.x + 9, r.y, 12, r.h);
      for (let k = 0; k < 4; k++) {
        const y = r.y + 5 + k * 10, s = k % 2 ? 1 : -1;
        g.fillTriangle(r.x + 15, y, r.x + 15 + s * 15, y + 3, r.x + 15, y + 7);
      }
    }

    g.lineStyle(2, INK, 1); g.strokeRect(this.exit.x, this.exit.y, this.exit.w, this.exit.h);
    fx.fillStyle(0xcfe8ff, 0.18 + Math.sin(this.t * 3) * 0.05); fx.fillRect(this.exit.x + 3, this.exit.y + 3, this.exit.w - 6, this.exit.h - 3);

    drawCritter(g, this.p);
    const L = this.lamp;
    g.fillStyle(INK, 1); g.fillRect(L.x + 2, L.y, L.w - 4, 3); g.fillRect(L.x, L.y + 3, L.w, L.h - 3);
    g.fillStyle(0xffd88a, 1); g.fillRect(L.x + 3, L.y + 6, L.w - 6, L.h - 10);
  }
}
