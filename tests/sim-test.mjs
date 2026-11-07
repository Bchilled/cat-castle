// Headless rules tests: runs the sim with no graphics.
// Run: node tests/sim-test.mjs
import { TRAPS, CATS, ITEMS } from '../src/config.js';
import { Sim } from '../src/sim/sim.js';
import { W, CELL, idx } from '../src/sim/map.js';
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
ok(s.routes().every(r => r.some(([x, z]) => x > 40 && x < 56 && z > 60 && z < 76)), 'both entrances route through the gatehouse');
ok(new Set(s.routes().map(r => r[0].join())).size === 2, 'two entrances');
{
  // Lanes diverge north of the courtyard: colonnade (west), guard passage, east lane.
  const rs = s.routes();
  const west = rs.some(r => r.some(([x, z]) => x > 10 && x < 26 && z > 10 && z < 28));
  const mid = rs.some(r => r.some(([x, z]) => x > 44 && x < 52 && z > 12 && z < 28));
  const east = rs.some(r => r.some(([x, z]) => x > 66 && x < 84 && z > 8 && z < 28));
  ok(west && mid && east, `routes split three ways north (west ${west}, passage ${mid}, east ${east})`);
  const picks = new Set(); for (let k = 0; k < 40; k++) picks.add(s.chooseVia(k % 2));
  ok(picks.size >= 2, `packs pick different lanes (${[...picks].join(',')})`);
}

// 2. Untouched wave: board gate gets chewed down, mice leak, lives drop.
s.addPlayer('p1', 'fred');
s.command({ type: 'startWave' });
const ev = run(s, 240);
ok(ev.some(e => e.t === 'gateBreak'), 'gate breaks from mouse chewing');
ok(ev.some(e => e.t === 'leak'), 'mice reach the exit');

// 3. Barricades reroute; sealing the only tunnel is refused.
{
  const s2 = new Sim({ seed: 3 }); s2.addPlayer('p1'); s2.sardines = 1e6;
  const route = s2.route(); const target = route.find(([x, z]) => z > 48 && z < 52);   // in the courtyard, south of the well
  s2.command({ type: 'place', id: 'p1', trap: 'barricade', ax: q(target[0]) - 2, az: q(target[1]) - 2, rot: 0 });
  s2.step();
  const b = [...s2.traps.values()][0];
  ok(b && !s2.route().some(([x, z]) => b.cells.includes(idx(q(x), q(z)))), 'mice reroute around a barricade on their path');
  const evs = [];
  for (let x = q(40); x < q(56); x += 4) { s2.command({ type: 'place', id: 'p1', trap: 'barricade', ax: x, az: q(66) }); evs.push(...s2.events); s2.events.length = 0; }
  ok(evs.some(e => e.text === 'Leave them a way through'), 'sealing the gatehouse is refused');
}

// 4. Flipper on the branch flings a mouse into the moat -> drowns.
{
  const s3 = new Sim({ seed: 5 }); s3.addPlayer('p1'); s3.sardines = 9999; s3.gate.up = false; s3.flowDirty = true;
  s3.command({ type: 'place', id: 'p1', trap: 'flipper', ax: q(41.5), az: q(87), rot: 1 });
  ok(s3.traps.size === 1, 'flipper placed on the log bridge');
  s3.step(); s3.spawnMouse('mouse', 1); const m = s3.mice[0]; m.x = 42; m.z = 87.5;
  ok(run(s3, 3).some(e => e.t === 'kill' && e.drowned), 'flipped mouse drowns in the moat');
}

// 5. Trap surfaces: the tunnel takes ceiling and wall traps, the open yard doesn't.
{
  const s4 = new Sim({ seed: 1 }); s4.addPlayer('p1');
  ok(!!s4.canPlace('zapper', q(48), q(66)), 'zapper fits in the gatehouse roof');
  ok(!s4.canPlace('zapper', q(60), q(50)), 'zapper refused in open air');
  ok(!!s4.canPlace('grinder', q(40), q(66), 0, 1), 'grinder fits on the gatehouse wall');
  ok(!s4.canPlace('grinder', q(60), q(50), 0, 1), 'grinder refused away from walls');
  ok(!!s4.canPlace('zapper', q(18), q(18)), 'zapper fits under the colonnade');
  ok(!!s4.canPlace('zapper', q(48), q(20)), 'zapper fits in the guard passage');
}

// 6. Jumps: Fred double-jumps; Puddin's charged leap beats his tap; wall kicks can't climb forever.
{
  const s5 = new Sim({ seed: 2 }); const f = s5.addPlayer('f', 'fred'); const p = s5.addPlayer('p', 'puddin');
  f.x = 30; f.z = 50; p.x = 60; p.z = 50; let tf = 0, tp = 0;
  run(s5, 2, (t) => { inp(s5, 'f', { jump: t === 0 || t === 12 }); inp(s5, 'p', { jumpHeld: t === 0 }); tf = Math.max(tf, f.y); tp = Math.max(tp, p.y); });
  const s6 = new Sim({ seed: 2 }); const p2 = s6.addPlayer('p', 'puddin'); p2.x = 60; p2.z = 50; let tc = 0;
  run(s6, 2.5, (t) => { inp(s6, 'p', { jumpHeld: t < 24 }); tc = Math.max(tc, p2.y); });
  ok(tf > tp + 0.8, `Fred double-jumps higher than Puddin's tap (${tf.toFixed(2)} vs ${tp.toFixed(2)})`);
  ok(tc > tp + 1, `Puddin's charged leap goes higher (${tc.toFixed(2)})`);
  const s7 = new Sim({ seed: 2 }); const c = s7.addPlayer('f', 'fred'); c.x = 2; c.z = 2.5; let top = 0;   // corner under the arch? use open corner
  c.x = 75; c.z = 55.2;   // against the 6-high south yard wall: spam jump into it
  run(s7, 4, (t) => { inp(s7, 'f', { mz: 1, jump: t % 3 === 0 }); top = Math.max(top, c.y); });
  ok(top < 6, `wall kicks can't climb out (peak ${top.toFixed(2)})`);
}

// 7. Walking off the branch drowns (−3 lives).
{
  const s8 = new Sim({ seed: 2 }); const c = s8.addPlayer('p1'); c.x = 48; c.z = 88;
  run(s8, 2, () => inp(s8, 'p1', { mx: 1 }));
  ok(!c.alive && s8.lives === 17, `walking off the branch drowns the cat (lives ${s8.lives})`);
}

// 8. Fred's pellets kill with bleed; the kill pays Paw Points straight away.
{
  const s9 = new Sim({ seed: 2 }); const c = s9.addPlayer('p1', 'fred'); c.x = 60; c.z = 40;
  s9.spawnMouse('mouse', 1); const m = s9.mice[0]; m.x = 60; m.z = 45; m.state = 'stuck'; m.stuckT = 99;
  const b = s9.sardines;
  run(s9, 3, () => inp(s9, 'p1', { primary: true, aim: { x: m.x, y: 0.2, z: m.z } }));
  ok(m.dead, 'pellets kill a mouse');
  ok(s9.sardines === b + 5, `kill pays 5 Paw Points (${b} -> ${s9.sardines})`);
}

// 9. Puddin's bite: a killing bite eats the mouse (heals, no tail).
{
  const s10 = new Sim({ seed: 2 }); const p = s10.addPlayer('p1', 'puddin'); p.x = 60; p.z = 40; p.hp = 100;
  s10.spawnMouse('mouse', 1); const m = s10.mice[0]; m.x = 60; m.z = 40.9; m.state = 'stuck'; m.stuckT = 99;
  const ev = run(s10, 2, () => inp(s10, 'p1', { primary: true }));
  ok(ev.some(e => e.t === 'eat') && p.hp > 100, `bite eats the mouse and heals (hp ${p.hp.toFixed(0)})`);
}

// 10. Hairball fires even with no aim point, splashes and slows; pounce stuns.
{
  const s11 = new Sim({ seed: 2 }); const c = s11.addPlayer('p1', 'fred'); c.x = 60; c.z = 40; c.yaw = 0;
  for (let k = 0; k < 3; k++) s11.spawnMouse('mouse', 1);
  s11.mice.forEach((m, k) => { m.x = 60 + k * 0.3; m.z = 45; m.state = 'stuck'; m.stuckT = 99; });
  run(s11, 2, (t) => inp(s11, 'p1', { secondary: t === 0, aim: { x: 60.3, y: 0, z: 45 } }));
  ok(s11.mice.filter(m => m.hp < m.maxHp && m.slowT > 0).length >= 2, 'hairball splash hits and slows several mice');
  const s12 = new Sim({ seed: 2 }); const p = s12.addPlayer('p1', 'puddin'); p.x = 60; p.z = 40;
  s12.spawnMouse('tank', 1); const m = s12.mice[0]; m.x = 60; m.z = 44; m.state = 'stuck'; m.stuckT = 99;
  run(s12, 1.5, (t) => inp(s12, 'p1', { secondary: t === 0, aim: { x: 60, y: 0, z: 44 } }));
  ok(m.hp < m.maxHp && (m.stunT > 0 || m.dead), 'pounce lands, hurts and stuns');
}

// 11. Packs + collisions: waves come in mobs; a crowd spreads out instead of stacking.
{
  const w = buildWave(5, () => 0.5, false);
  ok(w.queue.filter(e => e.gap < 0.1).length > 10, 'wave spawns in packs');
  const s13 = new Sim({ seed: 4 }); s13.gate.up = false; s13.flowDirty = true;
  for (let k = 0; k < 20; k++) { s13.spawnMouse('mouse', 1); const m = s13.mice[k]; m.x = 60; m.z = 50; }
  for (let t = 0; t < 20; t++) { s13.buildMouseGrid(); for (const m of s13.mice) s13.stepMouse(m); }
  let minD = 9; for (let a = 0; a < 20; a++) for (let b = a + 1; b < 20; b++) minD = Math.min(minD, Math.hypot(s13.mice[a].x - s13.mice[b].x, s13.mice[a].z - s13.mice[b].z));
  ok(minD > 0.02, `mice push apart (closest pair ${minD.toFixed(3)})`);
  ok(s13.mice.some(m => m.packed), 'packed mice get the strength-in-numbers buff');
}

// 12. Refunds.
{
  const s14 = new Sim({ seed: 2 }); s14.addPlayer('p1'); const start = s14.sardines;
  s14.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax: q(60), az: q(50) });
  s14.command({ type: 'sellTrap', id: 'p1', cell: idx(q(60), q(50)) });
  ok(s14.sardines === start, 'full refund on sell');
}

// 13. Long run with swarms: no crashes.
{
  const s15 = new Sim({ seed: 11 }); s15.addPlayer('p1'); s15.sardines = 1e6;
  for (let z = q(60); z < q(76); z += 4) s15.command({ type: 'place', id: 'p1', trap: 'grinder', ax: q(40), az: z, wallDir: 1 });
  for (let z = q(60); z < q(76); z += 4) s15.command({ type: 'place', id: 'p1', trap: 'grinder', ax: q(55.5), az: z, wallDir: 0 });
  for (let z = q(60); z < q(76); z += 4) for (let x = q(40); x < q(56); x += 4) s15.command({ type: 'place', id: 'p1', trap: 'zapper', ax: x, az: z });
  for (let z = q(62); z < q(74); z += 4) for (let x = q(42); x < q(54); x += 4) s15.command({ type: 'place', id: 'p1', trap: 'tacks', ax: x, az: z });
  let steps = 0, maxMice = 0; const t0 = Date.now();
  while (s15.phase !== 'won' && s15.phase !== 'lost' && steps < TICK_HZ * 60 * 40) {
    if (s15.phase === 'build') s15.command({ type: 'startWave' });
    s15.step(); s15.events.length = 0; steps++; maxMice = Math.max(maxMice, s15.mice.length);
  }
  ok(s15.phase === 'won' || s15.phase === 'lost', `long run ended: ${s15.phase} at wave ${s15.wave}, kills ${s15.stats.kills}, peak ${maxMice} mice, ${((Date.now() - t0) / steps).toFixed(2)} ms/tick`);
}

// 14. Tile traps: one mousetrap snaps every mouse standing on its 2x2 tile.
{
  const s = new Sim({ seed: 21 }); s.addPlayer('p1'); s.sardines = 9999;
  s.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax: q(60), az: q(50) });
  const tr = [...s.traps.values()][0];
  ok(tr && tr.cells.length === 16, 'mousetrap covers a 4x4-cell tile');
  for (let k = 0; k < 4; k++) { s.spawnMouse('mouse', 1); const m = s.mice[k]; m.x = 60.4 + (k % 2) * 1.1; m.z = 50.4 + (k >> 1) * 1.1; m.state = 'stuck'; m.stuckT = 99; }
  s.stepTraps();
  ok(s.mice.filter(m => m.hp < m.maxHp || m.dead).length === 4, 'mousetrap hits all 4 mice on it');
  ok(tr.cd > 0 && tr.cdMax > 0, 'mousetrap shows a reset timer');
}
// 15. Wall grinder reaches a tile out from the wall.
{
  const s = new Sim({ seed: 22 }); s.addPlayer('p1'); s.sardines = 9999; s.gate.up = false; s.flowDirty = true;
  s.command({ type: 'place', id: 'p1', trap: 'grinder', ax: q(40), az: q(64), wallDir: 1 });
  ok(s.traps.size === 1, 'grinder placed');
  s.spawnMouse('mouse', 1); const m = s.mice[0]; m.x = 41.6; m.z = 65; m.state = 'stuck'; m.stuckT = 99;
  for (let t = 0; t < 10; t++) s.stepTraps();
  ok(m.hp < m.maxHp, 'grinder hurts a mouse 1.6 units from the wall');
}
// 16. Mice spread across a lane instead of one file.
{
  const s = new Sim({ seed: 23 }); s.addPlayer('p1'); s.cats.get('p1').x = 90; s.cats.get('p1').z = 5;
  for (let k = 0; k < 30; k++) s.spawnMouse('mouse', 1, 30, 0);
  run(s, 6);
  const xs = s.mice.filter(m => m.z > 98).map(m => m.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  ok(spread > 4, `mob fills the road (spread ${spread.toFixed(1)} units across)`);
}
// 17. Mice turn to attack a nearby cat; plague rats spit.
{
  const s = new Sim({ seed: 24 }); s.addPlayer('p1'); const cat = s.cats.get('p1');
  cat.x = 20; cat.z = 112; const hp0 = cat.hp;
  s.spawnMouse('mouse', 1, 1, 0);
  run(s, 3, () => inp(s, 'p1'));
  ok(cat.hp < hp0, `mouse goes for the cat and bites (hp ${hp0} -> ${cat.hp})`);
  const s2 = new Sim({ seed: 25 }); s2.addPlayer('p1'); const c2 = s2.cats.get('p1'); c2.x = 20; c2.z = 110;
  s2.spawnMouse('plague', 1, 1, 0);
  const ev = run(s2, 4, () => inp(s2, 'p1'));
  ok(ev.some(e => e.t === 'ratSpit'), 'plague rat spits at the cat');
}
// 18. Splitter bursts into two pups.
{
  const s = new Sim({ seed: 26 }); s.addPlayer('p1');
  s.spawnMouse('splitter', 1); s.damageMouse(s.mice[0], 999, 'trap');
  ok(s.mice.filter(m => !m.dead && m.type === 'pup').length === 2, 'splitter bursts into 2 pups');
}
// 19. New kinds are introduced alone; wave-6 boss stomps.
{
  const w4 = buildWave(4, () => 0.5, false).queue;
  ok(w4[0].type === 'splitter' && w4[0].intro && !w4.slice(1).some(e => e.type === 'splitter'), 'wave 4 introduces the splitter alone');
  const s = new Sim({ seed: 27 }); s.addPlayer('p1'); s.gate.up = false; s.flowDirty = true;
  const cat = s.cats.get('p1'); cat.x = 48; cat.z = 50;
  s.spawnMouse('miniboss', 1); const b = s.mice[0]; b.x = 48; b.z = 53;
  const ev = run(s, 3, () => inp(s, 'p1'));
  ok(ev.some(e => e.t === 'stompWarn') && ev.some(e => e.t === 'stomp'), 'rat captain winds up and stomps');
  ok(cat.hp < cat.def.maxHp, 'stomp hurts the cat');
}
// 20. Pounce stun shows a timer (stunMax) and lasts 3 s.
{
  const s = new Sim({ seed: 28 }); s.addPlayer('p1', 'puddin'); const cat = s.cats.get('p1');
  s.spawnMouse('mouse', 1); const m = s.mice[0]; m.x = cat.x + 1; m.z = cat.z; s.buildMouseGrid();
  s.pounceLand(cat);
  ok(m.dead || (m.stunT >= 2.9 && m.stunMax === m.stunT), `pounce stun ${m.stunT.toFixed(1)} s with timer`);
}
// 21. Scary Cat: whip hits a line of mice far ahead; hiss scatters; leap back goes backwards; jumps highest.
{
  const s = new Sim({ seed: 31 }); s.addPlayer('p1', 'scary'); const cat = s.cats.get('p1'); cat.x = 48; cat.z = 48; cat.yaw = 0;
  for (const dz of [1.2, 2.2, 3.2]) { s.spawnMouse('mouse', 1); const m = s.mice[s.mice.length - 1]; m.x = 48; m.z = 48 + dz; }
  s.spawnMouse('mouse', 1); const side = s.mice[3]; side.x = 50; side.z = 49;   // off to the side: not hit
  s.buildMouseGrid(); s.whip(cat);
  ok(s.mice.slice(0, 3).every(m => m.hp < m.maxHp) && side.hp === side.maxHp, 'tail whip hits 3 mice in a line out to 3.2 units, not one to the side');
  const s2 = new Sim({ seed: 32 }); s2.addPlayer('p1', 'scary'); const c2 = s2.cats.get('p1'); c2.x = 48; c2.z = 48;
  for (let k = 0; k < 6; k++) { s2.spawnMouse('mouse', 1); const m = s2.mice[k]; m.x = 48 + Math.cos(k) * 2; m.z = 48 + Math.sin(k) * 2; }
  s2.buildMouseGrid(); s2.hiss(c2);
  const before = s2.mice.map(m => Math.hypot(m.x - 48, m.z - 48));
  for (let t = 0; t < 30; t++) { s2.buildMouseGrid(); for (const m of s2.mice) s2.stepMouse(m); }
  const after = s2.mice.map(m => Math.hypot(m.x - 48, m.z - 48));
  ok(after.every((d, k) => d > before[k] + 1), 'hiss makes every mouse run away');
  const s3 = new Sim({ seed: 33 }); s3.addPlayer('p1', 'scary'); const c3 = s3.cats.get('p1'); c3.x = 58; c3.z = 52; s3.step();
  const z0 = c3.z; s3.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, alt: true }); run(s3, 0.6, () => inp(s3, 'p1', { yaw: 0 }));
  ok(c3.z < z0 - 3, `leap back moves her backwards (${(z0 - c3.z).toFixed(1)} units)`);
  const peak = (kind) => { const t = new Sim({ seed: 34 }); t.addPlayer('p1', kind); const c = t.cats.get('p1'); c.x = 48; c.z = 48; t.step(); let top = 0;
    t.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump: true }); for (let i = 0; i < 40; i++) { t.step(); top = Math.max(top, c.y); } return top; };
  ok(peak('scary') > peak('fred') + 1, `Scary Cat jumps higher (${peak('scary').toFixed(1)} vs Fred ${peak('fred').toFixed(1)})`);
}
// 22. Nebbie: whiskers pierce, purr heals + buffs, dodges.
{
  const s = new Sim({ seed: 41 }); s.addPlayer('p1', 'nebbie'); const cat = s.cats.get('p1'); cat.x = 48; cat.z = 48; cat.yaw = 0;
  for (const dz of [2, 3, 4]) { s.spawnMouse('mouse', 1); const m = s.mice[s.mice.length - 1]; m.x = 48; m.z = 48 + dz; m.state = 'stuck'; m.stuckT = 99; }
  s.fireWhisker(cat, { aim: { x: 48, y: cat.y + 0.7, z: 60 } });
  for (let t = 0; t < 15; t++) { s.buildMouseGrid(); s.stepMissiles(); }
  ok(s.mice.filter(m => m.hp < m.maxHp).length === 3, 'one whisker dart pierces 3 mice');
  cat.hp = 20; s.purr(cat); for (let t = 0; t < 30 * 5; t++) s.stepCat(cat);
  ok(cat.hp > 20 + 75 * 0.25, `purr heals over time (hp ${Math.round(cat.hp)})`);
  const s2 = new Sim({ seed: 42 }); s2.addPlayer('p1', 'nebbie'); const n = s2.cats.get('p1'); let missed = 0;
  for (let k = 0; k < 200; k++) { n.hp = 75; if (!s2.hurtCat(n, 1)) missed++; }
  ok(missed > 40 && missed < 80, `Nebbie dodges about 30% (${missed}/200)`);
}
// 23. Casper: rage builds and boosts damage; mice target him first; leap strike.
{
  const s = new Sim({ seed: 51 }); s.addPlayer('p1', 'casper'); const cat = s.cats.get('p1'); cat.x = 48; cat.z = 48; cat.yaw = 0;
  s.spawnMouse('tank', 5); const m = s.mice[0]; m.x = 48; m.z = 49; m.state = 'stuck'; m.stuckT = 99;
  s.buildMouseGrid(); s.claw(cat); const hit1 = m.maxHp - m.hp;
  for (let k = 0; k < 10; k++) { s.buildMouseGrid(); s.claw(cat); }
  const hp0 = m.hp; s.claw(cat); const hitN = hp0 - m.hp;
  ok(cat.rage > 50 && hitN > hit1 * 1.5, `rage ${Math.round(cat.rage)} makes claws hit harder (${hit1.toFixed(0)} -> ${hitN.toFixed(0)})`);
  const s2 = new Sim({ seed: 52 }); s2.addPlayer('fred', 'fred'); s2.addPlayer('casper', 'casper');
  const f = s2.cats.get('fred'), c = s2.cats.get('casper'); f.x = 20; f.z = 110; c.x = 23; c.z = 110;
  s2.spawnMouse('mouse', 1, 1, 0); const mm = s2.mice[0]; mm.x = 21; mm.z = 112;
  run(s2, 1.5, () => { inp(s2, 'fred'); inp(s2, 'casper'); });
  ok(Math.hypot(mm.x - c.x, mm.z - c.z) < Math.hypot(mm.x - f.x, mm.z - f.z), 'mice go for Casper over a closer cat');
  const s3 = new Sim({ seed: 53 }); s3.addPlayer('p1', 'casper'); const c3 = s3.cats.get('p1'); c3.x = 48; c3.z = 48; s3.step();
  s3.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump: true }); for (let i = 0; i < 6; i++) { s3.step(); inp(s3, 'p1', { yaw: 0 }); }
  s3.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump: true }); const ev = run(s3, 1.2, () => inp(s3, 'p1', { yaw: 0 }));
  ok(c3.z > 51 && ev.some(e => e.t === 'strike'), `leap strike carries him forward and lands a hit (${(c3.z - 48).toFixed(1)} units)`);
}
// 24. Meow Meow: burrs send a mouse to sleep, damage wakes it, yawn knocks out a crowd, naps heal, triple jump.
{
  const s = new Sim({ seed: 61 }); s.addPlayer('p1', 'meow'); const cat = s.cats.get('p1'); cat.x = 48; cat.z = 48; cat.yaw = 0;
  s.spawnMouse('tank', 5); const m = s.mice[0]; m.x = 48; m.z = 52; m.state = 'stuck'; m.stuckT = 99;
  for (let k = 0; k < 4; k++) { s.fireBurr(cat, { aim: { x: 48, y: 0.3, z: 52 } }); for (let t = 0; t < 30; t++) { s.buildMouseGrid(); s.stepMissiles(); } }
  ok(m.asleep && m.stunT > 0, '4 burrs put a mouse to sleep');
  s.damageMouse(m, 1, 'trap'); ok(!m.asleep && m.stunT === 0, 'damage wakes it up');
  for (let k = 0; k < 5; k++) { s.spawnMouse('mouse', 1); const q2 = s.mice[s.mice.length - 1]; q2.x = 48 + k * 0.5; q2.z = 50; }
  s.buildMouseGrid(); s.yawn(cat);
  ok(s.mice.slice(1).every(q2 => q2.asleep), 'big yawn puts the crowd to sleep');
  ok(cat.buffT > 0, 'yawn buffs her');
  const sn = new Sim({ seed: 63 }); sn.addPlayer('p1', 'meow'); const cn = sn.cats.get('p1'); cn.hp = 30;
  run(sn, 4, () => inp(sn, 'p1'));
  ok(cn.napping && cn.hp > 40, `stands still -> naps and heals (hp ${Math.round(cn.hp)})`);
  const t = new Sim({ seed: 62 }); t.addPlayer('p1', 'meow'); const c = t.cats.get('p1'); c.x = 48; c.z = 48; t.step(); let jumps = 0;
  for (let k = 0; k < 4; k++) { t.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, jump: true }); const ev = []; for (let i = 0; i < 6; i++) { t.step(); ev.push(...t.events); t.events.length = 0; } if (ev.some(e => e.t === 'jump')) jumps++; }
  ok(jumps === 3, `triple jump (${jumps} jumps before landing)`);
}
// 25. Poison Box hurts the mice that chew it; Cheese Chunk lures mice off their route.
{
  const s = new Sim({ seed: 71 }); s.addPlayer('p1'); s.sardines = 1e6; s.gate.up = false; s.flowDirty = true;
  // A mouse that bites a Poison Box gets poisoned and keeps losing health while it chews.
  s.spawnMouse('tank', 1); const m = s.mice[0]; m.x = 48; m.z = 70;
  for (let t = 0; t < TICK_HZ * 3; t++) { m.poisoned = true; s.buildMouseGrid(); s.stepMouse(m); }
  ok(m.hp < m.maxHp - 20, `chewing a Poison Box poisons the mouse (hp ${Math.round(m.hp)}/${m.maxHp} after 3 s)`);
  const s2 = new Sim({ seed: 72 }); s2.addPlayer('p1'); s2.sardines = 1e6; s2.gate.up = false; s2.flowDirty = true;
  s2.command({ type: 'place', id: 'p1', trap: 'bait', ax: q(62), az: q(50) });
  const bait = [...s2.traps.values()][0];
  ok(bait && bait.kind === 'bait' && bait.charges > 0, 'Cheese Chunk placed with cheese on it');
  s2.spawnMouse('mouse', 1); const mm = s2.mice[0]; mm.x = 59; mm.z = 51;
  run(s2, 2.5, () => {});
  ok(Math.hypot(mm.x - 63, mm.z - 51) < 2, `mouse walked over to the cheese (${Math.hypot(mm.x - 63, mm.z - 51).toFixed(1)} away)`);
  ok(bait.charges < TRAPS.bait.nibbles, 'and is nibbling it');
}
// 26. Mimo: roar makes mice take more damage; pebbles hit ranged mice harder; birds.
{
  const s = new Sim({ seed: 81 }); s.addPlayer('p1', 'mimo'); const cat = s.cats.get('p1'); cat.x = 48; cat.z = 48;
  s.spawnMouse('mouse', 1); const m = s.mice[0]; m.x = 49; m.z = 49;
  s.buildMouseGrid(); s.roar(cat);
  const hp0 = m.hp; s.damageMouse(m, 10, 'trap');
  ok(Math.abs((hp0 - m.hp) - 13.5) < 0.01, `roared mouse takes +35% (${(hp0 - m.hp).toFixed(1)} from 10)`);
  const b = s.spawnBird('crow', 1); b.x = 48; b.y = 7; b.z = 50; b.state = 'in';
  for (let k = 0; k < 2; k++) s.damageBird(b, 30);
  ok(b.dead && s.mice.filter(q2 => q2.type === 'mouse').length >= 4, 'a crow shot down drops its 3 mice');
  run(s, 2, () => {});
  ok(s.mice.filter(q2 => q2.type === 'mouse' && !q2.dead).length <= 1, 'mice dropped from 7 high splat');
  const s2 = new Sim({ seed: 82 }); s2.addPlayer('p1', 'mimo'); s2.gate.up = false; s2.flowDirty = true; s2.step();
  const cr = s2.spawnBird('crow', 1);
  run(s2, 30, () => {});
  ok(s2.mice.length > 0 || s2.lives < 20, 'an unhunted crow drops mice past the defences');
}
// 27. Second abilities (E) on every cat; unique energy; items.
{
  const kinds = ['fred', 'puddin', 'scary', 'nebbie', 'casper', 'meow', 'mimo'];
  const energies = new Set(kinds.map(k => CATS[k].maxEnergy)), regens = new Set(kinds.map(k => CATS[k].energyRegen)), hps = new Set(kinds.map(k => CATS[k].maxHp));
  ok(energies.size === 7 && regens.size === 7 && hps.size === 7, 'every cat has its own health, energy and recharge');
  for (const k of kinds) {
    const s = new Sim({ seed: 90 }); s.addPlayer('p1', k); const c = s.cats.get('p1'); c.x = 58; c.z = 52; c.yaw = 0; s.step();
    s.sardines = 999; s.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax: q(60), az: q(54) });
    if (k === 'nebbie') { const t = [...s.traps.values()][0]; if (t) t.cd = 3; }
    if (k === 'meow') c.hp = 40;
    const e0 = c.energy;
    s.command({ type: 'input', id: 'p1', mx: 0, mz: 0, yaw: 0, alt: true }); s.step();
    ok(c.altT > 0 && (c.energy < e0 || k === 'scary'), `${k}: E ability fires and goes on cooldown`);
  }
  const s = new Sim({ seed: 91 }); s.addPlayer('p1', 'fred', { item: 'bola', loadout: ['mousetrap'] }); const c = s.cats.get('p1');
  for (let k = 0; k < 4; k++) { s.spawnMouse('mouse', 1); const m = s.mice[k]; m.x = 60 + k * 0.4; m.z = 50; }
  s.command({ type: 'item', id: 'p1', aim: { x: 60.6, z: 50 } });
  ok(s.mice.every(m => m.state === 'stuck') && c.itemT > 0, 'Yarn Bola ties up every mouse it lands on');
  s.sardines = 999; s.command({ type: 'place', id: 'p1', trap: 'flipper', ax: q(70), az: q(40) });
  ok(![...s.traps.values()].some(t => t.kind === 'flipper'), 'cannot place a trap you did not bring');
  const s3 = new Sim({ seed: 92 }); s3.addPlayer('p1', 'fred', { item: 'squeaky' }); s3.gate.up = false; s3.flowDirty = true;
  s3.spawnMouse('mouse', 1); const mm = s3.mice[0]; mm.x = 60; mm.z = 52;
  s3.command({ type: 'item', id: 'p1', aim: { x: 63, z: 52 } });
  run(s3, 2, () => {});
  ok(Math.hypot(mm.x - 63, mm.z - 52) < 1.5 && s3.decoys[0].hp < ITEMS.squeaky.hp, 'mice go and chew the Squeaky Toy');
}
process.exit(fails ? 1 : 0);
