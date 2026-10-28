// Tether: a salvage diver on an air hose. Phaser scene on top of the Phaser-free sim (sim.js / world.js).
// Boat screen (bank, three upgrades, Dive) -> dive -> back on the boat (sell) or black out (sack lost).
import Phaser from 'phaser';
import { Dive, STEP, UPGRADES } from './sim.js';
import { SURF, BOAT_X, WORLD, GROUND, OBST, EEL, PX_PER_M, groundY as groundYish } from './world.js';
import { makeTextures, drawDiver, drawBoat, mix } from './art.js';

export const TETHER_SIZE = { width: 1280, height: 720 };
const VW = TETHER_SIZE.width, VH = TETHER_SIZE.height;
const FONT = '"IM Fell English SC", Georgia, serif';
const ADD = Phaser.BlendModes.ADD;
const SAVE = 'tether.save.v1';
const PAGE_TEXT = '"...the hose went slack at sixty fathoms. Whatever is down there, it pulls back." (father\'s log)';

// water colour by world depth
const W0 = 0x36545f, W1 = 0x0d2129, W2 = 0x02070a;
const waterAt = (y) => (y < 750 ? mix(W0, W1, (y - SURF) / (750 - SURF)) : mix(W1, W2, (y - 750) / 1000));
const darkAt = (y) => Phaser.Math.Clamp(0.1 + ((y - SURF) / 1150) * 0.88, 0.1, 0.97);

function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && s.lv) return s; } catch (e) { /* no storage */ }
  return { bank: 0, lv: { hose: 0, tank: 0, winch: 0 }, page: false, dives: 0, best: 0 };
}
function storeSave(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) { /* fine */ } }

export class TetherScene extends Phaser.Scene {
  constructor() { super('tether'); }

  create() {
    makeTextures(this);
    this.save = loadSave();
    this.t = 0; this.acc = 0;
    this.mode = 'boat';             // boat | dive | over
    this.sim = null;
    this.ang = -Math.PI / 2; this.side = 1; this.kick = 0;
    this.notes = [];
    const cam = this.cameras.main;
    cam.setBounds(WORLD.left, WORLD.top, WORLD.right - WORLD.left, WORLD.bottom - WORLD.top);
    cam.scrollX = BOAT_X - VW / 2; cam.scrollY = SURF - VH * 0.55;

    // ---- layers, back to front ----
    this.bg = this.add.graphics().setScrollFactor(0).setDepth(0);
    this.far = this.add.graphics().setScrollFactor(0.3).setDepth(1);
    this.whale = this.add.image(0, 0, 't_whale').setScrollFactor(0.22).setDepth(1.5).setAlpha(0.28).setScale(1.6);
    this.mid = this.add.graphics().setScrollFactor(0.62).setDepth(2);
    this.kelpG = this.add.graphics().setScrollFactor(0.62).setDepth(2.1);
    this.rays = this.add.graphics().setScrollFactor(0.8, 1).setDepth(3).setBlendMode(ADD);
    this.sky = this.add.graphics().setDepth(4);
    this.moon = this.add.image(0, 0, 't_glow').setScrollFactor(0.08).setDepth(4.1).setTint(0xcfd8d4).setAlpha(0.8);
    this.world = this.add.graphics().setDepth(6);
    this.dyn = this.add.graphics().setDepth(7);
    this.snow = this.add.graphics().setDepth(5);   // behind the rock, in the water only
    this.dark = this.add.renderTexture(0, 0, VW, VH).setOrigin(0).setScrollFactor(0).setDepth(9);
    this.glow = this.add.graphics().setDepth(10).setBlendMode(ADD);
    this.add.image(0, 0, 't_vignette').setOrigin(0).setScrollFactor(0).setDisplaySize(VW, VH).setDepth(11);
    this.grain = this.add.tileSprite(0, 0, VW, VH, 't_grain').setOrigin(0).setScrollFactor(0).setDepth(11.5).setAlpha(0.6);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.halos = []; this.haloN = 0;
    this.lamp = this.make.image({ key: 't_cone', add: false }).setOrigin(0.02, 0.5);
    this.soft = this.make.image({ key: 't_glow', add: false });

    this.drawStatic();
    this.flakes = Array.from({ length: 170 }, () => ({ x: Math.random() * VW, y: Math.random() * VH, z: 0.5 + Math.random() * 0.9, s: Math.random() }));
    this.bubbles = [];

    // ---- HUD text ----
    const txt = (x, y, s, size, color = '#d9e2df', ox = 0) => this.add.text(x, y, s, { fontFamily: FONT, fontSize: size, color })
      .setOrigin(ox, 0).setScrollFactor(0).setDepth(21).setShadow(0, 1, '#000', 4);
    this.tDepth = txt(24, 18, '', '30px');
    this.tSack = txt(24, 56, '', '18px', '#aab7b3');
    this.tAir = txt(VW - 24, 18, '', '18px', '#aab7b3', 1);
    this.tHose = txt(VW - 24, 72, '', '16px', '#aab7b3', 1);
    this.tWarn = txt(VW / 2, 110, '', '30px', '#e8d2a8', 0.5);
    this.tFloat = [];
    this.tHint = txt(VW / 2, VH - 34, 'Arrows / WASD swim  ·  hold Space to reel in  ·  stick + reel button on touch', '15px', '#8d9a96', 0.5);

    this.makeBoatScreen();
    this.setupInput();
    this.showBoat(null);
    cam.fadeIn(400, 0, 0, 0);
    window.__tether = this;
  }

  // ---------- static world drawing ----------
  drawStatic() {
    const w = this.world;
    // seabed: black, filled down to the bottom of the world
    w.fillStyle(0x000000, 1);
    w.fillPoints([...GROUND.map(([x, y]) => ({ x, y })), { x: GROUND.at(-1)[0], y: WORLD.bottom + 200 }, { x: GROUND[0][0], y: WORLD.bottom + 200 }], true);
    // little bumps along the seabed so it isn't ruler-straight
    for (let x = WORLD.left; x < WORLD.right; x += 26) {
      const y = groundYish(x);
      w.fillCircle(x + 9, y + 4, 7 + ((x * 37) % 11));
    }
    for (const o of OBST) {
      if (o.k === 'c') {
        w.fillCircle(o.x, o.y, o.r);
        w.fillCircle(o.x - o.r * 0.5, o.y + o.r * 0.3, o.r * 0.6); w.fillCircle(o.x + o.r * 0.55, o.y + o.r * 0.25, o.r * 0.55);
      } else {
        w.fillRect(o.x, o.y, o.w, o.h);
        if (o.tag === 'deck' || o.tag === 'keel') for (let x = o.x + 30; x < o.x + o.w; x += 60) w.fillRect(x, o.y - 6, 4, 6);
        if (o.tag === 'mast') { w.fillTriangle(o.x - 3, o.y + 10, o.x + o.w / 2, o.y - 14, o.x + o.w + 3, o.y + 10); }
      }
    }
    // the wreck's insides, in shadow (decoration, not solid)
    w.fillStyle(0x000000, 0.35); w.fillRect(2492, 920, 986, 190);
    // rigging lines and weeds (decoration, not solid)
    w.lineStyle(2, 0x000000, 1);
    w.lineBetween(2698, 630, 2480, 900); w.lineBetween(2698, 630, 2840, 900); w.lineBetween(3278, 710, 3480, 900);
    for (let i = 0; i < 70; i++) {
      const x = 260 + i * 67 + ((i * 53) % 30), y = groundYish(x);
      const h = 26 + ((i * 29) % 50);
      w.lineStyle(3, 0x000000, 1); w.beginPath(); w.moveTo(x, y);
      for (let k = 1; k <= 6; k++) w.lineTo(x + Math.sin(k * 1.3 + i) * 5, y - (h * k) / 6);
      w.strokePath();
    }
    // eel's hole
    w.fillStyle(0x000000, 1); w.fillEllipse(EEL.x, EEL.y, 46, 34);

    // far ridge and a far wreck (fogged black), mid kelp rocks
    const LX = (x, f) => x * f + (VW / 2) * (1 - f), LY = (y, f) => y * f + (VH / 2) * (1 - f);
    const f1 = 0.3, f = this.far;
    f.fillStyle(0x000000, 0.22);
    const ridge = [];
    for (let x = WORLD.left - 600; x <= WORLD.right + 600; x += 160) ridge.push({ x: LX(x, f1), y: LY(groundYish(Math.max(GROUND[0][0], Math.min(GROUND.at(-1)[0], x))) - 260 + Math.sin(x * 0.004) * 120, f1) });
    f.fillPoints([...ridge, { x: ridge.at(-1).x, y: 3000 }, { x: ridge[0].x, y: 3000 }], true);
    f.fillStyle(0x000000, 0.18);
    f.fillRect(LX(3400, f1), LY(860, f1), 160, 30); f.fillRect(LX(3460, f1), LY(700, f1), 6, 170);
    const f2 = 0.62, m = this.mid;
    m.fillStyle(0x000000, 0.42);
    const ridge2 = [];
    for (let x = WORLD.left - 400; x <= WORLD.right + 400; x += 110) ridge2.push({ x: LX(x, f2), y: LY(groundYish(Math.max(GROUND[0][0], Math.min(GROUND.at(-1)[0], x))) - 90 + Math.sin(x * 0.009) * 60, f2) });
    m.fillPoints([...ridge2, { x: ridge2.at(-1).x, y: 3000 }, { x: ridge2[0].x, y: 3000 }], true);
    this.kelp = Array.from({ length: 46 }, (_, i) => {
      const x = 300 + i * 105 + ((i * 41) % 60);
      return { x: LX(x, f2), y: LY(groundYish(x) - 60, f2), h: (120 + ((i * 73) % 220)) * f2, ph: i * 1.7 };
    });
  }

  // ---------- input ----------
  setupInput() {
    this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,SHIFT,R,ENTER,ONE,TWO,THREE');
    this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.reelTouch = -1;
    this.reelBtn = { x: VW - 120, y: VH - 130, r: 70 };
    this.input.on('pointerdown', (p) => {
      if (this.mode !== 'dive') return;
      if (Math.hypot(p.x - this.reelBtn.x, p.y - this.reelBtn.y) < this.reelBtn.r + 20) { this.reelTouch = p.id; return; }
      if (p.x < VW * 0.6 && this.stick.id < 0) Object.assign(this.stick, { id: p.id, ox: p.x, oy: p.y, x: 0, y: 0 });
    });
    this.input.on('pointermove', (p) => {
      if (p.id !== this.stick.id) return;
      const dx = p.x - this.stick.ox, dy = p.y - this.stick.oy, d = Math.hypot(dx, dy), R = 70;
      const k = d > R ? R / d : 1;
      this.stick.x = (dx * k) / R; this.stick.y = (dy * k) / R;
    });
    const up = (p) => {
      if (p.id === this.stick.id) Object.assign(this.stick, { id: -1, x: 0, y: 0 });
      if (p.id === this.reelTouch) this.reelTouch = -1;
    };
    this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
    this.input.keyboard.on('keydown-ENTER', () => { if (this.mode === 'boat') this.startDive(); });
    this.input.keyboard.on('keydown-ONE', () => this.buy('hose'));
    this.input.keyboard.on('keydown-TWO', () => this.buy('tank'));
    this.input.keyboard.on('keydown-THREE', () => this.buy('winch'));
    this.input.keyboard.on('keydown-SPACE', () => { if (this.mode === 'boat' && this.t - this.boatAt > 0.3) this.startDive(); });
  }

  read() {
    const k = this.keys;
    let x = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let y = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (this.stick.id >= 0) { x = this.stick.x; y = this.stick.y; }
    return { x, y, reel: k.SPACE.isDown || k.SHIFT.isDown || k.R.isDown || this.reelTouch >= 0 };
  }

  // ---------- boat screen ----------
  makeBoatScreen() {
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(30);
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.72); panel.fillRoundedRect(VW / 2 - 330, 150, 660, 470, 10);
    panel.lineStyle(1, 0x5d6d69, 0.6); panel.strokeRoundedRect(VW / 2 - 330, 150, 660, 470, 10);
    c.add(panel);
    const T = (x, y, s, size, color = '#d9e2df', ox = 0.5) => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size, color, align: 'center', wordWrap: { width: 600 } }).setOrigin(ox, 0); c.add(t); return t; };
    T(VW / 2, 36, 'TETHER', '64px').setShadow(0, 2, '#000', 10);
    T(VW / 2, 108, 'Wreck Graveyard', '20px', '#9aa7a3').setShadow(0, 1, '#000', 6);
    this.bResult = T(VW / 2, 172, '', '20px', '#e8d2a8');
    this.bBank = T(VW / 2, 232, '', '26px');
    this.rows = Object.keys(UPGRADES).map((key, i) => {
      const y = 290 + i * 74;
      const name = T(VW / 2 - 290, y, `${i + 1}.  ${UPGRADES[key].name}`, '22px', '#d9e2df', 0);
      const info = T(VW / 2 - 290, y + 30, '', '15px', '#8d9a96', 0);
      const btn = T(VW / 2 + 290, y + 8, '', '20px', '#d9e2df', 1).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.buy(key));
      return { key, name, info, btn };
    });
    this.bPips = this.add.graphics(); c.add(this.bPips);
    const dive = T(VW / 2, 528, 'DIVE', '40px', '#e8d2a8').setInteractive({ useHandCursor: true });
    dive.on('pointerdown', () => this.startDive());
    dive.on('pointerover', () => dive.setColor('#ffffff')); dive.on('pointerout', () => dive.setColor('#e8d2a8'));
    T(VW / 2, 580, 'Enter / Space to dive  ·  1 2 3 to buy', '14px', '#6f7c78');
    this.bPage = T(VW / 2, 634, '', '15px', '#9aa7a3');
    this.boatUI = c;
  }

  refreshBoat() {
    const s = this.save;
    this.bBank.setText(`Silver in the tin: ${s.bank}`);
    this.bPips.clear();
    for (const r of this.rows) {
      const U = UPGRADES[r.key], lv = s.lv[r.key], max = U.costs.length;
      r.info.setText(lv < max ? `${U.fmt(U.values[lv])}  →  ${U.fmt(U.values[lv + 1])}` : `${U.fmt(U.values[lv])}  (best there is)`);
      if (lv < max) {
        const cost = U.costs[lv];
        r.btn.setText(`Buy · ${cost}`).setColor(s.bank >= cost ? '#e8d2a8' : '#5f6a67');
      } else r.btn.setText('');
      for (let i = 0; i < max; i++) {
        this.bPips.fillStyle(i < lv ? 0xe8d2a8 : 0x3a4442, 1);
        this.bPips.fillCircle(VW / 2 + 20 + i * 18, r.name.y + 14, 5);
      }
    }
    this.bPage.setText(s.page ? PAGE_TEXT : '');
  }

  buy(key) {
    if (this.mode !== 'boat') return;
    const U = UPGRADES[key], lv = this.save.lv[key];
    if (lv >= U.costs.length || this.save.bank < U.costs[lv]) return;
    this.save.bank -= U.costs[lv]; this.save.lv[key]++;
    storeSave(this.save); this.refreshBoat();
    this.cameras.main.flash(120, 40, 36, 28);
  }

  showBoat(result) {
    this.mode = 'boat'; this.boatAt = this.t; this.sim = null;
    this.bResult.setText(result || (this.save.dives ? '' : 'Your father dove here and never came up.\nFill the sack. Mind the hose.'));
    this.refreshBoat();
    this.boatUI.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.boatUI, alpha: 1, duration: 350 });
    this.tWarn.setText(''); this.tHint.setVisible(false);
    for (const t of [this.tDepth, this.tSack, this.tAir, this.tHose]) t.setVisible(false);
  }

  startDive() {
    if (this.mode !== 'boat') return;
    this.sim = new Dive(this.save.lv, { havePage: this.save.page });
    this.mode = 'dive'; this.diveT = 0;
    this.ang = Math.PI / 2; this.side = 1;
    this.tweens.add({ targets: this.boatUI, alpha: 0, duration: 250, onComplete: () => this.boatUI.setVisible(false) });
    for (const t of [this.tDepth, this.tSack, this.tAir, this.tHose]) t.setVisible(true);
    this.tHint.setVisible(true).setAlpha(1);
    this.time.delayedCall(6000, () => this.tweens.add({ targets: this.tHint, alpha: 0, duration: 800 }));
    this.puff(this.sim.diver.x, this.sim.diver.y, 14);
  }

  endDive(dead) {
    const s = this.sim, save = this.save;
    this.mode = 'over';
    save.dives++; save.best = Math.max(save.best, s.maxDepth || 0);
    let msg;
    if (dead) msg = `You blacked out at ${s.depthM} m. The crew hauled you up.\nThe sack is lost.`;
    else {
      const v = s.value; save.bank += v;
      if (s.sack.some((i) => i.kind === 'page')) save.page = true;
      msg = s.sack.length ? `Back on the boat. The haul sold for ${v} silver.` : 'Back on the boat, empty-handed.';
    }
    storeSave(save);
    const cam = this.cameras.main;
    cam.fadeOut(dead ? 900 : 500, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      cam.scrollX = BOAT_X - VW / 2; cam.scrollY = SURF - VH * 0.55;
      this.showBoat(msg); cam.fadeIn(500, 0, 0, 0);
    });
  }

  // ---------- frame ----------
  update(_, ms) {
    const dt = Math.min(ms / 1000, 0.1);
    this.t += dt;
    if (this.mode === 'dive') {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n++ < 5) {
        this.acc -= STEP;
        const inp = this.read();
        this.lastInp = inp;
        const ev = this.sim.step(inp);
        this.sim.maxDepth = Math.max(this.sim.maxDepth || 0, this.sim.depthM);
        for (const e of ev) this.onEvent(e);
        if (this.sim.state !== 'dive') { this.endDive(this.sim.state === 'dead'); break; }
      }
      if (this.acc > STEP * 5) this.acc = 0;
    }
    this.animateDiver(dt);
    this.followCamera(dt);
    this.render(dt);
  }

  onEvent(e) {
    const d = this.sim.diver;
    if (e.type === 'pickup') {
      const it = e.item;
      this.floatText(it.x, it.y - 20, it.kind === 'page' ? 'a page of the log' : it.kind === 'crate' ? `crate +${it.value}` : `+${it.value}`);
      this.puff(it.x, it.y, it.kind === 'crate' ? 10 : 4);
    } else if (e.type === 'kink') this.cameras.main.shake(140, 0.003);
    else if (e.type === 'bite') { this.cameras.main.shake(220, 0.007); this.puff(this.sim.eel.tx, this.sim.eel.ty, 18); }
    else if (e.type === 'full') this.floatText(d.x, d.y - 50, 'sack full');
    else if (e.type === 'stall') this.cameras.main.shake(100, 0.002);
  }

  // soft additive glow sprites, pooled and re-placed every frame
  halo(x, y, size, tint, alpha) {
    let h = this.halos[this.haloN++];
    if (!h) { h = this.add.image(0, 0, 't_glow').setBlendMode(ADD).setDepth(10); this.halos.push(h); }
    h.setVisible(true).setPosition(x, y).setScale(size / 64).setTint(tint).setAlpha(alpha);
  }

  floatText(x, y, s) {
    const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: '20px', color: '#e8d2a8' }).setOrigin(0.5).setDepth(12).setShadow(0, 1, '#000', 4);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
  }

  puff(x, y, n) {
    for (let i = 0; i < n; i++) this.bubbles.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 16, r: 1.5 + Math.random() * 3, vy: -30 - Math.random() * 50, ph: Math.random() * 6, life: 2 + Math.random() * 2 });
  }

  animateDiver(dt) {
    if (!this.sim) return;
    const d = this.sim.diver;
    const vx = (d.x - d.px) / STEP, vy = (d.y - d.py) / STEP, sp = Math.hypot(vx, vy);
    const inp = this.lastInp || { x: 0, y: 0 };
    const pushing = Math.hypot(inp.x, inp.y) > 0.2;
    if (Math.abs(this.sim.face.x) > 0.15) this.side = this.sim.face.x > 0 ? 1 : -1;
    // swimming: lie along the stroke; idle: stand upright, leaning a touch toward where he faces
    const target = pushing && sp > 25 ? Math.atan2(vy, vx) : -Math.PI / 2 + this.side * 0.18;
    this.ang += Phaser.Math.Angle.Wrap(target - this.ang) * Math.min(1, dt * 4);
    this.kick += dt * (pushing ? 9 : 2);
    // breath bubbles from the helmet, faster when on the tank
    const onTank = this.sim.flow < 1;
    this.breath = (this.breath || 0) - dt;
    if (this.breath <= 0) {
      this.breath = onTank ? 0.6 : 1.8;
      const hx = d.x + Math.cos(this.ang) * 20, hy = d.y + Math.sin(this.ang) * 20;
      this.puff(hx, hy, onTank ? 2 : 3);
    }
    if (this.sim) for (const p of this.sim.leakPoints()) if (Math.random() < dt * 8) this.puff(p.x, p.y, 1);
  }

  followCamera(dt) {
    const cam = this.cameras.main;
    let tx, ty;
    if (this.sim && this.mode !== 'boat') {
      const d = this.sim.diver;
      tx = d.x + this.sim.face.x * 120 - VW / 2; ty = d.y + this.sim.face.y * 60 - VH / 2;
    } else { tx = BOAT_X - VW / 2 + 40; ty = SURF - VH * 0.6; }
    const k = Math.min(1, dt * 3);
    cam.scrollX += (tx - cam.scrollX) * k; cam.scrollY += (ty - cam.scrollY) * k;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, WORLD.left, WORLD.right - VW);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, WORLD.top, WORLD.bottom - VH);
  }

  render(dt) {
    const cam = this.cameras.main, t = this.t, sim = this.sim;
    const top = cam.scrollY, bot = cam.scrollY + VH, mid = top + VH / 2;

    // water / sky backdrop
    this.bg.clear();
    const ct = waterAt(Math.max(SURF, top)), cb = waterAt(Math.max(SURF, bot));
    this.bg.fillGradientStyle(ct, ct, cb, cb, 1); this.bg.fillRect(0, 0, VW, VH);
    this.whale.setPosition(((t * 14) % 3600) - 400 + 600, 520);

    // kelp in the middle distance
    const kg = this.kelpG; kg.clear(); kg.lineStyle(5, 0x000000, 0.42);
    for (const k of this.kelp) {
      kg.beginPath(); kg.moveTo(k.x, k.y);
      for (let i = 1; i <= 8; i++) kg.lineTo(k.x + Math.sin(t * 0.7 + k.ph + i * 0.5) * i * 2.2, k.y - (k.h * i) / 8);
      kg.strokePath();
    }

    // light shafts from the surface
    this.rays.clear();
    const shallow = Phaser.Math.Clamp(1 - (mid - SURF) / 900, 0, 1);
    if (shallow > 0) {
      for (let i = 0; i < 9; i++) {
        const x = cam.scrollX * 0.8 + i * 190 + Math.sin(t * 0.25 + i * 2) * 60 - 200;
        const a = (0.05 + 0.03 * Math.sin(t * 0.6 + i)) * shallow;
        this.rays.fillStyle(0x9fc0c4, a);
        this.rays.fillTriangle(x, SURF, x + 70, SURF, x + 260 + i * 10, SURF + 700);
      }
    }

    // sky above the surface
    this.sky.clear();
    this.sky.fillGradientStyle(0x0b1216, 0x0b1216, 0x1d2b30, 0x1d2b30, 1);
    this.sky.fillRect(WORLD.left, WORLD.top - 400, WORLD.right - WORLD.left, SURF - WORLD.top + 400);
    this.moon.setPosition(VW * 0.72 + 80, 60).setScale(0.9);
    // the surface: a wavy band
    this.sky.fillStyle(0x6f8c91, 0.55);
    const wave = [];
    for (let x = cam.scrollX - 40; x <= cam.scrollX + VW + 40; x += 20) wave.push({ x, y: SURF + Math.sin(x * 0.02 + t * 1.6) * 3 + Math.sin(x * 0.007 - t) * 2 });
    this.sky.fillPoints([...wave, { x: wave.at(-1).x, y: SURF + 10 }, { x: wave[0].x, y: SURF + 10 }], true);

    // ---- dynamic world: boat, items, eel, hose, diver ----
    const g = this.dyn; g.clear();
    const boat = drawBoat(g, BOAT_X, SURF, t);
    this.glow.clear(); this.haloN = 0;
    this.glow.fillStyle(0xe8b060, 0.55); this.glow.fillCircle(boat.lamp.x, boat.lamp.y, 6);
    this.halo(boat.lamp.x, boat.lamp.y, 50, 0xe8b060, 0.35);
    if (sim) this.drawDive(g, boat);

    for (let i = this.haloN; i < this.halos.length; i++) this.halos[i].setVisible(false);

    // marine snow + bubbles (lit only by the lamp, since they sit under the darkness)
    const s = this.snow; s.clear();
    s.fillStyle(0xaec4c6, 0.5);
    for (const f of this.flakes) {
      f.y += dt * 9 * f.z; f.x += Math.sin(t * 0.5 + f.s * 9) * dt * 4;
      const sx = ((f.x - cam.scrollX * f.z) % VW + VW) % VW, sy = ((f.y - cam.scrollY * f.z) % VH + VH) % VH;
      const wx = cam.scrollX + sx, wy = cam.scrollY + sy;
      if (wy > SURF + 8) s.fillCircle(wx, wy, 0.8 + f.z * 0.9);
    }
    s.lineStyle(1.2, 0xc8dadc, 0.6);
    for (const b of this.bubbles) {
      b.life -= dt; b.y += b.vy * dt; b.x += Math.sin(t * 4 + b.ph) * dt * 12;
      if (b.y < SURF + 4) b.life = 0;
      s.strokeCircle(b.x, b.y, b.r);
    }
    this.bubbles = this.bubbles.filter((b) => b.life > 0);

    // ---- darkness, with the lamp cut out of it ----
    const rt = this.dark;
    rt.clear();
    const da = darkAt(mid);
    rt.fill(0x000306, da);
    if (sim) {
      const d = sim.diver;
      const hx = d.x + Math.cos(this.ang) * 19 - cam.scrollX, hy = d.y + Math.sin(this.ang) * 19 - cam.scrollY;
      const lampAng = Math.atan2(sim.face.y, sim.face.x);
      const flick = 1 + Math.sin(t * 23) * 0.02 + (sim.flow < 1 ? Math.sin(t * 41) * 0.06 : 0);
      this.lamp.setPosition(hx, hy).setRotation(lampAng).setScale(1.6 * flick, 1.35 * flick);
      rt.erase(this.lamp, hx, hy);
      this.soft.setScale(4.2); rt.erase(this.soft, hx, hy);
    }
    // a pool of light under the boat
    this.soft.setScale(6, 3); rt.erase(this.soft, BOAT_X - cam.scrollX, SURF - cam.scrollY + 20);

    this.grain.tilePositionX = Math.random() * 256; this.grain.tilePositionY = Math.random() * 256;
    this.drawHud();
  }

  drawDive(g, boat) {
    const sim = this.sim, t = this.t;
    // items
    for (const it of sim.items) {
      if (it.got) continue;
      if (it.kind === 'coin') {
        g.fillStyle(0x7d7048, 1); g.fillEllipse(it.x, it.y, 10, 7);
        g.fillStyle(0xb8a46a, 1); g.fillEllipse(it.x - 1, it.y - 1, 5, 3);
      } else if (it.kind === 'pearl') {
        g.fillStyle(0x000000, 1); g.fillEllipse(it.x, it.y + 6, 30, 12);
        const open = 4 + Math.sin(t * 1.5 + it.x) * 3;
        g.fillTriangle(it.x - 15, it.y + 4, it.x + 15, it.y + 4, it.x + 12, it.y - open);
        this.glow.fillStyle(0xcfe8ff, 0.9); this.glow.fillCircle(it.x, it.y + 1, 3.5);
        this.halo(it.x, it.y, 30 + Math.sin(t * 2 + it.x) * 4, 0x8fc8ff, 0.4);
      } else if (it.kind === 'crate') {
        g.fillStyle(0x000000, 1); g.fillRect(it.x - 18, it.y - 14, 36, 28);
        g.lineStyle(1.5, 0x37403e, 1); g.strokeRect(it.x - 18, it.y - 14, 36, 28);
        g.lineBetween(it.x - 18, it.y - 14, it.x + 18, it.y + 14);
      } else if (it.kind === 'idol') {
        g.fillStyle(0x000000, 1); g.fillRect(it.x - 9, it.y - 22, 18, 30); g.fillCircle(it.x, it.y - 26, 9);
        this.halo(it.x, it.y - 14, 60 + Math.sin(t * 1.7) * 6, 0xe8c070, 0.45);
        this.glow.fillStyle(0xf0d090, 0.8); this.glow.fillCircle(it.x - 3, it.y - 28, 2); this.glow.fillCircle(it.x + 3, it.y - 28, 2);
      } else if (it.kind === 'page') {
        const a = Math.sin(t * 1.2) * 0.3;
        this.glow.fillStyle(0xd8d4c0, 0.5);
        this.glow.fillPoints([{ x: it.x - 10, y: it.y - 7 + a * 10 }, { x: it.x + 10, y: it.y - 7 - a * 10 }, { x: it.x + 10, y: it.y + 7 - a * 10 }, { x: it.x - 10, y: it.y + 7 + a * 10 }], true);
        this.halo(it.x, it.y, 36, 0xd8d4c0, 0.3);
      }
    }

    // the eel: two pale eyes in the hole; lunges at hose left near it
    const e = sim.eel, lunge = e.lunge > 0 ? Math.sin((1 - e.lunge / 0.5) * Math.PI) : 0;
    const ready = Math.min(1, e.timer / 1.1);
    const hx = EEL.x + (e.tx - EEL.x) * lunge + (lunge ? 0 : -ready * 8), hy = EEL.y + (e.ty - EEL.y) * lunge;
    g.lineStyle(14, 0x000000, 1); g.beginPath(); g.moveTo(EEL.x + 20, EEL.y);
    for (let i = 1; i <= 8; i++) { const k = i / 8; g.lineTo(EEL.x + 20 + (hx - EEL.x - 20) * k, EEL.y + (hy - EEL.y) * k + Math.sin(k * 6 + t * 9) * 6 * lunge); }
    g.strokePath();
    g.fillStyle(0x000000, 1); g.fillEllipse(hx, hy, 26, 16);
    this.glow.fillStyle(0xd9e8c0, 0.35 + ready * 0.5);
    this.glow.fillCircle(hx - 5, hy - 3, 1.8); this.glow.fillCircle(hx + 3, hy - 3, 1.8);

    // the hose: a pale edge so it reads against black rock, then the black hose
    const P = sim.P;
    const line = (w, c, a) => {
      g.lineStyle(w, c, a); g.beginPath(); g.moveTo(boat.pulley.x, boat.pulley.y);
      for (const p of P) g.lineTo(p.x, p.y);
      g.strokePath();
    };
    line(8, sim.kinked ? 0x6a3a30 : sim.atMax ? 0x4e5f5a : 0x2f4248, 0.9);
    line(4.5, 0x050607, 1);
    if (sim.kinked && sim.kinkAt > 0) {
      const k = P[sim.kinkAt], a = 0.45 + Math.sin(t * 12) * 0.25;
      this.halo(k.x, k.y, 34, 0xff6040, a);
      this.glow.fillStyle(0xffa080, a); this.glow.fillCircle(k.x, k.y, 5);
    }

    // the diver
    const d = sim.diver;
    const face = drawDiver(g, d.x, d.y, this.ang, this.side, this.kick);
    this.glow.fillStyle(0xe8b060, sim.flow < 1 ? 0.45 + Math.sin(t * 9) * 0.25 : 0.55);
    this.glow.fillCircle(face.x, face.y, 4.5);
    // the sack, slung at his hip, grows with the haul
    if (sim.sack.length) {
      const r = 5 + Math.min(9, sim.sack.length * 1.2 + sim.weight * 1.4);
      const bx = d.x - Math.cos(this.ang) * 6 - Math.sin(this.ang) * this.side * 18, by = d.y - Math.sin(this.ang) * 6 + Math.cos(this.ang) * this.side * 18 + 8;
      g.fillStyle(0x000000, 1); g.fillCircle(bx, by, r);
    }
  }

  drawHud() {
    const h = this.hud; h.clear();
    const sim = this.sim;
    this.reelLabel?.setVisible(this.mode === 'dive');
    if (this.mode !== 'dive' || !sim) return;
    const d = sim.depthM;
    this.tDepth.setText(`${d} m`);
    this.tSack.setText(sim.sack.length ? `Sack  ${sim.value} silver  ·  ${sim.weight}/6 weight` : 'Sack empty');

    // air: the bar is the emergency tank; the label says where your air is coming from
    const x = VW - 244, y = 46, w = 220;
    const frac = sim.tank / sim.g.tankMax, onTank = sim.flow < 1;
    h.fillStyle(0x000000, 0.5); h.fillRect(x, y, w, 12);
    h.fillStyle(onTank ? (frac < 0.35 ? 0xd05a40 : 0xd0a060) : 0x7fa6ad, 1); h.fillRect(x, y, w * frac, 12);
    h.lineStyle(1, 0x8d9a96, 0.6); h.strokeRect(x, y, w, 12);
    this.tAir.setText(onTank ? `ON THE TANK  ${sim.tank.toFixed(1)} s` : sim.leaks.length ? 'HOSE AIR (leaking)' : 'HOSE AIR');
    this.tAir.setColor(onTank ? '#e8b080' : '#aab7b3');
    // hose paid out
    const used = sim.L / sim.g.hoseMax;
    h.fillStyle(0x000000, 0.5); h.fillRect(x, y + 50, w, 6);
    h.fillStyle(used > 0.95 ? 0xd0a060 : 0x5f7f86, 1); h.fillRect(x, y + 50, w * used, 6);
    this.tHose.setText(`hose out  ${Math.round(sim.L / PX_PER_M)} / ${Math.round(sim.g.hoseMax / PX_PER_M)} m`).setY(y + 62);

    // warnings, most urgent first
    let warn = '';
    if (sim.kinked) warn = sim.stalled ? 'KINKED: the winch can\'t pull through. Swim back round it.' : 'KINKED: no air. Ease off, go back round.';
    else if (sim.stalled) warn = 'WINCH STUCK: the hose is caught. Swim to free it.';
    else if (sim.tank < 4 && onTank) warn = 'Air running out';
    else if (sim.leaks.length && sim.t % 6 < 2.5) warn = 'The hose is bitten. It\'s leaking.';
    else if (sim.atMax) warn = 'The hose is all the way out';
    this.tWarn.setText(warn).setAlpha(sim.kinked ? 0.7 + Math.sin(this.t * 8) * 0.3 : 0.9);

    // touch controls
    if (this.sys.game.device.input.touch) {
      const s = this.stick;
      if (s.id >= 0) {
        h.lineStyle(2, 0xd9e2df, 0.25); h.strokeCircle(s.ox, s.oy, 70);
        h.fillStyle(0xd9e2df, 0.25); h.fillCircle(s.ox + s.x * 70, s.oy + s.y * 70, 30);
      }
      const b = this.reelBtn, on = this.reelTouch >= 0;
      h.fillStyle(0x000000, on ? 0.5 : 0.3); h.fillCircle(b.x, b.y, b.r);
      h.lineStyle(2, 0xd9e2df, on ? 0.7 : 0.35); h.strokeCircle(b.x, b.y, b.r);
      h.lineStyle(4, 0xd9e2df, on ? 0.8 : 0.45);
      h.beginPath(); h.arc(b.x, b.y, 26, -2.6, 1.6); h.strokePath();
      h.fillStyle(0xd9e2df, on ? 0.8 : 0.45); h.fillTriangle(b.x - 33, b.y - 18, b.x - 14, b.y - 18, b.x - 24, b.y - 2);
      this.reelLabel ??= this.add.text(b.x, b.y + b.r + 6, 'REEL', { fontFamily: FONT, fontSize: '15px', color: '#aab7b3' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(21);
    }
  }
}
