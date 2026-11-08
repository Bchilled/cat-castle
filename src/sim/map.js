// map.js — the six maps of the campaign (entrance to kitchen), at mouse scale.
// Map 1 notes below; the other maps are described where they are defined.
// Built on trap-defense level-design lessons (our own layout):
//   • several entrances whose lanes merge and split, so you choose where to fight
//   • wide lanes (10–16 units) with room for 2–3 traps side by side plus a cat
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
export let ROAD_HALF = 5, SPAWNS = [], SPAWN = null, CAT_SPAWN = null, VIAS = [];

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
const roof = (name, rect, bot, top, look) => ({ name, kind: 'roof', rect, bot, top, look });

export const MAPS = {
  // 1. Castle Entrance — the original map (moat, gate, courtyard, three lanes north).
  entrance: {
    id: 'entrance', name: 'Castle Entrance', order: 1, w: 96, h: 120, floor: 'cobbles', birds: true,
    blurb: 'Hold the road, the bridge and the gate. Three lanes split north of the courtyard.',
    twist: 'The gate holds them back until wave 6. Flingers by the moat drown them.',
    furniture: [
      // Heights are human scale (1 unit = 30 cm): the castle walls are ~8.5 m, a door is ~2.1 m.
      { name: 'West wall', kind: 'solid', rect: [0, 0, 2, 84],   h: 28, look: 'stone' },
      { name: 'East wall', kind: 'solid', rect: [94, 0, 96, 84], h: 28, look: 'stone' },
      { name: 'Hall wall', kind: 'solid', rect: [2, 0, 94, 2],   h: 32, look: 'hallwall' },
      { name: 'Curtain wall W', kind: 'solid', rect: [0, 76, 40, 84],  h: 28, look: 'stone' },
      { name: 'Curtain wall E', kind: 'solid', rect: [56, 76, 96, 84], h: 28, look: 'stone' },
      { name: 'Gatehouse W', kind: 'solid', rect: [28, 58, 40, 76], h: 34, look: 'stone' },
      { name: 'Gatehouse E', kind: 'solid', rect: [56, 58, 68, 76], h: 34, look: 'stone' },
      { name: 'Gatehouse roof', kind: 'roof', rect: [40, 58, 56, 84], bot: 9, top: 34, look: 'tunnelroof' },
      { name: 'Yard wall SW', kind: 'solid', rect: [2, 56, 28, 58], h: 6, look: 'stone' },
      { name: 'Yard wall SE', kind: 'solid', rect: [68, 56, 94, 58], h: 6, look: 'stone' },
      { name: 'Well', kind: 'solid', rect: [44, 38, 52, 46], h: 3.2, look: 'well' },
      { name: 'West walkway', kind: 'solid', rect: [2, 30, 8, 56], h: 3, look: 'walkway' },
      { name: 'East walkway', kind: 'solid', rect: [88, 30, 94, 56], h: 3, look: 'walkway' },
      { name: 'Crate', kind: 'solid', rect: [8, 50, 10, 52], h: 1.4, look: 'crate' },
      { name: 'Crate', kind: 'solid', rect: [86, 50, 88, 52], h: 1.4, look: 'crate' },
      { name: 'Crate', kind: 'solid', rect: [52, 44, 54, 46], h: 1.4, look: 'crate' },
      { name: 'Guardhouse W', kind: 'solid', rect: [30, 10, 44, 30], h: 16, look: 'guardhouse' },
      { name: 'Guardhouse E', kind: 'solid', rect: [52, 10, 66, 30], h: 16, look: 'guardhouse' },
      { name: 'Guard passage', kind: 'roof', rect: [44, 10, 52, 30], bot: 7, top: 16, look: 'tunnelroof' },
      { name: 'Colonnade roof', kind: 'over', rect: [10, 8, 26, 30], bot: 9, top: 9.8, look: 'colonnade' },
      { name: 'Barrels', kind: 'solid', rect: [2, 8, 10, 30], h: 3.0, look: 'barrels' },
      { name: 'Hay bales', kind: 'solid', rect: [84, 8, 94, 30], h: 2.6, look: 'bales' },
      { name: 'Cart', kind: 'solid', rect: [72, 14, 78, 22], h: 3.6, look: 'cart' },        // splits the east lane
      over('Bench', [16, 40, 30, 43], 1.5, 1.9, 'bench'),
      over('Trestle table', [62, 36, 74, 44], 2.5, 2.9, 'table'),
      { name: 'Bucket', kind: 'solid', rect: [54, 38, 56.5, 40.5], h: 1.4, look: 'bucket' },
      { name: 'Helmet', kind: 'solid', rect: [31, 93.5, 34, 96.5], h: 1.5, look: 'helmet' },
      { name: 'Spear rack', kind: 'solid', rect: [10, 52, 22, 53], h: 6, look: 'rack' },
      { name: 'Hollow log', kind: 'roof', rect: [16, 102, 26, 110], bot: 4, top: 5, look: 'log' },
      { name: 'Hollow log', kind: 'roof', rect: [70, 102, 80, 110], bot: 4, top: 5, look: 'log' },
    ],
    drain: { x0: 0, x1: 96, z0: 84, z1: 92 }, bridge: { x0: 41, x1: 55, z0: 83.5, z1: 92.5 }, gate: { x0: 40, x1: 56, z0: 83, z1: 84 },
    hole: { x0: 46, x1: 50, z0: 2, z1: 2.5 }, clearing: { x0: 28, x1: 68, z0: 92, z1: 102 },
    roads: [[[20, 120], [20, 108], [30, 98]], [[76, 120], [76, 108], [66, 98]]],
    spawns: [{ x: 20, z: 118.8 }, { x: 76, z: 118.8 }], catSpawn: { x: 48, z: 8 },
    vias: [{ name: 'Colonnade', x: 18, z: 10, weight: 1 }, { name: 'Guard passage', x: 48, z: 20, weight: 1 }, { name: 'East lane', x: 76, z: 7, weight: 1 }],
    torches: [[2, 40, 1, 0], [94, 40, -1, 0], [40, 66, 1, 0], [56, 66, -1, 0], [42, 2, 0, 1], [54, 2, 0, 1], [30, 20, -1, 0], [66, 20, 1, 0]],
    // Knock-over props near the edges of the table, bench and walkways (x, surface height, z).
    props: [['pot', 63, 2.9, 40], ['jug', 70, 2.9, 37], ['basket', 20, 1.9, 42.5], ['pot', 26, 1.9, 40.5], ['jug', 7, 3, 40], ['basket', 89, 3, 44]],
  },
  // 2. Market Back Alleys — behind the stalls. Three alleys, crossings under the stall
  // counters (ceilings for zappers, pots to knock off onto them). Twist: food piles.
  // Mice stop to gorge and come out tougher, until the pile is gone.
  market: {
    id: 'market', name: 'Market Back Alleys', order: 2, w: 88, h: 104, floor: 'cobbles', birds: true,
    blurb: 'Three alleys behind the market stalls, crossing under the counters.',
    twist: 'Food piles: mice stop to gorge and come out tougher. Knock pots off the counters onto them.',
    furniture: [
      ...shell(88, 104, 24, 'house', [22, 66]),
      blk('Stall block', [18, 22, 38, 40], 20, 'house'), blk('Stall block', [18, 46, 38, 62], 20, 'house'), blk('Stall block', [18, 68, 38, 84], 20, 'house'),
      blk('Stall block', [50, 22, 70, 40], 20, 'house'), blk('Stall block', [50, 46, 70, 62], 20, 'house'), blk('Stall block', [50, 68, 70, 84], 20, 'house'),
      over('Fish stall', [18, 40, 38, 46], 2.6, 3.0, 'stall'), over('Veg stall', [18, 62, 38, 68], 2.6, 3.0, 'stall'),
      over('Bread stall', [50, 40, 70, 46], 2.6, 3.0, 'stall'), over('Cheese stall', [50, 62, 70, 68], 2.6, 3.0, 'stall'),
      blk('Crates', [8, 88, 12, 92], 1.6, 'crate'), blk('Barrels', [74, 88, 82, 92], 3, 'barrels'), blk('Cart', [40, 90, 46, 98], 3.6, 'cart'),
      blk('Crates', [10, 8, 16, 12], 1.6, 'crate'), blk('Crates', [72, 6, 78, 10], 1.6, 'crate'),
      blk('Apple sacks', [2, 52, 5, 56], 0.8, 'sacks'), blk('Bread sacks', [83, 30, 86, 34], 0.8, 'sacks'), blk('Cabbages', [40, 72, 43, 75], 0.8, 'sacks'),
      over('Awning bench', [56, 8, 66, 11], 1.5, 1.9, 'bench'),
    ],
    hole: { x0: 42, x1: 46, z0: 2, z1: 2.5 }, spawns: [{ x: 22, z: 102.8 }, { x: 66, z: 102.8 }], catSpawn: { x: 44, z: 8 },
    vias: [{ name: 'West alley', x: 10, z: 30, weight: 1 }, { name: 'Centre alley', x: 44, z: 30, weight: 1 }, { name: 'East alley', x: 78, z: 30, weight: 1 }],
    foods: [{ name: 'Apples', x: 5.5, z: 54, r: 3.5, amount: 25 }, { name: 'Bread', x: 82.5, z: 32, r: 3.5, amount: 25 }, { name: 'Cabbages', x: 41.5, z: 76, r: 3.5, amount: 25 }],
    torches: [[2, 30, 1, 0], [86, 60, -1, 0], [38, 30, 1, 0], [50, 76, -1, 0], [44, 2, 0, 1]],
    props: [['pot', 22, 3, 41], ['basket', 28, 3, 45], ['jug', 34, 3, 41], ['pot', 22, 3, 67], ['basket', 34, 3, 63], ['jug', 54, 3, 45], ['pot', 62, 3, 41],
            ['basket', 66, 3, 45], ['pot', 54, 3, 63], ['jug', 66, 3, 67], ['basket', 76, 3, 89], ['pot', 13, 1.6, 9]],
  },

  // 3. Stables and Yard — a covered aisle under the hay loft with horse pens off it,
  // and an open yard. Twist: mud slows everyone (cats too), water troughs drown mice.
  stables: {
    id: 'stables', name: 'Stables and Yard', order: 3, w: 100, h: 96, floor: 'dirt', birds: true,
    blurb: 'A long stable aisle under the hay loft, and a muddy yard full of troughs.',
    twist: 'Mud slows everything. Troughs drown mice: fling them in.',
    furniture: [
      ...shell(100, 96, 22, 'house', [23, 74]),
      { name: 'Hay loft', kind: 'over', rect: [16, 14, 30, 86], bot: 5.5, top: 6.2, look: 'loft' },
      ...[24, 36, 48, 60, 72].map(z => blk('Pen wall', [2, z, 14, z + 1], 4, 'partition')),
      blk('Stable wall', [30, 14, 32, 28], 10, 'house'), blk('Stable wall', [30, 34, 32, 50], 10, 'house'),
      blk('Stable wall', [30, 56, 32, 72], 10, 'house'), blk('Stable wall', [30, 78, 32, 86], 10, 'house'),
      blk('Fence', [32, 72, 60, 73], 1.2, 'fence'), blk('Fence', [68, 30, 98, 31], 1.2, 'fence'),
      blk('Cart', [76, 8, 82, 16], 3.6, 'cart'), blk('Hay bales', [86, 4, 98, 14], 2.6, 'bales'),
      blk('Oat sacks', [36, 2, 40, 5], 0.8, 'sacks'), blk('Water barrel', [92, 80, 96, 84], 3, 'barrels'),
    ],
    waters: [{ x0: 48, x1: 60, z0: 40, z1: 44 }, { x0: 70, x1: 84, z0: 52, z1: 56 }, { x0: 40, x1: 54, z0: 76, z1: 79 }],
    muds: [{ x0: 34, x1: 92, z0: 24, z1: 70 }],
    hole: { x0: 48, x1: 52, z0: 2, z1: 2.5 }, spawns: [{ x: 23, z: 94.8 }, { x: 74, z: 94.8 }], catSpawn: { x: 50, z: 8 },
    vias: [{ name: 'Stable aisle', x: 23, z: 50, weight: 1 }, { name: 'Yard', x: 62, z: 36, weight: 1 }],
    foods: [{ name: 'Oats', x: 38, z: 6.5, r: 3.5, amount: 25 }],
    torches: [[2, 50, 1, 0], [30, 40, -1, 0], [98, 50, -1, 0], [50, 2, 0, 1]],
    props: [['bucket', 20, 6.2, 30], ['basket', 26, 6.2, 60], ['pot', 92, 2.6, 8], ['jug', 79, 3.6, 12], ['bucket', 20, 6.2, 76]],
  },

  // 4. Cellar and Storerooms — under a stone vault (ceilings everywhere), long wine racks
  // making corridors, a giant cheese wheel. Twist: it's dark (sniff with F), and the
  // cheese wheel makes every mouse stop to gorge.
  cellar: {
    id: 'cellar', name: 'Cellar and Storerooms', order: 4, w: 84, h: 100, floor: 'stone', birds: false, dark: true,
    blurb: 'Long wine-rack corridors under a stone vault, round a giant cheese wheel.',
    twist: "It's dark down here: hold F to sniff them out. Ceiling traps work anywhere.",
    furniture: [
      ...shell(84, 100, 14, 'stone', [24, 60]),
      roof('Vault', [2, 2, 82, 98], 8, 9, 'vault'),
      ...[14, 30, 52, 68].flatMap(x => [blk('Wine rack', [x, 18, x + 2, 46], 7, 'winerack'), blk('Wine rack', [x, 52, x + 2, 84], 7, 'winerack')]),
      blk('Cheese wheel', [38, 60, 46, 68], 3, 'cheesewheel'),
      blk('Barrels', [72, 4, 82, 12], 3, 'barrels'), blk('Barrels', [2, 88, 10, 96], 3, 'barrels'), blk('Crates', [4, 4, 10, 8], 1.6, 'crate'),
    ],
    hole: { x0: 40, x1: 44, z0: 2, z1: 2.5 }, spawns: [{ x: 24, z: 98.8 }, { x: 60, z: 98.8 }], catSpawn: { x: 42, z: 8 },
    vias: [{ name: 'West racks', x: 23, z: 50, weight: 1 }, { name: 'Cheese aisle', x: 42, z: 50, weight: 1 }, { name: 'East racks', x: 61, z: 50, weight: 1 }],
    foods: [{ name: 'Cheese wheel', x: 42, z: 64, r: 5.5, amount: 60 }],
    torches: [[2, 30, 1, 0], [82, 70, -1, 0], [42, 2, 0, 1]],
    props: [['jug', 75, 3, 8], ['pot', 79, 3, 6], ['jug', 6, 3, 92], ['basket', 7, 1.6, 6]],
  },

  // 5. Servants' Passages — narrow corridors inside the walls, a grid of loops, roofed
  // all over. Twist: servants open and shut doors on a timer, rerouting the mice mid-wave.
  passages: {
    id: 'passages', name: "Servants' Passages", order: 5, w: 80, h: 100, floor: 'planks', birds: false,
    blurb: 'A maze of narrow passages inside the walls. Ceilings everywhere.',
    twist: 'Servants open and shut the doors on a timer. Every swing reroutes the mice.',
    furniture: [
      ...shell(80, 100, 14, 'plaster', [5, 75]),
      roof('Ceiling', [2, 2, 78, 98], 6, 7, 'beams'),
      ...[[8, 34], [40, 72]].flatMap(([x0, x1]) => [[8, 30], [36, 62], [68, 90]].map(([z0, z1]) => blk('Room', [x0, z0, x1, z1], 14, 'plaster'))),
      blk('Linen basket', [3, 40, 7, 43], 1.4, 'basket'), blk('Coal scuttle', [73, 20, 77, 23], 1.4, 'bucket'),
    ],
    doors: [
      { rect: [34, 48, 40, 49], period: 16, offset: 0 }, { rect: [20, 30, 21, 36], period: 18, offset: 6 },
      { rect: [56, 62, 57, 68], period: 14, offset: 3 }, { rect: [2, 76, 8, 77], period: 20, offset: 10 },
    ],
    hole: { x0: 35, x1: 39, z0: 2, z1: 2.5 }, spawns: [{ x: 5, z: 98.8 }, { x: 75, z: 98.8 }], catSpawn: { x: 37, z: 5 },
    vias: [{ name: 'West passage', x: 5, z: 50, weight: 1 }, { name: 'Middle passage', x: 37, z: 33, weight: 1 }, { name: 'East passage', x: 75, z: 50, weight: 1 }],
    torches: [[2, 20, 1, 0], [78, 80, -1, 0], [34, 50, -1, 0], [40, 20, 1, 0]],
    props: [['basket', 5, 1.4, 41.5], ['pot', 76, 1.4, 21]],
  },

  // 6. The Kitchen — under the counters and the island, past the ovens, to the pantry.
  // Twist: three entrances, and the ovens and hearth burn anything that gets close.
  kitchen: {
    id: 'kitchen', name: 'The Kitchen', order: 6, w: 96, h: 100, floor: 'stone', birds: true,
    blurb: 'The last stand: under the counters and the island, past the ovens, to the pantry.',
    twist: 'Three ways in. The ovens and the hearth burn mice and cats alike.',
    furniture: [
      ...shell(96, 100, 26, 'plaster', [16, 48, 80]),
      over('West counter', [2, 18, 14, 82], 3, 3.4, 'counter'), over('East counter', [82, 18, 94, 82], 3, 3.4, 'counter'),
      over('Island', [34, 38, 62, 58], 3, 3.4, 'counter'), over('Butcher block', [60, 70, 72, 78], 2.8, 3.2, 'table'),
      blk('Oven', [36, 2, 52, 8], 9, 'oven'), blk('Hearth', [86, 86, 94, 96], 8, 'oven'),
      blk('Flour sacks', [18, 4, 26, 8], 2.6, 'sacks'), blk('Crates', [56, 90, 62, 96], 1.6, 'crate'),
    ],
    fires: [{ x: 44, z: 10.5, r: 3 }, { x: 84, z: 91, r: 2.5 }],
    foods: [{ name: 'Dropped veg', x: 30, z: 66, r: 3.5, amount: 25 }],
    hole: { x0: 70, x1: 74, z0: 2, z1: 2.5 }, spawns: [{ x: 16, z: 98.8 }, { x: 48, z: 98.8 }, { x: 80, z: 98.8 }], catSpawn: { x: 72, z: 8 },
    vias: [{ name: 'Under the west counter', x: 18, z: 50, weight: 1 }, { name: 'Round the island', x: 48, z: 30, weight: 1 }, { name: 'Under the east counter', x: 78, z: 50, weight: 1 }],
    torches: [[2, 10, 1, 0], [94, 30, -1, 0], [30, 2, 0, 1], [60, 2, 0, 1]],
    props: [['pot', 12.5, 3.4, 24], ['jug', 12.5, 3.4, 40], ['pot', 12.5, 3.4, 56], ['basket', 12.5, 3.4, 72], ['pot', 83.5, 3.4, 26], ['jug', 83.5, 3.4, 44],
            ['pot', 83.5, 3.4, 62], ['basket', 83.5, 3.4, 76], ['pot', 40, 3.4, 39.5], ['jug', 48, 3.4, 56.5], ['pot', 56, 3.4, 39.5], ['basket', 66, 3.2, 71]],
  },
};
export const MAP_ORDER = ['entrance', 'market', 'stables', 'cellar', 'passages', 'kitchen'];

// Food up on the furniture (v0.12): some mice leave their route, climb up at `climb`
// (a floor spot by the edge), eat at (x, z) on the top (height y) and come out tougher.
// Floor traps can go on furniture tops too, so you can trap the feast.
const TOPS = {
  entrance: [{ name: 'Meat pie', x: 68, z: 41.5, y: 2.9, r: 1.2, amount: 20, climb: [68, 45] }, { name: 'Cheese rind', x: 21, z: 41.5, y: 1.9, r: 1, amount: 15, climb: [21, 44] }],
  market: [{ name: 'Fish', x: 28, z: 43, y: 3, r: 1.2, amount: 20, climb: [16.5, 43] }, { name: 'Cheese', x: 60, z: 65, y: 3, r: 1.2, amount: 20, climb: [71.5, 65] }],
  stables: [{ name: 'Oat bucket', x: 92, z: 9, y: 2.6, r: 1.2, amount: 20, climb: [84.5, 9] }],
  cellar: [{ name: 'Cheese wheel top', x: 42, z: 64, y: 3, r: 1.5, amount: 30, climb: [42, 69] }],
  passages: [{ name: 'Crumbs', x: 74, z: 21.5, y: 1.4, r: 1, amount: 15, climb: [75, 24.5] }],
  kitchen: [{ name: 'Roast chicken', x: 48, z: 48, y: 3.4, r: 1.5, amount: 30, climb: [48, 59.5] }, { name: 'Cake', x: 8, z: 50, y: 3.4, r: 1.2, amount: 20, climb: [15.5, 50] }, { name: 'Pie', x: 88, z: 32, y: 3.4, r: 1.2, amount: 20, climb: [80.5, 32] }],
};
// Crate stacks across a corridor (v0.12): mice smash through them when it's worth it,
// opening a shortcut for the rest of the wave. Servants stack them back between waves.
const CRATES = {
  entrance: [[44, 18, 52, 20]],   // the guard passage
  market: [[38, 76, 50, 78]],     // the centre alley
  passages: [[34, 20, 40, 22]],   // the last stretch of the main passage, before the hall
};
for (const k of MAP_ORDER) { MAPS[k].tops = TOPS[k] || []; MAPS[k].crates = CRATES[k] || []; }

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
  if (BRIDGE) eachCell([BRIDGE.x0, BRIDGE.z0, BRIDGE.x1, BRIDGE.z1], i => { type[i] = T.BRIDGE; solid[i] = 0; forest[i] = 0; });
  for (const mr of MAP.muds || []) eachCell([mr.x0, mr.z0, mr.x1, mr.z1], i => { mud[i] = 1; });

  FURNITURE.forEach((f, fi) => {
    if (f.kind === 'solid') {
      eachCell(f.rect, i => { type[i] = T.SOLID; solid[i] = Math.max(solid[i], f.h); furn[i] = fi; forest[i] = 0; });
    } else {
      const [x0, z0, x1, z1] = f.rect;
      const cx0 = Math.round(x0 / CELL), cx1 = Math.round(x1 / CELL) - 1, cz0 = Math.round(z0 / CELL), cz1 = Math.round(z1 / CELL) - 1;
      eachCell(f.rect, (i, x, z) => {
        if (type[i] === T.SOLID && f.kind === 'roof') return;     // roofs don't override walls
        slabBot[i] = f.bot; slabTop[i] = f.top; furn[i] = fi;
        const sideX = x === cx0 || x === cx1 || x === cx0 + 1 || x === cx1 - 1;
        if (f.legs === 'corners') {
          // Table / bench: one leg (1x1 unit) in each corner.
          const sideZ = z === cz0 || z === cz1 || z === cz0 + 1 || z === cz1 - 1;
          if (sideX && sideZ) { type[i] = T.SOLID; solid[i] = f.top; }
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
  return { type, solid, slabBot, slabTop, furn, covered, wallDir, bigOk, forest, mud, door };
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
