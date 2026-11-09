// map.js — the six maps of the campaign (entrance to kitchen), at mouse scale.
// Map 1 notes below; the other maps are described where they are defined.
// Built on trap-defense level-design lessons (our own layout):
//   • several entrances whose lanes merge and split, so you choose where to fight
//   • the trap grid (v0.26, like Orcs Must Die): one tile = 2x2 units (60 cm). Every wall
//     sits on tile lines, lanes and doorways are a whole number of tiles wide (mostly 4),
//     so a handful of Poison Boxes closes one and sends the mice the long way
//   • high ceilings (7–9 units) over covered stretches so the camera fits
//   • open "kill rooms" between corridors where barricades can maze the mice
//   • raised ledges beside the lanes for the cats to fight from
//
// Layout (top-down, +z runs south toward the forest):
//   Y1, Y2  two mouse holes in stumps at the forest edge (west and east)
//   Two walled forest roads that meet in a clearing (kill room 1)
//   The moat, crossed on a wide fallen log
//   The gatehouse: a 16-wide covered hall through the curtain wall (gate = jammed board)
//   The courtyard (kill room 2) with a well in the middle and raised walkways on both sides
//   Three ways north: west colonnade (roofed), central passage through the guardhouse
//   (roofed), east lane between the guardhouse and hay bales (open)
//   X  the mouse hole into the great hall, in the middle of the north wall
//
// Grid: each cell is half a world unit. 1 world unit ≈ 30 cm; a cat is about 1 unit.

export const CELL = 0.5;
export const T = { FLOOR: 0, ROAD: 1, WATER: 2, BRIDGE: 3, SOLID: 4, GATE: 5, HOLE: 6, STALL: 7 };

// ---------------------------------------------------------------------------
// The campaign: one journey from the castle entrance to the kitchen. Every map
// has its own layout and its own twist. useMap(id) swaps the live exports below
// (ES module bindings update for every importer), then buildMap() makes the grid.
// ---------------------------------------------------------------------------
export let MAP = null;
export let WORLD_W = 96, WORLD_H = 120, W = 192, H = 240;
export let FURNITURE = [], DRAIN = null, BRIDGE = null, GATE = null, HOLE = null, CLEARING = null, ROADS = [];
export let ROAD_HALF = 4, SPAWNS = [], SPAWN = null, CAT_SPAWN = null, VIAS = [];

// Outer walls with mouse-hole openings in the south wall (one per spawn). The exit
// hole sits in the north wall (cells right in front of it are the HOLE).
function shell(w, h, ht, look, spawnXs) {
  const out = [
    { name: 'North wall', kind: 'solid', rect: [0, 0, w, 2], h: ht + 4, look },
    { name: 'West wall', kind: 'solid', rect: [0, 0, 2, h], h: ht, look },
    { name: 'East wall', kind: 'solid', rect: [w - 2, 0, w, h], h: ht, look },
  ];
  let x = 2;
  for (const sx of [...spawnXs].sort((a, b) => a - b)) { if (sx - 2 > x) out.push({ name: 'South wall', kind: 'solid', rect: [x, h - 2, sx - 2, h], h: ht, look }); x = sx + 2; }
  if (x < w - 2) out.push({ name: 'South wall', kind: 'solid', rect: [x, h - 2, w - 2, h], h: ht, look });
  return out;
}
const blk = (name, rect, h, look, extra = {}) => ({ name, kind: 'solid', rect, h, look, ...extra });
const over = (name, rect, bot, top, look, legs = 'corners') => ({ name, kind: 'over', legs, rect, bot, top, look });
// A plank, beam or shelf board laid across at height `top` (v0.31): mice run along it (as part
// of a raised run), cats can stand on it, top traps go on it, ceiling traps hang under it.
const plank = (name, rect, top, look = 'plank') => ({ name, kind: 'over', legs: 'none', rect, bot: top - (look === 'beam' ? 0.5 : 0.2), top, look });
const roof = (name, rect, bot, top, look) => ({ name, kind: 'roof', rect, bot, top, look });
// Stairs (v0.28): a solid flight that rises along one axis, from height `from` at one end to
// `to` at the other (axis 'z': from at z0, to at z1; 'x': from at x0, to at x1). Built at
// half a unit of rise per unit of run (15 cm steps, 30 cm treads), so every half-unit cell
// rises at most 0.26 and the cats simply walk up. Mice can't use them (they're solid).
// (v0.32) A farm cart: its bed is up on wheels, so mice run underneath (and a ceiling trap fits
// under the bed). It used to be a solid block with bare ground drawn under it.
const cart = (rect) => ({ name: 'Cart', kind: 'over', legs: 'none', rect, bot: 2.2, top: 2.8, look: 'cart' });
const stair = (name, rect, axis, from, to, look = 'stairs') => ({ name, kind: 'solid', rect, h: Math.max(from, to), look, stairs: { axis, from, to } });

export const MAPS = {
  // 1. Castle Entrance (v0.30 layout). Two stumps in the forest. From the west one the road
  // runs straight to the moat, over a fallen log and in through a breach in the curtain wall
  // (the woodyard), or round by the clearing to the main bridge; the east one comes by the
  // clearing. The gate is a short arch between two towers, a board jammed in it. The
  // courtyard has the well, a bench, a trestle table and walkways up to two watchtowers;
  // three lanes go north (the colonnade, the guard passage with its crates, and the east lane
  // past a parked cart) to the forecourt and the great hall door.
  entrance: {
    id: 'entrance', name: 'Castle Entrance', order: 1, w: 96, h: 120, floor: 'cobbles', birds: true,
    blurb: 'Two ways over the moat: the main gate, or the breach into the woodyard. Three lanes north from the courtyard.',
    twist: 'A board jams the gate until the mice chew through it. Flingers by the moat drown them.',
    furniture: [
      // Heights are human scale (1 unit = 30 cm): the castle walls are ~8.5 m, a door is ~2.1 m.
      { name: 'West wall', kind: 'solid', rect: [0, 0, 2, 76], h: 28, look: 'stone' },
      { name: 'East wall', kind: 'solid', rect: [94, 0, 96, 76], h: 28, look: 'stone' },
      { name: 'Hall wall', kind: 'solid', rect: [2, 0, 94, 2], h: 32, look: 'hallwall' },
      // The curtain wall: broken through in the west (the breach), the gate in the middle between two towers.
      { name: 'Curtain wall', kind: 'solid', rect: [0, 76, 16, 84], h: 28, look: 'stone' },
      { name: 'Curtain wall', kind: 'solid', rect: [24, 76, 34, 84], h: 28, look: 'stone' },
      { name: 'Gate tower W', kind: 'solid', rect: [34, 70, 44, 84], h: 34, look: 'stone' },
      { name: 'Gate tower E', kind: 'solid', rect: [52, 70, 62, 84], h: 34, look: 'stone' },
      { name: 'Curtain wall', kind: 'solid', rect: [62, 76, 96, 84], h: 28, look: 'stone' },
      roof('Gate arch', [44, 76, 52, 84], 7, 28, 'tunnelroof'),
      // The woodyard (west ward), between the breach and the courtyard; the smithy fills the east ward.
      { name: 'Yard wall', kind: 'solid', rect: [10, 56, 18, 58], h: 6, look: 'stone' },
      { name: 'Yard wall', kind: 'solid', rect: [26, 56, 34, 58], h: 6, look: 'stone' },
      { name: 'Ward wall', kind: 'solid', rect: [32, 58, 34, 70], h: 6, look: 'stone' },
      { name: 'Smithy', kind: 'solid', rect: [62, 58, 94, 76], h: 14, look: 'guardhouse' },
      { name: 'Log pile', kind: 'solid', rect: [2, 64, 8, 74], h: 3, look: 'pile', pile: 'logs' },
      // The courtyard.
      { name: 'Well', kind: 'solid', rect: [44, 38, 52, 46], h: 3.2, look: 'well' },
      { name: 'West walkway', kind: 'solid', rect: [2, 30, 8, 56], h: 3, look: 'walkway' },
      { name: 'East walkway', kind: 'solid', rect: [88, 30, 94, 56], h: 3, look: 'walkway' },
      // Ways up for the cats (v0.28): stairs from the courtyard to each walkway, then up the
      // walkway to a watchtower in the corner (2.4 m up), looking over the courtyard and the gate.
      // (v0.32) The walkway stairs climb straight onto the walkway's side (they used to run
      // alongside it and seem to end in mid-air).
      stair('Walkway stairs', [8, 32, 14, 36], 'x', 3, 0), stair('Walkway stairs', [82, 32, 88, 36], 'x', 0, 3),
      stair('Tower stairs', [2, 38, 8, 48], 'z', 3, 8), stair('Tower stairs', [88, 38, 94, 48], 'z', 3, 8),
      { name: 'West tower', kind: 'solid', rect: [2, 48, 10, 58], h: 8, look: 'tower' },
      { name: 'East tower', kind: 'solid', rect: [86, 48, 94, 58], h: 8, look: 'tower' },
      { name: 'Crate', kind: 'solid', rect: [52, 44, 54, 46], h: 1.4, look: 'crate' },
      over('Bench', [16, 40, 30, 43], 1.5, 1.9, 'bench'),
      over('Trestle table', [62, 36, 74, 44], 2.5, 2.9, 'table'),
      { name: 'Bucket', kind: 'solid', rect: [54, 38, 55, 39], h: 1.2, look: 'bucket' },        // a real bucket: 30 cm across
      { name: 'Spear rack', kind: 'solid', rect: [10, 52, 22, 53], h: 6, look: 'rack' },
      // North: three lanes between the buildings, 4 tiles each.
      { name: 'Armoury', kind: 'solid', rect: [2, 10, 22, 30], h: 16, look: 'guardhouse' },
      // (v0.31) Ceilings over the lanes the mice take, so all three trap surfaces (floor, wall,
      // ceiling) work along them, like Orcs Must Die's corridors. The colonnade's pillars stand
      // against the armoury only, so the lane under it takes 2x2 ceiling traps.
      { name: 'Colonnade roof', kind: 'over', legs: 'west', rect: [22, 10, 30, 30], bot: 7, top: 7.8, look: 'colonnade' },
      roof('Covered way', [66, 10, 74, 30], 7, 8, 'beams'),                                    // the east lane
      { name: 'Woodshed', kind: 'over', legs: 'corners', rect: [18, 58, 28, 76], bot: 7, top: 7.8, look: 'beams' },   // over the path from the breach
      { name: 'Guardhouse W', kind: 'solid', rect: [30, 10, 44, 30], h: 16, look: 'guardhouse' },
      { name: 'Guardhouse E', kind: 'solid', rect: [52, 10, 66, 30], h: 16, look: 'guardhouse' },
      { name: 'Guard passage', kind: 'roof', rect: [44, 10, 52, 30], bot: 7, top: 16, look: 'tunnelroof' },
      cart([66, 14, 70, 22]),                                                                     // in the east lane (0.32: mice run under it)
      { name: 'Barracks', kind: 'solid', rect: [74, 10, 94, 30], h: 16, look: 'guardhouse' },
      { name: 'Hay bales', kind: 'solid', rect: [86, 2, 94, 6], h: 2.6, look: 'bales' },
      { name: 'Barrels', kind: 'solid', rect: [2, 2, 8, 6], h: 3.0, look: 'barrels' },
      // Outside.
      { name: 'Helmet', kind: 'solid', rect: [32, 94, 33, 95], h: 0.8, look: 'helmet' },        // a guard's helmet, dropped by the road
      { name: 'Hollow log', kind: 'roof', rect: [16, 104, 24, 110], bot: 4, top: 5, look: 'log' },
      { name: 'Hollow log', kind: 'roof', rect: [72, 104, 80, 110], bot: 4, top: 5, look: 'log' },
    ],
    // Clutter: stores piled up in the corners, a tile each (cats can climb them).
    clutter: [[2, 58, 10, 64], [26, 58, 32, 64], [10, 66, 16, 76], [54, 58, 62, 62], [76, 30, 86, 32], [56, 30, 66, 32], [10, 2, 16, 6], [78, 2, 86, 6], [34, 30, 42, 32]],
    drain: { x0: 0, x1: 96, z0: 84, z1: 92 }, bridge: { x0: 44, x1: 52, z0: 83.5, z1: 92.5 }, gate: { x0: 44, x1: 52, z0: 83, z1: 84 },
    bridges: [{ x0: 16, x1: 24, z0: 83.5, z1: 92.5 }],                                          // the fallen log to the breach
    hole: { x0: 46, x1: 50, z0: 2, z1: 2.5 }, clearing: { x0: 28, x1: 68, z0: 92, z1: 102 },
    // Forest roads 4 tiles wide: the west one straight on to the moat (and a branch to the clearing).
    roads: [[[20, 120], [20, 92]], [[20, 98], [30, 98]], [[76, 120], [76, 98], [66, 98]]],
    // Doors (v0.31): the west road from the start, the east road from wave 8, and from wave 16
    // they come up the old drain in the middle of the courtyard.
    spawns: [{ x: 20, z: 118.8, name: 'West road' }, { x: 76, z: 118.8, name: 'East road', opens: 8 }, { x: 60, z: 48, name: 'Courtyard drain', opens: 16, grate: true }], catSpawn: { x: 48, z: 8 },
    vias: [{ name: 'Colonnade', x: 26, z: 20, weight: 1 }, { name: 'Guard passage', x: 48, z: 20, weight: 1 }, { name: 'East lane', x: 70, z: 20, weight: 1 }],
    torches: [[2, 34, 1, 0], [94, 34, -1, 0], [44, 74, 1, 0], [52, 74, -1, 0], [42, 2, 0, 1], [54, 2, 0, 1], [30, 20, -1, 0], [66, 20, 1, 0]],
    // Knock-over props near the edges of the table, bench and walkways (x, surface height, z).
    props: [['pot', 63, 2.9, 40], ['jug', 70, 2.9, 37], ['basket', 20, 1.9, 42.5], ['pot', 26, 1.9, 40.5], ['jug', 7, 3, 34], ['basket', 89, 3, 34]],
  },
  // 2. Market Back Alleys (v0.30 layout). Two alleys come up from the holes into the market
  // square: four stall counters (mice run under them; break a leg and they come down), a
  // fountain-well, food piles. Three ways on north: through the tavern arch (crates stacked
  // across it), up the alley by the north houses, or out of the square's west side and up
  // the narrow back alley behind the west houses. Then the north yard and the back door.
  market: {
    id: 'market', name: 'Market Back Alleys', order: 2, w: 88, h: 104, floor: 'cobbles', birds: true,
    blurb: 'Up the alleys into the market square, then through the tavern arch, the north alley or the narrow back alley.',
    twist: 'Food piles: mice stop to gorge and come out tougher. Knock pots off the counters onto them, or break a stall\'s legs and bring the whole counter down.',
    furniture: [
      ...shell(88, 104, 24, 'house', [22, 66]),
      // North row of houses: the tavern arch (covered, 4 tiles) and the north alley (3 tiles).
      blk('Houses', [6, 22, 30, 40], 20, 'house'), roof('Tavern arch', [30, 22, 38, 40], 7, 20, 'tunnelroof'),
      // (v0.31) The upper floors jut out over the alleys (jettied houses): ceilings over the
      // ways in and the lanes north, for ceiling traps.
      roof('Jettied houses', [18, 72, 26, 100], 7, 9, 'beams'), roof('Jettied houses', [62, 72, 70, 100], 7, 9, 'beams'),
      roof('Overhang', [58, 22, 64, 40], 7, 9, 'beams'), roof('Overhang', [2, 22, 6, 40], 7, 9, 'beams'),
      blk('Tavern', [38, 22, 58, 40], 20, 'house'), blk('Houses', [64, 22, 86, 40], 20, 'house'),
      // West houses with the back alley (2 tiles) behind them; a gap from the square into it.
      blk('Houses', [6, 40, 14, 58], 20, 'house'), blk('Houses', [6, 62, 14, 70], 20, 'house'),
      blk('Houses', [74, 40, 86, 70], 20, 'house'),
      // South: the two alleys up from the holes (4 tiles each).
      blk('Houses', [2, 70, 18, 102], 20, 'house'), blk('Houses', [26, 74, 62, 102], 20, 'house'), blk('Houses', [70, 70, 86, 102], 20, 'house'),
      // The square.
      over('Fish stall', [18, 44, 30, 48], 2.6, 3.0, 'stall'), over('Veg stall', [18, 60, 30, 64], 2.6, 3.0, 'stall'),
      over('Bread stall', [58, 44, 70, 48], 2.6, 3.0, 'stall'), over('Cheese stall', [58, 60, 70, 64], 2.6, 3.0, 'stall'),
      stair('Counter steps', [30, 44, 36, 46], 'x', 3, 0), stair('Counter steps', [52, 62, 58, 64], 'x', 0, 3),
      blk('Well', [40, 52, 48, 58], 3.2, 'well'),
      blk('Apple sacks', [14, 52, 16, 56], 0.8, 'sacks'), blk('Bread sacks', [72, 52, 74, 56], 0.8, 'sacks'), blk('Cabbages', [42, 66, 46, 68], 0.8, 'sacks'),
      blk('Barrels', [50, 70, 56, 74], 3, 'barrels'),
      // The high road (v0.31): planks from the veg stall over the square to the fish stall,
      // a landing, and a plank through the tavern arch over the crates stacked in it.
      plank('Plank', [28, 48, 30, 60], 3), plank('Plank', [28, 40, 36, 44], 3), plank('Plank', [34, 22, 36, 40], 3),
      // The north yard by the back door.
      blk('Crates', [10, 8, 16, 12], 1.6, 'crate'), blk('Crates', [72, 6, 78, 10], 1.6, 'crate'), cart([20, 12, 26, 20]),
      over('Awning bench', [56, 8, 66, 11], 1.5, 1.9, 'bench'),
    ],
    clutter: [[2, 2, 10, 8], [78, 2, 86, 8], [14, 40, 18, 44], [70, 40, 74, 44], [14, 66, 18, 70], [70, 66, 74, 70], [26, 70, 32, 74], [58, 18, 64, 22]],
    hole: { x0: 42, x1: 46, z0: 2, z1: 2.5 }, spawns: [{ x: 22, z: 102.8, name: 'West alley' }, { x: 66, z: 102.8, name: 'East alley', opens: 8 }, { x: 4, z: 56, name: 'Back alley drain', opens: 16, grate: true }], catSpawn: { x: 44, z: 8 },
    vias: [{ name: 'Back alley', x: 4, z: 40, weight: 1 }, { name: 'Tavern arch', x: 34, z: 31, weight: 1 }, { name: 'North alley', x: 61, z: 31, weight: 1 }],
    foods: [{ name: 'Apples', x: 17.5, z: 54, r: 3.5, amount: 25 }, { name: 'Bread', x: 70.5, z: 54, r: 3.5, amount: 25 }, { name: 'Cabbages', x: 44, z: 69.5, r: 3.5, amount: 25 }],
    torches: [[14, 50, 1, 0], [74, 50, -1, 0], [38, 31, -1, 0], [44, 2, 0, 1], [26, 86, -1, 0], [62, 86, 1, 0]],
    props: [['pot', 20, 3, 44.5], ['basket', 26, 3, 47.5], ['jug', 29, 3, 44.5], ['pot', 20, 3, 63.5], ['basket', 28, 3, 60.5], ['jug', 60, 3, 44.5], ['pot', 66, 3, 47.5],
            ['basket', 69, 3, 44.5], ['pot', 60, 3, 63.5], ['jug', 68, 3, 60.5], ['pot', 13, 1.6, 9]],
  },

  // 3. Stables and Yard — a covered aisle under the hay loft with horse pens off it, and a
  // muddy yard split by a paddock wall, with the barn in the middle of it (go round either
  // side). Twist: mud slows everyone (cats too), water troughs drown mice.
  stables: {
    id: 'stables', name: 'Stables and Yard', order: 3, w: 100, h: 96, floor: 'dirt', birds: true,
    blurb: 'A long stable aisle under the hay loft, and a muddy yard round the barn, full of troughs.',
    twist: 'Mud slows everything. Troughs drown mice: fling them in.',
    furniture: [
      ...shell(100, 96, 22, 'house', [23, 56, 74]),
      // The aisle is 5 tiles wide under the loft, horse pens off its west side, three
      // 3-tile doorways into the yard. A paddock wall splits the yard, two 4-tile gaps in it.
      { name: 'Hay loft', kind: 'over', rect: [18, 14, 28, 86], bot: 5.5, top: 6.2, look: 'loft' },
      stair('Loft stairs', [28, 54, 40, 56], 'x', 6.2, 0),                        // from the yard through the middle doorway up onto the loft (mice use the ladders)
      ...[24, 36, 48, 60, 72].map(z => blk('Pen wall', [2, z, 18, z + 1], 4, 'partition')),
      blk('Stable wall', [28, 14, 30, 28], 10, 'house'), blk('Stable wall', [28, 34, 30, 50], 10, 'house'),
      blk('Stable wall', [28, 56, 30, 72], 10, 'house'), blk('Stable wall', [28, 78, 30, 86], 10, 'house'),
      blk('Horse', [4, 29, 14, 31], 5, 'horse', { tint: 0x8a5a32 }), blk('Horse', [4, 53, 14, 55], 5, 'horse', { tint: 0xb8b0a4 }),   // in two of the pens: real size
      { ...plank('Loft beam', [28, 30, 46, 32], 6.2, 'beam'), hang: 3 },                         // (v0.31) from the loft out through the loft door, over the yard lane
      blk('Paddock wall', [30, 40, 40, 42], 4, 'stone'), blk('Paddock wall', [48, 40, 76, 42], 4, 'stone'), blk('Paddock wall', [84, 40, 98, 42], 4, 'stone'),
      blk('Barn', [50, 50, 78, 66], 18, 'guardhouse'),
      // (v0.31) Lean-to roofs off both sides of the barn and a cart shed in the north yard, over
      // the yard lanes (posts down the open side), so the yard takes ceiling traps too.
      { name: 'Lean-to', kind: 'over', legs: 'west', rect: [38, 44, 50, 72], bot: 7, top: 7.8, look: 'beams' },
      { name: 'Lean-to', kind: 'over', legs: 'east', rect: [78, 44, 88, 72], bot: 7, top: 7.8, look: 'beams' },
      { name: 'Cart shed', kind: 'over', legs: 'corners', rect: [56, 12, 68, 28], bot: 7, top: 7.8, look: 'beams' },
      { name: 'Feed shed', kind: 'over', legs: 'corners', rect: [38, 12, 52, 28], bot: 7, top: 7.8, look: 'beams' },
      blk('Fence', [32, 72, 60, 73], 1.2, 'fence'), blk('Fence', [68, 30, 98, 31], 1.2, 'fence'),
      cart([76, 8, 82, 16]), blk('Hay bales', [86, 4, 98, 14], 2.6, 'bales'),
      blk('Oat sacks', [36, 2, 40, 5], 0.8, 'sacks'), blk('Water barrel', [92, 80, 96, 84], 3, 'barrels'),
    ],
    clutter: [[88, 20, 98, 28], [32, 86, 44, 94], [80, 86, 90, 94], [80, 66, 90, 70], [32, 14, 38, 20], [42, 66, 50, 70]],
    waters: [{ x0: 50, x1: 62, z0: 46, z1: 50 }, { x0: 82, x1: 96, z0: 56, z1: 60 }, { x0: 40, x1: 54, z0: 76, z1: 79 }],
    muds: [{ x0: 34, x1: 92, z0: 24, z1: 70 }],
    hole: { x0: 48, x1: 52, z0: 2, z1: 2.5 }, spawns: [{ x: 23, z: 94.8, name: 'Stable door' }, { x: 74, z: 94.8, name: 'Yard gate', opens: 8 }, { x: 56, z: 94.8, name: 'Muck heap gap', opens: 16 }], catSpawn: { x: 50, z: 8 },
    vias: [{ name: 'Stable aisle', x: 23, z: 50, weight: 1 }, { name: 'Yard', x: 44, z: 41, weight: 1 }],
    foods: [{ name: 'Oats', x: 38, z: 6.5, r: 3.5, amount: 25 }],
    torches: [[2, 50, 1, 0], [28, 40, -1, 0], [98, 50, -1, 0], [50, 2, 0, 1], [50, 58, -1, 0], [78, 58, 1, 0]],
    props: [['bucket', 20, 6.2, 30], ['basket', 26, 6.2, 60], ['pot', 92, 2.6, 8], ['jug', 79, 3.6, 12], ['bucket', 20, 6.2, 76]],
  },

  // 4. Cellar and Storerooms (v0.30 layout). Down the steps into the entry vault, then three
  // ways north: the west storeroom (racks across it, so it zig-zags), the pillared cheese
  // hall (the giant wheel in the middle), or the east racks (two long corridors). They meet
  // under the north vault by the stairs up. Twist: it's dark (sniff with F), and the cheese
  // wheel makes every mouse stop to gorge.
  cellar: {
    id: 'cellar', name: 'Cellar and Storerooms', order: 4, w: 84, h: 100, floor: 'stone', birds: false, dark: true,
    blurb: 'The zig-zag storeroom, the pillared cheese hall or the long east racks, under a stone vault.',
    twist: "It's dark down here: hold F to sniff them out. Ceiling traps work anywhere.",
    furniture: [
      ...shell(84, 100, 14, 'stone', [24, 60]),
      roof('Vault', [2, 2, 82, 98], 8, 9, 'vault'),
      // The entry vault's north wall, with a 4-tile doorway into each of the three ways.
      blk('Cellar wall', [2, 82, 8, 84], 14, 'stone'), blk('Cellar wall', [16, 82, 38, 84], 14, 'stone'), blk('Cellar wall', [46, 82, 66, 84], 14, 'stone'), blk('Cellar wall', [74, 82, 82, 84], 14, 'stone'),
      blk('Cellar wall', [22, 14, 24, 82], 14, 'stone'), blk('Cellar wall', [58, 14, 60, 82], 14, 'stone'),
      // West storeroom: racks across it, gaps on alternate sides.
      ...[[2, 22, 18, 24], [6, 32, 22, 34], [2, 42, 18, 44], [6, 52, 22, 54], [2, 62, 18, 64], [6, 72, 22, 74]].map(r => blk('Wine rack', r, 7, 'winerack')),
      // The cheese hall: vault pillars and the wheel.
      ...[[28, 22], [52, 22], [28, 38], [52, 38], [28, 56], [52, 56], [28, 70], [52, 70]].map(([x, z]) => blk('Pillar', [x, z, x + 2, z + 2], 8, 'pillar')),
      blk('Cheese wheel', [38, 44, 46, 52], 3, 'cheesewheel'),
      // The high road (v0.31): boards laid across the west rack tops (straight north over the
      // zig-zag), and a vault beam down the middle of the hall, over the wheel.
      ...[[12, 24, 14, 32], [12, 34, 14, 42], [12, 44, 14, 52], [12, 54, 14, 62]].map(r => plank('Rack board', r, 7)),
      { ...plank('Vault beam', [42, 16, 44, 80], 6.6, 'beam'), hang: 1.4 },
      // East racks: two long racks, three corridors (the far one only open at the top).
      blk('Wine rack', [66, 20, 70, 76], 7, 'winerack'), blk('Wine rack', [74, 26, 78, 82], 7, 'winerack'),
      blk('Barrels', [72, 4, 82, 12], 3, 'barrels'), blk('Barrels', [2, 88, 10, 96], 3, 'barrels'), blk('Crates', [4, 4, 10, 8], 1.6, 'crate'),
    ],
    clutter: [[16, 84, 22, 90], [62, 84, 72, 90], [24, 74, 28, 82], [54, 74, 58, 82], [24, 14, 28, 18], [54, 14, 58, 18], [12, 2, 20, 6], [60, 2, 70, 6], [78, 14, 82, 24]],
    hole: { x0: 40, x1: 44, z0: 2, z1: 2.5 }, spawns: [{ x: 24, z: 98.8, name: 'West steps' }, { x: 60, z: 98.8, name: 'East steps', opens: 8 }, { x: 10, z: 70, name: 'Coal chute', opens: 16, grate: true }], catSpawn: { x: 42, z: 8 },
    vias: [{ name: 'West storeroom', x: 12, z: 48, weight: 1 }, { name: 'Cheese hall', x: 42, z: 60, weight: 1 }, { name: 'East racks', x: 63, z: 50, weight: 1 }],
    foods: [{ name: 'Cheese wheel', x: 42, z: 48, r: 5.5, amount: 60 }],
    torches: [[2, 30, 1, 0], [82, 70, -1, 0], [42, 2, 0, 1], [24, 48, 1, 0], [58, 48, -1, 0], [30, 84, 0, 1]],
    props: [['jug', 75, 3, 8], ['pot', 79, 3, 6], ['jug', 6, 3, 92], ['basket', 7, 1.6, 6]],
  },

  // 5. Servants' Passages — narrow corridors inside the walls, roofed all over, round rooms of
  // different sizes. One way runs through the laundry (wash tubs: they drown mice). Twist:
  // servants open and shut doors on a timer, rerouting the mice mid-wave.
  passages: {
    id: 'passages', name: "Servants' Passages", order: 5, w: 80, h: 100, floor: 'planks', birds: false,
    blurb: 'Narrow passages inside the walls, a short cut through the laundry, ceilings everywhere.',
    twist: 'Servants open and shut the doors on a timer. Mice queue at a shut door, or take another way if it is shorter. Hit a tall shelf until it topples across the corridor.',
    furniture: [
      ...shell(80, 100, 14, 'plaster', [5, 37, 75]),
      roof('Ceiling', [2, 2, 78, 98], 6, 7, 'beams'),
      blk('Room', [8, 8, 34, 30], 14, 'plaster'), blk('Room', [40, 8, 56, 30], 14, 'plaster'), blk('Room', [62, 14, 72, 30], 14, 'plaster'),
      blk('Room', [8, 36, 20, 62], 14, 'plaster'), blk('Room', [26, 36, 34, 62], 14, 'plaster'), blk('Room', [40, 36, 72, 62], 14, 'plaster'),
      blk('Room', [8, 68, 34, 90], 14, 'plaster'),
      // The laundry: a room you can walk through (doors in its north and west walls), two wash tubs inside.
      blk('Laundry wall', [40, 68, 54, 70], 14, 'plaster'), blk('Laundry wall', [58, 68, 72, 70], 14, 'plaster'),
      blk('Laundry wall', [40, 70, 42, 76], 14, 'plaster'), blk('Laundry wall', [40, 80, 42, 90], 14, 'plaster'),
      blk('Laundry wall', [42, 88, 72, 90], 14, 'plaster'), blk('Laundry wall', [70, 70, 72, 88], 14, 'plaster'),
      blk('Linen basket', [3, 40, 7, 43], 1.4, 'basket'), blk('Coal scuttle', [73, 20, 77, 23], 1.4, 'bucket'),
      // Shelves along the middle and west passages, over the timed doors (v0.31): when a door
      // shuts, the mice go up a broom and along the shelf instead of queueing.
      plank('Shelf', [34, 40, 36, 58], 3.5, 'shelfboard'), plank('Shelf', [6, 70, 8, 84], 3.5, 'shelfboard'),
    ],
    waters: [{ x0: 48, x1: 54, z0: 78, z1: 82 }, { x0: 60, x1: 66, z0: 74, z1: 78 }],
    clutter: [[42, 82, 48, 88], [64, 82, 70, 88], [58, 8, 72, 12], [46, 92, 54, 98]],
    doors: [
      { rect: [34, 48, 40, 49], period: 16, offset: 0 }, { rect: [20, 30, 21, 36], period: 18, offset: 6 },
      { rect: [56, 62, 57, 68], period: 14, offset: 3 }, { rect: [2, 76, 8, 77], period: 20, offset: 10 },
    ],
    hole: { x0: 36, x1: 40, z0: 2, z1: 2.5 }, spawns: [{ x: 5, z: 98.8, name: 'West stair' }, { x: 75, z: 98.8, name: 'East stair', opens: 8 }, { x: 37, z: 98.8, name: 'Back stair', opens: 16 }], catSpawn: { x: 37, z: 5 },   // hole on the tile grid (2 tiles)
    vias: [{ name: 'West passage', x: 5, z: 50, weight: 1 }, { name: 'Middle passage', x: 37, z: 33, weight: 1 }, { name: 'Laundry', x: 56, z: 79, weight: 1 }],
    torches: [[2, 20, 1, 0], [78, 80, -1, 0], [34, 50, -1, 0], [40, 20, 1, 0], [20, 50, 1, 0], [42, 78, 1, 0]],
    props: [['basket', 5, 1.4, 41.5], ['pot', 76, 1.4, 21]],
  },

  // 6. The Kitchen — three back rooms (the scullery with its wash tubs, the larder, the
  // bakehouse), each with a doorway into the main kitchen: worktops down both walls, the
  // long table, the spit hearth burning in the middle, the oven, and the pantry door.
  // Twist: three ways in, and fire everywhere: oven, hearth and spit burn mice and cats alike.
  kitchen: {
    id: 'kitchen', name: 'The Kitchen', order: 6, w: 96, h: 100, floor: 'stone', birds: true,
    blurb: 'The last stand: in through the scullery, larder or bakehouse, round the spit hearth, to the pantry.',
    twist: 'Three ways in, through the scullery, the larder and the bakehouse. The oven, the hearth and the spit burn mice and cats alike.',
    furniture: [
      ...shell(96, 100, 26, 'plaster', [16, 48, 80]),
      // (v0.31) The kitchen's ceiling (rafters and boards, 3 m up) over every room, for ceiling
      // traps. Listed first: tables, shelves and the pot rack below it keep their own heights.
      roof('Kitchen ceiling', [2, 2, 94, 98], 10, 11, 'beams'),
      blk('Kitchen wall', [2, 64, 12, 66], 12, 'plaster'), blk('Kitchen wall', [20, 64, 44, 66], 12, 'plaster'),
      blk('Kitchen wall', [52, 64, 76, 66], 12, 'plaster'), blk('Kitchen wall', [84, 64, 94, 66], 12, 'plaster'),
      blk('Scullery wall', [32, 66, 34, 98], 12, 'plaster'), blk('Bakehouse wall', [62, 66, 64, 98], 12, 'plaster'),
      over('West worktop', [2, 14, 6, 58], 3, 3.4, 'counter'), over('East worktop', [90, 14, 94, 58], 3, 3.4, 'counter'),
      stair('Steps', [6, 50, 8, 57], 'z', 3.4, 0), stair('Steps', [88, 50, 90, 57], 'z', 3.4, 0),   // up onto the worktops
      over('Kitchen table', [24, 26, 48, 32], 3, 3.4, 'counter'), over('Side table', [60, 24, 76, 30], 2.5, 2.9, 'table'),
      over('Butcher block', [64, 44, 70, 48], 2.8, 3.2, 'table'),
      blk('Spit hearth', [44, 40, 52, 46], 1.2, 'hearth'),
      blk('Oven', [36, 2, 52, 8], 9, 'oven'), blk('Hearth', [86, 86, 94, 96], 8, 'oven'),
      blk('Flour sacks', [18, 4, 26, 8], 2.6, 'sacks'), blk('Crates', [56, 90, 62, 96], 1.6, 'crate'),
      blk('Sacks', [36, 90, 42, 96], 2.6, 'sacks'),
      blk('Larder shelves', [34, 70, 36, 88], 7, 'winerack'), blk('Bread racks', [64, 70, 66, 84], 7, 'winerack'),
      { ...plank('Pot rack', [52, 12, 54, 60], 7, 'beam'), hang: 5 }, plank('High shelf', [52, 10, 70, 12], 7, 'shelfboard'),   // (v0.31) the top layer
    ],
    waters: [{ x0: 6, x1: 12, z0: 78, z1: 82 }, { x0: 20, x1: 26, z0: 84, z1: 88 }],     // the scullery's wash tubs
    clutter: [[10, 2, 16, 6], [54, 2, 62, 6], [78, 2, 90, 6], [2, 66, 10, 72], [24, 90, 32, 98], [52, 90, 56, 96], [66, 66, 74, 70], [78, 18, 88, 22]],
    fires: [{ x: 44, z: 10.5, r: 3 }, { x: 84, z: 91, r: 2.5 }, { x: 48, z: 43, r: 3.2 }],
    foods: [{ name: 'Dropped veg', x: 22, z: 54, r: 3.5, amount: 25 }],
    hole: { x0: 70, x1: 74, z0: 2, z1: 2.5 }, spawns: [{ x: 48, z: 98.8, name: 'Larder door' }, { x: 16, z: 98.8, name: 'Scullery door', opens: 8 }, { x: 80, z: 98.8, name: 'Bakehouse door', opens: 16 }], catSpawn: { x: 72, z: 8 },
    vias: [{ name: 'Scullery door', x: 16, z: 65, weight: 1 }, { name: 'Larder door', x: 48, z: 65, weight: 1 }, { name: 'Bakehouse door', x: 80, z: 65, weight: 1 }],
    torches: [[2, 10, 1, 0], [94, 10, -1, 0], [30, 2, 0, 1], [60, 2, 0, 1], [33, 80, 1, 0], [63, 80, -1, 0], [44, 64, 0, -1]],
    props: [['pot', 5.5, 3.4, 24], ['jug', 5.5, 3.4, 40], ['pot', 5.5, 3.4, 52], ['pot', 90.5, 3.4, 26], ['jug', 90.5, 3.4, 44],
            ['pot', 26, 3.4, 31.5], ['jug', 36, 3.4, 26.5], ['pot', 46, 3.4, 31.5], ['basket', 66, 3.2, 47.5], ['jug', 62, 2.9, 29.5]],
  },
};
export const MAP_ORDER = ['entrance', 'market', 'stables', 'cellar', 'passages', 'kitchen'];

// Food up on the furniture (v0.12): some mice leave their route, climb up at `climb`
// (a floor spot by the edge), eat at (x, z) on the top (height y) and come out tougher.
// Floor traps can go on furniture tops too, so you can trap the feast.
const TOPS = {
  entrance: [{ name: 'Meat pie', x: 68, z: 41.5, y: 2.9, r: 1.2, amount: 20, climb: [68, 45] }, { name: 'Cheese rind', x: 21, z: 41.5, y: 1.9, r: 1, amount: 15, climb: [21, 44] }],
  market: [{ name: 'Fish', x: 25, z: 46, y: 3, r: 1.2, amount: 20, climb: [25, 50.5] }, { name: 'Cheese', x: 65, z: 62, y: 3, r: 1.2, amount: 20, climb: [65, 65.5] }],
  stables: [{ name: 'Oat bucket', x: 92, z: 9, y: 2.6, r: 1.2, amount: 20, climb: [84.5, 9] }],
  cellar: [{ name: 'Cheese wheel top', x: 42, z: 48, y: 3, r: 1.5, amount: 30, climb: [42, 53] }],
  passages: [{ name: 'Crumbs', x: 74, z: 21.5, y: 1.4, r: 1, amount: 15, climb: [75, 24.5] }],
  kitchen: [{ name: 'Roast chicken', x: 37, z: 29, y: 3.4, r: 1.5, amount: 30, climb: [37, 34.5] }, { name: 'Cake', x: 3, z: 37, y: 3.4, r: 1.2, amount: 20, climb: [7.5, 37] }, { name: 'Pie', x: 93, z: 33, y: 3.4, r: 1.2, amount: 20, climb: [88.5, 33] }],
};
// Crate stacks across a corridor (v0.12): mice smash through them when it's worth it,
// opening a shortcut for the rest of the wave. Servants stack them back between waves.
const CRATES = {
  entrance: [[44, 18, 52, 20]],   // the guard passage
  market: [[30, 30, 38, 32], [2, 28, 6, 30]],   // across the tavern arch; (v0.31) a fallen cart in the back alley: drain rats cross the square, under the plank
  passages: [[34, 20, 40, 22]],   // the last stretch of the main passage, before the hall
};
// Hand-made furniture routes (low things get them automatically; see buildMap).
// Long runs (v0.22): counter tops and the hay loft. Mice only take them when the floor
// route is worse (a maze, a blocked lane) or, over the kitchen island, when it's simply
// the short way. Top traps (Knife Block, Kettle, Spice Jar, a Snapper up there...) catch
// them up there; a Poison Box anywhere on the run closes it. ladder: draw ladders at the ends.
// v0.31 layered runs: [x, z, y, look] points (see addLink). The market and stables have a
// second level, the cellar and kitchen a third (floor, furniture tops, beams and high shelves),
// the passages go up over their timed doors. Runs cross over the floor lanes below them.
const LINKS = {
  cellar: [{ name: 'Cheese wheel', a: [42, 53.5], b: [42, 42.5], y: 3, path: [[42, 51.6], [42, 44.4]] },
           { name: 'Cheese wheel', a: [36.5, 48], b: [47.5, 48], y: 3, path: [[38.4, 48], [45.6, 48]] },
           // From the coal chute room: up a ladder on to the racks, north along the boards over
           // the zig-zag, down at the top. (The chute opens at wave 16.)
           { name: 'Rack tops', a: [12, 69], b: [12, 17], y: 7, path: [[12, 68, 0.2], [13, 63.5, 7, 'ladder'], [13, 22.5], [12, 18.5, 0.2, 'ladder']] },
           // Up a ladder at the hall's south end, along the vault beam high over the wheel and
           // the floor lane, down a ladder two thirds of the way along (every high road comes
           // down well before the hole, so the last stretch is a floor gauntlet for everyone).
           // Rats like it (fav): the default way in.
           { name: 'Vault beam', a: [43, 82.5], b: [43, 23.5], y: 6.6, fav: 0.8, path: [[43, 81.5, 0.2], [43, 79.5, 6.6, 'ladder'], [43, 26.5], [43, 24.5, 0.2, 'ladder']] }],
  market: [{ name: 'Over the crates', a: [27, 69], b: [35, 18.5], y: 3,
             path: [[27, 68, 0.15], [27, 64.5, 3, 'broom'], [29, 62], [29, 47], [29, 42], [35, 42], [35, 23], [35, 19.5, 0.15, 'broom']] }],
  passages: [{ name: 'Middle shelf', a: [35, 63], b: [35, 35], y: 3.5, path: [[35, 62, 0.15], [35, 58.5, 3.5, 'broom'], [35, 40.5], [35, 37, 0.15, 'broom']] },
             { name: 'West shelf', a: [7, 88], b: [7, 66], y: 3.5, path: [[7, 87, 0.15], [7, 84.5, 3.5, 'broom'], [7, 70.5], [7, 67, 0.15, 'broom']] }],
  kitchen: [{ name: 'West worktop', a: [4, 60], b: [4, 12], y: 3.4, path: [[4, 57.6], [4, 14.4]] },
            // The top level: up a ladder by the larder doorway, north along the pot rack hung
            // high over the kitchen (the scullery lane crosses under it), down a ladder off its
            // side well short of the pantry. Rats like it (fav): the default way in.
            { name: 'Pot rack', a: [53, 63], b: [56.5, 20], y: 7, fav: 0.65, path: [[53, 62, 0.2], [53, 59.5, 7, 'ladder'], [53, 20], [55.5, 20, 0.2, 'ladder']] },
            { name: 'East worktop', a: [92, 60], b: [92, 12], y: 3.4, path: [[92, 57.6], [92, 14.4]] },
            { name: 'Over the table', a: [37, 34], b: [37, 24], y: 3.4, path: [[37, 31.6], [37, 26.4]] }],
  stables: [{ name: 'Hay loft', a: [23, 88], b: [23, 12], y: 6.2, path: [[23, 85.6], [23, 14.4]], ladder: true },
            // Up a ladder at the loft's south end, along the loft, out through the loft door along
            // the beam over the yard lane (the muck heap rats run underneath), down a ladder in
            // the yard, a good way short of the hole. Rats like it (fav): door 1's way in.
            { name: 'Loft and beam', a: [21, 90], b: [47, 35.5], y: 6.2, fav: 0.6, path: [[21, 89, 0.2], [21, 86.5, 6.2, 'ladder'], [21, 31], [45.5, 31], [47, 33.5, 0.2, 'ladder']] }],
};
// Things that fall over (v0.17). Shelves stand against a wall; knock one over (hit it a few
// times) and it falls across the corridor, crushing what's under it and blocking the way
// (mice chew through, like crates). Servants stand them back up between waves.
// rect = where it stands (1 unit thick), fall = where it lies once down, h = height.
const SHELVES = {
  passages: [{ name: 'Linen shelf', rect: [7, 46, 8, 51], fall: [2, 46, 8, 51], h: 7, dir: [-1, 0] },
             { name: 'Pantry shelf', rect: [72, 52, 73, 57], fall: [72, 52, 78, 57], h: 7, dir: [1, 0] },
             { name: 'Boot rack', rect: [34, 44, 35, 49], fall: [34, 44, 40, 49], h: 6, dir: [1, 0] }],
  cellar: [{ name: 'Jar shelf', rect: [21, 36, 22, 42], fall: [14, 36, 22, 42], h: 7, dir: [-1, 0] },
           { name: 'Jar shelf', rect: [65, 40, 66, 46], fall: [60, 40, 66, 46], h: 7, dir: [-1, 0] }],
};
// Big barrels: a cat brushing or hitting one sends it rolling the way the cat faces, flattening
// mice in its path until it hits a wall. Rolled home between waves. [x, z]
const BARRELS = {
  entrance: [[30, 50], [66, 52]], market: [[36, 68], [52, 18]], stables: [[44, 60], [80, 46]], kitchen: [[26, 74], [76, 40]], cellar: [[42, 30]],
};
// Humans (v0.16, scenery only). 'side': that outer wall is drawn as a low curb (its collider
// stays full height) and the lit human space lies beyond it, with people walking about.
// 'wallWalk': guards patrol along the top of walls (x0, x1, z, y).
const HUMANS = {
  entrance: { kind: 'guard', walks: [[4, 38, 80, 28], [58, 92, 80, 28], [30, 66, 1, 32]] },
  market: { kind: 'shopper', side: 'east', count: 6, floor: 'cobbles' },
  stables: { kind: 'stablehand', side: 'east', count: 3, floor: 'dirt' },
  kitchen: { kind: 'cook', side: 'east', count: 3, floor: 'stone' },
};
// Clutter (v0.30): each map's clutter zones are filled with piles of stores, one 2x2-unit tile
// each, about two in three tiles, of mixed heights (60 cm to 1.3 m). Solid: mice go round,
// cats climb them, nothing builds there. Seeded by the map, so every player gets the same piles.
function clutterPiles(M) {
  let a = [...M.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 11) >>> 0;
  const R = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const out = [];
  for (const [x0, z0, x1, z1] of M.clutter || []) for (let z = z0; z < z1; z += 2) for (let x = x0; x < x1; x += 2) {
    if (R() > 0.68) continue;
    out.push({ name: 'Stores', kind: 'solid', rect: [x, z, x + 2, z + 2], h: [2, 2.6, 3.4, 4.4][Math.floor(R() * 4)], look: 'pile' });
  }
  return out;
}
for (const k of MAP_ORDER) {
  const M = MAPS[k]; M.furniture.push(...clutterPiles(M)); M.tops = TOPS[k] || []; M.crates = CRATES[k] || []; M.links = LINKS[k] || []; M.humans = HUMANS[k] || null;
  M.shelves = SHELVES[k] || []; M.barrels = BARRELS[k] || [];
  if (M.humans && M.humans.side === 'east') for (const f of M.furniture) if (f.name === 'East wall') f.visH = 1.4;
}

// Point every live export at map `id`. Call before building a Sim.
export function useMap(id) {
  const m = MAPS[id] || MAPS.entrance;
  MAP = m; WORLD_W = m.w; WORLD_H = m.h; W = m.w / CELL; H = m.h / CELL;
  FURNITURE = m.furniture; DRAIN = m.drain || null; BRIDGE = m.bridge || null; GATE = m.gate || null; HOLE = m.hole;
  CLEARING = m.clearing || null; ROADS = m.roads || []; SPAWNS = m.spawns; SPAWN = m.spawns[0]; CAT_SPAWN = m.catSpawn; VIAS = m.vias || [];
  return m;
}
useMap('entrance');

export const idx = (x, z) => z * W + x;
export const cellOf = (wx, wz) => {
  const x = Math.floor(wx / CELL), z = Math.floor(wz / CELL);
  return (x < 0 || z < 0 || x >= W || z >= H) ? -1 : z * W + x;
};
export const cellCenter = (i) => [((i % W) + 0.5) * CELL, (((i / W) | 0) + 0.5) * CELL];
export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // +x, -x, +z, -z

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function buildMap() {
  const N = W * H;
  const type = new Uint8Array(N);
  const solid = new Float32Array(N);
  const slabBot = new Float32Array(N), slabTop = new Float32Array(N);
  const furn = new Int16Array(N).fill(-1);
  const forest = new Uint8Array(N);
  const eachCell = ([x0, z0, x1, z1], fn) => {
    for (let z = Math.round(z0 / CELL); z < Math.round(z1 / CELL); z++)
      for (let x = Math.round(x0 / CELL); x < Math.round(x1 / CELL); x++)
        if (x >= 0 && z >= 0 && x < W && z < H) fn(z * W + x, x, z);
  };
  const mud = new Uint8Array(N), door = new Int16Array(N).fill(-1);
  // Forest zone (entrance map only): solid except roads and the clearing.
  if (ROADS.length) for (let z = Math.round(DRAIN.z1 / CELL); z < H; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x, cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    let open = cx >= CLEARING.x0 && cx < CLEARING.x1 && cz >= CLEARING.z0 && cz < CLEARING.z1;
    for (const road of ROADS) for (let s = 0; s < road.length - 1 && !open; s++) {
      const [ax, az] = road[s], [bx, bz] = road[s + 1];
      if (distToSeg(cx, cz, ax, az, bx, bz) < ROAD_HALF) open = true;
    }
    if (open) type[i] = T.ROAD;
    else { type[i] = T.SOLID; solid[i] = 5; forest[i] = 1; }
  }
  const waters = [...(DRAIN ? [DRAIN] : []), ...(MAP.waters || [])];
  for (const wr of waters) eachCell([wr.x0, wr.z0, wr.x1, wr.z1], i => { type[i] = T.WATER; solid[i] = 0; forest[i] = 0; });
  for (const br of [...(BRIDGE ? [BRIDGE] : []), ...(MAP.bridges || [])]) eachCell([br.x0, br.z0, br.x1, br.z1], i => { type[i] = T.BRIDGE; solid[i] = 0; forest[i] = 0; });   // the main bridge and any others
  for (const mr of MAP.muds || []) eachCell([mr.x0, mr.z0, mr.x1, mr.z1], i => { mud[i] = 1; });

  FURNITURE.forEach((f, fi) => {
    if (f.kind === 'solid' && f.stairs) {
      // Each cell's height follows the slope (cell centres), so the first and last cells are
      // half a cell's rise off the floor and the landing: a cat steps on and off.
      const { axis, from, to } = f.stairs, [x0, z0, x1, z1] = f.rect;
      const n = Math.round((axis === 'x' ? x1 - x0 : z1 - z0) / CELL), a0 = Math.round((axis === 'x' ? x0 : z0) / CELL);
      eachCell(f.rect, (i, x, z) => { const k = (axis === 'x' ? x : z) - a0; type[i] = T.SOLID; solid[i] = Math.max(solid[i], from + (to - from) * (k + 0.5) / n); furn[i] = fi; forest[i] = 0; });
    } else if (f.kind === 'solid') {
      eachCell(f.rect, i => { type[i] = T.SOLID; solid[i] = Math.max(solid[i], f.h); furn[i] = fi; forest[i] = 0; });
    } else {
      const [x0, z0, x1, z1] = f.rect;
      const cx0 = Math.round(x0 / CELL), cx1 = Math.round(x1 / CELL) - 1, cz0 = Math.round(z0 / CELL), cz1 = Math.round(z1 / CELL) - 1;
      eachCell(f.rect, (i, x, z) => {
        if (type[i] === T.SOLID && f.kind === 'roof') return;     // roofs don't override walls
        slabBot[i] = f.bot; slabTop[i] = f.top; furn[i] = fi;
        const sideX = x === cx0 || x === cx1 || x === cx0 + 1 || x === cx1 - 1;
        if (f.legs === 'none') {
          // A plank or beam laid across (v0.31): nothing standing in the lane under it.
        } else if (f.legs === 'corners') {
          // Table / bench: one leg (1x1 unit) in each corner.
          const sideZ = z === cz0 || z === cz1 || z === cz0 + 1 || z === cz1 - 1;
          if (sideX && sideZ) { type[i] = T.SOLID; solid[i] = f.top; }
        } else if (f.legs === 'west' || f.legs === 'east') {
          // (v0.31) Posts down one side only (an arcade against a building, a lean-to's open
          // side): the lane under it stays clear for 2x2 ceiling traps.
          const edge = f.legs === 'west' ? (x === cx0 || x === cx0 + 1) : (x === cx1 || x === cx1 - 1);
          if (edge && (z - cz0) % 8 < 2) { type[i] = T.SOLID; solid[i] = f.top; }
        } else if (f.kind === 'over' && sideX && (z - cz0) % 8 < 2) { type[i] = T.SOLID; solid[i] = f.top; }   // colonnade pillars every 4 units
      });
    }
  });
  if (GATE) eachCell([GATE.x0, GATE.z0, GATE.x1, GATE.z1], i => { type[i] = T.GATE; solid[i] = 0; });
  // Timed doors (servants' passages): remember which cells each door covers; the sim opens/shuts them.
  (MAP.doors || []).forEach((d, di) => eachCell(d.rect, i => { door[i] = di; }));
  eachCell([HOLE.x0, HOLE.z0, HOLE.x1, HOLE.z1], i => { type[i] = T.HOLE; solid[i] = 0; });

  // Trap surfaces.
  const covered = new Uint8Array(N);
  const wallDir = new Int8Array(N).fill(-1);
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = z * W + x;
    if (!floorish(type[i])) continue;
    if (slabBot[i] > 0) covered[i] = 1;
    for (let d = 0; d < 4; d++) {
      const n = (z + DIRS4[d][1]) * W + x + DIRS4[d][0];
      if (type[n] === T.SOLID && solid[n] >= 1.0) { wallDir[i] = d; break; }
    }
  }
  const bigOk = new Uint8Array(N);
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = z * W + x;
    if (!miceWalkable(type[i])) continue;
    if (slabBot[i] > 0 && slabBot[i] < 2.0) continue;
    // Bosses are big: they need 2 cells (1 unit) of clearance on every side.
    let ok = true;
    for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= W || zz >= H || !miceWalkable(type[zz * W + xx])) { ok = false; break; }
    }
    if (ok) bigOk[i] = 1;
  }
  // The hole is in the wall itself, so let bosses squeeze up to it.
  for (let z = Math.round(HOLE.z0 / CELL); z < Math.round(HOLE.z0 / CELL) + 6; z++)
    for (let x = Math.round(HOLE.x0 / CELL) - 3; x < Math.round(HOLE.x1 / CELL) + 3; x++)
      if (miceWalkable(type[z * W + x])) bigOk[z * W + x] = 1;
  // Furniture routes (v0.14): mice climb over low furniture (fences, crates, buckets...) and
  // a few big things (the cellar cheese wheel) when going over is shorter than going round.
  // A link: climb up at a, run along the path on top (height y), climb down at b. Either way.
  const links = [];
  const floorAt = (x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); if (cx < 1 || cz < 1 || cx >= W - 1 || cz >= H - 1) return -1; const i = cz * W + cx; return miceWalkable(type[i]) && type[i] !== T.HOLE && type[i] !== T.GATE && (slabBot[i] === 0 || slabBot[i] > 2.5) ? i : -1; };   // not under a low table
  const entry = (x, z) => { const out = []; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const i = floorAt(x + dx * CELL, z + dz * CELL); if (i >= 0 && Math.hypot(dx, dz) * CELL <= 0.8) out.push(i); } return out; };
  // v0.31: a run can change height. Each path point is [x, z] (at the run's height y) or
  // [x, z, y] or [x, z, y, look]: up a broom, along a shelf, over a plank bridge, down a sack
  // pile. look says what the stretch arriving at that point is drawn as ('broom', 'plank',
  // 'ladder', 'rope'; none = it's on furniture that's already there). A run that starts or
  // ends on the floor (y under 0.6, the foot of a broom) costs almost nothing to get onto.
  // fav (v0.31): under 1 = rats like this run (high, out of the way) and take it over a floor
  // route that's up to about 1/fav as long. 1 = only when it's really the shorter way.
  const addLink = (name, a, b, y, path, ladder = false, fav = 1) => {
    const ia = floorAt(a[0], a[1]), ib = floorAt(b[0], b[1]); if (ia < 0 || ib < 0) return;
    const pts = path.map(p => [p[0], p[1], p[2] ?? y, p[3] || null]);
    let len = 0, flat = 0, climb = 0, prev = [a[0], a[1], 0]; const cells = new Set();
    for (const q of [...pts, [b[0], b[1], 0]]) {
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1]) / 0.25));
      for (let k = 0; k <= n; k++) {
        const x = prev[0] + (q[0] - prev[0]) * k / n, z = prev[1] + (q[1] - prev[1]) * k / n, yy = prev[2] + (q[2] - prev[2]) * k / n, cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
        const j = cz * W + cx;   // what it runs on, at that height (a Poison Box up there closes the run)
        if (yy > 0.5 && ((type[j] === T.SOLID && Math.abs(solid[j] - yy) < 0.8) || (slabTop[j] > 0 && Math.abs(slabTop[j] - yy) < 0.8))) cells.add(j);
      }
      len += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); flat += Math.hypot(q[0] - prev[0], q[1] - prev[1]); climb += Math.abs(q[2] - prev[2]); prev = q;
    }
    links.push({ id: links.length, name, a, b, y, path, pts, ladder, flat, climb, fav, rampA: pts[0][2] < 0.6, rampB: pts[pts.length - 1][2] < 0.6, cellA: ia, cellB: ib, entryA: entry(a[0], a[1]), entryB: entry(b[0], b[1]), len, cells: [...cells] });
  };
  FURNITURE.forEach(f => {
    if (f.kind !== 'solid' || f.h > 1.8 || f.h < 0.5) return;
    const [x0, z0, x1, z1] = f.rect, w = x1 - x0, d = z1 - z0;
    if (Math.min(w, d) > 4) return;                               // only thin things you can scramble over
    const alongX = w >= d, L = alongX ? w : d, n = Math.max(1, Math.floor(L / 4));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      if (alongX) { const x = x0 + w * t; addLink(f.name, [x, z0 - 1], [x, z1 + 1], f.h, [[x, z0 + 0.25], [x, z1 - 0.25]]); }
      else { const z = z0 + d * t; addLink(f.name, [x0 - 1, z], [x1 + 1, z], f.h, [[x0 + 0.25, z], [x1 - 0.25, z]]); }
    }
  });
  for (const l of MAP.links || []) addLink(l.name, l.a, l.b, l.y, l.path, !!l.ladder, l.fav || 1);
  return { type, solid, slabBot, slabTop, furn, covered, wallDir, bigOk, forest, mud, door, links };
}

export function floorish(t) { return t === T.FLOOR || t === T.ROAD || t === T.BRIDGE; }
export function miceWalkable(t) { return t === T.FLOOR || t === T.ROAD || t === T.BRIDGE || t === T.HOLE || t === T.GATE; }
export const BASE_COST = { [T.FLOOR]: 1, [T.ROAD]: 1, [T.BRIDGE]: 1, [T.HOLE]: 1, [T.GATE]: 1 };
export const goalCells = () => {
  const out = [];
  for (let z = Math.round(HOLE.z0 / CELL); z < Math.round(HOLE.z1 / CELL); z++)
    for (let x = Math.round(HOLE.x0 / CELL); x < Math.round(HOLE.x1 / CELL); x++) out.push(z * W + x);
  return out;
};
