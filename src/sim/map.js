// map.js — Map 1: the castle entrance, at mouse scale.
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
export const WORLD_W = 96, WORLD_H = 120;
export const W = WORLD_W / CELL, H = WORLD_H / CELL;     // 192 x 240 cells

export const T = { FLOOR: 0, ROAD: 1, WATER: 2, BRIDGE: 3, SOLID: 4, GATE: 5, HOLE: 6, STALL: 7 };

// kind 'solid' = block (climbable if low), 'over' = table/bench you walk under
// (legs at the corners), 'roof' = ceiling slab with no legs.
export const FURNITURE = [
  // Outer walls of the castle grounds.
  { name: 'West wall', kind: 'solid', rect: [0, 0, 2, 84],   h: 16, look: 'stone' },
  { name: 'East wall', kind: 'solid', rect: [94, 0, 96, 84], h: 16, look: 'stone' },
  { name: 'Hall wall', kind: 'solid', rect: [2, 0, 94, 2],   h: 16, look: 'hallwall' },
  // Curtain wall with the gatehouse gap.
  { name: 'Curtain wall W', kind: 'solid', rect: [0, 76, 40, 84],  h: 16, look: 'stone' },
  { name: 'Curtain wall E', kind: 'solid', rect: [56, 76, 96, 84], h: 16, look: 'stone' },
  // Gatehouse hall: thick walls each side, high stone roof (camera fits under).
  { name: 'Gatehouse W', kind: 'solid', rect: [28, 58, 40, 76], h: 14, look: 'stone' },
  { name: 'Gatehouse E', kind: 'solid', rect: [56, 58, 68, 76], h: 14, look: 'stone' },
  { name: 'Gatehouse roof', kind: 'roof', rect: [40, 58, 56, 84], bot: 9, top: 14, look: 'tunnelroof' },
  // Courtyard: walls that shape it, a well in the middle, raised walkways each side.
  { name: 'Yard wall SW', kind: 'solid', rect: [2, 56, 28, 58], h: 6, look: 'stone' },
  { name: 'Yard wall SE', kind: 'solid', rect: [68, 56, 94, 58], h: 6, look: 'stone' },
  { name: 'Well', kind: 'solid', rect: [44, 38, 52, 46], h: 3.2, look: 'well' },
  { name: 'West walkway', kind: 'solid', rect: [2, 30, 8, 56], h: 3.0, look: 'walkway' },
  { name: 'East walkway', kind: 'solid', rect: [88, 30, 94, 56], h: 3.0, look: 'walkway' },
  { name: 'Crate', kind: 'solid', rect: [8, 50, 10, 52], h: 1.4, look: 'crate' },     // step up to the walkways
  { name: 'Crate', kind: 'solid', rect: [86, 50, 88, 52], h: 1.4, look: 'crate' },
  { name: 'Crate', kind: 'solid', rect: [52, 44, 54, 46], h: 1.4, look: 'crate' },     // step up onto the well
  // Guardhouse with a roofed passage through the middle; colonnade west, bales east.
  { name: 'Guardhouse W', kind: 'solid', rect: [30, 10, 44, 30], h: 9, look: 'guardhouse' },
  { name: 'Guardhouse E', kind: 'solid', rect: [52, 10, 66, 30], h: 9, look: 'guardhouse' },
  { name: 'Guard passage', kind: 'roof', rect: [44, 10, 52, 30], bot: 7, top: 9, look: 'tunnelroof' },
  { name: 'Colonnade roof', kind: 'over', rect: [10, 8, 26, 30], bot: 7, top: 7.6, look: 'colonnade' },
  { name: 'Barrels', kind: 'solid', rect: [2, 8, 10, 30], h: 3.0, look: 'barrels' },
  { name: 'Hay bales', kind: 'solid', rect: [84, 8, 94, 30], h: 2.6, look: 'bales' },
  { name: 'Cart', kind: 'solid', rect: [72, 14, 78, 22], h: 2.2, look: 'cart' },        // splits the east lane
  // Forest: a hollow log over each road.
  { name: 'Hollow log', kind: 'roof', rect: [16, 102, 26, 110], bot: 4, top: 5, look: 'log' },
  { name: 'Hollow log', kind: 'roof', rect: [70, 102, 80, 110], bot: 4, top: 5, look: 'log' },
];

export const DRAIN = { x0: 0, x1: 96, z0: 84, z1: 92 };            // the moat
export const BRIDGE = { x0: 41, x1: 55, z0: 83.5, z1: 92.5 };       // wide fallen log
export const GATE = { x0: 40, x1: 56, z0: 83, z1: 84 };             // board jammed across the gatehouse mouth
export const HOLE = { x0: 46, x1: 50, z0: 2, z1: 2.5 };              // mouse hole into the great hall (X)
export const CLEARING = { x0: 28, x1: 68, z0: 92, z1: 102 };         // kill room 1, in front of the bridge
// Forest roads (centrelines), 10 wide: from each stump to the clearing.
export const ROADS = [
  [[20, 120], [20, 108], [30, 98]],
  [[76, 120], [76, 108], [66, 98]],
];
export const ROAD_HALF = 5;
export const SPAWNS = [{ x: 20, z: 118.8 }, { x: 76, z: 118.8 }];   // Y1, Y2
export const SPAWN = SPAWNS[0];
export const CAT_SPAWN = { x: 48, z: 8 };
// Tail stashes (trophy lines): sell points.
export const STALLS = [
  { name: 'Hall stash',      rect: [54, 3, 57, 5],    sell: [55.5, 6.5] },
  { name: 'Courtyard stash', rect: [70, 50, 73, 53],  sell: [71.5, 48.5] },
  { name: 'Clearing stash',  rect: [64, 98, 67, 101], sell: [62.5, 99.5] },
];

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
  // Forest zone: solid except roads and the clearing.
  for (let z = Math.round(DRAIN.z1 / CELL); z < H; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x, cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    let open = cx >= CLEARING.x0 && cx < CLEARING.x1 && cz >= CLEARING.z0 && cz < CLEARING.z1;
    for (const road of ROADS) for (let s = 0; s < road.length - 1 && !open; s++) {
      const [ax, az] = road[s], [bx, bz] = road[s + 1];
      if (distToSeg(cx, cz, ax, az, bx, bz) < ROAD_HALF) open = true;
    }
    if (open) type[i] = T.ROAD;
    else { type[i] = T.SOLID; solid[i] = 5; forest[i] = 1; }
  }
  eachCell([DRAIN.x0, DRAIN.z0, DRAIN.x1, DRAIN.z1], i => { type[i] = T.WATER; solid[i] = 0; forest[i] = 0; });
  eachCell([BRIDGE.x0, BRIDGE.z0, BRIDGE.x1, BRIDGE.z1], i => { type[i] = T.BRIDGE; solid[i] = 0; forest[i] = 0; });

  FURNITURE.forEach((f, fi) => {
    if (f.kind === 'solid') {
      eachCell(f.rect, i => { type[i] = T.SOLID; solid[i] = Math.max(solid[i], f.h); furn[i] = fi; forest[i] = 0; });
    } else {
      const [x0, z0, x1, z1] = f.rect;
      const cx0 = Math.round(x0 / CELL), cx1 = Math.round(x1 / CELL) - 1, cz0 = Math.round(z0 / CELL), cz1 = Math.round(z1 / CELL) - 1;
      eachCell(f.rect, (i, x, z) => {
        if (type[i] === T.SOLID && f.kind === 'roof') return;     // roofs don't override walls
        slabBot[i] = f.bot; slabTop[i] = f.top; furn[i] = fi;
        // Colonnade: pillars every 4 units along both long sides.
        if (f.kind === 'over' && (x === cx0 || x === cx1 || x === cx0 + 1 || x === cx1 - 1) && (z - cz0) % 8 < 2) { type[i] = T.SOLID; solid[i] = f.top; }
      });
    }
  });
  eachCell([GATE.x0, GATE.z0, GATE.x1, GATE.z1], i => { type[i] = T.GATE; solid[i] = 0; });
  eachCell([HOLE.x0, HOLE.z0, HOLE.x1, HOLE.z1], i => { type[i] = T.HOLE; solid[i] = 0; });
  STALLS.forEach(s => eachCell(s.rect, i => { type[i] = T.STALL; solid[i] = 2.2; }));

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
    let ok = true;
    for (const [dx, dz] of DIRS4) { const n = (z + dz) * W + x + dx; if (!miceWalkable(type[n])) { ok = false; break; } }
    if (ok) bigOk[i] = 1;
  }
  return { type, solid, slabBot, slabTop, furn, covered, wallDir, bigOk, forest };
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
