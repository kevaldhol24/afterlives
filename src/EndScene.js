import Phaser from 'phaser';
import { W, H, FONT, COLORS } from './constants.js';

export class EndScene extends Phaser.Scene {
  constructor() { super('end'); }

  create() {
    this.add.image(0, 0, 'bg').setOrigin(0).setAlpha(0.35);
    this.add.image(0, 0, 'vignette').setOrigin(0);
    this.add.text(W / 2, H * 0.4, 'End of the prototype', {
      fontFamily: FONT, fontSize: '40px', color: COLORS.text,
    }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.4 + 56, 'Tap or press any key to play again', {
      fontFamily: FONT, fontSize: '20px', color: COLORS.textDim,
    }).setOrigin(0.5);
    this.cameras.main.fadeIn(600, 0, 0, 0);
    const again = () => this.scene.start('game', { level: 0 });
    this.time.delayedCall(600, () => {
      this.input.once('pointerdown', again);
      this.input.keyboard.once('keydown', again);
    });
  }
}
