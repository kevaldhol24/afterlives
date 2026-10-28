// Particles: soft dust from feet and boxes, splashes and bubbles in the pit water, splinters and dust when a trap
// snaps, feathers when crows take off. Phaser emitters fed from small textures painted at boot.
import { mkCanvas, rng } from './art.js';
import { S } from './style.js';

function softTexture(size, seed) {
  // a lumpy puff: a few overlapping soft blobs, so dust doesn't read as perfect circles
  const c = mkCanvas(size, size), ctx = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < 7; i++) {
    const x = size * (0.3 + r() * 0.4), y = size * (0.3 + r() * 0.4), rad = size * (0.18 + r() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

function dotTexture(size) {
  const c = mkCanvas(size, size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function ringTexture(size) {
  const c = mkCanvas(size, size), ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(size / 2 - 2, size / 2 - 2, 1.2, 0, Math.PI * 2); ctx.fill();
  return c;
}

function shardTexture(w, h, color) {
  const c = mkCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.quadraticCurveTo(w / 2, 0, w, h / 2); ctx.quadraticCurveTo(w / 2, h, 0, h / 2); ctx.fill();
  return c;
}

export class Fx {
  constructor(scene, depth) {
    const T = scene.textures;
    if (!T.exists('fx_soft')) {
      T.addCanvas('fx_soft', softTexture(64, 3));
      T.addCanvas('fx_dot', dotTexture(16));
      T.addCanvas('fx_ring', ringTexture(14));
      T.addCanvas('fx_shard', shardTexture(14, 5, S.ink));
      T.addCanvas('fx_feather', shardTexture(12, 4, S.ink));
    }
    const em = (key, cfg, d = depth) => scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(d);
    this.dustE = em('fx_soft', {
      lifespan: { min: 600, max: 1200 }, speed: { min: 15, max: 70 }, angle: { min: 195, max: 345 },
      scale: { start: 0.25, end: 0.75 }, alpha: { start: 0.3, end: 0 }, tint: S.puff, gravityY: -12,
    });
    this.dropE = em('fx_dot', {
      lifespan: { min: 500, max: 900 }, speed: { min: 160, max: 460 }, angle: { min: 235, max: 305 },
      scale: { start: 0.45, end: 0.2 }, alpha: { start: 0.75, end: 0.1 }, tint: S.waterHi, gravityY: 1500,
    }, depth + 2);
    this.mistE = em('fx_soft', {
      lifespan: { min: 900, max: 1600 }, speed: { min: 20, max: 90 }, angle: { min: 200, max: 340 },
      scale: { start: 0.5, end: 1.4 }, alpha: { start: 0.22, end: 0 }, tint: S.waterHi, gravityY: -20,
    }, depth + 2);
    this.bubbleE = em('fx_ring', {
      lifespan: { min: 900, max: 1700 }, speedY: { min: -90, max: -40 }, speedX: { min: -12, max: 12 },
      scale: { start: 0.4, end: 0.9 }, alpha: { start: 0.55, end: 0 }, tint: S.waterHi,
    }, depth + 2);
    this.shardE = em('fx_shard', {
      lifespan: { min: 600, max: 1100 }, speed: { min: 120, max: 380 }, angle: { min: 210, max: 330 },
      rotate: { min: 0, max: 360 }, scale: { start: 1, end: 0.8 }, alpha: { start: 1, end: 0 }, gravityY: 1600,
    });
    this.featherE = em('fx_feather', {
      lifespan: { min: 1600, max: 2600 }, speed: { min: 20, max: 90 }, angle: { min: 180, max: 360 },
      rotate: { start: 0, end: 540 }, scale: { start: 1, end: 0.8 }, alpha: { start: 1, end: 0 }, gravityY: 70,
    });
  }

  dust(x, y, n) { this.dustE.explode(n, x, y); }

  splash(x, y, power = 1) {
    this.dropE.explode(Math.round(10 + 16 * power), x, y);
    this.mistE.explode(Math.round(3 + 4 * power), x, y - 4);
  }

  bubbles(x, y, n = 2) { this.bubbleE.explode(n, x, y); }

  snap(x, y) {
    this.shardE.explode(7, x, y - 10);
    this.dustE.explode(8, x, y);
  }

  feathers(x, y, n = 3) { this.featherE.explode(n, x, y); }
}
