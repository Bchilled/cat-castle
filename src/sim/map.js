// map.js — Map 1: the castle entrance, at mouse scale, built as walled lanes.
// Layout (top-down, +z runs south toward the forest):
//   Y  arched mouse hole in a tree stump at the bottom of the forest.
//      A walled forest road (roots, rocks, trunks) winds north; one stretch
//      runs through a hollow log (roofed).
//      The moat: real water, crossed on a fallen branch.
//      The castle wall, with a wooden board jammed in the portcullis gap (gate).
//      The gatehouse tunnel: stone walls both sides, stone roof overhead.
//      The guard yard: the route splits around the guardhouse — left lane runs
//      under a long bench (roofed) with barrels as its outer wall, right lane
//      runs between the guardhouse and a row of hay bales.
//      Both lanes meet under a stone arch at the top and reach
//   X  an arched mouse hole in the great hall wall.
// Every stretch has walls on both sides and most have a roof, so floor, wall
// and ceiling traps all have places to go. Barrels and bales are cat walkways.
//
// Grid: each cell is half a world unit, so traps fit in quarters and sit flush
// against walls. 1 world unit ≈ 30 cm.

export const CELL = 0.5;
export const WORLD_W = 48, WORLD_H = 80;
export const W = WORLD_W / CELL, H = WORLD_H / CELL;     // 96 x 160 cells

export const T = { FLOOR: 0, ROAD: 1, WATER: 2, BRIDGE: 3, SOLID: 4, GATE: 5, HOLE: 6, STALL: 7 };

// kind 'solid' = block (climbable if low), 'over' = table/bench you walk under
// (legs at the corners), 'roof' = ceiling slab with no legs (tunnel/arch/log).
export const FURNITURE = [
  // Outer stone walls of the yard.
  { name: 'West wall',   kind: 'solid', rect: [0, 0, 1, 44],   h: 14, look: 'stone' },
  { name: 'East wall',   kind: 'solid', rect: [47, 0, 48, 44], h: 14, look: 'stone' },
  { name: 'Hall wall',   kind: 'solid', rect: [1, 0, 47, 1],   h: 14, look: 'hallwall' },
  // Castle front wall + gatehouse masonry (the tunnel runs through it).
  { name: 'Curtain wall W', kind: 'solid', rect: [0, 44, 22, 50],  h: 14, look: 'stone' },
  { name: 'Curtain wall E', kind: 'solid', rect: [26, 44, 48, 50], h: 14, look: 'stone' },
  { name: 'Gatehouse W',    kind: 'solid', rect: [17, 31, 22, 44], h: 12, look: 'stone' },
  { name: 'Gatehouse E',    kind: 'solid', rect: [26, 31, 31, 44], h: 12, look: 'stone' },
  { name: 'Tunnel roof',    kind: 'roof',  rect: [22, 31, 26, 50], bot: 3.2, top: 12, look: 'tunnelroof' },
  // Guard yard.
  { name: 'Guardhouse',  kind: 'solid', rect: [16, 10, 32, 24], h: 6,   look: 'guardhouse' },
  { name: 'Barrels',     kind: 'solid', rect: [1, 6, 8, 28],    h: 2.6, look: 'barrels' },
  { name: 'Hay bales',   kind: 'solid', rect: [40, 6, 47, 28],  h: 2.2, look: 'bales' },
  { name: 'Long bench',  kind: 'over',  rect: [8.5, 11, 15.5, 23], bot: 1.3, top: 1.6, look: 'bench' },
  { name: 'Stone arch',  kind: 'roof',  rect: [4, 1, 22, 6],    bot: 3.0, top: 4.0, look: 'arch' },
  { name: 'Yard wall W', kind: 'solid', rect: [1, 28, 17, 31],  h: 5, look: 'stone' },
  { name: 'Yard wall E', kind: 'solid', rect: [31, 28, 47, 31], h: 5, look: 'stone' },
  // Forest: hollow log over part of the road.
  { name: 'Hollow log',  kind: 'roof',  rect: [21, 58, 27, 64], bot: 2.2, top: 3.0, look: 'log' },   // tall enough for bosses
];

export const DRAIN = { x0: 0, x1: 48, z0: 50, z1: 56 };          // the moat
export const BRIDGE = { x0: 22, x1: 26, z0: 49.5, z1: 56.5 };     // fallen branch
export const GATE = { x0: 22, x1: 26, z0: 49, z1: 50 };           // board jammed in the portcullis gap
export const HOLE = { x0: 9, x1: 12, z0: 1, z1: 1.5 };             // arched mouse hole into the great hall (X)
export const ROAD_PTS = [[36, 80], [36, 72], [24, 66], [24, 56]];  // forest road centreline
export const ROAD_HALF = 3;                                        // road half-width
export const SPAWN = { x: 36, z: 78.8 };                          // arched hole in a tree stump (Y)
export const CAT_SPAWN = { x: 14, z: 7 };
// Tail stashes (trophy lines): sell points.
export const STALLS = [
  { name: 'Hall stash',   rect: [17, 2, 19, 4],     sell: [17.5, 5.2] },
  { name: 'Tunnel stash', rect: [33, 25, 35, 27],   sell: [33.5, 27.8] },
  { name: 'Road stash',   rect: [27, 57, 28.5, 58.5], sell: [26.2, 58] },
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
  const forest = new Uint8Array(N);   // which solid cells are forest (for drawing trees/rocks)
  const eachCell = ([x0, z0, x1, z1], fn) => {
    for (let z = Math.round(z0 / CELL); z < Math.round(z1 / CELL); z++)
      for (let x = Math.round(x0 / CELL); x < Math.round(x1 / CELL); x++)
        if (x >= 0 && z >= 0 && x < W && z < H) fn(z * W + x, x, z);
  };
  // Forest zone: solid everywhere except the road.
  for (let z = Math.round(DRAIN.z1 / CELL); z < H; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x, cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    let onRoad = false;
    for (let s = 0; s < ROAD_PTS.length - 1; s++) {
      const [ax, az] = ROAD_PTS[s], [bx, bz] = ROAD_PTS[s + 1];
      if (distToSeg(cx, cz, ax, az, bx, bz) < ROAD_HALF) { onRoad = true; break; }
    }
    if (onRoad) type[i] = T.ROAD;
    else { type[i] = T.SOLID; solid[i] = 5; forest[i] = 1; }
  }
  eachCell([DRAIN.x0, DRAIN.z0, DRAIN.x1, DRAIN.z1], i => { type[i] = T.WATER; solid[i] = 0; forest[i] = 0; });
  eachCell([BRIDGE.x0, BRIDGE.z0, BRIDGE.x1, BRIDGE.z1], i => { type[i] = T.BRIDGE; solid[i] = 0; forest[i] = 0; });

  FURNITURE.forEach((f, fi) => {
    if (f.kind === 'solid') {
      eachCell(f.rect, i => { type[i] = T.SOLID; solid[i] = Math.max(solid[i], f.h); furn[i] = fi; });
    } else {
      const [x0, z0, x1, z1] = f.rect;
      const cx0 = Math.round(x0 / CELL), cx1 = Math.round(x1 / CELL) - 1, cz0 = Math.round(z0 / CELL), cz1 = Math.round(z1 / CELL) - 1;
      eachCell(f.rect, (i, x, z) => {
        if (type[i] === T.SOLID && f.kind === 'roof') return;     // roofs don't override walls
        slabBot[i] = f.bot; slabTop[i] = f.top; furn[i] = fi;
        if (f.kind === 'over' && (x === cx0 || x === cx1) && (z === cz0 || z === cz1)) { type[i] = T.SOLID; solid[i] = f.top; }
      });
    }
  });
  eachCell([GATE.x0, GATE.z0, GATE.x1, GATE.z1], i => { type[i] = T.GATE; solid[i] = 0; });
  eachCell([HOLE.x0, HOLE.z0, HOLE.x1, HOLE.z1], i => { type[i] = T.HOLE; solid[i] = 0; });
  STALLS.forEach(s => eachCell(s.rect, i => { type[i] = T.STALL; solid[i] = 2.2; }));   // trophy line frame: collider matches the art

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
