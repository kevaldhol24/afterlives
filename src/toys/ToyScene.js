import Phaser from 'phaser';
import { W, H, FONT, COLORS } from '../constants.js';
import { STEP } from './kit.js';
import { LanternRoom } from './lantern.js';
import { RopeRoom } from './rope.js';
import { PossessRoom } from './possess.js';

export const TOYS = [
  { key: 'lantern', Room: LanternRoom, blurb: 'Light makes the forgotten real. Carry it, set it down, throw it.' },
  { key: 'rope', Room: RopeRoom, blurb: 'A body and its spirit on one rope. The spirit is your anchor.' },
  { key: 'possess', Room: PossessRoom, blurb: 'A wisp borrowing creatures. Leave bodies where they help.' },
];

// Keyboard state per physics step, with "pressed this step" edges.
function makeInput(scene) {
  const k = scene.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,Z,E,X,F,C');
  const prev = {};
  return () => {
    const i = {
      left: k.LEFT.isDown || k.A.isDown,
      right: k.RIGHT.isDown || k.D.isDown,
      up: k.UP.isDown || k.W.isDown,
      down: k.DOWN.isDown || k.S.isDown,
      space: k.SPACE.isDown || k.Z.isDown,
      action: k.E.isDown || k.X.isDown,
      throw: k.F.isDown || k.C.isDown,
    };
    i.jump = i.space || i.up;
    for (const n of ['jump', 'space', 'action', 'throw']) { i[n + 'Pressed'] = i[n] && !prev[n]; prev[n] = i[n]; }
    return i;
  };
}

export class ToyScene extends Phaser.Scene {
  constructor() { super('toy'); }

  init(data) { this.index = data?.toy ?? 0; }

  create() {
    const toy = TOYS[this.index];
    this.room = new toy.Room();
    history.replaceState(null, '', '#' + toy.key);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x9aa6a2, 0x9aa6a2, 0x47524f, 0x47524f, 1);
    bg.fillRect(0, 0, W, H);
    this.g = this.add.graphics();
    this.fx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

    const text = (x, y, s, size, color, origin = 0) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: size, color }).setOrigin(origin, 0).setShadow(0, 1, '#000', 4).setDepth(5);
    text(16, 12, `${this.index + 1}. ${this.room.name}`, '24px', COLORS.text);
    text(W - 16, 16, 'R restart   ·   M menu   ·   N next toy', '15px', COLORS.textDim, 1);
    text(W / 2, 46, this.room.hint, '15px', COLORS.text, 0.5);
    this.banner = text(W / 2, H * 0.36, '', '34px', COLORS.text, 0.5).setShadow(0, 2, '#000', 8);

    this.read = makeInput(this);
    this.acc = 0;
    this.ending = false;
    this.input.keyboard.on('keydown-R', () => this.scene.restart({ toy: this.index }));
    this.input.keyboard.on('keydown-M', () => this.scene.start('toys'));
    this.input.keyboard.on('keydown-N', () => this.scene.restart({ toy: (this.index + 1) % TOYS.length }));
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_, ms) {
    this.acc += Math.min(ms / 1000, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const inp = this.read();
      if (!this.ending) this.room.step(inp, STEP);
    }
    if (!this.ending && this.room.dead) {
      this.ending = true;
      this.cameras.main.shake(160, 0.006);
      this.time.delayedCall(550, () => this.scene.restart({ toy: this.index }));
    }
    if (!this.ending && this.room.won) {
      this.ending = true;
      this.banner.setText('Room clear\nN next toy  ·  R again  ·  M menu').setAlign('center');
    }
    this.g.clear(); this.fx.clear();
    this.room.draw(this.g, this.fx);
  }
}

export class ToyMenu extends Phaser.Scene {
  constructor() { super('toys'); }

  create() {
    history.replaceState(null, '', location.pathname + location.search);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a3230, 0x2a3230, 0x0d1110, 0x0d1110, 1);
    bg.fillRect(0, 0, W, H);
    const t = (x, y, s, size, color) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: size, color }).setOrigin(0.5, 0);
    t(W / 2, 56, 'Afterlives: mechanic toys', '38px', COLORS.text);
    t(W / 2, 108, 'Three rough rooms, one idea each. Which one makes you want a second room?', '18px', COLORS.textDim);

    const items = [...TOYS.map((toy, i) => ({ label: `${i + 1}.  ${new toy.Room().name}`, blurb: toy.blurb, go: () => this.scene.start('toy', { toy: i }) })),
      { label: '4.  Old prototype', blurb: 'Corpses and ghosts, as it was.', go: () => this.scene.start('game', { level: 0 }) },
      { label: '5.  Forest', blurb: 'Chapter 1 in the painted forest: push, pull, swing, and the hound.', go: () => { location.hash = 'forest'; location.reload(); } },
      { label: '6.  Tether', blurb: 'A salvage diver on an air hose. Different game: the ocean prototype.', go: () => { location.hash = 'tether'; location.reload(); } }];
    items.forEach((it, i) => {
      const y = 148 + i * 56;
      const label = t(W / 2, y, it.label, '28px', COLORS.text).setInteractive({ useHandCursor: true });
      t(W / 2, y + 36, it.blurb, '16px', COLORS.textDim);
      label.on('pointerover', () => label.setColor('#9fe0ff'));
      label.on('pointerout', () => label.setColor(COLORS.text));
      label.on('pointerdown', it.go);
      this.input.keyboard.once(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][i]}`, it.go);
    });
    t(W / 2, H - 40, 'Keyboard only for now: arrows / WASD, Space, E, F', '15px', COLORS.textDim);
  }
}
