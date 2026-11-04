// config.js — every tunable number in one place.
// Why: balance changes (costs, HP, wave sizes) should never require hunting
// through game logic. The sim reads these; the renderer reads a few for visuals.
//
// Scale: 1 world unit ≈ 30 cm. Fred is about one unit long, so the castle's
// furniture towers over him — mice and cats in a human world.

export const VERSION = '0.3.0';

// Fixed simulation rate. Why: a fixed tick keeps the sim deterministic, which
// is what lets a future multiplayer host run the one true copy of the game.
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const GRAVITY = 24;

export const RULES = {
  startLives: 20,
  livesLostPerCatDeath: 3,
  livesLostPerMouse: 1,
  livesLostPerBoss: 5,
  startSardines: 300,
  tailPrice: 5,              // sardines per mouse tail traded at a stash
  tailCarryCap: 20,          // max tails a cat can carry
  pickupRadius: 1.2,
  stallRadius: 2.2,          // how close you must be to sell
  buildPhaseSeconds: 25,     // break between waves (press G to skip)
  winWave: 24,               // clearing this wave wins the map
  catRespawnSeconds: 4,
  unreachableDps: 15,        // damage/sec to mice stranded where they can't path
  trinketChance: 0.02,       // chance a normal mouse drops a trinket instead of cheese
  splatSpeed: 9,             // landing faster than this hurts mice (flippers splat them)
  splatDamage: 6,            // damage per unit of speed over splatSpeed
  // Strength in numbers: a mouse with this many packmates close by is faster and tougher.
  packRadius: 1.5,
  packCount: 5,
  packSpeed: 1.2,
  packDamageTaken: 0.85,
};

// Shared cat combat numbers.
export const CAT = {
  bleedDps: 3,               // per stack
  bleedSeconds: 3,
  bleedMaxStacks: 5,
  maxEnergy: 100,
  // Fred, left click: quick spat pellets — light damage, each adds a bleed stack.
  pelletInterval: 0.18,
  pelletSpeed: 26,
  pelletDamage: 4,
  // Fred, right click: big hairball — arcs to the crosshair, splash + slow.
  hairballCost: 35,
  hairballCooldown: 1.2,
  hairballSpeed: 16,
  hairballDamage: 12,
  hairballRadius: 1.0,
  hairballSlow: 0.45,        // speed multiplier while slowed
  hairballSlowSecs: 2.5,
  // Puddin, left click: heavy bite. Killing with a bite eats the mouse: heal, no tail.
  biteInterval: 0.55,
  biteDamage: 34,
  biteRange: 1.4,
  biteArc: 0.9,
  eatHeal: 0.15,             // fraction of max HP
  eatCooldown: 6,
  // Puddin, right click: pounce at the crosshair, splat + stun on landing.
  pounceCost: 30,
  pounceCooldown: 2.5,
  pounceH: 11,
  pounceV: 6,
  pounceDamage: 40,
  pounceRadius: 1.6,
  pounceStun: 1.8,
  // Puddin, Space: hold to charge a leap, heavy landing flings small mice.
  leapMaxCharge: 0.8,
  leapExtra: 7,
  slamRadius: 1.8,
  slamPush: 6,
};

// Playable cats. Fred: quick, fragile, ranged, parkour. Puddin: slow tank, melee.
export const CATS = {
  fred: {
    name: 'Fred', maxHp: 70, speed: 10, airControl: 0.2, jumpVel: 9, airJumps: 1, wallKick: 7, mantle: 0.9,
    radius: 0.35, height: 0.95, stepHeight: 0.3, energyRegen: 12, push: 1,
    primary: 'pellet', secondary: 'hairball', leap: false,
  },
  puddin: {
    name: 'Puddin', maxHp: 200, speed: 6, airControl: 0.06, jumpVel: 7.5, airJumps: 0, wallKick: 0, mantle: 0.4,
    radius: 0.5, height: 1.25, stepHeight: 0.35, energyRegen: 8, push: 2.5,
    primary: 'bite', secondary: 'pounce', leap: true,
  },
};

// Mouse types. tails = tail value dropped (big rat tails count for several); tailChance = odds it drops.
export const MICE = {
  pup:     { hp: 7,    speed: 3.0, size: 0.28, tails: 1, tailChance: 0.5, bite: 2,  gateDmg: 3,  color: 0x948a82 },
  mouse:   { hp: 26,   speed: 2.6, size: 0.45, tails: 1, tailChance: 1,   bite: 6,  gateDmg: 10, color: 0x8a8580 },
  runner:  { hp: 16,   speed: 4.4, size: 0.4,  tails: 1, tailChance: 1,   bite: 4,  gateDmg: 6,  color: 0x7a5a3a },
  tank:    { hp: 100,  speed: 1.8, size: 0.7,  tails: 1, tailChance: 1,   bite: 12, gateDmg: 25, color: 0x4f4b48 },
  lobber:  { hp: 60,   speed: 2.2, size: 0.55, tails: 1, tailChance: 1,   bite: 6,  gateDmg: 10, color: 0x6b5d45 },
  miniboss:{ hp: 450,  speed: 1.6, size: 1.1,  tails: 6, tailChance: 1,   bite: 25, gateDmg: 60, color: 0x3d3633, boss: true, yarn: 1, big: true },
  bigboss: { hp: 1400, speed: 1.3, size: 1.7,  tails: 15, tailChance: 1,   bite: 40, gateDmg: 120, color: 0x2a2422, boss: true, yarn: 3, big: true },
};

// Traps. surface: floor | wall | ceiling. size: [w, d] in half-tiles (cells).
// Costs are sardines. Selling refunds the full price (barricades: by health left).
export const TRAPS = {
  barricade: { name: 'Barricade',     cost: 20,  surface: 'floor',   size: [2, 2], hp: 120 },
  mousetrap: { name: 'Mousetrap',     cost: 25,  surface: 'floor',   size: [1, 1], damage: 60, cooldown: 1.4, pathCost: 3 },
  flipper:   { name: 'Floor flipper', cost: 60,  surface: 'floor',   size: [2, 2], cooldown: 2.5, launchH: 11, launchV: 14, launchDamage: 10, pathCost: 2 },
  grinder:   { name: 'Wall grinder',  cost: 80,  surface: 'wall',    size: [2, 1], dps: 45, pathCost: 4 },
  zapper:    { name: 'Bug zapper',    cost: 90,  surface: 'ceiling', size: [1, 1], damage: 30, cooldown: 1.2, radius: 1.3, pathCost: 4 },
  gluepad:   { name: 'Glue pad',      cost: 30,  surface: 'floor',   size: [2, 2], stickSecs: 2.5, charges: 6, recharge: 6, pathCost: 3 },
  tacks:     { name: 'Tack strip',    cost: 35,  surface: 'floor',   size: [1, 2], damage: 3, tick: 0.4, pathCost: 3 },
  hairdryer: { name: 'Hairdryer',     cost: 70,  surface: 'wall',    size: [2, 1], cooldown: 2.4, reach: 3.5, push: 8, pathCost: 2 },
};
// Trap bar order = keys 1..8.
export const TRAP_ORDER = ['barricade', 'mousetrap', 'flipper', 'grinder', 'zapper', 'gluepad', 'tacks', 'hairdryer'];

export const GATE = { hp: 60 };   // falls in a few bites, stays down once broken

// Roguelike trinkets: last for the current run, stack. Legendary only from bosses.
export const TRINKETS = {
  bell:    { name: 'Rusty bell',        tier: 'common',    desc: 'Mice drop 25% more tails' },
  catnip:  { name: 'Catnip sprig',      tier: 'common',    desc: '+10% run speed' },
  cap:     { name: 'Bottle-cap shield', tier: 'common',    desc: 'Take 15% less bite damage' },
  rind:    { name: 'Mouldy rind',       tier: 'rare',      desc: 'Tails trade for 20% more' },
  collar:  { name: 'Flea collar',       tier: 'rare',      desc: '+2 max bleed stacks' },
  tin:     { name: 'Sardine tin',       tier: 'rare',      desc: '+30% energy regen' },
  whisker: { name: 'Lucky whisker',     tier: 'rare',      desc: '+8% chance to crit for double damage' },
  watch:   { name: 'Pocket watch',      tier: 'rare',      desc: 'Right-click abilities recharge 20% faster' },
  key:     { name: 'Wind-up key',       tier: 'rare',      desc: 'Traps reset 20% faster' },
  thimble: { name: 'Silver thimble',    tier: 'legendary', desc: 'Traps deal 25% more damage' },
  crown:   { name: 'Crown jewel chip',  tier: 'legendary', desc: 'All your cooldowns 35% shorter' },
};
