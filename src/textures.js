// All art is generated at runtime: silhouettes, gradients, fog, glow.
import { W, H } from './constants.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK = 0x050606;

export function makeTextures(scene) {
  if (scene.textures.exists('bg')) return;
  makeKid(scene);
  makeCorpse(scene);
  makeSpike(scene);
  makeDot(scene);
  makeGlow(scene);
  makeShaft(scene);
  makeFog(scene);
  makeVignette(scene);
  makeBackground(scene);
  makeForeground(scene);
}

// ---------- characters ----------

function drawKid(g, legA, legB, armA, armB) {
  g.clear();
  g.fillStyle(INK, 1);
  g.lineStyle(4, INK, 1);
  // legs
  const hip = { x: 16.5, y: 32 };
  const leg = (a) => g.lineBetween(hip.x, hip.y, hip.x + Math.sin(a) * 14, hip.y + Math.cos(a) * 14);
  leg(legA);
  leg(legB);
  // torso (slight tunic flare)
  g.fillPoints([{ x: 12.5, y: 16 }, { x: 20.5, y: 16 }, { x: 21.5, y: 34 }, { x: 11.5, y: 34 }], true);
  // arms
  g.lineStyle(3, INK, 1);
  const sh = { x: 16.5, y: 18.5 };
  const arm = (a) => g.lineBetween(sh.x, sh.y, sh.x + Math.sin(a) * 12, sh.y + Math.cos(a) * 12);
  arm(armA);
  arm(armB);
  // head + messy hair
  g.fillCircle(17, 9.5, 7.5);
  g.fillTriangle(10, 7, 13, 1, 15, 5);
  g.fillTriangle(14, 4, 18, -0.5, 20, 4);
  g.fillTriangle(9.5, 11, 8, 6, 12, 8);
  // eyes
  g.fillStyle(0xffffff, 1);
  g.fillCircle(19.6, 9, 1.35);
  g.fillCircle(22.8, 9, 1.35);
}

function makeKid(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawKid(g, 0.08, -0.08, 0.12, -0.12);
  g.generateTexture('p_idle', 32, 48);
  for (let i = 0; i < 4; i++) {
    const ph = (i / 4) * Math.PI * 2;
    const a = Math.sin(ph) * 0.6;
    drawKid(g, a, -a, -a * 0.8, a * 0.8);
    g.generateTexture('p_run' + i, 32, 48);
  }
  drawKid(g, 0.65, -0.25, 2.4, -2.2);
  g.generateTexture('p_jump', 32, 48);
  drawKid(g, 0.25, -0.35, 2.7, -2.6);
  g.generateTexture('p_fall', 32, 48);
  g.destroy();
}

function makeCorpse(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(INK, 1);
  g.lineStyle(4, INK, 1);
  g.lineBetween(16, 15, 3, 18);   // legs
  g.lineBetween(16, 13, 4, 12.5);
  g.fillPoints([{ x: 15, y: 10 }, { x: 33, y: 9 }, { x: 34, y: 19 }, { x: 15, y: 19 }], true);
  g.lineStyle(3, INK, 1);
  g.lineBetween(30, 12, 23, 5);   // arm flopped up
  g.fillCircle(40, 13.5, 6.5);    // head
  g.fillTriangle(42, 7, 47, 6, 45, 11);
  g.generateTexture('corpse', 48, 20);
  g.destroy();
}

function makeSpike(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(INK, 1);
  g.fillTriangle(0, 24, 4.5, 3, 9, 24);
  g.fillTriangle(8, 24, 14, 0, 20, 24);
  g.fillTriangle(5, 24, 9.5, 10, 13, 24);
  g.generateTexture('spike', 20, 24);
  g.destroy();
}

function makeDot(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture('dot', 8, 8);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 4, 4);
  g.generateTexture('px', 4, 4);
  g.destroy();
}

// ---------- light & atmosphere ----------

function canvasTex(scene, key, w, h, draw) {
  const t = scene.textures.createCanvas(key, w, h);
  draw(t.context, w, h);
  t.refresh();
}

function makeGlow(scene) {
  canvasTex(scene, 'glow', 128, 128, (c) => {
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
  });
}

function makeShaft(scene) {
  canvasTex(scene, 'shaft', 96, 420, (c, w, h) => {
    const hz = c.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(0.5, 'rgba(255,255,255,1)');
    hz.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hz;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    const vt = c.createLinearGradient(0, 0, 0, h);
    vt.addColorStop(0, 'rgba(0,0,0,0)');
    vt.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = vt;
    c.fillRect(0, 0, w, h);
  });
}

function makeFog(scene) {
  canvasTex(scene, 'fog', 1024, 180, (c, w, h) => {
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = h * 0.3 + r() * h * 0.45, rad = 40 + r() * 90;
      for (const ox of [-w, 0, w]) {
        const gr = c.createRadialGradient(x + ox, y, 0, x + ox, y, rad);
        gr.addColorStop(0, 'rgba(225,230,228,0.10)');
        gr.addColorStop(1, 'rgba(225,230,228,0)');
        c.fillStyle = gr;
        c.fillRect(x + ox - rad, y - rad, rad * 2, rad * 2);
      }
    }
  });
}

function makeVignette(scene) {
  canvasTex(scene, 'vignette', W, H, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h * 0.48, w * 0.28, w / 2, h * 0.5, w * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.7, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
  });
}

// ---------- background forest ----------

function branch(c, r, x, y, ang, len, width, depth) {
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * len * 0.35, (y + y2) / 2 + (r() - 0.5) * len * 0.35, x2, y2);
  c.stroke();
  if (depth > 0) {
    const k = 1 + Math.floor(r() * 2);
    for (let i = 0; i < k; i++) branch(c, r, x2, y2, ang + (r() - 0.5) * 1.3, len * 0.6, Math.max(0.8, width * 0.6), depth - 1);
  }
}

function tree(c, r, x, baseY, h, w, color) {
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineCap = 'round';
  const lean = (r() - 0.5) * h * 0.1;
  c.beginPath();
  c.moveTo(x - w * 0.9, baseY);
  c.quadraticCurveTo(x - w * 0.45, baseY - h * 0.08, x - w * 0.42, baseY - h * 0.2);
  c.quadraticCurveTo(x - w * 0.3 + lean * 0.5, baseY - h * 0.6, x - w * 0.14 + lean, baseY - h);
  c.lineTo(x + w * 0.14 + lean, baseY - h);
  c.quadraticCurveTo(x + w * 0.3 + lean * 0.5, baseY - h * 0.6, x + w * 0.42, baseY - h * 0.2);
  c.quadraticCurveTo(x + w * 0.45, baseY - h * 0.08, x + w * 0.9, baseY);
  c.closePath();
  c.fill();
  const n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const t = 0.3 + r() * 0.6;
    const dir = r() < 0.5 ? -1 : 1;
    branch(c, r, x + lean * t, baseY - h * t, -Math.PI / 2 + dir * (0.55 + r() * 0.75), h * (0.1 + r() * 0.16), Math.max(1.2, w * 0.3 * (1 - t) + 1), 2);
  }
}

function hills(c, r, baseY, amp, color, w) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, H);
  let y = baseY;
  for (let x = 0; x <= w; x += 40) {
    y = baseY + Math.sin(x * 0.006 + r() * 0.5) * amp + (r() - 0.5) * amp * 0.4;
    c.lineTo(x, y);
  }
  c.lineTo(w, H);
  c.closePath();
  c.fill();
}

function fogBand(c, y0, y1, a) {
  const gr = c.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, 'rgba(214,219,216,0)');
  gr.addColorStop(0.55, `rgba(214,219,216,${a})`);
  gr.addColorStop(1, 'rgba(214,219,216,0)');
  c.fillStyle = gr;
  c.fillRect(0, y0, W, y1 - y0);
}

function makeBackground(scene) {
  canvasTex(scene, 'bg', W, H, (c, w, h) => {
    const r = rng(1337);
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#b4bbb7');
    sky.addColorStop(0.55, '#a0a8a4');
    sky.addColorStop(1, '#6a716e');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // pale light source, upper right
    const sun = c.createRadialGradient(w * 0.78, h * 0.12, 0, w * 0.78, h * 0.12, w * 0.6);
    sun.addColorStop(0, 'rgba(255,255,250,0.55)');
    sun.addColorStop(1, 'rgba(255,255,250,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);

    // far layer
    for (let i = 0; i < 14; i++) tree(c, r, r() * w, 470, 420 + r() * 200, 5 + r() * 7, '#939b98');
    hills(c, r, 450, 10, '#939b98', w);
    fogBand(c, 300, 520, 0.45);
    // mid layer
    for (let i = 0; i < 9; i++) tree(c, r, r() * w, 500, 480 + r() * 200, 9 + r() * 9, '#646b68');
    hills(c, r, 478, 12, '#646b68', w);
    fogBand(c, 360, 540, 0.35);
    // near layer
    for (let i = 0; i < 5; i++) tree(c, r, 40 + r() * (w - 80), 540, 560, 14 + r() * 12, '#3a403e');
    hills(c, r, 505, 10, '#3a403e', w);
    fogBand(c, 420, 540, 0.22);
  });
}

function makeForeground(scene) {
  canvasTex(scene, 'fg', W, H, (c, w) => {
    const r = rng(99);
    c.strokeStyle = '#040505';
    c.fillStyle = '#040505';
    c.lineCap = 'round';
    const hang = (x0, dir) => {
      // heavy branch reaching in from the corner
      c.lineWidth = 16;
      c.beginPath();
      c.moveTo(x0 - dir * 30, -10);
      c.quadraticCurveTo(x0 + dir * 120, 40, x0 + dir * 300, 14);
      c.stroke();
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(x0 + dir * 150, 30);
      c.quadraticCurveTo(x0 + dir * 210, 60, x0 + dir * 250, 54);
      c.stroke();
      // vines and leaves
      for (let i = 0; i < 16; i++) {
        const t = r();
        const x = x0 + dir * (20 + t * 270);
        const y = 30 - t * 14 + Math.sin(t * 3) * 10;
        const len = 20 + r() * 80;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + (r() - 0.5) * 14, y + len * 0.5, x + (r() - 0.5) * 10, y + len);
        c.stroke();
        c.beginPath();
        c.ellipse(x + (r() - 0.5) * 10, y + len, 3 + r() * 3, 6 + r() * 4, r() * 3, 0, Math.PI * 2);
        c.fill();
      }
    };
    hang(0, 1);
    hang(w, -1);
  });
}
