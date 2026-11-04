// Headless smoke test: runs the sim with no graphics to prove pathing, waves,
// gate, traps and physics work. Run: node tests/sim-test.mjs
import { Sim } from '../src/sim/sim.js';
import { W, idx, HOLE, SPAWN } from '../src/sim/map.js';
import { TICK_HZ } from '../src/config.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };

// 1. Spawn is connected to the hole.
const s = new Sim({ seed: 7 });
const spawnTile = idx(Math.floor(SPAWN.x), Math.floor(SPAWN.z));
ok(s.flow[spawnTile] < Infinity, `spawn reaches hole (cost ${s.flow[spawnTile].toFixed(1)})`);

// 2. Run a wave untouched: gate breaks, mice leak, lives drop.
s.addPlayer('p1');
s.command({ type: 'startWave' });
const ev = [];
for (let t = 0; t < TICK_HZ * 120 && s.phase !== 'lost'; t++) { s.step(); ev.push(...s.events); s.events.length = 0; }
ok(ev.some(e => e.t === 'gateBreak'), 'gate breaks from mouse chewing');
ok(ev.some(e => e.t === 'leak'), 'mice reach the kitchen hole');
ok(s.lives < 20, `lives dropped to ${s.lives}`);

// 3. Barricades reroute: seal a lane and the route cost goes up but stays finite.
const s2 = new Sim({ seed: 3 }); s2.addPlayer('p1'); s2.coins = 99999;
const before = s2.flow[spawnTile];
// Seal the west lane between the castle wall and the stables (default route).
for (let x = 4; x <= 10; x++) s2.command({ type: 'place', id: 'p1', trap: 'barricade', tile: idx(x, 12) });
s2.step();
ok(s2.flow[spawnTile] > before, `barricades change the route (${before.toFixed(1)} -> ${s2.flow[spawnTile].toFixed(1)})`);
// Fully seal the west corridor AND everything: still finite (they chew through).
for (let x = 4; x <= 43; x++) s2.command({ type: 'place', id: 'p1', trap: 'barricade', tile: idx(x, 32) });
s2.step();
ok(s2.flow[spawnTile] < Infinity, 'full seal still has a chew-through route');

// 4. Flipper launches a mouse into the moat -> drowns.
const s3 = new Sim({ seed: 5 }); s3.addPlayer('p1'); s3.coins = 9999; s3.gate.up = false; s3.flowDirty = true;
s3.command({ type: 'place', id: 'p1', trap: 'flipper', tile: idx(22, 38), dir: 1 }); // on bridge, launch west
s3.step();
s3.spawnMouse('mouse', 1); const m = s3.mice[0]; m.x = 22.5; m.z = 38.5;
const ev3 = [];
for (let t = 0; t < TICK_HZ * 3; t++) { s3.step(); ev3.push(...s3.events); s3.events.length = 0; }
ok(ev3.some(e => e.t === 'kill' && e.drowned), 'flipped mouse drowns in moat');

// 5. Wall grinder / zapper placement rules.
const s4 = new Sim({ seed: 1 }); s4.addPlayer('p1'); s4.coins = 9999;
ok(s4.canPlace('grinder', idx(10, 10)), 'grinder allowed beside stables');
ok(!s4.canPlace('grinder', idx(24, 30)), 'grinder refused in open courtyard');
ok(s4.canPlace('zapper', idx(4, 20)), 'zapper allowed under wall walkway');
ok(!s4.canPlace('zapper', idx(24, 30)), 'zapper refused in open air');

// 6. Full 24-wave run with a strong defence finishes (win or loss) without crashing.
const s5 = new Sim({ seed: 11 }); s5.addPlayer('p1'); s5.coins = 1e6;
for (let x = 18; x <= 30; x++) for (let z = 44; z <= 60; z += 2) s5.command({ type: 'place', id: 'p1', trap: 'mousetrap', tile: idx(x, z) });
for (let z = 22; z <= 33; z++) s5.command({ type: 'place', id: 'p1', trap: 'grinder', tile: idx(4, z) });
let steps = 0;
while (s5.phase !== 'won' && s5.phase !== 'lost' && steps < TICK_HZ * 60 * 60) {
  if (s5.phase === 'build') s5.command({ type: 'startWave' });
  s5.step(); s5.events.length = 0; steps++;
}
ok(s5.phase === 'won' || s5.phase === 'lost', `long run ended without crashing: ${s5.phase} at wave ${s5.wave}, lives ${s5.lives}, kills ${s5.stats.kills}`);
if (s5.rating) console.log('rating', JSON.stringify(s5.rating));

// 7. Cat physics: double jump goes higher than a single jump; wall kick works;
//    cat can stand on a building roof; water kills the cat (-3 lives).
{
  const peak = (double) => {
    const s = new Sim({ seed: 2 }); const c = s.addPlayer('p1'); c.x = 24.5; c.z = 50.5;
    let top = 0;
    for (let t = 0; t < 60; t++) {
      const jump = t === 0 || (double && t === 12);
      s.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump, claw: false }); s.step(); top = Math.max(top, c.y);
    }
    return top;
  };
  const one = peak(false), two = peak(true);
  ok(two > one + 0.8, `double jump higher (${one.toFixed(2)} -> ${two.toFixed(2)})`);
  const s = new Sim({ seed: 2 }); const c = s.addPlayer('p1'); c.x = 23; c.z = 11.5;   // stables east face is x=22
  const ev = [];
  for (let t = 0; t < 40; t++) {
    s.command({ type: 'input', id: 'p1', mx: -1, mz: 0, yaw: 0, jump: t === 2 || t === 10, claw: false }); s.step(); ev.push(...s.events); s.events.length = 0;
  }
  ok(ev.some(e => e.t === 'wallkick'), 'wall kick off the stables');
  const s2 = new Sim({ seed: 2 }); const c2 = s2.addPlayer('p1'); c2.x = 24.5; c2.z = 38.5;  // bridge
  for (let t = 0; t < 40; t++) { s2.command({ type: 'input', id: 'p1', mx: 1, mz: 0, yaw: 0, jump: false, claw: false }); s2.step(); }
  ok(!c2.alive && s2.lives === 17, `walking off the bridge drowns Fred (lives ${s2.lives})`);
  // Claw kills a mouse and it drops cheese that Fred picks up.
  const s3 = new Sim({ seed: 2 }); const c3 = s3.addPlayer('p1'); c3.x = 24.5; c3.z = 50.5; c3.yaw = 0;
  s3.spawnMouse('mouse', 1); const m = s3.mice[0]; m.x = 24.5; m.z = 51.5;
  for (let t = 0; t < 60; t++) { s3.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump: false, claw: true }); s3.step(); }
  if (s3.cheese[0]) { c3.x = s3.cheese[0].x; c3.z = s3.cheese[0].z; s3.step(); }   // walk over the drop
  ok(m.dead && c3.cheese >= 1, `claw kills mouse and cheese is picked up (cheese ${c3.cheese})`);
  // Selling at the stall.
  c3.x = 5.2; c3.z = 9.5; const before = s3.coins; s3.command({ type: 'sellCheese', id: 'p1' });
  ok(s3.coins > before && c3.cheese === 0, `selling at the stall pays coins (${before} -> ${s3.coins})`);
}
process.exit(fails ? 1 : 0);
