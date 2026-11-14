// demo.js — (v0.34) ?demo: the game plays itself, for recording the gameplay video (and for
// showing the game off). Three cats: yours (the camera follows it) plus two helpers, all driven
// here. Traps go down along every route the mice will take, the first wave starts straight away,
// and the cats chase the thickest knot of mice: bite, pounce, hiss, spit.
// Nothing here is used in a normal game.
import { MICE, TRAPS, DT } from './config.js';
import { CELL, cellOf } from './sim/map.js';
import { CHAOS } from './sim/chaos.js';

// What the demo lays along the routes, in order, round and round (floor and ceiling traps).
const LAYOUT = ['mousetrap', 'flipper', 'zapper', 'firecracker', 'catapult', 'tacks', 'chandelier', 'rollingpin', 'pans', 'hotplate', 'tenderizer', 'peg', 'knifeblock', 'bubbles', 'kettle', 'flowerpot'];

export function placeDemoTraps(sim, catId, { spacing = 5, max = 60 } = {}) {
  const cat = sim.cats.get(catId); cat.loadout = null;     // any trap
  sim.sardines = 1e6;
  const tile = (v, span) => 4 * Math.round((v / CELL - span / 2) / 4);
  let n = 0, k = 0; const used = new Set();
  for (const route of sim.routes()) {
    let d = 0;
    for (let i = 1; i < route.length && n < max; i++) {
      d += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
      if (d < spacing || i < 6 || i > route.length - 4) continue;   // not on the doorstep or in the hole
      const [x, z] = route[i];
      for (let tries = 0; tries < LAYOUT.length; tries++) {
        const kind = LAYOUT[(k + tries) % LAYOUT.length], def = TRAPS[kind];
        const [w, dd] = def.size, ax = tile(x, w), az = tile(z, dd), key = kind[0] + def.surface + ax + ',' + az;
        if (used.has(key)) continue;
        const before = sim.traps.size;
        sim.placeTrap(cat, kind, ax, az, 0, -1, false);
        if (sim.traps.size > before) { used.add(key); n++; k = (k + tries + 1) % LAYOUT.length; d = 0; break; }
      }
    }
  }
  sim.events = sim.events.filter(e => e.t === 'trapAdd');   // drop the "can't place that there" messages
  sim.sardines = 400;
  return n;
}

// One cat's brain: chase the nearest knot of mice, attack in reach, use the abilities often.
function think(sim, cat, st) {
  if (!cat.alive) return { mx: 0, mz: 0, yaw: cat.yaw };
  st.t += DT; st.retarget -= DT;
  if (st.retarget <= 0 || !st.target || st.target.dead) {
    st.retarget = 0.5;
    let best = null, bs = -1;
    for (const m of sim.mice) {
      if (m.dead || MICE[m.type].bird) continue;
      const d = Math.hypot(m.x - cat.x, m.z - cat.z); if (d > 40) continue;
      if (st.guard && Math.hypot(m.x - st.guard[0], m.z - st.guard[1]) > 16) continue;   // stay on your patch of the route
      let crowd = 0; for (const o of sim.nearMice(m.x, m.z, 3)) if (!o.dead) crowd++;
      const score = crowd * 6 - d * 0.5 + (st.bias || 0) * (m.x - cat.x);   // helpers lean different ways, so they spread out
      if (score > bs) { bs = score; best = m; }
    }
    st.target = best;
  }
  // Stuck against something (a table leg, a wall)? Hop and pick another mouse.
  if (Math.hypot(cat.x - (st.lx ?? cat.x), cat.z - (st.lz ?? cat.z)) < 0.02 && st.target) st.stuck += DT; else st.stuck = 0;
  st.lx = cat.x; st.lz = cat.z;
  if (st.stuck > 0.8) { st.stuck = 0; st.retarget = 0; st.target = null; return { mx: Math.sin(st.t) , mz: Math.cos(st.t), yaw: cat.yaw, jump: true, jumpHeld: true }; }
  const m = st.target;
  if (!m) { const p = st.guard; if (!p) return { mx: 0, mz: 0, yaw: cat.yaw }; return steer(cat, p[0], p[1], 2, st); }
  const cmd = steer(cat, m.x, m.z, st.reach, st);
  const d = Math.hypot(m.x - cat.x, m.z - cat.z);
  cmd.aim = { x: m.x, y: m.y + 0.2, z: m.z };
  cmd.primary = d < st.reach + 4;
  if (d < 7 && (st.secT -= DT) <= 0) { cmd.secondary = true; st.secT = 1.6 + Math.random() * 1.6; }
  if ((st.altT -= DT) <= 0 && d < 10) { cmd.alt = true; st.altT = 5 + Math.random() * 4; }
  if ((st.jumpT -= DT) <= 0) { cmd.jump = true; st.jumpT = 2 + Math.random() * 3; }
  return cmd;
}
function steer(cat, x, z, stop, st) {
  const dx = x - cat.x, dz = z - cat.z, d = Math.hypot(dx, dz) || 1;
  let mx = 0, mz = 0;
  if (d > stop) { mx = dx / d; mz = dz / d; }
  else { const s = Math.sin(st.t * 1.3 + st.phase); mx = -dz / d * s * 0.6; mz = dx / d * s * 0.6; }   // close: circle round them
  return { mx, mz, yaw: Math.atan2(dx, dz), jump: false, jumpHeld: false, primary: false, secondary: false, alt: false };
}

export function runDemo({ sim, LOCAL_ID, setView, scene }) {
  // Helpers: Scary Cat (hiss, whip) and Fred (spit, hairballs) join your cat.
  const ids = [LOCAL_ID];
  const have = new Set([...sim.cats.values()].map(c => c.kind));
  for (const kind of ['scary', 'fred', 'puddin']) { if (ids.length >= 3) break; if (have.has(kind)) continue; const id = 'd' + ids.length; const c = sim.addPlayer(id, kind, {}); c.x += ids.length * 1.5; ids.push(id); have.add(kind); }
  // Bigger, busier swarms than a normal chaos game, and a later wave (rats, a mini boss on 6).
  Object.assign(CHAOS, { swarmEvery: [0.8, 1.6], swarmSize: [8, 14], maxMice: 240, rumbleEvery: [4, 7], favourDoor: 0, favourChance: 0.6 });
  sim.wave = +(new URLSearchParams(location.search).get('wave') || 6) - 1;
  const n = placeDemoTraps(sim, LOCAL_ID, { spacing: 7, max: 40 });
  // Each cat guards a stretch of one route, about a quarter of the way from its hole to the
  // great hall (where the traps are busiest), and starts there (so the fight is on from the first second).
  const routes = sim.routes().filter(r => r.length > 20);
  const brain = new Map(ids.map((id, k) => {
    const r = routes[0];   // all on the same route, so they're in the shot together
    let g = null; if (r) for (let j = Math.floor(r.length * [0.13, 0.09, 0.18][k % 3]); j < r.length && !g; j++) if (!(r[j][2] > 0.3)) g = r[j];   // (a floor point, not up a table)
    const c = sim.cats.get(id); if (g) { c.x = g[0] + k * 0.6; c.z = g[1]; }
    return [id, { t: 0, retarget: 0, target: null, secT: 1 + k, altT: 3 + k * 2, jumpT: 1 + k, phase: k * 2, bias: 0, stuck: 0, guard: g, reach: c.kind === 'fred' ? 5 : 1.6 }];
  }));
  const css = document.createElement('style'); css.textContent = 'body.demo #crosshair, body.demo #controls, body.demo #coach { display: none !important; }';
  document.head.appendChild(css); document.body.classList.add('demo');
  sim.command({ type: 'startWave', id: LOCAL_ID });
  if (window.__skipFlyover) window.__skipFlyover();
  let yaw = null; const cam = { yaw: 0, pitch: 0.42 };
  // The action camera: up and back from the fight, looking down on your cat and the mice round
  // it, swinging slowly round. Your cat stays in the shot; the knot of mice it's after fills it.
  const fc = { x: 0, z: 0, ok: false, orbit: 0 };
  if (scene) {
    setTimeout(() => {
      document.body.classList.remove('cine');
      scene.camDriver = (c, dt) => {
        const me = sim.cats.get(LOCAL_ID); if (!me) return true;
        let sx = 0, sz = 0, n = 0;
        for (const m of sim.nearMice(me.x, me.z, 9)) if (!m.dead) { sx += m.x; sz += m.z; n++; }
        const tx = n ? me.x * 0.45 + (sx / n) * 0.55 : me.x, tz = n ? me.z * 0.45 + (sz / n) * 0.55 : me.z;
        if (!fc.ok) { fc.x = tx; fc.z = tz; fc.ok = true; }
        const k = Math.min(1, dt * 1.8); fc.x += (tx - fc.x) * k; fc.z += (tz - fc.z) * k;
        fc.orbit += dt * 0.12;
        const a = (yaw ?? me.yaw) + Math.sin(fc.orbit) * 0.5, dist = 5.2, h = 3.9;
        // Pull in before anything solid between the fight and the camera (walls, ovens, ceilings).
        let f = 1;
        for (let s = 0.1; s <= 1.0001; s += 0.04) {
          const x = fc.x - Math.sin(a) * dist * s, z = fc.z - Math.cos(a) * dist * s, y = 0.8 + (h - 0.8) * s;
          if (sim.blocks(cellOf(x, z), y - 0.4, 0.8, 0, true)) { f = Math.max(0.35, s - 0.08); break; }
        }
        c.position.set(fc.x - Math.sin(a) * dist * f, 0.8 + (h - 0.8) * f, fc.z - Math.cos(a) * dist * f);
        if (scene.shake > 0) { scene.shake = Math.max(0, scene.shake - dt); const j = scene.shake * 0.45; c.position.x += (Math.random() - 0.5) * j; c.position.y += (Math.random() - 0.5) * j; c.position.z += (Math.random() - 0.5) * j; }
        c.lookAt(fc.x, 0.4, fc.z);
        if (scene.sun) { scene.sun.target.position.set(fc.x, 0, fc.z); scene.sun.position.set(fc.x - 30, 40, fc.z + 22); }
        scene.localCat = scene.cats.get(LOCAL_ID) || scene.localCat;
        return true;
      };
    }, 50);
  }
  window.__demo = { traps: n, cats: ids };
  return {
    // Called once per sim tick: commands for the helpers, and the local cat's input.
    tick() {
      if (sim.sardines < 200) sim.sardines += 400;   // (the demo never runs dry)
      for (const id of ids) { const c = sim.cats.get(id); if (c.alive) c.hp = Math.max(c.hp, c.def.maxHp * 0.6); }   // demo cats don't go down
      if (sim.lives < 6) sim.lives = 6;
      let mine = null;
      for (const id of ids) {
        const c = think(sim, sim.cats.get(id), brain.get(id));
        if (id === LOCAL_ID) mine = { type: 'input', id, ...c, pitch: 0 };
        else sim.command({ type: 'input', id, ...c, pitch: 0 });
      }
      return mine;
    },
    // Called every frame: the camera swings round behind your cat towards the fight.
    frame(dt) {
      const me = sim.cats.get(LOCAL_ID), t = brain.get(LOCAL_ID).target;
      if (!me) return;
      const want = t ? Math.atan2(t.x - me.x, t.z - me.z) : me.yaw;
      if (yaw === null) yaw = want;
      const dy = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
      yaw += dy * Math.min(1, dt * 2.2);
      cam.yaw = yaw; setView(cam.yaw, cam.pitch);
    },
  };
}
