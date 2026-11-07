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

// Cat lines. Original, crude, bleeped. Each cat has its own voice:
// Fred is a mouthy back-alley scrapper; Puddin is a lazy, posh glutton.
const BARKS = {
  fred: {
    kill: ['Squeak for your mum. Go on.', 'Another one for the gutter.', 'Oh, did that hurt? Good.', 'Tail tax. Pay up, vermin.',
           'Stay down, you mangy little #@!%.', "That's what you get for breathing.", 'Next!', 'Wipe your feet, you filthy little #@!%s.'],
    trap: ["Ha! Didn't see that coming, did ya.", 'Snap. Beautiful.', 'Mind the step, sunshine.', 'Fly, you greasy little #@!%.', 'Splat. Art, that is.'],
    wave: ['Here they come. Smell like a bin.', "Bloody hell, they're breeding.", 'More of them. Course there is.', 'Right. Who wants a slap?'],
    boss: ["That one's eaten a whole bakery.", 'Big lad. Bigger funeral.', "Oh, he's ugly. Let's make him uglier."],
    death: ["Oh, for #@!%'s sake.", 'Nine lives my #@!%.', "Right. That's personal now."],
    gate: ["Board's gone. Who wedged that, a #@!% hamster?", "They're through. Barricades, now."],
    sell: ['Lovely bunch of tails.', 'Kerching, you mouldy beauties.'],
    trinket: ['Ooh. Shiny. Mine.', 'Finders keepers, you dead little #@!%.'],
    eat: ['Crunchy.'],
    leak: ['One got in! OI!', 'Somebody stop that one!', "That's coming out of your wages, Puddin."],
    clear: ['Is that it? Is that all you got?', 'Go on, run home. Oh wait.', 'Lovely. Smoke break.'],
  },
  puddin: {
    kill: ['Hm. Messy.', "Lie still, there's a good vermin.", "I've coughed up bigger than you.", 'Ghastly little things.', 'Another for the pile, I suppose.'],
    trap: ['Oh, delightful.', 'Mm. Physics.', "Someone'll clean that up. Not me.", 'Into the moat with you, darling.'],
    wave: ["Must they? It's nearly nap time.", 'Ugh. Visitors.', "Wake me when they're dead. Oh. Right. Me."],
    boss: ["Goodness, he's fat. I'm allowed to say that.", "That's not a rat, that's a meal plan."],
    death: ['Undignified.', "I'll be back once I've had a lie down.", "This is why I don't exercise."],
    gate: ["The door's off. How common.", 'Well. Do something, Fred.'],
    sell: ['Put it on my tab.', 'Sardines. Finally, some culture.'],
    trinket: ["Ooh, that'll look lovely on me.", "Mine now. Don't argue."],
    eat: ['Crunchy.', 'Needs salt.', 'Mm. Tastes like the floor.', 'Bit gamey.', 'Compliments to the gutter.'],
    leak: ["One's slipped by. Not my fault.", "Someone's let one through. Fred."],
    clear: ['Lovely. Now, snacks.', "That'll do. I'm going for a lie down.", 'Was that all? How dreary.'],
  },
  // Scary Cat: quiet, creepy, superstitious. Speaks in whispers.
  scary: {
    kill: ['Bad luck, little one.', 'Shhh. Sleep now.', "I've crossed worse paths than yours.", 'Another tail for the collection.', 'You saw me. That was your mistake.'],
    trap: ['Ooh. Unlucky.', 'Snap. Crackle. Gone.', 'Some days the floor bites back.'],
    wave: ['They always come back. So do I.', 'Smell that? Fear. Lovely.', 'Black cat crossing. Run.'],
    boss: ['Big. Ugly. Doomed.', "He's not afraid of me yet. He will be."],
    death: ['Eight down.', "That's... fine. I've got spares.", 'The dark takes me. Briefly.'],
    gate: ["The gate's gone. Good. Let them come.", 'Door open. Dinner served.'],
    sell: ['Tails for fish. Fair trade.', 'Sardines. The only thing I trust.'],
    trinket: ['Shiny. Cursed, probably. Mine.', 'Lucky charm. For me, not them.'],
    eat: ['Crunchy.'],
    leak: ['One slipped into the dark.', "That one's luckier than it looks."],
    clear: ['Silence. Finally.', 'They scattered. They always scatter.', 'Nothing left to hiss at.'],
    hiss: ['HSSSSSSS.', 'Run, little ones.', 'Boo.'],
  },
  // Nebbie: clever, calm and a bit smug. The brains of the outfit.
  nebbie: {
    kill: ['Predictable.', 'Statistically, you were always going to lose.', 'Clean shot. Obviously.', 'Physics wins again.', 'Next.'],
    trap: ['Exactly as calculated.', 'Textbook.', 'Mm. Efficient.'],
    wave: ['I count roughly too many. Positions, please.', 'Here they come. Stay near me, you live longer.', 'Formation, everyone. Well. Me.'],
    boss: ['Large. Slow. Weak spot: everywhere.', "That one's going to need a plan. Good thing I have one."],
    death: ['A miscalculation.', 'Noted. Adjusting.', 'That was the statistically unlikely outcome.'],
    gate: ['Gate breached. Plan B.', "They're inside. As I predicted."],
    sell: ['A sound investment.', 'Tails to sardines. Basic economics.'],
    trinket: ['Interesting. Useful.', "I'll study this later."],
    eat: ['Crunchy.'],
    leak: ['One got through. I did warn you.', 'A leak. Unacceptable.'],
    clear: ['Wave cleared. Efficiency: acceptable.', 'Regroup. Heal. Repeat.', 'Was there any doubt?'],
    dodge: ['Missed me.', 'Too slow.', 'Not even close.'],
    purr: ['Purr. Better now?', 'Stay close. Heal up.', 'Everyone, on me.'],
  },
  // Casper: a pampered, pedigreed show cat with a terrifying temper.
  casper: {
    kill: ['Do you know what I COST?', 'Filth. On my fur. AGAIN.', "I'm a show cat. This is the show.", 'MORE.', 'Best in show. Best in KILLING.'],
    trap: ['Fine. The furniture can help.', 'Adequate.', 'Messy. I like messy.'],
    wave: ['Come here. All of you.', 'I was groomed for this. Literally.', 'Finally, some exercise.'],
    boss: ['YOU. Me. Now.', "Big rat. I've had bigger tantrums."],
    death: ['This is NOT how a champion lies down.', 'Get my groomer.', "I'll be back. Furious."],
    gate: ["The door's down. Let them come to ME.", 'Good. Less walking.'],
    sell: ["Sardines. I'm used to salmon, but fine.", 'Payment accepted.'],
    trinket: ['Mine. Obviously.', 'It matches my collar.'],
    eat: ['Crunchy.'],
    leak: ['One ran past me? PAST ME?', "Coward. Come back here."],
    clear: ['Is that all? I was just warming up.', 'Someone brush me.', 'Again. Send more.'],
    frenzy: ['RAAAAAAH!', 'Hold my collar.', 'NOBODY TOUCHES THE FUR.'],
  },
  // Meow Meow: a friendly, sunny outdoor cat. Kills you nicely.
  meow: {
    kill: ['Night night!', 'Aw. Sorry, little guy.', 'Shh, shh. Sleep now.', "There we go. Wasn't so bad.", 'Oopsie!'],
    trap: ['Ooh, wheee!', 'Bless.', 'Off you pop!'],
    wave: ['Ooh, visitors! ...Oh. Rats.', 'Lovely day for it!', 'Everyone stay together, okay?'],
    boss: ["Goodness, you're a big boy. Time for a nap.", 'Somebody needs a lie down.'],
    death: ['Just a little nap...', 'Oof. Five more minutes.', "I'm fine! I'm fine. Mostly."],
    gate: ['The door fell off! Oh dear.', "They're in! Places, everyone!"],
    sell: ['Ooh, fishies!', 'Sardines for everyone!'],
    trinket: ['Ooh, a pressie!', 'Found something shiny!'],
    eat: ['Crunchy.'],
    leak: ['Oh no, one got away!', "Come back, I wasn't finished!"],
    clear: ['Nap time!', 'Well done, everyone!', 'Cuddles all round.'],
    yawn: ['*Yaaaawn*', 'Sleepy time, everyone.', 'Shhhhh.'],
  },
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
    this.baits = [];                    // Cheese Chunks (refreshed each tick in stepTraps)
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
      attackT: 0, secT: 0, eatT: 0, altT: 0, charge: 0, leaping: false, pouncing: false, dashing: false, attacking: false,
      hissT: 0, flipT: 0, buffT: 0, healT: 0, healRate: 0, rage: 0, rageT: 0, frenzyT: 0, striking: false, strikeUsed: false, stillT: 0, napping: false,
      wallNormal: null, kicksLeft: 1, lastKick: null, hurtT: 0, isCat: true, turn: 0 };
    this.cats.set(id, cat);
    this.inputs.set(id, { mx: 0, mz: 0, yaw: Math.PI, pitch: 0, jump: false, jumpHeld: false, primary: false, secondary: false, alt: false, aim: null });
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
        if (cmd.alt) inp.alt = true;             // Shift (Scary Cat's leap back)
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
  // who = a cat's name (or nothing: any cat in the game speaks).
  bark(kind, who, force = false) {
    if (!force && this.barkCooldown > 0) return;
    const cat = [...this.cats.values()].find(c => c.name === who) || [...this.cats.values()][Math.floor(this.rng() * this.cats.size)];
    const voice = BARKS[cat ? cat.kind : 'fred'], lines = voice[kind] || BARKS.fred[kind]; if (!lines) return;
    this.barkCooldown = 3.5;
    this.emit({ t: 'bark', who: cat ? cat.name : 'Fred', kind: cat ? cat.kind : 'fred', text: lines[Math.floor(this.rng() * lines.length)] });
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
      cost: def.cost, charges: def.charges || def.nibbles || 0, rechargeT: 0, cdMax: def.cooldown || def.recharge || 1,
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
        this.emit({ t: 'msg', text: `Sold for ${refund} sardines` }); this.emit({ t: 'sold', x: (tr.x0 + tr.x1) / 2, z: (tr.z0 + tr.z1) / 2 }); return;
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
        this.emit({ t: 'waveStart', wave: this.wave, boss: this.wave % 6 === 0 });
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
        this.emit({ t: 'msg', text: `Wave ${this.wave} cleared  +${bonus} sardines` }); this.emit({ t: 'waveClear', wave: this.wave });
        this.bark('clear', null, true);
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
    if (m.asleep && source !== 'bleed') { m.asleep = false; m.stunT = 0; }   // a hit wakes a sleeping mouse
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
      cat.respawnT -= DT; inp.jump = inp.secondary = inp.alt = false;
      if (cat.respawnT <= 0) Object.assign(cat, { alive: true, hp: def.maxHp, energy: CAT.maxEnergy, x: CAT_SPAWN.x, z: CAT_SPAWN.z, y: 0, vx: 0, vy: 0, vz: 0, charge: 0 });
      return;
    }
    cat.turn = inp.yaw - cat.yaw;   // for the tail flick
    cat.yaw = inp.yaw; cat.pitch = inp.pitch;
    cat.hurtT = Math.max(0, cat.hurtT - DT);
    cat.energy = Math.min(CAT.maxEnergy, cat.energy + def.energyRegen * mods.regen * DT);
    cat.attackT = Math.max(0, cat.attackT - DT); cat.secT = Math.max(0, cat.secT - DT); cat.eatT = Math.max(0, cat.eatT - DT);
    cat.altT = Math.max(0, cat.altT - DT); cat.hissT = Math.max(0, cat.hissT - DT); cat.flipT = Math.max(0, cat.flipT - DT);
    cat.buffT = Math.max(0, cat.buffT - DT); cat.frenzyT = Math.max(0, cat.frenzyT - DT);
    // Casper's rage drains once he stops landing hits.
    cat.rageT += DT; if (cat.rageT > CAT.rageHold) cat.rage = Math.max(0, cat.rage - CAT.rageDecay * DT);
    // Meow Meow naps when left alone: stand still (no input) and she curls up and heals.
    if (def.naps) {
      const idle = !inp.mx && !inp.mz && !inp.primary && !inp.secondary && !inp.jump && cat.onGround && !inp.jumpHeld;
      cat.stillT = idle ? cat.stillT + DT : 0;
      cat.napping = cat.stillT > CAT.napDelay;
      if (cat.napping) cat.hp = Math.min(def.maxHp, cat.hp + def.maxHp * CAT.napHeal * DT);
    }
    // Nebbie's purr: heal over time.
    if (cat.healT > 0) { cat.healT -= DT; cat.hp = Math.min(def.maxHp, cat.hp + cat.healRate * DT); }

    // Knocked silly by a boss stomp: no moving or attacking until it wears off.
    if (cat.stunT > 0) { cat.stunT -= DT; inp.primary = false; inp.secondary = false; inp.jump = false; }
    // Movement: snappy on the ground, partial in the air. Charging a leap slows you.
    if (!cat.pouncing && !cat.dashing && !(cat.stunT > 0)) {
      const sp = def.speed * mods.speed * (cat.charge > 0 ? 0.4 : 1) * (cat.buffT > 0 ? CAT.purrSpeed : 1);
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
    } else if (inp.jump && def.longJump && cat.onGround) {
      // Nebbie: long jump — low and far, in the direction she's moving (or facing).
      let dx = inp.mx, dz = inp.mz; const l = Math.hypot(dx, dz);
      if (l < 0.2) { dx = Math.sin(cat.yaw); dz = Math.cos(cat.yaw); } else { dx /= l; dz /= l; }
      cat.vx = dx * CAT.longJumpH; cat.vz = dz * CAT.longJumpH; cat.vy = def.jumpVel; cat.onGround = false; cat.dashing = true;
      this.emit({ t: 'leap', id: cat.id, power: 0.5 });
      inp.jump = false;
    } else if (inp.jump) {
      if (cat.onGround) { cat.vy = def.jumpVel; cat.onGround = false; this.emit({ t: 'jump', id: cat.id }); }
      else if (def.strike && !cat.strikeUsed) {
        // Casper: second press in the air = leap strike forward; hits where he lands.
        cat.strikeUsed = true; cat.striking = true; cat.dashing = true;
        cat.vx = Math.sin(cat.yaw) * CAT.strikeH; cat.vz = Math.cos(cat.yaw) * CAT.strikeH; cat.vy = CAT.strikeV;
        this.emit({ t: 'pounce', id: cat.id });
      } else if (def.wallKick && cat.wallNormal && cat.kicksLeft > 0 && !sameWall(cat.lastKick, cat.wallNormal)) {
        cat.vy = def.jumpVel; cat.vx = cat.wallNormal[0] * def.wallKick; cat.vz = cat.wallNormal[1] * def.wallKick;
        cat.kicksLeft--; cat.lastKick = cat.wallNormal.slice();
        this.emit({ t: 'wallkick', x: cat.x, y: cat.y, z: cat.z });
      } else if (cat.airJumps > 0) { cat.vy = def.jumpVel * 0.9; cat.airJumps--; this.emit({ t: 'jump', id: cat.id }); }
      inp.jump = false;
    }

    // Right click.
    if (inp.secondary) {
      inp.secondary = false;
      if (def.secondary === 'hairball') this.fireHairball(cat, inp);
      else if (def.secondary === 'pounce') this.pounce(cat, inp);
      else if (def.secondary === 'hiss') this.hiss(cat);
      else if (def.secondary === 'purr') this.purr(cat);
      else if (def.secondary === 'frenzy') this.frenzy(cat);
      else if (def.secondary === 'yawn') this.yawn(cat);
    }
    // Shift: Scary Cat's leap back.
    if (inp.alt) { inp.alt = false; if (def.alt === 'leapback') this.leapBack(cat); }
    // Left click (held): Fred spits, Puddin bites, Scary Cat whips, Nebbie shoots whiskers.
    cat.attacking = inp.primary;
    if (inp.primary && cat.attackT <= 0) {
      if (def.primary === 'pellet') this.firePellet(cat, inp);
      else if (def.primary === 'whip') this.whip(cat);
      else if (def.primary === 'whisker') this.fireWhisker(cat, inp);
      else if (def.primary === 'claw') this.claw(cat);
      else if (def.primary === 'burr') this.fireBurr(cat, inp);
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
      if (wasAir && cat.striking) this.strikeLand(cat);
      cat.pouncing = false; cat.leaping = false; cat.dashing = false; cat.striking = false; cat.strikeUsed = false;
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

  // Nearest Cheese Chunk with cheese left, within its lure radius of this mouse.
  nearestBait(m) {
    let best = null, bd = Infinity;
    for (const tr of this.baits) {
      if (tr.charges <= 0) continue;
      const dd = Math.hypot((tr.x0 + tr.x1) / 2 - m.x, (tr.z0 + tr.z1) / 2 - m.z);
      if (dd < TRAPS.bait.lure && dd < bd) { bd = dd; best = tr; }
    }
    return best;
  }

  // Nebbie's purr makes every buffed cat hit harder.
  // Casper's rage adds +1% per point.
  dmgMul(cat) { return cat ? (cat.buffT > 0 ? CAT.purrDamage : 1) * (1 + (cat.rage || 0) / 100) : 1; }
  gainRage(cat, hits) { if (!cat.def.strike || !hits) return; cat.rage = Math.min(CAT.rageMax, cat.rage + CAT.ragePerHit * hits); cat.rageT = 0; }

  // Casper: claw swipes. Front arc normally; all the way round during a frenzy.
  claw(cat) {
    const fr = cat.frenzyT > 0;
    cat.attackT = CAT.clawInterval * this.mods.attackCd / (fr ? CAT.frenzySpeed : 1);
    const fx = Math.sin(cat.yaw), fz = Math.cos(cat.yaw), hits = [];
    for (const m of this.nearMice(cat.x, cat.z, CAT.clawRange + 1)) {
      if (m.dead || Math.abs(m.y - cat.y) > 1.2) continue;
      const dx = m.x - cat.x, dz = m.z - cat.z, dd = Math.hypot(dx, dz);
      if (dd > CAT.clawRange + MICE[m.type].size * 0.4) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (dd || 1))));
      if (!fr && dd > 0.4 && ang > CAT.clawArc) continue;
      hits.push([dd, m]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    const list = hits.slice(0, fr ? CAT.clawMaxHits * 2 : CAT.clawMaxHits);
    const mul = this.dmgMul(cat);
    for (const [, m] of list) { const crit = this.rng() < this.mods.crit; this.damageMouse(m, CAT.clawDamage * mul * (crit ? 2 : 1), 'cat', crit); }
    this.gainRage(cat, list.length);
    this.emit({ t: 'claw', id: cat.id, hits: list.length, frenzy: fr });
  }
  frenzy(cat) {
    if (cat.secT > 0 || cat.energy < CAT.frenzyCost) return;
    cat.secT = CAT.frenzyCooldown * this.mods.abilityCd; cat.energy -= CAT.frenzyCost; cat.frenzyT = CAT.frenzySecs;
    this.emit({ t: 'frenzy', id: cat.id }); this.bark('frenzy', cat.name);
  }
  strikeLand(cat) {
    let n = 0; const mul = this.dmgMul(cat);
    for (const m of this.nearMice(cat.x, cat.z, CAT.strikeRadius + 0.5)) {
      if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > CAT.strikeRadius || Math.abs(m.y - cat.y) > 1.2) continue;
      this.damageMouse(m, CAT.strikeDamage * mul, 'splat'); n++;
    }
    this.gainRage(cat, n);
    this.emit({ t: 'strike', x: cat.x, y: cat.y, z: cat.z, r: CAT.strikeRadius });
  }
  // Meow Meow: sticky burr. Slows; enough burrs on one mouse and it falls asleep.
  fireBurr(cat, inp) {
    cat.attackT = CAT.burrInterval * this.mods.attackCd;
    const a = this.aimFrom(cat, inp);
    const sx = cat.x + Math.sin(cat.yaw) * 0.4, sy = cat.y + cat.def.height * 0.75, sz = cat.z + Math.cos(cat.yaw) * 0.4;
    const dx = a.x - sx, dy = a.y - sy, dz = a.z - sz, d = Math.hypot(dx, dy, dz) || 1;
    this.missiles.push({ id: this.nextId++, kind: 'burr', x: sx, y: sy, z: sz, vx: dx / d * CAT.burrSpeed, vy: dy / d * CAT.burrSpeed + 1, vz: dz / d * CAT.burrSpeed, life: 1.2, g: 4, mul: this.dmgMul(cat) });
    this.emit({ t: 'burr', id: cat.id });
  }
  putToSleep(m, secs) {
    if (MICE[m.type].boss) { m.slowT = Math.max(m.slowT, secs); return false; }
    m.stunT = m.stunMax = secs; m.asleep = true; m.drowsy = 0; m.fearT = 0; return true;
  }
  // Meow Meow: a huge yawn. Mice around her nod off; cats around her get the buff.
  yawn(cat) {
    if (cat.secT > 0 || cat.energy < CAT.yawnCost) return;
    cat.secT = CAT.yawnCooldown * this.mods.abilityCd; cat.energy -= CAT.yawnCost;
    let n = 0;
    for (const m of this.nearMice(cat.x, cat.z, CAT.yawnRadius)) {
      if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > CAT.yawnRadius) continue;
      if (this.putToSleep(m, CAT.sleepSecs)) n++;
    }
    for (const c of this.cats.values()) if (c.alive && Math.hypot(c.x - cat.x, c.z - cat.z) < CAT.purrRadius) c.buffT = CAT.purrBuffSecs;
    this.emit({ t: 'yawn', id: cat.id, x: cat.x, z: cat.z, r: CAT.yawnRadius, n }); this.bark('yawn', cat.name);
  }

  // Scary Cat: tail whip. A narrow line straight ahead; hits up to whipMaxHits mice along it.
  whip(cat) {
    cat.attackT = CAT.whipInterval * this.mods.attackCd;
    const fx = Math.sin(cat.yaw), fz = Math.cos(cat.yaw), hits = [];
    for (const m of this.nearMice(cat.x + fx * CAT.whipRange / 2, cat.z + fz * CAT.whipRange / 2, CAT.whipRange / 2 + 1.5)) {
      if (m.dead || Math.abs(m.y - cat.y) > 1.2) continue;
      const dx = m.x - cat.x, dz = m.z - cat.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx), r = MICE[m.type].size * 0.35;
      if (along < 0 || along > CAT.whipRange + r || side > CAT.whipWidth + r) continue;
      hits.push([along, m]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    for (const [, m] of hits.slice(0, CAT.whipMaxHits)) {
      const crit = this.rng() < this.mods.crit;
      this.damageMouse(m, CAT.whipDamage * this.dmgMul(cat) * (crit ? 2 : 1), 'cat', crit);
      if (!m.dead && !MICE[m.type].boss) { m.x += fx * 0.3; m.z += fz * 0.3; }
    }
    this.emit({ t: 'whip', id: cat.id, hits: hits.length });
  }
  // Scary Cat: arch + hiss. Mice in range run away from her for a few seconds (bosses just slow).
  hiss(cat) {
    if (cat.secT > 0 || cat.energy < CAT.hissCost) return;
    cat.secT = CAT.hissCooldown * this.mods.abilityCd; cat.energy -= CAT.hissCost; cat.hissT = 0.8;
    let n = 0;
    for (const m of this.nearMice(cat.x, cat.z, CAT.hissRadius)) {
      if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > CAT.hissRadius) continue;
      if (MICE[m.type].boss) { m.slowT = CAT.hissFear; continue; }
      m.fearT = CAT.hissFear * (0.8 + this.rng() * 0.4); m.fearX = cat.x; m.fearZ = cat.z; n++;
    }
    this.emit({ t: 'hiss', id: cat.id, x: cat.x, z: cat.z, r: CAT.hissRadius, n }); this.bark('hiss', cat.name);
  }
  // Scary Cat: backflip away from where she's facing.
  leapBack(cat) {
    if (cat.altT > 0 || !cat.onGround) return;
    cat.altT = CAT.leapBackCooldown * this.mods.abilityCd;
    cat.vx = -Math.sin(cat.yaw) * CAT.leapBackH; cat.vz = -Math.cos(cat.yaw) * CAT.leapBackH; cat.vy = CAT.leapBackV;
    cat.onGround = false; cat.dashing = true; cat.flipT = 0.5;
    this.emit({ t: 'leapback', id: cat.id });
  }
  // Nebbie: whisker dart. Straight and fast; passes through up to whiskerPierce mice.
  fireWhisker(cat, inp) {
    cat.attackT = CAT.whiskerInterval * this.mods.attackCd;
    const a = this.aimFrom(cat, inp);
    // Darts fly low and level (mouse height) so they can skewer a row; aim up only at raised targets.
    const sx = cat.x + Math.sin(cat.yaw) * 0.4, sy = cat.y + 0.3, sz = cat.z + Math.cos(cat.yaw) * 0.4;
    const dx = a.x - sx, dy = a.y > cat.y + 1 ? a.y - sy : 0, dz = a.z - sz, d = Math.hypot(dx, dy, dz) || 1;
    this.missiles.push({ id: this.nextId++, kind: 'whisker', x: sx, y: sy, z: sz, vx: dx / d * CAT.whiskerSpeed, vy: dy / d * CAT.whiskerSpeed, vz: dz / d * CAT.whiskerSpeed,
      life: 0.8, g: 0, pierce: CAT.whiskerPierce, hit: [], mul: this.dmgMul(cat) });
    this.emit({ t: 'whisker', id: cat.id });
  }
  // Nebbie: purr. Heals over time and buffs (damage + speed) every cat in range, herself included.
  purr(cat) {
    if (cat.secT > 0 || cat.energy < CAT.purrCost) return;
    cat.secT = CAT.purrCooldown * this.mods.abilityCd; cat.energy -= CAT.purrCost;
    const who = [];
    for (const c of this.cats.values()) {
      if (!c.alive || Math.hypot(c.x - cat.x, c.z - cat.z) > CAT.purrRadius) continue;
      c.healT = CAT.purrSecs; c.healRate = c.def.maxHp * CAT.purrHeal / CAT.purrSecs; c.buffT = CAT.purrBuffSecs; who.push(c.id);
    }
    this.emit({ t: 'purr', id: cat.id, x: cat.x, z: cat.z, r: CAT.purrRadius, who }); this.bark('purr', cat.name);
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
    this.missiles.push({ id: this.nextId++, kind: 'pellet', x: sx, y: sy, z: sz, vx: dx / d * CAT.pelletSpeed, vy: dy / d * CAT.pelletSpeed, vz: dz / d * CAT.pelletSpeed, life: 0.9, g: 2, mul: this.dmgMul(cat) });
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
    const dmg = CAT.biteDamage * this.dmgMul(cat) * (crit ? 2 : 1);
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
      this.damageMouse(m, CAT.pounceDamage * this.dmgMul(cat), 'splat');
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
    if (m.stunT > 0) { m.stunT -= DT; if (m.stunT <= 0) m.asleep = false; return; }
    if (m.state === 'stuck') { m.stuckT -= DT; if (m.stuckT <= 0) m.state = 'walk'; return; }

    const i = cellOf(m.x, m.z);
    if (i >= 0 && this.map.type[i] === T.HOLE) {
      m.dead = true;
      this.lives -= d.boss ? RULES.livesLostPerBoss : RULES.livesLostPerMouse;
      this.emit({ t: 'leak', boss: !!d.boss }); this.bark('leak');
      this.emit({ t: 'msg', text: d.boss ? 'A boss got into the great hall!' : 'A mouse got into the great hall' });
      return;
    }
    const pass = d.big ? this.passBig : this.passSmall;
    let flow = d.big ? this.flowBig : this.flow;
    if (i < 0 || !(flow[i] < Infinity)) { m.state = 'stranded'; return; }
    // Scared by a hiss: run straight away from the cat, sliding along walls.
    if (m.fearT > 0) {
      m.fearT -= DT;
      const fx = m.x - m.fearX, fz = m.z - m.fearZ, fl = Math.hypot(fx, fz) || 1, sp = d.speed * 1.4 * DT;
      const okf = (x, z) => { const c = cellOf(x, z); return c >= 0 && pass(c) && !this.isBlocker(c); };
      const nx = m.x + fx / fl * sp, nz = m.z + fz / fl * sp;
      if (okf(nx, nz)) { m.x = nx; m.z = nz; } else if (okf(nx, m.z)) m.x = nx; else if (okf(m.x, nz)) m.z = nz;
      m.yaw = Math.atan2(fx, fz);
      return;
    }
    // Rat poison: a mouse that has chewed a Poison Box keeps taking damage while it chews
    // (bosses are hardier). Wears off a second after it stops.
    if (m.poisoned) {
      m.poisonT = 1;
      m.poisoned = false;
    }
    if (m.poisonT > 0) { m.poisonT -= DT; this.damageMouse(m, TRAPS.barricade.poisonDps * (d.boss ? 0.4 : 1) * this.mods.trapDmg * DT, 'poison'); if (m.dead) return; }
    // Cheese Chunk: if one with cheese left is close, go and nibble it (not bosses, not if full).
    if (!d.boss && !m.fed && !(m.baitIgnoreT > 0) && m.state === 'walk') {
      const bait = this.nearestBait(m);
      if (bait) {
        const bx = (bait.x0 + bait.x1) / 2, bz = (bait.z0 + bait.z1) / 2, dx = bx - m.x, dz = bz - m.z, dd = Math.hypot(dx, dz);
        m.yaw = Math.atan2(dx, dz);
        if (dd < 1.1 + d.size * 0.3) {
          m.eatT = (m.eatT || 0) + DT; bait.charges -= DT;
          if (bait.charges <= 0) { bait.charges = 0; bait.rechargeT = bait.cdMax = TRAPS.bait.recharge; this.emit({ t: 'baitGone', id: bait.id }); }
          if (m.eatT > TRAPS.bait.eatSecs) m.fed = true;      // full: back to the route
          return;
        }
        const ox = m.x, oz = m.z, sp = d.speed * (m.slowT > 0 ? CAT.hairballSlow : 1) * DT;
        const okb = (x, z) => { const c = cellOf(x, z); return c >= 0 && pass(c) && !this.isBlocker(c); };
        const nx = m.x + dx / dd * sp, nz = m.z + dz / dd * sp;
        if (okb(nx, nz)) { m.x = nx; m.z = nz; } else if (okb(nx, m.z)) m.x = nx; else if (okb(m.x, nz)) m.z = nz;
        if (Math.hypot(m.x - ox, m.z - oz) < sp * 0.2) m.baitIgnoreT = 3;   // can't get there: forget it for a bit
        return;
      }
    }
    if (m.baitIgnoreT > 0) m.baitIgnoreT -= DT;
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
    // Cats with taunt (Casper) count as closer, so mice pick them first and chase from further.
    let foe = null, foeD = Infinity, best = Infinity;
    for (const cat of this.cats.values()) {
      if (!cat.alive || Math.abs(cat.y - m.y) > 1.2) continue;
      const dd = Math.hypot(cat.x - m.x, cat.z - m.z), eff = dd / (cat.def.taunt || 1);
      if (eff < best) { foe = cat; foeD = dd; best = eff; }
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
            if (!this.hurtCat(cat, d.stomp.dmg)) continue;          // dodged
            cat.stunT = d.stomp.stun; cat.vx = dx / dd * d.stomp.fling; cat.vz = dz / dd * d.stomp.fling; cat.vy = 6; cat.onGround = false;
          }
        }
        return;                                   // stands still while winding up
      }
      if (m.stompT <= 0 && foe && foeD < d.stomp.radius * 0.9) {
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
        this.emit({ t: 'ratSpit', x: m.x, z: m.z });
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
    m.ignoreT = Math.max(0, (m.ignoreT || 0) - DT);
    const chasing = foe && d.aggro && foeD < d.aggro * (foe.def.taunt || 1) && foe.onGround !== false && m.ignoreT === 0;
    if (chasing) {
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
            m.poisoned = true;   // chewing a Poison Box: see the poison tick below
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
    // A cat standing somewhere this mouse can't reach: give up the chase for a bit.
    if (chasing && Math.hypot(m.x - ox, m.z - oz) < sp * DT * 0.2 && foeD > d.size * 0.5 + foe.def.radius + 0.1) m.ignoreT = 2;
    m.y = 0;
  }

  // One place for "a mouse hurt a cat" (bites, spit, stomps).
  // Returns false when the hit missed (dead cat, or Nebbie dodged).
  hurtCat(cat, dmg) {
    if (!cat.alive) return false;
    cat.stillT = 0;                                  // getting hit wakes a napping cat
    if (cat.def.dodge && this.rng() < cat.def.dodge) { this.emit({ t: 'dodge', id: cat.id }); if (this.rng() < 0.15) this.bark('dodge', cat.name); return false; }
    cat.hp -= dmg; cat.hurtT = 0.3; this.stats.damageTaken += dmg;
    this.emit({ t: 'catHurt', id: cat.id });
    if (cat.hp <= 0) this.killCat(cat, false);
    return true;
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
      b.vy -= b.g * DT; b.life -= DT;
      // Move in short sub-steps so fast darts can't skip over a mouse between ticks.
      const n = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy, b.vz) * DT / 0.3));
      let i = -1, hitMouse = null, hitWorld = false;
      for (let k = 0; k < n && !hitMouse && !hitWorld; k++) {
        b.x += b.vx * DT / n; b.y += b.vy * DT / n; b.z += b.vz * DT / n;
        i = cellOf(b.x, b.z);
        for (const m of this.nearMice(b.x, b.z, 1.2)) {
          const s = MICE[m.type].size;
          if (!m.dead && !(b.hit && b.hit.includes(m.id)) && Math.hypot(m.x - b.x, m.z - b.z) < s * 0.5 + 0.2 && Math.abs(m.y + s * 0.4 - b.y) < s * 0.6 + 0.2) { hitMouse = m; break; }
        }
        hitWorld = i < 0 || b.y <= this.groundAt(i, b.y + 0.1, 0.1, true) || this.blocks(i, b.y, 0.15, 0, true);
        // A piercing dart deals with this mouse and keeps flying through the rest of the sub-steps.
        if (hitMouse && b.kind === 'whisker' && b.pierce > 1 && !hitWorld) {
          const crit = this.rng() < this.mods.crit;
          b.hit.push(hitMouse.id); b.pierce--;
          this.damageMouse(hitMouse, CAT.whiskerDamage * (b.mul || 1) * (crit ? 2 : 1), 'cat', crit);
          this.emit({ t: 'pelletHit', x: b.x, y: Math.max(0, b.y), z: b.z, mouse: true });
          hitMouse = null;
        }
      }
      if (b.life <= 0) hitWorld = true;
      if (!hitMouse && !hitWorld) continue;
      // Whisker darts go through mice until they run out of pierce (or hit the world).
      if (b.kind === 'whisker') {
        if (hitMouse) {
          const crit = this.rng() < this.mods.crit;
          b.hit.push(hitMouse.id); b.pierce--;
          this.damageMouse(hitMouse, CAT.whiskerDamage * (b.mul || 1) * (crit ? 2 : 1), 'cat', crit);
          this.emit({ t: 'pelletHit', x: b.x, y: Math.max(0, b.y), z: b.z, mouse: true });
        }
        if (hitWorld || b.pierce <= 0) b.done = true;
        continue;
      }
      if (b.kind === 'burr') {
        b.done = true;
        if (hitMouse) {
          this.damageMouse(hitMouse, CAT.burrDamage * (b.mul || 1), 'cat');
          if (!hitMouse.dead) {
            hitMouse.slowT = Math.max(hitMouse.slowT, CAT.burrSlowSecs);
            hitMouse.drowsy = (hitMouse.drowsy || 0) + 1;
            if (hitMouse.drowsy >= CAT.burrDrowsy) this.putToSleep(hitMouse, CAT.sleepSecs);
          }
        }
        this.emit({ t: 'pelletHit', x: b.x, y: Math.max(0, b.y), z: b.z, mouse: !!hitMouse });
        continue;
      }
      b.done = true;
      if (b.kind === 'pellet') {
        if (hitMouse) {
          if (hitMouse.bleed.length < this.mods.bleedMax) hitMouse.bleed.push(CAT.bleedSeconds); else hitMouse.bleed[0] = CAT.bleedSeconds;
          const crit = this.rng() < this.mods.crit;
          this.damageMouse(hitMouse, CAT.pelletDamage * (b.mul || 1) * (crit ? 2 : 1), 'cat', crit);
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
    this.baits = [];
    for (const tr of this.traps.values()) if (tr.kind === 'bait') {
      // Eaten-out cheese grows back (well, someone restocks it) after a while.
      if (tr.charges <= 0) { tr.rechargeT -= DT; tr.cd = Math.max(0, tr.rechargeT); if (tr.rechargeT <= 0) { tr.charges = TRAPS.bait.nibbles; tr.cd = 0; } }
      this.baits.push(tr);
    }
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
          m.state = 'stuck'; m.stuckT = def.stickSecs * (MICE[m.type].boss ? 0.4 : 1); m.glueId = tr.id; this.emit({ t: 'glue', x: m.x, z: m.z });
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
    const SEC = { hairball: [CAT.hairballCooldown, CAT.hairballCost], pounce: [CAT.pounceCooldown, CAT.pounceCost], hiss: [CAT.hissCooldown, CAT.hissCost],
      purr: [CAT.purrCooldown, CAT.purrCost], frenzy: [CAT.frenzyCooldown, CAT.frenzyCost], yawn: [CAT.yawnCooldown, CAT.yawnCost] };
    const [secCd, secCost] = SEC[def.secondary];
    return { phase: this.phase, wave: this.wave, phaseTimer: this.phaseTimer, lives: this.lives, sardines: this.sardines,
      yarn: this.yarn, tails: cat ? cat.tails : 0, hp: cat ? cat.hp / def.maxHp : 0, energy: cat ? cat.energy / CAT.maxEnergy : 0,
      alive: cat ? cat.alive : false, respawnT: cat ? cat.respawnT : 0, name: cat ? cat.name : '', kind: cat ? cat.kind : 'fred',
      secCd: cat ? cat.secT / (secCd * this.mods.abilityCd) : 0,
      secCost, rage: cat ? cat.rage / CAT.rageMax : 0, napping: cat ? cat.napping : false, altCd: cat && def.alt ? cat.altT / (CAT.leapBackCooldown * this.mods.abilityCd) : 0, buffT: cat ? cat.buffT : 0,
      eatCd: cat ? cat.eatT / CAT.eatCooldown : 0, charge: cat ? cat.charge / CAT.leapMaxCharge : 0,
      miceLeft: this.mice.length + (this.spawn ? this.spawn.queue.length : 0),
      gateUp: this.gate.up, mode: this.mode, nearStall, trinkets: { ...this.trinkets } };
  }
}

function sameWall(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }
