// Tether: textures painted in canvas once at boot, plus the diver silhouette.

const lerp = (a, b, t) => a + (b - a) * t;
export function mix(c1, c2, t) {
  t = Math.max(0, Math.min(1, t));
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t), g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t), b = lerp(c1 & 255, c2 & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function canvasTex(scene, key, w, h, paint) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  scene.textures.addCanvas(key, c);
}

export function makeTextures(scene) {
  // the helmet lamp: a soft cone pointing right from (0, h/2)
  canvasTex(scene, 't_cone', 640, 400, (x, w, h) => {
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const spread = 0.12 + (i / steps) * 0.42;
      const gr = x.createRadialGradient(0, h / 2, 0, 0, h / 2, w);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.beginPath(); x.moveTo(0, h / 2);
      x.lineTo(w, h / 2 - Math.tan(spread) * w); x.lineTo(w, h / 2 + Math.tan(spread) * w); x.closePath(); x.fill();
    }
  });
  canvasTex(scene, 't_glow', 128, 128, (x, w) => {
    const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, w);
  });
  canvasTex(scene, 't_vignette', 512, 288, (x, w, h) => {
    const gr = x.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, w * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  });
  canvasTex(scene, 't_grain', 256, 256, (x, w, h) => {
    const d = x.createImageData(w, h);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; }
    x.putImageData(d, 0, 0);
  });
  // a far whale, black, drawn once
  canvasTex(scene, 't_whale', 520, 160, (x) => {
    x.fillStyle = '#000';
    x.beginPath();
    x.moveTo(10, 80); x.bezierCurveTo(60, 20, 260, 18, 400, 60); x.bezierCurveTo(440, 70, 470, 58, 510, 20);
    x.lineTo(500, 80); x.lineTo(515, 140); x.bezierCurveTo(470, 100, 440, 96, 400, 100);
    x.bezierCurveTo(260, 140, 80, 130, 10, 80); x.fill();
    x.beginPath(); x.moveTo(170, 112); x.lineTo(150, 158); x.lineTo(215, 118); x.fill();
  });
}

// Diver silhouette: brass helmet, suit, tank on the back, lead boots.
// (x, y) centre, ang = heading (head points along it), side = which way he faces (±1), kick = 0..2π
export function drawDiver(g, x, y, ang, side, kick, ink = 0x000000) {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const vx = -uy * side, vy = ux * side;           // "front" of his body
  const P = (f, s) => ({ x: x + ux * f + vx * s, y: y + uy * f + vy * s });
  g.fillStyle(ink, 1);
  // torso
  g.fillPoints([P(8, -10), P(8, 10), P(-4, 12), P(-14, 9), P(-14, -9), P(-4, -12)], true);
  // tank on the back
  g.fillPoints([P(6, -10), P(6, -17), P(-10, -17), P(-10, -10)], true);
  // helmet + collar
  g.fillCircle(P(17, 0).x, P(17, 0).y, 13);
  g.fillPoints([P(10, -11), P(10, 11), P(5, 9), P(5, -9)], true);
  // legs: scissor kick
  const k = Math.sin(kick) * 7;
  g.lineStyle(7, ink, 1);
  for (const s of [1, -1]) {
    const hip = P(-13, 4 * s), knee = P(-24, 5 * s + k * s * 0.6), foot = P(-34, 4 * s + k * s);
    g.lineBetween(hip.x, hip.y, knee.x, knee.y); g.lineBetween(knee.x, knee.y, foot.x, foot.y);
    const b = P(-37, 4 * s + k * s);
    g.fillCircle(b.x, b.y, 5.5);
  }
  // arms reaching forward
  g.lineStyle(6, ink, 1);
  const sh = P(4, 8), hand = P(16 + Math.cos(kick) * 4, 15);
  g.lineBetween(sh.x, sh.y, hand.x, hand.y);
  const sh2 = P(3, -6), hand2 = P(12 - Math.cos(kick) * 4, 4);
  g.lineBetween(sh2.x, sh2.y, hand2.x, hand2.y);
  return P(19, 6);   // the faceplate
}

// The salvage boat at the surface: hull, wheelhouse, a davit with a pulley, one crewman on the pump.
export function drawBoat(g, x, sy, t) {
  const bob = Math.sin(t * 1.3) * 3, tilt = Math.sin(t * 0.9) * 0.025;
  const R = (dx, dy) => ({ x: x + dx * Math.cos(tilt) - dy * Math.sin(tilt), y: sy + bob + dx * Math.sin(tilt) + dy * Math.cos(tilt) });
  g.fillStyle(0x000000, 1);
  g.fillPoints([R(-170, -26), R(150, -26), R(190, -44), R(170, -8), R(120, 16), R(-140, 16), R(-176, -6)], true);
  g.fillPoints([R(-120, -26), R(-120, -78), R(-40, -78), R(-36, -26)], true);       // wheelhouse
  g.fillRect(R(-90, -96).x, R(-90, -96).y, 8, 20);                                  // stove pipe
  g.lineStyle(6, 0x000000, 1);
  const top = R(40, -120);
  g.lineBetween(R(0, -26).x, R(0, -26).y, top.x, top.y);                            // davit
  g.lineBetween(top.x, top.y, R(18, -26).x, R(18, -26).y);
  g.fillCircle(top.x, top.y, 7);
  // crewman at the pump, rocking
  const pump = Math.sin(t * 2.4);
  const hip = R(90, -50), head = R(92 + pump * 4, -82);
  g.lineStyle(9, 0x000000, 1); g.lineBetween(hip.x, hip.y, head.x, head.y + 8);
  g.fillCircle(head.x, head.y, 8);
  g.lineStyle(5, 0x000000, 1);
  const hand = R(112, -64 + pump * 8);
  g.lineBetween(head.x, head.y + 14, hand.x, hand.y);
  g.lineBetween(R(80, -26).x, R(80, -26).y, hip.x, hip.y); g.lineBetween(R(100, -26).x, R(100, -26).y, hip.x, hip.y);
  g.fillRect(R(108, -60).x, R(108, -60).y, 18, 34);                                  // pump
  return { pulley: top, lamp: R(-30, -60) };
}
