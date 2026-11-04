// sim.js — the whole game rules, with no graphics.
// Why separate from rendering: this is the "authoritative" game. Today it runs
// in the browser for one player; later a host runs it and sends state to other
// cats over the network. Players only ever talk to it through commands, and it
// never calls Math.random (seeded RNG instead) so every run is reproducible.

import { DT, GRAVITY, RULES, CAT, MICE, TRAPS, SELL_REFUND, GATE } from '../config.js';
import { W, H, T, idx, buildMap, floorTrapOk, GATE_CELLS, CASTLE, HOLE, STALL, SPAWN, CAT_SPAWN, DIRS4 } from './map.js';
import { computeFlow, nextTile, nearestReachable } from './path.js';
import { buildWave, ratePaws } from './waves.js';

// Fred's lines. Original, crude, bleeped.
const BARKS = {
  kill: ['Squeak for your mum. Go on.', 'Another one for the gutter.', 'Oh, did that hurt? Good.',
         'Flat as a beer mat. Lovely.', "I'll wear your tail as a #@!% scarf.", 'Wipe your feet, you filthy little #@!%s.',
         "That's not blood, that's interest.", 'Cheese tax. Pay up, vermin.'],
  trap: ["Ha! Didn't see that coming, did ya.", 'Snap. Beautiful.', 'Mind the step, sunshine.', "Fly, you greasy little #@!%."],
  wave: ['Here they come. Smell like a bin.', 'Bloody hell, they\'re breeding.', 'Not my castle. Still mine.'],
  boss: ["That one's eaten a whole bakery.", "Big lad. Bigger funeral."],
  death: ["Oh, for #@!%'s sake.", 'Nine lives my #@!%.', "Right. That's personal now."],
  gate: ["Gate's gone. Who built that, a #@!% hamster?", 'Door\'s off. Barricades, now.'],
  sell: ['Lovely bit of cheddar.', 'Kerching, you mouldy beauty.'],
};

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sim {
  constructor({ mode = 'normal', seed = 1234 } = {}) {
    this.map = buildMap();
    this.rng = mulberry32(seed);
    this.mode = mode;                  // 'normal' (win at 24) or 'endless'
    this.time = 0; this.tick = 0;
    this.phase = 'build';              // build | wave | won | lost
    this.phaseTimer = Infinity;        // first build phase waits for G
    this.wave = 0;
    this.lives = RULES.startLives;
    this.coins = RULES.startCoins;
    this.yarn = 0;
    this.gate = { hp: GATE.hp, up: true };
    this.cats = new Map();
    this.mice = [];
    this.traps = new Map();            // key `${tile}:${layer}` -> trap
    this.cheese = [];
    this.shots = [];                   // lobber projectiles
    this.events = [];                  // for renderer/HUD; drained each frame
    this.stats = { trapsPlaced: 0, damageTaken: 0, kills: 0 };
    this.nextId = 1;
    this.spawn = null;                 // current wave spawner
    this.barkCooldown = 0;
    this.inputs = new Map();           // latest input per player
    this.flowDirty = true;
    this.updateFlow();
  }

  // ---------- players ----------
  addPlayer(id, name = 'Fred') {
    const cat = { id, name, x: CAT_SPAWN.x, y: 0, z: CAT_SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: Math.PI,
      hp: CAT.maxHp, alive: true, respawnT: 0, onGround: true, airJumps: 1, cheese: 0, clawT: 0,
      clawing: false, wallNormal: null, hurtT: 0 };
    this.cats.set(id, cat);
    this.inputs.set(id, { mx: 0, mz: 0, yaw: Math.PI, jump: false, claw: false });
    return cat;
  }

  // ---------- commands (the only way players change the game) ----------
  // Why: the same command objects can later arrive over the network.
  command(cmd) {
    const cat = this.cats.get(cmd.id);
    switch (cmd.type) {
      case 'input': {
        const inp = this.inputs.get(cmd.id); if (!inp) return;
        inp.mx = cmd.mx; inp.mz = cmd.mz; inp.yaw = cmd.yaw; inp.claw = cmd.claw;
        if (cmd.jump) inp.jump = true;   // latched until the next tick consumes it
        break;
      }
      case 'place': this.placeTrap(cat, cmd.trap, cmd.tile, cmd.dir); break;
      case 'sellTrap': this.sellTrap(cmd.tile); break;
      case 'sellCheese': this.sellCheese(cat); break;
      case 'startWave': if (this.phase === 'build') this.phaseTimer = 0; break;
    }
  }

  // ---------- helpers ----------
  emit(e) { this.events.push(e); }
  bark(kind, force = false) {
    if (!force && this.barkCooldown > 0) return;
    const lines = BARKS[kind]; this.barkCooldown = 3.5;
    this.emit({ t: 'bark', text: lines[Math.floor(this.rng() * lines.length)] });
  }
  tileAt(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (tx < 0 || tz < 0 || tx >= W || tz >= H) return -1;
    return tz * W + tx;
  }
  // Solid height used by physics (includes gate + barricades).
  solidHeight(i) {
    if (i < 0) return 50;                         // map edge acts as a tall wall
    const t = this.map.type[i];
    if (t === T.GATE) return this.gate.up ? 4 : 0;
    const b = this.traps.get(i + ':floor');
    if (b && b.kind === 'barricade') return 1.2;
    return this.map.height[i];
  }
  isWater(i) { return i >= 0 && this.map.type[i] === T.WATER; }

  // Path cost added by traps/blockers on a tile.
  extraCost(i) {
    let c = 0;
    const t = this.map.type[i];
    if (t === T.GATE && this.gate.up) c += 10 + this.gate.hp / 4;
    for (const layer of ['floor', 'wall', 'ceiling']) {
      const tr = this.traps.get(i + ':' + layer); if (!tr) continue;
      if (tr.kind === 'barricade') c += 10 + tr.hp / 4;
      else c += TRAPS[tr.kind].pathCost || 0;
    }
    return c;
  }
  updateFlow() { this.flow = computeFlow(this.map, (i) => this.extraCost(i), (i) => !!this.isBlocker(i)); this.flowDirty = false; }
  isBlocker(i) {
    if (i < 0) return false;
    if (this.map.type[i] === T.GATE && this.gate.up) return { gate: true };
    const b = this.traps.get(i + ':floor');
    return b && b.kind === 'barricade' ? b : false;
  }

  // ---------- traps ----------
  canPlace(kind, tile) {
    if (tile < 0) return false;
    const def = TRAPS[kind], t = this.map.type[tile];
    const layer = def.surface === 'floor' ? 'floor' : def.surface;
    if (this.traps.has(tile + ':' + layer)) return false;
    if (!floorTrapOk(t)) return false;
    if (def.surface === 'wall' && this.map.wallSide[tile] < 0) return false;
    if (def.surface === 'ceiling' && !this.map.covered[tile]) return false;
    if (kind === 'barricade') {
      // Don't drop a barricade on top of a mouse (it would be stuck inside).
      const cx = tile % W + 0.5, cz = ((tile / W) | 0) + 0.5;
      if (this.mice.some(m => m.state === 'walk' && Math.abs(m.x - cx) < 0.8 && Math.abs(m.z - cz) < 0.8)) return false;
    }
    return true;
  }
  placeTrap(cat, kind, tile, dir = 0) {
    const def = TRAPS[kind]; if (!def || !cat) return;
    if (this.coins < def.cost) { this.emit({ t: 'msg', text: 'Not enough coins' }); return; }
    if (!this.canPlace(kind, tile)) { this.emit({ t: 'msg', text: "Can't place that there" }); return; }
    const layer = def.surface === 'floor' ? 'floor' : def.surface;
    this.coins -= def.cost;
    const tr = { id: this.nextId++, kind, tile, layer, dir, cd: 0, hp: def.hp || 0, maxHp: def.hp || 0,
      wallDir: this.map.wallSide[tile], cost: def.cost };
    this.traps.set(tile + ':' + layer, tr);
    this.stats.trapsPlaced++;
    this.flowDirty = true;
    this.emit({ t: 'trapAdd', trap: tr });
  }
  sellTrap(tile) {
    for (const layer of ['ceiling', 'wall', 'floor']) {
      const tr = this.traps.get(tile + ':' + layer);
      if (tr) { this.removeTrap(tr); this.coins += Math.floor(tr.cost * SELL_REFUND); return; }
    }
  }
  removeTrap(tr) {
    this.traps.delete(tr.tile + ':' + tr.layer); this.flowDirty = true;
    this.emit({ t: 'trapRemove', id: tr.id });
  }

  // ---------- cheese ----------
  dropCheese(x, z, amount, fromStranded = false) {
    if (amount <= 0) return;
    let i = this.tileAt(x, z);
    if (i >= 0 && this.isWater(i) && !fromStranded) return;    // sinks
    if (i < 0 || this.flow[i] === Infinity || fromStranded) {
      // Stranded or unreachable: move it to the nearest spot a cat can reach.
      i = nearestReachable(this.map, this.flow, x, z); if (i < 0) return;
      x = i % W + 0.5; z = ((i / W) | 0) + 0.5;
    }
    this.cheese.push({ id: this.nextId++, x, z, y: this.solidHeight(i), amount });
  }
  sellCheese(cat) {
    if (!cat || !cat.alive || cat.cheese <= 0) return;
    if (Math.hypot(cat.x - STALL.sellX, cat.z - STALL.sellZ) > RULES.stallRadius) {
      this.emit({ t: 'msg', text: 'Bring it to the cheese stall' }); return;
    }
    this.coins += cat.cheese * RULES.cheesePrice;
    this.emit({ t: 'msg', text: `Sold ${cat.cheese} cheese for ${cat.cheese * RULES.cheesePrice} coins` });
    cat.cheese = 0; this.bark('sell', true);
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
    this.mice = this.mice.filter(m => !m.dead);
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
        this.bark(this.wave % 6 === 0 ? 'boss' : 'wave', true);
      }
      return;
    }
    // wave phase: spawn on an interval, end when everything is dead
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
    const hp = Math.round(d.hp * hpMul);
    this.mice.push({ id: this.nextId++, type, x: SPAWN.x + (this.rng() - 0.5), y: 0, z: SPAWN.z - this.rng() * 0.5,
      vx: 0, vy: 0, vz: 0, hp, maxHp: hp, state: 'walk', bleed: [], biteT: 0, attackT: 0,
      ox: (this.rng() - 0.5) * 0.5, oz: (this.rng() - 0.5) * 0.5, lobbed: false, lobT: 0, dead: false, flash: 0 });
  }

  damageMouse(m, n, source) {
    if (m.dead) return;
    m.hp -= n; m.flash = 0.12;
    this.emit({ t: 'dmg', x: m.x, y: m.y + MICE[m.type].size, z: m.z, n: Math.round(n) });
    if (m.hp <= 0) this.killMouse(m, source);
  }
  killMouse(m, source, drowned = false) {
    if (m.dead) return;
    m.dead = true; this.stats.kills++;
    const d = MICE[m.type];
    if (!drowned) this.dropCheese(m.x, m.z, d.cheese, m.state === 'stranded');
    if (d.yarn) { this.yarn += d.yarn; this.emit({ t: 'msg', text: `+${d.yarn} yarn` }); }
    this.emit({ t: 'kill', x: m.x, z: m.z, type: m.type, drowned });
    if (source === 'trap') this.bark('trap'); else if (source === 'claw') this.bark('kill');
  }

  // ---------- cat physics + combat ----------
  stepCat(cat) {
    const inp = this.inputs.get(cat.id);
    if (!cat.alive) {
      cat.respawnT -= DT; inp.jump = false;
      if (cat.respawnT <= 0) {
        Object.assign(cat, { alive: true, hp: CAT.maxHp, x: CAT_SPAWN.x, z: CAT_SPAWN.z, y: 0, vx: 0, vy: 0, vz: 0 });
      }
      return;
    }
    cat.yaw = inp.yaw;
    cat.hurtT = Math.max(0, cat.hurtT - DT);

    // Horizontal control: snappy on the ground, partial in the air.
    const tvx = inp.mx * CAT.speed, tvz = inp.mz * CAT.speed;
    const k = cat.onGround ? 1 : 0.12;
    cat.vx += (tvx - cat.vx) * k; cat.vz += (tvz - cat.vz) * k;

    // Jumping: ground jump, one air jump, and wall kicks off anything solid.
    if (inp.jump) {
      if (cat.onGround) { cat.vy = CAT.jumpVel; cat.onGround = false; }
      else if (cat.wallNormal) {
        cat.vy = CAT.jumpVel; cat.vx = cat.wallNormal[0] * CAT.wallKick; cat.vz = cat.wallNormal[1] * CAT.wallKick;
        this.emit({ t: 'wallkick', x: cat.x, y: cat.y, z: cat.z });
      } else if (cat.airJumps > 0) { cat.vy = CAT.jumpVel * 0.9; cat.airJumps--; }
      inp.jump = false;
    }
    cat.vy -= GRAVITY * DT;
    this.moveBody(cat, CAT.radius, CAT.stepHeight);
    if (cat.onGround) cat.airJumps = 1;

    // Water kills everything.
    const ti = this.tileAt(cat.x, cat.z);
    if (this.isWater(ti) && cat.y < 0.05) { this.killCat(cat, true); return; }

    // Pick up nearby cheese.
    for (const c of this.cheese) {
      if (c.amount > 0 && cat.cheese < RULES.cheeseCarryCap &&
          Math.hypot(c.x - cat.x, c.z - cat.z) < RULES.pickupRadius && Math.abs(c.y - cat.y) < 1.5) {
        const take = Math.min(c.amount, RULES.cheeseCarryCap - cat.cheese);
        cat.cheese += take; c.amount -= take;
        this.emit({ t: 'pickup', n: take });
      }
    }
    this.cheese = this.cheese.filter(c => c.amount > 0);

    // Claw: hold to swipe rapidly; each hit stacks bleed.
    cat.clawT -= DT; cat.clawing = inp.claw;
    if (inp.claw && cat.clawT <= 0) {
      cat.clawT = CAT.clawInterval;
      this.emit({ t: 'claw', id: cat.id });
      const fx = Math.sin(cat.yaw), fz = Math.cos(cat.yaw);
      for (const m of this.mice) {
        if (m.dead) continue;
        const dx = m.x - cat.x, dz = m.z - cat.z, d = Math.hypot(dx, dz);
        const reach = CAT.clawRange + MICE[m.type].size * 0.5;
        if (d > reach || Math.abs(m.y - cat.y) > 1.6) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
        if (d > 0.6 && ang > CAT.clawArc) continue;
        if (m.bleed.length < CAT.bleedMaxStacks) m.bleed.push(CAT.bleedSeconds);
        else m.bleed[0] = CAT.bleedSeconds;
        const heavy = MICE[m.type].boss ? 0.15 : 1;
        if (m.state === 'walk') { m.x += fx * 0.12 * CAT.clawKnock * heavy; m.z += fz * 0.12 * CAT.clawKnock * heavy; }
        this.damageMouse(m, CAT.clawDamage, 'claw');
      }
    }
  }

  killCat(cat, drowned) {
    if (!cat.alive) return;
    cat.alive = false; cat.respawnT = RULES.catRespawnSeconds;
    if (!drowned) this.dropCheese(cat.x, cat.z, cat.cheese); // drowned cheese is lost
    cat.cheese = 0;
    this.lives -= RULES.livesLostPerCatDeath;
    this.emit({ t: 'catDeath', id: cat.id, drowned });
    this.emit({ t: 'msg', text: `${cat.name} died  −${RULES.livesLostPerCatDeath} lives` });
    this.bark('death', true);
  }

  // Shared movement against the tile height-field. Moves x then z separately
  // so you slide along walls; records a wall normal for wall-kicks.
  moveBody(b, r, step) {
    b.wallNormal = null;
    const tryAxis = (ax) => {
      const nx = ax === 0 ? b.x + b.vx * DT : b.x;
      const nz = ax === 1 ? b.z + b.vz * DT : b.z;
      const pts = [[nx + r, nz + r], [nx - r, nz + r], [nx + r, nz - r], [nx - r, nz - r]];
      for (const [px, pz] of pts) {
        if (this.solidHeight(this.tileAt(px, pz)) > b.y + step) {
          if (ax === 0) { b.wallNormal = [-Math.sign(b.vx) || 0, 0]; b.bumpV = Math.abs(b.vx); b.vx = 0; }
          else { b.wallNormal = [0, -Math.sign(b.vz) || 0]; b.bumpV = Math.abs(b.vz); b.vz = 0; }
          return false;
        }
      }
      b.x = nx; b.z = nz; return true;
    };
    b.bumpV = 0;
    tryAxis(0); tryAxis(1);
    // Wall contact while pressing nothing still counts for wall-kicks.
    if (!b.wallNormal && !b.onGround) {
      for (const [dx, dz] of DIRS4) {
        if (this.solidHeight(this.tileAt(b.x + dx * (r + 0.15), b.z + dz * (r + 0.15))) > b.y + step) { b.wallNormal = [-dx, -dz]; break; }
      }
    }
    // Ground = highest solid under the body footprint.
    let ground = -Infinity;
    for (const [px, pz] of [[b.x + r * 0.7, b.z + r * 0.7], [b.x - r * 0.7, b.z + r * 0.7], [b.x + r * 0.7, b.z - r * 0.7], [b.x - r * 0.7, b.z - r * 0.7]]) {
      const i = this.tileAt(px, pz);
      const h = this.isWater(i) ? -1.2 : this.solidHeight(i);
      if (h <= b.y + step) ground = Math.max(ground, h);
    }
    if (ground === -Infinity) ground = -1.2;
    b.landV = 0;
    b.y += b.vy * DT;
    if (b.y <= ground) { b.landV = -b.vy; b.y = ground; b.vy = 0; b.onGround = true; }
    else b.onGround = b.y - ground < 0.02;
    // clamp to map
    b.x = Math.max(0.3, Math.min(W - 0.3, b.x)); b.z = Math.max(0.3, Math.min(H - 0.3, b.z));
  }

  // ---------- mice ----------
  stepMouse(m) {
    if (m.dead) return;
    const d = MICE[m.type];
    m.flash = Math.max(0, m.flash - DT);
    // Bleed ticks.
    if (m.bleed.length) {
      this.damageMouse(m, m.bleed.length * CAT.bleedDps * DT, 'claw');
      m.bleed = m.bleed.map(t => t - DT).filter(t => t > 0);
      if (m.dead) return;
    }
    const i = this.tileAt(m.x, m.z);

    if (m.state === 'air') {
      m.vy -= GRAVITY * DT;
      this.moveBody(m, d.size * 0.35, 0.05);
      if (m.bumpV > 6) this.damageMouse(m, m.bumpV * 2, 'trap');   // smacked into a wall
      if (m.dead) return;
      if (m.onGround) {
        const li = this.tileAt(m.x, m.z);
        if (this.isWater(li)) { this.emit({ t: 'splash', x: m.x, z: m.z }); this.killMouse(m, 'trap', true); return; }
        if (m.landV > 12) this.damageMouse(m, (m.landV - 12) * 4, 'trap');            // fall damage
        if (m.dead) return;
        const reachable = li >= 0 && this.flow[li] < Infinity && m.y < 0.3;
        m.state = reachable ? 'walk' : 'stranded';
        m.vx = m.vz = 0;
      }
      return;
    }
    if (m.state === 'stranded') {
      // Stuck somewhere it can't path from (roof, rock, outside): dies over time.
      this.damageMouse(m, RULES.unreachableDps * DT, 'trap');
      return;
    }

    // Reached the kitchen hole?
    if (i === idx(HOLE.x, HOLE.z)) {
      m.dead = true;
      this.lives -= d.boss ? RULES.livesLostPerBoss : RULES.livesLostPerMouse;
      this.emit({ t: 'leak', boss: !!d.boss });
      this.emit({ t: 'msg', text: d.boss ? 'A boss got into the kitchen!' : 'A mouse got into the kitchen' });
      return;
    }
    if (i < 0 || this.flow[i] === Infinity) { m.state = 'stranded'; return; }

    // Siege lobber: stops in range of a standing gate and lobs a rock at it.
    if (m.type === 'lobber' && this.gate.up && !m.lobbed) {
      const gx = (GATE_CELLS[0] + GATE_CELLS[3] + 1) / 2, gz = CASTLE.z1 + 0.5;
      if (Math.hypot(m.x - gx, m.z - gz) < 13) {
        m.lobT += DT;
        if (m.lobT > 1.5) {
          m.lobbed = true;
          const tf = 1.4, dx = gx - m.x, dz = gz - m.z;
          this.shots.push({ id: this.nextId++, x: m.x, y: 1, z: m.z, vx: dx / tf, vz: dz / tf, vy: (4 - 1 + 0.5 * GRAVITY * tf * tf) / tf, t: tf });
          this.emit({ t: 'msg', text: 'Siege mouse is lobbing at the gate!' });
        }
        return;
      }
    }

    // Bite any cat standing on top of us.
    m.biteT -= DT;
    for (const cat of this.cats.values()) {
      if (!cat.alive || m.biteT > 0) continue;
      if (Math.hypot(cat.x - m.x, cat.z - m.z) < d.size * 0.5 + 0.55 && Math.abs(cat.y - m.y) < 1) {
        m.biteT = 1.0; cat.hp -= d.bite; cat.hurtT = 0.3; this.stats.damageTaken += d.bite;
        this.emit({ t: 'catHurt', id: cat.id });
        if (cat.hp <= 0) this.killCat(cat, false);
      }
    }

    // Follow the flow field.
    const n = nextTile(this.map, this.flow, i, (j) => !!this.isBlocker(j));
    if (n < 0) return;
    const blk = this.isBlocker(n);
    const tx = n % W + 0.5 + m.ox, tz = ((n / W) | 0) + 0.5 + m.oz;
    const dx = tx - m.x, dz = tz - m.z, dist = Math.hypot(dx, dz) || 1;
    if (blk && dist < 1.1) {
      // Chew on the gate / barricade in front of us.
      m.attackT -= DT;
      if (m.attackT <= 0) {
        m.attackT = 1.0;
        if (blk.gate) {
          this.gate.hp -= d.gateDmg; this.emit({ t: 'gateHit' });
          if (this.gate.hp <= 0) this.breakGate();
        } else {
          blk.hp -= d.gateDmg; this.emit({ t: 'barricadeHit', id: blk.id });
          if (blk.hp <= 0) this.removeTrap(blk);
        }
        this.flowDirty = true;
      }
      return;
    }
    const sp = d.speed;
    m.x += dx / dist * sp * DT; m.z += dz / dist * sp * DT;
    m.yaw = Math.atan2(dx, dz);
    m.y = 0;   // walkers stay on the floor
  }

  breakGate() {
    if (!this.gate.up) return;
    this.gate.up = false; this.gate.hp = 0; this.flowDirty = true;
    this.emit({ t: 'gateBreak' }); this.bark('gate', true);
  }

  stepShots() {
    for (const s of this.shots) {
      s.vy -= GRAVITY * DT; s.x += s.vx * DT; s.y += s.vy * DT; s.z += s.vz * DT; s.t -= DT;
      if (s.t <= 0) { this.breakGate(); this.emit({ t: 'boom', x: s.x, z: s.z }); s.done = true; }
    }
    this.shots = this.shots.filter(s => !s.done);
  }

  // ---------- trap behaviour ----------
  stepTraps() {
    for (const tr of this.traps.values()) {
      tr.cd = Math.max(0, tr.cd - DT);
      const def = TRAPS[tr.kind];
      const cx = tr.tile % W + 0.5, cz = ((tr.tile / W) | 0) + 0.5;
      const inTile = (b, r = 0.75) => Math.abs(b.x - cx) < r && Math.abs(b.z - cz) < r;
      if (tr.kind === 'mousetrap' && tr.cd === 0) {
        const m = this.mice.find(m => !m.dead && m.state === 'walk' && inTile(m, 0.6));
        if (m) { tr.cd = def.cooldown; this.emit({ t: 'snap', id: tr.id }); this.damageMouse(m, def.damage, 'trap'); }
      } else if (tr.kind === 'flipper' && tr.cd === 0) {
        const [dx, dz] = DIRS4[tr.dir];
        const victims = this.mice.filter(m => !m.dead && m.state === 'walk' && inTile(m, 0.7));
        const cats = [...this.cats.values()].filter(c => c.alive && c.onGround && inTile(c, 0.6));
        if (victims.length || cats.length) {
          tr.cd = def.cooldown; this.emit({ t: 'flip', id: tr.id });
          for (const m of victims) {
            const s = MICE[m.type].size, mul = Math.min(1, 0.55 / (s * s));   // bosses barely budge
            m.state = 'air'; m.vx = dx * def.launchH * mul; m.vz = dz * def.launchH * mul; m.vy = def.launchV * mul;
            m.y += 0.05; m.onGround = false;
          }
          for (const c of cats) { c.vx = dx * def.launchH; c.vz = dz * def.launchH; c.vy = def.launchV * 1.2; c.onGround = false; }
        }
      } else if (tr.kind === 'grinder') {
        let hit = false;
        for (const m of this.mice) {
          if (!m.dead && m.state === 'walk' && inTile(m)) { this.damageMouse(m, def.dps * DT, 'trap'); hit = true; }
        }
        tr.active = hit;
      } else if (tr.kind === 'zapper' && tr.cd === 0) {
        const vs = this.mice.filter(m => !m.dead && Math.hypot(m.x - cx, m.z - cz) < def.radius && m.y < 3);
        if (vs.length) { tr.cd = def.cooldown; this.emit({ t: 'zap', id: tr.id }); for (const m of vs) this.damageMouse(m, def.damage, 'trap'); }
      }
    }
  }

  // Snapshot for HUD / future network sync.
  hud(id) {
    const cat = this.cats.get(id);
    return { phase: this.phase, wave: this.wave, phaseTimer: this.phaseTimer, lives: this.lives, coins: this.coins,
      yarn: this.yarn, cheese: cat ? cat.cheese : 0, hp: cat ? cat.hp : 0, alive: cat ? cat.alive : false,
      respawnT: cat ? cat.respawnT : 0, miceLeft: this.mice.length + (this.spawn ? this.spawn.queue.length : 0),
      gateUp: this.gate.up, mode: this.mode,
      nearStall: cat ? Math.hypot(cat.x - STALL.sellX, cat.z - STALL.sellZ) < RULES.stallRadius : false };
  }
}
