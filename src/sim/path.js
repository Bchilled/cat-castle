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

// Binary heap on typed arrays (ids + keys). Why hand-rolled: no dependencies,
// and typed arrays keep a 46k-cell map fast enough to re-path instantly.
class Heap {
  constructor(cap = 1 << 16) { this.ids = new Int32Array(cap); this.keys = new Float32Array(cap); this.n = 0; }
  push(v, key) {
    if (this.n === this.ids.length) { const a = new Int32Array(this.n * 2), b = new Float32Array(this.n * 2); a.set(this.ids); b.set(this.keys); this.ids = a; this.keys = b; }
    const ids = this.ids, keys = this.keys; let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= key) break; ids[i] = ids[p]; keys[i] = keys[p]; i = p; }
    ids[i] = v; keys[i] = key;
  }
  pop() {
    const ids = this.ids, keys = this.keys, top = ids[0], n = --this.n;
    if (n > 0) {
      const v = ids[n], key = keys[n]; let i = 0;
      for (;;) {
        let c = i * 2 + 1; if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        ids[i] = ids[c]; keys[i] = keys[c]; i = c;
      }
      ids[i] = v; keys[i] = key;
    }
    return top;
  }
  get size() { return this.n; }
}

// opts: goals[] cells, pass(i) can stand here, extra(i) added cost,
// blocked(i) chewable blocker (no diagonal squeezing past its corners),
// wall(i) treat as impassable (used for the "don't seal every route" check).
// Speed: the callbacks are sampled once per cell into typed arrays first, then the
// Dijkstra loop only touches arrays (about 4x faster than calling closures 8x per cell,
// which matters because doors, barricades and route choices re-path mid-wave).
const NDX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]), NDZ = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const NMUL = new Float32Array([1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414]);
let heap = null;   // reused between calls (no garbage)
export function computeFlow(map, { goals, pass = (i) => miceWalkable(map.type[i]), extra = () => 0, blocked = () => false, wall = () => false }) {
  const N = W * H, dist = new Float32Array(N).fill(Infinity);
  const okA = new Uint8Array(N), openA = new Uint8Array(N), cost = new Float32Array(N), type = map.type;
  for (let j = 0; j < N; j++) {
    if (!pass(j) || wall(j)) continue;
    okA[j] = 1; if (!blocked(j)) openA[j] = 1;
    cost[j] = (BASE_COST[type[j]] || 1) + extra(j);
  }
  if (!heap) heap = new Heap(); heap.n = 0;
  for (const g of goals) { dist[g] = 0; heap.push(g, 0); }
  while (heap.n) {
    const key = heap.keys[0], i = heap.pop();
    if (key > dist[i]) continue;   // stale entry
    const x = i % W, z = (i / W) | 0, d = dist[i];
    // Cost is paid ENTERING cell i, so walking backwards from the goal a
    // neighbour n reaches i at cost(i).
    const stepCost = cost[i] || ((BASE_COST[type[i]] || 1) + extra(i));   // goal cells may not pass()
    for (let k = 0; k < 8; k++) {
      const dx = NDX[k], dz = NDZ[k], nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nz * W + nx;
      if (!okA[n]) continue;
      if (k >= 4 && (!openA[z * W + nx] || !openA[nz * W + x])) continue;   // no corner cutting
      // Round to float32 before comparing: dist is a Float32Array, and comparing a double
      // against its own rounded copy re-pushed "equal" paths over and over (a 30-second
      // re-path once costs got big with Poison Box mazes and danger).
      const nd = Math.fround(d + stepCost * NMUL[k]);
      if (nd < dist[n]) { dist[n] = nd; heap.push(n, nd); }
    }
  }
  return dist;
}

// Pick the neighbour a mouse on cell i should head to next.
// Pick the neighbour a mouse on cell i should head to next: the one that makes the
// cheapest total (its distance + the cost of stepping into it). Counting the step cost
// matters: a Poison Box cell's own distance can be low, but stepping into it is dear,
// so mice walk round a maze instead of trying to chew through it.
export function nextCell(map, dist, i, pass, blocked, extra = () => 0) {
  if (!(dist[i] > 0)) return -1;
  const x = i % W, z = (i / W) | 0;
  const open = (j) => pass(j) && !blocked(j);
  let best = -1, bd = Infinity;
  for (const [dx, dz, mul] of NB) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
    const n = nz * W + nx;
    if (!pass(n) || !(dist[n] < Infinity)) continue;
    if (dx && dz && (!open(z * W + nx) || !open(nz * W + x))) continue;
    const sc = dist[n] + ((BASE_COST[map.type[n]] || 1) + extra(n)) * (mul || 1);
    if (sc < bd) { bd = sc; best = n; }
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
