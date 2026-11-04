// map.js — Map 1: the castle entrance hall, at mouse scale.
// Brent's sketch is the floor plan: mice squeeze under the great front door
// (Y), cross the flagstones and doormat (the road fight), cross the rainwater
// drain on a dropped yardstick (the mouse drawbridge), chew through a big book
// wedged in the gap of the furniture line (the gate), then weave between the
// hall furniture to the gap under the inner door (X) into the castle.
//
// Grid: each cell is half a world unit, so traps can sit in "quarters" of a
// tile and fit flush against furniture. 1 world unit ≈ 30 cm.

export const CELL = 0.5;
export const WORLD_W = 48, WORLD_H = 80;          // world units
export const W = WORLD_W / CELL, H = WORLD_H / CELL; // cells (96 x 160)

export const T = { FLOOR: 0, RUG: 1, WATER: 2, BRIDGE: 3, SOLID: 4, GATE: 5, HOLE: 6, STALL: 7 };

// Furniture, in world units [x0, z0, x1, z1]. kind 'solid' = block you can
// climb on; 'over' = table/bench/boot you can walk UNDER (its underside is a
// ceiling for ceiling traps, its top is a platform).
export const FURNITURE = [
  // Room walls (tall stone).
  { name: 'West wall',  kind: 'solid', rect: [0, 0, 1, 80],  h: 14, look: 'wall' },
  { name: 'East wall',  kind: 'solid', rect: [47, 0, 48, 80], h: 14, look: 'wall' },
  { name: 'North wall', kind: 'solid', rect: [1, 0, 47, 1],  h: 14, look: 'wall' },
  { name: 'South wall', kind: 'solid', rect: [1, 79, 47, 80], h: 14, look: 'wall' },
  // Entry side (the "road").
  { name: 'Hall bench', kind: 'over',  rect: [4, 63, 16, 67], bot: 1.3, top: 1.6, look: 'bench' },
  { name: 'Old boot',   kind: 'over',  rect: [33, 61, 36.5, 70], bot: 1.4, top: 2.0, look: 'boot', sides: true },
  { name: 'Boot',       kind: 'solid', rect: [38, 70, 41, 74], h: 2.2, look: 'boot2' },
  // The furniture line on the far bank of the drain (the "castle wall").
  { name: 'Firewood stack', kind: 'solid', rect: [1, 42, 12, 46],  h: 2.2, look: 'logs' },
  { name: 'Wood chest',     kind: 'solid', rect: [12, 42, 22, 46], h: 2.6, look: 'chest' },
  { name: 'Boot rack',      kind: 'solid', rect: [26, 42, 38, 46], h: 3.0, look: 'rack' },
  { name: 'Umbrella stand', kind: 'solid', rect: [38, 42, 42, 46], h: 4.0, look: 'umbrella' },
  { name: 'Log basket',     kind: 'solid', rect: [42, 42, 47, 46], h: 2.4, look: 'basket' },
  // The hall proper — positions follow the courtyard buildings in the sketch.
  { name: 'Side table',     kind: 'over',  rect: [12, 10, 26, 17], bot: 2.4, top: 2.65, look: 'table' },
  { name: 'Blanket chest',  kind: 'solid', rect: [30, 7, 42, 14],  h: 2.4, look: 'chest' },
  { name: 'Coal scuttle',   kind: 'solid', rect: [20, 22, 30, 27], h: 2.0, look: 'scuttle' },
  { name: 'Armour plinth',  kind: 'solid', rect: [11, 28, 16, 36], h: 1.2, look: 'plinth' },
  { name: 'Suit of armour', kind: 'solid', rect: [12, 30, 15, 34], h: 7.5, look: 'armour' },
  { name: 'Long bench',     kind: 'over',  rect: [32, 22, 45, 30], bot: 1.3, top: 1.6, look: 'bench' },
  // Climbing crates so Fred can get up on things.
  { name: 'Crate', kind: 'solid', rect: [27, 12, 29, 14], h: 1.2, look: 'crate' },
  { name: 'Crate', kind: 'solid', rect: [10, 18, 12, 20], h: 1.2, look: 'crate' },
  { name: 'Crate', kind: 'solid', rect: [6, 39, 8, 41],   h: 1.2, look: 'crate' },
];

export const DRAIN = { x0: 1, x1: 47, z0: 50, z1: 53 };        // rainwater drain (moat)
export const BRIDGE = { x0: 22, x1: 26, z0: 49.5, z1: 53.5 };   // dropped yardstick
export const GATE = { x0: 22, x1: 26, z0: 43, z1: 44.5 };      // big book wedged in the gap
export const HOLE = { x0: 5, x1: 7.5, z0: 1, z1: 1.5 };          // gap under the inner door (X)
export const RUG = { x0: 19, x1: 33, z0: 69, z1: 78 };          // doormat
export const SPAWN = { x: 30, z: 78.6 };                        // under the front door (Y)
export const CAT_SPAWN = { x: 4.5, z: 12 };
// Cheese stalls (sell points): main stash beside X, one past the gate, one on the near bank.
export const STALLS = [
  { name: 'Pantry stash', rect: [1, 6, 3, 10],     sell: [3.6, 8] },
  { name: 'Gate stash',   rect: [27, 38, 29, 40],  sell: [28, 37.2] },
  { name: 'Bank stash',   rect: [6, 55, 8, 57],    sell: [7, 57.8] },
];

export const idx = (x, z) => z * W + x;
export const cellOf = (wx, wz) => {
  const x = Math.floor(wx / CELL), z = Math.floor(wz / CELL);
  return (x < 0 || z < 0 || x >= W || z >= H) ? -1 : z * W + x;
};
export const cellCenter = (i) => [((i % W) + 0.5) * CELL, (((i / W) | 0) + 0.5) * CELL];
export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // +x, -x, +z, -z

// Build the grid once. Typed arrays keep lookups fast for hundreds of mice.
export function buildMap() {
  const N = W * H;
  const type = new Uint8Array(N);
  const solid = new Float32Array(N);    // solid column height from the floor
  const slabBot = new Float32Array(N);  // underside of an overhang (0 = none)
  const slabTop = new Float32Array(N);  // top surface of an overhang
  const furn = new Int16Array(N).fill(-1);

  const eachCell = ([x0, z0, x1, z1], fn) => {
    for (let z = Math.round(z0 / CELL); z < Math.round(z1 / CELL); z++)
      for (let x = Math.round(x0 / CELL); x < Math.round(x1 / CELL); x++)
        if (x >= 0 && z >= 0 && x < W && z < H) fn(z * W + x, x, z);
  };

  eachCell([RUG.x0, RUG.z0, RUG.x1, RUG.z1], i => { type[i] = T.RUG; });
  eachCell([DRAIN.x0, DRAIN.z0, DRAIN.x1, DRAIN.z1], i => { type[i] = T.WATER; });
  eachCell([BRIDGE.x0, BRIDGE.z0, BRIDGE.x1, BRIDGE.z1], i => { type[i] = T.BRIDGE; });

  FURNITURE.forEach((f, fi) => {
    if (f.kind === 'solid') {
      eachCell(f.rect, i => { type[i] = T.SOLID; solid[i] = Math.max(solid[i], f.h); furn[i] = fi; });
    } else {
      const [x0, z0, x1, z1] = f.rect;
      eachCell(f.rect, (i, x, z) => {
        slabBot[i] = f.bot; slabTop[i] = f.top; furn[i] = fi;
        // Legs at the four corners (or full side walls for the boot tunnel).
        const cx0 = Math.round(x0 / CELL), cx1 = Math.round(x1 / CELL) - 1;
        const cz0 = Math.round(z0 / CELL), cz1 = Math.round(z1 / CELL) - 1;
        const leg = f.sides ? (x === cx0 || x === cx1) : ((x === cx0 || x === cx1) && (z === cz0 || z === cz1));
        if (leg) { type[i] = T.SOLID; solid[i] = f.top; }
      });
    }
  });
  // The book gate fills the gap in the furniture line.
  eachCell([GATE.x0, GATE.z0, GATE.x1, GATE.z1], i => { type[i] = T.GATE; });
  eachCell([HOLE.x0, HOLE.z0, HOLE.x1, HOLE.z1], i => { type[i] = T.HOLE; solid[i] = 0; });
  STALLS.forEach(s => eachCell(s.rect, i => { type[i] = T.STALL; solid[i] = 1.0; }));

  // Trap surfaces.
  const covered = new Uint8Array(N);         // under an overhang -> ceiling traps
  const wallDir = new Int8Array(N).fill(-1); // index of an adjacent solid side -> wall traps
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = z * W + x;
    if (!floorish(type[i])) continue;
    if (slabBot[i] > 0 && type[i] !== T.SOLID) covered[i] = 1;
    for (let d = 0; d < 4; d++) {
      const n = (z + DIRS4[d][1]) * W + x + DIRS4[d][0];
      if (type[n] === T.SOLID && solid[n] >= 1.0) { wallDir[i] = d; break; }
    }
  }
  // Cells roomy enough for the big bosses: no low overhangs, no solid neighbours.
  const bigOk = new Uint8Array(N);
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = z * W + x;
    if (!miceWalkable(type[i])) continue;
    if (slabBot[i] > 0 && slabBot[i] < 2.0) continue;
    let ok = true;
    for (const [dx, dz] of DIRS4) { const n = (z + dz) * W + x + dx; if (!miceWalkable(type[n])) { ok = false; break; } }
    if (ok) bigOk[i] = 1;
  }
  return { type, solid, slabBot, slabTop, furn, covered, wallDir, bigOk };
}

export function floorish(t) { return t === T.FLOOR || t === T.RUG || t === T.BRIDGE; }
export function miceWalkable(t) { return t === T.FLOOR || t === T.RUG || t === T.BRIDGE || t === T.HOLE || t === T.GATE; }
export const BASE_COST = { [T.FLOOR]: 1, [T.RUG]: 1.4, [T.BRIDGE]: 1, [T.HOLE]: 1, [T.GATE]: 1 };
export const goalCells = () => {
  const out = [];
  for (let z = Math.round(HOLE.z0 / CELL); z < Math.round(HOLE.z1 / CELL); z++)
    for (let x = Math.round(HOLE.x0 / CELL); x < Math.round(HOLE.x1 / CELL); x++) out.push(z * W + x);
  return out;
};
