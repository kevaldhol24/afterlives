import Phaser from 'phaser';
import { LEVELS } from './levels.js';
import { makeTextures, rng } from './textures.js';
import {
  W, H, STEP, RUN, JUMP_V, MAX_FALL, COYOTE, JUMP_BUFFER,
  GHOST_CAP, DOOR_GRACE, FONT, ROMAN, COLORS,
} from './constants.js';

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  init(data) {
    this.levelIndex = data && data.level != null ? data.level : 0;
    this.msg = (data && data.msg) || null;
  }

  create() {
    makeTextures(this);
    const L = (this.L = LEVELS[this.levelIndex]);
    this.isTouch = this.sys.game.device.input.touch;

    // state
    this.dead = false;
    this.completing = false;
    this.bodiesLeft = L.deaths;
    this.recordings = [];   // past lives (positions per physics step)
    this.rec = [];          // current life
    this.ghosts = [];
    this.stepIndex = 0;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.grace = 0.3;
    this.runT = 0;
    this.inp = { left: false, right: false, jump: false, die: false };
    this.prev = { jump: false, die: false };

    this.buildAtmosphere();
    this.buildLevel();
    this.buildPlayer();
    this.buildHud();
    if (this.isTouch) this.buildTouch();

    // input
    this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE,Z,Q,K');
    this.input.keyboard.on('keydown-R', this.restartLevel, this);
    this.input.keyboard.on('keydown-N', this.skipLevel, this);

    // all gameplay runs on fixed physics steps so ghost replays stay exact
    this.physics.world.on('worldstep', this.onStep, this);
    this.events.once('shutdown', () => {
      this.physics.world?.off('worldstep', this.onStep, this);
      this.input.keyboard?.off('keydown-R', this.restartLevel, this);
      this.input.keyboard?.off('keydown-N', this.skipLevel, this);
    });

    this.cameras.main.fadeIn(450, 0, 0, 0);
    this.introCard();
  }

  // ---------------------------------------------------------------- world

  buildAtmosphere() {
    this.add.image(0, 0, 'bg').setOrigin(0).setDepth(0);
    this.fogBack = this.add.tileSprite(W / 2, 330, W, 180, 'fog').setDepth(1).setAlpha(0.9);
    // front fog sits over the ground but behind characters, so silhouettes stay crisp
    this.fogFront = this.add.tileSprite(W / 2, 470, W, 180, 'fog').setDepth(6.5).setAlpha(0.55);
    this.add.image(0, 0, 'fg').setOrigin(0).setDepth(11);
    this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: W }, y: { min: 40, max: H - 40 },
      lifespan: 7000, frequency: 260,
      speedX: { min: -7, max: 7 }, speedY: { min: -9, max: -2 },
      scale: { min: 0.15, max: 0.45 }, alpha: { start: 0.35, end: 0 },
      blendMode: 'ADD',
    }).setDepth(12);
    this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(20);
  }

  buildLevel() {
    const L = this.L;
    const r = rng(100 + this.levelIndex);

    // solids
    this.solids = this.physics.add.staticGroup();
    this.solidRects = [];
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(COLORS.solid, 1);
    const walls = [[-40, -300, 40, 900], [W, -300, 40, 900]];
    for (const [x, y, w, h] of [...L.solids, ...walls]) {
      const rect = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
      this.physics.add.existing(rect, true);
      this.solids.add(rect);
      this.solidRects.push({ x, y, w, h });
    }
    for (const [x, y, w, h] of L.solids) {
      g.fillRect(x, y, w, h);
      // grass tufts along the top edge
      for (let gx = x + 2; gx < x + w - 2; gx += 3 + r() * 5) {
        const th = 3 + r() * 8;
        g.fillTriangle(gx - 2, y + 1, gx + (r() - 0.5) * 4, y - th, gx + 2, y + 1);
      }
    }

    // spikes: kill zone for the player, solid for corpses
    this.spikeSolids = this.physics.add.staticGroup();
    this.spikeZones = [];
    for (const [x, y, w, h] of L.spikes) {
      this.add.tileSprite(x + w / 2, y + h / 2, w, h, 'spike').setDepth(5);
      const rect = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
      this.physics.add.existing(rect, true);
      this.spikeSolids.add(rect);
      this.spikeZones.push({ x, y: y + 6, w, h: h - 6, top: y });
    }

    // spirit plates
    this.plates = L.plates.map((p) => {
      const slab = this.add.graphics().setDepth(6);
      slab.fillStyle(0x0c1011, 1);
      slab.fillRect(p.x, p.y - 6, p.w, 7);
      const glow = this.add.image(p.x + p.w / 2, p.y - 4, 'glow')
        .setTint(COLORS.spirit).setBlendMode('ADD').setDisplaySize(p.w * 2.2, 70).setAlpha(0.25).setDepth(6);
      const line = this.add.image(p.x + p.w / 2, p.y - 5, 'px')
        .setTint(COLORS.spirit).setDisplaySize(p.w - 12, 2).setAlpha(0.45).setDepth(6);
      return { ...p, rect: { x: p.x, y: p.y - 12, w: p.w, h: 14 }, glow, line, pressed: false };
    });

    // doors
    this.doorGroup = this.physics.add.staticGroup();
    this.doors = L.doors.map((d) => {
      const body = this.add.rectangle(d.x + d.w / 2, d.y + d.h / 2, d.w, d.h).setVisible(false);
      this.physics.add.existing(body, true);
      this.doorGroup.add(body);
      const vis = this.add.container(0, 0).setDepth(6);
      const slab = this.add.image(d.x, d.y, 'px').setOrigin(0).setDisplaySize(d.w, d.h).setTint(0x060707);
      const rune = this.add.image(d.x + d.w / 2, d.y + d.h - 70, 'px')
        .setDisplaySize(2, 110).setTint(COLORS.spirit).setAlpha(0.3);
      const foot = this.add.image(d.x + d.w / 2, d.y + d.h - 6, 'glow')
        .setTint(COLORS.spirit).setBlendMode('ADD').setDisplaySize(90, 40).setAlpha(0.18);
      vis.add([slab, rune, foot]);
      return { ...d, body, vis, rune, open: false, release: 0, rect: { x: d.x, y: d.y, w: d.w, h: d.h } };
    });

    // exit: a shaft of light
    const e = L.exit;
    this.add.image(e.x, e.y, 'shaft').setOrigin(0.5, 1).setBlendMode('ADD').setAlpha(0.5).setDepth(4);
    this.exitGlow = this.add.image(e.x, e.y - 6, 'glow').setBlendMode('ADD').setDisplaySize(140, 60).setAlpha(0.55).setDepth(4);
    this.add.particles(0, 0, 'dot', {
      x: { min: e.x - 22, max: e.x + 22 }, y: { min: e.y - 10, max: e.y },
      lifespan: 2600, frequency: 140, speedY: { min: -45, max: -18 },
      scale: { min: 0.15, max: 0.4 }, alpha: { start: 0.8, end: 0 }, blendMode: 'ADD',
    }).setDepth(4);
    this.exitRect = { x: e.x - 20, y: e.y - 50, w: 40, h: 52 };
    this.tweens.add({ targets: this.exitGlow, alpha: 0.85, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // corpses persist for the whole room
    this.corpses = this.physics.add.group();
    this.physics.add.collider(this.corpses, this.solids);
    this.physics.add.collider(this.corpses, this.spikeSolids);
    this.physics.add.collider(this.corpses, this.doorGroup);
    this.physics.add.collider(this.corpses, this.corpses);

    // fx
    this.burst = this.add.particles(0, 0, 'dot', {
      speed: { min: 60, max: 220 }, angle: { min: 200, max: 340 }, lifespan: 650,
      scale: { start: 0.7, end: 0 }, gravityY: 600, tint: 0x0a0b0b, emitting: false,
    }).setDepth(9);
    this.puffFx = this.add.particles(0, 0, 'dot', {
      speed: { min: 10, max: 50 }, angle: { min: 0, max: 360 }, lifespan: 700,
      scale: { start: 0.5, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: COLORS.ghost,
      blendMode: 'ADD', emitting: false,
    }).setDepth(9);
  }

  buildPlayer() {
    const s = this.L.spawn;
    const p = (this.player = this.physics.add.sprite(s.x, s.y, 'p_idle'));
    p.setOrigin(0.5, 1).setDepth(9);
    p.body.setSize(16, 38).setOffset(8, 10);
    p.body.setMaxVelocityY(MAX_FALL);
    this.physics.add.collider(p, this.solids);
    this.physics.add.collider(p, this.doorGroup);
    this.physics.add.collider(p, this.corpses);
  }

  // ---------------------------------------------------------------- UI

  buildHud() {
    const L = this.L;
    // top centre is the one area the hanging branches leave clear
    this.add.text(W / 2, 16, `${ROMAN[this.levelIndex]}  ·  ${L.name}`, {
      fontFamily: FONT, fontSize: '18px', color: COLORS.ink,
    }).setOrigin(0.5, 0).setDepth(30).setAlpha(0.9);

    this.bodyIcons = [];
    const x0 = W / 2 - ((L.deaths - 1) * 30) / 2;
    for (let i = 0; i < L.deaths; i++) {
      this.bodyIcons.push(this.add.image(x0 + i * 30, 54, 'corpse').setScale(0.55).setTintFill(0x151817).setDepth(30));
    }
    this.updateHud();

    const hint = this.isTouch ? L.hint.touch : L.hint.key;
    this.hintText = this.add.text(W / 2, 74, hint, {
      fontFamily: FONT, fontSize: '17px', color: COLORS.ink, align: 'center',
      wordWrap: { width: 520 },
    }).setOrigin(0.5, 0).setDepth(30).setAlpha(0);
    this.tweens.add({ targets: this.hintText, alpha: 0.75, delay: 1400, duration: 900 });
    if (L.hint2 && !this.isTouch) {
      this.time.delayedCall(8000, () => {
        this.tweens.add({
          targets: this.hintText, alpha: 0, duration: 500,
          onComplete: () => { this.hintText.setText(L.hint2); this.tweens.add({ targets: this.hintText, alpha: 0.75, duration: 700 }); },
        });
      });
    }
  }

  updateHud() {
    this.bodyIcons.forEach((ic, i) => ic.setAlpha(i < this.bodiesLeft ? 0.85 : 0.18));
  }

  introCard() {
    const big = this.add.text(W / 2, H * 0.36, ROMAN[this.levelIndex], {
      fontFamily: FONT, fontSize: '64px', color: COLORS.text,
    }).setOrigin(0.5).setDepth(31).setAlpha(0);
    const small = this.add.text(W / 2, H * 0.36 + 54, this.L.name, {
      fontFamily: FONT, fontSize: '24px', color: COLORS.text,
    }).setOrigin(0.5).setDepth(31).setAlpha(0);
    const items = [big, small];
    if (this.levelIndex === 0 && !this.msg) {
      const title = this.add.text(W / 2, H * 0.36 - 70, 'AFTERLIVES', {
        fontFamily: FONT, fontSize: '22px', color: COLORS.textDim, letterSpacing: 8,
      }).setOrigin(0.5).setDepth(31).setAlpha(0);
      items.push(title);
    }
    if (this.msg) {
      big.setText(this.msg).setFontSize(34);
      small.setText('The room resets.').setFontSize(20);
    }
    this.tweens.add({ targets: items, alpha: 0.9, duration: 700, hold: 1300, yoyo: true, onComplete: () => items.forEach((t) => t.destroy()) });
  }

  buildTouch() {
    this.btns = {};
    const mk = (name, x, y, r, drawIcon) => {
      const g = this.add.graphics().setDepth(31).setScrollFactor(0);
      g.fillStyle(0xffffff, 0.1).fillCircle(x, y, r);
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(x, y, r);
      drawIcon(g, x, y);
      g.setAlpha(0.7);
      this.btns[name] = { x, y, r, g, held: false };
    };
    const ink = (g) => { g.fillStyle(0xffffff, 0.75); g.lineStyle(3, 0xffffff, 0.75); };
    mk('left', 74, H - 78, 44, (g, x, y) => { ink(g); g.fillTriangle(x - 14, y, x + 9, y - 13, x + 9, y + 13); });
    mk('right', 180, H - 78, 44, (g, x, y) => { ink(g); g.fillTriangle(x + 14, y, x - 9, y - 13, x - 9, y + 13); });
    mk('jump', W - 80, H - 84, 50, (g, x, y) => { ink(g); g.fillTriangle(x, y - 16, x - 15, y + 8, x + 15, y + 8); });
    mk('die', W - 190, H - 66, 36, (g, x, y) => {
      ink(g);
      g.fillCircle(x, y - 3, 12);
      g.fillRect(x - 7, y + 4, 14, 8);
      g.fillStyle(0x000000, 0.9);
      g.fillCircle(x - 4.5, y - 4, 3.2);
      g.fillCircle(x + 4.5, y - 4, 3.2);
    });
    // restart (tap)
    const rx = W - 40, ry = 40;
    const rg = this.add.graphics().setDepth(31);
    rg.fillStyle(0xffffff, 0.1).fillCircle(rx, ry, 22);
    rg.lineStyle(2.5, 0xffffff, 0.7);
    rg.beginPath(); rg.arc(rx, ry, 10, -Math.PI * 0.2, Math.PI * 1.45); rg.strokePath();
    rg.fillStyle(0xffffff, 0.7).fillTriangle(rx + 6, ry - 12, rx + 13, ry - 3, rx + 3, ry - 2);
    rg.setAlpha(0.7);
    this.add.zone(rx, ry, 64, 64).setInteractive().setDepth(32).on('pointerdown', () => this.restartLevel());
  }

  readInput() {
    const k = this.keys;
    let tl = false, tr = false, tj = false, td = false;
    if (this.btns) {
      for (const b of Object.values(this.btns)) b.held = false;
      for (const p of this.input.manager.pointers) {
        if (!p || !p.isDown) continue;
        for (const b of Object.values(this.btns)) {
          if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < b.r * 1.35) b.held = true;
        }
      }
      for (const b of Object.values(this.btns)) b.g.setAlpha(b.held ? 1 : 0.7);
      tl = this.btns.left.held; tr = this.btns.right.held; tj = this.btns.jump.held; td = this.btns.die.held;
    }
    const jump = k.UP.isDown || k.W.isDown || k.SPACE.isDown || k.Z.isDown || tj;
    const die = k.Q.isDown || k.K.isDown || td;
    this.inp.left = k.LEFT.isDown || k.A.isDown || tl;
    this.inp.right = k.RIGHT.isDown || k.D.isDown || tr;
    this.inp.jump = jump;
    this.inp.jumpPressed = jump && !this.prev.jump;
    this.inp.diePressed = die && !this.prev.die;
    this.prev.jump = jump;
    this.prev.die = die;
  }

  // ---------------------------------------------------------------- loop

  update(time, delta) {
    // cosmetic only
    this.fogBack.tilePositionX += delta * 0.006;
    this.fogFront.tilePositionX += delta * 0.014;
    for (const g of this.ghosts) if (!g.done) g.s.setAlpha(0.3 + Math.sin(time * 0.006 + g.seed) * 0.06);
  }

  onStep() {
    this.settleCorpses();
    if (this.completing) return;
    this.readInput();

    // 1. ghosts replay the step index of their own life
    const i = this.stepIndex;
    for (const g of this.ghosts) {
      if (g.done) continue;
      if (i < g.rec.length) {
        const f = g.rec[i];
        g.s.setPosition(f.x, f.y).setTexture(f.t).setFlipX(f.f);
      } else {
        g.done = true;
        this.puffFx.explode(12, g.s.x, g.s.y - 20);
        this.tweens.add({ targets: g.s, alpha: 0, duration: 300 });
      }
    }

    // 2. spirit plates (ghosts only)
    for (const p of this.plates) {
      const pressed = this.ghosts.some((g) => !g.done && overlap({ x: g.s.x - 8, y: g.s.y - 38, w: 16, h: 38 }, p.rect));
      if (pressed !== p.pressed) {
        p.pressed = pressed;
        this.tweens.add({ targets: p.glow, alpha: pressed ? 0.9 : 0.25, duration: 160 });
        this.tweens.add({ targets: p.line, alpha: pressed ? 1 : 0.45, duration: 160 });
      }
    }

    // 3. doors
    for (const d of this.doors) {
      const plate = this.plates.find((p) => p.id === d.plate);
      if (plate && plate.pressed) d.release = DOOR_GRACE; else d.release -= STEP;
      const open = d.release > 0;
      if (open !== d.open) this.setDoor(d, open);
    }

    // 4. player
    if (!this.dead) this.playerStep();
    this.stepIndex++;
  }

  setDoor(d, open) {
    d.open = open;
    d.body.body.enable = !open;
    this.tweens.killTweensOf(d.vis);
    this.tweens.add({ targets: d.vis, y: open ? -(d.h - 4) : 0, duration: open ? 320 : 220, ease: open ? 'Cubic.out' : 'Cubic.in' });
    this.tweens.add({ targets: d.rune, alpha: open ? 0.9 : 0.3, duration: 200 });
    if (!open && !this.dead) {
      // don't trap the player inside a closing door
      const pb = this.player.body;
      if (overlap({ x: pb.x, y: pb.y, w: pb.width, h: pb.height }, d.rect)) {
        this.player.x = d.x - pb.width / 2 - 1;
      }
    }
  }

  playerStep() {
    const p = this.player, b = p.body;
    const onGround = b.blocked.down || b.touching.down;
    this.coyote = onGround ? COYOTE : this.coyote - STEP;
    this.jumpBuf = this.inp.jumpPressed ? JUMP_BUFFER : this.jumpBuf - STEP;
    this.grace -= STEP;

    const dir = (this.inp.right ? 1 : 0) - (this.inp.left ? 1 : 0);
    const accel = onGround ? (dir ? 2600 : 3400) : 1700;
    b.setVelocityX(approach(b.velocity.x, dir * RUN, accel * STEP));

    if (this.jumpBuf > 0 && this.coyote > 0) {
      b.setVelocityY(-JUMP_V);
      this.jumpBuf = 0;
      this.coyote = 0;
    }
    if (!this.inp.jump && b.velocity.y < 0) b.velocity.y += 2400 * STEP; // short hop on early release
    if (dir) p.setFlipX(dir < 0);

    // pose
    if (!onGround) p.setTexture(b.velocity.y < 0 ? 'p_jump' : 'p_fall');
    else if (Math.abs(b.velocity.x) > 25) {
      this.runT += STEP;
      p.setTexture('p_run' + (Math.floor(this.runT * 11) % 4));
    } else p.setTexture('p_idle');

    // hazards
    const pr = { x: b.x, y: b.y, w: b.width, h: b.height };
    for (const z of this.spikeZones) if (overlap(pr, z)) return this.die({ spikeTop: z.top });
    if (p.y > H + 80) return this.die({ fell: true });
    if (this.inp.diePressed && this.grace <= 0) return this.die({});

    this.rec.push({ x: p.x, y: p.y, t: p.texture.key, f: p.flipX });

    if (overlap(pr, this.exitRect)) this.complete();
  }

  // ---------------------------------------------------------------- life & death

  die(cause) {
    if (this.dead || this.completing) return;
    this.dead = true;
    const p = this.player;
    const x = p.x, y = p.y;
    p.body.enable = false;
    p.setVisible(false);
    this.cameras.main.shake(170, 0.005);
    this.burst.explode(18, x, y - 18);

    if (this.bodiesLeft <= 0) {
      this.time.delayedCall(700, () => this.scene.restart({ level: this.levelIndex, msg: 'No bodies left' }));
      return;
    }
    this.bodiesLeft--;
    this.updateHud();
    if (!cause.fell) this.spawnCorpse(x, cause.spikeTop != null ? cause.spikeTop : y, p.flipX);

    const rec = this.rec;
    this.time.delayedCall(650, () => this.respawn(rec));
  }

  spawnCorpse(x, bottom, flip) {
    // nudge the body sideways so it never spawns inside a wall
    const half = 22, top = bottom - 16;
    const blockers = [...this.solidRects, ...this.doors.filter((d) => !d.open).map((d) => d.rect)];
    for (const r of blockers) {
      if (top < r.y + r.h && bottom > r.y + 0.5 && x + half > r.x && x - half < r.x + r.w) {
        const pushLeft = x + half - r.x, pushRight = r.x + r.w - (x - half);
        x += pushLeft < pushRight ? -(pushLeft + 0.5) : pushRight + 0.5;
      }
    }
    const c = this.physics.add.sprite(x, bottom, 'corpse').setOrigin(0.5, 1).setFlipX(flip).setDepth(7);
    this.corpses.add(c);
    c.body.setSize(44, 16).setOffset(2, 4);
    c.body.reset(x, bottom); // sync body to the new origin now; several steps can run before the next frame
    c.body.setMaxVelocityY(MAX_FALL);
    c.settled = false;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 120 });
  }

  settleCorpses() {
    for (const c of this.corpses.getChildren()) {
      if (c.settled) continue;
      const b = c.body;
      if (b.blocked.down || b.touching.down) {
        c.settled = true;
        c.setPosition(b.center.x, b.bottom); // take the resolved position before freezing
        b.setVelocity(0, 0);
        b.setImmovable(true);
        b.setAllowGravity(false);
        b.moves = false;
      } else {
        b.setVelocityX(0);
      }
    }
  }

  respawn(rec) {
    if (this.L.ghosts && rec.length) {
      this.recordings.push(rec);
      while (this.recordings.length > GHOST_CAP) this.recordings.shift();
    }
    for (const g of this.ghosts) g.s.destroy();
    this.ghosts = this.recordings.map((r, n) =>
      ({
        rec: r, done: false, seed: n * 1.7,
        s: this.add.image(r[0].x, r[0].y, r[0].t).setOrigin(0.5, 1)
          .setTintFill(COLORS.ghost).setAlpha(0.32).setBlendMode('ADD').setDepth(8),
      }));

    const s = this.L.spawn, p = this.player;
    p.body.enable = true;
    p.body.reset(s.x, s.y);
    p.setPosition(s.x, s.y).setVisible(true).setFlipX(false).setTexture('p_idle');
    this.rec = [];
    this.stepIndex = 0;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.grace = 0.3;
    this.dead = false;
    p.setAlpha(0);
    this.tweens.add({ targets: p, alpha: 1, duration: 180 });
  }

  complete() {
    this.completing = true;
    this.player.body.setVelocity(0, 0);
    this.player.body.enable = false;
    this.tweens.add({ targets: this.player, alpha: 0, y: this.player.y - 10, duration: 600 });
    this.cameras.main.fadeOut(800, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const next = this.levelIndex + 1;
      if (next >= LEVELS.length) this.scene.start('end');
      else this.scene.restart({ level: next });
    });
  }

  restartLevel() {
    if (this.completing) return;
    this.scene.restart({ level: this.levelIndex });
  }

  skipLevel() {
    if (this.completing) return;
    this.complete();
  }
}
