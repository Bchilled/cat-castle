// sim.js — the whole game rules, with no graphics.
// Why separate from rendering: this is the "authoritative" game. Today it runs
// in the browser for one player; for co-op a host runs it and sends state to the
// other cat. Players only ever talk to it through commands, and it never calls
// Math.random (seeded RNG instead) so every run is reproducible.

import { DT, GRAVITY, RULES, CAT, CATS, MICE, TRAPS, GATE as GATE_CFG, TRINKETS } from '../config.js';
import {
  W, H, CELL, T, idx, cellOf, cellCenter, buildMap, floorish, miceWalkable, goalCells,
  GATE, SPAWNS, CAT_SPAWN, STALLS, DIRS4, WORLD_W, WORLD_H, VIAS,
} from './map.js';
import { computeFlow, nextCell, nearestReachable } from './path.js';
import { buildWave, ratePaws, INTRO_TEXT } from './waves.js';

// Cat lines. Original, crude, bleeped.
const BARKS = {
  kill: ['Squeak for your mum. Go on.', 'Another one for the gutter.', 'Oh, did that hurt? Good.',
         'Flat as a beer mat. Lovely.', "I'll wear your tail as a #@!% scarf.", 'Wipe your feet, you filthy little #@!%s.',
         "That's not blood, that's interest.", 'Tail tax. Pay up, vermin.'],
  trap: ["Ha! Didn't see that coming, did ya.", 'Snap. Beautiful.', 'Mind the step, sunshine.', 'Fly, you greasy little #@!%.', 'Splat. Art, that is.'],
  wave: ['Here they come. Smell like a bin.', "Bloody hell, they're breeding.", 'Not my castle. Still mine.', 'More of them. Course there is.'],
  boss: ["That one's eaten a whole bakery.", 'Big lad. Bigger funeral.'],
  death: ["Oh, for #@!%'s sake.", 'Nine lives my #@!%.', "Right. That's personal now."],
  gate: ["Board's gone. Who wedged that, a #@!% hamster?", "They're through. Barricades, now."],
  sell: ['Lovely bunch of tails.', 'Kerching, you mouldy beauties.'],
  trinket: ['Ooh. Shiny. Mine.', 'Finders keepers, you dead little #@!%.'],
  eat: ['Crunchy.', 'Needs salt.', 'Mm. Tastes like the floor.'],
};

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Rotation index -> DIRS4 index, turning clockwise from +z.
export const ROT_DIR = [2, 1, 3, 0];
const CEILING_Y = 13;   // nothing climbs out over the walls

export class Sim {
  constructor({ mode = 'normal', seed = 1234 } = {}) {
    this.map = buildMap();
    this.goals = goalCells();
    this.rng = mulberry32(seed);
    this.mode = mode;                  // 'normal' (win at 24) or 'endless'
    this.time = 0; this.tick = 0;
    this.phase = 'build';              // build | wave | won | lost
    this.phaseTimer = Infinity;        // first build phase waits for G
    this.wave = 0;
    this.lives = RULES.startLives;
    this.sardines = RULES.startSardines;
    this.yarn = 0;
    this.gate = { hp: GATE_CFG.hp, up: true };
    this.cats = new Map();
    this.mice = [];
    this.traps = new Map();
    const N = W * H;
    this.occ = { floor: new Int32Array(N), wall: new Int32Array(N), ceiling: new Int32Array(N) };
    this.tails = []; this.loot = [];   // tails + trinkets lying on the ground
    this.trinkets = {};                // collected this run (team-wide), key -> count
    this.shots = [];                   // lobber rocks
    this.globs = [];                   // plague-rat spit flying at cats
    this.viaFlow = VIAS.map(() => null); // flow fields to each route choice (see VIAS in map.js)
    this.viaDirty = VIAS.map(() => true);
    this.packVia = -1;                 // route the current pack is using
    this.missiles = [];                // cat projectiles: pellets + hairballs
    this.events = [];
    this.stats = { trapsPlaced: 0, damageTaken: 0, kills: 0, abilitiesUsed: 0, energyUsed: 0 };
    this.nextId = 1;
    this.spawn = null;
    this.barkCooldown = 0;
    this.tailAcc = 0;
    this.inputs = new Map();
    this.spawnCells = SPAWNS.map(p => cellOf(p.x, p.z - 0.3));
    this.spawnCell = this.spawnCells[0];
    this.door = 0;                     // which entrance the next pack uses
    this.flowDirty = true;
    this.updateFlow();
  }

  // ---------- trinket modifiers ----------
  tk(k) { return this.trinkets[k] || 0; }
  get mods() {
    const cd = Math.pow(0.65, this.tk('crown'));
    return {
      speed: 1 + 0.1 * this.tk('catnip'), bite: Math.pow(0.85, this.tk('cap')), tails: 1 + 0.25 * this.tk('bell'),
      sell: 1 + 0.2 * this.tk('rind'), bleedMax: CAT.bleedMaxStacks + 2 * this.tk('collar'),
      regen: 1 + 0.3 * this.tk('tin'), crit: 0.08 * this.tk('whisker'),
      abilityCd: Math.pow(0.8, this.tk('watch')) * cd, trapCd: Math.pow(0.8, this.tk('key')) * cd,
      attackCd: cd, trapDmg: Math.pow(1.25, this.tk('thimble')),
    };
  }

  // ---------- players ----------
  addPlayer(id, kind = 'fred') {
    const def = CATS[kind];
    const cat = { id, kind, def, name: def.name, x: CAT_SPAWN.x, y: 0, z: CAT_SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: Math.PI, pitch: 0,
      hp: def.maxHp, energy: CAT.maxEnergy, alive: true, respawnT: 0, onGround: true, airJumps: def.airJumps, tails: 0,
      attackT: 0, secT: 0, eatT: 0, charge: 0, leaping: false, pouncing: false, attacking: false,
      wallNormal: null, kicksLeft: 1, lastKick: null, hurtT: 0, isCat: true, turn: 0 };
    this.cats.set(id, cat);
    this.inputs.set(id, { mx: 0, mz: 0, yaw: Math.PI, pitch: 0, jump: false, jumpHeld: false, primary: false, secondary: false, aim: null });
    return cat;
  }

  // ---------- commands (the only way players change the game) ----------
  // Why: the same command objects can arrive over the network in co-op.
  command(cmd) {
    const cat = this.cats.get(cmd.id);
    switch (cmd.type) {
      case 'input': {
        const inp = this.inputs.get(cmd.id); if (!inp) return;
        Object.assign(inp, { mx: cmd.mx, mz: cmd.mz, yaw: cmd.yaw, pitch: cmd.pitch || 0, primary: !!cmd.primary, jumpHeld: !!cmd.jumpHeld, aim: cmd.aim || inp.aim });
        if (cmd.jump) inp.jump = true;           // edge-triggered: latched until consumed
        if (cmd.secondary) inp.secondary = true;
        break;
      }
      case 'place': this.placeTrap(cat, cmd.trap, cmd.ax, cmd.az, cmd.rot || 0, cmd.wallDir); break;
      case 'sellTrap': this.sellTrap(cmd.cell, cmd.layer); break;
      case 'sellTails': this.sellTails(cat); break;
      case 'startWave': if (this.phase === 'build') this.phaseTimer = 0; break;
    }
  }

  // ---------- helpers ----------
  emit(e) { this.events.push(e); }
  bark(kind, who, force = false) {
    if (!force && this.barkCooldown > 0) return;
    const lines = BARKS[kind]; this.barkCooldown = 3.5;
    this.emit({ t: 'bark', who: who || 'Fred', text: lines[Math.floor(this.rng() * lines.length)] });
  }
  anyCatName() { const c = this.cats.values().next().value; return c ? c.name : 'Fred'; }
  isWater(i) { return i >= 0 && this.map.type[i] === T.WATER; }
  trapAt(layer, i) { const id = i >= 0 ? this.occ[layer][i] : 0; return id ? this.traps.get(id) : null; }
  isBarricade(i) { const t = this.trapAt('floor', i); return t && t.kind === 'barricade' ? t : null; }

  // Solid column height at a cell. Cats squeeze past the jammed board (gate);
  // mice have to chew it down.
  colH(i, forCat) {
    if (i < 0) return 99;
    const t = this.map.type[i];
    if (t === T.WATER) return -1.2;
    let h = this.map.solid[i];
    if (t === T.GATE && this.gate.up) {
      // The jammed board has a cat-sized gap in the middle; mice must chew it.
      const cx = (i % W + 0.5) * CELL, mid = (GATE.x0 + GATE.x1) / 2;
      h = forCat && Math.abs(cx - mid) < 0.6 ? 0 : 4.2;
    } else if (t === T.GATE) h = 0;
    const bar = this.isBarricade(i);
    if (bar) h = Math.max(h, TRAPS.barricade.height * (0.55 + 0.45 * bar.hp / bar.maxHp));   // same height as the model
    return h;
  }
  blocks(i, y, h, step, forCat) {
    if (i < 0) return true;
    if (this.colH(i, forCat) > y + step) return true;
    const st = this.map.slabTop[i];
    if (st > 0 && this.map.type[i] !== T.SOLID && y + h > this.map.slabBot[i] && y < st - step) return true;
    return false;
  }
  groundAt(i, y, step, forCat) {
    if (i < 0) return -1.2;
    let g = this.colH(i, forCat);
    const st = this.map.slabTop[i];
    if (st > 0 && this.map.type[i] !== T.SOLID && y >= st - step) g = Math.max(g, st);
    return g;
  }

  extraCost(i) {
    let c = 0;
    if (this.map.type[i] === T.GATE && this.gate.up) c += 10 + this.gate.hp / 4;
    for (const layer of ['floor', 'wall', 'ceiling']) {
      const tr = this.trapAt(layer, i); if (!tr) continue;
      if (tr.kind === 'barricade') c += 10 + tr.hp / 4;
      else c += TRAPS[tr.kind].pathCost || 0;
    }
    return c;
  }
  passSmall = (i) => miceWalkable(this.map.type[i]);
  passBig = (i) => this.map.bigOk[i] === 1 || this.map.type[i] === T.HOLE || this.map.type[i] === T.GATE;
  isBlocker = (i) => (this.map.type[i] === T.GATE && this.gate.up) || this.occBarricade(i);
  occBarricade(i) { const id = this.occ.floor[i]; return id ? this.traps.get(id).kind === 'barricade' : false; }
  updateFlow() {
    // Precompute per-cell trap cost + blocker flags once (much faster than
    // looking traps up inside the pathfinder for 46k cells).
    const N = W * H, extra = new Float32Array(N), blk = new Uint8Array(N);
    for (const tr of this.traps.values()) for (const i of tr.cells) {
      extra[i] += tr.kind === 'barricade' ? 10 + tr.hp / 4 : (TRAPS[tr.kind].pathCost || 0);
      if (tr.kind === 'barricade') blk[i] = 1;
    }
    if (this.gate.up) for (let i = 0; i < N; i++) if (this.map.type[i] === T.GATE) { extra[i] += 10 + this.gate.hp / 4; blk[i] = 1; }
    this.blk = blk;
    const base = { goals: this.goals, extra: (i) => extra[i], blocked: (i) => blk[i] === 1 };
    this.flow = computeFlow(this.map, { ...base, pass: this.passSmall });
    this.flowBig = computeFlow(this.map, { ...base, pass: this.passBig });
    this.flowBase = base;
    this.viaDirty.fill(true);          // route-choice fields refresh one per tick (spreads the cost)
    this.flowDirty = false; this.routeCache = null;
  }
  // Flow field toward one route choice (VIAS). Same costs as the main field.
  viaField(k) {
    if (this.viaDirty[k] || !this.viaFlow[k]) {
      if (this.flowDirty || !this.flowBase) this.updateFlow();
      const v = VIAS[k], goals = [];
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const c = cellOf(v.x + dx * CELL, v.z + dz * CELL); if (c >= 0 && this.passSmall(c)) goals.push(c);
      }
      this.viaFlow[k] = computeFlow(this.map, { ...this.flowBase, goals, pass: this.passSmall });
      this.viaDirty[k] = false; this.routeCache = null;
    }
    return this.viaFlow[k];
  }
  // Total cost of going spawn -> route choice -> hole.
  viaCost(k, door) {
    const vf = this.viaField(k), c = cellOf(VIAS[k].x, VIAS[k].z);
    return vf[this.spawnCells[door % this.spawnCells.length]] + this.flow[c];
  }
  // Path of least resistance, but not single file: packs split across routes that cost
  // about the same; a lane made expensive (barricades, the gate) loses its share.
  chooseVia(door) {
    const costs = VIAS.map((_, k) => this.viaCost(k, door));
    const min = Math.min(...costs);
    if (!(min < Infinity)) return -1;
    const w = costs.map((c, k) => (c < Infinity && c <= min * 1.6 + 30) ? VIAS[k].weight * Math.exp(-(c - min) / 40) : 0);
    let r = this.rng() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
    return -1;
  }
  // The routes mice will take right now, one per entrance, as world points.
  // Drawn on the floor and the radar so you can see the invisible pathing.
  routes() {
    if (this.routeCache) return this.routeCache;
    if (this.flowDirty) this.updateFlow();
    const trace = (start, k) => {
      const pts = []; let i = start, f = k >= 0 ? this.viaField(k) : this.flow;
      for (let n = 0; n < 6000 && i >= 0; n++) {
        pts.push(cellCenter(i));
        if (this.map.type[i] === T.HOLE) break;
        if (f !== this.flow && f[i] < 2) f = this.flow;      // reached the route choice: head for the hole
        i = nextCell(this.map, f, i, this.passSmall, this.isBlocker);
        if (i < 0 && f !== this.flow) { f = this.flow; i = cellOf(pts[pts.length - 1][0], pts[pts.length - 1][1]); }
      }
      return pts;
    };
    const out = [];
    this.spawnCells.forEach((start, door) => {
      const costs = VIAS.map((_, k) => this.viaCost(k, door)), min = Math.min(...costs);
      // Direct route first (the one route() returns), then every lane packs may take.
      out.push(trace(start, -1));
      costs.forEach((c, k) => { if (c < Infinity && c <= min * 1.6 + 30) out.push(trace(start, k)); });
    });
    this.routeCache = out;
    return out;
  }
  route() { return this.routes()[0]; }   // direct route from entrance 1

  // ---------- traps ----------
  footprint(kind, ax, az, rot, wallDir) {
    const def = TRAPS[kind]; let [w, d] = def.size;
    const cells = [];
    if (def.surface === 'wall') {
      const alongZ = wallDir === 0 || wallDir === 1;
      for (let k = 0; k < w; k++) cells.push(alongZ ? [ax, az + k] : [ax + k, az]);
    } else {
      if (rot % 2 === 1) [w, d] = [d, w];
      for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) cells.push([ax + x, az + z]);
    }
    return cells.map(([x, z]) => (x < 0 || z < 0 || x >= W || z >= H) ? -1 : idx(x, z));
  }
  canPlace(kind, ax, az, rot = 0, wallDir = -1) {
    const def = TRAPS[kind]; if (!def) return false;
    const cells = this.footprint(kind, ax, az, rot, wallDir);
    const layer = def.surface;
    for (const i of cells) {
      if (i < 0 || this.occ[layer][i]) return false;
      if (!floorish(this.map.type[i])) return false;
      if (layer === 'ceiling' && !this.map.covered[i]) return false;
      if (layer === 'wall') {
        if (wallDir < 0) return false;
        const [dx, dz] = DIRS4[wallDir];
        const n = idx(i % W + dx, ((i / W) | 0) + dz);
        if (this.map.type[n] !== T.SOLID || this.map.solid[n] < 1.0) return false;
      }
    }
    if (kind === 'barricade') {
      for (const m of this.mice) if (m.state === 'walk' && cells.includes(cellOf(m.x, m.z))) return false;
      // Always leave the mice an open route (they can still chew through).
      const extraWall = new Set(cells);
      const test = computeFlow(this.map, { goals: this.goals, pass: this.passSmall, wall: (i) => extraWall.has(i) || this.occBarricade(i) });
      if (this.spawnCells.some(c => !(test[c] < Infinity))) return 'seal';
    }
    return true;
  }
  placeTrap(cat, kind, ax, az, rot, wallDir) {
    const def = TRAPS[kind]; if (!def || !cat) return;
    if (this.sardines < def.cost) { this.emit({ t: 'msg', text: 'Not enough sardines' }); return; }
    const ok = this.canPlace(kind, ax, az, rot, wallDir);
    if (ok === 'seal') { this.emit({ t: 'msg', text: 'Leave them a way through' }); return; }
    if (!ok) { this.emit({ t: 'msg', text: "Can't place that there" }); return; }
    const cells = this.footprint(kind, ax, az, rot, wallDir);
    this.sardines -= def.cost;
    const xs = cells.map(i => i % W), zs = cells.map(i => (i / W) | 0);
    const tr = { id: this.nextId++, kind, cells, layer: def.surface, rot, wallDir, cd: 0, hp: def.hp || 0, maxHp: def.hp || 0,
      cost: def.cost, charges: def.charges || 0, rechargeT: 0, cdMax: def.cooldown || 1,
      x0: Math.min(...xs) * CELL, x1: (Math.max(...xs) + 1) * CELL, z0: Math.min(...zs) * CELL, z1: (Math.max(...zs) + 1) * CELL };
    for (const i of cells) this.occ[tr.layer][i] = tr.id;
    this.traps.set(tr.id, tr);
    this.stats.trapsPlaced++;
    this.flowDirty = true;
    this.emit({ t: 'trapAdd', trap: tr });
  }
  sellTrap(cell, layer) {
    const order = layer ? [layer, 'ceiling', 'wall', 'floor'] : ['ceiling', 'wall', 'floor'];
    for (const l of order) {
      const tr = this.trapAt(l, cell);
      if (tr) {
        // Full refund; a chewed barricade refunds only for the health it has left.
        const refund = tr.kind === 'barricade' ? Math.floor(tr.cost * tr.hp / tr.maxHp) : tr.cost;
        this.removeTrap(tr); this.sardines += refund;
        this.emit({ t: 'msg', text: `Sold for ${refund} sardines` }); return;
      }
    }
  }
  removeTrap(tr) {
    for (const i of tr.cells) if (this.occ[tr.layer][i] === tr.id) this.occ[tr.layer][i] = 0;
    this.traps.delete(tr.id); this.flowDirty = true;
    this.emit({ t: 'trapRemove', id: tr.id });
  }

  // ---------- loot ----------
  reachableSpot(x, z, stranded) {
    let i = cellOf(x, z);
    if (i >= 0 && this.isWater(i) && !stranded) return null;            // sinks
    if (i < 0 || !(this.flow[i] < Infinity) || stranded) {
      i = nearestReachable(this.flow, i < 0 ? cellOf(Math.max(1, Math.min(WORLD_W - 1, x)), Math.max(1, Math.min(WORLD_H - 1, z))) : i);
      if (i < 0) return null;
      [x, z] = cellCenter(i);
    }
    return { x, z, y: this.groundAt(i, 0, 0.3, true) };
  }
  dropTails(x, z, amount, stranded = false) {
    if (amount <= 0) return;
    const p = this.reachableSpot(x, z, stranded); if (!p) return;
    this.tails.push({ id: this.nextId++, ...p, amount });
  }
  dropTrinket(x, z, tier, stranded) {
    const p = this.reachableSpot(x, z, stranded); if (!p) return;
    const pool = Object.keys(TRINKETS).filter(k => TRINKETS[k].tier === tier);
    const key = pool[Math.floor(this.rng() * pool.length)];
    this.loot.push({ id: this.nextId++, ...p, key });
    this.emit({ t: 'msg', text: `A ${TRINKETS[key].tier} trinket dropped!` });
  }
  sellTails(cat) {
    if (!cat || !cat.alive || cat.tails <= 0) return;
    const stall = STALLS.find(s => Math.hypot(cat.x - s.sell[0], cat.z - s.sell[1]) < RULES.stallRadius);
    if (!stall) { this.emit({ t: 'msg', text: 'Bring them to a tail stash' }); return; }
    const pay = Math.round(cat.tails * RULES.tailPrice * this.mods.sell);
    this.sardines += pay;
    this.emit({ t: 'msg', text: `Traded ${cat.tails} tails for ${pay} sardines` });
    this.emit({ t: 'stash', n: cat.tails, stall: STALLS.indexOf(stall) });
    cat.tails = 0; this.bark('sell', cat.name, true);
  }

  // ---------- main step ----------
  step() {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.time += DT; this.tick++;
    this.barkCooldown -= DT;
    if (this.flowDirty) this.updateFlow();
    const vd = this.viaDirty.indexOf(true); if (vd >= 0) this.viaField(vd);
    this.stepPhase();
    for (const cat of this.cats.values()) this.stepCat(cat);
    this.stepTraps();
    this.buildMouseGrid();
    for (const m of this.mice) this.stepMouse(m);
    this.stepShots();
    this.stepGlobs();
    this.stepMissiles();
    if (this.mice.some(m => m.dead)) this.mice = this.mice.filter(m => !m.dead);
    if (this.lives <= 0 && this.phase !== 'lost') {
      this.lives = 0; this.phase = 'lost'; this.emit({ t: 'end', won: false });
    }
  }

  stepPhase() {
    if (this.phase === 'build') {
      this.phaseTimer -= DT;
      if (this.phaseTimer <= 0) {
        this.wave++; this.phase = 'wave';
        this.spawn = { ...buildWave(this.wave, this.rng, this.gate.up), t: 0 }; this.packVia = -2;
        this.emit({ t: 'msg', text: `Wave ${this.wave}` + (this.wave % 12 === 0 ? ' — BIG BOSS RAT' : this.wave % 6 === 0 ? ' — mini boss' : '') });
        this.bark(this.wave % 6 === 0 ? 'boss' : 'wave', this.anyCatName(), true);
      }
      return;
    }
    // Spawn in packs: entries with gap 0 come out together.
    const s = this.spawn;
    if (s.queue.length) {
      s.t -= DT;
      while (s.queue.length && s.t <= 0) {
        const e = s.queue.shift();
        if (this.packVia === -2) this.packVia = this.chooseVia(this.door);    // first mouse of a pack picks the lane
        this.spawnMouse(e.type, s.hpMul, e.pack, this.door, this.packVia);
        if (e.intro) this.emit({ t: 'msg', text: `NEW: ${MICE[e.type].name} — ${INTRO_TEXT[e.type] || ''}` });
        s.t += e.gap;
        if (e.gap > 0.1) { this.door = (this.door + 1) % SPAWNS.length; this.packVia = -2; }   // next pack: other entrance, new lane
      }
    } else if (this.mice.length === 0 && this.shots.length === 0) {
      if (this.mode === 'normal' && this.wave >= RULES.winWave) {
        this.phase = 'won';
        this.rating = ratePaws(this.lives, this.stats);
        this.emit({ t: 'end', won: true, rating: this.rating });
      } else {
        this.phase = 'build'; this.phaseTimer = RULES.buildPhaseSeconds;
        // Income that doesn't depend on hauling tails, so you can always build.
        const bonus = RULES.waveBonus + this.wave * 10; this.sardines += bonus;
        this.emit({ t: 'msg', text: `Wave ${this.wave} cleared  +${bonus} sardines` });
      }
    }
  }

  spawnMouse(type, hpMul, packSize = 1, door = 0, via = -1) {
    const SPAWN = SPAWNS[door % SPAWNS.length];
    const hp = Math.max(1, Math.round(MICE[type].hp * hpMul));
    // Packs spawn in a clump; stragglers come out alone.
    const spread = packSize > 1 ? 2.2 : 0.6;
    const m = this.spawnAt(type, SPAWN.x + (this.rng() - 0.5) * spread * 2, SPAWN.z - 0.4 - this.rng() * spread, hp, via);
    if (MICE[type].boss) { this.emit({ t: 'bossRoar' }); this.emit({ t: 'msg', text: `${MICE[type].name.toUpperCase()} IS COMING` }); }
    return m;
  }
  // Put one mouse in the world. lane: where across the corridor it likes to run
  // (-1 left wall .. +1 right wall) so a mob fills the lane instead of a single file.
  spawnAt(type, x, z, hp, via = -1) {
    const m = { id: this.nextId++, type, x, y: 0, z,
      vx: 0, vy: 0, vz: 0, yaw: Math.PI, hp, maxHp: hp, state: 'walk', bleed: [], biteT: 0, attackT: 0,
      lobbed: false, lobT: 0, dead: false, flash: 0, slowT: 0, stuckT: 0, stunT: 0, stunMax: 1, glueId: 0, tackT: 0, onGround: true,
      scale: 0.88 + this.rng() * 0.24, shade: (this.rng() - 0.5) * 0.25, wander: this.rng() * 6.28, packed: false,
      lane: (this.rng() * 2 - 1) * 0.9, via, spitT: 1 + this.rng() * 2, stompT: 1.5, windT: 0 };
    this.mice.push(m);
    return m;
  }

  damageMouse(m, n, source, crit = false) {
    if (m.dead) return;
    if (m.packed && source !== 'stranded') n *= RULES.packDamageTaken;
    m.hp -= n; m.flash = 0.12;
    if (n >= 1) this.emit({ t: 'dmg', x: m.x, y: m.y + MICE[m.type].size, z: m.z, n: Math.round(n), crit });
    if (m.hp <= 0) this.killMouse(m, source);
  }
  killMouse(m, source, drowned = false, eaten = false) {
    if (m.dead) return;
    m.dead = true; this.stats.kills++;
    const d = MICE[m.type], stranded = m.state === 'stranded';
    if (!drowned) {
      if (d.boss) this.dropTrinket(m.x, m.z, this.rng() < 0.35 ? 'legendary' : 'rare', stranded);
      else if (this.rng() < RULES.trinketChance) this.dropTrinket(m.x, m.z, this.rng() < 0.3 ? 'rare' : 'common', stranded);
      if (!eaten && this.rng() < d.tailChance) {
        this.tailAcc += d.tails * this.mods.tails;
        const n = Math.floor(this.tailAcc); this.tailAcc -= n;
        this.dropTails(m.x, m.z, n, stranded);
      }
    }
    if (d.yarn) { this.yarn += d.yarn; this.emit({ t: 'msg', text: `+${d.yarn} yarn` }); }
    // Splitters burst into smaller mice (not if eaten or drowned — that's the counter-play).
    if (d.split && !drowned && !eaten && !stranded) {
      const hp = Math.max(1, Math.round(MICE[d.split].hp * (m.maxHp / d.hp)));
      for (let k = 0; k < d.splitN; k++) {
        const a = this.rng() * Math.PI * 2;
        const c = this.spawnAt(d.split, m.x, m.z, hp, m.via);
        this.launch(c, Math.cos(a) * 2.5, 4, Math.sin(a) * 2.5);
      }
      this.emit({ t: 'burst', x: m.x, y: m.y, z: m.z });
    }
    this.emit({ t: 'kill', x: m.x, y: m.y, z: m.z, type: m.type, drowned, eaten, splat: source === 'splat' });
    const who = this.anyCatName();
    if (source === 'trap' || source === 'splat') this.bark('trap', who); else if (source === 'cat') this.bark('kill', who);
  }

  // ---------- cats ----------
  stepCat(cat) {
    const inp = this.inputs.get(cat.id), def = cat.def, mods = this.mods;
    if (!cat.alive) {
      cat.respawnT -= DT; inp.jump = inp.secondary = false;
      if (cat.respawnT <= 0) Object.assign(cat, { alive: true, hp: def.maxHp, energy: CAT.maxEnergy, x: CAT_SPAWN.x, z: CAT_SPAWN.z, y: 0, vx: 0, vy: 0, vz: 0, charge: 0 });
      return;
    }
    cat.turn = inp.yaw - cat.yaw;   // for the tail flick
    cat.yaw = inp.yaw; cat.pitch = inp.pitch;
    cat.hurtT = Math.max(0, cat.hurtT - DT);
    cat.energy = Math.min(CAT.maxEnergy, cat.energy + def.energyRegen * mods.regen * DT);
    cat.attackT = Math.max(0, cat.attackT - DT); cat.secT = Math.max(0, cat.secT - DT); cat.eatT = Math.max(0, cat.eatT - DT);

    // Knocked silly by a boss stomp: no moving or attacking until it wears off.
    if (cat.stunT > 0) { cat.stunT -= DT; inp.primary = false; inp.secondary = false; inp.jump = false; }
    // Movement: snappy on the ground, partial in the air. Charging a leap slows you.
    if (!cat.pouncing && !(cat.stunT > 0)) {
      const sp = def.speed * mods.speed * (cat.charge > 0 ? 0.4 : 1);
      const k = cat.onGround ? 0.55 : def.airControl;   // quick but not instant: no ice-skating, no robot stops
      cat.vx += (inp.mx * sp - cat.vx) * k; cat.vz += (inp.mz * sp - cat.vz) * k;
    }
    // Jumping. Fred: jump, one air jump, and wall kicks (one per wall per airtime,
    // must alternate walls — no climbing to the sky). Puddin: hold to charge.
    if (def.leap) {
      if (inp.jumpHeld && cat.onGround) cat.charge = Math.min(CAT.leapMaxCharge, cat.charge + DT);
      else if (!inp.jumpHeld && cat.charge > 0) {
        if (cat.onGround) {
          cat.vy = def.jumpVel + CAT.leapExtra * (cat.charge / CAT.leapMaxCharge);
          cat.onGround = false; cat.leaping = cat.charge > 0.25;
          this.emit({ t: 'leap', id: cat.id, power: cat.charge / CAT.leapMaxCharge });
        }
        cat.charge = 0;
      }
      inp.jump = false;
    } else if (inp.jump) {
      if (cat.onGround) { cat.vy = def.jumpVel; cat.onGround = false; }
      else if (def.wallKick && cat.wallNormal && cat.kicksLeft > 0 && !sameWall(cat.lastKick, cat.wallNormal)) {
        cat.vy = def.jumpVel; cat.vx = cat.wallNormal[0] * def.wallKick; cat.vz = cat.wallNormal[1] * def.wallKick;
        cat.kicksLeft--; cat.lastKick = cat.wallNormal.slice();
        this.emit({ t: 'wallkick', x: cat.x, y: cat.y, z: cat.z });
      } else if (cat.airJumps > 0) { cat.vy = def.jumpVel * 0.9; cat.airJumps--; }
      inp.jump = false;
    }

    // Right click.
    if (inp.secondary) {
      inp.secondary = false;
      if (def.secondary === 'hairball') this.fireHairball(cat, inp);
      else if (def.secondary === 'pounce') this.pounce(cat, inp);
    }
    // Left click (held): Fred spits pellets, Puddin bites.
    cat.attacking = inp.primary;
    if (inp.primary && cat.attackT <= 0) {
      if (def.primary === 'pellet') this.firePellet(cat, inp);
      else this.bite(cat);
    }

    cat.vy -= GRAVITY * DT;
    const wasAir = !cat.onGround;
    this.moveBody(cat, def.radius, def.height, def.stepHeight, true, def.mantle);
    if (cat.y > CEILING_Y) { cat.y = CEILING_Y; cat.vy = Math.min(0, cat.vy); }
    if (cat.onGround) {
      cat.airJumps = def.airJumps; cat.kicksLeft = 2; cat.lastKick = null;
      if (wasAir && cat.pouncing) this.pounceLand(cat);
      if (wasAir && cat.leaping && cat.landV > 9) this.slam(cat);
      cat.pouncing = false; cat.leaping = false;
    }
    // Shove through crowds of mice.
    for (const m of this.nearMice(cat.x, cat.z, def.radius + 0.6)) {
      if (m.state !== 'walk' || Math.abs(m.y - cat.y) > 0.8) continue;
      const dx = m.x - cat.x, dz = m.z - cat.z, d = Math.hypot(dx, dz) || 0.01, min = def.radius + MICE[m.type].size * 0.35;
      if (d < min) { const push = (min - d) * def.push / (MICE[m.type].boss ? 6 : 1); m.x += dx / d * push; m.z += dz / d * push; }
    }
    // Water kills everything.
    if (this.isWater(cellOf(cat.x, cat.z)) && cat.y < -0.2) { this.killCat(cat, true); return; }

    // Pick up tails + trinkets.
    for (const t of this.tails) {
      if (t.amount > 0 && cat.tails < RULES.tailCarryCap && Math.hypot(t.x - cat.x, t.z - cat.z) < RULES.pickupRadius && Math.abs(t.y - cat.y) < 1.5) {
        const take = Math.min(t.amount, RULES.tailCarryCap - cat.tails);
        cat.tails += take; t.amount -= take; this.emit({ t: 'pickup', n: take });
      }
    }
    if (this.tails.some(t => t.amount <= 0)) this.tails = this.tails.filter(t => t.amount > 0);
    for (const l of this.loot) {
      if (!l.taken && Math.hypot(l.x - cat.x, l.z - cat.z) < RULES.pickupRadius && Math.abs(l.y - cat.y) < 1.5) {
        l.taken = true; this.trinkets[l.key] = (this.trinkets[l.key] || 0) + 1;
        const tdef = TRINKETS[l.key];
        this.emit({ t: 'msg', text: `${tdef.name}: ${tdef.desc}` }); this.emit({ t: 'trinket', key: l.key });
        this.bark('trinket', cat.name, true);
      }
    }
    if (this.loot.some(l => l.taken)) this.loot = this.loot.filter(l => !l.taken);
  }

  aimFrom(cat, inp) {
    // Fall back to straight ahead if the client sent no aim point.
    return inp.aim || { x: cat.x + Math.sin(cat.yaw) * 20, y: cat.y + 0.5, z: cat.z + Math.cos(cat.yaw) * 20 };
  }
  firePellet(cat, inp) {
    cat.attackT = CAT.pelletInterval * this.mods.attackCd;
    const a = this.aimFrom(cat, inp);
    const sx = cat.x + Math.sin(cat.yaw) * 0.4, sy = cat.y + cat.def.height * 0.75, sz = cat.z + Math.cos(cat.yaw) * 0.4;
    const dx = a.x - sx, dy = a.y - sy, dz = a.z - sz, d = Math.hypot(dx, dy, dz) || 1;
    this.missiles.push({ id: this.nextId++, kind: 'pellet', x: sx, y: sy, z: sz, vx: dx / d * CAT.pelletSpeed, vy: dy / d * CAT.pelletSpeed, vz: dz / d * CAT.pelletSpeed, life: 0.9, g: 2 });
    this.emit({ t: 'spit', id: cat.id });
  }
  fireHairball(cat, inp) {
    if (cat.secT > 0 || cat.energy < CAT.hairballCost) return;
    const a = this.aimFrom(cat, inp);
    const sx = cat.x, sy = cat.y + cat.def.height * 0.8, sz = cat.z;
    const dx = a.x - sx, dz = a.z - sz, dy = a.y - sy, dh = Math.hypot(dx, dz) || 0.01;
    const t = Math.max(0.15, dh / CAT.hairballSpeed), g = GRAVITY * 0.6;
    this.missiles.push({ id: this.nextId++, kind: 'hairball', x: sx, y: sy, z: sz, vx: dx / t, vz: dz / t, vy: (dy + 0.5 * g * t * t) / t, life: 4, g });
    cat.energy -= CAT.hairballCost; cat.secT = CAT.hairballCooldown * this.mods.abilityCd;
    this.stats.abilitiesUsed++; this.stats.energyUsed += CAT.hairballCost;
    this.emit({ t: 'hairball', id: cat.id });
  }
  bite(cat) {
    cat.attackT = CAT.biteInterval * this.mods.attackCd;
    const fx = Math.sin(cat.yaw), fz = Math.cos(cat.yaw);
    let best = null, bd = Infinity;
    for (const m of this.nearMice(cat.x, cat.z, CAT.biteRange + 1)) {
      if (m.dead || Math.abs(m.y - cat.y) > 1.2) continue;
      const dx = m.x - cat.x, dz = m.z - cat.z, d = Math.hypot(dx, dz);
      if (d > CAT.biteRange + MICE[m.type].size * 0.5) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
      if (d > 0.5 && ang > CAT.biteArc) continue;
      if (d < bd) { bd = d; best = m; }
    }
    this.emit({ t: 'bite', id: cat.id });
    if (!best) return;
    const crit = this.rng() < this.mods.crit;
    const dmg = CAT.biteDamage * (crit ? 2 : 1);
    // A killing bite eats the mouse if the eat cooldown is ready: heal, no tail.
    if (best.hp - dmg <= 0 && cat.eatT <= 0 && !MICE[best.type].boss) {
      cat.eatT = CAT.eatCooldown;
      cat.hp = Math.min(cat.def.maxHp, cat.hp + cat.def.maxHp * CAT.eatHeal);
      this.killMouse(best, 'cat', false, true);
      this.emit({ t: 'eat', id: cat.id, x: best.x, z: best.z }); this.bark('eat', cat.name);
      return;
    }
    this.damageMouse(best, dmg, 'cat', crit);
  }
  pounce(cat, inp) {
    if (cat.secT > 0 || cat.energy < CAT.pounceCost || !cat.onGround) return;
    const a = this.aimFrom(cat, inp);
    const dx = a.x - cat.x, dz = a.z - cat.z, d = Math.hypot(dx, dz) || 1;
    const reach = Math.max(0.4, Math.min(1, d / 6));   // short aims make short pounces
    cat.vx = dx / d * CAT.pounceH * reach; cat.vz = dz / d * CAT.pounceH * reach;
    cat.vy = CAT.pounceV; cat.onGround = false; cat.pouncing = true;
    cat.energy -= CAT.pounceCost; cat.secT = CAT.pounceCooldown * this.mods.abilityCd;
    this.stats.abilitiesUsed++; this.stats.energyUsed += CAT.pounceCost;
    this.emit({ t: 'pounce', id: cat.id });
  }
  pounceLand(cat) {
    this.emit({ t: 'pounceLand', x: cat.x, z: cat.z, y: cat.y });
    for (const m of this.nearMice(cat.x, cat.z, CAT.pounceRadius + 0.5)) {
      if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > CAT.pounceRadius || Math.abs(m.y - cat.y) > 1.2) continue;
      m.stunT = m.stunMax = MICE[m.type].boss ? CAT.pounceStun * 0.4 : CAT.pounceStun;
      m.windT = 0;                                   // interrupts a boss stomp wind-up
      this.damageMouse(m, CAT.pounceDamage, 'splat');
    }
  }
  // Puddin's heavy landing flings small mice away.
  slam(cat) {
    this.emit({ t: 'slam', x: cat.x, z: cat.z, y: cat.y });
    for (const m of this.nearMice(cat.x, cat.z, CAT.slamRadius + 0.5)) {
      if (m.dead || m.state !== 'walk' || MICE[m.type].size > 0.6) continue;
      const dx = m.x - cat.x, dz = m.z - cat.z, d = Math.hypot(dx, dz) || 0.1;
      if (d > CAT.slamRadius || Math.abs(m.y - cat.y) > 1) continue;
      this.launch(m, dx / d * CAT.slamPush, 4, dz / d * CAT.slamPush);
    }
  }

  killCat(cat, drowned) {
    if (!cat.alive) return;
    cat.alive = false; cat.respawnT = RULES.catRespawnSeconds;
    if (!drowned) this.dropTails(cat.x, cat.z, cat.tails);   // drowned tails are lost
    cat.tails = 0; cat.charge = 0;
    this.lives -= RULES.livesLostPerCatDeath;
    this.emit({ t: 'catDeath', id: cat.id, drowned });
    this.emit({ t: 'msg', text: `${cat.name} died  −${RULES.livesLostPerCatDeath} lives` });
    this.bark('death', cat.name, true);
  }

  // Movement against the cell height-field (with overhangs). Moves x then z
  // separately so bodies slide along walls; records a wall normal for kicks.
  // mantle: cats hop up onto ledges up to this far above their feet.
  moveBody(b, r, h, step, forCat, mantle = 0) {
    b.wallNormal = null; b.bumpV = 0;
    const tryAxis = (ax) => {
      const nx = ax === 0 ? b.x + b.vx * DT : b.x;
      const nz = ax === 1 ? b.z + b.vz * DT : b.z;
      for (const [px, pz] of [[nx + r, nz + r], [nx - r, nz + r], [nx + r, nz - r], [nx - r, nz - r]]) {
        const ci = cellOf(px, pz);
        if (this.blocks(ci, b.y, h, step, forCat)) {
          const top = this.colH(ci, forCat);
          if (mantle && top > b.y && top <= b.y + mantle && this.map.slabTop[ci] === 0 && !this.blocks(ci, top + 0.01, h, step, forCat)) {
            b.y = top + 0.01; b.vy = Math.max(b.vy, 0); continue;   // parkour: pull up onto the ledge
          }
          if (ax === 0) { b.wallNormal = [-Math.sign(b.vx) || 0, 0]; b.bumpV = Math.abs(b.vx); b.vx = 0; }
          else { b.wallNormal = [0, -Math.sign(b.vz) || 0]; b.bumpV = Math.max(b.bumpV, Math.abs(b.vz)); b.vz = 0; }
          return;
        }
      }
      b.x = nx; b.z = nz;
    };
    tryAxis(0); tryAxis(1);
    if (!b.wallNormal && !b.onGround) {
      for (const [dx, dz] of DIRS4) {
        if (this.blocks(cellOf(b.x + dx * (r + 0.12), b.z + dz * (r + 0.12)), b.y, h, step, forCat)) { b.wallNormal = [-dx, -dz]; break; }
      }
    }
    let ground = -Infinity;
    for (const [px, pz] of [[b.x + r * 0.7, b.z + r * 0.7], [b.x - r * 0.7, b.z + r * 0.7], [b.x + r * 0.7, b.z - r * 0.7], [b.x - r * 0.7, b.z - r * 0.7]]) {
      const g = this.groundAt(cellOf(px, pz), b.y, step, forCat);
      if (g <= b.y + step) ground = Math.max(ground, g);
    }
    if (ground === -Infinity) ground = -1.2;
    const prevY = b.y;
    b.landV = 0;
    b.y += b.vy * DT;
    const ci = cellOf(b.x, b.z);
    if (ci >= 0 && this.map.slabTop[ci] > 0 && this.map.type[ci] !== T.SOLID) {
      const bot = this.map.slabBot[ci];
      if (prevY + h <= bot + 0.02 && b.y + h > bot) { b.y = bot - h; b.vy = Math.min(0, b.vy); }   // head bump
    }
    if (b.y <= ground) { b.landV = -b.vy; b.y = ground; b.vy = 0; b.onGround = true; }
    else b.onGround = b.y - ground < 0.02;
    b.x = Math.max(0.3, Math.min(W * CELL - 0.3, b.x)); b.z = Math.max(0.3, Math.min(H * CELL - 0.3, b.z));
  }

  // ---------- mice ----------
  // Spatial hash (1-unit buckets) so mice can find their neighbours cheaply.
  buildMouseGrid() {
    const g = new Map();
    for (const m of this.mice) {
      if (m.dead) continue;
      const k = (Math.floor(m.x) << 8) | Math.floor(m.z);
      let b = g.get(k); if (!b) g.set(k, b = []); b.push(m);
    }
    this.mgrid = g;
  }
  nearMice(x, z, r) {
    const out = [], g = this.mgrid; if (!g) return this.mice;
    for (let gx = Math.floor(x - r); gx <= Math.floor(x + r); gx++)
      for (let gz = Math.floor(z - r); gz <= Math.floor(z + r); gz++) {
        const b = g.get((gx << 8) | gz); if (b) for (const m of b) out.push(m);
      }
    return out;
  }
  launch(m, vx, vy, vz) {
    m.state = 'air'; m.onGround = false; m.vx = vx; m.vy = vy; m.vz = vz; m.y += 0.05;
  }

  stepMouse(m) {
    if (m.dead) return;
    const d = MICE[m.type], r = d.size * 0.35;
    m.flash = Math.max(0, m.flash - DT);
    m.slowT = Math.max(0, m.slowT - DT);
    if (m.bleed.length) {
      this.damageMouse(m, m.bleed.length * CAT.bleedDps * DT, 'cat');
      m.bleed = m.bleed.map(t => t - DT).filter(t => t > 0);
      if (m.dead) return;
    }

    if (m.state === 'air') {
      m.vy -= GRAVITY * DT;
      this.moveBody(m, r, d.size * 0.8, 0.05, false);
      if (m.bumpV > 6) this.damageMouse(m, (m.bumpV - 6) * 4, 'splat');   // smacked into a wall
      if (m.dead) return;
      // Bowling: a flying mouse knocks over the ones it hits.
      const sp = Math.hypot(m.vx, m.vz);
      if (sp > 5) for (const o of this.nearMice(m.x, m.z, 0.8)) {
        if (o === m || o.dead || o.state !== 'walk' || Math.abs(o.y - m.y) > 0.6) continue;
        if (Math.hypot(o.x - m.x, o.z - m.z) < r + MICE[o.type].size * 0.35 + 0.1 && MICE[o.type].size <= d.size * 1.5) {
          this.launch(o, m.vx * 0.5, 3, m.vz * 0.5); this.damageMouse(o, 3, 'splat');
        }
      }
      if (m.onGround) {
        const li = cellOf(m.x, m.z);
        if (this.isWater(li)) { this.emit({ t: 'splash', x: m.x, z: m.z }); this.killMouse(m, 'trap', true); return; }
        if (m.landV > RULES.splatSpeed) {
          this.emit({ t: 'splat', x: m.x, y: m.y, z: m.z, big: m.landV > 16 });
          this.damageMouse(m, (m.landV - RULES.splatSpeed) * RULES.splatDamage * this.mods.trapDmg, 'splat');
        }
        if (m.dead) return;
        const flow = d.big ? this.flowBig : this.flow;
        m.state = (li >= 0 && flow[li] < Infinity && m.y < 0.3) ? 'walk' : 'stranded';
        m.vx = m.vz = 0;
      }
      return;
    }
    if (m.state === 'stranded') { this.damageMouse(m, RULES.unreachableDps * DT, 'stranded'); return; }
    if (m.stunT > 0) { m.stunT -= DT; return; }
    if (m.state === 'stuck') { m.stuckT -= DT; if (m.stuckT <= 0) m.state = 'walk'; return; }

    const i = cellOf(m.x, m.z);
    if (i >= 0 && this.map.type[i] === T.HOLE) {
      m.dead = true;
      this.lives -= d.boss ? RULES.livesLostPerBoss : RULES.livesLostPerMouse;
      this.emit({ t: 'leak', boss: !!d.boss });
      this.emit({ t: 'msg', text: d.boss ? 'A boss got into the great hall!' : 'A mouse got into the great hall' });
      return;
    }
    const pass = d.big ? this.passBig : this.passSmall;
    let flow = d.big ? this.flowBig : this.flow;
    if (i < 0 || !(flow[i] < Infinity)) { m.state = 'stranded'; return; }
    // Follow the pack's lane choice until it's reached, then head straight for the hole.
    if (!d.big && m.via >= 0) {
      const vf = this.viaFlow[m.via];
      if (!vf || !(vf[i] < Infinity) || vf[i] < 2) m.via = -1; else flow = vf;
    }

    // Siege lobber: stops in range of a standing gate and lobs a rock at it.
    if (m.type === 'lobber' && this.gate.up && !m.lobbed) {
      const gx = (GATE.x0 + GATE.x1) / 2, gz = (GATE.z0 + GATE.z1) / 2;
      if (Math.hypot(m.x - gx, m.z - gz) < 13) {
        m.lobT += DT;
        if (m.lobT > 1.5) {
          m.lobbed = true;
          const tf = 1.4, dx = gx - m.x, dz = gz - m.z;
          this.shots.push({ id: this.nextId++, x: m.x, y: 0.5, z: m.z, vx: dx / tf, vz: dz / tf, vy: (3 - 0.5 + 0.5 * GRAVITY * tf * tf) / tf, t: tf });
          this.emit({ t: 'msg', text: 'Siege mouse is lobbing at the board!' });
        }
        return;
      }
    }

    // Nearest cat on (roughly) our level — what we fight.
    let foe = null, foeD = Infinity;
    for (const cat of this.cats.values()) {
      if (!cat.alive || Math.abs(cat.y - m.y) > 1.2) continue;
      const dd = Math.hypot(cat.x - m.x, cat.z - m.z);
      if (dd < foeD) { foe = cat; foeD = dd; }
    }

    // Boss stomp: wind up (red ring warning), then slam — hurts, stuns and flings cats.
    if (d.stomp) {
      m.stompT -= DT;
      if (m.windT > 0) {
        m.windT -= DT;
        if (m.windT <= 0) {
          this.emit({ t: 'stomp', x: m.x, z: m.z, r: d.stomp.radius });
          for (const cat of this.cats.values()) {
            if (!cat.alive || cat.y > m.y + 1.5) continue;
            const dx = cat.x - m.x, dz = cat.z - m.z, dd = Math.hypot(dx, dz) || 0.1;
            if (dd > d.stomp.radius) continue;
            this.hurtCat(cat, d.stomp.dmg);
            cat.stunT = d.stomp.stun; cat.vx = dx / dd * d.stomp.fling; cat.vz = dz / dd * d.stomp.fling; cat.vy = 6; cat.onGround = false;
          }
        }
        return;                                   // stands still while winding up
      }
      if (m.stompT <= 0 && foe && foeD < d.stomp.radius * 0.8) {
        m.stompT = d.stomp.every; m.windT = 0.7;
        this.emit({ t: 'stompWarn', id: m.id, x: m.x, z: m.z, r: d.stomp.radius });
      }
    }

    // Plague rats spit at cats in range while they keep walking.
    if (d.spit) {
      m.spitT -= DT;
      if (m.spitT <= 0 && foe && foeD < d.spit.range) {
        m.spitT = d.spit.every;
        const tf = foeD / d.spit.speed, ty = foe.y + 0.5;
        this.globs.push({ id: this.nextId++, x: m.x, y: 0.5, z: m.z, vx: (foe.x + foe.vx * tf - m.x) / tf, vz: (foe.z + foe.vz * tf - m.z) / tf,
          vy: (ty - 0.5 + 0.5 * GRAVITY * tf * tf) / tf, dmg: d.spit.dmg, t: 3 });
        this.emit({ t: 'spit', x: m.x, z: m.z });
      }
    }

    // Bite any cat we bump into.
    m.biteT -= DT;
    if (m.biteT <= 0 && foe && foeD < d.size * 0.5 + foe.def.radius + 0.15) {
      m.biteT = 1.0; this.hurtCat(foe, d.bite * this.mods.bite);
    }

    // Neighbours: count packmates (strength in numbers) and push apart (collision).
    let packN = 0, sx = 0, sz = 0;
    for (const o of this.nearMice(m.x, m.z, RULES.packRadius)) {
      if (o === m || o.dead || o.state !== 'walk') continue;
      const dx = m.x - o.x, dz = m.z - o.z, dist = Math.hypot(dx, dz);
      if (dist < RULES.packRadius) packN++;
      const min = r + MICE[o.type].size * 0.35;
      if (dist < min && dist > 0.0001) { const push = (min - dist) / dist * (MICE[o.type].size >= d.size ? 0.5 : 0.25); sx += dx * push; sz += dz * push; }
    }
    m.packed = packN >= RULES.packCount;

    const ok = (x, z) => { const c = cellOf(x, z); return c >= 0 && pass(c) && !this.isBlocker(c); };
    const sp = d.speed * (m.slowT > 0 ? CAT.hairballSlow : 1) * (m.packed ? RULES.packSpeed : 1);
    let mx, mz;
    if (foe && d.aggro && foeD < d.aggro && foe.onGround !== false) {
      // Go for the cat. Stop at biting distance (no pushing into it).
      const dx = foe.x - m.x, dz = foe.z - m.z, dd = foeD || 1, reach = d.size * 0.5 + foe.def.radius;
      const go = dd > reach ? 1.15 : 0;
      mx = dx / dd * go; mz = dz / dd * go; m.yaw = Math.atan2(dx, dz);
    } else {
      // Follow the flow field.
      const n = nextCell(this.map, flow, i, pass, this.isBlocker);
      if (n < 0) return;
      const [cx, cz] = cellCenter(n);
      const dx = cx - m.x, dz = cz - m.z, dist = Math.hypot(dx, dz) || 1;
      if (this.isBlocker(n) && dist < 0.75) {
        m.attackT -= DT;
        if (m.attackT <= 0) {
          m.attackT = 1.0;
          // Re-path only when a blocker breaks (re-pathing on every bite would lag).
          if (this.map.type[n] === T.GATE && this.gate.up) {
            this.gate.hp -= d.gateDmg; this.emit({ t: 'gateHit' });
            if (this.gate.hp <= 0) this.breakGate();
          } else {
            const b = this.isBarricade(n);
            if (b) { b.hp -= d.gateDmg; this.emit({ t: 'barricadeHit', id: b.id }); if (b.hp <= 0) this.removeTrap(b); }
          }
        }
        m.yaw = Math.atan2(dx, dz);
        return;
      }
      // Heading = the flow's cell-to-cell direction (not "aim at the next cell centre",
      // which funnels everyone into one file). Then steer sideways toward this mouse's
      // lane across the corridor, measured by probing to the walls each side.
      const [ix, iz] = cellCenter(i);
      let fx = cx - ix, fz = cz - iz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const px = -fz, pz = fx;
      let dp = 0, dn = 0;
      for (let k = 1; k <= 8; k++) { if (ok(m.x + px * k * 0.5, m.z + pz * k * 0.5)) dp = k * 0.5; else break; }
      for (let k = 1; k <= 8; k++) { if (ok(m.x - px * k * 0.5, m.z - pz * k * 0.5)) dn = k * 0.5; else break; }
      const half = (dp + dn) / 2, pos = (dn - dp) / 2;           // where we are across the corridor (+ = toward +perp)
      const want = m.lane * Math.max(0, Math.min(half - r - 0.25, 3.5));
      const lat = Math.max(-0.7, Math.min(0.7, (want - pos) * 1.2));
      m.wander += DT * 2;
      const wob = Math.sin(m.wander) * 0.12;
      mx = fx + px * (lat + wob); mz = fz + pz * (lat + wob);
      m.yaw = Math.atan2(fx, fz);
    }
    const ox = m.x, oz = m.z;
    m.x += mx * sp * DT + sx; m.z += mz * sp * DT + sz;
    // Walls: mice can't be shoved into solid tiles; slide along them instead.
    if (!ok(m.x, m.z)) { if (ok(m.x, oz)) m.z = oz; else if (ok(ox, m.z)) m.x = ox; else { m.x = ox; m.z = oz; } }
    m.y = 0;
  }

  // One place for "a mouse hurt a cat" (bites, spit, stomps).
  hurtCat(cat, dmg) {
    if (!cat.alive) return;
    cat.hp -= dmg; cat.hurtT = 0.3; this.stats.damageTaken += dmg;
    this.emit({ t: 'catHurt', id: cat.id });
    if (cat.hp <= 0) this.killCat(cat, false);
  }

  // Plague spit: arcs at a cat, hurts on contact, splats on the floor.
  stepGlobs() {
    for (const g of this.globs) {
      g.vy -= GRAVITY * DT; g.x += g.vx * DT; g.y += g.vy * DT; g.z += g.vz * DT; g.t -= DT;
      for (const cat of this.cats.values()) {
        if (cat.alive && Math.hypot(cat.x - g.x, cat.z - g.z) < cat.def.radius + 0.25 && g.y > cat.y - 0.2 && g.y < cat.y + cat.def.height + 0.2) {
          this.hurtCat(cat, g.dmg); g.done = true; break;
        }
      }
      if (!g.done && (g.y <= this.colH(cellOf(g.x, g.z), false) || g.t <= 0)) g.done = true;
      if (g.done) this.emit({ t: 'globSplat', x: g.x, y: Math.max(0, g.y), z: g.z });
    }
    if (this.globs.some(g => g.done)) this.globs = this.globs.filter(g => !g.done);
  }

  breakGate() {
    if (!this.gate.up) return;
    this.gate.up = false; this.gate.hp = 0; this.flowDirty = true;
    this.emit({ t: 'gateBreak' }); this.bark('gate', this.anyCatName(), true);
  }

  stepShots() {
    for (const s of this.shots) {
      s.vy -= GRAVITY * DT; s.x += s.vx * DT; s.y += s.vy * DT; s.z += s.vz * DT; s.t -= DT;
      if (s.t <= 0) { this.breakGate(); this.emit({ t: 'boom', x: s.x, z: s.z }); s.done = true; }
    }
    if (this.shots.some(s => s.done)) this.shots = this.shots.filter(s => !s.done);
  }

  // Cat projectiles: pellets (fast, single target, bleed) and hairballs (arc, splash, slow).
  stepMissiles() {
    for (const b of this.missiles) {
      b.vy -= b.g * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; b.life -= DT;
      const i = cellOf(b.x, b.z);
      let hitMouse = null;
      for (const m of this.nearMice(b.x, b.z, 1.2)) {
        const s = MICE[m.type].size;
        if (!m.dead && Math.hypot(m.x - b.x, m.z - b.z) < s * 0.5 + 0.2 && Math.abs(m.y + s * 0.4 - b.y) < s * 0.6 + 0.2) { hitMouse = m; break; }
      }
      const hitWorld = b.life <= 0 || i < 0 || b.y <= this.groundAt(i, b.y + 0.1, 0.1, true) || this.blocks(i, b.y, 0.15, 0, true);
      if (!hitMouse && !hitWorld) continue;
      b.done = true;
      if (b.kind === 'pellet') {
        if (hitMouse) {
          if (hitMouse.bleed.length < this.mods.bleedMax) hitMouse.bleed.push(CAT.bleedSeconds); else hitMouse.bleed[0] = CAT.bleedSeconds;
          const crit = this.rng() < this.mods.crit;
          this.damageMouse(hitMouse, CAT.pelletDamage * (crit ? 2 : 1), 'cat', crit);
        }
        this.emit({ t: 'pelletHit', x: b.x, y: Math.max(0, b.y), z: b.z, mouse: !!hitMouse });
      } else {
        this.emit({ t: 'hairSplat', x: b.x, y: Math.max(0, b.y), z: b.z });
        for (const m of this.nearMice(b.x, b.z, CAT.hairballRadius + 0.5)) {
          if (m.dead || Math.hypot(m.x - b.x, m.z - b.z) > CAT.hairballRadius || Math.abs(m.y - b.y) > 1.5) continue;
          m.slowT = CAT.hairballSlowSecs;
          this.damageMouse(m, CAT.hairballDamage, 'cat', this.rng() < this.mods.crit);
        }
      }
    }
    if (this.missiles.some(b => b.done)) this.missiles = this.missiles.filter(b => !b.done);
  }

  // ---------- trap behaviour ----------
  stepTraps() {
    const mods = this.mods;
    const inRect = (b, tr, pad = 0.1) => b.x > tr.x0 - pad && b.x < tr.x1 + pad && b.z > tr.z0 - pad && b.z < tr.z1 + pad;
    const grounded = (m) => (m.state === 'walk' || m.state === 'stuck') && m.y < 0.3;
    // Wall traps work on the strip of floor in front of them, `reach` units out from the wall.
    const lane = (tr, reach) => {
      const [wx, wz] = DIRS4[tr.wallDir], nx = -wx, nz = -wz;
      return { x0: Math.min(tr.x0, tr.x0 + nx * reach), x1: Math.max(tr.x1, tr.x1 + nx * reach),
               z0: Math.min(tr.z0, tr.z0 + nz * reach), z1: Math.max(tr.z1, tr.z1 + nz * reach), nx, nz };
    };
    const reset = (tr, secs) => { tr.cd = tr.cdMax = secs * mods.trapCd; };
    for (const tr of this.traps.values()) {
      tr.cd = Math.max(0, tr.cd - DT);
      const def = TRAPS[tr.kind];
      if (tr.kind === 'mousetrap' && tr.cd === 0) {
        // Like a spike trap: snaps everything standing on the tile.
        const vs = this.mice.filter(m => !m.dead && grounded(m) && inRect(m, tr, 0)).slice(0, def.maxHits);
        if (vs.length) { reset(tr, def.cooldown); this.emit({ t: 'snap', id: tr.id }); for (const m of vs) this.damageMouse(m, def.damage * mods.trapDmg, 'trap'); }
      } else if (tr.kind === 'flipper' && tr.cd === 0) {
        const [dx, dz] = DIRS4[ROT_DIR[tr.rot % 4]];
        const victims = this.mice.filter(m => !m.dead && grounded(m) && inRect(m, tr));
        const cats = [...this.cats.values()].filter(c => c.alive && c.onGround && c.y < 0.3 && inRect(c, tr, 0));
        if (victims.length || cats.length) {
          reset(tr, def.cooldown); this.emit({ t: 'flip', id: tr.id });
          for (const m of victims) {
            const s = MICE[m.type].size, mul = Math.min(1, 0.5 / (s * s));   // bosses barely budge
            this.launch(m, dx * def.launchH * mul + (this.rng() - 0.5) * 2, def.launchV * mul * (0.85 + this.rng() * 0.3), dz * def.launchH * mul + (this.rng() - 0.5) * 2);
            this.damageMouse(m, def.launchDamage * mods.trapDmg, 'trap');
          }
          for (const c of cats) { c.vx = dx * def.launchH; c.vz = dz * def.launchH; c.vy = def.launchV; c.onGround = false; }
        }
      } else if (tr.kind === 'grinder') {
        const L = lane(tr, def.reach); let hit = false;
        for (const m of this.mice) if (!m.dead && grounded(m) && inRect(m, L, 0)) { this.damageMouse(m, def.dps * mods.trapDmg * DT, 'trap'); hit = true; }
        tr.active = hit;
      } else if (tr.kind === 'zapper' && tr.cd === 0) {
        const cx = (tr.x0 + tr.x1) / 2, cz = (tr.z0 + tr.z1) / 2;
        const vs = this.mice.filter(m => !m.dead && Math.hypot(m.x - cx, m.z - cz) < def.radius && m.y < 1);
        if (vs.length) { reset(tr, def.cooldown); this.emit({ t: 'zap', id: tr.id, hits: vs.slice(0, 6).map(m => [m.x, m.z]) }); for (const m of vs) this.damageMouse(m, def.damage * mods.trapDmg, 'trap'); }
      } else if (tr.kind === 'gluepad') {
        if (tr.charges <= 0) { tr.rechargeT -= DT; tr.cd = Math.max(0, tr.rechargeT); if (tr.rechargeT <= 0) tr.charges = def.charges; continue; }
        for (const m of this.mice) {
          if (m.dead || m.state !== 'walk' || m.glueId === tr.id || !inRect(m, tr, 0)) continue;
          m.state = 'stuck'; m.stuckT = def.stickSecs * (MICE[m.type].boss ? 0.4 : 1); m.glueId = tr.id;
          if (--tr.charges <= 0) { tr.rechargeT = tr.cdMax = def.recharge * mods.trapCd; break; }
        }
      } else if (tr.kind === 'tacks') {
        for (const m of this.mice) {
          if (m.dead || !grounded(m) || !inRect(m, tr, 0)) continue;
          m.tackT -= DT;
          if (m.tackT <= 0) {
            m.tackT = def.tick;
            if (m.bleed.length < mods.bleedMax) m.bleed.push(CAT.bleedSeconds);
            this.damageMouse(m, def.damage * mods.trapDmg, 'trap');
          }
        }
      } else if (tr.kind === 'glove' && tr.cd === 0) {
        // Spring-loaded boxing glove: punches small mice across the lane (into walls,
        // water, other traps); big ones just get dazed.
        const L = lane(tr, def.reach);
        const vs = this.mice.filter(m => !m.dead && grounded(m) && inRect(m, L, 0));
        if (vs.length) {
          reset(tr, def.cooldown); this.emit({ t: 'punch', id: tr.id });
          for (const m of vs) {
            const md = MICE[m.type];
            this.damageMouse(m, def.damage * mods.trapDmg, 'trap'); if (m.dead) continue;
            if (md.boss || md.size >= 0.9) { m.stunT = m.stunMax = def.bigStun; continue; }
            this.launch(m, L.nx * def.push, 4, L.nz * def.push);
          }
        }
      }
    }
  }

  // Snapshot for HUD / co-op sync.
  hud(id) {
    const cat = this.cats.get(id);
    const nearStall = cat ? STALLS.some(s => Math.hypot(cat.x - s.sell[0], cat.z - s.sell[1]) < RULES.stallRadius) : false;
    const def = cat ? cat.def : CATS.fred;
    const secCd = def.secondary === 'hairball' ? CAT.hairballCooldown : CAT.pounceCooldown;
    return { phase: this.phase, wave: this.wave, phaseTimer: this.phaseTimer, lives: this.lives, sardines: this.sardines,
      yarn: this.yarn, tails: cat ? cat.tails : 0, hp: cat ? cat.hp / def.maxHp : 0, energy: cat ? cat.energy / CAT.maxEnergy : 0,
      alive: cat ? cat.alive : false, respawnT: cat ? cat.respawnT : 0, name: cat ? cat.name : '', kind: cat ? cat.kind : 'fred',
      secCd: cat ? cat.secT / (secCd * this.mods.abilityCd) : 0,
      secCost: def.secondary === 'hairball' ? CAT.hairballCost : CAT.pounceCost,
      eatCd: cat ? cat.eatT / CAT.eatCooldown : 0, charge: cat ? cat.charge / CAT.leapMaxCharge : 0,
      miceLeft: this.mice.length + (this.spawn ? this.spawn.queue.length : 0),
      gateUp: this.gate.up, mode: this.mode, nearStall, trinkets: { ...this.trinkets } };
  }
}

function sameWall(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }
