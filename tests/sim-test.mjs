// Headless rules tests: runs the sim with no graphics.
// Run: node tests/sim-test.mjs
import { Sim } from '../src/sim/sim.js';
import { W, H, CELL, idx, cellOf, SPAWN, GATE, BRIDGE, FURNITURE } from '../src/sim/map.js';
import { TICK_HZ, CATS } from '../src/config.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const cx = (wx) => Math.floor(wx / CELL), cz = cx;
const run = (s, secs, input) => { const ev = []; for (let t = 0; t < TICK_HZ * secs; t++) { if (input) input(t); s.step(); ev.push(...s.events); s.events.length = 0; } return ev; };

// 1. Spawn connects to the exit for both normal and big mice.
const s = new Sim({ seed: 7 });
ok(s.flow[s.spawnCell] < Infinity, `spawn reaches exit (cost ${s.flow[s.spawnCell].toFixed(1)})`);
ok(s.flowBig[s.spawnCell] < Infinity, 'big bosses also have a route');

// 2. Untouched wave: book gate gets chewed down, mice leak, lives drop.
s.addPlayer('p1', 'fred');
s.command({ type: 'startWave' });
const ev = run(s, 150);
ok(ev.some(e => e.t === 'gateBreak'), 'gate breaks from mouse chewing');
ok(ev.some(e => e.t === 'leak'), 'mice reach the exit');
ok(s.lives < 20, `lives dropped to ${s.lives}`);

// 3. Barricades: route changes; sealing every route is refused.
const s2 = new Sim({ seed: 3 }); s2.addPlayer('p1'); s2.sardines = 1e6;
// Drop a barricade right on the mice's current route; the route must move off it.
{
  const { nextCell } = await import('../src/sim/path.js');
  const trace = () => { const out = []; let i = s2.spawnCell; for (let k = 0; k < 3000 && i >= 0; k++) { out.push(i); i = nextCell(s2.map, s2.flow, i, s2.passSmall, s2.isBlocker); } return out; };
  const route = trace(); const target = route.find(i => ((i / W) | 0) * CELL < 30 && ((i / W) | 0) * CELL > 20);
  s2.command({ type: 'place', id: 'p1', trap: 'barricade', ax: target % W, az: (target / W) | 0, rot: 0 });
  s2.step();
  const b = [...s2.traps.values()][0];
  ok(b && !trace().some(i => b.cells.includes(i)), 'mice reroute around a barricade on their path');
}
// Try sealing the whole hall across z = 20.
const evs = [];
for (let x = cx(1); x < cx(47); x += 2) { s2.command({ type: 'place', id: 'p1', trap: 'barricade', ax: x, az: cz(20), rot: 0 }); evs.push(...s2.events); s2.events.length = 0; }
s2.step();
ok(evs.some(e => e.text === 'Leave them a way through'), 'full seal refused');
ok(s2.flow[s2.spawnCell] < Infinity, 'route still open after seal attempt');

// 4. Flipper on the yardstick launches a mouse into the drain -> drowns.
const s3 = new Sim({ seed: 5 }); s3.addPlayer('p1'); s3.sardines = 9999; s3.gate.up = false; s3.flowDirty = true;
s3.command({ type: 'place', id: 'p1', trap: 'flipper', ax: cx(23), az: cz(51), rot: 1 });   // rot 1 -> launches -x
ok(s3.traps.size === 1, 'flipper placed on the bridge');
s3.step();
s3.spawnMouse('mouse', 1); const m = s3.mice[0]; m.x = 23.5; m.z = 51.5;
const ev3 = run(s3, 3);
ok(ev3.some(e => e.t === 'kill' && e.drowned), 'flipped mouse drowns in the drain');

// 5. Placement surfaces.
const s4 = new Sim({ seed: 1 }); s4.addPlayer('p1');
ok(!!s4.canPlace('zapper', cx(18), cz(13)), 'zapper fits under the side table');
ok(!s4.canPlace('zapper', cx(8), cz(25)), 'zapper refused in the open');
ok(!!s4.canPlace('grinder', cx(29.5), cz(9), 0, 0), 'grinder fits on the blanket chest side');
ok(!s4.canPlace('grinder', cx(8), cz(25), 0, 0), 'grinder refused away from walls');
ok(!s4.canPlace('barricade', cx(23), cz(51.5)) === false, 'barricade allowed on the bridge');

// 6. Cats: Fred double jumps higher than Puddin can jump; Puddin has no air jump.
const peak = (kind) => {
  const s = new Sim({ seed: 2 }); const c = s.addPlayer('p1', kind); c.x = 8; c.z = 25; let top = 0;
  run(s, 2, (t) => s.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump: t === 0 || t === 12, claw: false }));
  return s.cats.get('p1').maxY || top;
};
{
  const s = new Sim({ seed: 2 }); const f = s.addPlayer('f', 'fred'); const p = s.addPlayer('p', 'puddin');
  f.x = 8; f.z = 25; p.x = 10; p.z = 25; let tf = 0, tp = 0;
  run(s, 2, (t) => { for (const id of ['f', 'p']) s.command({ type: 'input', id, mx: 0, mz: 0, yaw: 0, jump: t === 0 || t === 12, claw: false }); tf = Math.max(tf, f.y); tp = Math.max(tp, p.y); });
  ok(tf > tp + 0.8, `Fred double-jumps higher than Puddin (${tf.toFixed(2)} vs ${tp.toFixed(2)})`);
}
// Walking off the yardstick drowns the cat (-3 lives).
{
  const s = new Sim({ seed: 2 }); const c = s.addPlayer('p1'); c.x = 24; c.z = 51.5;
  run(s, 2, () => s.command({ type: 'input', id: 'p1', mx: 1, mz: 0, yaw: 0 }));
  ok(!c.alive && s.lives === 17, `walking off the bridge drowns the cat (lives ${s.lives})`);
}
// Fred can walk under the side table; head bonks the underside when jumping.
{
  const s = new Sim({ seed: 2 }); const c = s.addPlayer('p1'); c.x = 18; c.z = 13; let top = 0;
  run(s, 1, (t) => { s.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump: t === 0 }); top = Math.max(top, c.y); });
  ok(top <= 2.4 - 0.95 + 0.01, `head bumps the table underside (peak ${top.toFixed(2)})`);
}

// 7. Claw + bite kill a mouse, cheese drops and gets sold at a stash.
{
  const s = new Sim({ seed: 2 }); const c = s.addPlayer('p1'); c.x = 8; c.z = 25;
  s.spawnMouse('mouse', 1); const m = s.mice[0]; m.x = 8; m.z = 25.8;
  const ev = run(s, 2, () => s.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, claw: true }));
  ok(m.dead, 'claw kills a mouse');
  ok(ev.some(e => e.t === 'bite'), 'every third hit is a bite');
  if (s.cheese[0]) { c.x = s.cheese[0].x; c.z = s.cheese[0].z; s.step(); }
  ok(c.cheese >= 1, `cheese picked up (${c.cheese})`);
  c.x = 3.6; c.z = 8.5; const b = s.sardines; s.command({ type: 'sellCheese', id: 'p1' });
  ok(s.sardines > b, `cheese traded for sardines (${b} -> ${s.sardines})`);
}

// 8. Hairball splashes and slows; Puddin's pounce stuns.
{
  const s = new Sim({ seed: 2 }); const c = s.addPlayer('p1', 'fred'); c.x = 8; c.z = 22;
  for (let k = 0; k < 3; k++) s.spawnMouse('mouse', 1);
  s.mice.forEach((m, k) => { m.x = 8 + k * 0.4; m.z = 28; m.state = 'stuck'; m.stuckT = 99; });
  run(s, 2, (t) => s.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, fire: t === 0, aim: { x: 8.4, y: 0, z: 28 } }));
  ok(s.mice.filter(m => m.hp < m.maxHp).length >= 2, 'hairball splash hits several mice');
  ok(s.stats.abilitiesUsed === 1 && c.energy < 100, 'hairball spends energy');
  const s2 = new Sim({ seed: 2 }); const p = s2.addPlayer('p1', 'puddin'); p.x = 8; p.z = 22;
  s2.spawnMouse('tank', 1); const m = s2.mice[0]; m.x = 8; m.z = 26; m.state = 'stuck'; m.stuckT = 99;
  run(s2, 1.5, (t) => s2.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, pounce: t === 0, aim: { x: 8, y: 0, z: 26 } }));
  ok(m.hp < m.maxHp && (m.stunT > 0 || m.dead), `pounce lands, hurts and stuns (hp ${m.hp.toFixed(0)}/${m.maxHp})`);
}

// 9. Selling refunds full price; chewed barricade refunds by health.
{
  const s = new Sim({ seed: 2 }); s.addPlayer('p1'); const start = s.sardines;
  s.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax: cx(8), az: cz(25) });
  s.command({ type: 'sellTrap', id: 'p1', cell: idx(cx(8), cz(25)) });
  ok(s.sardines === start, 'full refund on sell');
  s.command({ type: 'place', id: 'p1', trap: 'barricade', ax: cx(8), az: cz(25) });
  const b = [...s.traps.values()][0]; b.hp = b.maxHp / 2;
  s.command({ type: 'sellTrap', id: 'p1', cell: idx(cx(8), cz(25)) });
  ok(s.sardines === start - 10, `half-chewed barricade refunds half (${s.sardines})`);
}

// 10. Trinkets: a boss always drops one; picking it up applies.
{
  const s = new Sim({ seed: 9 }); const c = s.addPlayer('p1'); c.x = 8; c.z = 25;
  s.spawnMouse('miniboss', 1); const m = s.mice[0]; m.x = 8; m.z = 26; s.killMouse(m, 'claw');
  ok(s.loot.length === 1, 'boss drops a trinket');
  c.x = s.loot[0].x; c.z = s.loot[0].z; s.step();
  ok(Object.values(s.trinkets).reduce((a, b) => a + b, 0) === 1, `trinket collected (${JSON.stringify(s.trinkets)})`);
}

// 11. Long run with swarms: no crashes, ends.
{
  const s = new Sim({ seed: 11 }); s.addPlayer('p1'); s.sardines = 1e6;
  for (let x = cx(3); x < cx(45); x += 3) for (let z = cz(56); z < cz(76); z += 3) s.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax: x, az: z });
  for (let x = cx(2); x < cx(46); x += 2) s.command({ type: 'place', id: 'p1', trap: 'tacks', ax: x, az: cz(47), rot: 1 });
  let steps = 0, maxMice = 0; const t0 = Date.now();
  while (s.phase !== 'won' && s.phase !== 'lost' && steps < TICK_HZ * 60 * 40) {
    if (s.phase === 'build') s.command({ type: 'startWave' });
    s.step(); s.events.length = 0; steps++; maxMice = Math.max(maxMice, s.mice.length);
  }
  ok(s.phase === 'won' || s.phase === 'lost', `long run ended: ${s.phase} at wave ${s.wave}, kills ${s.stats.kills}, peak ${maxMice} mice, ${((Date.now() - t0) / steps).toFixed(2)} ms/tick`);
}
process.exit(fails ? 1 : 0);
