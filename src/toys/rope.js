// Toy 2: two souls on one rope. The spirit flies through anything but can't pull; where you leave
// it becomes the anchor the body swings from and climbs. The rope pays out while the body walks and
// locks once it leaves the ground.

import { body, move, moveBy, platformer, FEEL, GRAV, MAX_FALL, overlap, rect, cx, cy, clamp, drawCritter, INK } from './kit.js';

const LMAX = 300;
const LMIN = 30;
const CLIMB = 170;
const SPIRIT_SPEED = 260;
const PUMP = 420;

export class RopeRoom {
  constructor() {
    this.name = 'Two Souls';
    this.hint = 'E switch body / spirit   ·   Space jump (on the rope: let go)   ·   Up / Down climb   ·   the spirit flies through walls';
    this.dead = false;
    this.won = false;

    this.solids = [
      rect(0, 460, 280, 80),
      rect(520, 460, 240, 80),
      rect(760, 250, 200, 290),
      rect(280, 534, 240, 6),
      rect(-40, -300, 40, 900), rect(960, -300, 40, 900), rect(-40, -40, 1040, 40),
    ];
    this.spikes = [rect(280, 512, 240, 22)];
    this.door = { ...rect(900, 0, 22, 250), open: 0 };
    this.lock = { x: 870, y: 400, on: false };
    this.exit = rect(928, 200, 28, 50);

    this.b = body(60, 460, 20, 36);
    this.s = { x: 90, y: 400 };
    this.len = Math.hypot(this.s.x - cx(this.b), this.s.y - cy(this.b));
    this.ctrl = 'body';
    this.taut = false;
    this.free = false; // let go mid-swing: the spirit trails behind until the body lands
    this.t = 0;
  }

  solidsNow() {
    return this.door.open >= 1 ? this.solids : [...this.solids, this.door];
  }

  step(inp, dt) {
    this.t += dt;
    const b = this.b, s = this.s;
    const solids = this.solidsNow();
    if (inp.actionPressed) this.ctrl = this.ctrl === 'body' ? 'spirit' : 'body';

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const hanging = !b.onGround && this.taut && !this.free;
    const mine = this.ctrl === 'body';

    if (hanging) {
      b.vx += (mine ? dir : 0) * PUMP * dt;
      b.vy = Math.min(b.vy + GRAV * dt, MAX_FALL);
      if (mine && dir) b.face = dir;
      if (mine && inp.spacePressed) { this.free = true; b.vy = Math.min(b.vy, 0) - 180; }
    } else {
      platformer(b, mine ? { left: inp.left, right: inp.right, jump: inp.space, jumpPressed: inp.spacePressed } : {}, dt, FEEL);
    }
    move(b, solids, dt);
    if (b.onGround) this.free = false;

    if (mine && inp.up) this.len = Math.max(LMIN, this.len - CLIMB * dt);
    if (mine && inp.down) this.len = Math.min(LMAX, this.len + CLIMB * dt);

    // the spirit flies freely, never further than the rope allows; a walking body drags it along
    if (!mine) {
      const vy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      const n = Math.hypot(dir, vy) || 1;
      s.x += (dir / n) * SPIRIT_SPEED * dt;
      s.y += (vy / n) * SPIRIT_SPEED * dt;
    }
    s.x = clamp(s.x, 8, 952); s.y = clamp(s.y, 8, 532);
    const reach = b.onGround || this.free ? LMAX : this.len;
    let dx = s.x - cx(b), dy = s.y - cy(b), d = Math.hypot(dx, dy);
    if ((!mine || this.free || b.onGround) && d > reach) { s.x = cx(b) + (dx / d) * reach; s.y = cy(b) + (dy / d) * reach; }

    // rope on the body: pays out on the ground, holds in the air
    dx = cx(b) - s.x; dy = cy(b) - s.y; d = Math.hypot(dx, dy);
    if (b.onGround && !(mine && inp.up)) this.len = Math.min(LMAX, Math.max(this.len, d));
    if (!this.free && d > this.len && d > 0) {
      const nx = dx / d, ny = dy / d;
      const over = d - this.len;
      const vx = b.vx, vy = b.vy;
      const ground = b.onGround, y0 = b.y;
      moveBy(b, -nx * over, -ny * over, solids);
      b.vx = vx; b.vy = vy; b.onGround = ground && b.y > y0 - 0.5;
      const vr = b.vx * nx + b.vy * ny;
      if (vr > 0) { b.vx -= nx * vr; b.vy -= ny * vr; }
    }
    this.taut = Math.hypot(cx(b) - s.x, cy(b) - s.y) >= this.len - 1.5;

    if (!this.lock.on && Math.hypot(s.x - this.lock.x, s.y - this.lock.y) < 16) this.lock.on = true;
    if (this.lock.on) this.door.open = Math.min(1, this.door.open + dt * 1.5);

    if (this.spikes.some((k) => overlap(b, rect(k.x, k.y + 6, k.w, k.h)))) this.dead = true;
    if (overlap(b, this.exit)) this.won = true;
  }

  draw(g, fx) {
    const b = this.b, s = this.s;
    g.fillStyle(INK, 1);
    for (const r of this.solids) g.fillRect(r.x, r.y, r.w, r.h);
    for (const k of this.spikes) {
      for (let x = k.x; x < k.x + k.w; x += 12) g.fillTriangle(x, k.y + k.h, x + 6, k.y, x + 12, k.y + k.h);
    }
    const dh = this.door.h * (1 - this.door.open);
    if (dh > 0) { g.fillStyle(0x151b1e, 1); g.fillRect(this.door.x, this.door.y + this.door.h - dh, this.door.w, dh); }
    fx.fillStyle(0x9fe0ff, 0.2); fx.fillRect(this.door.x + 9, this.door.y + this.door.h - dh, 3, dh);

    const L = this.lock;
    fx.fillStyle(0x9fe0ff, L.on ? 0.5 : 0.15 + Math.sin(this.t * 4) * 0.08); fx.fillCircle(L.x, L.y, 14);
    g.lineStyle(2, 0x9fe0ff, L.on ? 1 : 0.6); g.strokeCircle(L.x, L.y, 9);

    g.lineStyle(2, INK, 1); g.strokeRect(this.exit.x, this.exit.y, this.exit.w, this.exit.h);
    fx.fillStyle(0xcfe8ff, 0.18 + Math.sin(this.t * 3) * 0.05); fx.fillRect(this.exit.x + 3, this.exit.y + 3, this.exit.w - 6, this.exit.h - 3);

    // rope: straight when taut, sagging when slack
    const bx = cx(b), by = b.y + 10;
    const d = Math.hypot(bx - s.x, by - s.y);
    const sag = Math.sqrt(Math.max(0, this.len * this.len - d * d)) * 0.5;
    g.lineStyle(2, 0xc9e9f5, 0.75);
    g.beginPath(); g.moveTo(bx, by);
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      g.lineTo(bx + (s.x - bx) * t, by + (s.y - by) * t + sag * 4 * t * (1 - t));
    }
    g.strokePath();

    drawCritter(g, b, { eyeAlpha: this.ctrl === 'body' ? 1 : 0.35 });
    const pulse = 1 + Math.sin(this.t * 5) * 0.08;
    const on = this.ctrl === 'spirit';
    fx.fillStyle(0x9fe0ff, on ? 0.25 : 0.12); fx.fillCircle(s.x, s.y, 22 * pulse);
    fx.fillStyle(0xe8f8ff, on ? 0.9 : 0.5); fx.fillCircle(s.x, s.y, 7);
  }
}
