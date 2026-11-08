// sim.js — the whole game rules, with no graphics.
// Why separate from rendering: this is the "authoritative" game. Today it runs
// in the browser for one player; for co-op a host runs it and sends state to the
// other cat. Players only ever talk to it through commands, and it never calls
// Math.random (seeded RNG instead) so every run is reproducible.

import { DT, GRAVITY, RULES, CAT, CATS, MICE, TRAPS, GATE as GATE_CFG, TRINKETS, ABILITY2, ITEMS, STATUS, COMBOS, ATTACK_EL, trapParams, DIFFICULTY } from '../config.js';
import {
  W, H, CELL, T, idx, cellOf, cellCenter, buildMap, floorish, miceWalkable, goalCells,
  GATE, SPAWNS, CAT_SPAWN, DIRS4, WORLD_W, WORLD_H, VIAS, useMap, MAP,
} from './map.js';
import { computeFlow, nextCell, nearestReachable, linkCost } from './path.js';
import { buildWave, ratePaws, INTRO_TEXT } from './waves.js';

// Cat lines. Original, crude, bleeped. Each cat has its own voice:
// Fred is a mouthy back-alley scrapper; Puddin is a lazy, posh glutton.
export const BARKS = {
  fred: {
    kill: ['Squeak for your mum. Go on.', 'Another one for the gutter.', 'Oh, did that hurt? Good.', 'Tail tax. Pay up, vermin.',
           'Stay down, you mangy little #@!%.', "That's what you get for breathing.", 'Next!', 'Wipe your feet, you filthy little #@!%s.'],
    trap: ["Ha! Didn't see that coming, did ya.", 'Snap. Beautiful.', 'Mind the step, sunshine.', 'Fly, you greasy little #@!%.', 'Splat. Art, that is.'],
    wave: ['Here they come. Smell like a bin.', "Bloody hell, they're breeding.", 'More of them. Course there is.', 'Right. Who wants a slap?'],
    boss: ["That one's eaten a whole bakery.", 'Big lad. Bigger funeral.', "Oh, he's ugly. Let's make him uglier."],
    death: ["Oh, for #@!%'s sake.", 'Nine lives my #@!%.', "Right. That's personal now."],
    gate: ["Board's gone. Who wedged that, a #@!% hamster?", "They're through. Barricades, now."],
    sell: ['Kerching, you mouldy beauties.', 'Paw Points! Lovely.'],
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
    sell: ['Points. The only thing I trust.', 'Fair trade.'],
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
    sell: ['A sound investment.', 'Basic economics.'],
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
  // Mimo: a frisky tabby tom who never got over being neutered. Thinks he's a lion.
  mimo: {
    kill: ["Sorry, darling. I'm spoken for. By the vet.", "Rawr. Yeah. I said rawr.", "I'm on fire tonight.", 'Lion blood, me. Distant. Very distant.', 'Still got the moves. Just not the equipment.'],
    trap: ['Ooh, nasty. I like it.', 'Smooth.', 'Floor show!'],
    wave: ['Evening, ladies. Oh. Mice. Never mind.', 'Right. Who wants some of the lion?', "Here they come. I'll be gentle. I won't."],
    boss: ["Big boy. I've seen bigger. In the mirror.", 'Time to roar.'],
    death: ['The vet took my dignity first.', 'Still got it. Just... not today.', 'Tell the ladies I went out roaring.'],
    gate: ['Gate gone. Open house, lads.', 'Door\'s off. Party time.'],
    sell: ["Sardines. Dinner's on me.", 'Kerching. Treat yourself, Mimo.'],
    trinket: ['Ooh, something for the missus. If I had one.', 'Shiny. Like me.'],
    eat: ['Crunchy.'],
    leak: ['One snuck past. Cheeky.', 'Oi! Get back here, you.'],
    clear: ["That's how a lion does it.", "Who's purring now?", 'Lovely. Back to the windowsill.'],
    roar: ['ROOOOOAR!', 'Hear me ROAR. That was a roar.', 'King of the jungle! Well. Of the loo.'],
    bird: ['Got one! Feathers everywhere!', 'Birdie, birdie, birdie...', 'Bird for dinner, lads!', "That's what you get for flying."],
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
// Poison Boxes cost this much to path through, per cell: mice will walk any zig-zag maze
// you build rather than chew (they only chew if every way is blocked, which placement prevents).
const BARRICADE_COST = 5000;
const MUD_SLOW = 0.55;      // stables: mud slows mice and cats
const FIRE_DPS = 20;        // kitchen: ovens and hearth burn mice (cats take 3/4)
const GORGE_SECS = 2.5, GORGE_HP = 1.3;   // food piles: time spent eating, and how much tougher they come out
// Smarter mice (v0.12; v0.14.1: lanes only).
// Danger memory: every death leaves "danger" on the floor around it. When a pack picks its lane
// it adds up the danger along each lane, so a lane they keep dying in loses its share of packs.
// It does NOT change their step-by-step path: within the lane they chose, they still walk
// straight into your traps (otherwise they just skirted every kill zone in the open yards).
// It fades over ~20 s. Scouts dying count four times.
const DANGER_KILL = 3, DANGER_SCOUT = 4, DANGER_CAP = 10, DANGER_MAX = 30, DANGER_DECAY = 0.965, DANGER_REPATH = 12;
const FIRE_AVOID = 6;            // extra path cost near ovens: mice go round fires if they can
const CRATE_COST = 15, CRATE_HP = 90, CRATE_H = 1.6;   // crate stacks: cheap enough to smash through for a real shortcut
const CLIMB_SECS = 0.9;
// Things that fall over (v0.17).
const SHELF_HITS = 4, SHELF_FALL_SECS = 0.6, SHELF_CRUSH = 120, SHELF_HP = 150;   // hits to knock over; crush damage; chew health once down
const BARREL_R = 1.0, BARREL_SPEED = 8, BARREL_FRICTION = 2.2;                     // rolling barrels
// Market stalls (v0.20): break the legs and the counter comes down across the crossing.
// Siege mice (v0.23) lob rocks at traps along their route: Poison Boxes take damage,
// anything else jams for a while.
const SIEGE_RANGE = 9, SIEGE_EVERY = 7, SIEGE_AIM = 1.0, SIEGE_DMG = 60, SIEGE_JAM = 5;
const STALL_HITS = 6, STALL_FALL_SECS = 0.45, STALL_CRUSH = 150, STALL_HP = 260, STALL_PILE_H = 0.9;
// A shut door: mice wait at it rather than turning round, unless the way round is shorter
// than this wait (per cell; doors are 2 cells thick). Without it, slow mice flip-flopped
// between routes every time a door swung and could get stuck between two doors forever.
const DOOR_WAIT_COST = 30;          // time to scramble up (or down) a table leg
// Default element for each damage source (a call can name its own instead).
// 'dot' = a status ticking (burning, poison): resistances apply, but it doesn't re-apply itself.
const SRC_EL = { cat: 'physical', bleed: 'physical', trap: 'physical', splat: 'physics', poison: 'poison', fire: 'fire', chain: 'electric' };

export class Sim {
  // map = which campaign map ('entrance', 'market', 'stables', 'cellar', 'passages', 'kitchen').
  constructor({ mode = 'normal', seed = 1234, map = 'entrance', difficulty = 'normal' } = {}) {
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal; this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.mapDef = useMap(map);
    this.map = buildMap();
    this.goals = goalCells();
    this.rng = mulberry32(seed);
    this.mode = mode;                  // 'normal' (win at 24) or 'endless'
    this.time = 0; this.tick = 0;
    this.phase = 'build';              // build | wave | won | lost
    this.phaseTimer = Infinity;        // first build phase waits for G
    this.wave = 0;
    this.lives = this.diff.lives;
    this.sardines = RULES.startSardines;
    this.yarn = 0;
    this.gate = { hp: GATE_CFG.hp, up: !!GATE };       // maps without a gate start open
    // Map features: food piles (mice gorge), knock-over props, timed doors.
    this.foods = (this.mapDef.foods || []).map(f => ({ ...f, left: f.amount }));
    this.props = (this.mapDef.props || []).map(([kind, x, y, z], k) => ({ id: 900000 + k, kind, x, y, z, home: [x, y, z], state: 'up', vx: 0, vy: 0, vz: 0, tilt: 0 }));
    this.doors = (this.mapDef.doors || []).map(d => ({ ...d, open: true }));
    this.cats = new Map();
    this.mice = [];
    this.traps = new Map();
    this.baits = [];                    // Cheese Chunks (refreshed each tick in stepTraps)
    const N = W * H;
    this.occ = { floor: new Int32Array(N), wall: new Int32Array(N), ceiling: new Int32Array(N), top: new Int32Array(N) };   // top = on furniture
    // Food up on furniture tops (mice climb to it), crate stacks mice smash through, danger memory.
    this.tops = (this.mapDef.tops || []).map(f => ({ ...f, left: f.amount }));
    this.crateAt = new Int16Array(N);
    this.crates = (this.mapDef.crates || []).map(([x0, z0, x1, z1], k) => {
      const cells = [];
      for (let z = Math.floor(z0 / CELL); z < Math.ceil(z1 / CELL); z++) for (let x = Math.floor(x0 / CELL); x < Math.ceil(x1 / CELL); x++) { const i = idx(x, z); cells.push(i); this.crateAt[i] = k + 1; }
      return { id: 800000 + k, rect: [x0, z0, x1, z1], cells, hp: CRATE_HP, maxHp: CRATE_HP, up: true };
    });
    // Danger is kept per block of 8x8 cells (4x4 units): an area, so mice can't just sidestep
    // the exact spot; they have to go round the whole patch or take another lane.
    this.DB = 8; this.dbw = Math.ceil(W / this.DB); this.dbh = Math.ceil(H / this.DB);
    // Shelves: stand against a wall (solid while up); each has a fallen-shelf "crate" ready
    // (down = not there) so knocking it over just switches that on. Barrels roll.
    const cellsOf = ([x0, z0, x1, z1]) => { const out = []; for (let z = Math.floor(z0 / CELL); z < Math.ceil(z1 / CELL); z++) for (let x = Math.floor(x0 / CELL); x < Math.ceil(x1 / CELL); x++) out.push(idx(x, z)); return out; };
    this.shelfAt = new Int8Array(N);   // standing-shelf cells: never a trap spot or a wall to hang one on (it falls over)
    this.shelves = (this.mapDef.shelves || []).map((sh, k) => {
      const crate = { id: 800500 + k, rect: sh.fall, cells: cellsOf(sh.fall), hp: SHELF_HP, maxHp: SHELF_HP, up: false, fallen: 'shelf', shelf: k };
      this.crates.push(crate); for (const i of crate.cells) this.crateAt[i] = this.crates.length;
      const o = { ...sh, id: 700000 + k, state: 'up', hp: SHELF_HITS, t: 0, cells: cellsOf(sh.rect), crate };
      for (const i of o.cells) { this.map.type[i] = T.SOLID; this.map.solid[i] = sh.h; this.shelfAt[i] = k + 1; }
      return o;
    });
    this.barrels = (this.mapDef.barrels || []).map(([x, z], k) => ({ id: 710000 + k, x, z, home: [x, z], vx: 0, vz: 0, lying: false, hit: new Set() }));
    // Market stall counters: each keeps a copy of its slab cells so it can come down and go back up.
    this.stalls = [];
    this.mapDef.furniture.forEach((f, fi) => {
      if (f.kind !== 'over' || f.look !== 'stall') return;
      const k = this.stalls.length, cells = cellsOf(f.rect);
      const crate = { id: 800600 + k, rect: f.rect, cells, hp: STALL_HP, maxHp: STALL_HP, up: false, fallen: 'stall', stall: k, h: STALL_PILE_H };
      this.crates.push(crate); for (const i of cells) this.crateAt[i] = this.crates.length;
      this.stalls.push({ id: 720000 + k, fi, name: f.name, rect: f.rect, bot: f.bot, top: f.top, cells, crate, state: 'up', hp: STALL_HITS, t: 0 });
    });
    this.danger = new Float32Array(this.dbw * this.dbh); this.dangerT = 1; this.dangerDelta = 0; this.dangerSpots = [];
    // Constant path cost near fires (kitchen): mice route round the ovens when they can.
    this.fireCost = new Float32Array(N);
    for (const f of this.mapDef.fires || []) for (let i = 0; i < N; i++) { const [cx, cz] = cellCenter(i); if (Math.hypot(cx - f.x, cz - f.z) < f.r + 0.5) this.fireCost[i] = FIRE_AVOID; }
    this.tails = []; this.loot = [];   // trinkets lying on the ground (tails are gone: kills pay Paw Points directly)
    this.trinkets = {};                // collected this run (team-wide), key -> count
    this.shots = [];                   // lobber rocks
    this.globs = [];                   // plague-rat spit flying at cats
    this.birds = [];                   // magpies and crows (fly over everything)
    this.zones = [];                   // item effects on the ground (laser dot, flea cloud)
    this.decoys = [];                  // squeaky toys mice attack instead of moving on
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
    this.flowDirty = true; this.layoutVer = 0;   // layoutVer: bumps whenever walls/traps/doors change (caches key off it)
    this.updateFlow();
  }

  // ---------- trinket modifiers ----------
  tk(k) { return this.trinkets[k] || 0; }
  get mods() {
    const cd = Math.pow(0.65, this.tk('crown'));
    return {
      speed: 1 + 0.1 * this.tk('catnip'), bite: Math.pow(0.85, this.tk('cap')), points: 1 + 0.25 * this.tk('bell'),
      waveBonus: 1 + 0.5 * this.tk('rind'), bleedMax: CAT.bleedMaxStacks + 2 * this.tk('collar'),
      regen: 1 + 0.3 * this.tk('tin'), crit: 0.08 * this.tk('whisker'),
      abilityCd: Math.pow(0.8, this.tk('watch')) * cd, trapCd: Math.pow(0.8, this.tk('key')) * cd,
      attackCd: cd, trapDmg: Math.pow(1.25, this.tk('thimble')),
    };
  }

  // ---------- players ----------
  // opts.loadout = the 8 traps this player brought; opts.item = their one equipped item.
  addPlayer(id, kind = 'fred', opts = {}) {
    const def = CATS[kind];
    const cat = { id, kind, def, name: def.name, x: CAT_SPAWN.x, y: 0, z: CAT_SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: Math.PI, pitch: 0,
      hp: def.maxHp, energy: def.maxEnergy, alive: true, respawnT: 0, onGround: true, airJumps: def.airJumps,
      loadout: opts.loadout || null, item: opts.item || null, upgrades: opts.upgrades || {}, hat: opts.hat || null, itemT: 0, guardT: 0, guard: 0, tauntT: 0, dashT: 0,
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
        if (cmd.seq !== undefined && cat) cat.inSeq = cmd.seq;      // co-op: the last input we've had from this guest
        Object.assign(inp, { mx: cmd.mx, mz: cmd.mz, yaw: cmd.yaw, pitch: cmd.pitch || 0, primary: !!cmd.primary, jumpHeld: !!cmd.jumpHeld, aim: cmd.aim || inp.aim });
        if (cmd.jump) inp.jump = true;           // edge-triggered: latched until consumed
        if (cmd.secondary) inp.secondary = true;
        if (cmd.alt) inp.alt = true;             // E: second ability
        break;
      }
      case 'place': this.placeTrap(cat, cmd.trap, cmd.ax, cmd.az, cmd.rot || 0, cmd.wallDir, !!cmd.top); break;
      case 'sellTrap': this.sellTrap(cmd.cell, cmd.layer); break;
      case 'item': this.useItem(cat, cmd.aim); break;
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
  crateUp(i) { const k = i >= 0 ? this.crateAt[i] : 0; return k && this.crates[k - 1].up ? this.crates[k - 1] : null; }
  // No traps in crate stacks or on shelf spots. A shelf's fall area is fine while nothing lies there
  // (a trap it lands on is just covered until the mice chew the shelf away).
  noBuild(i) { const k = this.crateAt[i]; return this.shelfAt[i] > 0 || (k > 0 && (!this.crates[k - 1].fallen || this.crates[k - 1].up)); }
  // Height of a furniture top a floor trap could sit on (0 = not a top): a low solid block
  // (crates, the well, sacks) or a table/counter/bench surface.
  topHeight(i) {
    if (i < 0) return 0;
    if (this.map.type[i] === T.SOLID && this.map.solid[i] >= 0.8 && this.map.solid[i] <= 4.6 && !(this.map.door[i] >= 0)) return this.map.solid[i];
    const st = this.map.slabTop[i]; return st >= 0.8 && st <= 4.6 ? st : 0;
  }

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
    const cr = this.crateUp(i); if (cr) h = Math.max(h, cr.h || CRATE_H);   // a collapsed stall is a lower pile
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
      if (tr.kind === 'barricade') c += BARRICADE_COST;
      else c += TRAPS[tr.kind].pathCost || 0;
    }
    return c;
  }
  extraOf = (i) => (this.extraArr ? this.extraArr[i] : 0);   // per-cell step cost (traps, gate) for nextCell
  passSmall = (i) => miceWalkable(this.map.type[i]);
  passBig = (i) => (this.map.bigOk[i] === 1 && this.map.type[i] !== T.SOLID) || this.map.type[i] === T.HOLE || this.map.type[i] === T.GATE;   // (shut doors are blockers, see doorShut)
  isBlocker = (i) => (this.map.type[i] === T.GATE && this.gate.up) || this.occBarricade(i) || !!this.crateUp(i) || this.doorShut(i);
  doorShut(i) { const d = this.map.door[i]; return d >= 0 && !this.doors[d].open; }
  extraOfBig = (i) => (this.extraBig ? this.extraBig[i] : 0);   // bosses: no danger memory (fearless)
  occBarricade(i) { const id = this.occ.floor[i]; return id ? this.traps.get(id).kind === 'barricade' : false; }
  updateFlow() {
    // Precompute per-cell trap cost + blocker flags once (much faster than
    // looking traps up inside the pathfinder for 46k cells).
    const N = W * H, extra = new Float32Array(N), blk = new Uint8Array(N);
    for (const tr of this.traps.values()) if (tr.layer !== 'top') for (const i of tr.cells) {
      extra[i] += tr.kind === 'barricade' ? BARRICADE_COST : (TRAPS[tr.kind].pathCost || 0);
      if (tr.kind === 'barricade') blk[i] = 1;
    }
    if (this.gate.up) for (let i = 0; i < N; i++) if (this.map.type[i] === T.GATE) { extra[i] += 10 + this.gate.hp / 4; blk[i] = 1; }
    for (const c of this.crates) if (c.up) for (const i of c.cells) { extra[i] += CRATE_COST; blk[i] = 1; }
    if (this.doors.length) for (let i = 0; i < N; i++) if (this.doorShut(i)) { extra[i] += DOOR_WAIT_COST; blk[i] = 1; }
    for (let i = 0; i < N; i++) if (this.fireCost[i]) extra[i] += this.fireCost[i];
    // A barrel standing (or lying) still is in the way: route round it rather than into it.
    for (const b of this.barrels || []) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const c = cellOf(b.x + dx * CELL, b.z + dz * CELL); if (c >= 0 && Math.hypot(dx, dz) * CELL <= BARREL_R + 0.25) extra[c] += 20;
    }
    const extraS = extra;   // (danger used to go in here; now it only weighs lane choice, see chooseVia)
    this.blk = blk; this.extraArr = extraS; this.extraBig = extra;
    // Furniture routes that are open (a Poison Box on top closes one). Small mice only.
    this.links = this.openLinks();
    this.linkFrom = new Map();
    for (const L of this.links) {
      const c = linkCost(L);
      for (const e of L.entryA) { if (!this.linkFrom.has(e)) this.linkFrom.set(e, []); this.linkFrom.get(e).push({ L, exit: L.cellB, cost: c, from: 'a' }); }
      for (const e of L.entryB) { if (!this.linkFrom.has(e)) this.linkFrom.set(e, []); this.linkFrom.get(e).push({ L, exit: L.cellA, cost: c, from: 'b' }); }
    }
    const base = { goals: this.goals, extra: (i) => extraS[i], blocked: (i) => blk[i] === 1, links: this.links };
    this.flow = computeFlow(this.map, { ...base, pass: this.passSmall });
    this.flowBig = computeFlow(this.map, { ...base, extra: (i) => extra[i], pass: this.passBig, links: null });   // bosses don't climb
    this.flowBase = base;
    this.viaDirty.fill(true);          // route-choice fields refresh one per tick (spreads the cost)
    this.flowDirty = false; this.routeCache = null;
  }
  openLinks() { return (this.map.links || []).filter(L => !L.cells.some(i => { const t = this.trapAt('top', i); return t && t.kind === 'barricade'; })); }
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
  // The direct (cheapest) route is a candidate too (-1), so the arrows on the floor are
  // all routes mice really take, and the shortest one gets the biggest share.
  // Danger remembered along a lane (sampled every 2 units of its route), in path-cost units.
  laneDanger(door, k) {
    const pts = this.traces && this.traces.get(door + ':' + k); if (!pts) return 0;
    let sum = 0;
    for (let j = 0; j < pts.length; j += 4) {
      const b = Math.floor(pts[j][1] / (this.DB * CELL)) * this.dbw + Math.floor(pts[j][0] / (this.DB * CELL));
      sum += Math.min(DANGER_CAP, this.danger[b] || 0);
    }
    return sum * 4;
  }
  chooseVia(door) {
    this.routes();                                   // makes sure each lane's route is traced (cached)
    const costs = VIAS.map((_, k) => this.viaCost(k, door) + this.laneDanger(door, k));
    const direct = this.flow[this.spawnCells[door % this.spawnCells.length]] + this.laneDanger(door, -1);
    const min = Math.min(direct, ...costs);
    if (!(min < Infinity)) return -1;
    const w = costs.map((c, k) => (c < Infinity && c <= min * 1.6 + 30) ? VIAS[k].weight * Math.exp(-(c - min) / 40) : 0);
    const wd = direct < Infinity ? Math.exp(-(direct - min) / 40) : 0;
    let r = this.rng() * (wd + w.reduce((a, b) => a + b, 0));
    if ((r -= wd) <= 0) return -1;
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
        const at = i;
        i = nextCell(this.map, f, i, this.passSmall, this.isBlocker, this.extraOf, this.linkFrom);
        if (i <= -2) {   // over the furniture: draw the climb, then carry on from the far side
          const o = this.linkFrom.get(at)[-2 - i], P = o.from === 'a' ? o.L.path : [...o.L.path].reverse();
          for (const [x, z] of P) pts.push([x, z, o.L.y]);
          i = o.exit; continue;
        }
        if (i < 0 && f !== this.flow) { f = this.flow; i = cellOf(pts[pts.length - 1][0], pts[pts.length - 1][1]); }
      }
      return pts;
    };
    const out = []; this.traces = new Map();
    this.spawnCells.forEach((start, door) => {
      const costs = VIAS.map((_, k) => this.viaCost(k, door)), min = Math.min(...costs);
      // Direct route first (the one route() returns), then every lane packs may take.
      const d = trace(start, -1); out.push(d); this.traces.set(door + ':-1', d);
      costs.forEach((c, k) => { if (c < Infinity && c <= min * 1.6 + 30) { const t = trace(start, k); out.push(t); this.traces.set(door + ':' + k, t); } });
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
  // top = a floor trap going on a furniture top (tables, counters, crates, the well...).
  canPlace(kind, ax, az, rot = 0, wallDir = -1, top = false) {
    const def = TRAPS[kind]; if (!def) return false;
    if (def.topOnly && !top) return false;                     // Knife Block: tables and counters only
    const cells = this.footprint(kind, ax, az, rot, wallDir);
    if (top) {
      if (def.surface !== 'floor' || kind === 'bait' || def.noTop) return false;   // a Poison Box on top closes a furniture route; no trapdoors in tables
      const h0 = this.topHeight(cells[0]);
      for (const i of cells) if (i < 0 || this.occ.top[i] || !h0 || Math.abs(this.topHeight(i) - h0) > 0.05 || this.noBuild(i)) return false;
      return true;
    }
    const layer = def.surface;
    for (const i of cells) {
      if (i < 0 || this.occ[layer][i] || this.noBuild(i)) return false;
      if (layer === 'floor' && this.barrels.some(b => Math.hypot((i % W + 0.5) * CELL - b.home[0], (((i / W) | 0) + 0.5) * CELL - b.home[1]) < 1.2)) return false;   // a barrel's spot (it comes back each wave)
      if (!floorish(this.map.type[i]) || this.map.door[i] >= 0) return false;   // not in a doorway that swings shut
      if (layer === 'ceiling' && !this.map.covered[i]) return false;
      if (layer === 'wall') {
        if (wallDir < 0) return false;
        const [dx, dz] = DIRS4[wallDir];
        const n = idx(i % W + dx, ((i / W) | 0) + dz);
        if (this.map.type[n] !== T.SOLID || this.map.solid[n] < 1.0 || this.shelfAt[n]) return false;   // not on a shelf (it falls over)
      }
    }
    if (kind === 'barricade') {
      for (const m of this.mice) if (m.state === 'walk' && cells.includes(cellOf(m.x, m.z))) return false;
      // Always leave the mice an open route (they can still chew through).
      // Cached per spot until the layout changes: the ghost asks this every frame while you
      // hold a Poison Box, and each check is a full path search.
      const key = cells.join(',');
      if (this.sealVer !== this.layoutVer) { this.sealCache = new Map(); this.sealVer = this.layoutVer; }
      let sealed = this.sealCache.get(key);
      if (sealed === undefined) {
        const extraWall = new Set(cells);
        const test = computeFlow(this.map, { goals: this.goals, pass: this.passSmall, wall: (i) => extraWall.has(i) || this.occBarricade(i), links: this.openLinks() });   // climbing over furniture counts as a way through
        sealed = this.spawnCells.some(c => !(test[c] < Infinity)); this.sealCache.set(key, sealed);
      }
      if (sealed) return 'seal';
    }
    return true;
  }
  placeTrap(cat, kind, ax, az, rot, wallDir, top = false) {
    if (cat && cat.loadout && !cat.loadout.includes(kind)) return;   // only traps you brought
    const def = TRAPS[kind]; if (!def || !cat) return;
    if (this.sardines < def.cost) { this.emit({ t: 'msg', text: 'Not enough Paw Points' }); return; }
    const ok = this.canPlace(kind, ax, az, rot, wallDir, top);
    if (ok === 'seal') { this.emit({ t: 'msg', text: 'Leave them a way through' }); return; }
    if (!ok) { this.emit({ t: 'msg', text: TRAPS[kind].topOnly && !top ? `The ${TRAPS[kind].name} goes on a table or counter top` : "Can't place that there" }); return; }
    const cells = this.footprint(kind, ax, az, rot, wallDir);
    this.sardines -= def.cost;
    const xs = cells.map(i => i % W), zs = cells.map(i => (i / W) | 0);
    // p = this trap's working numbers with the placing cat's shop upgrades applied.
    const up = cat.upgrades ? cat.upgrades[kind] : null, P = trapParams(kind, up);
    const tr = { id: this.nextId++, by: cat.id, kind, cells, layer: top ? 'top' : def.surface, y: top ? this.topHeight(cells[0]) : 0, rot, wallDir, cd: 0, hp: P.hp || 0, maxHp: P.hp || 0, p: P, tier: (up && up.tier) || 1, special: (up && up.special) || null,
      cost: def.cost, charges: P.charges || P.nibbles || 0, rechargeT: 0, cdMax: P.cooldown || P.recharge || 1, tickT: 0,
      ceil: def.surface === 'ceiling' ? this.map.slabBot[cells[0]] : 0,
      x0: Math.min(...xs) * CELL, x1: (Math.max(...xs) + 1) * CELL, z0: Math.min(...zs) * CELL, z1: (Math.max(...zs) + 1) * CELL };
    for (const i of cells) this.occ[tr.layer][i] = tr.id;
    this.traps.set(tr.id, tr);
    this.stats.trapsPlaced++;
    this.flowDirty = true; this.layoutVer++;
    this.emit({ t: 'trapAdd', trap: tr });
  }
  sellTrap(cell, layer) {
    const order = layer ? [layer, 'top', 'ceiling', 'wall', 'floor'] : ['top', 'ceiling', 'wall', 'floor'];
    for (const l of order) {
      const tr = this.trapAt(l, cell);
      if (tr) {
        // Full refund; a chewed barricade refunds only for the health it has left.
        const refund = tr.kind === 'barricade' ? Math.floor(tr.cost * tr.hp / tr.maxHp) : tr.cost;
        this.removeTrap(tr); this.sardines += refund;
        this.emit({ t: 'msg', text: `Sold for ${refund} Paw Points` }); this.emit({ t: 'sold', x: (tr.x0 + tr.x1) / 2, z: (tr.z0 + tr.z1) / 2 }); return;
      }
    }
  }
  removeTrap(tr) {
    for (const i of tr.cells) if (this.occ[tr.layer][i] === tr.id) this.occ[tr.layer][i] = 0;
    this.traps.delete(tr.id); this.flowDirty = true; this.layoutVer++;
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
  dropTrinket(x, z, tier, stranded) {
    const p = this.reachableSpot(x, z, stranded); if (!p) return;
    const pool = Object.keys(TRINKETS).filter(k => TRINKETS[k].tier === tier);
    const key = pool[Math.floor(this.rng() * pool.length)];
    this.loot.push({ id: this.nextId++, ...p, key });
    this.emit({ t: 'msg', text: `A ${TRINKETS[key].tier} trinket dropped!` });
  }

  // ---------- main step ----------
  step() {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.time += DT; this.tick++;
    this.barkCooldown -= DT;
    if (this.flowDirty) this.updateFlow();
    const vd = this.viaDirty.indexOf(true); if (vd >= 0) this.viaField(vd);
    this.stepPhase();
    this.stepDanger();
    for (const cat of this.cats.values()) this.stepCat(cat);
    this.stepTraps();
    this.buildMouseGrid();
    for (const m of this.mice) this.stepMouse(m);
    this.stepShots();
    this.stepGlobs();
    this.stepBirds();
    this.stepZones();
    this.stepMapFeatures();
    this.stepFallers();
    this.stepMissiles();
    if (this.mice.some(m => m.dead)) this.mice = this.mice.filter(m => !m.dead);
    if (this.lives <= 0 && this.phase !== 'lost') {
      this.lives = 0; this.phase = 'lost'; this.emit({ t: 'end', won: false });
    }
  }

  // Danger memory: fades every second; enough new danger and the mice re-plan their route.
  // Also keeps a short list of hot spots for the radar (sniff shows where they're scared of).
  stepDanger() {
    if ((this.dangerT -= DT) > 0) return;
    this.dangerT = 1;
    const d = this.danger, spots = [], bs = this.DB * CELL;
    for (let b = 0; b < d.length; b++) {
      if (d[b] <= 0) continue;
      d[b] = d[b] > 0.1 ? d[b] * DANGER_DECAY : 0;
      if (d[b] > 4) spots.push([((b % this.dbw) + 0.5) * bs, (((b / this.dbw) | 0) + 0.5) * bs, Math.min(1, d[b] / DANGER_MAX)]);
    }
    this.dangerSpots = spots;   // [x, z, 0..1] block centres, for the radar
    this.dangerDelta = 0;
  }
  addDanger(x, z, amt) {
    const bx = Math.floor(x / (this.DB * CELL)), bz = Math.floor(z / (this.DB * CELL));
    // Its own block takes the full amount, the blocks around it a third.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = bx + dx, nz = bz + dz; if (nx < 0 || nz < 0 || nx >= this.dbw || nz >= this.dbh) continue;
      const b = nz * this.dbw + nx; this.danger[b] = Math.min(DANGER_MAX, this.danger[b] + amt * (dx || dz ? 0.33 : 1));
    }
    this.dangerDelta += amt;
  }

  stepPhase() {
    if (this.phase === 'build') {
      this.phaseTimer -= DT;
      if (this.phaseTimer <= 0) {
        this.wave++; this.phase = 'wave';
        this.spawn = { ...buildWave(this.wave, this.rng, this.gate.up, { birds: this.mapDef.birds !== false }), t: 0 }; this.packVia = -2;
        this.spawn.hpMul *= (1 + 0.08 * ((this.mapDef.order || 1) - 1)) * this.diff.hp;     // each map further in is a bit tougher; difficulty
        this.emit({ t: 'msg', text: `Wave ${this.wave}` + (this.wave % 12 === 0 ? ' — BIG BOSS RAT' : this.wave % 6 === 0 ? ' — mini boss' : '') });
        this.emit({ t: 'waveStart', wave: this.wave, boss: this.wave % 6 === 0 });
        for (const f of this.foods) f.left = f.amount;                                                       // food restocked
        for (const f of this.tops) f.left = f.amount;
        for (const c of this.crates) if (!c.up && !c.fallen) { c.up = true; c.hp = c.maxHp; this.flowDirty = true; this.layoutVer++; this.emit({ t: 'crateUp', id: c.id }); }   // servants restack the crates
        for (const sh of this.shelves) if (sh.state !== 'up') this.standShelf(sh);                            // ...and stand the shelves back up
        for (const st of this.stalls) if (st.state !== 'up') this.rebuildStall(st);                           // ...and prop the stalls back up
        for (const b of this.barrels) { if (b.x !== b.home[0] || b.z !== b.home[1]) this.flowDirty = true; [b.x, b.z] = b.home; b.vx = b.vz = 0; b.lying = false; }   // ...and roll the barrels home
        for (let i = 0; i < this.danger.length; i++) this.danger[i] *= 0.5;                                     // they half-forget between waves
        for (const p of this.props) { [p.x, p.y, p.z] = p.home; p.state = 'up'; p.vx = p.vy = p.vz = 0; p.tilt = 0; }   // pots back on the shelves
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
        if (MICE[e.type].bird) this.spawnBird(e.type, s.hpMul); else this.spawnMouse(e.type, s.hpMul, e.pack, this.door, this.packVia);
        if (e.intro) this.emit({ t: 'msg', text: `NEW: ${MICE[e.type].name} — ${INTRO_TEXT[e.type] || ''}` });
        s.t += e.gap;
        if (e.gap > 0.1) { this.door = (this.door + 1) % SPAWNS.length; this.packVia = -2; }   // next pack: other entrance, new lane
      }
    } else if (this.mice.length === 0 && this.shots.length === 0 && this.birds.length === 0) {
      if (this.mode === 'normal' && this.wave >= RULES.winWave) {
        this.phase = 'won';
        this.rating = ratePaws(this.lives, this.stats, this.diff.lives);
        this.emit({ t: 'end', won: true, rating: this.rating });
      } else {
        this.phase = 'build'; this.phaseTimer = RULES.buildPhaseSeconds;
        // Income that doesn't depend on hauling tails, so you can always build.
        const bonus = Math.round((RULES.waveBonus + this.wave * 15) * this.mods.waveBonus); this.sardines += bonus;
        this.emit({ t: 'msg', text: `Wave ${this.wave} cleared  +${bonus} Paw Points` }); this.emit({ t: 'waveClear', wave: this.wave });
        this.bark('clear', null, true);
      }
    }
  }

  spawnMouse(type, hpMul, packSize = 1, door = 0, via = -1) {
    const SPAWN = SPAWNS[door % SPAWNS.length];
    const hp = Math.max(1, Math.round(MICE[type].hp * (MICE[type].boss ? 1 + (hpMul - 1) * 0.5 : hpMul)));   // bosses only get half the per-wave toughening
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
      lane: (this.rng() * 2 - 1) * 0.9, via, spitT: 1 + this.rng() * 2, stompT: 1.5, windT: 0,
      climber: !MICE[type].big && !MICE[type].bird && MICE[type].size < 0.7 && this.rng() < 0.3 };   // about 1 in 3 small mice go for food up on the furniture
    this.mice.push(m);
    return m;
  }

  // el = element (see ELEMENTS in config). Resistances scale the hit, then the element
  // leaves its status on the mouse (wet, burning, chilled, dirty, confused...) and any
  // combo with a status it already has goes off.
  damageMouse(m, n, source, crit = false, el = undefined) {
    if (m.dead) return;
    const d = MICE[m.type];
    if (el === undefined) el = SRC_EL[source] || null;
    if (el && d.res && d.res[el] !== undefined) n *= d.res[el];
    if (m.packed && source !== 'stranded') n *= RULES.packDamageTaken;
    if (m.vulnT > 0) n *= CAT.roarVuln;          // shaken by Mimo's roar
    if (m.jamT > 0 && m.jamVuln) n *= 1.25;      // Marmalade
    let fizzled = false;
    if (source !== 'dot' && el) {
      // Combos that change this very hit.
      if (el === 'electric' && m.wetT > 0 && source !== 'chain') { n *= 1.5; this.chainShock(m, n); }
      if (el === 'fire' && m.wetT > 0) { n *= 0.5; m.wetT = 0; m.burnT = 0; fizzled = true; this.combo('steam', m); }   // dries it, doesn't light it
    }
    m.hp -= n; m.flash = 0.12;
    if (m.asleep && source !== 'bleed' && source !== 'dot') { m.asleep = false; m.stunT = 0; }   // a hit wakes a sleeping mouse
    if (n >= 1) this.emit({ t: 'dmg', x: m.x, y: m.y + d.size, z: m.z, n: Math.round(n), crit, el });
    // Death: finishes off a badly hurt mouse outright (not bosses).
    if (el === 'death' && m.hp > 0 && !d.boss && m.hp < m.maxHp * STATUS.executeAt) { m.hp = 0; this.emit({ t: 'execute', x: m.x, z: m.z }); }
    if (m.hp <= 0) { this.killMouse(m, source); return; }
    if (source !== 'dot' && el && !fizzled) this.applyStatus(m, el);
  }
  // The lasting part of an element hit.
  applyStatus(m, el) {
    const d = MICE[m.type], boss = !!d.boss;
    switch (el) {
      case 'fire':
        if (m.wetT > 0) break;                                        // steam already handled
        if (m.oilT > 0) {                                             // BLAZE: oil goes up
          m.oilT = 0; m.burnT = STATUS.blazeSecs; m.burnDps = STATUS.blazeDps; this.combo('blaze', m);
          for (const o of this.nearMice(m.x, m.z, STATUS.spreadRange)) if (o !== m && !o.dead && !(o.wetT > 0) && Math.hypot(o.x - m.x, o.z - m.z) < STATUS.spreadRange) { o.burnT = Math.max(o.burnT || 0, STATUS.burnSecs); o.burnDps = Math.max(o.burnDps || 0, STATUS.burnDps); }
        } else { m.burnT = Math.max(m.burnT || 0, STATUS.burnSecs); m.burnDps = Math.max(m.burnDps || 0, STATUS.burnDps); }
        break;
      case 'water': m.wetT = STATUS.wetSecs; m.burnT = 0; break;
      case 'ice':
        m.chill = (m.chillT > 0 ? m.chill || 0 : 0) + 1; m.chillT = STATUS.chillSecs; m.slowT = Math.max(m.slowT, 1);
        if (m.wetT > 0 || m.chill >= 3) {                            // FROZEN SOLID
          m.chill = 0; m.wetT = 0; m.burnT = 0;
          if (boss) m.slowT = Math.max(m.slowT, 3); else { m.stunT = m.stunMax = STATUS.freezeSecs; m.frozen = true; m.asleep = false; }
          this.combo('freeze', m);
        }
        break;
      case 'earth': m.dirtyT = STATUS.dirtySecs; break;
      case 'physics':
        if (m.dirtyT > 0) {                                           // KNOCKDOWN
          m.dirtyT = 0; m.stunT = m.stunMax = Math.max(m.stunT, STATUS.knockdownSecs * (boss ? 0.4 : 1)); m.windT = 0;
          this.combo('knockdown', m);
        }
        break;
      case 'electric': if (!boss && !(m.stunT > 0)) m.stunT = m.stunMax = 0.25; break;   // a jolt
      case 'psychic': if (!boss) m.confuseT = STATUS.confuseSecs; break;
      case 'poison': m.toxT = STATUS.toxSecs; m.toxDps = Math.max(m.toxDps || 0, STATUS.toxDps); break;
      case 'wind':                                                    // SPREAD: carries fire and poison to the pack
        if (m.burnT > 0 || m.toxT > 0) {
          let n = 0;
          for (const o of this.nearMice(m.x, m.z, STATUS.spreadRange)) {
            if (o === m || o.dead || Math.hypot(o.x - m.x, o.z - m.z) > STATUS.spreadRange) continue;
            if (m.burnT > 0 && !(o.wetT > 0)) { o.burnT = Math.max(o.burnT || 0, STATUS.burnSecs); o.burnDps = Math.max(o.burnDps || 0, STATUS.burnDps); n++; }
            if (m.toxT > 0) { o.toxT = STATUS.toxSecs; o.toxDps = Math.max(o.toxDps || 0, m.toxDps); n++; }
          }
          if (n) this.combo('spread', m);
        }
        break;
    }
  }
  // Wet mouse hit by electricity: the shock jumps to the nearest few (wet ones first).
  chainShock(m, n) {
    const near = this.nearMice(m.x, m.z, STATUS.chainRange).filter(o => o !== m && !o.dead && Math.hypot(o.x - m.x, o.z - m.z) < STATUS.chainRange)
      .sort((a, b) => (b.wetT > 0) - (a.wetT > 0) || Math.hypot(a.x - m.x, a.z - m.z) - Math.hypot(b.x - m.x, b.z - m.z)).slice(0, STATUS.chainJumps);
    const pts = [[m.x, m.z]];
    for (const o of near) { pts.push([o.x, o.z]); this.damageMouse(o, n * STATUS.chainMul, 'chain', false, 'electric'); }
    this.combo('chain', m, { pts });
  }
  // A combo went off: event for the visuals/sound; the first of each kind explains itself.
  combo(kind, m, extra = {}) {
    this.stats.combos = (this.stats.combos || 0) + 1;
    this.emit({ t: 'combo', kind, x: m.x, y: m.y, z: m.z, ...extra });
    this.combosSeen = this.combosSeen || new Set();
    if (!this.combosSeen.has(kind)) { this.combosSeen.add(kind); this.emit({ t: 'msg', text: 'COMBO! ' + COMBOS[kind] }); }
  }
  killMouse(m, source, drowned = false, eaten = false, fell = false) {   // fell = down a trapdoor
    if (m.dead) return;
    m.dead = true; this.stats.kills++;
    const d = MICE[m.type], stranded = m.state === 'stranded';
    if (!drowned) {
      if (d.boss) this.dropTrinket(m.x, m.z, this.rng() < 0.35 ? 'legendary' : 'rare', stranded);
      else if (this.rng() < RULES.trinketChance) this.dropTrinket(m.x, m.z, this.rng() < 0.3 ? 'rare' : 'common', stranded);
    }
    // Danger memory: the pack remembers where this one died (scouts report back louder).
    if (!stranded && !d.boss) {
      this.addDanger(m.x, m.z, d.scout ? DANGER_KILL * DANGER_SCOUT : DANGER_KILL);
      if (d.scout && !this.scoutTold) { this.scoutTold = true; this.emit({ t: 'msg', text: 'A scout died. The mice will remember that spot and look for another way.' }); }
    }
    // Every kill pays Paw Points straight away (no tails to carry any more).
    const pts = Math.round((d.points || 1) * this.mods.points);
    this.sardines += pts; this.emit({ t: 'points', x: m.x, z: m.z, n: pts });
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
    this.emit({ t: 'kill', x: m.x, y: m.y, z: m.z, type: m.type, drowned, eaten, fell, splat: source === 'splat' });
    const who = this.anyCatName();
    if (source === 'trap' || source === 'splat' || source === 'dot' || source === 'chain') this.bark('trap', who); else if (source === 'cat' || source === 'bleed') this.bark('kill', who);
  }

  // ---------- cats ----------
  stepCat(cat) {
    const inp = this.inputs.get(cat.id), def = cat.def, mods = this.mods;
    if (!cat.alive) {
      cat.respawnT -= DT; inp.jump = inp.secondary = inp.alt = false;
      if (cat.respawnT <= 0) Object.assign(cat, { alive: true, hp: def.maxHp, energy: def.maxEnergy, x: CAT_SPAWN.x, z: CAT_SPAWN.z, y: 0, vx: 0, vy: 0, vz: 0, charge: 0 });
      return;
    }
    cat.turn = inp.yaw - cat.yaw;   // for the tail flick
    cat.yaw = inp.yaw; cat.pitch = inp.pitch;
    cat.hurtT = Math.max(0, cat.hurtT - DT);
    cat.energy = Math.min(def.maxEnergy, cat.energy + def.energyRegen * mods.regen * DT);
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
      const onMud = cat.onGround && this.map.mud[cellOf(cat.x, cat.z)] === 1;
      const sp = def.speed * mods.speed * (cat.charge > 0 ? 0.4 : 1) * (cat.buffT > 0 ? CAT.purrSpeed : 1) * (onMud ? MUD_SLOW : 1);
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
      else if (def.secondary === 'roar') this.roar(cat);
    }
    // E: each cat's second ability.
    if (inp.alt) { inp.alt = false; this.ability2(cat, inp); }
    cat.itemT = Math.max(0, cat.itemT - DT); cat.guardT = Math.max(0, cat.guardT - DT); cat.tauntT = Math.max(0, cat.tauntT - DT);
    // Mimo's Sky Swipe: swat the bird when he reaches it.
    if (cat.swipeT > 0) {
      cat.swipeT -= DT;
      for (const b of this.birds) if (!b.dead && Math.hypot(b.x - cat.x, b.y - (cat.y + 0.5), b.z - cat.z) < 1.8) { this.damageBird(b, ABILITY2.skyswipe.damage * CAT.vsBirds * this.dmgMul(cat)); cat.swipeT = 0; this.emit({ t: 'claw', id: cat.id, hits: 1 }); break; }
    }
    // Fred's dash: slash every mouse he passes through.
    if (cat.dashT > 0) {
      cat.dashT -= DT;
      for (const m of this.nearMice(cat.x, cat.z, 1.2)) {
        if (m.dead || cat.dashHit.has(m.id) || Math.hypot(m.x - cat.x, m.z - cat.z) > 0.9) continue;
        cat.dashHit.add(m.id); if (m.bleed.length < this.mods.bleedMax) m.bleed.push(CAT.bleedSeconds);
        this.damageMouse(m, ABILITY2.dash.damage * this.dmgMul(cat), 'cat');
      }
      if (cat.dashT <= 0) cat.dashing = false;
    }
    // Left click (held): Fred spits, Puddin bites, Scary Cat whips, Nebbie shoots whiskers.
    cat.attacking = inp.primary;
    if (inp.primary && cat.attackT <= 0) {
      if (def.primary === 'pellet') this.firePellet(cat, inp);
      else if (def.primary === 'whip') this.whip(cat);
      else if (def.primary === 'whisker') this.fireWhisker(cat, inp);
      else if (def.primary === 'claw') this.claw(cat);
      else if (def.primary === 'burr') this.fireBurr(cat, inp);
      else if (def.primary === 'pebble') this.firePebble(cat, inp);
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

    // Pick up trinkets.
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
      if (dd < tr.p.lure && dd < bd) { bd = dd; best = tr; }
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
    this.swatBirds(cat, CAT.clawRange, CAT.clawDamage * mul);
    this.meleeWorld(cat, CAT.clawRange);
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
  // Mimo: flicked pebble (slight arc).
  firePebble(cat, inp) {
    cat.attackT = CAT.pebbleInterval * this.mods.attackCd;
    const a = this.aimFrom(cat, inp);
    const sx = cat.x + Math.sin(cat.yaw) * 0.4, sy = cat.y + cat.def.height * 0.75, sz = cat.z + Math.cos(cat.yaw) * 0.4;
    const dx = a.x - sx, dy = a.y - sy, dz = a.z - sz, d = Math.hypot(dx, dy, dz) || 1, tf = d / CAT.pebbleSpeed;
    this.missiles.push({ id: this.nextId++, kind: 'pebble', x: sx, y: sy, z: sz, vx: dx / d * CAT.pebbleSpeed, vy: dy / d * CAT.pebbleSpeed + 0.5 * 4 * tf, vz: dz / d * CAT.pebbleSpeed,
      life: 1.4, g: 4, mul: this.dmgMul(cat) });
    this.emit({ t: 'pebble', id: cat.id });
  }
  // Mimo: lion's roar. Everything in range takes more damage for a while; birds drop out of the sky.
  roar(cat) {
    if (cat.secT > 0 || cat.energy < CAT.roarCost) return;
    cat.secT = CAT.roarCooldown * this.mods.abilityCd; cat.energy -= CAT.roarCost;
    let n = 0;
    for (const m of this.nearMice(cat.x, cat.z, CAT.roarRadius)) {
      if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > CAT.roarRadius) continue;
      m.vulnT = CAT.roarSecs; n++;
    }
    for (const b of this.birds) {
      if (b.dead || Math.hypot(b.x - cat.x, b.z - cat.z) > CAT.roarRadius + 3) continue;
      b.vulnT = CAT.roarSecs; b.stunT = CAT.roarBirdStun; n++;
    }
    this.emit({ t: 'roar', id: cat.id, x: cat.x, z: cat.z, r: CAT.roarRadius, n }); this.bark('roar', cat.name, true);
  }

  // ---------- birds ----------
  // Birds come in from the forest edge high up, ignore every route, and go straight for
  // what they want. Magpie: steal (a Cheese Chunk's cheese, a dropped tail, or peck a cat).
  // Crow: carry mice over the defences and drop them near the hole.
  spawnBird(type, hpMul) {
    const d = MICE[type], hp = Math.max(1, Math.round(d.hp * hpMul));
    const x = 6 + this.rng() * (WORLD_W - 12), z = WORLD_H - 2;   // across the whole map's south edge
    const b = { id: this.nextId++, type, x, y: 9, z, vx: 0, vy: 0, vz: 0, hp, maxHp: hp, state: 'in', t: 0, tx: x, tz: 40, ty: 0,
      target: null, carry: d.carry || 0, dead: false, flash: 0, stunT: 0, vulnT: 0, yaw: Math.PI };
    this.pickBirdTarget(b);
    this.birds.push(b);
    this.emit({ t: 'birdIn', id: b.id, kind: type });
    return b;
  }
  pickBirdTarget(b) {
    if (b.type === 'crow') {
      // Drop zone: somewhere on the last stretch of a route, past most of your traps.
      const r = this.route(); const p = r[Math.floor(r.length * (0.72 + this.rng() * 0.15))] || [48, 12];
      b.tx = p[0]; b.tz = p[1]; b.ty = 1.4; b.target = { kind: 'drop' }; return;
    }
    const bait = this.baits.find(t => t.charges > 0);
    if (bait) { b.tx = (bait.x0 + bait.x1) / 2; b.tz = (bait.z0 + bait.z1) / 2; b.ty = 1.2; b.target = { kind: 'bait', id: bait.id }; return; }
    const cats = [...this.cats.values()].filter(c => c.alive);
    const c = cats[Math.floor(this.rng() * cats.length)];
    if (c) { b.tx = c.x; b.tz = c.z; b.ty = c.y + 0.8; b.target = { kind: 'cat', id: c.id }; return; }
    b.state = 'out';
  }
  damageBird(b, n, el = 'physical') {
    if (b.dead) return;
    const res = MICE[b.type].res; if (el && res && res[el] !== undefined) n *= res[el];
    if (b.vulnT > 0) n *= CAT.roarVuln;
    b.hp -= n; b.flash = 0.12;
    this.emit({ t: 'dmg', x: b.x, y: b.y + 0.4, z: b.z, n: Math.round(n), crit: false });
    if (b.hp <= 0) {
      b.dead = true; const d = MICE[b.type];
      this.sardines += d.reward; this.stats.kills++;
      this.emit({ t: 'birdKill', x: b.x, y: b.y, z: b.z, kind: b.type, reward: d.reward });
      // A crow shot down still carrying mice: they fall (and from up high, they splat).
      for (let k = 0; k < b.carry; k++) {
        const m = this.spawnAt('mouse', b.x + (this.rng() - 0.5), b.z + (this.rng() - 0.5), MICE.mouse.hp);
        m.y = b.y; this.launch(m, (this.rng() - 0.5) * 2, 0, (this.rng() - 0.5) * 2);
      }
      b.carry = 0;
      if (this.rng() < 0.4) for (const cat of this.cats.values()) if (cat.def.birdHunter) { this.bark('bird', cat.name, true); break; }
    }
  }
  stepBirds() {
    for (const b of this.birds) {
      if (b.dead) continue;
      const d = MICE[b.type];
      b.flash = Math.max(0, b.flash - DT); if (b.vulnT > 0) b.vulnT -= DT;
      if (b.stuckT > 0) {
        // Caught on flypaper: flaps helplessly, the glue does the rest.
        b.stuckT -= DT; this.damageBird(b, (b.stuckDps || 12) * DT, 'physical'); if (b.stuckT <= 0) b.state = 'out';
        continue;
      }
      if (b.stunT > 0) {
        // Knocked silly by a roar: tumbles down, flaps back up when it comes to.
        b.stunT -= DT; b.vy -= GRAVITY * 0.5 * DT; b.y = Math.max(0.3, b.y + b.vy * DT);
        if (b.stunT <= 0) { b.vy = 0; if (b.state !== 'out') b.state = 'in'; }
        continue;
      }
      const goTo = (x, y, z, sp) => {
        const dx = x - b.x, dy = y - b.y, dz = z - b.z, dd = Math.hypot(dx, dy, dz) || 1, st = Math.min(dd, sp * DT);
        b.x += dx / dd * st; b.y += dy / dd * st; b.z += dz / dd * st;
        if (Math.hypot(dx, dz) > 0.05) b.yaw = Math.atan2(dx, dz);
        return dd;
      };
      if (b.state === 'in') {
        // Cruise high, then dive when overhead.
        const h = Math.hypot(b.tx - b.x, b.tz - b.z);
        goTo(b.tx, h > 4 ? 9 : b.ty, b.tz, d.speed);
        if (b.target && b.target.kind === 'cat') { const c = this.cats.get(b.target.id); if (c && c.alive) { b.tx = c.x; b.tz = c.z; b.ty = c.y + 0.8; } }
        if (h < 0.6 && Math.abs(b.y - b.ty) < 0.3) { b.state = 'act'; b.t = b.type === 'crow' ? 0.4 : 1.2; }
      } else if (b.state === 'act') {
        b.t -= DT;
        if (b.t <= 0) {
          const tg = b.target || {};
          if (tg.kind === 'drop') {
            for (let k = 0; k < b.carry; k++) { const m = this.spawnAt('mouse', b.x + (this.rng() - 0.5) * 1.5, b.z + (this.rng() - 0.5) * 1.5, MICE.mouse.hp); m.y = b.y * 0.5; this.launch(m, 0, 0, 0); }
            if (b.carry) this.emit({ t: 'birdDrop', x: b.x, z: b.z, n: b.carry });
            b.carry = 0;
          } else if (tg.kind === 'bait') {
            const bait = this.traps.get(tg.id);
            if (bait && bait.charges > 0) { bait.charges = 0; bait.rechargeT = bait.cdMax = bait.p.recharge; this.emit({ t: 'steal', x: b.x, z: b.z, what: 'cheese' }); }
          } else if (tg.kind === 'cat') {
            // Pecks the cat and makes off with some Paw Points.
            const c = this.cats.get(tg.id);
            if (c && Math.hypot(c.x - b.x, c.z - b.z) < 1.5) { this.hurtCat(c, d.bite); const took = Math.min(this.sardines, 15); this.sardines -= took; if (took) this.emit({ t: 'steal', x: b.x, z: b.z, what: 'points', n: took }); }
          }
          b.state = 'out';
        }
      } else {
        // Leave the way it came (south, over the forest) and vanish.
        goTo(b.x, 10, WORLD_H + 6, d.speed * 1.2);
        if (b.z > WORLD_H + 4) b.dead = true;
      }
    }
    if (this.birds.some(b => b.dead)) this.birds = this.birds.filter(b => !b.dead);
  }
  // Melee attacks swat birds that swoop low enough (within reach, in front).
  swatBirds(cat, range, dmg) {
    const fx = Math.sin(cat.yaw), fz = Math.cos(cat.yaw);
    for (const b of this.birds) {
      if (b.dead || b.y > cat.y + 1.8 || b.y < cat.y - 0.6) continue;
      const dx = b.x - cat.x, dz = b.z - cat.z, dd = Math.hypot(dx, dz);
      if (dd < range + 0.4 && (dx * fx + dz * fz) > 0) this.damageBird(b, dmg * (cat.def.birdHunter ? CAT.vsBirds : 1));
    }
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
    this.swatBirds(cat, CAT.whipRange, CAT.whipDamage * this.dmgMul(cat));
    this.meleeWorld(cat, CAT.whipRange);
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
    if (!cat.onGround) return false;
    cat.vx = -Math.sin(cat.yaw) * CAT.leapBackH; cat.vz = -Math.cos(cat.yaw) * CAT.leapBackH; cat.vy = CAT.leapBackV;
    cat.onGround = false; cat.dashing = true; cat.flipT = 0.5;
    this.emit({ t: 'leapback', id: cat.id });
    return true;
  }

  // ---------- E: second abilities ----------
  ability2(cat, inp) {
    const key = cat.def.ability2, a = ABILITY2[key];
    if (!a || cat.altT > 0 || cat.energy < a.cost) return;
    const ok = this[`ab_${key}`](cat, a, inp);
    if (ok === false) return;                        // couldn't use it right now: no cost
    cat.altT = a.cd * this.mods.abilityCd; cat.energy -= a.cost;
  }
  ab_leapback(cat) { return this.leapBack(cat); }
  // Fred: Alley Dash — dart forward along the ground, slashing everything he passes.
  ab_dash(cat, a) {
    const sp = a.dist / 0.25;
    cat.vx = Math.sin(cat.yaw) * sp; cat.vz = Math.cos(cat.yaw) * sp; cat.vy = 1; cat.onGround = false;
    cat.dashing = true; cat.dashT = 0.25; cat.dashHit = new Set();
    this.emit({ t: 'dash', id: cat.id });
  }
  // Puddin: Big Sit — flattens and pins the mice under him, then shrugs off hits for a while.
  ab_sit(cat, a) {
    for (const m of this.nearMice(cat.x, cat.z, a.radius + 0.5)) {
      if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > a.radius) continue;
      this.damageMouse(m, a.damage * this.dmgMul(cat), 'splat');
      if (!m.dead) { m.stunT = m.stunMax = MICE[m.type].boss ? a.stun * 0.4 : a.stun; }
    }
    cat.guardT = a.guardSecs; cat.guard = a.guard; cat.vx = cat.vz = 0;
    this.emit({ t: 'sit', id: cat.id, x: cat.x, z: cat.z, r: a.radius });
  }
  // Nebbie: Tinker — every trap nearby resets instantly and hits harder for a while.
  ab_tinker(cat, a) {
    let n = 0;
    for (const tr of this.traps.values()) {
      if (Math.hypot((tr.x0 + tr.x1) / 2 - cat.x, (tr.z0 + tr.z1) / 2 - cat.z) > a.radius || tr.kind === 'barricade') continue;
      tr.cd = 0; tr.boostT = a.buffSecs;
      if (tr.kind === 'gluepad' || tr.kind === 'flypaper') tr.charges = tr.p.charges;
      if (tr.kind === 'bait') tr.charges = tr.p.nibbles;
      n++;
    }
    this.emit({ t: 'tinker', id: cat.id, x: cat.x, z: cat.z, r: a.radius, n });
    if (!n) this.emit({ t: 'msg', text: 'No traps close enough to tinker with' });
    return n > 0;
  }
  // Casper: Show Off — every mouse nearby drops everything to come at him; he takes less damage.
  ab_showoff(cat, a) {
    cat.tauntT = a.secs; cat.guardT = a.secs; cat.guard = a.guard;
    this.emit({ t: 'showoff', id: cat.id, x: cat.x, z: cat.z, r: a.radius }); this.bark('frenzy', cat.name, true);
  }
  // Meow Meow: Groom — heal the most-hurt cat close by (herself if nobody else needs it).
  ab_groom(cat, a) {
    let best = cat, worst = cat.hp / cat.def.maxHp;
    for (const c of this.cats.values()) {
      if (!c.alive || c === cat || Math.hypot(c.x - cat.x, c.z - cat.z) > a.radius) continue;
      if (c.hp / c.def.maxHp < worst) { best = c; worst = c.hp / c.def.maxHp; }
    }
    best.hp = Math.min(best.def.maxHp, best.hp + best.def.maxHp * a.heal);
    this.emit({ t: 'groom', id: best.id, from: cat.id });
  }
  // Mimo: Sky Swipe — springs at the nearest bird in reach and swats it; lands on whatever is below.
  ab_skyswipe(cat, a) {
    let target = null, bd = a.reach;
    for (const b of this.birds) { const dd = Math.hypot(b.x - cat.x, b.y - cat.y, b.z - cat.z); if (!b.dead && dd < bd) { bd = dd; target = b; } }
    const tx = target ? target.x : cat.x + Math.sin(cat.yaw) * 3, tz = target ? target.z : cat.z + Math.cos(cat.yaw) * 3, ty = target ? target.y : cat.y + 5;
    const tf = 0.5, dy = ty - cat.y;
    cat.vx = (tx - cat.x) / tf; cat.vz = (tz - cat.z) / tf; cat.vy = (dy + 0.5 * GRAVITY * tf * tf) / tf; cat.onGround = false; cat.dashing = true;
    cat.swipeT = tf + 0.1; cat.swipeTarget = target ? target.id : null; cat.striking = true;
    this.emit({ t: 'skyswipe', id: cat.id });
  }

  // ---------- map features: fire, timed doors, knock-over props ----------
  stepMapFeatures() {
    // Fire (kitchen ovens, hearth): burns mice and cats that get close.
    for (const fz of this.mapDef.fires || []) {
      for (const m of this.nearMice(fz.x, fz.z, fz.r + 0.5)) if (!m.dead && Math.hypot(m.x - fz.x, m.z - fz.z) < fz.r && m.y < 2) this.damageMouse(m, FIRE_DPS * DT, 'fire');
      for (const c of this.cats.values()) {
        if (!c.alive || c.y > 2 || Math.hypot(c.x - fz.x, c.z - fz.z) > fz.r) continue;
        c.burn = (c.burn || 0) + FIRE_DPS * 0.75 * DT;
        if (c.burn >= 5) { c.burn -= 5; this.hurtCat(c, 5); }
      }
    }
    // Timed doors (servants' passages): open part of the time, shut the rest. A door
    // won't swing shut on anything standing in it. Every swing reroutes the mice.
    for (let di = 0; di < this.doors.length; di++) {
      const d = this.doors[di], want = ((this.time + d.offset) % d.period) < d.period * 0.55;
      if (want === d.open) continue;
      const [x0, z0, x1, z1] = d.rect, inside = (b) => b.x > x0 - 0.6 && b.x < x1 + 0.6 && b.z > z0 - 0.6 && b.z < z1 + 0.6;
      if (!want && (this.mice.some(m => !m.dead && inside(m)) || [...this.cats.values()].some(c => c.alive && inside(c)))) continue;
      d.open = want;
      for (let i = 0; i < this.map.door.length; i++) if (this.map.door[i] === di) this.map.solid[i] = want ? 0 : 6;   // shut: a wall to bodies; still floor to the pathing (they wait)
      this.flowDirty = true; this.routeCache = null; this.layoutVer++;
      this.emit({ t: 'door', i: di, open: want });
    }
    // Knock-over props: a cat brushing past knocks it flying. It falls; if it drops far
    // enough onto mice it smashes them and leaves a spill that slows them down.
    for (const p of this.props) {
      if (p.state === 'up') {
        for (const c of this.cats.values()) {
          if (!c.alive || Math.abs(c.y - p.y) > 1.2 || Math.hypot(c.x - p.x, c.z - p.z) > c.def.radius + 0.45) continue;
          // Swatted the way the cat is facing (cats knock things off tables on purpose).
          const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), sp = 5 + Math.hypot(c.vx, c.vz) * 0.3;
          p.vx = fx * sp; p.vz = fz * sp; p.vy = 1.5; p.state = 'fall'; p.fallFrom = p.y;
          this.emit({ t: 'knock', id: p.id, x: p.x, z: p.z }); break;
        }
      } else if (p.state === 'fall') {
        p.vy -= GRAVITY * DT; p.x += p.vx * DT; p.y += p.vy * DT; p.z += p.vz * DT; p.tilt += DT * 8;
        const i = cellOf(p.x, p.z);
        const ground = i < 0 ? 0 : this.groundAt(i, p.y + 0.2, 0.3, true);
        if (i >= 0 && this.map.type[i] === T.SOLID && this.map.solid[i] > p.y) { p.vx *= -0.3; p.vz *= -0.3; p.x -= p.vx * DT * 2; p.z -= p.vz * DT * 2; }
        if (p.y <= ground) {
          p.y = ground;
          const drop = (p.fallFrom || 0) - ground;
          // Still on the same table: skid along it (and maybe off the edge).
          if (drop < 0.3 && Math.hypot(p.vx, p.vz) > 0.6) { p.vy = 0; p.vx *= 0.9; p.vz *= 0.9; continue; }
          p.state = 'down'; p.tilt = Math.PI / 2;
          if (drop > 1.2) {
            let n = 0;
            for (const m of this.nearMice(p.x, p.z, 1.8)) if (!m.dead && Math.hypot(m.x - p.x, m.z - p.z) < 1.4 && Math.abs(m.y - ground) < 1) { this.damageMouse(m, 25 + drop * 6, 'splat'); n++; }
            this.zones.push({ id: this.nextId++, kind: 'spill', x: p.x, z: p.z, r: 1.6, t: 8, what: p.kind });
            this.emit({ t: 'smash', id: p.id, x: p.x, y: ground, z: p.z, kind: p.kind, hits: n });
            if (n >= 2) this.bark('trap', null);
          } else this.emit({ t: 'tip', id: p.id, x: p.x, z: p.z });
        }
      }
    }
  }

  // ---------- things that fall over: shelves and barrels ----------
  // A cat hitting near a shelf (claws, bites, whips, darts...) wobbles it; enough hits and over it goes.
  hitWorld(x, z, power = 1, dirX = 0, dirZ = 0) {
    for (const sh of this.shelves) {
      if (sh.state !== 'up') continue;
      const [x0, z0, x1, z1] = sh.rect;
      if (x < x0 - 1.2 || x > x1 + 1.2 || z < z0 - 1.2 || z > z1 + 1.2) continue;
      sh.hp -= power; this.emit({ t: 'shelfHit', id: sh.id, x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
      if (sh.hp <= 0) { sh.state = 'falling'; sh.t = 0; }
    }
    // Stall legs stand at the counter's corners: hit near one and it starts to give.
    for (const st of this.stalls) {
      if (st.state !== 'up') continue;
      const [x0, z0, x1, z1] = st.rect;
      if (![[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5], [x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5]].some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 1.6)) continue;
      st.hp -= power; this.emit({ t: 'stallHit', id: st.id, x, z });
      if (st.hp <= 0) { st.state = 'falling'; st.t = 0; this.emit({ t: 'stallFalling', id: st.id }); }
    }
    for (const b of this.barrels) {
      if (Math.hypot(b.x - x, b.z - z) > BARREL_R + 0.8 || Math.hypot(b.vx, b.vz) > 1) continue;
      let dx = dirX, dz = dirZ; if (!dx && !dz) { dx = b.x - x; dz = b.z - z; }
      const l = Math.hypot(dx, dz) || 1; this.rollBarrel(b, dx / l, dz / l);
    }
  }
  // Melee swings test the spot in front of the cat.
  meleeWorld(cat, reach) { this.hitWorld(cat.x + Math.sin(cat.yaw) * reach * 0.7, cat.z + Math.cos(cat.yaw) * reach * 0.7, 1, Math.sin(cat.yaw), Math.cos(cat.yaw)); }
  rollBarrel(b, dx, dz) {
    b.vx = dx * BARREL_SPEED; b.vz = dz * BARREL_SPEED; b.lying = true; b.hit = new Set();
    this.emit({ t: 'barrelRoll', id: b.id, x: b.x, z: b.z });
  }
  standShelf(sh) {
    // Servants stand it back up (anyone standing there gets nudged out of the way first).
    const [x0, z0, x1, z1] = sh.rect;
    for (const c of this.cats.values()) if (c.x > x0 - 0.5 && c.x < x1 + 0.5 && c.z > z0 - 0.5 && c.z < z1 + 0.5) { c.x += sh.dir[0] * 2; c.z += sh.dir[1] * 2; }
    sh.state = 'up'; sh.hp = SHELF_HITS; sh.t = 0;
    sh.crate.up = false; sh.crate.hp = sh.crate.maxHp;
    for (const i of sh.cells) { this.map.type[i] = T.SOLID; this.map.solid[i] = sh.h; }
    this.flowDirty = true; this.layoutVer++;
    this.emit({ t: 'shelfUp', id: sh.id });
  }
  // A stall counter coming down: crushes everything under it, sends the pots on top
  // flying, crushes any trap mounted under or on it (full refund), and leaves a pile of
  // planks and produce across the crossing that the mice have to chew through.
  collapseStall(st) {
    st.state = 'down';
    const [x0, z0, x1, z1] = st.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, under = (b, pad = 0) => b.x > x0 - pad && b.x < x1 + pad && b.z > z0 - pad && b.z < z1 + pad;
    for (const i of st.cells) { this.map.slabBot[i] = 0; this.map.slabTop[i] = 0; this.map.covered[i] = 0; }
    st.crate.up = true; st.crate.hp = st.crate.maxHp;
    // Out from under it: the nearest open long side (or end).
    const shove = (b) => {
      const out = [[b.x, z0 - 0.6], [b.x, z1 + 0.6], [x0 - 0.6, b.z], [x1 + 0.6, b.z]].filter(([x, z]) => { const h = this.colH(cellOf(x, z), true); return h >= 0 && h < 0.5; });
      out.sort((a, c) => Math.hypot(a[0] - b.x, a[1] - b.z) - Math.hypot(c[0] - b.x, c[1] - b.z));
      if (out.length) [b.x, b.z] = out[0]; else b.y = STALL_PILE_H + 0.05;
    };
    let n = 0;
    for (const m of this.mice) if (!m.dead && m.y < st.bot && under(m, 0.2)) {
      this.damageMouse(m, STALL_CRUSH * (MICE[m.type].boss ? 0.5 : 1), 'splat'); n++;
      if (!m.dead) shove(m);
    }
    for (const c of this.cats.values()) if (c.alive && c.y < st.bot && under(c)) { this.hurtCat(c, 15); shove(c); }
    for (const p of this.props) if (p.state === 'up' && under(p) && Math.abs(p.y - st.top) < 0.5) {
      const side = p.z < cz ? -1 : 1; p.vx = (p.x - cx) * 0.2 + (this.rng() - 0.5) * 2; p.vz = side * (2.5 + this.rng() * 2); p.vy = 1; p.state = 'fall'; p.fallFrom = p.y;
    }
    for (const tr of [...this.traps.values()]) if ((tr.layer === 'ceiling' || tr.layer === 'top') && tr.cells.some(i => st.cells.includes(i))) {
      this.removeTrap(tr); this.sardines += tr.cost;
      this.emit({ t: 'msg', text: `${TRAPS[tr.kind].name} crushed when the stall came down: refunded ${tr.cost} Paw Points` });
    }
    this.flowDirty = true; this.routeCache = null; this.layoutVer++;
    this.emit({ t: 'stallFall', id: st.id, x: cx, z: cz, hits: n });
    if (!this.stallTold) { this.stallTold = true; this.emit({ t: 'msg', text: 'Stall down! The pile blocks the crossing until the mice chew through. It goes back up next wave.' }); }
    if (n >= 2) this.bark('trap', null);
  }
  rebuildStall(st) {
    const f = this.mapDef.furniture[st.fi];
    for (const i of st.cells) { this.map.slabBot[i] = f.bot; this.map.slabTop[i] = f.top; this.map.covered[i] = 1; }
    for (const c of this.cats.values()) if (c.x > st.rect[0] && c.x < st.rect[2] && c.z > st.rect[1] && c.z < st.rect[3] && c.y > st.bot - 0.6 && c.y < st.top) c.y = st.top;   // not stuck inside the counter
    st.state = 'up'; st.hp = STALL_HITS; st.t = 0; st.crate.up = false; st.crate.hp = st.crate.maxHp;
    this.flowDirty = true; this.routeCache = null; this.layoutVer++;
    this.emit({ t: 'stallUp', id: st.id });
  }
  stepFallers() {
    for (const st of this.stalls) if (st.state === 'falling' && (st.t += DT) >= STALL_FALL_SECS) this.collapseStall(st);
    for (const sh of this.shelves) {
      if (sh.state !== 'falling') continue;
      sh.t += DT;
      if (sh.t < SHELF_FALL_SECS) continue;
      // Down it comes: everything under it is crushed, and it blocks the way like a crate stack.
      sh.state = 'down';
      for (const i of sh.cells) { this.map.type[i] = T.FLOOR; this.map.solid[i] = 0; }
      const [x0, z0, x1, z1] = sh.fall; let n = 0;
      const inFall = (b, pad = 0) => b.x > x0 - pad && b.x < x1 + pad && b.z > z0 - pad && b.z < z1 + pad;
      for (const m of this.mice) if (!m.dead && m.y < 2 && inFall(m, 0.2)) { this.damageMouse(m, SHELF_CRUSH * (MICE[m.type].boss ? 0.5 : 1), 'splat'); n++; }
      // A cat under it gets clipped and shoved out the nearest open side.
      for (const c of this.cats.values()) if (c.alive && c.y < 2 && inFall(c)) {
        this.hurtCat(c, 15);
        const out = [[x0 - 0.6, c.z], [x1 + 0.6, c.z], [c.x, z0 - 0.6], [c.x, z1 + 0.6]].filter(([x, z]) => { const h = this.colH(cellOf(x, z), true); return h >= 0 && h < 0.5; });
        out.sort((a, b) => Math.hypot(a[0] - c.x, a[1] - c.z) - Math.hypot(b[0] - c.x, b[1] - c.z));
        if (out.length) [c.x, c.z] = out[0]; else c.y = CRATE_H + 0.05;   // nowhere to go: it ends up on top
      }
      sh.crate.up = true; sh.crate.hp = sh.crate.maxHp;
      this.flowDirty = true; this.layoutVer++;
      this.emit({ t: 'shelfFall', id: sh.id, x: (x0 + x1) / 2, z: (z0 + z1) / 2, hits: n });
      if (!this.shelfTold) { this.shelfTold = true; this.emit({ t: 'msg', text: 'Shelf down! It blocks the passage until the mice chew through. It goes back up next wave.' }); }
      if (n >= 2) this.bark('trap', null);
    }
    for (const b of this.barrels) {
      const sp = Math.hypot(b.vx, b.vz);
      // Bumping a still barrel knocks it rolling (cats do this to everything).
      if (sp < 0.3) {
        for (const c of this.cats.values()) {
          if (!c.alive || c.y > 1.5) continue;
          const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
          const v = Math.hypot(c.vx, c.vz);
          if (d < BARREL_R + c.def.radius && v > 2) { this.rollBarrel(b, c.vx / v, c.vz / v); break; }   // off it goes the way the cat was running
        }
        continue;
      }
      // Rolling: sub-steps, bounce off anything solid, flatten mice (once each per roll).
      const n = Math.ceil(sp * DT / 0.2);
      for (let k = 0; k < n; k++) {
        const nx = b.x + b.vx * DT / n, nz = b.z + b.vz * DT / n;
        const wall = (x, z) => { const h = this.colH(cellOf(x, z), false); return h > 0.6 || h < -0.5; };   // walls, crates, barricades and water all turn it back
        const wallX = wall(nx + Math.sign(b.vx) * BARREL_R * 0.8, b.z), wallZ = wall(b.x, nz + Math.sign(b.vz) * BARREL_R * 0.8);
        // A hard bounce wobbles a shelf it hits (a barrel into a shelf can bring it down).
        if (wallX) { if (Math.abs(b.vx) > 3) this.hitWorld(nx + Math.sign(b.vx) * BARREL_R, b.z, 2); b.vx = -b.vx * 0.4; this.emit({ t: 'barrelHit', x: b.x, z: b.z }); } else b.x = nx;
        if (wallZ) { if (Math.abs(b.vz) > 3) this.hitWorld(b.x, nz + Math.sign(b.vz) * BARREL_R, 2); b.vz = -b.vz * 0.4; this.emit({ t: 'barrelHit', x: b.x, z: b.z }); } else b.z = nz;
      }
      for (const m of this.nearMice(b.x, b.z, BARREL_R + 1)) {
        if (m.dead || b.hit.has(m.id) || m.y > 1.5 || Math.hypot(m.x - b.x, m.z - b.z) > BARREL_R + MICE[m.type].size * 0.35) continue;
        b.hit.add(m.id);
        this.damageMouse(m, 30 + sp * 8, 'splat');
        if (!m.dead && !MICE[m.type].boss && MICE[m.type].size < 0.9) { const sx = -b.vz / sp, sz = b.vx / sp, side = (m.x - b.x) * sx + (m.z - b.z) * sz >= 0 ? 1 : -1; this.launch(m, sx * side * 5 + b.vx * 0.4, 3.5, sz * side * 5 + b.vz * 0.4); }
      }
      const f = Math.max(0, sp - BARREL_FRICTION * DT) / sp; b.vx *= f; b.vz *= f;
      if (sp * f < 0.3) { b.vx = b.vz = 0; this.flowDirty = true; }   // came to rest somewhere new: mice route round it
    }
    // Mice don't walk through a standing barrel: push them round it.
    for (const b of this.barrels) for (const m of this.nearMice(b.x, b.z, BARREL_R + 0.6)) {
      if (m.dead || m.state !== 'walk' || m.y > 1) continue;
      const dx = m.x - b.x, dz = m.z - b.z, d = Math.hypot(dx, dz) || 0.01, min = BARREL_R + MICE[m.type].size * 0.35;
      if (d < min) {
        // Out to the rim, plus a step along it the way the mouse is heading, so it slides round
        // the barrel (pushing straight out left a mouse walking at the centre stuck there forever).
        const ox = dx / d, oz = dz / d, f = -Math.sin(m.yaw) * oz + Math.cos(m.yaw) * ox, side = Math.abs(f) < 0.2 ? (m.id % 2 ? 1 : -1) : Math.sign(f);
        const nx = b.x + ox * min - oz * side * 0.15, nz = b.z + oz * min + ox * side * 0.15, c = cellOf(nx, nz);
        if (c >= 0 && this.passSmall(c)) { m.x = nx; m.z = nz; }
      }
    }
  }

  // ---------- Q: items (one per cat) ----------
  useItem(cat, aim) {
    if (!cat || !cat.alive || !cat.item || cat.itemT > 0) return;
    const it = ITEMS[cat.item], p = aim || { x: cat.x + Math.sin(cat.yaw) * 4, z: cat.z + Math.cos(cat.yaw) * 4 };
    const near = (r) => this.mice.filter(m => !m.dead && Math.hypot(m.x - p.x, m.z - p.z) < r);
    switch (cat.item) {
      case 'laser': this.zones.push({ id: this.nextId++, kind: 'laser', x: p.x, z: p.z, r: it.radius, t: it.secs }); break;
      case 'bola': for (const m of near(it.radius)) { if (MICE[m.type].boss) { m.slowT = it.secs; continue; } m.state = 'stuck'; m.stuckT = it.secs; m.glueId = -1; } break;
      case 'catnip':
        for (const c of this.cats.values()) if (c.alive && Math.hypot(c.x - p.x, c.z - p.z) < it.radius + 1) c.buffT = Math.max(c.buffT, it.secs);
        for (const m of near(it.radius)) { if (MICE[m.type].boss) continue; m.fearT = it.secs; m.fearX = m.x + (this.rng() - 0.5) * 6; m.fearZ = m.z + (this.rng() - 0.5) * 6; }
        break;
      case 'flea': this.zones.push({ id: this.nextId++, kind: 'flea', x: p.x, z: p.z, r: it.radius, t: it.secs, dps: it.dps }); break;
      case 'tonic': cat.hp = Math.min(cat.def.maxHp, cat.hp + cat.def.maxHp * it.heal); break;
      case 'bell':      // Bell Collar: everything near YOU panics and runs
        for (const m of this.mice) { if (m.dead || Math.hypot(m.x - cat.x, m.z - cat.z) > it.radius || MICE[m.type].boss) continue; m.fearT = it.secs; m.fearX = cat.x; m.fearZ = cat.z; }
        break;
      case 'pistol': {  // Water Pistol: a stream along the aim line, soaking everything it passes
        const dx = p.x - cat.x, dz = p.z - cat.z, l = Math.hypot(dx, dz) || 1, fx = dx / l, fz = dz / l;
        for (const m of this.nearMice(cat.x + fx * it.range / 2, cat.z + fz * it.range / 2, it.range / 2 + 1)) {
          const ax = m.x - cat.x, az = m.z - cat.z, along = ax * fx + az * fz, side = Math.abs(ax * fz - az * fx);
          if (m.dead || along < 0 || along > it.range || side > 0.9) continue;
          this.damageMouse(m, it.damage, 'cat', false, 'water'); if (!m.dead && !MICE[m.type].boss) { m.x += fx * 0.4; m.z += fz * 0.4; }
        }
        this.emit({ t: 'squirt', id: cat.id, x: cat.x, z: cat.z, nx: fx, nz: fz, reach: it.range });
        break;
      }
      case 'matches': this.zones.push({ id: this.nextId++, kind: 'fire', x: p.x, z: p.z, r: it.radius, t: it.secs, dps: it.dps }); break;
      case 'holy': for (const m of near(it.radius)) this.damageMouse(m, it.damage, 'cat', false, 'holy'); break;
      case 'squeaky': this.decoys.push({ id: this.nextId++, x: p.x, y: 0, z: p.z, hp: it.hp, maxHp: it.hp, t: it.secs, alive: true, decoy: true, onGround: true, def: { radius: 0.3, taunt: 3 } }); break;
    }
    cat.itemT = it.cd;
    this.emit({ t: 'item', id: cat.id, item: cat.item, x: p.x, z: p.z, r: it.radius || 0 });
  }
  stepZones() {
    for (const zn of this.zones) {
      zn.t -= DT;
      if (zn.kind === 'flea') for (const m of this.nearMice(zn.x, zn.z, zn.r + 0.5)) if (!m.dead && Math.hypot(m.x - zn.x, m.z - zn.z) < zn.r) this.damageMouse(m, zn.dps * DT, 'poison');
      // A lit match: burns (and ignites) anything in it; an oily mouse blazes.
      if (zn.kind === 'fire') for (const m of this.nearMice(zn.x, zn.z, zn.r + 0.5)) if (!m.dead && m.y < 1 && Math.hypot(m.x - zn.x, m.z - zn.z) < zn.r) this.damageMouse(m, zn.dps * DT, 'fire');
      // Cactus soil from a Flower Pot: dirty and prickly.
      if (zn.kind === 'soil') for (const m of this.nearMice(zn.x, zn.z, zn.r + 0.5)) if (!m.dead && Math.hypot(m.x - zn.x, m.z - zn.z) < zn.r) { m.dirtyT = Math.max(m.dirtyT || 0, 1); m.toxT = Math.max(m.toxT || 0, 1); m.toxDps = Math.max(m.toxDps || 0, STATUS.toxDps); }
      // Honey puddles: everything wading through is slowed; Beehive bees sting (poison).
      if (zn.kind === 'honey') for (const m of this.nearMice(zn.x, zn.z, zn.r + 0.5)) {
        if (m.dead || m.y > 1 || Math.hypot(m.x - zn.x, m.z - zn.z) > zn.r) continue;
        m.slowT = Math.max(m.slowT, 0.4);
        if (zn.bees) this.damageMouse(m, 4 * DT, 'poison');
      }
      // Spills: water from pots and buckets soaks mice, oil from jugs makes them oily, grain from baskets makes them dirty.
      if (zn.kind === 'spill') for (const m of this.nearMice(zn.x, zn.z, zn.r + 0.5)) {
        if (m.dead || Math.hypot(m.x - zn.x, m.z - zn.z) > zn.r) continue;
        m.slowT = Math.max(m.slowT, 0.3);
        if (zn.what === 'jug') m.oilT = STATUS.oilSecs; else if (zn.what === 'basket') m.dirtyT = STATUS.dirtySecs; else { m.wetT = STATUS.wetSecs; m.burnT = 0; }
      }
    }
    if (this.zones.some(z => z.t <= 0)) this.zones = this.zones.filter(z => z.t > 0);
    for (const d of this.decoys) { d.t -= DT; if (d.t <= 0 || d.hp <= 0) { d.alive = false; this.emit({ t: 'decoyGone', id: d.id, x: d.x, z: d.z }); } }
    if (this.decoys.some(d => !d.alive)) this.decoys = this.decoys.filter(d => d.alive);
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
    this.swatBirds(cat, CAT.biteRange, CAT.biteDamage * this.dmgMul(cat));
    this.meleeWorld(cat, CAT.biteRange);
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
    this.hitWorld(cat.x, cat.z, 2, Math.sin(cat.yaw), Math.cos(cat.yaw));
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
    cat.charge = 0;
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
    m.climb = null; m.link = null;                  // knocked off whatever it was climbing
    m.state = 'air'; m.onGround = false; m.vx = vx; m.vy = vy; m.vz = vz; m.y += 0.05;
  }

  stepMouse(m) {
    if (m.dead) return;
    const d = MICE[m.type], r = d.size * 0.35;
    m.flash = Math.max(0, m.flash - DT);
    m.slowT = Math.max(0, m.slowT - DT);
    if (m.bleed.length) {
      this.damageMouse(m, m.bleed.length * CAT.bleedDps * DT, 'bleed');
      m.bleed = m.bleed.map(t => t - DT).filter(t => t > 0);
      if (m.dead) return;
    }
    // Statuses from elements: burning and poison tick; the rest just wear off.
    if (m.burnT > 0) { m.burnT -= DT; if (m.wetT > 0) m.burnT = 0; else this.damageMouse(m, (m.burnDps || STATUS.burnDps) * DT, 'dot', false, 'fire'); if (m.burnT <= 0) m.burnDps = 0; if (m.dead) return; }
    if (m.toxT > 0) { m.toxT -= DT; this.damageMouse(m, (m.toxDps || STATUS.toxDps) * DT, 'dot', false, 'poison'); if (m.toxT <= 0) m.toxDps = 0; if (m.dead) return; }
    if (m.wetT > 0) m.wetT -= DT;
    if (m.oilT > 0) m.oilT -= DT;
    if (m.dirtyT > 0) m.dirtyT -= DT;
    if (m.chillT > 0) { m.chillT -= DT; if (m.chillT <= 0) m.chill = 0; else m.slowT = Math.max(m.slowT, DT); }
    if (m.confuseT > 0) m.confuseT -= DT;
    if (m.frozen && !(m.stunT > 0)) m.frozen = false;

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
        // Landing from a Spoon Catapult: splat whatever it lands on.
        if (m.catapult) {
          const c = m.catapult; m.catapult = null; let n = 0;
          for (const o of this.nearMice(m.x, m.z, c.r + 0.5)) if (o !== m && !o.dead && Math.abs(o.y - m.y) < 1 && Math.hypot(o.x - m.x, o.z - m.z) < c.r) { this.damageMouse(o, c.dmg, 'splat'); if (c.hot && !o.dead) this.damageMouse(o, 1, 'trap', false, 'fire'); n++; }
          if (c.hot && !m.dead) this.damageMouse(m, 1, 'trap', false, 'fire');
          this.emit({ t: 'catapultLand', x: m.x, z: m.z, hits: n, hot: c.hot });
          if (m.dead) return;
        }
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
    if (m.vulnT > 0) m.vulnT -= DT;
    // Floating in a soap bubble: rises, can't move, then drops (and splats a little).
    if (m.bubbleT > 0) { m.bubbleT -= DT; m.y = Math.min(2, m.y + DT * 3); if (m.bubbleT <= 0) this.launch(m, 0, 0, 0); return; }
    // Held in place: running in a Hamster Wheel or clamped in a Clothes Peg.
    if (m.holdT > 0) { m.holdT -= DT; [m.x, m.z] = m.holdAt; if (m.holdT <= 0) m.holdBy = 0; return; }
    if (m.jamT > 0) { m.jamT -= DT; m.slowT = Math.max(m.slowT, 0.1); if (m.jamAnts) this.damageMouse(m, 3 * DT, 'poison'); if (m.dead) return; }   // Sticky Jam (Ant Trail: ants)
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
    // Climbing to food on a furniture top: the whole trip (walk over, scramble up, eat, climb down).
    if (m.climb) { this.stepClimb(m, d); return; }
    if (m.link) { this.stepLink(m, d); return; }
    if (m.climber && !m.gorged && !d.big && m.state === 'walk' && this.tops.length && !(m.fearT > 0)) {
      const f = this.tops.find(f => f.left > 0 && Math.hypot(f.climb[0] - m.x, f.climb[1] - m.z) < 7);
      if (f) { m.climb = { f, phase: 'to', t: 0, stuck: 0 }; this.stepClimb(m, d); return; }
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
    // Laser Pointer: mice near the red dot chase it (bosses too proud).
    if (!d.boss && m.state === 'walk') {
      const dot = this.zones.find(z => z.kind === 'laser' && Math.hypot(z.x - m.x, z.z - m.z) < z.r);
      if (dot) {
        const dx = dot.x + Math.sin(this.tick * 0.2 + m.id) * 0.8 - m.x, dz = dot.z + Math.cos(this.tick * 0.17 + m.id) * 0.8 - m.z, dd = Math.hypot(dx, dz) || 1;
        const okl = (x, z) => { const c = cellOf(x, z); return c >= 0 && pass(c) && !this.isBlocker(c); };
        const st = Math.min(dd, d.speed * 1.2 * DT), nx = m.x + dx / dd * st, nz = m.z + dz / dd * st;
        if (okl(nx, nz)) { m.x = nx; m.z = nz; } else if (okl(nx, m.z)) m.x = nx; else if (okl(m.x, nz)) m.z = nz;
        m.yaw = Math.atan2(dx, dz); return;
      }
    }
    // Food piles (market, stables, cellar, kitchen): mice stop to gorge and come out tougher.
    if (!d.boss && !m.gorged && m.state === 'walk' && this.foods.length) {
      const f = this.foods.find(f => f.left > 0 && Math.hypot(f.x - m.x, f.z - m.z) < f.r);
      if (f) {
        m.gorgeT = (m.gorgeT || 0) + DT;
        if (m.gorgeT > GORGE_SECS) {
          m.gorged = true; f.left--; m.maxHp = Math.round(m.maxHp * GORGE_HP); m.hp = Math.min(m.maxHp, m.hp * GORGE_HP); m.scale *= 1.12;
          this.emit({ t: 'gorged', x: m.x, z: m.z, food: f.name, left: f.left });
          if (f.left === 0) this.emit({ t: 'msg', text: `The ${f.name.toLowerCase()} are all gone.` });
        }
        return;
      }
    }
    // Cheese Chunk: if one with cheese left is close, go and nibble it (not bosses, not if full).
    if (!d.boss && !m.fed && !(m.baitIgnoreT > 0) && m.state === 'walk') {
      const bait = this.nearestBait(m);
      if (bait) {
        const bx = (bait.x0 + bait.x1) / 2, bz = (bait.z0 + bait.z1) / 2, dx = bx - m.x, dz = bz - m.z, dd = Math.hypot(dx, dz);
        m.yaw = Math.atan2(dx, dz);
        if (dd < 1.1 + d.size * 0.3) {
          m.eatT = (m.eatT || 0) + DT; bait.charges -= DT;
          if (bait.p.poisoned) { m.toxT = STATUS.toxSecs; m.toxDps = Math.max(m.toxDps || 0, STATUS.toxDps * 1.5); }     // Poisoned Cheese
          if (bait.charges <= 0) { bait.charges = 0; bait.rechargeT = bait.cdMax = bait.p.recharge; this.emit({ t: 'baitGone', id: bait.id }); }
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

    // Siege mice wreck what's along their way: every few seconds one stops, aims at the
    // nearest trap in range and lobs a rock at it (one that's already jammed isn't worth it).
    if (m.type === 'lobber' && m.state === 'walk' && !m.climb) {
      if (m.aimT > 0) {
        m.aimT -= DT;
        if (m.aimT <= 0) {
          const tr = this.traps.get(m.aimAt);
          if (tr) {
            const tx = (tr.x0 + tr.x1) / 2, tz = (tr.z0 + tr.z1) / 2, ty = tr.layer === 'ceiling' ? tr.ceil - 0.3 : tr.layer === 'wall' ? 1 : (tr.y || 0) + 0.3, tf = 1.2;
            this.shots.push({ id: this.nextId++, x: m.x, y: 0.5, z: m.z, vx: (tx - m.x) / tf, vz: (tz - m.z) / tf, vy: (ty - 0.5 + 0.5 * GRAVITY * tf * tf) / tf, t: tf, trap: tr.id });
            this.emit({ t: 'lob', x: m.x, z: m.z });
            if (!this.siegeTold) { this.siegeTold = true; this.emit({ t: 'msg', text: 'Siege mice lob rocks at your traps: Poison Boxes take a beating, anything else jams for a few seconds.' }); }
          }
          m.siegeCd = SIEGE_EVERY;
        }
        return;   // standing still to aim
      }
      m.siegeCd = (m.siegeCd ?? 2) - DT;
      if (m.siegeCd <= 0) {
        let best = null, bd = SIEGE_RANGE;
        for (const tr of this.traps.values()) { const dd = Math.hypot((tr.x0 + tr.x1) / 2 - m.x, (tr.z0 + tr.z1) / 2 - m.z); if (dd < bd && !(tr.jamT > 0)) { bd = dd; best = tr; } }
        if (best) { m.aimT = SIEGE_AIM; m.aimAt = best.id; m.yaw = Math.atan2((best.x0 + best.x1) / 2 - m.x, (best.z0 + best.z1) / 2 - m.z); return; }
        m.siegeCd = 1;   // nothing in range: look again in a second
      }
    }

    // Nearest cat on (roughly) our level — what we fight.
    // Cats with taunt (Casper) count as closer, so mice pick them first and chase from further.
    let foe = null, foeD = Infinity, best = Infinity;
    for (const cat of [...this.cats.values(), ...this.decoys]) {     // squeaky toys count as very tempting cats
      if (!cat.alive || Math.abs(cat.y - m.y) > 1.2) continue;
      const tn = cat.tauntT > 0 ? 4 : (cat.def.taunt || 1);
      const dd = Math.hypot(cat.x - m.x, cat.z - m.z), eff = dd / tn;
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
      m.biteT = 1.0;
      if (foe.decoy) { foe.hp -= d.bite; this.emit({ t: 'toySqueak', x: foe.x, z: foe.z }); } else this.hurtCat(foe, d.bite * this.mods.bite);
    }

    // Neighbours: count packmates (strength in numbers) and push apart (collision).
    let packN = 0, sx = 0, sz = 0, jx = 0, jz = 0, jn = 0;
    for (const o of this.nearMice(m.x, m.z, RULES.packRadius)) {
      if (o === m || o.dead || o.state !== 'walk') continue;
      const dx = m.x - o.x, dz = m.z - o.z, dist = Math.hypot(dx, dz);
      if (dist < RULES.packRadius) packN++;
      if (m.jamT > 0 && o.jamT > 0 && dist < RULES.packRadius) { jx += o.x; jz += o.z; jn++; }   // jammy mice cling together
      const min = r + MICE[o.type].size * 0.35;
      if (dist < min && dist > 0.0001) { const push = (min - dist) / dist * (MICE[o.type].size >= d.size ? 0.5 : 0.25); sx += dx * push; sz += dz * push; }
    }
    m.packed = packN >= RULES.packCount;
    if (jn) { const cx = jx / jn - m.x, cz = jz / jn - m.z, cd = Math.hypot(cx, cz); if (cd > 0.3) { const k = Math.min(cd - 0.3, 1.5 * DT) / cd; sx += cx * k; sz += cz * k; } }   // drawn to the middle of the jammy clump

    const ok = (x, z) => { const c = cellOf(x, z); return c >= 0 && pass(c) && !this.isBlocker(c); };
    if (this.map.mud[i]) m.dirtyT = Math.max(m.dirtyT || 0, 1);     // stables mud: dirty mice get knocked flat by physics
    const sp = d.speed * (m.slowT > 0 ? (m.chillT > 0 ? STATUS.chillSlow : CAT.hairballSlow) : 1) * (m.packed ? RULES.packSpeed : 1) * (this.map.mud[i] ? MUD_SLOW : 1);
    let mx, mz;
    m.ignoreT = Math.max(0, (m.ignoreT || 0) - DT);
    const reachT = foe && foe.tauntT > 0 ? ABILITY2.showoff.radius : foe && foe.decoy ? ITEMS.squeaky.radius : d.aggro * (foe ? (foe.def.taunt || 1) : 1);
    const chasing = foe && (d.aggro || foe.tauntT > 0 || foe.decoy) && foeD < reachT && foe.onGround !== false && m.ignoreT === 0;
    if (chasing) {
      // Go for the cat. Stop at biting distance (no pushing into it).
      const dx = foe.x - m.x, dz = foe.z - m.z, dd = foeD || 1, reach = d.size * 0.5 + foe.def.radius;
      const go = dd > reach ? 1.15 : 0;
      mx = dx / dd * go; mz = dz / dd * go; m.yaw = Math.atan2(dx, dz);
    } else if (m.confuseT > 0 && !d.boss) {
      // Confused (psychic): wander back the way it came — the reverse of its route.
      const n = nextCell(this.map, flow, i, pass, this.isBlocker, this.extraOf);
      if (n < 0) return;
      const [cx, cz] = cellCenter(n), [ix, iz] = cellCenter(i), fl = Math.hypot(cx - ix, cz - iz) || 1;
      mx = -(cx - ix) / fl * 0.7 + Math.sin(this.time * 3 + m.id) * 0.4; mz = -(cz - iz) / fl * 0.7 + Math.cos(this.time * 3 + m.id) * 0.4;
      m.yaw = Math.atan2(mx, mz);
    } else {
      // Follow the flow field.
      const n = nextCell(this.map, flow, i, pass, this.isBlocker, d.big ? this.extraOfBig : this.extraOf, d.big ? null : this.linkFrom);
      if (n <= -2) {   // the best way on is over the furniture
        const o = this.linkFrom.get(i)[-2 - n];
        m.link = { L: o.L, from: o.from, phase: 'up', t: 0, k: 0, sx: m.x, sz: m.z }; this.stepLink(m, d); return;
      }
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
          } else if (this.doorShut(n)) {
            // A shut door: wait for the servants to open it again.
          } else if (this.crateUp(n)) {
            // Smashing through a crate stack to open the shortcut.
            const c = this.crateUp(n); c.hp -= d.gateDmg; this.emit({ t: 'crateHit', id: c.id, x: m.x, z: m.z });
            if (c.hp <= 0) this.breakCrate(c);
          } else {
            const b = this.isBarricade(n);
            if (b) { b.hp -= d.gateDmg * (b.p.tough ? 0.5 : 1); this.emit({ t: 'barricadeHit', id: b.id }); if (b.hp <= 0) this.removeTrap(b); }
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

  // A mouse going for food on a furniture top. Phases: to (walk to the climb spot by the
  // edge), up (scramble up), top (walk to the food), eat (gorge: tougher), back, down.
  // Floor traps placed on the top hit it while it's up there; cats can jump up after it.
  stepClimb(m, d) {
    const c = m.climb, f = c.f, [cx, cz] = f.climb;
    const ux = f.x - cx, uz = f.z - cz, ul = Math.hypot(ux, uz) || 1, ex = cx + ux / ul * 1.0, ez = cz + uz / ul * 1.0;   // first spot up on the top
    const sp = d.speed * (m.slowT > 0 ? CAT.hairballSlow : 1) * DT;
    const toward = (tx, tz, free) => {
      const dx = tx - m.x, dz = tz - m.z, dd = Math.hypot(dx, dz);
      if (dd > 0.01) m.yaw = Math.atan2(dx, dz);
      const st = Math.min(dd, sp), nx = m.x + dx / (dd || 1) * st, nz = m.z + dz / (dd || 1) * st;
      if (free) { m.x = nx; m.z = nz; return dd; }
      const okc = (x, z) => { const q = cellOf(x, z); return q >= 0 && this.passSmall(q) && !this.isBlocker(q); };
      if (okc(nx, nz)) { m.x = nx; m.z = nz; } else if (okc(nx, m.z)) m.x = nx; else if (okc(m.x, nz)) m.z = nz;
      return dd;
    };
    switch (c.phase) {
      case 'to': {
        m.y = 0;
        const ox = m.x, oz = m.z, dd = toward(cx, cz, false);
        if (dd < 0.35) { c.phase = 'up'; c.t = 0; c.sx = m.x; c.sz = m.z; break; }
        c.stuck = Math.hypot(m.x - ox, m.z - oz) < sp * 0.2 ? c.stuck + DT : 0;
        if (c.stuck > 1.5 || f.left <= 0) { m.climb = null; m.climber = false; }          // can't get there: forget it
        break;
      }
      case 'up': case 'down': {
        c.t += DT; const k = Math.min(1, c.t / CLIMB_SECS), up = c.phase === 'up';
        const fx = up ? c.sx : ex, fz = up ? c.sz : ez, tx = up ? ex : cx, tz = up ? ez : cz;
        m.x = fx + (tx - fx) * k; m.z = fz + (tz - fz) * k; m.y = f.y * (up ? k : 1 - k);
        m.yaw = Math.atan2(tx - fx, tz - fz);
        if (k >= 1) { if (up) c.phase = 'top'; else { m.climb = null; m.climber = false; m.y = 0; } }
        break;
      }
      case 'top': m.y = f.y; if (toward(f.x, f.z, true) < f.r * 0.7) { c.phase = 'eat'; c.t = 0; } break;
      case 'eat':
        m.y = f.y; c.t += DT;
        if (f.left <= 0) { c.phase = 'back'; break; }
        if (c.t > GORGE_SECS) {
          m.gorged = true; f.left--; m.maxHp = Math.round(m.maxHp * GORGE_HP); m.hp = Math.min(m.maxHp, m.hp * GORGE_HP); m.scale *= 1.12;
          this.emit({ t: 'gorged', x: m.x, y: m.y, z: m.z, food: f.name, left: f.left });
          if (f.left === 0) this.emit({ t: 'msg', text: `The ${f.name.toLowerCase()} is all gone.` });
          c.phase = 'back';
        }
        break;
      case 'back': m.y = f.y; if (toward(ex, ez, true) < 0.1) { c.phase = 'down'; c.t = 0; } break;
    }
    m.climbing = !!m.climb && (c.phase === 'up' || c.phase === 'down');
  }

  // Over the furniture: scramble up at one end, run along the top, climb down the far side.
  // Traps on the top hit it on the way; cats can jump up and swat it.
  stepLink(m, d) {
    const c = m.link, L = c.L, P = c.from === 'a' ? L.path : [...L.path].reverse(), end = c.from === 'a' ? L.b : L.a;
    const sp = d.speed * (m.slowT > 0 ? CAT.hairballSlow : 1) * (m.chillT > 0 ? STATUS.chillSlow / CAT.hairballSlow : 1) * DT;
    if (c.phase === 'up' || c.phase === 'down') {
      c.t += DT; const k = Math.min(1, c.t / CLIMB_SECS), up = c.phase === 'up';
      const [fx, fz] = up ? [c.sx, c.sz] : P[P.length - 1], [tx, tz] = up ? P[0] : end;
      m.x = fx + (tx - fx) * k; m.z = fz + (tz - fz) * k; m.y = L.y * (up ? k : 1 - k); m.yaw = Math.atan2(tx - fx, tz - fz);
      m.climbing = true;
      if (k >= 1) { if (up) { c.phase = 'top'; c.k = 1; } else { m.link = null; m.climbing = false; m.y = 0; } }
      return;
    }
    // On top: walk the path.
    m.climbing = false; m.y = L.y;
    const [tx, tz] = P[Math.min(c.k, P.length - 1)], dx = tx - m.x, dz = tz - m.z, dd = Math.hypot(dx, dz);
    if (dd > 0.01) m.yaw = Math.atan2(dx, dz);
    if (dd <= sp) { m.x = tx; m.z = tz; if (++c.k >= P.length) { c.phase = 'down'; c.t = 0; } }
    else { m.x += dx / dd * sp; m.z += dz / dd * sp; }
  }

  // One place for "a mouse hurt a cat" (bites, spit, stomps).
  // Returns false when the hit missed (dead cat, or Nebbie dodged).
  hurtCat(cat, dmg) {
    if (!cat.alive) return false;
    cat.stillT = 0;                                  // getting hit wakes a napping cat
    if (cat.guardT > 0) dmg *= 1 - cat.guard;        // Big Sit / Show Off
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

  breakCrate(c) {
    if (!c.up) return;
    c.up = false; c.hp = 0; this.flowDirty = true; this.layoutVer++;
    if (c.stall !== undefined) { const st = this.stalls[c.stall]; st.state = 'broken'; this.emit({ t: 'stallBreak', id: st.id, x: (st.rect[0] + st.rect[2]) / 2, z: (st.rect[1] + st.rect[3]) / 2 }); return; }
    if (c.shelf !== undefined) { const sh = this.shelves[c.shelf]; sh.state = 'broken'; this.emit({ t: 'shelfBreak', id: sh.id, x: (sh.fall[0] + sh.fall[2]) / 2, z: (sh.fall[1] + sh.fall[3]) / 2 }); return; }
    const [x0, z0, x1, z1] = c.rect;
    this.emit({ t: 'crateBreak', id: c.id, x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
    if (!this.crateTold) { this.crateTold = true; this.emit({ t: 'msg', text: 'The mice smashed through the crates! That shortcut is open until the next wave.' }); }
  }
  breakGate() {
    if (!this.gate.up) return;
    this.gate.up = false; this.gate.hp = 0; this.flowDirty = true;
    this.emit({ t: 'gateBreak' }); this.bark('gate', this.anyCatName(), true);
  }

  stepShots() {
    for (const s of this.shots) {
      s.vy -= GRAVITY * DT; s.x += s.vx * DT; s.y += s.vy * DT; s.z += s.vz * DT; s.t -= DT;
      if (s.t > 0) continue;
      s.done = true;
      if (!s.trap) { this.breakGate(); this.emit({ t: 'boom', x: s.x, z: s.z }); continue; }
      // A siege rock landing on a trap (if it's still there).
      const tr = this.traps.get(s.trap);
      this.emit({ t: 'rockHit', x: s.x, z: s.z });
      if (!tr) continue;
      if (tr.kind === 'barricade') { tr.hp -= SIEGE_DMG * (tr.p.tough ? 0.5 : 1); this.emit({ t: 'barricadeHit', id: tr.id }); if (tr.hp <= 0) this.removeTrap(tr); }
      else { tr.jamT = SIEGE_JAM; this.emit({ t: 'jam', id: tr.id, secs: SIEGE_JAM, x: s.x, z: s.z }); }
    }
    if (this.shots.some(s => s.done)) this.shots = this.shots.filter(s => !s.done);
  }

  // Cat projectiles: pellets (fast, single target, bleed) and hairballs (arc, splash, slow).
  stepMissiles() {
    for (const b of this.missiles) {
      b.vy -= b.g * DT; b.life -= DT;
      // Move in short sub-steps so fast darts can't skip over a mouse between ticks.
      const n = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy, b.vz) * DT / 0.3));
      let i = -1, hitMouse = null, hitWorld = false, hitBird = null;
      for (let k = 0; k < n && !hitMouse && !hitWorld && !hitBird; k++) {
        b.x += b.vx * DT / n; b.y += b.vy * DT / n; b.z += b.vz * DT / n;
        i = cellOf(b.x, b.z);
        for (const m of this.nearMice(b.x, b.z, 1.2)) {
          const s = MICE[m.type].size;
          if (!m.dead && !(b.hit && b.hit.includes(m.id)) && Math.hypot(m.x - b.x, m.z - b.z) < s * 0.5 + 0.2 && Math.abs(m.y + s * 0.4 - b.y) < s * 0.6 + 0.2) { hitMouse = m; break; }
        }
        if (!hitMouse) for (const bd of this.birds) if (!bd.dead && Math.hypot(bd.x - b.x, bd.y - b.y, bd.z - b.z) < 0.65) { hitBird = bd; break; }
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
      if (hitWorld && !hitMouse && b.life > 0) this.hitWorld(b.x, b.z, b.kind === 'hairball' ? 2 : 1, b.vx, b.vz);   // darts and pellets wobble shelves and roll barrels
      if (hitBird) {
        // Anything can knock a bird down; Mimo's pebbles hit them three times as hard.
        const base = { pellet: CAT.pelletDamage, whisker: CAT.whiskerDamage, burr: CAT.burrDamage, pebble: CAT.pebbleDamage, hairball: CAT.hairballDamage }[b.kind] || 5;
        this.damageBird(hitBird, base * (b.mul || 1) * (b.kind === 'pebble' ? CAT.vsBirds : 1));
        this.emit({ t: 'pelletHit', x: b.x, y: b.y, z: b.z, mouse: true });
        b.done = true; continue;
      }
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
          this.damageMouse(hitMouse, CAT.burrDamage * (b.mul || 1), 'cat', false, ATTACK_EL.burr);
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
      if (b.kind === 'pebble') {
        // Mimo's pebble: double damage to ranged mice (plague rats, siege mice).
        if (hitMouse) {
          const crit = this.rng() < this.mods.crit, vs = MICE[hitMouse.type].ranged ? CAT.pebbleVsRanged : 1;
          this.damageMouse(hitMouse, CAT.pebbleDamage * vs * (b.mul || 1) * (crit ? 2 : 1), 'cat', crit, ATTACK_EL.pebble);
        }
        this.emit({ t: 'pelletHit', x: b.x, y: Math.max(0, b.y), z: b.z, mouse: !!hitMouse });
        continue;
      }
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
          this.damageMouse(m, CAT.hairballDamage, 'cat', this.rng() < this.mods.crit, ATTACK_EL.hairball);
        }
      }
    }
    if (this.missiles.some(b => b.done)) this.missiles = this.missiles.filter(b => !b.done);
  }

  // ---------- trap behaviour ----------
  // Every trap reads its numbers from tr.p (base + shop upgrades + chosen special).
  stepTraps() {
    const baseMods = this.mods;
    this.baits = [];
    for (const tr of this.traps.values()) if (tr.kind === 'bait') {
      // Eaten-out cheese grows back (well, someone restocks it) after a while.
      if (tr.charges <= 0) { tr.rechargeT -= DT; tr.cd = Math.max(0, tr.rechargeT); if (tr.rechargeT <= 0) { tr.charges = tr.p.nibbles; tr.cd = 0; } }
      this.baits.push(tr);
    }
    const inRect = (b, tr, pad = 0.1) => b.x > tr.x0 - pad && b.x < tr.x1 + pad && b.z > tr.z0 - pad && b.z < tr.z1 + pad;
    // A floor trap hits mice standing at its level: the floor, or the furniture top it sits on.
    let lvl = 0;
    const live = (m) => !m.dead && (m.state === 'walk' || m.state === 'stuck') && Math.abs(m.y - lvl) < 0.35;
    // Wall traps work on the strip of floor in front of them, `reach` units out from the wall.
    const lane = (tr, reach) => {
      const [wx, wz] = DIRS4[tr.wallDir], nx = -wx, nz = -wz;
      return { x0: Math.min(tr.x0, tr.x0 + nx * reach), x1: Math.max(tr.x1, tr.x1 + nx * reach),
               z0: Math.min(tr.z0, tr.z0 + nz * reach), z1: Math.max(tr.z1, tr.z1 + nz * reach), nx, nz };
    };
    const centre = (tr) => [(tr.x0 + tr.x1) / 2, (tr.z0 + tr.z1) / 2];
    // Ceiling traps reach the floor in a circle under them.
    const below = (tr, r) => { const [cx, cz] = centre(tr); return this.nearMice(cx, cz, r + 0.5).filter(m => !m.dead && m.y < 1 && Math.hypot(m.x - cx, m.z - cz) < r); };
    const reset = (tr, secs) => { tr.cd = tr.cdMax = secs * baseMods.trapCd; };
    const bleed = (m, n, max) => { for (let k = 0; k < n; k++) { if (m.bleed.length < max) m.bleed.push(CAT.bleedSeconds); else m.bleed[0] = CAT.bleedSeconds; } };
    for (const tr of this.traps.values()) {
      tr.cd = Math.max(0, tr.cd - DT);
      if (tr.jamT > 0) { tr.jamT -= DT; tr.active = false; continue; }   // jammed by a siege rock
      // Nebbie's Tinker overclocks a trap for a while.
      if (tr.boostT > 0) tr.boostT -= DT;
      const mods = tr.boostT > 0 ? { ...baseMods, trapDmg: baseMods.trapDmg * ABILITY2.tinker.buff } : baseMods;
      const P = tr.p, dmg = (P.damage || 0) * mods.trapDmg, el = P.el; lvl = tr.y || 0;
      switch (tr.kind) {
        case 'barricade':
          // Fumes special: poisons mice walking past (not on it — that's chewing).
          if (P.fumes && (tr.tickT -= DT) <= 0) { tr.tickT = 1; for (const m of this.mice) if (live(m) && inRect(m, tr, 1.2) && !inRect(m, tr, 0)) this.damageMouse(m, 2, 'trap', false, 'poison'); }
          break;
        case 'mousetrap': {
          if (tr.cd > 0) break;
          // Like a spike trap: snaps everything standing on the tile.
          const vs = this.mice.filter(m => live(m) && inRect(m, tr, 0)).slice(0, P.maxHits);
          if (!vs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'snap', id: tr.id });
          for (const m of vs) { if (P.bleed) bleed(m, P.bleed, mods.bleedMax); this.damageMouse(m, dmg, 'trap', false, el); }
          if (P.chain) {   // Chain Snap: the nearest mice just off the tile get it too
            const [cx, cz] = centre(tr);
            const near = this.nearMice(cx, cz, 3).filter(m => live(m) && !inRect(m, tr, 0) && Math.hypot(m.x - cx, m.z - cz) < 2.6).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, P.chain);
            for (const m of near) this.damageMouse(m, dmg * 0.5, 'trap', false, el);
          }
          break;
        }
        case 'flipper': {
          if (tr.cd > 0) break;
          const [dx, dz] = DIRS4[ROT_DIR[tr.rot % 4]];
          const victims = this.mice.filter(m => live(m) && inRect(m, tr));
          const cats = [...this.cats.values()].filter(c => c.alive && c.onGround && Math.abs(c.y - lvl) < 0.3 && inRect(c, tr, 0));
          if (!victims.length && !cats.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'flip', id: tr.id });
          for (const m of victims) {
            // Thrown off the same plate twice in 10 s, a mouse braces and walks over it the third
            // time (a tough one flung back up the lane could otherwise loop forever and stall the wave).
            const fl = m.flungBy && m.flungBy.id === tr.id && this.time - m.flungBy.t < 10 ? m.flungBy : (m.flungBy = { id: tr.id, n: 0, t: 0 });
            fl.n++; fl.t = this.time;
            if (fl.n <= 2) {
              const s = MICE[m.type].size, mul = Math.min(1, (P.big ? 0.9 : 0.5) / (s * s));   // bosses barely budge (Big Spring lifts more)
              this.launch(m, dx * P.launchH * mul + (this.rng() - 0.5) * 2, P.launchV * mul * (0.85 + this.rng() * 0.3), dz * P.launchH * mul + (this.rng() - 0.5) * 2);
            }
            this.damageMouse(m, P.launchDamage * mods.trapDmg, 'trap', false, el);
          }
          for (const c of cats) { c.vx = dx * P.launchH; c.vz = dz * P.launchH; c.vy = P.launchV; c.onGround = false; }
          break;
        }
        case 'grinder': {
          const L = lane(tr, P.reach); let hit = false;
          for (const m of this.mice) if (live(m) && inRect(m, L, 0)) {
            this.damageMouse(m, P.dps * mods.trapDmg * DT, 'trap', false, el); hit = true;
            if (P.bleed && (m.grateT = (m.grateT || 0) - DT) <= 0) { m.grateT = 0.5; bleed(m, 1, mods.bleedMax); }
          }
          tr.active = hit;
          break;
        }
        case 'zapper': {
          if (tr.cd > 0) break;
          const [cx, cz] = centre(tr);
          const vs = this.mice.filter(m => !m.dead && Math.hypot(m.x - cx, m.z - cz) < P.radius && m.y < 1);
          const bs = this.birds.filter(b => !b.dead && b.y < 4 && Math.hypot(b.x - cx, b.z - cz) < P.radius);   // bug zappers fry low-flying birds too
          if (!vs.length && !bs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'zap', id: tr.id, hits: vs.slice(0, 6).map(m => [m.x, m.z]) });
          for (const m of vs) {
            this.damageMouse(m, dmg, 'trap', false, el);
            if (m.dead) continue;
            if (P.arc) this.chainShock(m, dmg * 0.6);                 // Arc: jumps on regardless of wet
            if (P.stun && !MICE[m.type].boss) m.stunT = m.stunMax = Math.max(m.stunT, P.stun);
          }
          for (const b of bs) this.damageBird(b, dmg, el);
          break;
        }
        // ---- new in 0.19 ----
        case 'trapdoor': {
          // Opens when a mouse that fits steps on it, stays open a moment, and drops up to
          // `swallow` mice down the chute (gone: no trinket, splitters don't split).
          const fits = (m) => { const d = MICE[m.type]; return live(m) && inRect(m, tr, 0) && !d.boss && !d.ghost && (P.big || d.size < 0.9); };
          if (!(tr.openT > 0)) {
            if (tr.cd > 0 || !this.nearMice(...centre(tr), 2).some(fits)) break;
            reset(tr, P.cooldown); tr.openT = 0.6; tr.left = P.swallow;
            const [cx, cz] = centre(tr); this.emit({ t: 'trapdoor', id: tr.id, x: cx, z: cz });
          }
          tr.openT -= DT;
          for (const m of this.nearMice(...centre(tr), 2)) if (tr.left > 0 && fits(m)) { tr.left--; this.killMouse(m, 'trap', true, false, true); }
          break;
        }
        case 'magnifier': {
          // Holds a sunbeam on the same mouse(s); heat builds the longer it holds (0..1 over
          // rampSecs), damage climbs from dps to maxDps, and past `hot` it sets them alight.
          const L = lane(tr, P.reach), n = P.split || 1;
          const fromWall = (m) => Math.abs(L.nx) ? Math.abs(m.x - (L.nx > 0 ? tr.x0 : tr.x1)) : Math.abs(m.z - (L.nz > 0 ? tr.z0 : tr.z1));
          const inLane = (m) => m && live(m) && inRect(m, L, 0);
          let tg = (tr.targets || []).map(id => this.mice.find(m => m.id === id)).filter(inLane);
          if (tg.length < n) {
            const more = this.mice.filter(m => inLane(m) && !tg.includes(m)).sort((a, b) => fromWall(a) - fromWall(b)).slice(0, n - tg.length);
            if (more.length && !tg.length) tr.heat = 0;                       // a fresh target: start cool
            tg = tg.concat(more);
          }
          const ids = tg.map(m => m.id);
          if (ids.join() !== (tr.targets || []).join()) this.emit({ t: 'beam', id: tr.id, targets: ids, x: (tr.x0 + tr.x1) / 2, z: (tr.z0 + tr.z1) / 2 });
          tr.targets = ids; tr.active = ids.length > 0;
          if (!tg.length) { tr.heat = Math.max(0, (tr.heat || 0) - DT); tr.charges = tr.heat; break; }
          tr.heat = Math.min(1, (tr.heat || 0) + DT / P.rampSecs); tr.charges = tr.heat;   // charges = heat (the renderer reads it)
          if ((tr.tickT -= DT) > 0) break;
          tr.tickT = 0.25;
          const dps = (P.dps + (P.maxDps - P.dps) * tr.heat) * mods.trapDmg * (n > 1 ? 0.6 : 1);
          for (const m of tg) this.damageMouse(m, dps * 0.25, 'trap', false, tr.heat >= P.hot ? 'fire' : null);
          break;
        }
        case 'knifeblock': {
          // A turret on a table top: throws at the nearest mice in range, floor or furniture.
          if (tr.cd > 0) break;
          const [cx, cz] = centre(tr), y0 = tr.y + 0.8;
          const vs = this.nearMice(cx, cz, P.radius).filter(m => !m.dead && Math.hypot(m.x - cx, m.z - cz) < P.radius)
            .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, P.volley || 1);
          if (!vs.length) break;
          reset(tr, P.cooldown);
          this.emit({ t: 'knife', id: tr.id, x: cx, y: y0, z: cz, to: vs.map(m => [m.x, m.y + 0.2, m.z]) });
          for (const m of vs) {
            bleed(m, P.bleed || 1, mods.bleedMax); this.damageMouse(m, dmg, 'trap', false, el);
            if (P.flatten && !m.dead && MICE[m.type].size < 0.9) { m.dirtyT = Math.max(m.dirtyT || 0, 0.1); this.damageMouse(m, 1, 'trap', false, 'physics'); }   // Cleaver: knocked flat
          }
          break;
        }
        case 'honey': {
          // Drips a sticky puddle under it when mice pass below (the puddle does the work).
          if (tr.cd > 0 || !below(tr, P.radius).length) break;
          reset(tr, P.cooldown); const [cx, cz] = centre(tr);
          this.zones.push({ id: this.nextId++, kind: 'honey', x: cx, z: cz, r: P.radius, t: P.puddleSecs, bees: !!P.bees });
          this.emit({ t: 'honeyDrip', id: tr.id, x: cx, z: cz });
          break;
        }
        // ---- new in 0.21 ----
        case 'cuckoo': {
          // A clock: strikes every `cooldown` seconds whatever is (or isn't) in front of it.
          if (tr.cd > 0) break;
          reset(tr, P.cooldown);
          const hit = this.mice.filter(m => live(m) && inRect(m, lane(tr, P.reach), 0));
          for (const m of hit) { this.damageMouse(m, dmg, 'trap', false, el); if (P.stun && !m.dead && !MICE[m.type].boss) m.stunT = m.stunMax = Math.max(m.stunT, P.stun); }
          this.emit({ t: 'cuckoo', id: tr.id, x: (tr.x0 + tr.x1) / 2, z: (tr.z0 + tr.z1) / 2, hits: hit.length });
          break;
        }
        case 'chandelier': {
          // Waits for a crowd (or one big mouse) underneath, then drops on the lot.
          if (tr.cd > 0) break;
          const vs = below(tr, P.radius);
          if (vs.length < P.crowd && !vs.some(m => MICE[m.type].size >= 0.9)) break;
          reset(tr, P.cooldown); const [cx, cz] = centre(tr);
          for (const m of vs) {
            this.damageMouse(m, dmg, 'trap', false, el);
            if (m.dead) continue;
            if (P.flatten && !MICE[m.type].boss) { m.dirtyT = Math.max(m.dirtyT || 0, 0.1); this.damageMouse(m, 1, 'trap', false, 'physics'); }
            if (P.hot) this.damageMouse(m, 2, 'trap', false, 'fire');
          }
          if (P.hot) this.zones.push({ id: this.nextId++, kind: 'fire', x: cx, z: cz, r: P.radius * 0.7, t: 5, dps: 8 });
          this.emit({ t: 'chandelier', id: tr.id, x: cx, z: cz, hits: vs.length });
          if (vs.length >= 4) this.bark('trap', null);
          break;
        }
        case 'kettle': case 'spicejar': {
          // On a table top: hits floor mice around the table below it.
          if (tr.cd > 0) break;
          const [cx, cz] = centre(tr);
          const vs = this.nearMice(cx, cz, P.radius + 0.5).filter(m => !m.dead && m.y < tr.y - 0.3 && Math.hypot(m.x - cx, m.z - cz) < P.radius);
          if (!vs.length) break;
          reset(tr, P.cooldown);
          for (const m of vs) {
            this.damageMouse(m, dmg, 'trap', false, el);
            if (m.dead) continue;
            if (tr.kind === 'kettle' && P.scare) this.damageMouse(m, 1, 'trap', false, 'psychic');                      // Whistling: they turn tail
            if (tr.kind === 'spicejar') {
              if (!MICE[m.type].boss) m.stunT = m.stunMax = Math.max(m.stunT, P.stun);                                 // achoo
              if (P.hot && !m.dead) this.damageMouse(m, 1, 'trap', false, 'fire');
            }
          }
          this.emit({ t: tr.kind, id: tr.id, x: cx, y: tr.y, z: cz, hits: vs.length });
          break;
        }
        // ---- new in 0.24 ----
        case 'stickyjam': {
          // Wading through jam: slowed, and jammy for a while (they cling together; see stepMouse).
          for (const m of this.nearMice(...centre(tr), 2)) if (live(m) && inRect(m, tr, 0)) {
            if (!(m.jamT > 0)) this.emit({ t: 'jammed', x: m.x, z: m.z });
            m.jamT = P.jamSecs; m.jamVuln = !!P.vuln; m.jamAnts = !!P.ants; m.slowT = Math.max(m.slowT, 0.3);
          }
          break;
        }
        case 'pincushion': {
          // Jabs whatever stands on it every prickSecs: a little damage and another bleed each time.
          if ((tr.tickT -= DT) <= 0) {
            tr.tickT = P.prickSecs; let n = 0;
            for (const m of this.nearMice(...centre(tr), 2)) if (live(m) && inRect(m, tr, 0)) { bleed(m, P.stacks, mods.bleedMax); this.damageMouse(m, dmg, 'trap', false, el); n++; }
            if (n) this.emit({ t: 'prick', id: tr.id, x: (tr.x0 + tr.x1) / 2, z: (tr.z0 + tr.z1) / 2 });
          }
          // Needle Burst: a ring of pins every few seconds.
          if (P.burst && tr.cd <= 0) {
            const [cx, cz] = centre(tr), vs = this.nearMice(cx, cz, 3).filter(m => live(m) && Math.hypot(m.x - cx, m.z - cz) < 2.5);
            if (vs.length) { reset(tr, P.burst); for (const m of vs) { bleed(m, 1, mods.bleedMax); this.damageMouse(m, dmg, 'trap', false, el); } this.emit({ t: 'pinBurst', id: tr.id, x: cx, z: cz }); }
          }
          break;
        }
        case 'catapult': {
          // Lobs the first mouse on it `range` units the way the arrow points, in a high arc;
          // where it lands it splats whatever is there (see the landing in stepMouse).
          if (tr.cd > 0) break;
          const v = this.nearMice(...centre(tr), 2).find(m => live(m) && inRect(m, tr, 0) && !MICE[m.type].boss && (P.big || MICE[m.type].size < 0.9));
          if (!v) break;
          reset(tr, P.cooldown);
          const [dx, dz] = DIRS4[ROT_DIR[tr.rot % 4]], vy = 10, tf = 2 * vy / GRAVITY, vh = P.range / tf;
          this.launch(v, dx * vh, vy, dz * vh);
          v.catapult = { dmg: P.splash * mods.trapDmg, r: P.splashR, hot: !!P.hot };
          this.damageMouse(v, P.launchDamage * mods.trapDmg, 'trap', false, el);
          this.emit({ t: 'catapult', id: tr.id, x: v.x, z: v.z });
          break;
        }
        case 'pans': {
          // Drops a pan on the biggest mouse(s) underneath: a heavy physics hit that knocks it flat.
          if (tr.cd > 0) break;
          const vs = below(tr, P.radius).sort((a, b) => MICE[b.type].size - MICE[a.type].size || b.hp - a.hp).slice(0, P.count || 1);
          if (!vs.length) break;
          reset(tr, P.cooldown);
          this.emit({ t: 'pan', id: tr.id, x: (tr.x0 + tr.x1) / 2, y: tr.ceil, z: (tr.z0 + tr.z1) / 2, to: vs.map(m => [m.x, m.z]) });
          for (const m of vs) { m.dirtyT = Math.max(m.dirtyT || 0, 0.1); this.damageMouse(m, dmg, 'trap', false, el); }   // dirty + physics = knocked flat
          break;
        }
        // ---- new in 0.25 ----
        case 'firecracker': {
          // Fuse when a crowd steps near, then bang (String of Crackers: three smaller bangs).
          const [cx, cz] = centre(tr);
          if (tr.fuseT > 0) {
            if ((tr.fuseT -= DT) > 0) break;
            const mul = P.bangs ? 0.6 : 1, vs = this.nearMice(cx, cz, P.radius + 0.5).filter(m => !m.dead && m.y < 2 && Math.hypot(m.x - cx, m.z - cz) < P.radius);
            for (const m of vs) {
              this.damageMouse(m, dmg * mul, 'trap', false, el);
              if (!m.dead && !MICE[m.type].boss && MICE[m.type].size < 0.9 && m.state === 'walk') { const dx = m.x - cx, dz = m.z - cz, dd = Math.hypot(dx, dz) || 1; this.launch(m, dx / dd * 6, 5, dz / dd * 6); }   // blown outward
            }
            this.emit({ t: 'bang', id: tr.id, x: cx, z: cz, r: P.radius, hits: vs.length });
            if (--tr.bangsLeft > 0) tr.fuseT = 0.5; else { reset(tr, P.cooldown); tr.active = false; }
            break;
          }
          if (tr.cd > 0) break;
          const near = this.nearMice(cx, cz, 2).filter(m => live(m) && Math.hypot(m.x - cx, m.z - cz) < 1.6);
          if (near.length < P.crowd && !near.some(m => MICE[m.type].size >= 0.9)) break;
          tr.fuseT = 0.6; tr.bangsLeft = P.bangs || 1; tr.cd = tr.cdMax = 99; tr.active = true;   // (lit: reset properly after the last bang)
          this.emit({ t: 'fuse', id: tr.id, x: cx, z: cz });
          break;
        }
        case 'wheel': {
          // Grabs a runner (or two); while one runs, nearby traps reset `power` times as fast.
          const [cx, cz] = centre(tr);
          tr.runners = (tr.runners || []).filter(id => { const m = this.mice.find(x => x.id === id); return m && !m.dead && m.holdT > 0 && m.holdBy === tr.id; });
          if (tr.cd <= 0 && tr.runners.length < (P.runners || 1)) {
            const m = this.nearMice(cx, cz, 2).find(x => live(x) && inRect(x, tr, 0) && !MICE[x.type].boss && MICE[x.type].size < 0.9 && !(x.holdT > 0) && !tr.runners.includes(x.id));
            if (m) { m.holdT = P.hold; m.holdBy = tr.id; m.holdAt = [cx, cz]; tr.runners.push(m.id); if (tr.runners.length >= (P.runners || 1)) reset(tr, P.cooldown + P.hold); this.emit({ t: 'wheelOn', id: tr.id, x: cx, z: cz }); }
          }
          tr.active = tr.runners.length > 0;
          if (!tr.active) break;
          for (const o of this.traps.values()) if (o !== tr && o.cd > 0 && Math.hypot((o.x0 + o.x1) / 2 - cx, (o.z0 + o.z1) / 2 - cz) < P.reach) o.cd = Math.max(0, o.cd - DT * (P.power - 1));
          if (P.zap && (tr.tickT -= DT) <= 0) { tr.tickT = 0.5; for (const id of tr.runners) { const m = this.mice.find(x => x.id === id); if (m) this.damageMouse(m, 3, 'trap', false, 'electric'); } }
          break;
        }
        case 'cord': {
          // Jolts everything on it twice a second (Puddle Cord: soaks them first, so it chains).
          if ((tr.tickT -= DT) > 0) break;
          tr.tickT = 0.5; let n = 0;
          for (const m of this.nearMice(...centre(tr), 2.5)) if (live(m) && inRect(m, tr, 0)) {
            if (P.wet) m.wetT = Math.max(m.wetT || 0, 1);
            this.damageMouse(m, dmg, 'trap', false, el); n++;
          }
          if (n) this.emit({ t: 'cordZap', id: tr.id, x: (tr.x0 + tr.x1) / 2, z: (tr.z0 + tr.z1) / 2 });
          break;
        }
        case 'peg': {
          // Clamps the biggest mouse that steps in (bosses for half as long) and squeezes it.
          const [cx, cz] = centre(tr), held = tr.heldId && this.mice.find(m => m.id === tr.heldId && !m.dead && m.holdT > 0 && m.holdBy === tr.id);
          if (held) {
            if ((tr.tickT -= DT) <= 0) { tr.tickT = 0.5; this.damageMouse(held, P.dps * 0.5 * mods.trapDmg, 'trap', false, el); }
            if (held.holdT <= DT * 1.5 && P.fling && !held.dead && !MICE[held.type].boss) { const a = (held.yaw || 0) + Math.PI; held.holdT = 0; this.launch(held, Math.sin(a) * 8, 6, Math.cos(a) * 8); this.emit({ t: 'pegFling', id: tr.id }); }
            tr.active = true; break;
          }
          tr.active = false; tr.heldId = 0;
          if (tr.cd > 0) break;
          const m = this.nearMice(cx, cz, 2.5).filter(x => live(x) && inRect(x, tr, 0.3) && !(x.holdT > 0)).sort((a, b) => MICE[b.type].size - MICE[a.type].size)[0];
          if (!m) break;
          m.holdT = P.hold * (MICE[m.type].boss ? 0.5 : 1); m.holdBy = tr.id; m.holdAt = [m.x, m.z]; tr.heldId = m.id; tr.tickT = 0;
          reset(tr, P.cooldown + m.holdT); this.emit({ t: 'peg', id: tr.id, x: cx, z: cz });
          break;
        }
        case 'bubbles': {
          // Floats up to maxHits mice underneath in bubbles (see stepMouse), soaked; Suds oils them.
          if (tr.cd > 0) break;
          const vs = below(tr, P.radius).filter(m => m.state === 'walk' && !(m.bubbleT > 0) && !MICE[m.type].boss && (P.big || MICE[m.type].size < 0.9)).slice(0, P.maxHits);
          if (!vs.length) break;
          reset(tr, P.cooldown);
          for (const m of vs) { m.bubbleT = P.float; this.damageMouse(m, 1, 'trap', false, el); if (P.suds) m.oilT = Math.max(m.oilT || 0, STATUS.oilSecs); }
          this.emit({ t: 'bubbles', id: tr.id, x: (tr.x0 + tr.x1) / 2, z: (tr.z0 + tr.z1) / 2, n: vs.length });
          break;
        }
        case 'gluepad': case 'flypaper': {
          if (tr.kind === 'flypaper') {
            // Birds swooping under the roof near the strips get stuck.
            const [cx, cz] = centre(tr);
            for (const b of this.birds) if (!b.dead && !(b.stuckT > 0) && b.y < tr.ceil && Math.hypot(b.x - cx, b.z - cz) < P.radius) { b.stuckT = P.hold; b.stuckDps = P.birdDps; this.emit({ t: 'stickBird', x: b.x, z: b.z }); }
          }
          if (tr.charges <= 0) { tr.rechargeT -= DT; tr.cd = Math.max(0, tr.rechargeT); if (tr.rechargeT <= 0) tr.charges = P.charges; break; }
          for (const m of this.mice) {
            if (m.dead || m.state !== 'walk' || m.glueId === tr.id || !inRect(m, tr, 0)) continue;
            const d = MICE[m.type];
            if (tr.kind === 'flypaper' && (d.boss || (d.size > 0.7 && !(P.hold > TRAPS.flypaper.hold * 1.5)))) continue;   // strips only gum up smallish mice (Extra Sticky: bigger ones too)
            const secs = P.stickSecs * (d.boss ? (P.stickSecs > TRAPS.gluepad.stickSecs * 1.5 ? 0.8 : 0.4) : 1);
            m.state = 'stuck'; m.stuckT = secs; m.glueId = tr.id; this.emit({ t: 'glue', x: m.x, z: m.z });
            if (P.sticky) m.slowT = Math.max(m.slowT, secs + P.sticky);          // Sticky Feet
            if (--tr.charges <= 0) { tr.rechargeT = tr.cdMax = P.recharge * mods.trapCd; break; }
          }
          break;
        }
        case 'tacks':
          for (const m of this.mice) {
            if (!live(m) || !inRect(m, tr, 0)) continue;
            if (P.caltrops) m.slowT = Math.max(m.slowT, 0.4);
            m.tackT -= DT;
            if (m.tackT <= 0) {
              m.tackT = P.tick; bleed(m, 1, mods.bleedMax);
              this.damageMouse(m, dmg, 'trap', false, el);
              if (P.rusty && !m.dead) { m.toxT = STATUS.toxSecs; m.toxDps = Math.max(m.toxDps || 0, STATUS.toxDps); }
            }
          }
          break;
        case 'glove': {
          if (tr.cd > 0) break;
          // Spring-loaded boxing glove: punches small mice across the lane (into walls,
          // water, other traps); big ones just get dazed (Haymaker: big ones fly too).
          const L = lane(tr, P.reach);
          const vs = this.mice.filter(m => live(m) && inRect(m, L, 0));
          if (!vs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'punch', id: tr.id });
          for (const m of vs) {
            const md = MICE[m.type];
            this.damageMouse(m, dmg, 'trap', false, el); if (m.dead || m.stunT > 0) continue;   // knocked flat (dirty): stays down
            if (md.boss || (md.size >= 0.9 && !P.haymaker)) { m.stunT = m.stunMax = P.bigStun; continue; }
            this.launch(m, L.nx * P.push, 4, L.nz * P.push);
          }
          break;
        }
        case 'hotplate': {
          if (tr.cd > 0) break;
          const pad = P.wide ? 2 : 0;
          const vs = this.mice.filter(m => live(m) && inRect(m, tr, pad));
          if (!vs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'sizzle', id: tr.id });
          for (const m of vs) {
            this.damageMouse(m, dmg, 'trap', false, el);
            if (P.searing && m.burnT > 0) { m.burnT = Math.max(m.burnT, STATUS.burnSecs * 2); m.burnDps = Math.max(m.burnDps, STATUS.burnDps * 1.5); }
          }
          break;
        }
        case 'icetray': {
          if (tr.cd > 0) break;
          const vs = this.mice.filter(m => live(m) && inRect(m, tr, 0));
          if (!vs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'chill', id: tr.id });
          for (const m of vs) {
            this.damageMouse(m, dmg, 'trap', false, el);
            if (P.deep && !m.dead && !m.frozen) this.damageMouse(m, 0.01, 'trap', false, el);    // a second chill
            if (P.slush && !m.dead && !m.frozen) m.wetT = STATUS.wetSecs;                         // left wet: next pulse freezes
          }
          break;
        }
        case 'oilslick':
          // Oils every mouse crossing; some slip and go down for a moment.
          for (const m of this.mice) {
            if (!live(m) || m.state !== 'walk' || !inRect(m, tr, 0)) continue;
            m.oilT = Math.max(m.oilT || 0, P.oilSecs);
            if (!MICE[m.type].boss && this.rng() < P.slip * DT) { m.stunT = m.stunMax = 0.6; this.emit({ t: 'slip', x: m.x, z: m.z }); }
          }
          break;
        case 'rollingpin': {
          if (tr.cd > 0) break;
          const vs = this.mice.filter(m => live(m) && inRect(m, tr, 0));
          if (!vs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'roll', id: tr.id });
          for (const m of vs) { if (P.flatten) m.dirtyT = Math.max(m.dirtyT || 0, 0.1); this.damageMouse(m, dmg, 'trap', false, el); }   // Marble Pin: always knocks flat
          break;
        }
        case 'skull': {
          if ((tr.tickT -= DT) > 0) break;
          tr.tickT = P.cooldown;
          const [cx, cz] = centre(tr); let n = 0;
          for (const m of this.nearMice(cx, cz, P.radius + 0.5)) {
            if (m.dead || m.y > 1 || Math.hypot(m.x - cx, m.z - cz) > P.radius) continue;
            n++;
            if (P.wither) m.slowT = Math.max(m.slowT, P.cooldown + 0.1);
            if (P.execute > STATUS.executeAt && !MICE[m.type].boss && m.hp < m.maxHp * P.execute && (MICE[m.type].res || {}).death !== 0) { m.hp = 0.001; this.emit({ t: 'execute', x: m.x, z: m.z }); }
            this.damageMouse(m, dmg, 'trap', false, el);
          }
          tr.active = n > 0;
          break;
        }
        case 'forkdarts': {
          if (tr.cd > 0) break;
          const L = lane(tr, P.reach);
          const fromWall = (m) => Math.abs(L.nx) ? Math.abs(m.x - (L.nx > 0 ? tr.x0 : tr.x1)) : Math.abs(m.z - (L.nz > 0 ? tr.z0 : tr.z1));
          const vs = this.mice.filter(m => live(m) && inRect(m, L, 0)).sort((a, b) => fromWall(a) - fromWall(b)).slice(0, P.maxHits);
          if (!vs.length) break;
          reset(tr, P.cooldown); const [cx, cz] = centre(tr);
          this.emit({ t: 'darts', id: tr.id, x: cx, z: cz, nx: L.nx, nz: L.nz, reach: P.reach });
          for (const m of vs) { bleed(m, P.bleed || 1, mods.bleedMax); this.damageMouse(m, dmg, 'trap', false, el); }
          break;
        }
        case 'bellows': {
          if (tr.cd > 0) break;
          const L = lane(tr, P.reach), [cx, cz] = centre(tr);
          const vs = this.mice.filter(m => live(m) && inRect(m, L, 0));
          const bs = this.birds.filter(b => !b.dead && Math.hypot(b.x - (cx + L.nx * P.reach / 2), b.z - (cz + L.nz * P.reach / 2)) < P.reach && b.y < 6);
          if (!vs.length && !bs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'gust', id: tr.id, x: cx, z: cz, nx: L.nx, nz: L.nz, reach: P.reach, hot: !!P.hot });
          for (const m of vs) {
            const md = MICE[m.type];
            this.damageMouse(m, dmg, 'trap', false, el);
            if (P.hot && !m.dead) this.damageMouse(m, 2, 'trap', false, 'fire');
            if (m.dead || md.boss) continue;
            if (md.size >= 0.9) m.slowT = Math.max(m.slowT, 1.5); else this.launch(m, L.nx * P.push, 2.5, L.nz * P.push);
          }
          for (const b of bs) { this.damageBird(b, P.birdDmg * mods.trapDmg, el); b.stunT = Math.max(b.stunT, 1); }
          break;
        }
        case 'candle': {
          if (tr.cd > 0) break;
          const L = lane(tr, P.reach), [cx, cz] = centre(tr);
          const vs = this.mice.filter(m => live(m) && inRect(m, L, 0));
          if (!vs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'flame', id: tr.id, x: cx, z: cz, nx: L.nx, nz: L.nz, reach: P.reach });
          for (const m of vs) this.damageMouse(m, dmg, 'trap', false, el);
          break;
        }
        case 'hypno': {
          if (tr.cd > 0) break;
          const L = lane(tr, P.reach);
          const vs = this.mice.filter(m => live(m) && inRect(m, L, 0));
          if (!vs.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'hypno', id: tr.id });
          for (const m of vs) { this.damageMouse(m, dmg, 'trap', false, el); if (!m.dead && !MICE[m.type].boss) m.confuseT = P.confuse; }
          break;
        }
        case 'flowerpot': {
          if (tr.cd > 0) break;
          const vs = below(tr, P.radius);
          if (!vs.length) break;
          reset(tr, P.cooldown); const [cx, cz] = centre(tr);
          this.emit({ t: 'potDrop', id: tr.id, x: cx, z: cz });
          for (const m of vs) { this.damageMouse(m, dmg, 'trap', false, el); if (P.heavy && !m.dead) this.damageMouse(m, 1, 'trap', false, 'physics'); }   // dirt, then the thump: knocked flat
          if (P.cactus) this.zones.push({ id: this.nextId++, kind: 'soil', x: cx, z: cz, r: P.radius, t: 6 });
          break;
        }
        case 'bucket': {
          if (tr.cd > 0) break;
          const vs = below(tr, P.radius);
          if (!vs.length) break;
          reset(tr, P.cooldown); const [cx, cz] = centre(tr);
          this.emit({ t: 'splashDown', id: tr.id, x: cx, z: cz, r: P.radius });
          for (const m of vs) { this.damageMouse(m, dmg, 'trap', false, el); if (P.icy && !m.dead) this.damageMouse(m, 1, 'trap', false, 'ice'); }
          break;
        }
        case 'salt': {
          if (tr.cd > 0) break;
          const vs = below(tr, P.radius), [cx, cz] = centre(tr);
          const cats = P.blessed ? [...this.cats.values()].filter(c => c.alive && Math.hypot(c.x - cx, c.z - cz) < P.radius && c.y < tr.ceil) : [];
          if (!vs.length && !cats.length) break;
          reset(tr, P.cooldown); this.emit({ t: 'salt', id: tr.id, x: cx, z: cz, r: P.radius });
          for (const m of vs) this.damageMouse(m, dmg, 'trap', false, el);
          for (const c of cats) c.hp = Math.min(c.def.maxHp, c.hp + c.def.maxHp * 0.03);
          break;
        }
      }
    }
  }

  // Snapshot for HUD / co-op sync.
  hud(id) {
    const cat = this.cats.get(id);
    const def = cat ? cat.def : CATS.fred;
    const SEC = { hairball: [CAT.hairballCooldown, CAT.hairballCost], pounce: [CAT.pounceCooldown, CAT.pounceCost], hiss: [CAT.hissCooldown, CAT.hissCost],
      purr: [CAT.purrCooldown, CAT.purrCost], frenzy: [CAT.frenzyCooldown, CAT.frenzyCost], yawn: [CAT.yawnCooldown, CAT.yawnCost], roar: [CAT.roarCooldown, CAT.roarCost] };
    const [secCd, secCost] = SEC[def.secondary];
    return { id, phase: this.phase, wave: this.wave, phaseTimer: this.phaseTimer, lives: this.lives, sardines: this.sardines,
      yarn: this.yarn, hp: cat ? cat.hp / def.maxHp : 0, energy: cat ? cat.energy / def.maxEnergy : 0, energyAbs: cat ? cat.energy : 0, maxEnergy: def.maxEnergy,
      alive: cat ? cat.alive : false, respawnT: cat ? cat.respawnT : 0, name: cat ? cat.name : '', kind: cat ? cat.kind : 'fred',
      secCd: cat ? cat.secT / (secCd * this.mods.abilityCd) : 0,
      secCost, rage: cat ? cat.rage / CAT.rageMax : 0, napping: cat ? cat.napping : false, altCd: cat ? cat.altT / (ABILITY2[def.ability2].cd * this.mods.abilityCd) : 0, altCost: ABILITY2[def.ability2].cost, buffT: cat ? cat.buffT : 0,
      item: cat ? cat.item : null, itemCd: cat && cat.item ? cat.itemT / ITEMS[cat.item].cd : 0,
      eatCd: cat ? cat.eatT / CAT.eatCooldown : 0, charge: cat ? cat.charge / CAT.leapMaxCharge : 0,
      miceLeft: this.mice.length + this.birds.length + (this.spawn ? this.spawn.queue.length : 0),
      gateUp: this.gate.up, mode: this.mode, trinkets: { ...this.trinkets } };
  }
}

function sameWall(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }
