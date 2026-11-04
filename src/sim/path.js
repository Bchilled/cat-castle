// path.js — "path of least resistance" for mice.
// Why a flow field: one Dijkstra pass from the kitchen hole gives every tile
// its cost-to-goal, so hundreds of mice can steer by just looking at their
// neighbours. It's rebuilt whenever a barricade/trap/gate changes.
//
// Cost of entering a tile = base terrain cost + danger from traps on it
// + chew cost for blockers (gate, barricades). Blockers are never "walls" to
// the field — if you seal every lane, mice route to the weakest barricade and
// chew through it instead of getting stuck.

import { W, H, T, idx, miceWalkable, BASE_COST, HOLE } from './map.js';

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
            [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// Minimal binary heap keyed on dist[]. Why hand-rolled: no dependencies.
class Heap {
  constructor() { this.a = []; this.k = []; }
  push(v, key) {
    const a = this.a, k = this.k; a.push(v); k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1; if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, k = this.k, top = a[0];
    const lv = a.pop(), lk = k.pop();
    if (a.length) {
      a[0] = lv; k[0] = lk; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

// extraCost(i) -> added cost for traps/blockers on tile i.
// blocked(i) -> true for chewable blockers (gate, barricades). They can be
// chewed through head-on, but mice can't squeeze diagonally past their corners.
export function computeFlow(map, extraCost, blocked = () => false) {
  const open = (j) => miceWalkable(map.type[j]) && !blocked(j);
  const dist = new Float32Array(W * H).fill(Infinity);
  const goal = idx(HOLE.x, HOLE.z);
  dist[goal] = 0;
  const heap = new Heap();
  heap.push(goal, 0);
  while (heap.size) {
    const i = heap.pop();
    const x = i % W, z = (i / W) | 0, d = dist[i];
    // Cost is paid when ENTERING tile i coming from neighbour n, so we walk
    // backwards from the goal: neighbour n reaches i at cost(i).
    const stepCost = (BASE_COST[map.type[i]] || 1) + extraCost(i);
    for (const [dx, dz, mul] of NB) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nz * W + nx;
      if (!miceWalkable(map.type[n])) continue;
      // No diagonal corner-cutting past solid tiles.
      if (dx && dz && (!open(z * W + nx) || !open(nz * W + x))) continue;
      const nd = d + stepCost * mul;
      if (nd < dist[n]) { dist[n] = nd; heap.push(n, nd); }
    }
  }
  return dist;
}

// Pick the neighbour a mouse on tile i should head to next.
export function nextTile(map, dist, i, blocked = () => false) {
  const open = (j) => miceWalkable(map.type[j]) && !blocked(j);
  const x = i % W, z = (i / W) | 0;
  let best = -1, bd = dist[i];
  for (const [dx, dz] of NB) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
    const n = nz * W + nx;
    if (!miceWalkable(map.type[n])) continue;
    if (dx && dz && (!open(z * W + nx) || !open(nz * W + x))) continue;
    if (dist[n] < bd) { bd = dist[n]; best = n; }
  }
  return best;
}

// Nearest tile (BFS) a mouse/cat could actually reach — used to drop cheese
// from mice that die stranded on roofs or rocks.
export function nearestReachable(map, dist, x, z) {
  const sx = Math.max(0, Math.min(W - 1, Math.floor(x))), sz = Math.max(0, Math.min(H - 1, Math.floor(z)));
  const seen = new Uint8Array(W * H); const q = [sz * W + sx]; seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (dist[i] < Infinity && map.type[i] !== T.GATE) return i;
    const cx = i % W, cz = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nz * W + nx; if (!seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return -1;
}
