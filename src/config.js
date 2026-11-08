// config.js — every tunable number in one place.
// Why: balance changes (costs, HP, wave sizes) should never require hunting
// through game logic. The sim reads these; the renderer reads a few for visuals.
//
// Scale: 1 world unit ≈ 30 cm. Fred is about one unit long, so the castle's
// furniture towers over him — mice and cats in a human world.

export const VERSION = '0.14.0';
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
  startSardines: 1000,       // starting Paw Points (the code still calls them sardines): ~15–20 traps
  waveBonus: 100,            // Paw Points for clearing a wave (+10 per wave number)
  pickupRadius: 1.2,         // trinkets lying on the ground
  buildPhaseSeconds: 25,     // break between waves (press G to skip)
  winWave: 24,               // clearing this wave wins the map
  catRespawnSeconds: 4,
  unreachableDps: 15,        // damage/sec to mice stranded where they can't path
  trinketChance: 0.02,       // chance a normal mouse drops a trinket
  splatSpeed: 9,             // landing faster than this hurts mice (flippers splat them)
  splatDamage: 6,            // damage per unit of speed over splatSpeed
  // Strength in numbers: a mouse with this many packmates close by is faster and tougher.
  packRadius: 1.5,
  packCount: 5,
  packSpeed: 1.2,
  packDamageTaken: 0.85,
};

// Elements. Every attack and trap carries one. Mice can be weak (x>1) or tough (x<1)
// against each (MICE[..].res), and statuses combine into combos:
//   wet + electric = chain shock · oiled + fire = blaze · wet or 3 chills + ice = frozen solid
//   burning/poisoned + wind = it spreads · dirty + physics = knocked down · wet + fire = steam (fizzles)
export const ELEMENTS = {
  physical: { name: 'Physical', color: '#d8d0c0', note: 'claws, teeth, tacks, forks' },
  fire:     { name: 'Fire',     color: '#ff7a2a', note: 'sets mice burning; oiled mice go up in a blaze' },
  ice:      { name: 'Ice',      color: '#9ad8ff', note: 'chills (slow); three chills, or a wet mouse, freezes solid' },
  water:    { name: 'Water',    color: '#3a8ad8', note: 'soaks: puts fires out, and wet mice conduct electricity' },
  wind:     { name: 'Wind',     color: '#c8f0e8', note: 'blows mice back; spreads burning and poison to the pack' },
  earth:    { name: 'Earth',    color: '#a07a4a', note: 'covers mice in dirt: the next physics hit knocks them flat' },
  electric: { name: 'Electric', color: '#f0e040', note: 'jolts; arcs between wet mice' },
  psychic:  { name: 'Psychic',  color: '#c070ff', note: 'confuses: mice wander back the way they came' },
  poison:   { name: 'Poison',   color: '#8ae040', note: 'damage over time' },
  physics:  { name: 'Physics',  color: '#e0e0e0', note: 'flings and crushes; knocks dirty mice flat' },
  holy:     { name: 'Holy',     color: '#fff4b0', note: 'scourge of plague rats and ghosts' },
  death:    { name: 'Death',    color: '#9a7ab8', note: 'finishes off badly hurt mice outright' },
};
export const ELEMENT_ORDER = Object.keys(ELEMENTS);
// Combos: what they do, shown the first time each one happens.
export const COMBOS = {
  chain: 'Chain Shock: wet mice conduct electricity to their friends.',
  blaze: 'Blaze: oiled mice burn three times as hot, and set the pack alight.',
  freeze: 'Frozen Solid: wet (or thrice-chilled) mice freeze in place.',
  spread: 'Spread: wind carries burning and poison through the pack.',
  knockdown: 'Knockdown: dirty mice hit by physics are knocked flat.',
  steam: 'Steam: fire on a wet mouse just fizzles. Dry them first.',
};
// Status tuning.
export const STATUS = {
  burnSecs: 3, burnDps: 6, blazeSecs: 5, blazeDps: 18,
  wetSecs: 6, oilSecs: 8, dirtySecs: 6, chillSecs: 3, chillSlow: 0.6, freezeSecs: 2.5,
  confuseSecs: 2.5, toxSecs: 4, toxDps: 4, executeAt: 0.2, chainJumps: 3, chainRange: 2.6, chainMul: 0.6,
  knockdownSecs: 1.5, spreadRange: 1.6,
};
// Which element each cat attack carries.
export const ATTACK_EL = {
  pellet: 'physical', hairball: 'water', bite: 'physical', pounce: 'physics', slam: 'physics', whip: 'physical', hiss: 'psychic',
  whisker: 'physical', purr: null, claw: 'physical', frenzy: 'physical', strike: 'physics', burr: 'earth', yawn: 'psychic',
  pebble: 'earth', roar: 'psychic', dash: 'physical', sit: 'physics', skyswipe: 'physical',
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
  // Scary Cat, left click: tail whip — a narrow line that reaches far and hits everything along it.
  whipInterval: 0.5,
  whipDamage: 16,
  whipRange: 3.6,            // from her centre
  whipWidth: 0.45,           // half-width of the line
  whipMaxHits: 4,
  // Scary Cat, right click: arches her back and hisses — mice nearby panic and scatter away.
  hissCost: 40,
  hissCooldown: 7,
  hissRadius: 5.5,
  hissFear: 2.5,             // seconds of running away (bosses are only slowed)
  // Scary Cat, Shift: leap back out of trouble (a backflip).
  leapBackCooldown: 2.5,
  leapBackH: 11,
  leapBackV: 6.5,
  // Nebbie, left click: whisker darts — fast, straight, pierce through a few mice.
  whiskerInterval: 0.32,
  whiskerSpeed: 34,
  whiskerDamage: 8,
  whiskerPierce: 3,
  // Nebbie, right click: purr — heals over time and buffs every cat around her.
  purrCost: 45,
  purrCooldown: 10,
  purrRadius: 6,
  purrHeal: 0.3,             // fraction of max HP, spread over purrSecs
  purrSecs: 5,
  purrBuffSecs: 6,
  purrDamage: 1.25,          // damage multiplier while buffed
  purrSpeed: 1.15,           // speed multiplier while buffed
  // Nebbie, Space: long jump.
  longJumpH: 12,
  // Casper, left click: claw swipes in front of him. Every hit builds rage.
  clawInterval: 0.28,
  clawDamage: 11,
  clawRange: 1.5,
  clawArc: 1.0,
  clawMaxHits: 3,
  // Casper's rage: 0..100. Each point = +1% damage. Builds on hits, drains when he stops fighting.
  ragePerHit: 7,
  rageMax: 100,
  rageDecay: 12,             // per second, after rageHold seconds without a hit
  rageHold: 2,
  // Casper, right click: frenzy — a few seconds of furious all-round swiping.
  frenzyCost: 30,
  frenzyCooldown: 8,
  frenzySecs: 3,
  frenzySpeed: 2.5,          // attack speed multiplier
  // Casper, Space in the air: leap strike — a second jump forward that hits where he lands.
  strikeH: 13,
  strikeV: 4.5,
  strikeDamage: 30,
  strikeRadius: 1.6,
  // Meow Meow, left click: sticky burrs — light damage, slow, and enough of them put a mouse to sleep.
  burrInterval: 0.4,
  burrSpeed: 20,
  burrDamage: 5,
  burrSlowSecs: 2,
  burrDrowsy: 4,             // burr hits to fall asleep
  sleepSecs: 3,              // asleep = can't move; any damage wakes it
  // Meow Meow, right click: big contagious yawn — mice around her nod off, cats nearby get a buff.
  yawnCost: 40,
  yawnCooldown: 9,
  yawnRadius: 5,
  // Meow Meow: stand still for napDelay seconds and she naps, healing fast until she moves.
  napDelay: 1.5,
  napHeal: 0.08,             // fraction of max HP per second
  // Mimo, left click: flicked pebbles. Extra damage to ranged mice, and to birds.
  pebbleInterval: 0.38,
  pebbleSpeed: 24,
  pebbleDamage: 9,
  pebbleVsRanged: 2,         // x damage to plague rats and siege mice
  // Mimo, right click: lion's roar — everything nearby takes more damage for a while;
  // birds in range are knocked out of the sky.
  roarCost: 40,
  roarCooldown: 10,
  roarRadius: 6.5,
  roarSecs: 6,
  roarVuln: 1.35,            // damage taken multiplier while shaken
  roarBirdStun: 2,
  // Mimo's passive: bird hunter.
  vsBirds: 3,                // x damage to birds
};

// Second abilities (E). Every cat has: left-click attack, right-click ability, E ability, a jump.
// cost = energy, cd = seconds.
export const ABILITY2 = {
  dash:     { cost: 25, cd: 5,   dist: 6, damage: 12 },                 // Fred: Alley Dash — dart forward, slashing (and bleeding) everything passed
  sit:      { cost: 35, cd: 12,  radius: 1.8, damage: 30, stun: 2, guard: 0.5, guardSecs: 4 },   // Puddin: Big Sit — flattens, pins, then shrugs off hits
  leapback: { cost: 0,  cd: 2.5 },                                     // Scary Cat: Leap Back (backflip)
  tinker:   { cost: 50, cd: 15,  radius: 7, buffSecs: 6, buff: 1.25 },  // Nebbie: Tinker — resets nearby traps and overclocks them
  showoff:  { cost: 30, cd: 14,  radius: 9, secs: 5, guard: 0.4 },      // Casper: Show Off — every mouse nearby comes for him; he takes less
  groom:    { cost: 35, cd: 10,  radius: 4, heal: 0.3 },                // Meow Meow: Groom — instantly heals the most-hurt cat nearby (or herself)
  skyswipe: { cost: 30, cd: 8,   reach: 10, damage: 40, landRadius: 1.5, landDamage: 20 },   // Mimo: Sky Swipe — springs at the nearest bird
};

// Items: every cat equips ONE, used with Q. Picked on the menu.
export const ITEMS = {
  laser:   { name: 'Laser Pointer',  cd: 25, radius: 8, secs: 5,          desc: 'A red dot no mouse can resist. Mice near the crosshair chase it for 5 s.' },
  bola:    { name: 'Yarn Bola',      cd: 18, radius: 2.5, secs: 3,        desc: 'Throw a tangle of yarn: mice where it lands are tied up for 3 s.' },
  catnip:  { name: 'Catnip Bomb',    cd: 30, radius: 4, secs: 5,          desc: 'Cats in the cloud get buffed; mice in it stagger about confused.' },
  flea:    { name: 'Flea Bomb',      cd: 28, radius: 3, secs: 6, dps: 12, desc: 'A cloud of fleas where you aim: steady damage to every mouse inside for 6 s.' },
  tonic:   { name: 'Fish-Oil Tonic', cd: 35, heal: 0.5,                   desc: 'Knock it back: heal half your health now.' },
  squeaky: { name: 'Squeaky Toy',    cd: 30, hp: 150, radius: 6, secs: 15, desc: 'Drop a squeaky toy: mice nearby attack it instead of moving on.' },
  bell:    { name: 'Bell Collar',    cd: 22, radius: 7, secs: 3, el: 'psychic', desc: 'Ring it: every mouse near you panics and runs away for 3 s.' },
  pistol:  { name: 'Water Pistol',   cd: 12, range: 6, damage: 6, el: 'water', desc: 'Squirt a stream where you aim: soaks mice (then zap or freeze them).' },
  matches: { name: 'Box of Matches', cd: 20, radius: 2, secs: 5, dps: 12, el: 'fire', desc: 'Toss a lit match: a patch of fire for 5 s. Oily mice go up in a blaze.' },
  holy:    { name: 'Holy Water',     cd: 25, radius: 3, damage: 60, el: 'holy', desc: 'A splash of holy water where you aim. Ghosts and plague rats hate it.' },
};
export const ITEM_ORDER = ['laser', 'bola', 'catnip', 'flea', 'tonic', 'squeaky', 'bell', 'pistol', 'matches', 'holy'];
export const LOADOUT_SIZE = 8;   // traps you bring into a map

// Playable cats. Fred: quick, fragile, ranged, parkour. Puddin: slow tank, melee.
export const CATS = {
  fred: {
    name: 'Fred', maxHp: 70, speed: 10, airControl: 0.2, jumpVel: 9, airJumps: 1, wallKick: 7, mantle: 0.9,
    radius: 0.35, height: 0.95, stepHeight: 0.3, maxEnergy: 90, energyRegen: 13, push: 1,
    primary: 'pellet', secondary: 'hairball', ability2: 'dash', leap: false,
  },
  puddin: {
    name: 'Puddin', maxHp: 200, speed: 6, airControl: 0.06, jumpVel: 7.5, airJumps: 0, wallKick: 0, mantle: 0.4,
    radius: 0.5, height: 1.25, stepHeight: 0.35, maxEnergy: 70, energyRegen: 7, push: 2.5,
    primary: 'bite', secondary: 'pounce', ability2: 'sit', leap: true,
  },
  // Scary Cat: scrawny, beat-up black cat. Fragile; jumps highest; long thin tail whip,
  // a hiss that scatters mice, and a backflip (E) to get out of trouble.
  scary: {
    name: 'Scary Cat', maxHp: 55, speed: 9, airControl: 0.25, jumpVel: 12, airJumps: 0, wallKick: 0, mantle: 1.0,
    radius: 0.33, height: 0.9, stepHeight: 0.3, maxEnergy: 110, energyRegen: 15, push: 0.8,
    primary: 'whip', secondary: 'hiss', ability2: 'leapback', leap: false,
  },
  // Nebbie: sleek, clever grey cat. Shoots whisker darts, purrs to heal and buff
  // the cats around her, long-jumps, and dodges 30% of hits.
  nebbie: {
    name: 'Nebbie', maxHp: 75, speed: 9.5, airControl: 0.2, jumpVel: 8, airJumps: 0, wallKick: 0, mantle: 0.8,
    radius: 0.34, height: 0.92, stepHeight: 0.3, maxEnergy: 130, energyRegen: 16, push: 1, dodge: 0.3,
    primary: 'whisker', secondary: 'purr', ability2: 'tinker', longJump: true, leap: false,
  },
};
// Casper: pampered pure-white show cat with a vicious temper. Mice go for him first;
// claws build rage, rage means more damage; frenzy; jump twice to leap-strike forward.
CATS.casper = {
  name: 'Casper', maxHp: 115, speed: 8.5, airControl: 0.15, jumpVel: 8.5, airJumps: 0, wallKick: 0, mantle: 0.7,
  radius: 0.4, height: 1.0, stepHeight: 0.3, maxEnergy: 80, energyRegen: 9, push: 1.6, taunt: 1.6,
  primary: 'claw', secondary: 'frenzy', ability2: 'showoff', strike: true, leap: false,
};
// Meow Meow: friendly brown outdoor cat. Burrs slow mice and send them to sleep, her yawn
// knocks out a crowd and buffs her friends, she triple-jumps, runs fast, and naps to heal.
CATS.meow = {
  name: 'Meow Meow', maxHp: 80, speed: 10.5, airControl: 0.22, jumpVel: 8.5, airJumps: 2, wallKick: 0, mantle: 0.9,
  radius: 0.34, height: 0.92, stepHeight: 0.3, maxEnergy: 120, energyRegen: 14, push: 1, naps: true,
  primary: 'burr', secondary: 'yawn', ability2: 'groom', leap: false,
};
// Mimo: frisky tabby tom (neutered, still thinks he's a lion). Pebbles that punish ranged
// mice, a lion's roar that makes everything take more damage, and he hunts birds.
CATS.mimo = {
  name: 'Mimo', maxHp: 90, speed: 9, airControl: 0.2, jumpVel: 10, airJumps: 1, wallKick: 0, mantle: 0.9,
  radius: 0.37, height: 0.95, stepHeight: 0.3, maxEnergy: 100, energyRegen: 11, push: 1.2,
  primary: 'pebble', secondary: 'roar', ability2: 'skyswipe', leap: false, birdHunter: true,
};
// Collar colours: each cat's own, chosen to stand out against its fur. Used on the
// model, the portrait, and the cat's marker on the radar.
const COLLARS = { fred: '#2a7aff', puddin: '#b040ff', scary: '#a8ff20', nebbie: '#ff40a8', casper: '#ff2a2a', meow: '#ff8a00', mimo: '#20e0e0' };
for (const k in COLLARS) CATS[k].collar = COLLARS[k];
export const CAT_ORDER = ['fred', 'puddin', 'scary', 'nebbie', 'casper', 'meow', 'mimo'];

// Mouse types (Pinkie = a baby mouse). points = Paw Points for the kill. tails = tail value dropped (big rat tails count for several); tailChance = odds it drops.
// aggro = how far (units) it will turn off its route to go bite a cat; spit = ranged plague glob.
// split = what it bursts into when it dies. intro = the wave it first shows up (it arrives alone
// first so players learn it). Speed tiers: pup/runner fast, mouse normal, tank/fatty slow.
export const MICE = {
  pup:     { name: 'Pinkie', res: {},      points: 2, hp: 7,    speed: 3.0, size: 0.28, tails: 1, tailChance: 0.5, bite: 2,  gateDmg: 3,  color: 0x948a82, aggro: 0 },
  mouse:   { name: 'House Mouse', res: {}, points: 5, hp: 26,   speed: 2.6, size: 0.45, tails: 1, tailChance: 1,   bite: 5,  gateDmg: 10, color: 0x8a8580, aggro: 2.5 },
  runner:  { name: 'Scamper', res: { ice: 1.5, physics: 1.25 },     points: 4, hp: 16,   speed: 4.6, size: 0.4,  tails: 1, tailChance: 1,   bite: 4,  gateDmg: 6,  color: 0x7a5a3a, aggro: 0, intro: 3 },
  splitter:{ name: 'Mama Mouse', res: { fire: 1.5 },  points: 6, hp: 40,   speed: 2.4, size: 0.6,  tails: 1, tailChance: 1,   bite: 6,  gateDmg: 10, color: 0x9a6a8a, aggro: 2.5, split: 'pup', splitN: 2, intro: 4 },
  tank:    { name: 'Sewer Rat', res: { physical: 0.75, poison: 0.75, electric: 1.5 },   points: 12, hp: 100,  speed: 1.8, size: 0.75, tails: 1, tailChance: 1,   bite: 10, gateDmg: 25, color: 0x4f4b48, aggro: 3.5, intro: 5 },
  lobber:  { name: 'Siege Mouse', res: { psychic: 1.5 }, points: 10, hp: 60,   speed: 2.2, size: 0.55, tails: 1, tailChance: 1,   bite: 6,  gateDmg: 10, color: 0x6b5d45, aggro: 0, ranged: true },
  plague:  { name: 'Plague Rat', res: { poison: 0.25, holy: 2, fire: 1.5 },  points: 10, hp: 45,   speed: 2.2, size: 0.6,  tails: 1, tailChance: 1,   bite: 6,  gateDmg: 8,  color: 0x6f7a4a, aggro: 0, spit: { range: 7, dmg: 7, every: 2.2, speed: 11 }, intro: 7, ranged: true },
  fatty:   { name: 'Fat Rat', res: { physics: 0.6, fire: 1.5, poison: 1.25 },     points: 25, hp: 260,  speed: 1.3, size: 1.0,  tails: 2, tailChance: 1,   bite: 18, gateDmg: 40, color: 0x5a4a40, aggro: 3, split: 'mouse', splitN: 3, intro: 9 },
  // Scout: quick and flimsy, runs at the front of a pack. When one dies the pack remembers
  // that spot four times as hard (see danger memory in sim.js) and looks for another way.
  scout:   { name: 'Scout', res: {}, points: 3, hp: 12, speed: 5.2, size: 0.38, tails: 1, tailChance: 1, bite: 3, gateDmg: 4, color: 0xc89a5a, aggro: 0, intro: 2, scout: true },
  // Ghost Mouse: pale and see-through. Shrugs off claws, physics and poison; holy and psychic tear it apart.
  ghost:   { name: 'Ghost Mouse', res: { physical: 0.4, physics: 0.4, poison: 0, death: 0, holy: 2.5, psychic: 1.5 }, points: 8, hp: 34, speed: 2.9, size: 0.45, tails: 1, tailChance: 1, bite: 5, gateDmg: 6, color: 0xdce6f0, aggro: 2, intro: 11, ghost: true },
  // Birds (flying; ignore the routes). Magpies steal cheese and dropped tails; crows carry
  // mice past your traps and drop them. Kill a crow in the air and its mice fall to their deaths.
  magpie:  { name: 'Magpie', res: { wind: 2, electric: 1.5 },      points: 10, hp: 30,   speed: 7,   size: 0.6,  tails: 0, tailChance: 0,   bite: 4,  gateDmg: 0,  color: 0x1a1a22, bird: true, intro: 8, reward: 10 },
  crow:    { name: 'Crow', res: { wind: 2, electric: 1.5 },        points: 15, hp: 45,   speed: 6,   size: 0.7,  tails: 0, tailChance: 0,   bite: 4,  gateDmg: 0,  color: 0x121216, bird: true, intro: 10, reward: 15, carry: 3 },
  miniboss:{ name: 'Rat Captain', res: { psychic: 0.5, death: 0.5, poison: 0.75 }, points: 150, hp: 900,  speed: 2.1, size: 2.0,  tails: 6, tailChance: 1,   bite: 25, gateDmg: 60, color: 0x3d3633, boss: true, yarn: 1, big: true, aggro: 6,
             stomp: { every: 5, radius: 3.5, dmg: 15, stun: 1.0, fling: 7 } },
  bigboss: { name: 'King Rat', res: { psychic: 0.3, death: 0.3, poison: 0.5, holy: 1.25 },    points: 400, hp: 2600, speed: 1.6, size: 2.8,  tails: 15, tailChance: 1,  bite: 40, gateDmg: 120, color: 0x2a2422, boss: true, yarn: 3, big: true, aggro: 7,
             stomp: { every: 4, radius: 4.5, dmg: 22, stun: 1.4, fling: 9 } },
};

// Traps. Footprints follow Orcs Must Die: one trap = one TILE = 4x4 cells (2x2 units, ~60 cm,
// two cats wide). Traps snap to half-tiles. Wall traps cover one tile of wall and reach one
// tile out into the lane. surface: floor | wall | ceiling. size: [w, d] in cells.
// cooldown = reset time; every trap shows a lamp (green armed / red resetting) and animates its reset.
// Costs are sardines. Selling refunds the full price (barricades: by health left).
export const TILE = 4;
export const TRAPS = {
  barricade: { el: 'poison', name: 'Poison Box', desc: "A crate of rat poison. Mice hate it: they only chew through if there's no other way, and the poison eats them while they do.", cost: 20, surface: 'floor', size: [4, 4], hp: 160, height: 1.4, poisonDps: 9 },
  mousetrap: { el: 'physical', name: 'Snapper', desc: "A proper human mousetrap. Snaps everything standing on the tile, then cranks back.",     cost: 30,  surface: 'floor',   size: [4, 4], damage: 70, cooldown: 3, maxHits: 6, pathCost: 0 },   // OMD spike trap
  flipper:   { el: 'physics', name: 'Flinger', desc: "Spring plate. Throws mice the way the arrow points — into walls, the moat, other traps. Splat.", cost: 60,  surface: 'floor',   size: [4, 4], cooldown: 3.5, launchH: 11, launchV: 14, launchDamage: 10, pathCost: 0 },
  grinder:   { el: 'physical', name: 'Cheese Grater', desc: "Spinning grater on a wall. Shreds anything walking within a tile of it.",  cost: 80,  surface: 'wall',    size: [4, 1], dps: 45, reach: 2, pathCost: 0 },
  zapper:    { el: 'electric', name: 'Bug Zapper', desc: "Hangs under roofs, tables and benches. Fries the whole crowd underneath.",    cost: 90,  surface: 'ceiling', size: [4, 4], damage: 35, cooldown: 2, radius: 2.4, pathCost: 0 },
  gluepad:   { el: 'physical', name: 'Glue Trap', desc: "Sticks mice in place. Holds ten, then needs to dry before it works again.",      cost: 30,  surface: 'floor',   size: [4, 4], stickSecs: 2.5, charges: 10, recharge: 6, pathCost: 0 },   // OMD tar
  tacks:     { el: 'physical', name: 'Thumbtacks', desc: "A carpet of tacks. Everyone crossing it bleeds.",    cost: 35,  surface: 'floor',   size: [4, 4], damage: 3, tick: 0.4, pathCost: 0 },                      // OMD briar
  bait:      { el: null, name: 'Cheese Chunk', desc: 'A big lump of cheese. Mice nearby leave their route to nibble it, standing still on whatever traps you put around it.', cost: 25, surface: 'floor', size: [4, 4], lure: 6, nibbles: 30, eatSecs: 2.5, recharge: 12, pathCost: 0 },
  // ---- new in 0.11: elemental traps ----
  hotplate:  { el: 'fire', name: 'Hot Plate', desc: 'A stove ring left on. Scorches everything standing on it and sets it burning.', cost: 70, surface: 'floor', size: [4, 4], damage: 14, cooldown: 1.2, pathCost: 0 },
  icetray:   { el: 'ice', name: 'Ice Tray', desc: 'Freezer-cold tray. Chills mice on it; three chills (or one wet mouse) freezes them solid.', cost: 55, surface: 'floor', size: [4, 4], damage: 8, cooldown: 1.5, pathCost: 0 },
  oilslick:  { el: null, name: 'Oil Slick', desc: 'A tipped oil can. Mice crossing it get oily (fire makes them blaze) and slip over.', cost: 25, surface: 'floor', size: [4, 4], oilSecs: 8, slip: 0.25, pathCost: 0 },
  rollingpin:{ el: 'physics', name: 'Rolling Pin', desc: 'A giant rolling pin on rails. Rolls across the tile and flattens everything on it.', cost: 85, surface: 'floor', size: [4, 4], damage: 55, cooldown: 4, pathCost: 0 },
  skull:     { el: 'death', name: 'Mouse Skull', desc: "A grim little skull. Mice near it wither, and any that are badly hurt just drop dead.", cost: 95, surface: 'floor', size: [4, 4], damage: 4, cooldown: 1, radius: 3, execute: 0.2, pathCost: 0 },
  forkdarts: { el: 'physical', name: 'Fork Darts', desc: 'Wall launcher that fires a volley of forks across the lane. Every fork draws blood.', cost: 75, surface: 'wall', size: [4, 1], damage: 22, cooldown: 2, reach: 6, maxHits: 5, pathCost: 0 },
  bellows:   { el: 'wind', name: 'Bellows', desc: "Fireplace bellows. Blasts mice back across the lane, spreads fire and poison through a pack, and knocks birds out of the air.", cost: 60, surface: 'wall', size: [4, 1], damage: 5, cooldown: 3, reach: 5, push: 7, birdDmg: 30, pathCost: 0 },
  candle:    { el: 'fire', name: 'Candle Torch', desc: 'A fat candle with a bellows behind it. Spits a jet of flame across the lane.', cost: 80, surface: 'wall', size: [4, 1], damage: 22, cooldown: 2.5, reach: 3.5, pathCost: 0 },
  hypno:     { el: 'psychic', name: 'Hypno Wheel', desc: 'A spinning spiral. Mice that look at it forget where they were going and wander back.', cost: 70, surface: 'wall', size: [4, 1], damage: 2, cooldown: 5, reach: 5, confuse: 2.5, pathCost: 0 },
  flowerpot: { el: 'earth', name: 'Flower Pot', desc: 'Hangs from a hook. Drops on mice: heavy earth damage, and it covers them in dirt (physics then knocks them flat).', cost: 65, surface: 'ceiling', size: [4, 4], damage: 45, cooldown: 5, radius: 1.8, pathCost: 0 },
  bucket:    { el: 'water', name: 'Leaky Bucket', desc: 'Tips cold water on everything below. Wet mice conduct electricity and freeze in a blink.', cost: 50, surface: 'ceiling', size: [4, 4], damage: 4, cooldown: 3, radius: 2.2, pathCost: 0 },
  salt:      { el: 'holy', name: 'Salt Shaker', desc: 'Blessed salt. A steady sprinkle that burns plague rats and ghosts.', cost: 75, surface: 'ceiling', size: [4, 4], damage: 7, cooldown: 1, radius: 2.2, pathCost: 0 },
  flypaper:  { el: 'physical', name: 'Flypaper', desc: 'Sticky strips hanging from the roof. Catches birds that swoop through, and gums up mice running under.', cost: 40, surface: 'ceiling', size: [4, 4], radius: 2.5, hold: 4, birdDps: 12, stickSecs: 1, charges: 6, recharge: 8, pathCost: 0 },
  glove:     { el: 'physics', name: 'Boxing Glove', desc: "Spring-loaded wall punch. Knocks small mice across the lane, dazes the big ones.",  cost: 70,  surface: 'wall',    size: [4, 1], cooldown: 3, reach: 4, push: 10, damage: 15, bigStun: 1.2, pathCost: 0 },   // OMD push trap
};
// Trap bar order = keys 1..8.
export const TRAP_ORDER = ['barricade', 'mousetrap', 'flipper', 'grinder', 'zapper', 'gluepad', 'tacks', 'glove', 'bait',
  'hotplate', 'icetray', 'oilslick', 'rollingpin', 'skull', 'forkdarts', 'bellows', 'candle', 'hypno', 'flowerpot', 'bucket', 'salt', 'flypaper'];

// Trap upgrades, bought in the shop with paw prints (kept between runs).
// Tier 2: more power (damage/effect x1.25). Tier 3: resets 20% faster. Then pick one of two
// specials (buy one, the other costs the same; once you own both you can swap freely).
// A special changes numbers (mul / set) and/or switches on a behaviour flag the sim checks.
export const UPGRADE = { tier2: 6, tier3: 10, special: 15, unlock: 8, power: 1.25, speed: 0.8 };
export const POWER_KEYS = ['damage', 'dps', 'launchDamage', 'poisonDps', 'birdDmg', 'hp'];   // what tier 2 boosts
export const TIME_KEYS = ['cooldown', 'recharge'];                                           // what tier 3 shortens
export const SPECIALS = {
  barricade:  { a: { name: 'Fumes', desc: 'Poisons mice walking past within a tile.', set: { fumes: true } }, b: { name: 'Steel Box', desc: 'Double health; mice chew half as fast.', mul: { hp: 2 }, set: { tough: true } } },
  mousetrap:  { a: { name: 'Bleeding Edge', desc: 'Victims bleed (3 stacks).', set: { bleed: 3 } }, b: { name: 'Chain Snap', desc: 'Also snaps the two nearest mice off the tile for half.', set: { chain: 2 } } },
  flipper:    { a: { name: 'Big Spring', desc: 'Throws 40% harder and lifts big mice too.', mul: { launchH: 1.4, launchV: 1.3 }, set: { big: true } }, b: { name: 'Hair Spring', desc: 'Resets in about a second.', mul: { cooldown: 0.35 } } },
  grinder:    { a: { name: 'Fine Grate', desc: 'Shredded mice bleed.', set: { bleed: 1 } }, b: { name: 'Long Reach', desc: 'Reaches two tiles out.', mul: { reach: 2 } } },
  zapper:     { a: { name: 'Arc', desc: 'Every jolt arcs to three more mice, wet or not.', set: { arc: true } }, b: { name: 'Stun Coil', desc: 'Stuns everything it hits for a second.', set: { stun: 1 } } },
  gluepad:    { a: { name: 'Super Glue', desc: 'Holds twice as long, bosses too.', mul: { stickSecs: 2 } }, b: { name: 'Sticky Feet', desc: 'Mice that pull free stay slow for 4 s.', set: { sticky: 4 } } },
  tacks:      { a: { name: 'Rusty Tacks', desc: 'Poisons as well as bleeds.', set: { rusty: true } }, b: { name: 'Caltrops', desc: 'Mice crossing are slowed.', set: { caltrops: true } } },
  glove:      { a: { name: 'Haymaker', desc: 'Double damage, and knocks big mice flying too.', mul: { damage: 2 }, set: { haymaker: true } }, b: { name: 'One-Two', desc: 'Resets twice as fast.', mul: { cooldown: 0.5 } } },
  bait:       { a: { name: 'Stinky Cheese', desc: 'Lures from 60% further away.', mul: { lure: 1.6 } }, b: { name: 'Poisoned Cheese', desc: 'Nibblers are poisoned.', set: { poisoned: true } } },
  hotplate:   { a: { name: 'Searing', desc: 'Burns last twice as long and burn hotter.', set: { searing: true } }, b: { name: 'Wide Burner', desc: 'Also scorches mice a tile around it.', set: { wide: 1 } } },
  icetray:    { a: { name: 'Deep Freeze', desc: 'Each pulse chills twice: freezes in two pulses.', set: { deep: true } }, b: { name: 'Slush', desc: 'Leaves mice wet, so the next pulse (or a zapper) freezes or fries them.', set: { slush: true } } },
  oilslick:   { a: { name: 'Lamp Oil', desc: 'Oil lasts twice as long.', mul: { oilSecs: 2 } }, b: { name: 'Banana Peels', desc: 'Mice slip three times as often.', mul: { slip: 3 } } },
  rollingpin: { a: { name: 'Marble Pin', desc: '+50% damage, and it knocks survivors flat.', mul: { damage: 1.5 }, set: { flatten: true } }, b: { name: 'Quick Roll', desc: 'Resets twice as fast.', mul: { cooldown: 0.5 } } },
  skull:      { a: { name: 'Reaper', desc: 'Kills anything under 35% outright.', set: { execute: 0.35 } }, b: { name: 'Wither', desc: 'Double damage, and mice near it are slowed.', mul: { damage: 2 }, set: { wither: true } } },
  forkdarts:  { a: { name: 'Barbed Forks', desc: 'Each fork leaves 2 bleed stacks.', set: { bleed: 2 } }, b: { name: 'Cutlery Drawer', desc: 'Hits up to 10 mice per volley.', mul: { maxHits: 2 } } },
  bellows:    { a: { name: 'Gale', desc: 'Blows 50% further and hammers birds.', mul: { push: 1.5, birdDmg: 2 } }, b: { name: 'Hot Air', desc: 'Blows embers: sets mice burning (and oily ones blaze).', set: { hot: true } } },
  candle:     { a: { name: 'Wide Wick', desc: 'Flame reaches 5 units.', mul: { reach: 1.45 } }, b: { name: 'Blue Flame', desc: '+60% damage.', mul: { damage: 1.6 } } },
  hypno:      { a: { name: 'Deep Trance', desc: 'Confusion lasts twice as long.', mul: { confuse: 2 } }, b: { name: 'Mass Hypnosis', desc: 'Reaches 8 units and spins up 40% faster.', mul: { reach: 1.6, cooldown: 0.6 } } },
  flowerpot:  { a: { name: 'Cast-Iron Pot', desc: '+60% damage, and the impact knocks them flat.', mul: { damage: 1.6 }, set: { heavy: true } }, b: { name: 'Cactus', desc: 'Leaves a patch of prickly soil: dirty and poisoned.', set: { cactus: true } } },
  bucket:     { a: { name: 'Ice Water', desc: 'Freezing cold: soaked mice freeze on the spot.', set: { icy: true } }, b: { name: 'Bath Night', desc: 'Bigger splash, tips twice as often.', mul: { radius: 1.5, cooldown: 0.5 } } },
  salt:       { a: { name: 'Rock Salt', desc: '+60% damage.', mul: { damage: 1.6 } }, b: { name: 'Blessed', desc: 'Cats underneath slowly heal.', set: { blessed: true } } },
  flypaper:   { a: { name: 'Extra Sticky', desc: 'Holds birds twice as long and catches bigger mice.', mul: { hold: 2, stickSecs: 2 } }, b: { name: 'Wide Strips', desc: '50% wider and twice the charges.', mul: { radius: 1.5, charges: 2 } } },
};
// A trap's working numbers for a given upgrade state ({ tier, special }): base numbers,
// tier 2 power, tier 3 speed, then the chosen special. The sim reads these, never TRAPS directly,
// so every trap and every upgrade goes through one place.
export function trapParams(kind, up) {
  const def = TRAPS[kind], p = { ...def }, tier = (up && up.tier) || 1;
  if (tier >= 2) for (const k of POWER_KEYS) if (typeof p[k] === 'number') p[k] *= UPGRADE.power;
  if (tier >= 3) for (const k of TIME_KEYS) if (typeof p[k] === 'number') p[k] *= UPGRADE.speed;
  const sp = up && up.special && SPECIALS[kind] && SPECIALS[kind][up.special];
  if (sp) { for (const [k, v] of Object.entries(sp.mul || {})) if (typeof p[k] === 'number') p[k] *= v; Object.assign(p, sp.set || {}); }
  if (p.maxHits) p.maxHits = Math.round(p.maxHits); if (p.charges) p.charges = Math.round(p.charges);
  return p;
}
// Starting traps (everything else is unlocked in the shop).
export const STARTER_TRAPS = ['barricade', 'mousetrap', 'flipper', 'gluepad', 'tacks', 'bait', 'grinder', 'zapper'];
export const STARTER_ITEMS = ['laser', 'bola', 'tonic'];

export const GATE = { hp: 60 };   // falls in a few bites, stays down once broken

// Roguelike trinkets: last for the current run, stack. Legendary only from bosses.
export const TRINKETS = {
  bell:    { name: 'Rusty Bell',        tier: 'common',    desc: 'Kills give 25% more Paw Points',            flav: "Off a dead cat's collar. Don't ask whose." },
  catnip:  { name: 'Catnip Sprig',      tier: 'common',    desc: '+10% run speed',                      flav: 'Strictly medicinal.' },
  cap:     { name: 'Bottle-cap Shield', tier: 'common',    desc: 'Take 15% less bite damage',           flav: 'Smells of flat beer. Works, though.' },
  rind:    { name: 'Mouldy Rind',       tier: 'rare',      desc: 'Wave-clear bonus +50%',               flav: 'Smells like victory. And feet.' },
  collar:  { name: 'Flea Collar',       tier: 'rare',      desc: '+2 max bleed stacks',                 flav: 'The fleas come with it. Free of charge.' },
  tin:     { name: 'Sardine Tin',       tier: 'rare',      desc: '+30% energy regen',                   flav: 'Licked clean. Still inspiring.' },
  whisker: { name: 'Lucky Whisker',     tier: 'rare',      desc: '+8% chance to crit for double damage', flav: 'Pulled off a winner.' },
  watch:   { name: 'Pocket Watch',      tier: 'rare',      desc: 'Right-click abilities recharge 20% faster', flav: 'Stopped at nap time. Every time.' },
  key:     { name: 'Wind-up Key',       tier: 'rare',      desc: 'Traps reset 20% faster',              flav: 'Fits everything if you shove it.' },
  thimble: { name: 'Silver Thimble',    tier: 'legendary', desc: 'Traps deal 25% more damage',          flav: "From the queen's sewing box. She won't miss it." },
  crown:   { name: 'Crown Jewel Chip',  tier: 'legendary', desc: 'All your cooldowns 35% shorter',      flav: 'The king will absolutely miss this.' },
};
