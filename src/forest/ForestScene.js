// The first forest: a painted, Limbo-style puzzle walk. Walk, jump, grab: push and pull boxes, swing on a rope,
// spring bear traps, and get past a hound. Built from many parallax layers.
import Phaser from 'phaser';
import { VIEW_W, VIEW_H, WORLD_W, STEP, STATIC, CHECKPOINTS, HOUND_X, PIT, END_X, WATER_Y, groundY } from './world.js';
import { makePlay, resetPlay, stepPlay } from './play.js';
import { BACK, CANOPY, MAIN, FRONT, addLayer, layerWidth } from './layers.js';
import { fogTexture, shaftTexture, skyTexture, glowTexture, vignetteTexture, grainTexture } from './art.js';
import { makeLook, animate, drawBoy, makeRagdoll, stepRagdoll, drawRagdoll } from './boy.js';
import {
  windAt, drawGrass, drawRopes, makeCrows, stepCrows, drawCrows, makeFlock, drawFlock, makeDust, drawDust,
  makeLeaves, drawLeaves, drawFlies,
} from './life.js';
import {
  makeBoxSprites, drawBoxes, drawTraps, makePitFog, updatePitFog, addDark, drawHound, drawWater, houndMouth,
} from './hazards.js';
import { Fx } from './fx.js';
import { Ambience } from './audio.js';
import { S } from './style.js';

const FONT = '"IM Fell English SC", Georgia, serif';
const LIGHT = { x: 0.36, y: 0.15 }; // where the light breaks through, as a share of the screen
const ADD = Phaser.BlendModes.ADD;

// Fog bands drifting between the layers: [y, scroll factor, drift px/s, alpha, depth, height scale]
const FOGS = [
  [470, 0.17, 7, 0.55, 4.5, 1.7],
  [520, 0.34, 10, 0.5, 7, 1.6],
  [590, 0.55, 14, 0.42, 10, 1.4],
  [640, 0.76, 18, 0.32, 13, 1.25],
  [700, 0.95, 22, 0.16, 15, 1.1],
];
// God rays: [scroll factor, how many, alpha, depth, width scale]
const SHAFTS = [[0.44, 8, 0.42, 9.5, 1.5], [0.66, 7, 0.3, 11.5, 1.3], [0.86, 6, 0.16, 14.5, 1.1]];
const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, leapPressed: false, grab: false };

let audio;

export class ForestScene extends Phaser.Scene {
  constructor() { super('forest'); }

  create() {
    audio ??= new Ambience();
    this.t = 0;
    this.makeTextures();

    // sky, light, far haze
    this.add.image(0, 0, 'f_sky').setOrigin(0).setScale(VIEW_W / 480).setScrollFactor(0).setDepth(0);
    const lx = VIEW_W * LIGHT.x, ly = VIEW_H * LIGHT.y;
    this.bloom = this.add.image(lx, ly, 'f_glow').setTint(S.bloom).setScale(9, 7).setAlpha(0.45).setBlendMode(ADD).setScrollFactor(0.02, 0).setDepth(1);
    this.add.image(lx, ly + 120, 'f_glow').setTint(S.bloom).setScale(13, 8).setAlpha(0.3).setBlendMode(ADD).setScrollFactor(0.05, 0).setDepth(4.4);
    this.add.image(lx, ly + 160, 'f_glow').setTint(S.bloom).setScale(12, 7).setAlpha(0.22).setBlendMode(ADD).setScrollFactor(0.1, 0).setDepth(7.5);
    this.add.image(lx, ly + 200, 'f_glow').setTint(S.bloom).setScale(10, 6).setAlpha(0.1).setBlendMode(ADD).setScrollFactor(0.2, 0).setDepth(10.5);

    for (const L of BACK) addLayer(this, L);
    addLayer(this, CANOPY);
    addLayer(this, MAIN);
    addLayer(this, FRONT);

    this.fogs = FOGS.map(([y, f, drift, alpha, depth, sy], i) => ({
      f, drift, sprite: this.add.tileSprite(0, y, VIEW_W, 256, `f_fog${i % 3}`).setOrigin(0).setTileScale(2.2, 1)
        .setScale(1, sy).setAlpha(alpha * S.fogAlpha).setTint(S.fog).setScrollFactor(0, f).setDepth(depth),
    }));
    this.shafts = [];
    for (const [f, n, alpha, depth, ws] of SHAFTS) {
      const lw = layerWidth(f);
      for (let i = 0; i < n; i++) {
        const x = (i + 0.3 + Math.random() * 0.4) * (lw / n);
        const s = this.add.image(x, -220, `f_shaft${i % 3}`).setOrigin(0.5, 0).setScale(ws * (0.7 + Math.random() * 0.6), 1.35)
          .setRotation(-0.36 + (Math.random() - 0.5) * 0.08).setTint(S.shaft).setBlendMode(ADD).setAlpha(alpha).setScrollFactor(f, f).setDepth(depth);
        this.shafts.push({ s, alpha, ph: Math.random() * 6, sp: 0.15 + Math.random() * 0.25 });
      }
    }

    // the boy, the puzzle pieces, and the life around them
    this.P = makePlay(CHECKPOINTS[0]);
    this.boy = this.P.boy;
    this.prev = { x: this.boy.x, y: this.boy.y };
    this.look = makeLook();
    this.crows = makeCrows();
    this.dust = makeDust(90, LIGHT);
    this.leaves = makeLeaves(14);
    this.rings = [];
    this.rag = null;
    this.flocks = [];
    this.nextFlock = 3;
    this.dead = null;
    this.everGrabbed = false;
    this.scrape = 0;

    addDark(this, 16.5);
    this.gHound = this.add.graphics().setDepth(19.5);
    this.pitFog = makePitFog(this, this.add.graphics().setDepth(19.8), 23.5);
    this.boxSprites = makeBoxSprites(this, this.P.boxes, 20.5);
    this.gWater = this.add.graphics().setDepth(24.5);
    this.fx = new Fx(this, 22.5);
    this.gFlock = this.add.graphics().setScrollFactor(0).setDepth(4.2);
    this.gRopes = this.add.graphics().setDepth(18);
    this.gBack = this.add.graphics().setDepth(21);
    this.gLife = this.add.graphics().setDepth(22);
    this.gBoy = this.add.graphics().setDepth(23);
    this.gGlow = this.add.graphics().setBlendMode(ADD).setDepth(24);
    this.gFront = this.add.graphics().setDepth(25);
    this.gLeaves = this.add.graphics().setScrollFactor(0).setDepth(27);
    this.gDust = this.add.graphics().setScrollFactor(0).setBlendMode(ADD).setDepth(28);

    // grade and lens
    try {
      const cm = this.cameras.main.postFX.addColorMatrix();
      cm.saturate(-0.18);
      cm.contrast(0.12, true);
    } catch (e) { /* canvas renderer: no grade */ }
    this.add.image(0, 0, 'f_vignette').setOrigin(0).setScale(VIEW_W / 480).setScrollFactor(0).setDepth(50);
    this.grain = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'f_grain').setOrigin(0).setScrollFactor(0).setDepth(51).setAlpha(S.grain);
    this.flicker = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(52);

    // words
    const text = (y, s, size, color, spacing) => this.add.text(VIEW_W / 2, y, s, { fontFamily: FONT, fontSize: size, color })
      .setOrigin(0.5).setLetterSpacing(spacing).setAlpha(0).setScrollFactor(0).setDepth(60);
    this.title = text(VIEW_H * 0.3, 'AFTERLIVES', '112px', '#ecece4', 28).setShadow(0, 0, '#000', 30);
    this.hint = text(VIEW_H - 70, '← →  walk        Space  jump        Shift  grab        M  sound', '26px', '#e4e2d6', 4);
    this.prompt = text(VIEW_H - 70, 'hold  Shift  to grab,  then walk away to pull', '28px', '#f3dca8', 4);
    this.coda = text(VIEW_H * 0.34, 'the forest goes on', '40px', '#ecece4', 8).setShadow(0, 0, '#000', 20);

    this.setupInput();
    this.cam = this.cameras.main;
    this.camX = 0; this.camY = 0; this.lookAhead = 140; this.lastCam = 0;
    this.cam.setScroll(0, 0);
    this.cam.fadeIn(2600, 0, 0, 0);
    this.acc = 0;
    this.ending = false;
    this.moved = 0;
  }

  makeTextures() {
    if (this.textures.exists('f_glow')) return;
    this.textures.addCanvas('f_sky', skyTexture(480, 270, LIGHT));
    this.textures.addCanvas('f_vignette', vignetteTexture(480, 270));
    this.textures.addCanvas('f_glow', glowTexture(256));
    this.textures.addCanvas('f_grain', grainTexture(256));
    for (let i = 0; i < 3; i++) {
      this.textures.addCanvas(`f_fog${i}`, fogTexture(101 + i * 17));
      this.textures.addCanvas(`f_shaft${i}`, shaftTexture(301 + i * 13));
    }
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,Z,E,X,SHIFT,CTRL');
    this.prevJump = false;
    this.touch = { left: false, right: false, jump: false, grab: false };
    this.input.keyboard.on('keydown', () => audio.start());
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.input.keyboard.on('keydown-M', () => audio.toggleMute());
    this.input.keyboard.on('keydown-B', () => { location.hash = ''; location.reload(); });
    // touch: the left fifth walks left, the next walks right, the middle grabs, the right jumps
    const update = () => {
      const t = { left: false, right: false, jump: false, grab: false };
      for (const p of this.input.manager.pointers) {
        if (!p.isDown) continue;
        const x = p.x / VIEW_W;
        if (x < 0.2) t.left = true; else if (x < 0.4) t.right = true; else if (x < 0.7) t.grab = true; else t.jump = true;
      }
      this.touch = t;
    };
    this.input.on('pointerdown', () => { audio.start(); update(); });
    this.input.on('pointerup', update);
    this.input.on('pointermove', update);
  }

  read() {
    const k = this.keys;
    // Space jumps (and lets go of a rope); up jumps too on foot, but climbs on a rope
    const leap = k.SPACE.isDown || k.Z.isDown || this.touch.jump;
    const up = k.UP.isDown || k.W.isDown;
    const inp = {
      left: k.LEFT.isDown || k.A.isDown || this.touch.left,
      right: k.RIGHT.isDown || k.D.isDown || this.touch.right,
      up, down: k.DOWN.isDown || k.S.isDown,
      jump: leap || up, jumpPressed: (leap || up) && !this.prevJump, leapPressed: leap && !this.prevLeap,
      grab: k.SHIFT.isDown || k.E.isDown || k.X.isDown || k.CTRL.isDown || this.touch.grab,
    };
    this.prevJump = inp.jump;
    this.prevLeap = leap;
    return inp;
  }

  update(_, ms) {
    const dt = Math.min(ms / 1000, 0.05);
    this.t += dt;
    const t = this.t, b = this.boy;

    // fixed steps
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.prev.x = b.x; this.prev.y = b.y;
      this.stepWorld(b, this.ending || this.dead ? IDLE : this.read(), t);
    }
    if (this.dead) {
      this.dead.t += dt;
      const hold = { hound: 1.5, trap: 1.7, drown: 2.4 }[this.dead.kind] ?? 1.5;
      if (this.dead.t > hold && !this.dead.fading) {
        this.dead.fading = true;
        this.cam.fadeOut(900, 0, 0, 0);
        this.cam.once('camerafadeoutcomplete', () => this.respawn());
      }
    }
    const k = this.acc / STEP;
    const bx = Phaser.Math.Linear(this.prev.x, b.x, k), by = Phaser.Math.Linear(this.prev.y, b.y, k);

    // camera: ahead of the boy in the way he faces, a little vertical follow
    this.lookAhead = Phaser.Math.Linear(this.lookAhead, b.face * 150, 1 - Math.exp(-dt * 1.2));
    const tx = Phaser.Math.Clamp(bx + b.w / 2 - VIEW_W * 0.42 + this.lookAhead, 0, WORLD_W - VIEW_W);
    const ty = Phaser.Math.Clamp((by + b.h - 838) * 0.5, -110, 70);
    this.lastCam = this.camX;
    this.camX = Phaser.Math.Linear(this.camX, tx, 1 - Math.exp(-dt * 3.2));
    this.camY = Phaser.Math.Linear(this.camY, ty, 1 - Math.exp(-dt * 2.4));
    this.cam.setScroll(this.camX, this.camY);
    if (this.zoomOn) { this.cam.setZoom(this.zoomOn); this.cam.centerOn(bx + b.w / 2, by + b.h / 2 - 30); } // tests only

    // atmosphere
    const wind = windAt(t);
    if ((this._audioTick = (this._audioTick || 0) + 1) % 8 === 0) audio.setWind(Math.min(1, wind / 1.4));
    for (const fg of this.fogs) fg.sprite.tilePositionX = (this.camX * fg.f + t * fg.drift * (0.7 + wind * 0.5)) / 2.2;
    for (const sh of this.shafts) sh.s.setAlpha(sh.alpha * (0.6 + 0.4 * Math.sin(t * sh.sp + sh.ph)) * (0.85 + 0.15 * Math.sin(t * 0.13)));
    this.bloom.setAlpha(0.55 + 0.06 * Math.sin(t * 0.4));
    if (Math.floor(t * 24) !== this._grainFrame) {
      this._grainFrame = Math.floor(t * 24);
      this.grain.tilePositionX = Math.random() * 256;
      this.grain.tilePositionY = Math.random() * 256;
      this.flicker.setAlpha(0.012 + Math.random() * 0.025);
    }
    this.nextFlock -= dt;
    if (this.nextFlock <= 0) { this.flocks.push(makeFlock(this.camX, 0.24)); this.nextFlock = 10 + Math.random() * 14; }
    this.gFlock.clear();
    this.flocks = this.flocks.filter((fl) => drawFlock(this.gFlock, fl, this.camX, t, dt));

    // the boy and everything near him
    if (!this.rag && animate(this.look, b, { x: bx + b.w / 2, y: by + b.h + 2 }, dt, t) === 'step') {
      const r = Math.min(1, Math.abs(b.vx) / 370);
      audio.step(0.45 + r * 0.55);
      if (Math.random() < 0.3 + r * 0.6) this.fx.dust(bx + b.w / 2 - b.face * 8, by + b.h, 1 + Math.round(r * 2));
    }
    const shown = { x: bx, y: by, w: b.w, h: b.h, vx: b.vx };
    this.gBack.clear(); this.gFront.clear();
    drawGrass(this.gBack, this.gFront, this.camX, t, shown);
    this.gRopes.clear();
    drawRopes(this.gRopes, this.P.ropes);
    drawBoxes(this.boxSprites, this.P.boxes);
    this.gLife.clear();
    drawTraps(this.gLife, this.P.traps);
    drawCrows(this.gLife, this.crows, t);
    const stump = STATIC.find((s) => s.kind === 'stump');
    drawFlies(this.gLife, stump.x + stump.w / 2, stump.y - 70, t);
    this.gBoy.clear(); this.gGlow.clear();
    const lit = b.x > 5300 && b.x < 6800 ? 0.35 : 1; // little light reaches the hound's stretch
    if (this.rag) drawRagdoll(this.gBoy, this.gGlow, this.rag, lit); else drawBoy(this.gBoy, this.gGlow, this.look, lit);
    this.gHound.clear();
    if (Math.abs(this.P.hound.x - this.camX - VIEW_W / 2) < VIEW_W) drawHound(this.gHound, this.gGlow, this.P.hound, t);
    this.gWater.clear();
    if (this.camX + VIEW_W > PIT[0] - 100 && this.camX < PIT[1] + 100) {
      updatePitFog(this.pitFog, t);
      drawWater(this.gWater, t, this.rings, dt);
    }
    this.gLeaves.clear();
    drawLeaves(this.gLeaves, this.leaves, this.camX, this.lastCam, t, dt);
    this.gDust.clear();
    drawDust(this.gDust, this.dust, this.camX, t);

    // words: the title, the controls, the one prompt the puzzles need, and the end
    const fadeIn = Phaser.Math.Clamp((t - 1.4) / 2.5, 0, 1);
    const fadeOut = Phaser.Math.Clamp(1 - (this.moved - 500) / 600, 0, 1);
    this.title.setAlpha(fadeIn * fadeOut * 0.92);
    this.hint.setAlpha(Phaser.Math.Clamp((t - 3.5) / 1.5, 0, 1) * Phaser.Math.Clamp(1 - (this.moved - 150) / 400, 0, 1) * 0.85);
    const ask = !this.everGrabbed && !this.dead && b.x > 1860 && b.x < 2440 && b.onGround ? 1 : 0;
    this.prompt.setAlpha(Phaser.Math.Linear(this.prompt.alpha, ask * 0.95, 1 - Math.exp(-dt * 3)));
    if (!this.ending && !this.dead && b.x > END_X) {
      this.ending = true;
      this.tweens.add({ targets: this.coda, alpha: 0.9, duration: 1800, delay: 600 });
      this.time.delayedCall(5000, () => {
        this.cam.fadeOut(3000, 0, 0, 0);
        this.cam.once('camerafadeoutcomplete', () => this.scene.restart());
      });
    }
  }

  // One fixed step of everything that moves, and what it sounds like.
  stepWorld(b, inp, t) {
    for (const e of stepPlay(this.P, inp, t)) {
      if (e === 'grab-rope') audio.creak();
      if (e === 'release') audio.creak();
      if (e === 'ledge') { audio.grip(); this.fx.dust(b.x + b.w / 2 + b.face * 20, b.y + 4, 2); }
      if (e === 'climb') audio.heave();
      if (e === 'stand') audio.step(0.5);
      if (e === 'box-trap') {
        audio.snap(0.6); this.cam.shake(120, 0.003);
        const tr = this.P.traps.find((x) => x.sprung === 'box' && x.t === 0);
        if (tr) this.fx.snap(tr.x, groundY(tr.x));
      }
      if (e === 'trap') { audio.snap(1); this.cam.shake(220, 0.008); this.fx.snap(b.x + b.w / 2, b.y + b.h); }
      if (e === 'splash') {
        const p = Math.min(1.4, Math.abs(b.vy) / 900 + 0.4);
        audio.splash(p); this.fx.splash(b.x + b.w / 2, WATER_Y, p); this.rings.push({ x: b.x + b.w / 2, t: 0, power: p });
      }
      if (e === 'drown') audio.fall();
      if (e === 'wake') { audio.growl(); this.cam.shake(500, 0.002); }
      if (e === 'lunge') audio.bark();
      if (e === 'trapped') { audio.snap(1); audio.yelp(); this.cam.shake(220, 0.006); this.fx.snap(this.P.hound.x, groundY(this.P.hound.x)); }
      if (e === 'caught') { this.cam.shake(300, 0.012); audio.growl(); }
    }
    if (this.P.dead && !this.dead) {
      this.dead = { kind: this.P.dead, t: 0 };
      if (!this.look.J) animate(this.look, b, { x: b.x + b.w / 2, y: b.y + b.h + 2 }, 0, t); // died before his first frame
      this.rag = makeRagdoll(this.look, b, this.P.dead);
      if (this.P.dead === 'hound') {
        // the jaws close on him: thrown towards the hound
        for (const p of Object.values(this.rag.pts)) p.px = p.x + this.P.hound.face * 6;
      }
    }
    if (this.rag) this.stepDeath(t);
    if (b.grab) this.everGrabbed = true;
    // the scrape of a box being moved
    this.scrape -= STEP;
    if (b.pushing && Math.abs(b.vx) > 20 && this.scrape <= 0) { audio.scrape(); this.scrape = 0.22; }
    if (b.pushing && Math.abs(b.vx) > 20 && Math.random() < 0.12) {
      const box = b.pushing;
      this.fx.dust(b.grabSide < 0 || b.vx < 0 ? box.x + box.w : box.x, box.y + box.h, 1);
    }
    if (b.jumped) this.fx.dust(b.x + b.w / 2, b.y + b.h, 3);
    if (b.impact > 300) {
      const p = Math.min(1, b.impact / 1400);
      this.fx.dust(b.x + b.w / 2, b.y + b.h, 3 + Math.round(p * 6));
      audio.land(p);
      if (p > 0.6) this.cam.shake(120, 0.0025 * p);
    }

    const h = this.P.hound;
    if (h.state === 'sleep' && Math.sin((h.breath - STEP) * 1.4) < 0.9 && Math.sin(h.breath * 1.4) >= 0.9) {
      audio.breath(Math.max(0, 1 - Math.abs(b.x - HOUND_X) / 900));
    }
    if (h.state === 'caught' && Math.sin(h.t * 1.3) > 0.995) audio.yelp(0.4);
    const took = stepCrows(this.crows, STEP, b);
    if (took) {
      audio.wings(took);
      for (const c of this.crows) if (c.state === 'fly' && !c.feathered) { c.feathered = true; this.fx.feathers(c.x, c.y - 14, 2); }
    }
    this.moved += Math.abs(b.vx) * STEP;
  }

  // After death: the body goes limp. A trap holds its ankle; the hound holds it in its jaws, shakes it and drops
  // it; in the pit it sinks, letting out bubbles.
  stepDeath(t) {
    const rd = this.rag, kind = this.dead.kind;
    let pin = null;
    if (kind === 'trap') {
      const tr = this.P.traps.find((x) => x.sprung === 'boy');
      if (tr) pin = { name: 'a0', x: tr.x, y: groundY(tr.x) - 12 };
    }
    if (kind === 'hound' && rd.t < 1.0) {
      const m = houndMouth(this.P.hound, t);
      pin = { name: 'neck', x: m.x, y: m.y };
    }
    stepRagdoll(rd, STEP, pin);
    if (kind === 'drown' && rd.t < 2 && rd.pts.head.y > WATER_Y + 6 && Math.random() < 0.12) {
      this.fx.bubbles(rd.pts.head.x + (Math.random() - 0.5) * 10, rd.pts.head.y, 1 + Math.floor(Math.random() * 2));
      if (Math.random() < 0.4) audio.bubble();
    }
  }

  respawn() {
    this.placeAt(CHECKPOINTS[this.P.cp]);
    this.cam.fadeIn(700, 0, 0, 0);
  }

  // Stand the boy at x with every puzzle reset (also used by tests).
  placeAt(x) {
    resetPlay(this.P, x);
    this.dead = null;
    this.rag = null;
    this.prev.x = this.boy.x; this.prev.y = this.boy.y;
    Object.assign(this.look, makeLook());
    this.camX = Phaser.Math.Clamp(x - VIEW_W * 0.42 + this.lookAhead, 0, WORLD_W - VIEW_W);
  }
}

export const FOREST_SIZE = { width: VIEW_W, height: VIEW_H };
