// config.js — every tunable number in one place.
// Why: balance changes (costs, HP, wave sizes) should never require hunting
// through game logic. The sim reads these; the renderer reads a few for visuals.

export const VERSION = '0.1.0';

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
  startCoins: 300,
  cheesePrice: 5,            // coins per cheese sold at the stall
  cheeseCarryCap: 12,        // max cheese a cat can carry
  pickupRadius: 1.4,
  stallRadius: 2.6,          // how close you must be to sell
  buildPhaseSeconds: 25,     // break between waves (press G to skip)
  winWave: 24,               // clearing this wave wins the map
  catRespawnSeconds: 4,
  unreachableDps: 15,        // damage/sec to mice stranded where they can't path
};

export const CAT = {
  maxHp: 100,
  speed: 7,
  jumpVel: 9,
  wallKick: 7,               // sideways push off a wall
  radius: 0.45,
  stepHeight: 0.45,          // can walk up ledges this tall
  // Claw: rapid close-range hits that stack bleed.
  clawInterval: 0.14,
  clawRange: 1.7,
  clawArc: 1.1,              // radians either side of facing
  clawDamage: 6,
  clawKnock: 2.5,
  bleedDps: 3,               // per stack
  bleedSeconds: 3,
  bleedMaxStacks: 5,
};

// Mouse types. hp/speed/dmg tuned so wave 1 is easy and wave 24 is not.
export const MICE = {
  mouse:   { hp: 30,   speed: 2.6, size: 0.5, cheese: 1,  bite: 6,  gateDmg: 10, color: 0x8a8580 },
  runner:  { hp: 18,   speed: 4.4, size: 0.42, cheese: 1, bite: 4,  gateDmg: 6,  color: 0x7a5a3a },
  tank:    { hp: 110,  speed: 1.8, size: 0.75, cheese: 3, bite: 12, gateDmg: 25, color: 0x4f4b48 },
  lobber:  { hp: 60,   speed: 2.2, size: 0.6, cheese: 4,  bite: 6,  gateDmg: 10, color: 0x6b5d45 },
  miniboss:{ hp: 450,  speed: 1.6, size: 1.3, cheese: 15, bite: 25, gateDmg: 60, color: 0x3d3633, boss: true, yarn: 1 },
  bigboss: { hp: 1400, speed: 1.3, size: 2.0, cheese: 40, bite: 40, gateDmg: 120, color: 0x2a2422, boss: true, yarn: 3 },
};

// Traps. surface = where it can go. Costs are coins.
export const TRAPS = {
  barricade: { key: '1', name: 'Barricade',     cost: 20,  surface: 'floor',   hp: 120 },
  mousetrap: { key: '2', name: 'Mousetrap',     cost: 40,  surface: 'floor',   damage: 70, cooldown: 1.6, pathCost: 4 },
  flipper:   { key: '3', name: 'Floor flipper', cost: 60,  surface: 'floor',   cooldown: 3.0, launchH: 9, launchV: 9, pathCost: 3 },
  grinder:   { key: '4', name: 'Wall grinder',  cost: 80,  surface: 'wall',    dps: 40, pathCost: 5 },
  zapper:    { key: '5', name: 'Bug zapper',    cost: 100, surface: 'ceiling', damage: 35, cooldown: 1.2, radius: 1.6, pathCost: 5 },
};
export const TRAP_ORDER = ['barricade', 'mousetrap', 'flipper', 'grinder', 'zapper'];
export const SELL_REFUND = 0.5;

export const GATE = { hp: 60 };   // falls in a few hits, stays down once broken
