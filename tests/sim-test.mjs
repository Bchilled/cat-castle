// Headless rules tests: runs the sim with no graphics.
// Run: node tests/sim-test.mjs
import { Sim } from '../src/sim/sim.js';
import { W, CELL, idx, STALLS } from '../src/sim/map.js';
import { nextCell } from '../src/sim/path.js';
import { TICK_HZ } from '../src/config.js';
import { buildWave } from '../src/sim/waves.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const q = (w) => Math.floor(w / CELL);
const run = (s, secs, input) => { const ev = []; for (let t = 0; t < TICK_HZ * secs; t++) { if (input) input(t); s.step(); ev.push(...s.events); s.events.length = 0; } return ev; };
const inp = (s, id, o = {}) => s.command({ type: 'input', id, mx: 0, mz: 0, yaw: 0, ...o });

// 1. Routes exist for normal and big mice; the default route uses the tunnel.
const s = new Sim({ seed: 7 });
ok(s.flow[s.spawnCell] < Infinity, `spawn reaches exit (cost ${s.flow[s.spawnCell].toFixed(1)})`);
ok(s.flowBig[s.spawnCell] < Infinity, 'big bosses also have a route');
ok(s.route().some(([x, z]) => x > 22 && x < 26 && z > 35 && z < 44), 'route runs through the gatehouse tunnel');

// 2. Untouched wave: board gate gets chewed down, mice leak, lives drop.
s.addPlayer('p1', 'fred');
s.command({ type: 'startWave' });
const ev = run(s, 150);
ok(ev.some(e => e.t === 'gateBreak'), 'gate breaks from mouse chewing');
ok(ev.some(e => e.t === 'leak'), 'mice reach the exit');

// 3. Barricades reroute; sealing the only tunnel is refused.
{
  const s2 = new Sim({ seed: 3 }); s2.addPlayer('p1'); s2.sardines = 1e6;
  const route = s2.route(); const target = route.find(([x, z]) => z > 8 && z < 20);   // in a yard lane
  s2.command({ type: 'place', id: 'p1', trap: 'barricade', ax: q(target[0]) - 1, az: q(target[1]), rot: 0 });
  s2.step();
  const b = [...s2.traps.values()][0];
  ok(b && !s2.route().some(([x, z]) => b.cells.includes(idx(q(x), q(z)))), 'mice reroute around a barricade on their path');
  const evs = [];
  for (let x = q(22); x < q(26); x += 2) { s2.command({ type: 'place', id: 'p1', trap: 'barricade', ax: x, az: q(38) }); evs.push(...s2.events); s2.events.length = 0; }
  ok(evs.some(e => e.text === 'Leave them a way through'), 'sealing the tunnel is refused');
}

// 4. Flipper on the branch flings a mouse into the moat -> drowns.
{
  const s3 = new Sim({ seed: 5 }); s3.addPlayer('p1'); s3.sardines = 9999; s3.gate.up = false; s3.flowDirty = true;
  s3.command({ type: 'place', id: 'p1', trap: 'flipper', ax: q(23), az: q(52), rot: 1 });
  ok(s3.traps.size === 1, 'flipper placed on the branch');
  s3.step(); s3.spawnMouse('mouse', 1); const m = s3.mice[0]; m.x = 23.5; m.z = 52.5;
  ok(run(s3, 3).some(e => e.t === 'kill' && e.drowned), 'flipped mouse drowns in the moat');
}

// 5. Trap surfaces: the tunnel takes ceiling and wall traps, the open yard doesn't.
{
  const s4 = new Sim({ seed: 1 }); s4.addPlayer('p1');
  ok(!!s4.canPlace('zapper', q(24), q(40)), 'zapper fits in the tunnel roof');
  ok(!s4.canPlace('zapper', q(24), q(27)), 'zapper refused in open air');
  ok(!!s4.canPlace('grinder', q(22), q(40), 0, 1), 'grinder fits on the tunnel wall');
  ok(!s4.canPlace('grinder', q(24), q(27), 0, 1), 'grinder refused away from walls');
  ok(!!s4.canPlace('zapper', q(12), q(16)), 'zapper fits under the long bench');
}

// 6. Jumps: Fred double-jumps; Puddin's charged leap beats his tap; wall kicks can't climb forever.
{
  const s5 = new Sim({ seed: 2 }); const f = s5.addPlayer('f', 'fred'); const p = s5.addPlayer('p', 'puddin');
  f.x = 30; f.z = 27; p.x = 36; p.z = 27; let tf = 0, tp = 0;
  run(s5, 2, (t) => { inp(s5, 'f', { jump: t === 0 || t === 12 }); inp(s5, 'p', { jumpHeld: t === 0 }); tf = Math.max(tf, f.y); tp = Math.max(tp, p.y); });
  const s6 = new Sim({ seed: 2 }); const p2 = s6.addPlayer('p', 'puddin'); p2.x = 36; p2.z = 27; let tc = 0;
  run(s6, 2.5, (t) => { inp(s6, 'p', { jumpHeld: t < 24 }); tc = Math.max(tc, p2.y); });
  ok(tf > tp + 0.8, `Fred double-jumps higher than Puddin's tap (${tf.toFixed(2)} vs ${tp.toFixed(2)})`);
  ok(tc > tp + 1, `Puddin's charged leap goes higher (${tc.toFixed(2)})`);
  const s7 = new Sim({ seed: 2 }); const c = s7.addPlayer('f', 'fred'); c.x = 2; c.z = 2.5; let top = 0;   // corner under the arch? use open corner
  c.x = 45.5; c.z = 30.5;   // inside corner by the yard wall / east wall... spam jump into the wall
  run(s7, 4, (t) => { inp(s7, 'f', { mx: 1, jump: t % 3 === 0 }); top = Math.max(top, c.y); });
  ok(top < 6, `wall kicks can't climb out (peak ${top.toFixed(2)})`);
}

// 7. Walking off the branch drowns (−3 lives).
{
  const s8 = new Sim({ seed: 2 }); const c = s8.addPlayer('p1'); c.x = 24; c.z = 53;
  run(s8, 2, () => inp(s8, 'p1', { mx: 1 }));
  ok(!c.alive && s8.lives === 17, `walking off the branch drowns the cat (lives ${s8.lives})`);
}

// 8. Fred's pellets kill with bleed; tails drop, get picked up and traded.
{
  const s9 = new Sim({ seed: 2 }); const c = s9.addPlayer('p1', 'fred'); c.x = 36; c.z = 9;
  s9.spawnMouse('mouse', 1); const m = s9.mice[0]; m.x = 36; m.z = 14; m.state = 'stuck'; m.stuckT = 99;
  run(s9, 3, () => inp(s9, 'p1', { primary: true, aim: { x: m.x, y: 0.2, z: m.z } }));
  ok(m.dead, 'pellets kill a mouse');
  if (s9.tails[0]) { c.x = s9.tails[0].x; c.z = s9.tails[0].z; s9.step(); }
  ok(c.tails >= 1, `tail picked up (${c.tails})`);
  c.x = STALLS[1].sell[0]; c.z = STALLS[1].sell[1]; const b = s9.sardines; s9.command({ type: 'sellTails', id: 'p1' });
  ok(s9.sardines > b, `tails traded for sardines (${b} -> ${s9.sardines})`);
}

// 9. Puddin's bite: a killing bite eats the mouse (heals, no tail).
{
  const s10 = new Sim({ seed: 2 }); const p = s10.addPlayer('p1', 'puddin'); p.x = 36; p.z = 9; p.hp = 100;
  s10.spawnMouse('mouse', 1); const m = s10.mice[0]; m.x = 36; m.z = 9.9; m.state = 'stuck'; m.stuckT = 99;
  const ev = run(s10, 2, () => inp(s10, 'p1', { primary: true }));
  ok(ev.some(e => e.t === 'eat') && p.hp > 100 && s10.tails.length === 0, `bite eats the mouse and heals (hp ${p.hp.toFixed(0)})`);
}

// 10. Hairball fires even with no aim point, splashes and slows; pounce stuns.
{
  const s11 = new Sim({ seed: 2 }); const c = s11.addPlayer('p1', 'fred'); c.x = 36; c.z = 9; c.yaw = 0;
  for (let k = 0; k < 3; k++) s11.spawnMouse('mouse', 1);
  s11.mice.forEach((m, k) => { m.x = 36 + k * 0.3; m.z = 14; m.state = 'stuck'; m.stuckT = 99; });
  run(s11, 2, (t) => inp(s11, 'p1', { secondary: t === 0, aim: { x: 36.3, y: 0, z: 14 } }));
  ok(s11.mice.filter(m => m.hp < m.maxHp && m.slowT > 0).length >= 2, 'hairball splash hits and slows several mice');
  const s12 = new Sim({ seed: 2 }); const p = s12.addPlayer('p1', 'puddin'); p.x = 36; p.z = 9;
  s12.spawnMouse('tank', 1); const m = s12.mice[0]; m.x = 36; m.z = 13; m.state = 'stuck'; m.stuckT = 99;
  run(s12, 1.5, (t) => inp(s12, 'p1', { secondary: t === 0, aim: { x: 36, y: 0, z: 13 } }));
  ok(m.hp < m.maxHp && (m.stunT > 0 || m.dead), 'pounce lands, hurts and stuns');
}

// 11. Packs + collisions: waves come in mobs; a crowd spreads out instead of stacking.
{
  const w = buildWave(5, () => 0.5, false);
  ok(w.queue.filter(e => e.gap < 0.1).length > 10, 'wave spawns in packs');
  const s13 = new Sim({ seed: 4 }); s13.gate.up = false; s13.flowDirty = true;
  for (let k = 0; k < 20; k++) { s13.spawnMouse('mouse', 1); const m = s13.mice[k]; m.x = 24; m.z = 27; }
  for (let t = 0; t < 20; t++) { s13.buildMouseGrid(); for (const m of s13.mice) s13.stepMouse(m); }
  let minD = 9; for (let a = 0; a < 20; a++) for (let b = a + 1; b < 20; b++) minD = Math.min(minD, Math.hypot(s13.mice[a].x - s13.mice[b].x, s13.mice[a].z - s13.mice[b].z));
  ok(minD > 0.02, `mice push apart (closest pair ${minD.toFixed(3)})`);
  ok(s13.mice.some(m => m.packed), 'packed mice get the strength-in-numbers buff');
}

// 12. Refunds.
{
  const s14 = new Sim({ seed: 2 }); s14.addPlayer('p1'); const start = s14.sardines;
  s14.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax: q(24), az: q(27) });
  s14.command({ type: 'sellTrap', id: 'p1', cell: idx(q(24), q(27)) });
  ok(s14.sardines === start, 'full refund on sell');
}

// 13. Long run with swarms: no crashes.
{
  const s15 = new Sim({ seed: 11 }); s15.addPlayer('p1'); s15.sardines = 1e6;
  for (let z = q(32); z < q(44); z += 2) s15.command({ type: 'place', id: 'p1', trap: 'grinder', ax: q(22), az: z, wallDir: 1 });
  for (let z = q(32); z < q(44); z += 2) s15.command({ type: 'place', id: 'p1', trap: 'zapper', ax: q(24), az: z });
  let steps = 0, maxMice = 0; const t0 = Date.now();
  while (s15.phase !== 'won' && s15.phase !== 'lost' && steps < TICK_HZ * 60 * 40) {
    if (s15.phase === 'build') s15.command({ type: 'startWave' });
    s15.step(); s15.events.length = 0; steps++; maxMice = Math.max(maxMice, s15.mice.length);
  }
  ok(s15.phase === 'won' || s15.phase === 'lost', `long run ended: ${s15.phase} at wave ${s15.wave}, kills ${s15.stats.kills}, peak ${maxMice} mice, ${((Date.now() - t0) / steps).toFixed(2)} ms/tick`);
}
process.exit(fails ? 1 : 0);
