// sim.js — the whole game rules, with no graphics.
// Why separate from rendering: this is the "authoritative" game. Today it runs
// in the browser for one player; later a host runs it and sends state to other
// cats over the network. Players only ever talk to it through commands, and it
// never calls Math.random (seeded RNG instead) so every run is reproducible.

import { DT, GRAVITY, RULES, CAT, CATS, MICE, TRAPS, GATE as GATE_CFG, TRINKETS } from '../config.js';
import {
  W, H, CELL, T, idx, cellOf, cellCenter, buildMap, floorish, miceWalkable, goalCells,
  GATE, SPAWN, CAT_SPAWN, STALLS, DIRS4,
} from './map.js';
import { computeFlow, nextCell, nearestReachable } from './path.js';
import { buildWave, ratePaws } from './waves.js';

// Cat lines. Original, crude, bleeped.
const BARKS = {
  kill: ['Squeak for your mum. Go on.', 'Another one for the gutter.', 'Oh, did that hurt? Good.',
         'Flat as a beer mat. Lovely.', "I'll wear your tail as a #@!% scarf.", 'Wipe your feet, you filthy little #@!%s.',
         "That's not blood, that's interest.", 'Cheese tax. Pay up, vermin.'],
  trap: ["Ha! Didn't see that coming, did ya.", 'Snap. Beautiful.', 'Mind the step, sunshine.', 'Fly, you greasy little #@!%.', 'Splat. Art, that is.'],
  wave: ['Here they come. Smell like a bin.', "Bloody hell, they're breeding.", 'Not my castle. Still mine.', 'More of them. Course there is.'],
  boss: ["That one's eaten a whole bakery.", 'Big lad. Bigger funeral.'],
  death: ["Oh, for #@!%'s sake.", 'Nine lives my #@!%.', "Right. That's personal now."],
  gate: ['Book\'s gone. Who wedged that, a #@!% hamster?', 'They\'re through. Barricades, now.'],
  sell: ['Lovely bit of cheddar.', 'Kerching, you mouldy beauty.'],
  trinket: ['Ooh. Shiny. Mine.', "Finders keepers, you dead little #@!%."],
};

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LAYER = { floor: 'floor', wall: 'wall', ceiling: 'ceiling' };
// Flipper/rotation index -> DIRS4 index, turning clockwise from +z.
export const ROT_DIR = [2, 1, 3, 0];

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
    this.traps = new Map();            // id -> trap
    const N = W * H;
    this.occ = { floor: new Int32Array(N), wall: new Int32Array(N), ceiling: new Int32Array(N) };
    this.cheese = []; this.loot = []; // cheese + trinkets on the ground
    this.trinkets = {};                // collected this run (team-wide), key -> count
    this.shots = [];                   // lobber rocks
    this.hairballs = [];
    this.events = [];                  // for renderer/HUD; drained each frame
    this.stats = { trapsPlaced: 0, damageTaken: 0, kills: 0, abilitiesUsed: 0, energyUsed: 0 };
    this.nextId = 1;
    this.spawn = null;
    this.barkCooldown = 0;
    this.cheeseAcc = 0;
    this.inputs = new Map();
    this.spawnCell = cellOf(SPAWN.x, SPAWN.z - 0.3);
    this.flowDirty = true;
    this.updateFlow();
  }

  // ---------- trinket modifiers ----------
  tk(k) { return this.trinkets[k] || 0; }
  get mods() {
    const cd = Math.pow(0.65, this.tk('crown'));
    return {
      speed: 1 + 0.1 * this.tk('catnip'), bite: Math.pow(0.85, this.tk('cap')), cheese: 1 + 0.25 * this.tk('bell'),
      sell: 1 + 0.2 * this.tk('rind'), bleedMax: CAT.bleedMaxStacks + 2 * this.tk('collar'),
      regen: 1 + 0.3 * this.tk('tin'), crit: 0.08 * this.tk('whisker'),
      abilityCd: Math.pow(0.8, this.tk('watch')) * cd, trapCd: Math.pow(0.8, this.tk('key')) * cd,
      clawCd: cd, trapDmg: Math.pow(1.25, this.tk('thimble')),
    };
  }

  // ---------- players ----------
  addPlayer(id, kind = 'fred') {
    const def = CATS[kind];
    const cat = { id, kind, def, name: def.name, x: CAT_SPAWN.x, y: 0, z: CAT_SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: Math.PI, pitch: 0,
      hp: def.maxHp, energy: CAT.maxEnergy, alive: true, respawnT: 0, onGround: true, airJumps: def.airJumps, cheese: 0,
      clawT: 0, clawCount: 0, hairT: 0, pounceT: 0, pouncing: false, clawing: false, wallNormal: null, hurtT: 0, isCat: true };
    this.cats.set(id, cat);
    this.inputs.set(id, { mx: 0, mz: 0, yaw: Math.PI, pitch: 0, jump: false, claw: false, fire: false, pounce: false, aim: null });
    return cat;
  }

  // ---------- commands (the only way players change the game) ----------
  // Why: the same command objects can later arrive over the network.
  command(cmd) {
    const cat = this.cats.get(cmd.id);
    switch (cmd.type) {
      case 'input': {
        const inp = this.inputs.get(cmd.id); if (!inp) return;
        Object.assign(inp, { mx: cmd.mx, mz: cmd.mz, yaw: cmd.yaw, pitch: cmd.pitch || 0, claw: cmd.claw, aim: cmd.aim || inp.aim });
        if (cmd.jump) inp.jump = true;       // edge-triggered: latched until consumed
        if (cmd.fire) inp.fire = true;
        if (cmd.pounce) inp.pounce = true;
        break;
      }
      case 'place': this.placeTrap(cat, cmd.trap, cmd.ax, cmd.az, cmd.rot || 0, cmd.wallDir); break;
      case 'sellTrap': this.sellTrap(cmd.cell, cmd.layer); break;
      case 'sellCheese': this.sellCheese(cat); break;
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

  // Solid column height at a cell for physics. Cats slip through the book gate
  // (it has a cat-sized gap torn in it); mice must chew it down.
  colH(i, forCat) {
    if (i < 0) return 99;
    const t = this.map.type[i];
    if (t === T.WATER) return -1.2;
    let h = this.map.solid[i];
    if (t === T.GATE) h = (this.gate.up && !forCat) ? 4.2 : 0;
    if (this.isBarricade(i)) h = Math.max(h, 1.2);
    return h;
  }
  // Does a body (bottom y, height h) intersect cell i where it can't step up?
  blocks(i, y, h, step, forCat) {
    if (i < 0) return true;
    if (this.colH(i, forCat) > y + step) return true;
    const st = this.map.slabTop[i];
    if (st > 0 && this.map.type[i] !== T.SOLID) {
      if (y + h > this.map.slabBot[i] && y < st - step) return true;
    }
    return false;
  }
  groundAt(i, y, step, forCat) {
    if (i < 0) return -1.2;
    let g = this.colH(i, forCat);
    const st = this.map.slabTop[i];
    if (st > 0 && this.map.type[i] !== T.SOLID && y >= st - step) g = Math.max(g, st);
    return g;
  }

  // Path cost added by traps/blockers on a cell.
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
  isBlocker = (i) => (this.map.type[i] === T.GATE && this.gate.up) || !!this.isBarricade(i);
  updateFlow() {
    const base = { goals: this.goals, extra: (i) => this.extraCost(i), blocked: this.isBlocker };
    this.flow = computeFlow(this.map, { ...base, pass: this.passSmall });
    this.flowBig = computeFlow(this.map, { ...base, pass: this.passBig });
    this.flowDirty = false;
  }

  // ---------- traps ----------
  // Cells a trap would cover. Floor/ceiling footprints rotate with R; wall traps
  // run along the wall they're mounted on.
  footprint(kind, ax, az, rot, wallDir) {
    const def = TRAPS[kind]; let [w, d] = def.size;
    const cells = [];
    if (def.surface === 'wall') {
      const alongZ = wallDir === 0 || wallDir === 1;      // wall faces ±x -> trap runs along z
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
      const t = this.map.type[i];
      if (!floorish(t)) return false;
      if (layer === 'ceiling' && !this.map.covered[i]) return false;
      if (layer === 'wall') {
        if (wallDir < 0) return false;
        const [dx, dz] = DIRS4[wallDir];
        const n = idx(i % W + dx, ((i / W) | 0) + dz);
        if (this.map.type[n] !== T.SOLID || this.map.solid[n] < 1.0) return false;
      }
    }
    if (kind === 'barricade') {
      // Don't drop a barricade on top of a mouse.
      for (const m of this.mice) if (m.state === 'walk' && cells.includes(cellOf(m.x, m.z))) return false;
      // And always leave the mice an open route (they can still chew through).
      const extraWall = new Set(cells);
      const test = computeFlow(this.map, { goals: this.goals, pass: this.passSmall,
        wall: (i) => extraWall.has(i) || !!this.isBarricade(i) });
      if (!(test[this.spawnCell] < Infinity)) return 'seal';
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
      cost: def.cost, charges: def.charges || 0, rechargeT: 0,
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
  // Put loot at a spot cats can reach (stranded mice die on table tops etc).
  reachableSpot(x, z, stranded) {
    let i = cellOf(x, z);
    if (i >= 0 && this.isWater(i) && !stranded) return null;            // sinks
    if (i < 0 || !(this.flow[i] < Infinity) || stranded) {
      i = nearestReachable(this.flow, i < 0 ? cellOf(Math.max(1, Math.min(47, x)), Math.max(1, Math.min(79, z))) : i);
      if (i < 0) return null;
      [x, z] = cellCenter(i);
    }
    return { x, z, y: this.groundAt(i, 0, 0.3, true) };
  }
  dropCheese(x, z, amount, stranded = false) {
    if (amount <= 0) return;
    const p = this.reachableSpot(x, z, stranded); if (!p) return;
    this.cheese.push({ id: this.nextId++, ...p, amount });
  }
  dropTrinket(x, z, tierRoll, stranded) {
    const p = this.reachableSpot(x, z, stranded); if (!p) return;
    const pool = Object.keys(TRINKETS).filter(k => TRINKETS[k].tier === tierRoll);
    const key = pool[Math.floor(this.rng() * pool.length)];
    this.loot.push({ id: this.nextId++, ...p, key });
    this.emit({ t: 'msg', text: `A ${TRINKETS[key].tier} trinket dropped!` });
  }
  sellCheese(cat) {
    if (!cat || !cat.alive || cat.cheese <= 0) return;
    const stall = STALLS.find(s => Math.hypot(cat.x - s.sell[0], cat.z - s.sell[1]) < RULES.stallRadius);
    if (!stall) { this.emit({ t: 'msg', text: 'Bring it to a cheese stash' }); return; }
    const pay = Math.round(cat.cheese * RULES.cheesePrice * this.mods.sell);
    this.sardines += pay;
    this.emit({ t: 'msg', text: `Traded ${cat.cheese} cheese for ${pay} sardines` });
    cat.cheese = 0; this.bark('sell', cat.name, true);
  }

  // ---------- main step ----------
  step() {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.time += DT; this.tick++;
    this.barkCooldown -= DT;
    if (this.flowDirty) this.updateFlow();
    this.stepPhase();
    for (const cat of this.cats.values()) this.stepCat(cat);
    this.stepTraps();
    for (const m of this.mice) this.stepMouse(m);
    this.stepShots();
    this.stepHairballs();
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
        this.spawn = { ...buildWave(this.wave, this.rng, this.gate.up), t: 0 };
        this.emit({ t: 'msg', text: `Wave ${this.wave}` + (this.wave % 12 === 0 ? ' — BIG BOSS RAT' : this.wave % 6 === 0 ? ' — mini boss' : '') });
        this.bark(this.wave % 6 === 0 ? 'boss' : 'wave', this.anyCatName(), true);
      }
      return;
    }
    const s = this.spawn;
    if (s.queue.length) {
      s.t -= DT;
      if (s.t <= 0) { this.spawnMouse(s.queue.shift(), s.hpMul); s.t = s.interval; }
    } else if (this.mice.length === 0 && this.shots.length === 0) {
      if (this.mode === 'normal' && this.wave >= RULES.winWave) {
        this.phase = 'won';
        this.rating = ratePaws(this.lives, this.stats);
        this.emit({ t: 'end', won: true, rating: this.rating });
      } else {
        this.phase = 'build'; this.phaseTimer = RULES.buildPhaseSeconds;
        this.emit({ t: 'msg', text: `Wave ${this.wave} cleared` });
      }
    }
  }

  spawnMouse(type, hpMul) {
    const d = MICE[type];
    const hp = Math.max(1, Math.round(d.hp * hpMul));
    this.mice.push({ id: this.nextId++, type, x: SPAWN.x + (this.rng() - 0.5) * 3, y: 0, z: SPAWN.z - this.rng() * 0.3,
      vx: 0, vy: 0, vz: 0, yaw: Math.PI, hp, maxHp: hp, state: 'walk', bleed: [], biteT: 0, attackT: 0,
      ox: (this.rng() - 0.5) * 0.25, oz: (this.rng() - 0.5) * 0.25, lobbed: false, lobT: 0, dead: false, flash: 0,
      slowT: 0, stuckT: 0, stunT: 0, glueId: 0, tackT: 0, onGround: true });
  }

  damageMouse(m, n, source, crit = false) {
    if (m.dead) return;
    m.hp -= n; m.flash = 0.12;
    if (n >= 1) this.emit({ t: 'dmg', x: m.x, y: m.y + MICE[m.type].size, z: m.z, n: Math.round(n), crit });
    if (m.hp <= 0) this.killMouse(m, source);
  }
  killMouse(m, source, drowned = false) {
    if (m.dead) return;
    m.dead = true; this.stats.kills++;
    const d = MICE[m.type], stranded = m.state === 'stranded';
    if (!drowned) {
      if (d.boss) this.dropTrinket(m.x, m.z, this.rng() < 0.35 ? 'legendary' : 'rare', stranded);
      else if (this.rng() < RULES.trinketChance) this.dropTrinket(m.x, m.z, this.rng() < 0.3 ? 'rare' : 'common', stranded);
      if (this.rng() < d.cheeseChance) {
        this.cheeseAcc += d.cheese * this.mods.cheese;
        const n = Math.floor(this.cheeseAcc); this.cheeseAcc -= n;
        this.dropCheese(m.x, m.z, n, stranded);
      }
    }
    if (d.yarn) { this.yarn += d.yarn; this.emit({ t: 'msg', text: `+${d.yarn} yarn` }); }
    this.emit({ t: 'kill', x: m.x, y: m.y, z: m.z, type: m.type, drowned, splat: source === 'splat' });
    const who = this.anyCatName();
    if (source === 'trap' || source === 'splat') this.bark('trap', who); else if (source === 'claw') this.bark('kill', who);
  }

  // ---------- cats ----------
  stepCat(cat) {
    const inp = this.inputs.get(cat.id), def = cat.def, mods = this.mods;
    if (!cat.alive) {
      cat.respawnT -= DT; inp.jump = inp.fire = inp.pounce = false;
      if (cat.respawnT <= 0) Object.assign(cat, { alive: true, hp: def.maxHp, energy: CAT.maxEnergy, x: CAT_SPAWN.x, z: CAT_SPAWN.z, y: 0, vx: 0, vy: 0, vz: 0 });
      return;
    }
    cat.yaw = inp.yaw; cat.pitch = inp.pitch;
    cat.hurtT = Math.max(0, cat.hurtT - DT);
    cat.energy = Math.min(CAT.maxEnergy, cat.energy + def.energyRegen * mods.regen * DT);
    cat.hairT = Math.max(0, cat.hairT - DT); cat.pounceT = Math.max(0, cat.pounceT - DT);

    // Movement: snappy on the ground, partial in the air (Fred steers better).
    if (!cat.pouncing) {
      const sp = def.speed * mods.speed;
      const k = cat.onGround ? 1 : def.airControl;
      cat.vx += (inp.mx * sp - cat.vx) * k; cat.vz += (inp.mz * sp - cat.vz) * k;
    }
    // Jumping: ground jump; Fred also gets an air jump and wall kicks.
    if (inp.jump) {
      if (cat.onGround) { cat.vy = def.jumpVel; cat.onGround = false; }
      else if (def.wallKick && cat.wallNormal) {
        cat.vy = def.jumpVel; cat.vx = cat.wallNormal[0] * def.wallKick; cat.vz = cat.wallNormal[1] * def.wallKick;
        this.emit({ t: 'wallkick', x: cat.x, y: cat.y, z: cat.z });
      } else if (cat.airJumps > 0) { cat.vy = def.jumpVel * 0.9; cat.airJumps--; }
      inp.jump = false;
    }
    // Pounce (Puddin): leap at the crosshair, stun + splat on landing.
    if (inp.pounce) {
      inp.pounce = false;
      if (def.pounce && cat.pounceT <= 0 && cat.energy >= CAT.pounceCost && inp.aim && cat.onGround) {
        const dx = inp.aim.x - cat.x, dz = inp.aim.z - cat.z, d = Math.hypot(dx, dz) || 1;
        const reach = Math.min(1, d / 6);  // short aims make short pounces
        cat.vx = dx / d * CAT.pounceH * Math.max(0.4, reach); cat.vz = dz / d * CAT.pounceH * Math.max(0.4, reach);
        cat.vy = CAT.pounceV; cat.onGround = false; cat.pouncing = true;
        cat.energy -= CAT.pounceCost; cat.pounceT = CAT.pounceCooldown * mods.abilityCd;
        this.stats.abilitiesUsed++; this.stats.energyUsed += CAT.pounceCost;
        this.emit({ t: 'pounce', id: cat.id });
      }
    }
    // Hairball: arc to the crosshair.
    if (inp.fire) {
      inp.fire = false;
      if (cat.hairT <= 0 && cat.energy >= CAT.hairballCost && inp.aim) {
        const sx = cat.x, sy = cat.y + def.height * 0.8, sz = cat.z;
        const dx = inp.aim.x - sx, dz = inp.aim.z - sz, dy = inp.aim.y - sy, dh = Math.hypot(dx, dz) || 0.01;
        const t = Math.max(0.15, dh / CAT.hairballSpeed), g = GRAVITY * 0.6;
        this.hairballs.push({ id: this.nextId++, x: sx, y: sy, z: sz, vx: dx / t, vz: dz / t, vy: (dy + 0.5 * g * t * t) / t, life: 3 });
        cat.energy -= CAT.hairballCost; cat.hairT = CAT.hairballCooldown * mods.abilityCd;
        this.stats.abilitiesUsed++; this.stats.energyUsed += CAT.hairballCost;
        this.emit({ t: 'hairball', id: cat.id });
      }
    }
    cat.vy -= GRAVITY * DT;
    const wasAir = !cat.onGround;
    this.moveBody(cat, def.radius, def.height, def.stepHeight, true);
    if (cat.onGround) {
      cat.airJumps = def.airJumps;
      if (wasAir && cat.pouncing) this.pounceLand(cat);
      cat.pouncing = false;
    }
    // Water kills everything.
    const ci = cellOf(cat.x, cat.z);
    if (this.isWater(ci) && cat.y < -0.2) { this.killCat(cat, true); return; }

    // Pick up cheese + trinkets.
    for (const c of this.cheese) {
      if (c.amount > 0 && cat.cheese < RULES.cheeseCarryCap && Math.hypot(c.x - cat.x, c.z - cat.z) < RULES.pickupRadius && Math.abs(c.y - cat.y) < 1.5) {
        const take = Math.min(c.amount, RULES.cheeseCarryCap - cat.cheese);
        cat.cheese += take; c.amount -= take; this.emit({ t: 'pickup', n: take });
      }
    }
    if (this.cheese.some(c => c.amount <= 0)) this.cheese = this.cheese.filter(c => c.amount > 0);
    for (const l of this.loot) {
      if (!l.taken && Math.hypot(l.x - cat.x, l.z - cat.z) < RULES.pickupRadius && Math.abs(l.y - cat.y) < 1.5) {
        l.taken = true; this.trinkets[l.key] = (this.trinkets[l.key] || 0) + 1;
        const tdef = TRINKETS[l.key];
        this.emit({ t: 'msg', text: `${tdef.name}: ${tdef.desc}` }); this.emit({ t: 'trinket', key: l.key });
        this.bark('trinket', cat.name, true);
      }
    }
    if (this.loot.some(l => l.taken)) this.loot = this.loot.filter(l => !l.taken);

    // Claw: hold to swipe; every third hit is a bite on the nearest mouse.
    cat.clawT -= DT; cat.clawing = inp.claw;
    if (inp.claw && cat.clawT <= 0) {
      cat.clawT = def.clawInterval * mods.clawCd;
      cat.clawCount++;
      const bite = cat.clawCount % CAT.biteEvery === 0;
      this.emit({ t: bite ? 'bite' : 'claw', id: cat.id, n: cat.clawCount });
      const fx = Math.sin(cat.yaw), fz = Math.cos(cat.yaw);
      const hits = [];
      for (const m of this.mice) {
        if (m.dead) continue;
        const dx = m.x - cat.x, dz = m.z - cat.z, d = Math.hypot(dx, dz);
        if (d > def.clawRange + MICE[m.type].size * 0.5 || Math.abs(m.y - cat.y) > 1.4) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
        if (d > 0.5 && ang > CAT.clawArc) continue;
        hits.push([d, m]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      const targets = bite ? hits.slice(0, 1) : hits;
      for (const [, m] of targets) {
        const crit = this.rng() < mods.crit;
        let dmg = (bite ? def.biteDamage : def.clawDamage) * (crit ? 2 : 1);
        if (m.bleed.length < mods.bleedMax) m.bleed.push(CAT.bleedSeconds); else m.bleed[0] = CAT.bleedSeconds;
        const heavy = MICE[m.type].boss ? 0.15 : 1;
        if (m.state === 'walk') { m.x += fx * 0.1 * CAT.clawKnock * heavy; m.z += fz * 0.1 * CAT.clawKnock * heavy; }
        this.damageMouse(m, dmg, 'claw', crit);
      }
    }
  }

  pounceLand(cat) {
    this.emit({ t: 'pounceLand', x: cat.x, z: cat.z, y: cat.y });
    for (const m of this.mice) {
      if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > CAT.pounceRadius || Math.abs(m.y - cat.y) > 1.2) continue;
      m.stunT = MICE[m.type].boss ? CAT.pounceStun * 0.4 : CAT.pounceStun;
      this.damageMouse(m, CAT.pounceDamage, 'splat');
    }
  }

  killCat(cat, drowned) {
    if (!cat.alive) return;
    cat.alive = false; cat.respawnT = RULES.catRespawnSeconds;
    if (!drowned) this.dropCheese(cat.x, cat.z, cat.cheese);   // drowned cheese is lost
    cat.cheese = 0;
    this.lives -= RULES.livesLostPerCatDeath;
    this.emit({ t: 'catDeath', id: cat.id, drowned });
    this.emit({ t: 'msg', text: `${cat.name} died  −${RULES.livesLostPerCatDeath} lives` });
    this.bark('death', cat.name, true);
  }

  // Movement against the cell height-field (with overhangs). Moves x then z
  // separately so bodies slide along walls; records a wall normal for kicks.
  moveBody(b, r, h, step, forCat) {
    b.wallNormal = null; b.bumpV = 0;
    const tryAxis = (ax) => {
      const nx = ax === 0 ? b.x + b.vx * DT : b.x;
      const nz = ax === 1 ? b.z + b.vz * DT : b.z;
      for (const [px, pz] of [[nx + r, nz + r], [nx - r, nz + r], [nx + r, nz - r], [nx - r, nz - r]]) {
        if (this.blocks(cellOf(px, pz), b.y, h, step, forCat)) {
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
    // Ground = highest surface under the footprint that we're standing over.
    let ground = -Infinity;
    for (const [px, pz] of [[b.x + r * 0.7, b.z + r * 0.7], [b.x - r * 0.7, b.z + r * 0.7], [b.x + r * 0.7, b.z - r * 0.7], [b.x - r * 0.7, b.z - r * 0.7]]) {
      const g = this.groundAt(cellOf(px, pz), b.y, step, forCat);
      if (g <= b.y + step) ground = Math.max(ground, g);
    }
    if (ground === -Infinity) ground = -1.2;
    const prevY = b.y;
    b.landV = 0;
    b.y += b.vy * DT;
    // Head bump on the underside of a table or bench.
    const ci = cellOf(b.x, b.z);
    if (ci >= 0 && this.map.slabTop[ci] > 0 && this.map.type[ci] !== T.SOLID) {
      const bot = this.map.slabBot[ci];
      if (prevY + h <= bot + 0.02 && b.y + h > bot) { b.y = bot - h; b.vy = Math.min(0, b.vy); }
    }
    if (b.y <= ground) { b.landV = -b.vy; b.y = ground; b.vy = 0; b.onGround = true; }
    else b.onGround = b.y - ground < 0.02;
    b.x = Math.max(0.3, Math.min(W * CELL - 0.3, b.x)); b.z = Math.max(0.3, Math.min(H * CELL - 0.3, b.z));
  }

  // ---------- mice ----------
  stepMouse(m) {
    if (m.dead) return;
    const d = MICE[m.type];
    m.flash = Math.max(0, m.flash - DT);
    m.slowT = Math.max(0, m.slowT - DT);
    if (m.bleed.length) {
      this.damageMouse(m, m.bleed.length * CAT.bleedDps * DT, 'claw');
      m.bleed = m.bleed.map(t => t - DT).filter(t => t > 0);
      if (m.dead) return;
    }

    if (m.state === 'air') {
      m.vy -= GRAVITY * DT;
      this.moveBody(m, d.size * 0.3, d.size * 0.8, 0.05, false);
      if (m.bumpV > 6) this.damageMouse(m, (m.bumpV - 6) * 4, 'splat');   // smacked into furniture
      if (m.dead) return;
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
    if (m.state === 'stranded') { this.damageMouse(m, RULES.unreachableDps * DT, 'trap'); return; }
    if (m.stunT > 0) { m.stunT -= DT; return; }
    if (m.state === 'stuck') { m.stuckT -= DT; if (m.stuckT <= 0) m.state = 'walk'; return; }

    const i = cellOf(m.x, m.z);
    if (i >= 0 && this.map.type[i] === T.HOLE) {
      m.dead = true;
      this.lives -= d.boss ? RULES.livesLostPerBoss : RULES.livesLostPerMouse;
      this.emit({ t: 'leak', boss: !!d.boss });
      this.emit({ t: 'msg', text: d.boss ? 'A boss got through the door!' : 'A mouse got through the door' });
      return;
    }
    const flow = d.big ? this.flowBig : this.flow, pass = d.big ? this.passBig : this.passSmall;
    if (i < 0 || !(flow[i] < Infinity)) { m.state = 'stranded'; return; }

    // Siege lobber: stops in range of a standing gate and lobs a rock at it.
    if (m.type === 'lobber' && this.gate.up && !m.lobbed) {
      const gx = (GATE.x0 + GATE.x1) / 2, gz = (GATE.z0 + GATE.z1) / 2;
      if (Math.hypot(m.x - gx, m.z - gz) < 13) {
        m.lobT += DT;
        if (m.lobT > 1.5) {
          m.lobbed = true;
          const tf = 1.4, dx = gx - m.x, dz = gz - m.z;
          this.shots.push({ id: this.nextId++, x: m.x, y: 0.5, z: m.z, vx: dx / tf, vz: dz / tf, vy: (3 - 0.5 + 0.5 * GRAVITY * tf * tf) / tf, t: tf });
          this.emit({ t: 'msg', text: 'Siege mouse is lobbing at the book!' });
        }
        return;
      }
    }

    // Bite any cat we bump into.
    m.biteT -= DT;
    if (m.biteT <= 0) for (const cat of this.cats.values()) {
      if (!cat.alive) continue;
      if (Math.hypot(cat.x - m.x, cat.z - m.z) < d.size * 0.5 + cat.def.radius + 0.1 && Math.abs(cat.y - m.y) < 0.8) {
        m.biteT = 1.0; const dmg = d.bite * this.mods.bite;
        cat.hp -= dmg; cat.hurtT = 0.3; this.stats.damageTaken += dmg;
        this.emit({ t: 'catHurt', id: cat.id });
        if (cat.hp <= 0) this.killCat(cat, false);
        break;
      }
    }

    // Follow the flow field.
    const n = nextCell(this.map, flow, i, pass, this.isBlocker);
    if (n < 0) return;
    const [cx, cz] = cellCenter(n);
    const tx = cx + m.ox, tz = cz + m.oz;
    const dx = tx - m.x, dz = tz - m.z, dist = Math.hypot(dx, dz) || 1;
    if (this.isBlocker(n) && dist < 0.6) {
      m.attackT -= DT;
      if (m.attackT <= 0) {
        m.attackT = 1.0;
        if (this.map.type[n] === T.GATE && this.gate.up) {
          this.gate.hp -= d.gateDmg; this.emit({ t: 'gateHit' });
          if (this.gate.hp <= 0) this.breakGate();
        } else {
          const b = this.isBarricade(n);
          if (b) { b.hp -= d.gateDmg; this.emit({ t: 'barricadeHit', id: b.id }); if (b.hp <= 0) this.removeTrap(b); }
        }
        this.flowDirty = true;
      }
      return;
    }
    const sp = d.speed * (m.slowT > 0 ? CAT.hairballSlow : 1);
    m.x += dx / dist * sp * DT; m.z += dz / dist * sp * DT;
    m.yaw = Math.atan2(dx, dz);
    m.y = 0;
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

  stepHairballs() {
    const g = GRAVITY * 0.6;
    for (const b of this.hairballs) {
      b.vy -= g * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; b.life -= DT;
      const i = cellOf(b.x, b.z);
      let hit = b.life <= 0 || i < 0 || b.y <= this.groundAt(i, b.y + 0.1, 0.1, true) || this.blocks(i, b.y, 0.2, 0, true);
      if (!hit) for (const m of this.mice) {
        if (!m.dead && Math.hypot(m.x - b.x, m.z - b.z) < MICE[m.type].size * 0.5 + 0.25 && Math.abs(m.y + MICE[m.type].size * 0.4 - b.y) < MICE[m.type].size * 0.6 + 0.25) { hit = true; break; }
      }
      if (!hit) continue;
      b.done = true;
      this.emit({ t: 'hairSplat', x: b.x, y: Math.max(0, b.y), z: b.z });
      for (const m of this.mice) {
        if (m.dead || Math.hypot(m.x - b.x, m.z - b.z) > CAT.hairballRadius || Math.abs(m.y - b.y) > 1.5) continue;
        m.slowT = CAT.hairballSlowSecs;
        this.damageMouse(m, CAT.hairballDamage, 'claw', this.rng() < this.mods.crit);
      }
    }
    if (this.hairballs.some(b => b.done)) this.hairballs = this.hairballs.filter(b => !b.done);
  }

  // ---------- trap behaviour ----------
  stepTraps() {
    const mods = this.mods;
    const inRect = (b, tr, pad = 0.1) => b.x > tr.x0 - pad && b.x < tr.x1 + pad && b.z > tr.z0 - pad && b.z < tr.z1 + pad;
    const grounded = (m) => (m.state === 'walk' || m.state === 'stuck') && m.y < 0.3;
    for (const tr of this.traps.values()) {
      tr.cd = Math.max(0, tr.cd - DT);
      const def = TRAPS[tr.kind];
      if (tr.kind === 'mousetrap' && tr.cd === 0) {
        const m = this.mice.find(m => !m.dead && grounded(m) && inRect(m, tr, 0));
        if (m) { tr.cd = def.cooldown * mods.trapCd; this.emit({ t: 'snap', id: tr.id }); this.damageMouse(m, def.damage * mods.trapDmg, 'trap'); }
      } else if (tr.kind === 'flipper' && tr.cd === 0) {
        const [dx, dz] = DIRS4[ROT_DIR[tr.rot % 4]];
        const victims = this.mice.filter(m => !m.dead && grounded(m) && inRect(m, tr));
        const cats = [...this.cats.values()].filter(c => c.alive && c.onGround && c.y < 0.3 && inRect(c, tr, 0));
        if (victims.length || cats.length) {
          tr.cd = def.cooldown * mods.trapCd; this.emit({ t: 'flip', id: tr.id });
          for (const m of victims) {
            const s = MICE[m.type].size, mul = Math.min(1, 0.5 / (s * s));   // bosses barely budge
            m.state = 'air'; m.onGround = false;
            m.vx = dx * def.launchH * mul + (this.rng() - 0.5) * 2; m.vz = dz * def.launchH * mul + (this.rng() - 0.5) * 2;
            m.vy = def.launchV * mul * (0.85 + this.rng() * 0.3); m.y += 0.05;
            this.damageMouse(m, def.launchDamage * mods.trapDmg, 'trap');
          }
          for (const c of cats) { c.vx = dx * def.launchH; c.vz = dz * def.launchH; c.vy = def.launchV; c.onGround = false; }
        }
      } else if (tr.kind === 'grinder') {
        let hit = false;
        for (const m of this.mice) if (!m.dead && grounded(m) && inRect(m, tr)) { this.damageMouse(m, def.dps * mods.trapDmg * DT, 'trap'); hit = true; }
        tr.active = hit;
      } else if (tr.kind === 'zapper' && tr.cd === 0) {
        const cx = (tr.x0 + tr.x1) / 2, cz = (tr.z0 + tr.z1) / 2;
        const vs = this.mice.filter(m => !m.dead && Math.hypot(m.x - cx, m.z - cz) < def.radius && m.y < 1);
        if (vs.length) { tr.cd = def.cooldown * mods.trapCd; this.emit({ t: 'zap', id: tr.id }); for (const m of vs) this.damageMouse(m, def.damage * mods.trapDmg, 'trap'); }
      } else if (tr.kind === 'gluepad') {
        if (tr.charges <= 0) { tr.rechargeT -= DT; if (tr.rechargeT <= 0) tr.charges = def.charges; continue; }
        for (const m of this.mice) {
          if (m.dead || m.state !== 'walk' || m.glueId === tr.id || !inRect(m, tr, 0)) continue;
          m.state = 'stuck'; m.stuckT = def.stickSecs * (MICE[m.type].boss ? 0.4 : 1); m.glueId = tr.id;
          if (--tr.charges <= 0) { tr.rechargeT = def.recharge * mods.trapCd; break; }
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
      } else if (tr.kind === 'hairdryer' && tr.cd === 0) {
        // Blows away from the wall it's mounted on, down a lane in front of it.
        const [wx, wz] = DIRS4[tr.wallDir], nx = -wx, nz = -wz;
        const lane = { x0: Math.min(tr.x0, tr.x0 + nx * def.reach), x1: Math.max(tr.x1, tr.x1 + nx * def.reach),
                       z0: Math.min(tr.z0, tr.z0 + nz * def.reach), z1: Math.max(tr.z1, tr.z1 + nz * def.reach) };
        const vs = this.mice.filter(m => !m.dead && grounded(m) && inRect(m, lane, 0));
        if (vs.length) {
          tr.cd = def.cooldown * mods.trapCd; this.emit({ t: 'blow', id: tr.id });
          for (const m of vs) {
            const s = MICE[m.type].size, mul = Math.min(1, 0.4 / (s * s));
            m.state = 'air'; m.onGround = false; m.vx = nx * def.push * mul; m.vz = nz * def.push * mul; m.vy = 3.5 * mul; m.y += 0.05;
          }
        }
      }
    }
  }

  // Snapshot for HUD / future network sync.
  hud(id) {
    const cat = this.cats.get(id);
    const nearStall = cat ? STALLS.some(s => Math.hypot(cat.x - s.sell[0], cat.z - s.sell[1]) < RULES.stallRadius) : false;
    return { phase: this.phase, wave: this.wave, phaseTimer: this.phaseTimer, lives: this.lives, sardines: this.sardines,
      yarn: this.yarn, cheese: cat ? cat.cheese : 0, hp: cat ? cat.hp / cat.def.maxHp : 0, energy: cat ? cat.energy / CAT.maxEnergy : 0,
      alive: cat ? cat.alive : false, respawnT: cat ? cat.respawnT : 0, name: cat ? cat.name : '', canPounce: cat ? cat.def.pounce : false,
      hairCd: cat ? cat.hairT / (CAT.hairballCooldown * this.mods.abilityCd) : 0,
      pounceCd: cat ? cat.pounceT / (CAT.pounceCooldown * this.mods.abilityCd) : 0,
      biteIn: cat ? CAT.biteEvery - (cat.clawCount % CAT.biteEvery) : 0,
      miceLeft: this.mice.length + (this.spawn ? this.spawn.queue.length : 0),
      gateUp: this.gate.up, mode: this.mode, nearStall, trinkets: { ...this.trinkets } };
  }
}
