// One step of the chapter's rules: the boy, boxes, traps, the rope and the hound. No Phaser, so the puzzles can
// be played by a script in Node. The scene turns the events into sound and dust.
import {
  STEP, CHECKPOINTS, KILL_Y, WATER_Y, DROWN_DEPTH, makeBoy, stepBoy, makeBoxes, stepBoxes, makeTraps, stepTraps, surfaceY,
} from './world.js';
import { makeRopes, stepRopes, tryGrabRope, hangForces, hangPlace } from './life.js';
import { makeHound, stepHound } from './hazards.js';

export function makePlay(x = CHECKPOINTS[0]) {
  return { boy: makeBoy(x), boxes: makeBoxes(), traps: makeTraps(), hound: makeHound(), ropes: makeRopes(), cp: 0, dead: null, wet: false };
}

// Back to a checkpoint with every puzzle as it started.
export function resetPlay(P, x) {
  Object.assign(P.boy, makeBoy(x));
  P.boxes = makeBoxes();
  P.traps = makeTraps();
  P.hound = makeHound();
  P.ropes = makeRopes();
  P.dead = null;
  P.wet = false;
}

// Returns the step's events: 'grab-rope', 'release', 'ledge', 'climb', 'stand', 'drop', 'box-trap', 'trap',
// 'splash', 'drown', 'wake', 'lunge', 'trapped', 'caught' (by the hound).
export function stepPlay(P, inp, t) {
  const b = P.boy, ev = [];
  while (P.cp < CHECKPOINTS.length - 1 && b.x > CHECKPOINTS[P.cp + 1]) P.cp++;
  stepBoxes(P.boxes, STEP);
  if (b.hang) {
    hangForces(b, inp, STEP);
    stepRopes(P.ropes, STEP, t, b);
    if (hangPlace(b, inp, STEP) === 'release') ev.push('release');
    // swung into the ground: let go and stand
    if (b.hang && b.y + b.h > surfaceY(b.x + b.w / 2) + 4) { b.hang = null; b.cool = 0.4; }
  } else {
    if (!P.dead) { stepBoy(b, inp, STEP, P.boxes); if (b.event) ev.push(b.event); }
    stepRopes(P.ropes, STEP, t, b);
    if (!P.dead && tryGrabRope(P.ropes, b)) ev.push('grab-rope');
  }

  const before = P.traps.map((x) => x.sprung);
  const hit = stepTraps(P.traps, b, P.boxes, STEP);
  P.traps.forEach((x, i) => { if (x.sprung === 'box' && !before[i]) ev.push('box-trap'); });
  if (hit && !P.dead) { b.vx = 0; b.grab = null; P.dead = 'trap'; ev.push('trap'); }
  if (!P.wet && b.y + b.h > WATER_Y) { P.wet = true; ev.push('splash'); }
  if (!P.dead && (b.y + b.h > WATER_Y + DROWN_DEPTH || b.y > KILL_Y - b.h)) { P.dead = 'drown'; ev.push('drown'); }
  const h = stepHound(P.hound, STEP, b, P.traps);
  if (h === 'caught') { if (!P.dead) { P.dead = 'hound'; ev.push('caught'); } } else if (h) ev.push(h);
  return ev;
}
