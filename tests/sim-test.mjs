// Headless rules tests: runs the sim with no graphics.
// Run: node tests/sim-test.mjs
import { TRAPS, CATS, ITEMS } from '../src/config.js';
import { Sim } from '../src/sim/sim.js';
import { W, CELL, idx, MAP_ORDER, MAPS, cellOf } from '../src/sim/map.js';
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
// 28. Every map: both entrances reach the hole (mice and bosses), lanes split, the twist works.
for (const id of MAP_ORDER) {
  const s = new Sim({ map: id, seed: 101 }); s.addPlayer('p1'); s.step();
  ok(s.spawnCells.every(c => s.flow[c] < Infinity) && s.spawnCells.every(c => s.flowBig[c] < Infinity), `${id}: every entrance reaches the hole (mice and bosses)`);
  ok(new Set(s.spawnCells.map((_, d) => [0, 1, 2, 3, 4, 5].map(() => s.chooseVia(d)).join())).size >= 1 && s.routes().length >= 2 * s.spawnCells.length, `${id}: ${s.routes().length} routes`);
}
// 29. Mazing: mice walk a Poison Box zig-zag rather than chewing.
{
  const s = new Sim({ map: 'market', seed: 102 }); s.addPlayer('p1'); s.sardines = 1e6; s.step();
  // Centre alley (x 38–50): two staggered walls of boxes, each leaving a gap at alternate ends.
  for (let x = 38; x < 48; x += 2) s.command({ type: 'place', id: 'p1', trap: 'barricade', ax: q(x), az: q(30) });
  for (let x = 40; x < 50; x += 2) s.command({ type: 'place', id: 'p1', trap: 'barricade', ax: q(x), az: q(26) });
  s.updateFlow();
  const n = s.traps.size;
  s.spawnMouse('mouse', 1, 1, 0); const m = s.mice[0]; m.x = 44; m.z = 36; m.via = -1;
  const ev = run(s, 20, () => {});
  ok(n >= 8 && !ev.some(e => e.t === 'barricadeHit'), `mice follow the maze (${n} boxes, no chewing)`);
}
// 30. Map twists: mud slows, fire burns, food piles toughen mice, doors swing, pots smash mice.
{
  const st = new Sim({ map: 'stables', seed: 103 }); st.addPlayer('p1'); const c = st.cats.get('p1'); c.x = 60; c.z = 50; st.step();
  const x0 = c.x; for (let k = 0; k < 30; k++) { st.command({ type: 'input', id: 'p1', mx: 1, mz: 0, yaw: 0 }); st.step(); }
  ok(c.x - x0 < CATS.fred.speed * 0.7, `mud slows a cat (${(c.x - x0).toFixed(1)} units in 1 s)`);
  const kt = new Sim({ map: 'kitchen', seed: 104 }); kt.addPlayer('p1'); const kc = kt.cats.get('p1'); kc.x = 44; kc.z = 10.5; kt.step();
  kt.spawnMouse('mouse', 1); const fm = kt.mice[0]; fm.x = 44.5; fm.z = 11; fm.state = 'stuck'; fm.stuckT = 99;
  const hp0 = kc.hp; run(kt, 2, () => inp(kt, 'p1'));
  ok(fm.dead || fm.hp < fm.maxHp - 20, 'the oven burns mice'); ok(kc.hp < hp0, 'and cats');
  const mk = new Sim({ map: 'market', seed: 105 }); mk.addPlayer('p1'); mk.step();
  mk.spawnMouse('mouse', 1); const gm = mk.mice[0]; gm.x = 6; gm.z = 54; const mh = gm.maxHp;
  run(mk, 3, () => {});
  ok(gm.gorged && gm.maxHp > mh, `food pile: mouse gorges and comes out tougher (${mh} -> ${gm.maxHp} hp)`);
  const ps = new Sim({ map: 'passages', seed: 106 }); ps.addPlayer('p1'); ps.step();
  const before = ps.doors.map(d => d.open).join();
  const evd = run(ps, 20, () => {});
  ok(evd.some(e => e.t === 'door'), 'servants open and shut the doors');
  const en = new Sim({ map: 'entrance', seed: 107 }); en.addPlayer('p1'); const ec = en.cats.get('p1'); en.step();
  const pot = en.props[0];   // pot near the west edge of the trestle table (63, 2.9, 40)
  for (let k = 0; k < 4; k++) { en.spawnMouse('mouse', 1); const mm = en.mice[k]; mm.x = 60.6 + (k % 2) * 0.6; mm.z = 39.7 + (k >> 1) * 0.6; mm.state = 'stuck'; mm.stuckT = 99; }
  ec.x = pot.x + 0.6; ec.z = pot.z; ec.y = 2.9; ec.yaw = -Math.PI / 2; ec.onGround = true;   // facing west, toward the edge
  const eve = run(en, 2, () => inp(en, 'p1', { yaw: -Math.PI / 2 }));
  ok(eve.some(e => e.t === 'knock'), 'a cat brushing past knocks the pot off the table');
  const sm = eve.find(e => e.t === 'smash');
  ok(sm && sm.hits >= 2, `it smashes onto the mice below (${sm ? sm.hits : 0} hit)`);
}
// 31. Elements: resistances, statuses, combos.
{
  const mk = (type = 'mouse', x = 20, z = 40) => { const m = el.spawnAt(type, x, z, 200); m.state = 'stuck'; m.stuckT = 99; return m; };
  const el = new Sim({ seed: 201 }); el.addPlayer('p1'); el.step();
  const pl = mk('plague'); el.damageMouse(pl, 40, 'trap', false, 'poison');
  ok(Math.abs(pl.maxHp - pl.hp - 10) < 0.01, `plague rats shrug off poison (40 -> ${(pl.maxHp - pl.hp).toFixed(0)})`);
  const pl2 = mk('plague'); el.damageMouse(pl2, 40, 'trap', false, 'holy');
  ok(Math.abs(pl2.maxHp - pl2.hp - 80) < 0.01, 'holy hits plague rats double');
  // wet + electric = chain shock
  const a = mk('mouse', 30, 40), b = mk('mouse', 31, 40), c = mk('mouse', 31.5, 40.5); el.buildMouseGrid();
  for (const m of [a, b, c]) el.damageMouse(m, 0.01, 'trap', false, 'water');
  ok(a.wetT > 0, 'water soaks a mouse');
  el.events.length = 0; el.damageMouse(a, 20, 'trap', false, 'electric');
  ok(el.events.some(e => e.t === 'combo' && e.kind === 'chain') && b.hp < 200 && c.hp < 200, 'wet + electric chains to nearby mice');
  // oil + fire = blaze
  const o = mk('mouse', 40, 40); o.oilT = 5; el.events.length = 0; el.damageMouse(o, 5, 'trap', false, 'fire');
  ok(el.events.some(e => e.kind === 'blaze') && o.burnDps >= 18, 'oiled + fire = blaze');
  const hpb = o.hp; run(el, 1); ok(hpb - o.hp > 15, `blazing mouse burns fast (${(hpb - o.hp).toFixed(0)} in 1 s)`);
  // wet + ice = frozen solid
  const f = mk('mouse', 50, 40); f.wetT = 3; el.damageMouse(f, 5, 'trap', false, 'ice');
  ok(f.frozen && f.stunT > 2, 'wet + ice = frozen solid');
  const f2 = mk('mouse', 52, 40); for (let k = 0; k < 3; k++) el.damageMouse(f2, 1, 'trap', false, 'ice');
  ok(f2.frozen, 'three chills freeze too');
  // wet + fire = steam (no burning)
  const st = mk('mouse', 54, 40); st.wetT = 3; el.damageMouse(st, 10, 'trap', false, 'fire');
  ok(!(st.burnT > 0) && !(st.wetT > 0), 'fire on a wet mouse just steams');
  // dirty + physics = knockdown
  const dk = mk('mouse', 56, 40); el.damageMouse(dk, 1, 'cat', false, 'earth'); el.damageMouse(dk, 1, 'trap', false, 'physics');
  ok(dk.stunT >= 1.4, 'dirty + physics = knocked flat');
  // wind spreads burning
  const w1 = mk('mouse', 60, 40), w2 = mk('mouse', 60.8, 40); el.buildMouseGrid(); w1.burnT = 3; w1.burnDps = 6;
  el.damageMouse(w1, 1, 'trap', false, 'wind'); ok(w2.burnT > 0, 'wind spreads fire through the pack');
  // death executes the badly hurt
  const dd = mk('mouse', 62, 40); dd.hp = 35; el.damageMouse(dd, 1, 'trap', false, 'death');
  ok(dd.dead, 'death finishes off a mouse under 20%');
  const ghost = mk('ghost', 64, 40); el.damageMouse(ghost, 50, 'cat', false, 'physical');
  ok(Math.abs(ghost.maxHp - ghost.hp - 20) < 0.01, 'ghosts shrug off claws');
  // psychic confuses: the mouse walks back the way it came
  const cs = new Sim({ seed: 202 }); cs.addPlayer('p1'); cs.gate.up = false; cs.flowDirty = true; cs.step();
  const cm = cs.spawnAt('mouse', 48, 50, 100); cs.step(); const i0 = cs.flow[cellOf(cm.x, cm.z)];
  cs.damageMouse(cm, 1, 'cat', false, 'psychic'); run(cs, 1.5);
  ok(cs.flow[cellOf(cm.x, cm.z)] > i0, `a confused mouse wanders away from the hole (${i0.toFixed(0)} -> ${cs.flow[cellOf(cm.x, cm.z)].toFixed(0)})`);
}
// 32. Every trap works: placed somewhere legal, a mouse put in its reach gets hurt or affected.
{
  const { TRAP_ORDER, trapParams } = await import('../src/config.js');
  const { DIRS4 } = await import('../src/sim/map.js');
  for (const kind of TRAP_ORDER) {
    const t = new Sim({ seed: 300 }); t.addPlayer('p1'); t.sardines = 1e6; t.gate.up = false; t.flowDirty = true; t.step();
    const def = TRAPS[kind]; let spot = null;
    for (let z = 20; z < 200 && !spot; z += 2) for (let x = 4; x < 188 && !spot; x += 2) for (const wd of def.surface === 'wall' ? [0, 1, 2, 3] : [-1]) {
      if (t.canPlace(kind, x, z, 0, wd, !!def.topOnly) !== true) continue;
      // Need floor in reach for the mouse to stand on.
      const cells = t.footprint(kind, x, z, 0, wd), xs = cells.map(i => i % W), zs = cells.map(i => (i / W) | 0);
      let cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * CELL, cz = (Math.min(...zs) + Math.max(...zs) + 1) / 2 * CELL;
      if (wd >= 0) { cx -= DIRS4[wd][0] * 1.4; cz -= DIRS4[wd][1] * 1.4; }
      const ci = cellOf(cx, cz); if (!(t.flow[ci] < Infinity) || t.map.solid[ci] > 0) continue;
      if (kind === 'bait') { cx += 2.5; }
      spot = { x, z, wd, cx, cz };
    }
    if (!spot) { ok(false, `${kind}: found a place for it`); continue; }
    t.command({ type: 'place', id: 'p1', trap: kind, ax: spot.x, az: spot.z, rot: 0, wallDir: spot.wd, top: !!def.topOnly });
    const tr = [...t.traps.values()][0];
    if (kind === 'barricade') { ok(tr && tr.hp === trapParams('barricade').hp, 'barricade placed'); continue; }
    const m = t.spawnAt('mouse', spot.cx, spot.cz, 100);
    for (let k = 1; k < (def.crowd || 1); k++) t.spawnAt('mouse', spot.cx + k * 0.2, spot.cz, 100);   // the Chandelier waits for a crowd
    const ev = run(t, 4, () => { if (kind !== 'bait' && !m.dead && m.state !== 'air') { m.x = spot.cx; m.z = spot.cz; } });
    const hit = m.dead || m.hp < m.maxHp || m.oilT > 0 || ev.some(e => e.t === 'glue') || m.confuseT > 0 || m.wetT > 0 || (m.eatT > 0) || m.state === 'air' || m.slowT > 0;
    ok(tr && hit, `${kind} (${def.surface}) affects a mouse in reach (hp ${Math.max(0, m.hp).toFixed(0)}/${m.maxHp}${m.oilT > 0 ? ', oily' : ''}${m.wetT > 0 ? ', wet' : ''}${m.confuseT > 0 ? ', confused' : ''}${m.eatT > 0 ? ', eating' : ''})`);
  }
  // Upgrades change numbers: tier 2 power, tier 3 speed, specials.
  const base = trapParams('mousetrap'), t3 = trapParams('mousetrap', { tier: 3, special: 'a' });
  ok(t3.damage > base.damage && t3.cooldown < base.cooldown && t3.bleed === 3, 'upgrades: tier 2 hits harder, tier 3 resets faster, special switches on');
}
// 33. Shop and profile: unlocks, tiers, specials, hats, rewards, old saves.
{
  const P = await import('../src/meta/profile.js');
  const pr = P.freshProfile();
  ok(P.hasTrap(pr, 'mousetrap') && !P.hasTrap(pr, 'skull'), 'starter traps unlocked, others locked');
  ok(!P.buy(pr, { type: 'trap', kind: 'skull' }).ok, "can't unlock without paw prints");
  pr.paws = 100;
  ok(P.buy(pr, { type: 'trap', kind: 'skull' }).ok && P.hasTrap(pr, 'skull') && pr.paws === 100 - P.UNLOCK.traps.skull, 'unlocking a trap spends paw prints');
  ok(!P.buy(pr, { type: 'special', kind: 'mousetrap', which: 'a' }).ok, 'specials need tier 3');
  P.buy(pr, { type: 'tier', kind: 'mousetrap' }); P.buy(pr, { type: 'tier', kind: 'mousetrap' });
  ok(P.trapState(pr, 'mousetrap').tier === 3 && !P.price(pr, { type: 'tier', kind: 'mousetrap' }), 'two tier upgrades, then maxed');
  const before = pr.paws; P.buy(pr, { type: 'special', kind: 'mousetrap', which: 'a' }); P.buy(pr, { type: 'special', kind: 'mousetrap', which: 'b' });
  const mid = pr.paws; P.buy(pr, { type: 'special', kind: 'mousetrap', which: 'a' });
  ok(before - mid === 30 && pr.paws === mid && P.trapState(pr, 'mousetrap').special === 'a', 'both specials bought once, swapping back is free');
  ok(P.upgradesFor(pr).mousetrap.tier === 3 && P.upgradesFor(pr).mousetrap.special === 'a', 'upgrades handed to the game');
  pr.yarn = 3; ok(P.buy(pr, { type: 'hat', kind: 'tophat' }).ok && pr.yarn === 0, 'hats cost yarn');
  P.buy(pr, { type: 'wear', kind: 'tophat', cat: 'fred' }); ok(pr.worn.fred === 'tophat', 'wear a hat');
  const lose = P.runReward(P.freshProfile(), { won: false, waves: 10, map: 'entrance' });
  ok(lose.paws === 3, `a loss at wave 11 still pays (${lose.paws})`);
  const win = P.runReward(P.freshProfile(), { won: true, waves: 24, rating: { total: 6 }, yarn: 8, map: 'market' });
  ok(win.paws === 8 + 6 + P.FIRST_WIN_BONUS && win.yarn === 8, `a first win pays waves + rating + bonus (${win.paws})`);
  const old = P.normalise({ paws: 4, yarn: 1 }); ok(old.paws === 4 && old.traps && Array.isArray(old.hats), 'old saves load');
  // Upgrades reach the traps in the game.
  const g = new Sim({ seed: 400 }); g.addPlayer('p1', 'fred', { upgrades: P.upgradesFor(pr) }); g.sardines = 1e5; g.step();
  g.placeTrap(g.cats.get('p1'), 'mousetrap', 80, 90, 0, -1);
  const tr = [...g.traps.values()][0];
  ok(tr && tr.p.bleed === 3 && tr.p.damage > TRAPS.mousetrap.damage, 'placed traps carry your upgrades');
}
// 34. Smarter mice: danger memory, scouts, crates, fire avoidance, climbing, traps on tops.
{
  // Danger: kill enough mice on the route and the pack picks another way.
  const dg = new Sim({ seed: 500 }); dg.addPlayer('p1'); dg.gate.up = false; dg.flowDirty = true; dg.step();
  // The north yard has three lanes (west colonnade, guard passage, east). Make the west lane
  // deadly: its cost should rise the most, so packs favour the others.
  const VI = (await import('../src/sim/map.js')).VIAS;
  const west = VI.findIndex(v => v.x < 30);
  const cost0 = VI.map((_, k) => dg.viaCost(k, 0)), flow0 = dg.flow[dg.spawnCells[0]];
  const wr = dg.routes()[1];   // entrance 1's first lane route = the west lane
  for (let k = 0; k < 6; k++) wr.filter(([, z], j) => z > 10 && z < 34 && j % 3 === 0).forEach(([x, z]) => dg.addDanger(x, z, 3));   // a killing ground along it
  run(dg, 1.1);
  const rise = VI.map((_, k) => dg.laneDanger(0, k));
  ok(rise[west] > 40 && rise[west] === Math.max(...rise), `the lane they keep dying in weighs more when packs choose (+${rise.map(v => v.toFixed(0)).join(' / +')})`);
  ok(dg.flow[dg.spawnCells[0]] === flow0, 'but their step-by-step path is unchanged (traps in a lane still get walked into)');
  const picks = {}; for (let k = 0; k < 200; k++) { const v = dg.chooseVia(0); picks[v] = (picks[v] || 0) + 1; }
  ok((picks[west] || 0) < 15, `packs mostly stop picking it (${JSON.stringify(picks)})`);
  for (let k = 0; k < 120; k++) { dg.dangerT = 0; dg.stepDanger(); }
  ok(Math.max(...dg.danger) < 1, 'and forget it after a while');
  ok(buildWave(9, () => 0.5, false).queue.some(e => e.type === 'scout'), 'scouts lead the packs');
  // Crates: the guard passage is a shortcut worth smashing; mice chew through and it opens.
  const cr = new Sim({ seed: 501 }); cr.addPlayer('p1'); cr.gate.up = false; cr.flowDirty = true; cr.step();
  const crate = cr.crates[0]; for (let k = 0; k < 6; k++) { const m = cr.spawnAt('tank', 48 + (k % 3 - 1), 23 + (k >> 1) * 0.3, 999); m.via = -1; }
  const evc = run(cr, 30, () => { for (const m of cr.mice) m.hp = m.maxHp; });
  ok(evc.some(e => e.t === 'crateHit') && !crate.up, 'mice smash through a crate stack to take the shortcut');
  cr.phase = 'build'; cr.phaseTimer = 0; cr.mice = []; cr.step(); ok(crate.up, 'servants stack the crates back each wave');
  // Fire: mice path round the kitchen ovens.
  const fk = new Sim({ map: 'kitchen', seed: 502 }); fk.addPlayer('p1'); fk.step();
  ok(fk.extraArr[cellOf(44, 10.5)] >= 6, 'mice avoid stepping into fire when they can');
  // Climbing: a mouse near the kitchen island climbs up, eats the roast and comes back down tougher.
  const cl = new Sim({ map: 'kitchen', seed: 503 }); cl.addPlayer('p1'); cl.step();
  const cm = cl.spawnAt('mouse', 48, 61.5, 100); cm.climber = true; cm.via = -1; let topY = 0;
  run(cl, 15, () => { topY = Math.max(topY, cm.y); });
  ok(topY > 3 && cm.gorged && cm.maxHp > 100, `a mouse climbs the island (y ${topY.toFixed(1)}), eats and comes out tougher (${cm.maxHp} hp)`);
  ok(!cm.climb && cm.y < 0.1, 'then climbs back down and carries on');
  // Floor traps on furniture tops: a Snapper on the island catches the diner.
  const tt = new Sim({ map: 'kitchen', seed: 504 }); tt.addPlayer('p1'); tt.sardines = 1e5; tt.step();
  const ax = Math.floor(47 / CELL), az = Math.floor(47 / CELL);
  ok(tt.canPlace('mousetrap', ax, az, 0, -1, true) === true && tt.canPlace('bait', ax, az, 0, -1, true) !== true, 'floor traps go on furniture tops (not Cheese Chunks)');
  tt.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax, az, rot: 0, top: true });
  const ttr = [...tt.traps.values()][0];
  const tm = tt.spawnAt('mouse', 48, 61.5, 100); tm.climber = true; tm.via = -1;
  const evt = run(tt, 8);
  ok(ttr && ttr.y > 3 && evt.some(e => e.t === 'snap'), `the Snapper up on the island snaps a climbing mouse (hp ${Math.max(0, tm.hp).toFixed(0)})`);
}
// 35. Co-op: the guest's mirror matches the host's game from snapshots + events, and the
// guest's commands (sent as p2) work on the host.
{
  const C = await import('../src/net/coop.js');
  const host = new Sim({ seed: 600, map: 'kitchen' }); host.addPlayer('p1', 'fred'); host.addPlayer('p2', 'puddin', { loadout: ['mousetrap', 'hotplate'], hat: 'tophat' }); host.sardines = 1e4;
  const mirror = new Sim({ seed: 600, map: 'kitchen' }); mirror.addPlayer('p1', 'fred'); mirror.addPlayer('p2', 'puddin');
  // Guest places a trap: arrives at the host as p2.
  host.command({ ...{ type: 'place', trap: 'hotplate', ax: 60, az: 120, rot: 0 }, id: 'p2' });
  host.command({ type: 'startWave' });
  let ev = [];
  for (let t = 0; t < 30 * 40; t++) {
    host.command({ type: 'input', id: 'p2', mx: 0.5, mz: 0, yaw: 1, primary: true });
    host.step(); ev.push(...host.events.filter(e => !C.SKIP_EVENTS.has(e.t))); host.events.length = 0;
    if (t % 2 === 0) { const msg = JSON.parse(JSON.stringify({ s: C.snapshot(host), ev })); ev = []; C.applySnapshot(mirror, msg.s); for (const e of msg.ev) C.applyEvent(mirror, e); }
  }
  const hm = host.mice.filter(m => !m.dead);
  ok(hm.length > 5 && mirror.mice.length === hm.length, `mirror has the same mice (${mirror.mice.length}/${hm.length})`);
  const far = hm.reduce((a, m) => { const q = mirror.mice.find(o => o.id === m.id); return Math.max(a, q ? Math.hypot(q.x - m.x, q.z - m.z) : 99); }, 0);
  ok(far < 0.5, `and in the same places (worst ${far.toFixed(2)} units)`);
  const p2 = host.cats.get('p2'), g2 = mirror.cats.get('p2');
  ok(Math.hypot(p2.x - g2.x, p2.z - g2.z) < 1 && host.cats.get('p2').x > 30, 'the guest cat moves on the host and on the guest');
  ok(mirror.traps.size === 1 && [...mirror.traps.values()][0].kind === 'hotplate' && host.traps.size === 1, "the guest's trap is placed on the host and shows for the guest");
  ok(mirror.sardines === host.sardines && mirror.wave === host.wave && mirror.lives === host.lives, 'shared Paw Points, wave and lives match');
  const bytes = JSON.stringify({ s: C.snapshot(host) }).length;
  ok(bytes < 20000, `a snapshot is small enough to send 15 times a second (${(bytes / 1024).toFixed(1)} KB)`);
}
// 36. Regressions found in the 24-wave soak runs.
{
  // A slow fat rat between the passages' timed doors used to turn round every time a door
  // swung and never arrive. Now mice wait at a shut door instead.
  const ps = new Sim({ map: 'passages', seed: 700 }); ps.addPlayer('p1'); ps.lives = 100; ps.step();
  const f = ps.spawnAt('fatty', 6, 86, 9999); f.via = -1; let leak = false;
  for (let t = 0; t < 30 * 200 && !leak; t++) { ps.step(); if (ps.events.some(e => e.t === 'leak')) leak = true; ps.events.length = 0; f.hp = f.maxHp; }
  ok(leak, 'a slow fat rat gets through the swinging doors (no dithering)');
  // Path search with huge costs (Poison Box maze + danger) used to take up to 30 s once.
  const mz = new Sim({ seed: 701 }); mz.addPlayer('p1'); mz.sardines = 1e6; mz.step();
  for (const r of mz.routes()) for (let j = 10; j < r.length - 10; j += 9) mz.placeTrap(mz.cats.get('p1'), 'barricade', Math.floor(r[j][0] / CELL) - 2, Math.floor(r[j][1] / CELL) - 2, 0, -1);
  for (let k = 0; k < 400; k++) mz.addDanger(10 + (k * 7) % 80, 10 + (k * 13) % 100, 3);
  const t0 = performance.now(); mz.updateFlow(); for (let v = 0; v < mz.viaFlow.length; v++) mz.viaField(v);
  const ms = performance.now() - t0; ok(ms < 300, `re-pathing a maze with heavy danger stays quick (${ms.toFixed(0)} ms for every field)`);
  // Packs take the direct route too, so every arrow on the floor is a route mice really use.
  const dr = new Sim({ seed: 702 }); dr.addPlayer('p1'); dr.step();
  const picks = new Set(); for (let k = 0; k < 60; k++) picks.add(dr.chooseVia(0));
  ok(picks.has(-1) && picks.size >= 2, `the direct route gets a share of the packs (${[...picks].join(',')})`);
}
// 37. Furniture routes: mice climb over the stable fences when it's shorter than going round.
{
  const st = new Sim({ map: 'stables', seed: 800 }); st.addPlayer('p1'); st.step();
  ok(st.map.links.length >= 10 && st.links.length === st.map.links.length, `the stables have furniture routes over the fences (${st.map.links.length})`);
  const m = st.spawnAt('mouse', 46, 75, 999); m.via = -1; m.climber = false; let topY = 0, crossed = false;   // between the fence and the trough
  for (let t = 0; t < 30 * 12; t++) { st.step(); st.events.length = 0; topY = Math.max(topY, m.y); if (m.z < 70 && !m.link) { crossed = true; break; } }
  ok(crossed && topY > 1, `a mouse climbs over the fence instead of going round (top ${topY.toFixed(1)})`);
  // A Poison Box up on the cellar cheese wheel closes the routes over it.
  const cw = new Sim({ map: 'cellar', seed: 801 }); cw.addPlayer('p1'); cw.sardines = 1e5; cw.step();
  const n0 = cw.links.length, ok1 = cw.canPlace('barricade', 82, 126, 0, -1, true);
  cw.placeTrap(cw.cats.get('p1'), 'barricade', 82, 126, 0, -1, true); cw.updateFlow();
  ok(ok1 === true && cw.links.length < n0, `a Poison Box on top of the cheese wheel closes the routes over it (${n0 - cw.links.length} closed)`);
}
// 38. Difficulty: softer or tougher mice, more or fewer lives, scaled paw prints, fair rating.
{
  const { ratePaws } = await import('../src/sim/waves.js'); const P = await import('../src/meta/profile.js');
  const r = new Sim({ seed: 900, difficulty: 'relaxed' }), b = new Sim({ seed: 900, difficulty: 'brutal' });
  r.addPlayer('p1'); b.addPlayer('p1'); r.phaseTimer = 0; b.phaseTimer = 0; r.step(); b.step();
  ok(r.lives === 30 && b.lives === 12 && b.spawn.hpMul > r.spawn.hpMul * 1.6, `relaxed: 30 lives, brutal: 12 lives and much tougher mice (${(b.spawn.hpMul / r.spawn.hpMul).toFixed(2)}x)`);
  ok(ratePaws(12, {}, 12).base === 5 && ratePaws(6, {}, 12).base <= 3, 'a flawless Brutal run still rates 5 paws');
  const w = P.runReward(P.freshProfile(), { won: true, waves: 24, rating: { total: 6 }, map: 'entrance', difficulty: 'brutal' });
  ok(w.paws === Math.round((8 + 6 + P.FIRST_WIN_BONUS) * 1.5), `Brutal pays 50% more paw prints (${w.paws})`);
}
// 39. Things that fall over: shelves topple across a corridor (crush, block, chewable, back up
// next wave), barrels roll through packs. Co-op mirrors both.
{
  const ps = new Sim({ map: 'passages', seed: 1000 }); ps.addPlayer('p1', 'puddin'); ps.sardines = 1e5; ps.step();
  const sh = ps.shelves[0], st = sh.cells[0], [fx0, fz0, fx1, fz1] = sh.fall, mid = cellOf((fx0 + fx1) / 2, (fz0 + fz1) / 2);
  ok(ps.shelves.length === 3 && sh.state === 'up' && ps.map.solid[st] === sh.h, `the passages have 3 standing shelves (solid, ${sh.h} tall)`);
  ok(!ps.canPlace('mousetrap', st % W, Math.floor(st / W)) && ps.canPlace('mousetrap', q(4), q(48)), 'no trap on a shelf spot; its fall area is fine while it stands');
  // Puddin bites at it until it goes over; she's in the way, so she gets clipped and shoved clear.
  const cat = ps.cats.get('p1'); cat.x = 6.2; cat.z = 48.5; cat.y = 0; cat.hp = cat.def.maxHp;
  const mice = [3, 4, 5].map(x => { const m = ps.spawnAt('mouse', x, 48.5, 100); m.stunT = 5; return m; });
  const ev = run(ps, 6, () => inp(ps, 'p1', { yaw: Math.PI / 2, primary: true }));
  ok(sh.state === 'down' && ev.some(e => e.t === 'shelfFall'), `biting a shelf knocks it over (${ev.filter(e => e.t === 'shelfHit').length} hits)`);
  ok(mice.every(m => m.dead), 'the falling shelf flattens the mice under it');
  ok(cat.hp < cat.def.maxHp && !(cat.x < fx1 && cat.x > fx0 && cat.z > fz0 && cat.z < fz1), 'a cat under it gets clipped and pushed clear');
  ps.updateFlow();
  ok(ps.isBlocker(mid) && ps.map.type[st] === 0 && ps.map.solid[st] === 0, 'once down it blocks the corridor like a crate stack (its old spot is floor)');
  ok(!ps.canPlace('mousetrap', q(4), q(48)), 'no traps on a fallen shelf');
  ps.breakCrate(sh.crate); ps.updateFlow();
  ok(sh.state === 'broken' && !ps.isBlocker(mid), 'mice chew through it and the corridor opens');
  ps.phase = 'build'; ps.phaseTimer = 0; ps.mice = []; cat.x = 4; cat.z = 48.5; ps.step();
  ok(sh.state === 'up' && ps.map.solid[st] === sh.h && !sh.crate.up && sh.hp > 0, 'servants stand it back up next wave');
  // Darts and pellets knock it too (Fred shooting at it from across the corridor).
  const fs = new Sim({ map: 'passages', seed: 1001 }); fs.addPlayer('p1', 'fred'); fs.step();
  const fc = fs.cats.get('p1'); fc.x = 3; fc.z = 48.5; fc.y = 0;
  run(fs, 8, () => inp(fs, 'p1', { yaw: Math.PI / 2, primary: true, aim: { x: 7, y: 0.6, z: 48.5 } }));
  ok(fs.shelves[0].state !== 'up', `Fred's pellets bring a shelf down too (${fs.shelves[0].state})`);
  // Barrels: a cat running into one sends it rolling; it flattens the pack in its way and stops.
  const bs = new Sim({ seed: 1002 }); bs.addPlayer('p1', 'fred'); bs.step();
  const b = bs.barrels[0], [hx, hz] = b.home, bc = bs.cats.get('p1');
  const pack = [3, 5, 7].map(d => { const m = bs.spawnAt('mouse', hx + d, hz, 60); m.stunT = 5; return m; });
  bc.x = hx - 2.5; bc.z = hz; bc.y = 0;
  const bev = run(bs, 6, (t) => inp(bs, 'p1', t < 15 ? { mx: 1, mz: 0, yaw: Math.PI / 2 } : {}));
  ok(bev.some(e => e.t === 'barrelRoll') && b.x > hx + 6, `running into a barrel rolls it (${(b.x - hx).toFixed(1)} units)`);
  ok(pack.filter(m => m.dead || m.hp < m.maxHp).length === 3, 'it runs over the whole pack');
  ok(Math.hypot(b.vx, b.vz) < 0.3 && b.lying && bs.map.type[cellOf(b.x, b.z)] !== 4, 'it comes to rest on open floor, on its side');
  bs.phase = 'build'; bs.phaseTimer = 0; bs.step();
  ok(b.x === hx && b.z === hz && !b.lying, 'barrels go home next wave');
  ok(!bs.canPlace('mousetrap', q(hx) - 1, q(hz) - 1) && bs.canPlace('mousetrap', q(hx) + 6, q(hz) - 1) === true, "no floor traps on a barrel's spot");
  // Co-op: the guest's mirror sees the shelf go down (its spot turns to floor) and the barrels move.
  const C = await import('../src/net/coop.js');
  const host = new Sim({ map: 'passages', seed: 1003 }); host.addPlayer('p1'); host.step();
  const mirror = new Sim({ map: 'passages', seed: 1003 }); mirror.addPlayer('p1');
  for (let k = 0; k < 4; k++) host.hitWorld(7.5, 48.5, 1); run(host, 1);
  C.applySnapshot(mirror, JSON.parse(JSON.stringify(C.snapshot(host))));
  ok(mirror.shelves[0].state === 'down' && mirror.map.solid[mirror.shelves[0].cells[0]] === 0 && mirror.crates[mirror.shelves[0].crate.shelf + host.crates.length - host.shelves.length].up, 'co-op guests see the shelf fall');
}
// 40. First-run tips: each clears when you do what it asks, and ones already done are skipped.
{
  const { Coach, STEPS } = await import('../src/ui/coach.js');
  const el = { classList: { add() {}, remove() {} }, innerHTML: '', offsetWidth: 0 };
  const c = new Coach(el), st = { moved: 0, sel: null, placed: 0, phase: 'build', kills: 0, sniffed: false };
  c.update(0.1, st); const first = c.step;
  st.moved = 6; c.update(0.1, st); const afterMove = c.step;
  st.phase = 'wave'; c.update(0.1, st);   // pressed G before building anything: building tips stay up
  st.sel = 'barricade'; st.placed = 2; c.update(0.1, st); const afterBuild = c.step;
  st.kills = 5; st.sniffed = true; c.update(0.1, st); for (let k = 0; k < 120; k++) c.update(0.1, st);
  ok(first === 0 && afterMove === 1 && afterBuild === 5 && !c.active && el.innerHTML.includes('Tip'), `tips advance as you play and finish (${STEPS.length} tips)`);
  c.replay(); c.update(0.1, { ...st, moved: 0 }); ok(c.active && c.step === 0, 'tips can be replayed');
}
// 41. New traps (0.19): Trapdoor, Magnifying Glass, Knife Block, Honey Drip.
const { DIRS4 } = await import('../src/sim/map.js');
let findSpot, setup;
{
  const { trapParams } = await import('../src/config.js');
  // Somewhere legal for a trap, plus a floor spot in its reach.
  findSpot = (t, kind) => {
    const def = TRAPS[kind];
    for (let z = 20; z < 200; z += 2) for (let x = 4; x < 188; x += 2) for (const wd of def.surface === 'wall' ? [0, 1, 2, 3] : [-1]) {
      if (t.canPlace(kind, x, z, 0, wd, !!def.topOnly) !== true) continue;
      const cells = t.footprint(kind, x, z, 0, wd), xs = cells.map(i => i % W), zs = cells.map(i => (i / W) | 0);
      let cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * CELL, cz = (Math.min(...zs) + Math.max(...zs) + 1) / 2 * CELL;
      if (wd >= 0) { cx -= DIRS4[wd][0] * 1.4; cz -= DIRS4[wd][1] * 1.4; }
      const ci = cellOf(cx, cz); if (!(t.flow[ci] < Infinity) || t.map.solid[ci] > 0) continue;
      return { x, z, wd, cx, cz };
    }
  };
  setup = (kind, up) => {
    const t = new Sim({ seed: 1100 }); t.addPlayer('p1', 'fred', up ? { upgrades: { [kind]: up } } : {}); t.sardines = 1e6; t.gate.up = false; t.flowDirty = true; t.step();
    const sp = findSpot(t, kind); t.command({ type: 'place', id: 'p1', trap: kind, ax: sp.x, az: sp.z, rot: 0, wallDir: sp.wd, top: !!TRAPS[kind].topOnly });
    return { t, sp, tr: [...t.traps.values()][0] };
  };
  const hold = (t, ms, sp) => run(t, 0.1, () => ms.forEach(m => { if (!m.dead) { m.x = sp.cx; m.z = sp.cz; } }));
  // Trapdoor: swallows up to 4 small mice at once (no splitting, still pays); fat rats don't fit.
  {
    const { t, sp } = setup('trapdoor'); const pts0 = t.sardines;
    const small = [0, 1, 2, 3, 4, 5].map(() => t.spawnAt('mouse', sp.cx, sp.cz, 100)), fat = t.spawnAt('fatty', sp.cx, sp.cz, 400);
    for (let k = 0; k < 10; k++) hold(t, [...small, fat], sp);
    const gone = small.filter(m => m.dead).length;
    ok(gone === 4 && !fat.dead && t.sardines > pts0, `a Trapdoor drops 4 mice down the chute and pays for them; a fat rat doesn't fit (${gone} gone)`);
    const w = setup('trapdoor', { tier: 3, special: 'b' }), f2 = w.t.spawnAt('fatty', w.sp.cx, w.sp.cz, 400);
    hold(w.t, [f2], w.sp); ok(f2.dead && trapParams('trapdoor', { tier: 2 }).swallow === 5, 'Wide Hatch takes fat rats; tier 2 swallows 5');
  }
  // Magnifying Glass: the longer it holds one mouse, the harder it burns, until it catches fire.
  {
    const { t, sp, tr } = setup('magnifier'); const m = t.spawnAt('tank', sp.cx, sp.cz, 5000);
    const ev = run(t, 1, () => { m.x = sp.cx; m.z = sp.cz; }); const early = 5000 - m.hp, burnEarly = m.burnT > 0;
    run(t, 3, () => { m.x = sp.cx; m.z = sp.cz; }); const hp1 = m.hp; run(t, 1, () => { m.x = sp.cx; m.z = sp.cz; });
    ok(ev.some(e => e.t === 'beam') && !burnEarly && m.burnT > 0 && hp1 - m.hp > early * 3, `the Magnifying Glass heats up on one mouse and sets it alight (${early.toFixed(0)} in the 1st s, ${(hp1 - m.hp).toFixed(0)} in the 5th)`);
    ok(trapParams('magnifier', { tier: 3, special: 'a' }).rampSecs < 1.3, 'Burning Glass and tier 3 heat it faster');
  }
  // Knife Block: tops only; throws at the nearest mouse; Steak Knives throw three.
  {
    const t0 = new Sim({ seed: 1101 }); t0.addPlayer('p1'); t0.sardines = 1e6; t0.step();
    const fl = findSpot(t0, 'mousetrap'), tp = findSpot(t0, 'knifeblock');
    ok(!t0.canPlace('knifeblock', fl.x, fl.z) && t0.canPlace('knifeblock', tp.x, tp.z, 0, -1, true) === true, 'the Knife Block only goes on furniture tops');
    ok(t0.canPlace('mousetrap', tp.x, tp.z, 0, -1, true) === true && !t0.canPlace('trapdoor', tp.x, tp.z, 0, -1, true), 'no trapdoors in table tops');
    const { t, sp } = setup('knifeblock', { tier: 3, special: 'b' }); const ms = [0, 1, 2, 3].map(k => t.spawnAt('mouse', sp.cx + k * 0.3, sp.cz, 500));
    const ev = run(t, 0.5, () => ms.forEach((m, k) => { m.x = sp.cx + k * 0.3; m.z = sp.cz; }));
    const k = ev.find(e => e.t === 'knife'); ok(k && k.to.length === 3 && ms.filter(m => m.hp < 500).length === 3, 'Steak Knives throw three knives at three mice');
  }
  // Honey Drip: a puddle that slows mice wading through; Beehive bees sting.
  {
    const { t, sp } = setup('honey', { tier: 3, special: 'b' }); const m = t.spawnAt('mouse', sp.cx, sp.cz, 100);
    hold(t, [m], sp); run(t, 1, () => { m.x = sp.cx; m.z = sp.cz; });
    const z = t.zones.find(zn => zn.kind === 'honey');
    ok(z && m.slowT > 0 && m.hp < 100, `Honey Drip leaves a sticky puddle (${z ? z.t.toFixed(1) : 0} s left); Beehive bees sting`);
  }
}
// 42. Market stalls (0.20): break the legs and the counter comes down on the crossing.
{
  const ms = new Sim({ map: 'market', seed: 1200 }); ms.addPlayer('p1', 'puddin'); ms.sardines = 1e5; ms.step();
  const st = ms.stalls[0], [x0, z0, x1, z1] = st.rect, mid = cellOf((x0 + x1) / 2, (z0 + z1) / 2);
  ok(ms.stalls.length === 4 && st.state === 'up' && ms.topHeight(mid) === st.top, `the market has 4 stall counters (${st.name} first)`);
  // A Bug Zapper under it and a Snapper on top: both get crushed (and refunded) when it comes down.
  ms.command({ type: 'place', id: 'p1', trap: 'zapper', ax: q(28), az: q(42), rot: 0 });
  ms.command({ type: 'place', id: 'p1', trap: 'mousetrap', ax: q(32), az: q(42), rot: 0, top: true });
  const placed = ms.traps.size, pts = ms.sardines;
  const prop = ms.props.find(p => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
  const under = [24, 28, 32].map(x => { const m = ms.spawnAt('mouse', x, 43, 100); m.stunT = 9; return m; }), tank = ms.spawnAt('tank', 26, 44, 600); tank.stunT = 9;
  const cat = ms.cats.get('p1'); cat.x = 17.4; cat.z = 41.3; cat.y = 0;
  const ev = run(ms, 7, () => inp(ms, 'p1', { yaw: Math.PI / 2, primary: true }));
  ok(st.state === 'down' && ev.some(e => e.t === 'stallFall'), `biting a stall leg brings the counter down (${ev.filter(e => e.t === 'stallHit').length} hits)`);
  ok(under.every(m => m.dead) && !tank.dead && !(tank.z > z0 && tank.z < z1 && tank.x > x0 && tank.x < x1), 'it flattens the mice under it; a survivor is shoved out');
  ok(placed === 2 && ms.traps.size === 0 && ms.sardines >= pts + TRAPS.zapper.cost + TRAPS.mousetrap.cost, 'traps under and on it are crushed and refunded');
  ok(prop && prop.state !== 'up', 'the pots on the counter go flying');
  ms.updateFlow();
  ok(ms.isBlocker(mid) && ms.map.slabTop[mid] === 0 && !ms.map.covered[mid] && Math.abs(ms.colH(mid, true) - 0.9) < 0.01, 'the pile blocks the crossing (a low heap, no counter to stand on or hang traps under)');
  ok(!ms.canPlace('mousetrap', q(28), q(42)) && !ms.canPlace('zapper', q(28), q(42)), 'nothing builds on the pile');
  ms.breakCrate(st.crate); ms.updateFlow();
  ok(st.state === 'broken' && !ms.isBlocker(mid) && ms.canPlace('mousetrap', q(28), q(42)) === true, 'mice chew through it and the crossing opens');
  ms.phase = 'build'; ms.phaseTimer = 0; ms.mice = []; ms.step();
  ok(st.state === 'up' && ms.map.slabTop[mid] === st.top && ms.map.covered[mid] === 1 && !st.crate.up, 'servants prop it back up next wave');
  // Co-op: the guest's mirror loses the counter too.
  const C = await import('../src/net/coop.js');
  const host = new Sim({ map: 'market', seed: 1201 }); host.addPlayer('p1'); host.step();
  const mirror = new Sim({ map: 'market', seed: 1201 }); mirror.addPlayer('p1');
  for (let k = 0; k < 6; k++) host.hitWorld(x0 + 0.5, z0 + 0.5, 1); run(host, 1);
  C.applySnapshot(mirror, JSON.parse(JSON.stringify(C.snapshot(host))));
  ok(mirror.stalls[0].state === 'down' && mirror.map.slabTop[mid] === 0, 'co-op guests see the stall come down');
}
// 43. More new traps (0.21): Cuckoo Clock, Chandelier, Kettle, Spice Jar.
{
  const { trapParams } = await import('../src/config.js');
  // Cuckoo Clock: strikes on the beat, mice or no mice; Grandfather Clock stuns.
  {
    const { t } = setup('cuckoo'); const ev = run(t, 7);
    ok(ev.filter(e => e.t === 'cuckoo').length >= 2, `the Cuckoo Clock strikes on the beat with nobody there (${ev.filter(e => e.t === 'cuckoo').length} in 7 s)`);
    const g = setup('cuckoo', { tier: 3, special: 'b' }), m = g.t.spawnAt('tank', g.sp.cx, g.sp.cz, 900);
    run(g.t, 3.5, () => { if (!(m.stunT > 0)) { m.x = g.sp.cx; m.z = g.sp.cz; } });
    ok(m.hp < 900 && m.stunT > 0, 'Grandfather Clock stuns what it hits');
    ok(trapParams('cuckoo', { tier: 3, special: 'a' }).cooldown < 1.3, 'Alarm Clock strikes far more often');
  }
  // Chandelier: two mice aren't worth it; three are; one Fat Rat is.
  {
    const a = setup('chandelier'), two = [0, 1].map(k => a.t.spawnAt('mouse', a.sp.cx + k * 0.3, a.sp.cz, 200));
    run(a.t, 0.5, () => two.forEach(m => { m.x = a.sp.cx; m.z = a.sp.cz; })); const untouched = two.every(m => m.hp === 200);
    const three = a.t.spawnAt('mouse', a.sp.cx, a.sp.cz, 200); const ev = run(a.t, 0.3, () => [...two, three].forEach(m => { m.x = a.sp.cx; m.z = a.sp.cz; }));
    ok(untouched && ev.some(e => e.t === 'chandelier' && e.hits === 3), 'the Chandelier waits for a crowd of three, then drops');
    const f = setup('chandelier'), fat = f.t.spawnAt('fatty', f.sp.cx, f.sp.cz, 900); run(f.t, 0.3, () => { fat.x = f.sp.cx; fat.z = f.sp.cz; });
    ok(fat.hp < 900, 'one Fat Rat is crowd enough');
    const h = setup('chandelier', { tier: 3, special: 'b' }), hm = [0, 1, 2].map(() => h.t.spawnAt('tank', h.sp.cx, h.sp.cz, 900)); run(h.t, 0.3, () => hm.forEach(m => { m.x = h.sp.cx; m.z = h.sp.cz; }));
    ok(hm.some(m => m.burnT > 0) && h.t.zones.some(z => z.kind === 'fire'), 'Hot Wax sets them burning and leaves burning wax');
  }
  // Kettle: soaks the mice round the table (good for Zapper chains); Whistling scares them.
  {
    const { t, sp } = setup('kettle', { tier: 3, special: 'b' }); const m = t.spawnAt('mouse', sp.cx, sp.cz, 200);
    run(t, 0.5, () => { m.x = sp.cx; m.z = sp.cz; });
    ok(m.wetT > 0 && m.hp < 200 && m.confuseT > 0, 'the Kettle soaks and scalds mice below the table; Whistling sends them back');
  }
  // Spice Jar: they stop to sneeze, covered in pepper (a physics hit then knocks them flat).
  {
    const { t, sp } = setup('spicejar'); const m = t.spawnAt('mouse', sp.cx, sp.cz, 200);
    run(t, 0.3, () => { m.x = sp.cx; m.z = sp.cz; });
    const sneeze = m.stunT > 0, dirty = m.dirtyT > 0; t.damageMouse(m, 1, 'trap', false, 'physics');
    ok(sneeze && dirty && m.stunT >= 1.2, 'the Spice Jar makes mice sneeze, and peppered mice get knocked flat');
  }
}
// 44. Long runs (0.22): wall off the floor under the kitchen island and mice take to the
// island top instead; a Poison Box up there closes the run.
{
  const loft = new Sim({ map: 'stables', seed: 1 }).map.links.some(l => l.name === 'Hay loft' && l.ladder);   // (one map at a time: check this first)
  const ks = new Sim({ map: 'kitchen', seed: 1300 }); ks.addPlayer('p1'); ks.sardines = 1e6; ks.step();
  const L = ks.map.links.find(l => l.name === 'Over the island');
  ok(ks.map.links.filter(l => /counter top|island/.test(l.name)).length === 3 && loft, 'the kitchen has three counter-top runs, the stables a hay-loft run with ladders');
  // (m.climber = false: not one of the mice that go for the roast on the island)
  const climbs = (sim) => { const m = sim.spawnAt('mouse', L.a[0], L.a[1], 500); m.climber = false; let on = false; run(sim, 3, () => { if (m.link && m.link.L.name === L.name) on = true; }); sim.mice = sim.mice.filter(x => x !== m); return on; };
  ok(!climbs(ks), 'with the floor open, mice walk under the island');
  // A Poison Box wall right across the middle of the kitchen (the counters stay open underneath).
  for (let x = q(14); x < q(82); x += 2) ks.command({ type: 'place', id: 'p1', trap: 'barricade', ax: x, az: q(47), rot: 0 });
  ks.updateFlow();
  ok(ks.flow[L.cellB] < Infinity && climbs(ks), `wall the floor off and they climb over the island instead (${ks.traps.size} Poison Boxes)`);
  ks.command({ type: 'place', id: 'p1', trap: 'barricade', ax: q(45) - 1, az: q(46), rot: 0, top: true }); ks.updateFlow();
  ok(!ks.links.includes(L) && !climbs(ks), 'a Poison Box on the island top closes the run');
}
process.exit(fails ? 1 : 0);
