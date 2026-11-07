// config.js — every tunable number in one place.
// Why: balance changes (costs, HP, wave sizes) should never require hunting
// through game logic. The sim reads these; the renderer reads a few for visuals.
//
// Scale: 1 world unit ≈ 30 cm. Fred is about one unit long, so the castle's
// furniture towers over him — mice and cats in a human world.

export const VERSION = '0.6.0';
export const GAME_TITLE = 'Nine Lives Keep';

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
  startSardines: 1000,       // enough for ~15–20 traps on the first build
  waveBonus: 100,            // sardines paid for clearing a wave (+10 per wave number)
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
  biteRange: 2.1,           // measured from the cat's centre; ~1 unit past Puddin's nose
  biteArc: 0.9,
  eatHeal: 0.15,             // fraction of max HP
  eatCooldown: 6,
  // Puddin, right click: pounce at the crosshair, splat + stun on landing.
  pounceCost: 30,
  pounceCooldown: 2.5,
  pounceH: 11,
  pounceV: 6,
  pounceDamage: 50,
  pounceRadius: 2.6,         // a full trap tile around where he lands
  pounceStun: 3.0,           // seconds; bosses get 40%. Stars over their heads drain as it runs out
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

// Mouse types (Pinkie = a baby mouse). tails = tail value dropped (big rat tails count for several); tailChance = odds it drops.
// aggro = how far (units) it will turn off its route to go bite a cat; spit = ranged plague glob.
// split = what it bursts into when it dies. intro = the wave it first shows up (it arrives alone
// first so players learn it). Speed tiers: pup/runner fast, mouse normal, tank/fatty slow.
export const MICE = {
  pup:     { name: 'Pinkie',      hp: 7,    speed: 3.0, size: 0.28, tails: 1, tailChance: 0.5, bite: 2,  gateDmg: 3,  color: 0x948a82, aggro: 0 },
  mouse:   { name: 'House Mouse', hp: 26,   speed: 2.6, size: 0.45, tails: 1, tailChance: 1,   bite: 5,  gateDmg: 10, color: 0x8a8580, aggro: 2.5 },
  runner:  { name: 'Scamper',     hp: 16,   speed: 4.6, size: 0.4,  tails: 1, tailChance: 1,   bite: 4,  gateDmg: 6,  color: 0x7a5a3a, aggro: 0, intro: 3 },
  splitter:{ name: 'Mama Mouse',  hp: 40,   speed: 2.4, size: 0.6,  tails: 1, tailChance: 1,   bite: 6,  gateDmg: 10, color: 0x9a6a8a, aggro: 2.5, split: 'pup', splitN: 2, intro: 4 },
  tank:    { name: 'Sewer Rat',   hp: 100,  speed: 1.8, size: 0.75, tails: 1, tailChance: 1,   bite: 10, gateDmg: 25, color: 0x4f4b48, aggro: 3.5, intro: 5 },
  lobber:  { name: 'Siege Mouse', hp: 60,   speed: 2.2, size: 0.55, tails: 1, tailChance: 1,   bite: 6,  gateDmg: 10, color: 0x6b5d45, aggro: 0 },
  plague:  { name: 'Plague Rat',  hp: 45,   speed: 2.2, size: 0.6,  tails: 1, tailChance: 1,   bite: 6,  gateDmg: 8,  color: 0x6f7a4a, aggro: 0, spit: { range: 7, dmg: 7, every: 2.2, speed: 11 }, intro: 7 },
  fatty:   { name: 'Fat Rat',     hp: 260,  speed: 1.3, size: 1.0,  tails: 2, tailChance: 1,   bite: 18, gateDmg: 40, color: 0x5a4a40, aggro: 3, split: 'mouse', splitN: 3, intro: 9 },
  miniboss:{ name: 'Rat Captain', hp: 900,  speed: 2.1, size: 2.0,  tails: 6, tailChance: 1,   bite: 25, gateDmg: 60, color: 0x3d3633, boss: true, yarn: 1, big: true, aggro: 6,
             stomp: { every: 5, radius: 3.5, dmg: 15, stun: 1.0, fling: 7 } },
  bigboss: { name: 'King Rat',    hp: 2600, speed: 1.6, size: 2.8,  tails: 15, tailChance: 1,  bite: 40, gateDmg: 120, color: 0x2a2422, boss: true, yarn: 3, big: true, aggro: 7,
             stomp: { every: 4, radius: 4.5, dmg: 22, stun: 1.4, fling: 9 } },
};

// Traps. Footprints follow Orcs Must Die: one trap = one TILE = 4x4 cells (2x2 units, ~60 cm,
// two cats wide). Traps snap to half-tiles. Wall traps cover one tile of wall and reach one
// tile out into the lane. surface: floor | wall | ceiling. size: [w, d] in cells.
// cooldown = reset time; every trap shows a lamp (green armed / red resetting) and animates its reset.
// Costs are sardines. Selling refunds the full price (barricades: by health left).
export const TILE = 4;
export const TRAPS = {
  barricade: { name: 'Toy Block', desc: "A child's alphabet block. Solid — mice must chew through or go round. Use them to choose the route.",     cost: 20,  surface: 'floor',   size: [4, 4], hp: 160, height: 1.4 },
  mousetrap: { name: 'Snapper', desc: "A proper human mousetrap. Snaps everything standing on the tile, then cranks back.",     cost: 30,  surface: 'floor',   size: [4, 4], damage: 70, cooldown: 3, maxHits: 6, pathCost: 0 },   // OMD spike trap
  flipper:   { name: 'Flinger', desc: "Spring plate. Throws mice the way the arrow points — into walls, the moat, other traps. Splat.", cost: 60,  surface: 'floor',   size: [4, 4], cooldown: 3.5, launchH: 11, launchV: 14, launchDamage: 10, pathCost: 0 },
  grinder:   { name: 'Cheese Grater', desc: "Spinning grater on a wall. Shreds anything walking within a tile of it.",  cost: 80,  surface: 'wall',    size: [4, 1], dps: 45, reach: 2, pathCost: 0 },
  zapper:    { name: 'Bug Zapper', desc: "Hangs under roofs, tables and benches. Fries the whole crowd underneath.",    cost: 90,  surface: 'ceiling', size: [4, 4], damage: 35, cooldown: 2, radius: 2.4, pathCost: 0 },
  gluepad:   { name: 'Glue Trap', desc: "Sticks mice in place. Holds ten, then needs to dry before it works again.",      cost: 30,  surface: 'floor',   size: [4, 4], stickSecs: 2.5, charges: 10, recharge: 6, pathCost: 0 },   // OMD tar
  tacks:     { name: 'Thumbtacks', desc: "A carpet of tacks. Everyone crossing it bleeds.",    cost: 35,  surface: 'floor',   size: [4, 4], damage: 3, tick: 0.4, pathCost: 0 },                      // OMD briar
  glove:     { name: 'Boxing Glove', desc: "Spring-loaded wall punch. Knocks small mice across the lane, dazes the big ones.",  cost: 70,  surface: 'wall',    size: [4, 1], cooldown: 3, reach: 4, push: 10, damage: 15, bigStun: 1.2, pathCost: 0 },   // OMD push trap
};
// Trap bar order = keys 1..8.
export const TRAP_ORDER = ['barricade', 'mousetrap', 'flipper', 'grinder', 'zapper', 'gluepad', 'tacks', 'glove'];

export const GATE = { hp: 60 };   // falls in a few bites, stays down once broken

// Roguelike trinkets: last for the current run, stack. Legendary only from bosses.
export const TRINKETS = {
  bell:    { name: 'Rusty Bell',        tier: 'common',    desc: 'Mice drop 25% more tails',            flav: "Off a dead cat's collar. Don't ask whose." },
  catnip:  { name: 'Catnip Sprig',      tier: 'common',    desc: '+10% run speed',                      flav: 'Strictly medicinal.' },
  cap:     { name: 'Bottle-cap Shield', tier: 'common',    desc: 'Take 15% less bite damage',           flav: 'Smells of flat beer. Works, though.' },
  rind:    { name: 'Mouldy Rind',       tier: 'rare',      desc: 'Tails trade for 20% more',            flav: 'The stash keepers go mad for it.' },
  collar:  { name: 'Flea Collar',       tier: 'rare',      desc: '+2 max bleed stacks',                 flav: 'The fleas come with it. Free of charge.' },
  tin:     { name: 'Sardine Tin',       tier: 'rare',      desc: '+30% energy regen',                   flav: 'Licked clean. Still inspiring.' },
  whisker: { name: 'Lucky Whisker',     tier: 'rare',      desc: '+8% chance to crit for double damage', flav: 'Pulled off a winner.' },
  watch:   { name: 'Pocket Watch',      tier: 'rare',      desc: 'Right-click abilities recharge 20% faster', flav: 'Stopped at nap time. Every time.' },
  key:     { name: 'Wind-up Key',       tier: 'rare',      desc: 'Traps reset 20% faster',              flav: 'Fits everything if you shove it.' },
  thimble: { name: 'Silver Thimble',    tier: 'legendary', desc: 'Traps deal 25% more damage',          flav: "From the queen's sewing box. She won't miss it." },
  crown:   { name: 'Crown Jewel Chip',  tier: 'legendary', desc: 'All your cooldowns 35% shorter',      flav: 'The king will absolutely miss this.' },
};
