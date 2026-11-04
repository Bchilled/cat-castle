// path.js — "path of least resistance" for mice.
// Why a flow field: one Dijkstra pass from the exit gives every cell its
// cost-to-goal, so hundreds of mice steer by just looking at their neighbours.
// Rebuilt whenever a barricade/trap/gate changes.
//
// Cost of entering a cell = base terrain cost + danger from traps on it
// + chew cost for blockers (gate, barricades). Two flows exist: one for normal
// mice and one for big bosses, who can't fit under low benches or through
// one-cell gaps.

import { W, H, miceWalkable, BASE_COST } from './map.js';

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
            [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// Minimal binary heap keyed on distance. Why hand-rolled: no dependencies.
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

// opts: goals[] cells, pass(i) can stand here, extra(i) added cost,
// blocked(i) chewable blocker (no diagonal squeezing past its corners),
// wall(i) treat as impassable (used for the "don't seal every route" check).
export function computeFlow(map, { goals, pass = (i) => miceWalkable(map.type[i]), extra = () => 0, blocked = () => false, wall = () => false }) {
  const dist = new Float32Array(W * H).fill(Infinity);
  const ok = (j) => pass(j) && !wall(j);
  const open = (j) => ok(j) && !blocked(j);
  const heap = new Heap();
  for (const g of goals) { dist[g] = 0; heap.push(g, 0); }
  while (heap.size) {
    const i = heap.pop();
    const x = i % W, z = (i / W) | 0, d = dist[i];
    // Cost is paid ENTERING cell i, so walking backwards from the goal a
    // neighbour n reaches i at cost(i).
    const stepCost = (BASE_COST[map.type[i]] || 1) + extra(i);
    for (const [dx, dz, mul] of NB) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nz * W + nx;
      if (!ok(n)) continue;
      if (dx && dz && (!open(z * W + nx) || !open(nz * W + x))) continue;   // no corner cutting
      const nd = d + stepCost * mul;
      if (nd < dist[n]) { dist[n] = nd; heap.push(n, nd); }
    }
  }
  return dist;
}

// Pick the neighbour a mouse on cell i should head to next.
export function nextCell(map, dist, i, pass, blocked) {
  const x = i % W, z = (i / W) | 0;
  const open = (j) => pass(j) && !blocked(j);
  let best = -1, bd = dist[i];
  for (const [dx, dz] of NB) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
    const n = nz * W + nx;
    if (!pass(n)) continue;
    if (dx && dz && (!open(z * W + nx) || !open(nz * W + x))) continue;
    if (dist[n] < bd) { bd = dist[n]; best = n; }
  }
  return best;
}

// Nearest reachable cell (BFS) — where cheese from stranded mice lands.
export function nearestReachable(dist, start) {
  if (start < 0) return -1;
  const seen = new Uint8Array(W * H); const q = [start]; seen[start] = 1;
  for (let h = 0; h < q.length && h < 20000; h++) {
    const i = q[h];
    if (dist[i] < Infinity) return i;
    const cx = i % W, cz = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nz * W + nx; if (!seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return -1;
}
