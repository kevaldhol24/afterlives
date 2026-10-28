// Toy 3: borrowed bodies. You are a wisp that can only last a moment outside a body. Step into a
// creature to move the way it moves; leave it, and it stays where you left it (a brute left on a
// plate keeps the door open).

import { body, move, platformer, FEEL, overlap, rect, cx, cy, drawCritter, INK } from './kit.js';

const WISP_LIFE = 2;
const WISP_SPEED = 180;
const REACH = 12;

const KINDS = {
  brute: { w: 34, h: 40, feel: { ...FEEL, run: 140, jump: 330, accel: 1600 }, heavy: true },
  bird: { w: 22, h: 18, feel: { ...FEEL, run: 170, jump: 0, gravity: 0.6, maxFall: 260 }, flap: 330 },
  crawler: { w: 22, h: 12, feel: { ...FEEL, run: 210, jump: 400 } },
};

export class PossessRoom {
  constructor() {
    this.name = 'Borrowed Bodies';
    this.hint = 'E step into / out of a creature   ·   brutes are heavy · birds flap (tap jump) · crawlers fit low gaps';
    this.dead = false;
    this.won = false;

    this.solids = [
      rect(0, 460, 960, 80),
      rect(620, 200, 340, 244),           // the high ledge; a 16 px tunnel runs under it
      rect(-40, -300, 40, 900), rect(960, -300, 40, 900), rect(-40, -40, 1040, 40),
    ];
    this.plate = { ...rect(220, 452, 60, 8), on: false };
    this.door = { ...rect(380, 0, 24, 460), open: 0 };
    this.exit = rect(935, 446, 22, 14);

    const make = (kind, x, y) => ({ ...body(x, y, KINDS[kind].w, KINDS[kind].h), kind, k: KINDS[kind] });
    this.creatures = [make('brute', 110, 460), make('bird', 480, 460), make('crawler', 770, 200)];
    this.wisp = { ...body(50, 440, 18, 18), life: WISP_LIFE };
    this.host = null;
    this.last = null;
    this.t = 0;
  }

  solidsNow() {
    return this.door.open > 0.9 ? this.solids : [...this.solids, this.door];
  }

  step(inp, dt) {
    this.t += dt;
    const solids = this.solidsNow();
    const w = this.wisp;

    if (inp.actionPressed) {
      if (this.host) {
        const h = this.host;
        w.x = cx(h) - w.w / 2; w.y = h.y - w.h - 2; w.life = WISP_LIFE;
        if (solids.some((s) => overlap(w, s))) w.y = h.y;
        this.last = h; this.host = null;
      } else {
        const zone = rect(w.x - REACH, w.y - REACH, w.w + REACH * 2, w.h + REACH * 2);
        const c = this.creatures.find((c) => overlap(zone, c));
        if (c) this.host = c;
      }
    }

    for (const c of this.creatures) {
      const mine = c === this.host;
      const ci = mine ? inp : {};
      if (c.k.flap && ci.jumpPressed) c.vy = -c.k.flap;
      platformer(c, ci, dt, c.k.feel);
      move(c, solids, dt);
    }

    if (!this.host) {
      const dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const dy = (inp.down ? 1 : 0) - ((inp.up || inp.space) ? 1 : 0);
      const n = Math.hypot(dx, dy) || 1;
      w.vx = (dx / n) * WISP_SPEED; w.vy = (dy / n) * WISP_SPEED;
      if (dx) w.face = dx;
      move(w, solids, dt);
      if (this.last) w.life -= dt; // before the first body there's no limit
      if (w.life <= 0 && this.last) this.host = this.last; // too long outside: pulled back
    }

    this.plate.on = this.creatures.some((c) => c.k.heavy && overlap(c, rect(this.plate.x, this.plate.y - 4, this.plate.w, 8)));
    this.door.open = Math.max(0, Math.min(1, this.door.open + (this.plate.on ? 2.5 : -2.5) * dt));
    if (this.door.open <= 0.9) {
      // a closing door never crushes anyone: it waits
      if ([w, ...this.creatures].some((c) => overlap(c, this.door))) this.door.open = 0.95;
    }

    if (this.host && overlap(this.host, this.exit)) this.won = true;
  }

  draw(g, fx) {
    g.fillStyle(INK, 1);
    for (const r of this.solids) g.fillRect(r.x, r.y, r.w, r.h);

    const P = this.plate;
    g.fillStyle(0x1b2224, 1); g.fillRect(P.x, P.y + (P.on ? 4 : 0), P.w, P.h);
    fx.fillStyle(0xffc078, P.on ? 0.45 : 0.15); fx.fillRect(P.x + 6, P.y - 2 + (P.on ? 4 : 0), P.w - 12, 2);
    const dh = this.door.h * (1 - this.door.open);
    if (dh > 0) { g.fillStyle(0x151b1e, 1); g.fillRect(this.door.x, this.door.y, this.door.w, dh); }
    fx.fillStyle(0xffc078, 0.18); fx.fillRect(this.door.x + 10, this.door.y, 3, dh);

    g.lineStyle(2, INK, 1); g.strokeRect(this.exit.x, this.exit.y, this.exit.w, this.exit.h);
    fx.fillStyle(0xcfe8ff, 0.3 + Math.sin(this.t * 3) * 0.08); fx.fillRect(this.exit.x + 2, this.exit.y + 2, this.exit.w - 4, this.exit.h - 2);

    for (const c of this.creatures) {
      const mine = c === this.host;
      const eye = { eyeAlpha: mine ? 1 : 0.3, eyeColor: mine ? 0x9fe0ff : 0xf3f0d8 };
      if (c.kind === 'brute') {
        drawCritter(g, c, { ...eye, eyeSize: 2.4 });
        g.fillStyle(INK, 1); g.fillTriangle(c.x + 4, c.y + 4, c.x + 10, c.y - 7, c.x + 14, c.y + 4);
        g.fillTriangle(c.x + c.w - 14, c.y + 4, c.x + c.w - 10, c.y - 7, c.x + c.w - 4, c.y + 4);
      } else if (c.kind === 'bird') {
        drawCritter(g, c, { ...eye, eyeSize: 2 });
        const flap = c.onGround ? 0 : Math.sin(this.t * 30) * 8;
        g.fillStyle(INK, 1);
        g.fillTriangle(cx(c) - 4, c.y + 6, cx(c) - c.face * 14, c.y - 2 - flap, cx(c) + 4, c.y + 6);
        g.fillTriangle(cx(c) + c.face * 11, c.y + 7, cx(c) + c.face * 18, c.y + 10, cx(c) + c.face * 11, c.y + 12);
      } else {
        drawCritter(g, c, { ...eye, eyeSize: 1.8 });
        g.lineStyle(2, INK, 1);
        const leg = Math.sin(c.x * 0.4) * 3;
        for (const lx of [4, 11, 18]) g.lineBetween(c.x + lx, c.y + c.h - 2, c.x + lx - 3 + leg, c.y + c.h + 2);
      }
      if (mine) { fx.fillStyle(0x9fe0ff, 0.12); fx.fillCircle(cx(c), cy(c), Math.max(c.w, c.h)); }
    }

    if (!this.host) {
      const w = this.wisp, k = Math.max(0.25, w.life / WISP_LIFE);
      fx.fillStyle(0x9fe0ff, 0.22 * k); fx.fillCircle(cx(w), cy(w), 26 * k + 6);
      fx.fillStyle(0xe8f8ff, 0.9); fx.fillCircle(cx(w), cy(w), 5 + 3 * k);
      g.lineStyle(1, 0x9fe0ff, 0.5); g.strokeCircle(cx(w), cy(w), 9 + REACH);
    }
  }
}
