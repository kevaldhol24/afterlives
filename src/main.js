import Phaser from 'phaser';
import { GameScene } from './GameScene.js';
import { EndScene } from './EndScene.js';
import { ToyScene, ToyMenu, TOYS } from './toys/ToyScene.js';
import { ForestScene, FOREST_SIZE } from './forest/ForestScene.js';
import { W, H } from './constants.js';

async function boot() {
  // Wait briefly for the display font; fall back to Georgia if it is slow.
  try {
    await Promise.race([
      document.fonts.load('20px "IM Fell English SC"'),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* fallback font is fine */ }

  // #lantern / #rope / #possess open a mechanic toy; #l1 .. #l4 open a room of the old prototype
  const hash = (location.hash || '').slice(1);
  // #forest: the painted forest walk, its own game at 1920x1080
  if (hash === 'forest') {
    window.__afterlives = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: 'game',
      width: FOREST_SIZE.width,
      height: FOREST_SIZE.height,
      backgroundColor: '#000000',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      input: { activePointers: 4 },
      render: { antialias: true },
      scene: [ForestScene],
    });
    return;
  }
  const m = /^l(\d)$/.exec(hash);
  const toy = TOYS.findIndex((t) => t.key === hash);

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
  game.scene.add('game', GameScene, !!m, { level: m ? Math.max(0, parseInt(m[1], 10) - 1) : 0 });
  game.scene.add('end', EndScene, false);
  game.scene.add('toy', ToyScene, toy >= 0, { toy });
  game.scene.add('toys', ToyMenu, !m && toy < 0);
  window.__afterlives = game;
}

boot();
