import Phaser from 'phaser';
import { GameScene } from './GameScene.js';
import { EndScene } from './EndScene.js';
import { W, H } from './constants.js';

async function boot() {
  // Wait briefly for the display font; fall back to Georgia if it is slow.
  try {
    await Promise.race([
      document.fonts.load('20px "IM Fell English SC"'),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* fallback font is fine */ }

  // Optional start level for testing: #l1 .. #l4
  const m = /^#l(\d)$/.exec(location.hash || '');
  const startLevel = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: 1400 }, fps: 60, debug: false } },
    input: { activePointers: 4 },
    render: { antialias: true },
    scene: [],
  });
  game.scene.add('game', GameScene, true, { level: startLevel });
  game.scene.add('end', EndScene, false);
  window.__afterlives = game;
}

boot();
