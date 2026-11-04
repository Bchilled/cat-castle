// map.js — the castle map, built from Brent's sketch as a tile grid.
// Why a grid: pathfinding, trap placement and physics collisions all become
// simple array lookups, and the same grid drives the 3D scene.
//
// Layout (top-down, +z is south, toward the forest):
//   Mice spawn at Y on the forest road (bottom right), walk the dirt road,
//   cross the drawbridge over the moat, break the gate, then weave between
//   the courtyard buildings to the kitchen mouse hole X (top-left corner).

export const W = 48;   // cells across (x)
export const H = 82;   // cells deep (z)

export const T = {
  VOID: 0, GRASS: 1, ROAD: 2, FLOOR: 3, WATER: 4, BRIDGE: 5,
  WALL: 6, BUILDING: 7, TREE: 8, ROCK: 9, GATE: 10, HOLE: 11, STALL: 12,
};

// Courtyard buildings — positions copied from the confirmed sketch.
// Rects are [x0, z0, x1, z1) in cells. All solid; barricades go in the gaps.
export const BUILDINGS = [
  { name: 'Stables',    rect: [11, 9, 22, 14],  height: 3.0, color: 0x7a5a3c, roof: 0x5a3b26 },
  { name: 'Blacksmith', rect: [26, 6, 37, 13],  height: 3.4, color: 0x5d5a55, roof: 0x3b3835, chimney: true },
  { name: 'Well house', rect: [17, 17, 26, 21], height: 2.6, color: 0x8b8072, roof: 0x6b4a32 },
  { name: 'Chapel',     rect: [10, 21, 14, 30], height: 5.0, color: 0x9a9286, roof: 0x4a4a52, steeple: true },
  { name: 'Barracks',   rect: [31, 18, 41, 26], height: 3.2, color: 0x6e6252, roof: 0x4b3a2c },
];

export const CASTLE = { x0: 3, z0: 3, x1: 44, z1: 34 };   // wall ring (inclusive edges)
export const GATE_CELLS = [22, 23, 24, 25];                 // x cells on the south wall row
export const BRIDGE = { x0: 22, x1: 26, z0: 35, z1: 42 };   // moat crossing
export const HOLE = { x: 4, z: 4 };                         // kitchen mouse hole (X)
export const STALL = { x: 4, z0: 8, z1: 11, sellX: 5.2, sellZ: 9.5 }; // cheese stall on the west wall
export const SPAWN = { x: 35.5, z: 80.5 };                  // Y
export const CAT_SPAWN = { x: 6.5, z: 9.5 };                // cats respawn beside the stall

// Dirt road from the bridge down to Y (follows the curve in the sketch).
const ROAD_PTS = [[24, 42], [24, 50], [30, 58], [36, 66], [35.5, 82]];
const TREES = [[6, 58], [14, 66], [17, 53], [40, 50], [44, 60], [43, 73], [8, 74], [27, 75], [4, 50], [20, 78], [46, 79]];
const ROCKS = [[6, 44], [14, 45], [31, 45], [38, 44], [44, 46], [18, 44]];

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

// Build the grid once. Returns typed arrays so lookups stay fast.
export function buildMap() {
  const type = new Uint8Array(W * H);
  const height = new Float32Array(W * H);     // solid height for physics
  const building = new Int8Array(W * H).fill(-1);

  const set = (x, z, t, h = 0) => { const i = z * W + x; type[i] = t; height[i] = h; };

  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (z <= 41) set(x, z, T.WATER, 0);      // island + moat zone
      else set(x, z, T.GRASS, 0);              // forest bank
    }
  }
  // Road (only on the bank side).
  for (let z = 42; z < H; z++) for (let x = 0; x < W; x++) {
    const cx = x + 0.5, cz = z + 0.5;
    for (let s = 0; s < ROAD_PTS.length - 1; s++) {
      const [ax, az] = ROAD_PTS[s], [bx, bz] = ROAD_PTS[s + 1];
      if (distToSeg(cx, cz, ax, az, bx, bz) < 2.1) { set(x, z, T.ROAD); break; }
    }
  }
  for (const [x, z] of TREES) set(x, z, T.TREE, 4);
  for (const [x, z] of ROCKS) set(x, z, T.ROCK, 0.9);

  // Castle: wall ring, courtyard floor.
  const { x0, z0, x1, z1 } = CASTLE;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    set(x, z, edge ? T.WALL : T.FLOOR, edge ? 4 : 0);
  }
  for (const gx of GATE_CELLS) set(gx, z1, T.GATE, 4);
  for (let z = BRIDGE.z0; z < BRIDGE.z1; z++) for (let x = BRIDGE.x0; x < BRIDGE.x1; x++) set(x, z, T.BRIDGE, 0);

  BUILDINGS.forEach((b, bi) => {
    const [bx0, bz0, bx1, bz1] = b.rect;
    for (let z = bz0; z < bz1; z++) for (let x = bx0; x < bx1; x++) {
      set(x, z, T.BUILDING, b.height); building[z * W + x] = bi;
    }
  });
  set(HOLE.x, HOLE.z, T.HOLE, 0);
  for (let z = STALL.z0; z < STALL.z1; z++) set(STALL.x, z, T.STALL, 1.1);

  // Derived flags for trap placement.
  const covered = new Uint8Array(W * H);   // has a roof/awning overhead -> ceiling traps
  const wallSide = new Int8Array(W * H).fill(-1); // index 0..3 of an adjacent wall -> wall traps
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x;
    if (type[i] !== T.FLOOR) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS4[d][0], nz = z + DIRS4[d][1];
      const nt = type[nz * W + nx];
      if (nt === T.WALL || nt === T.BUILDING) { if (wallSide[i] < 0) wallSide[i] = d; covered[i] = 1; }
    }
  }
  return { type, height, building, covered, wallSide };
}

export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const idx = (x, z) => z * W + x;
export const inBounds = (x, z) => x >= 0 && z >= 0 && x < W && z < H;

// Tiles a mouse can stand on (gate/barricades are handled as chewable blockers).
export function miceWalkable(t) {
  return t === T.GRASS || t === T.ROAD || t === T.FLOOR || t === T.BRIDGE || t === T.HOLE || t === T.GATE;
}
export function floorTrapOk(t) {
  return t === T.GRASS || t === T.ROAD || t === T.FLOOR || t === T.BRIDGE;
}
export const BASE_COST = { [T.ROAD]: 1, [T.FLOOR]: 1, [T.BRIDGE]: 1, [T.HOLE]: 1, [T.GATE]: 1, [T.GRASS]: 2.2 };
