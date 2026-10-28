// Scripted dives for Tether. Run: node tests/tether.test.mjs
import { Dive, gear } from '../src/tether/sim.js';
import { BOAT_X, SURF } from '../src/tether/world.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const base = { hose: 0, tank: 0, winch: 0 };

// steer toward a point for up to n steps
function go(dive, tx, ty, n = 1200, reel = false, stopAt = 30) {
  for (let i = 0; i < n && dive.state === 'dive'; i++) {
    const dx = tx - dive.diver.x, dy = ty - dive.diver.y, d = Math.hypot(dx, dy);
    if (d < stopAt) return true;
    dive.step({ x: dx / d, y: dy / d, reel });
  }
  return false;
}
const wait = (dive, n, inp = {}) => { for (let i = 0; i < n && dive.state === 'dive'; i++) dive.step(inp); };

// 1. pays out as you swim, picks up reef coins, stable numbers
{
  const d = new Dive(base);
  ok(go(d, 820, 555), 'swims to a reef coin');
  ok(d.L > 300 && d.L <= gear(base).hoseMax, `hose paid out to ${d.L.toFixed(0)} px`);
  ok(d.sack.length >= 1, `picked up ${d.sack.length} item(s)`);
  ok(d.P.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'no NaNs');
}

// 2. can't swim past the hose length
{
  const d = new Dive(base);
  go(d, 2100, 700, 3000);
  wait(d, 300, { x: 1, y: 0 });
  const max = gear(base).hoseMax;
  let path = 0; for (let i = 0; i < d.P.length - 1; i++) path += Math.hypot(d.P[i + 1].x - d.P[i].x, d.P[i + 1].y - d.P[i].y);
  ok(d.L <= max + 0.01, `hose capped at ${d.L.toFixed(0)} / ${max}`);
  ok(path < max * 1.04, `hose path ${path.toFixed(0)} doesn't stretch past max`);
  ok(d.atMax, 'reports the hose at full length');
  ok(d.diver.x < 2100, `held back at x=${d.diver.x.toFixed(0)}`);
}

// 3. reeling along a clear path brings you home
{
  const d = new Dive(base);
  go(d, 900, 450);
  const v = d.value;
  wait(d, 2400, { reel: true });
  ok(d.state === 'docked', `reeled back to the boat (state ${d.state}, L ${d.L.toFixed(0)})`);
  ok(d.value === v, 'sack still full on the boat');
}

// 4. over the reef arch (slab 1530..1700, y 626..642), then back under it: the hose folds round the slab's
//    end and kinks once pulled tight; the tank drains; swimming back out clears it
const overAndUnder = (d) => { go(d, 1450, 560); go(d, 1770, 590); go(d, 1765, 690); go(d, 1600, 690, 600, false, 15); };
{
  const d = new Dive({ hose: 1, tank: 0, winch: 0 });
  overAndUnder(d);
  let kinked = false;
  for (let i = 0; i < 400 && d.state === 'dive'; i++) { d.step({ x: -0.2, y: 0.6 }); if (d.kinked) kinked = true; }
  ok(kinked, `hose kinks over the spire (fold ${(d.fold * 180 / Math.PI).toFixed(0)}°)`);
  const t0 = d.tank; wait(d, 120, { x: -0.2, y: 0.6 });
  ok(d.tank < gear({ hose: 1, tank: 0, winch: 0 }).tankMax, `tank drains while kinked (${t0.toFixed(1)} -> ${d.tank.toFixed(1)})`);
  // slacken: swim back out from under the arch
  go(d, 1760, 690, 300, false, 15); wait(d, 60);
  ok(!d.kinked, 'kink clears when the hose goes slack');
}

// 5. reeling while folded round the arch stalls instead of dragging you through the rock
{
  const d = new Dive({ hose: 1, tank: 4, winch: 0 });
  overAndUnder(d);
  let stalled = false, inside = false, py = d.diver.y;
  for (let i = 0; i < 900 && d.state === 'dive'; i++) {
    d.step({ reel: true });
    if (d.stalled) stalled = true;
    const x = d.diver.x, y = d.diver.y;
    if (x > 1530 && x < 1700 && py > 642 && y < 626) inside = true;   // jumped from under the slab to on top of it
    py = y;
  }
  ok(stalled, 'winch stalls on the snag');
  ok(!inside, `diver never passes through the slab (at ${d.diver.x.toFixed(0)},${d.diver.y.toFixed(0)})`);
}

// 6. the eel bites hose left lying by its hole
{
  const d = new Dive({ hose: 5, tank: 4, winch: 0 });
  go(d, 1900, 590, 3000); go(d, 2200, 720, 3000); go(d, 2400, 860, 3000);   // down the cliff to the wreck
  go(d, 2560, 590, 3000); go(d, 2830, 590, 3000);                            // over the mast
  go(d, 3000, 860, 3000); go(d, 3000, 1060, 3000);                            // in through the hole in the deck
  go(d, 3440, 1080, 3000);                                                     // to the breach by the eel
  wait(d, 600, { x: 0, y: 0 });
  ok(d.leaks.length >= 1, `eel bit the hose (${d.leaks.length} leak(s), diver at ${d.diver.x.toFixed(0)},${d.diver.y.toFixed(0)})`);
}

// 7. run out of air -> dead, sack lost
{
  const d = new Dive(base); d.kinked = true; d.tank = 0.05;
  d.leaks = [1, 2, 3, 4];
  wait(d, 20);
  ok(d.state === 'dead', 'drowns when the tank runs dry');
}

// 8. with the longest hose the idol and the logbook page at the bottom of the trench are reachable
{
  const d = new Dive({ hose: 5, tank: 4, winch: 0 });
  for (const [x, y] of [[1900, 590], [2200, 720], [2400, 860], [2560, 590], [3600, 590], [3880, 1100], [3960, 1600], [4250, 1500], [4600, 1650], [4680, 1720], [4760, 1730]]) go(d, x, y, 3000);
  ok(d.sack.some((i) => i.kind === 'idol') && d.sack.some((i) => i.kind === 'page'), `idol + page reached (L ${d.L.toFixed(0)}, at ${d.diver.x.toFixed(0)},${d.diver.y.toFixed(0)})`);
  // ...and the base hose doesn't get you to the wreck
  const e = new Dive(base);
  for (const [x, y] of [[1900, 590], [2200, 720], [2400, 860], [2560, 590], [2830, 590], [3000, 860], [3000, 1060]]) go(e, x, y, 2000);
  ok(!e.sack.some((i) => i.kind === 'crate'), `base hose stops short of the wreck (at ${e.diver.x.toFixed(0)},${e.diver.y.toFixed(0)})`);
}

// timing
{
  const d = new Dive({ hose: 5, tank: 0, winch: 0 });
  go(d, 2100, 760, 3000);
  const t = performance.now(); wait(d, 300, { x: 1, y: 0.3 });
  console.log(`info  ${((performance.now() - t) / 300).toFixed(2)} ms/step with ${d.P.length} links`);
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
