// chaos.js — (v0.34) Chaos mode: the castle never sits still (Brent: "some chaos in the game all over").
// On by default in the browser (main.js; ?calm turns it off). The sim tests build a Sim without it,
// so the balance tests are unchanged. Everything here goes through the sim's own pieces (spawnAt,
// launch, hitWorld, the props' own fall), so co-op guests see it like anything else the host does.
//
// While a wave is on:
// - Scurries: every 1.4-2.8 s a squeaking pack of 5-10 little mice bolts out of a random hole
//   (every hole is open from wave 1). They're soft (half health), pay Paw Points like any mouse,
//   and a scurry that gets into the hall only steals crumbs: it doesn't cost a life.
// - Rumbles: every 5-9 s the castle shakes. Pots and jars jump off their shelves and tables and
//   smash on whatever is under them, the nearest stall or shelf takes a hit (enough and it comes
//   down on the mice), and a barrel near the mice rolls through them.
// - Flings: a trap kill can throw the mice next to it into the air (they land hard).
// - Knocked props go back where they were after a few seconds, so there's always more to knock over.
import { DT, MICE } from '../config.js';
import { SPAWNS } from './map.js';

export const CHAOS = {
  swarmEvery: [1.4, 2.8], swarmSize: [5, 10], swarmHp: 0.5, maxMice: 170,
  rumbleEvery: [5, 9], rumbleProps: 3, flingChance: 0.45, propBack: 5,
  favourDoor: null, favourChance: 0,   // (the demo sends most scurries down the route it's filming)
};

const between = (sim, [a, b]) => a + sim.rng() * (b - a);

export function initChaos(sim) {
  sim.chaos = { swarmT: 1.2, rumbleT: 3.5, swarms: 0, rumbles: 0, flings: 0 };
  sim.allDoors = true; sim.doorsOpen = SPAWNS.map(() => true);     // every hole is open from the first wave
  sim.flowDirty = true; sim.layoutVer++;
}

export function stepChaos(sim) {
  const c = sim.chaos; if (!c) return;
  // Props go back on their shelves a few seconds after they hit the floor.
  for (const p of sim.props) {
    if (p.state !== 'down') { p.downT = 0; continue; }
    if ((p.downT = (p.downT || 0) + DT) > CHAOS.propBack) { [p.x, p.y, p.z] = p.home; p.state = 'up'; p.vx = p.vy = p.vz = 0; p.tilt = 0; p.downT = 0; sim.emit({ t: 'propBack', id: p.id, x: p.x, z: p.z }); }
  }
  if (sim.phase !== 'wave') return;
  // Flings: mice beside a trap kill go flying (looks at this tick's kill events).
  const kills = sim.events.filter(e => e.t === 'kill' && !e.drowned && !e.eaten);
  for (const e of kills) {
    if (sim.rng() > CHAOS.flingChance) continue;
    let n = 0;
    for (const m of sim.nearMice(e.x, e.z, 2.2)) {
      if (m.dead || m.state === 'air' || MICE[m.type].boss || MICE[m.type].big || MICE[m.type].bird || n >= 2) continue;
      const dx = m.x - e.x, dz = m.z - e.z, l = Math.hypot(dx, dz) || 1, sp = 2.5 + sim.rng() * 2.5;
      sim.launch(m, dx / l * sp, 5 + sim.rng() * 4, dz / l * sp); n++;
    }
    if (n) { c.flings++; sim.emit({ t: 'fling', x: e.x, z: e.z, n }); }
  }
  // Scurries.
  if ((c.swarmT -= DT) <= 0) {
    c.swarmT = between(sim, CHAOS.swarmEvery);
    const live = sim.mice.length;
    if (live < CHAOS.maxMice) {
      const door = CHAOS.favourDoor != null && sim.rng() < CHAOS.favourChance ? CHAOS.favourDoor : Math.floor(sim.rng() * SPAWNS.length), sp = SPAWNS[door], via = sim.chooseVia(door);
      const n = Math.min(CHAOS.maxMice - live, Math.round(between(sim, CHAOS.swarmSize)));
      const hpMul = ((sim.spawn && sim.spawn.hpMul) || 1) * CHAOS.swarmHp;
      for (let k = 0; k < n; k++) {
        const type = sim.rng() < 0.6 ? 'pup' : 'mouse';
        const m = sim.spawnAt(type, sp.x + (sim.rng() - 0.5) * 4, sp.z - 0.4 - sim.rng() * 2, Math.max(1, Math.round(MICE[type].hp * hpMul)), via);
        m.chaos = true;
      }
      c.swarms++;
      sim.emit({ t: 'scurry', x: sp.x, z: sp.z, n, door });
    }
  }
  // Rumbles.
  if ((c.rumbleT -= DT) <= 0) {
    c.rumbleT = between(sim, CHAOS.rumbleEvery);
    const alive = sim.mice.filter(m => !m.dead && !MICE[m.type].bird);
    const focus = alive.length ? alive[Math.floor(sim.rng() * alive.length)] : null;
    c.rumbles++;
    sim.emit({ t: 'rumble', x: focus ? focus.x : undefined, z: focus ? focus.z : undefined });
    // Pots and jars jump off: the ones nearest the mice first.
    const up = sim.props.filter(p => p.state === 'up');
    if (focus) up.sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z));
    for (const p of up.slice(0, CHAOS.rumbleProps)) {
      const a = sim.rng() * Math.PI * 2, s = 2 + sim.rng() * 3;
      let vx = Math.cos(a) * s, vz = Math.sin(a) * s;
      if (focus) { const dx = focus.x - p.x, dz = focus.z - p.z, l = Math.hypot(dx, dz) || 1; vx = dx / l * s + vx * 0.3; vz = dz / l * s + vz * 0.3; }   // towards the mice
      p.vx = vx; p.vz = vz; p.vy = 2 + sim.rng() * 2; p.state = 'fall'; p.fallFrom = p.y + 1.2;   // (+1.2: it jumps, so it always lands hard enough to smash)
      sim.emit({ t: 'knock', id: p.id, x: p.x, z: p.z });
    }
    // The furniture nearest the mice takes a knock (shelves, stall legs, barrels).
    if (focus) {
      let best = null, bd = 14;
      for (const sh of sim.shelves) if (sh.state === 'up') { const x = (sh.rect[0] + sh.rect[2]) / 2, z = (sh.rect[1] + sh.rect[3]) / 2, d = Math.hypot(x - focus.x, z - focus.z); if (d < bd) { bd = d; best = [x, z]; } }
      for (const st of sim.stalls) if (st.state === 'up') { const x = st.rect[0] + 0.5, z = st.rect[1] + 0.5, d = Math.hypot(x - focus.x, z - focus.z); if (d < bd) { bd = d; best = [x, z]; } }
      for (const b of sim.barrels) if (!b.lying) { const d = Math.hypot(b.x - focus.x, b.z - focus.z); if (d < bd) { bd = d; best = [b.x - (focus.x - b.x) * 0.1, b.z - (focus.z - b.z) * 0.1]; } }
      if (best) sim.hitWorld(best[0], best[1], 2, focus.x - best[0], focus.z - best[1]);
    }
  }
}
