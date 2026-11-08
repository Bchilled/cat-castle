// dress.js — builds each map out of the model kit (v0.30): stone and timber walls in modules,
// flagstone or plank floors on the trap grid (one stone per tile), real barrels, crates,
// sacks, tables, benches and worktops, roofs on the buildings, battlements on the castle,
// and the clutter piles. Only looks: the sim's map (collision, routes) is untouched; every
// model sits inside the rect the sim already uses for that thing.
//
// Walls are 10x10-unit modules (3 m): a wall is cut into a whole number of modules, each
// stretched a little to fit exactly, stacked as high as the wall is. Thin walls get one
// run of modules through their middle (both faces show); big blocks get modules round
// their sides and a roof or battlements on top.

import * as THREE from 'three';
import { KitBatch, KIT } from './kit.js';
import { tmat } from './textures.js';
import { MAP, FURNITURE, HOLE, W, H, CELL, T, WORLD_W, WORLD_H, SPAWNS } from '../sim/map.js';

// Looks the kit draws (the scene skips its own box models for these).
export const KIT_LOOKS = new Set(['stone', 'hallwall', 'guardhouse', 'house', 'plaster', 'barrels', 'crate', 'sacks', 'bucket', 'rack', 'table', 'counter', 'bench', 'pile', 'pillar']);
const WALL_STYLE = { stone: 'castle', hallwall: 'castle', guardhouse: 'building', house: 'building', plaster: 'plaster' };

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
// Weighted pick: [[name, weight], ...]
const wpick = (R, list) => { let s = 0; for (const [, w] of list) s += w; let r = R() * s; for (const [n, w] of list) { if ((r -= w) <= 0) return n; } return list[0][0]; };

// Which module goes where, by wall style and row (row 0 is at the floor).
const MODULES = {
  castle: (R, row, rows) => row === 0 ? wpick(R, [['wall', 70], ['wall_cracked', 10], ['wall_pillar', 12], ['wall_archedwindow_gated', 4], ['wall_arched', 4]])
    : wpick(R, [['wall', 80], ['wall_pillar', 8], ['wall_archedwindow_gated', row === rows - 1 ? 0 : 12]]),
  building: (R, row) => row === 0 ? wpick(R, [['wall_scaffold', 45], ['wall_window_closed_scaffold', 40], ['wall_doorway_scaffold', 15]])
    : wpick(R, [['wall_window_closed_scaffold', 55], ['wall_scaffold', 45]]),
  plaster: (R, row) => row === 0 ? wpick(R, [['wall', 60], ['wall_shelves', 14], ['wall_pillar', 14], ['wall_cracked', 6], ['wall_arched', 6]]) : wpick(R, [['wall', 85], ['wall_pillar', 15]]),
};

export function dressMap(parent, sim) {
  const R = rng([...MAP.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const b = new KitBatch(), map = sim.map;
  const solidH = (x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); if (cx < 0 || cz < 0 || cx >= W || cz >= H) return 99; const i = cz * W + cx; return map.type[i] === T.SOLID ? map.solid[i] : map.forest[i] ? 5 : 0; };
  const holeX = (HOLE.x0 + HOLE.x1) / 2;

  // ---------- floors: one flagstone (or plank board) per 2x2-unit trap tile ----------
  const FLOOR = { cobbles: 'stone', stone: 'stone', planks: 'wood', dirt: null }[MAP.floor];
  if (FLOOR) {
    const outdoor = MAP.birds !== false && !MAP.dark;
    for (let tz = 0; tz < WORLD_H / 2; tz++) for (let tx = 0; tx < WORLD_W / 2; tx++) {
      let open = 0;
      for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) {
        const i = (tz * 4 + dz) * W + tx * 4 + dx, t = map.type[i];
        if (t !== T.SOLID && t !== T.WATER && !map.forest[i] && t !== T.ROAD) open++;
      }
      if (open < 6) continue;
      const x = tx * 2 + 1, z = tz * 2 + 1;
      if (FLOOR === 'wood') b.put(R() < 0.25 ? 'floor_wood_large_dark' : 'floor_wood_large', x, -0.125, z, (tx + tz) % 2 ? Math.PI / 2 : 0, 0.2, 1, 0.2);
      else b.put(outdoor && R() < 0.03 ? 'floor_tile_small_weeds_A' : 'floor_tile_small', x, -0.125, z, Math.floor(R() * 4) * Math.PI / 2, 0.4, 1, 0.4);
    }
  }

  // ---------- walls ----------
  // A run of modules from a to b along an axis ('x' or 'z') through the line c, t thick.
  // Anchors are modules that must sit at a given spot (the door over the exit hole).
  const run = (axis, a, bnd, c, t, h, style, anchors = []) => {
    const rows = Math.max(1, Math.round(h / 10)), sy = h / (rows * 10), sz = t / 2.5;
    const segs = []; let from = a;
    for (const an of anchors.filter(q => q.at > a && q.at < bnd).sort((p, q) => p.at - q.at)) { segs.push([from, an.at - 5]); from = an.at + 5; place(an.at, an.name, 1); }
    segs.push([from, bnd]);
    function place(mid, name, sx) {
      for (let r = 0; r < rows; r++) {
        const nm = r === 0 && name ? name : MODULES[style](R, r, rows);
        if (r === 0 && (nm === 'wall' || nm === 'wall_scaffold') && sx * 10 > 6) spots.push({ axis, mid, c, t, style, sy });
        if (axis === 'x') b.put(nm, mid, r * 10 * sy, c, 0, sx, sy, sz); else b.put(nm, c, r * 10 * sy, mid, Math.PI / 2, sx, sy, sz);
      }
    }
    for (const [s0, s1] of segs) {
      const L = s1 - s0; if (L < 1) continue;
      const n = Math.max(1, Math.round(L / 10)), sx = L / (n * 10);
      for (let k = 0; k < n; k++) place(s0 + (k + 0.5) * L / n, null, sx);
    }
  };
  const handled = new Set(), spots = [];
  for (const f of FURNITURE) {
    if (!KIT_LOOKS.has(f.look) || f.kind !== 'solid' || f.stairs) continue;
    handled.add(f);
    const [x0, z0, x1, z1] = f.rect, w = x1 - x0, d = z1 - z0, h = f.visH || f.h, style = WALL_STYLE[f.look];
    if (style) {
      // The exit door: the wall the hole is in gets a doorway module right over the hole.
      const anchorsX = (Math.abs(z1 - HOLE.z0) < 0.6 && holeX > x0 && holeX < x1) ? [{ at: holeX, name: 'wall_doorway' }] : [];
      if (Math.min(w, d) <= 3.5) {
        if (w >= d) run('x', x0, x1, (z0 + z1) / 2, d, h, style, anchorsX); else run('z', z0, z1, (x0 + x1) / 2, w, h, style);
      } else {
        // Each side that something could see (not up against an equally tall neighbour or the map edge).
        const open = (pts) => pts.some(([x, z]) => solidH(x, z) < h - 0.5);
        const along = (n) => Array.from({ length: n }, (_, k) => (k + 0.5) / n);
        if (open(along(5).map(t => [x0 + w * t, z0 - 0.25]))) run('x', x0, x1, z0 + 0.5, 1, h, style);
        if (open(along(5).map(t => [x0 + w * t, z1 + 0.25]))) run('x', x0, x1, z1 - 0.5, 1, h, style, anchorsX);
        if (open(along(5).map(t => [x0 - 0.25, z0 + d * t]))) run('z', z0, z1, x0 + 0.5, 1, h, style);
        if (open(along(5).map(t => [x1 + 0.25, z0 + d * t]))) run('z', z0, z1, x1 - 0.5, 1, h, style);
        topOf(parent, f, style, R);
      }
      continue;
    }
    // ---------- things filling their rect ----------
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, yawR = () => (R() - 0.5) * 0.5;
    const grid = (sx, sz, fn) => { const nx = Math.max(1, Math.floor(w / sx)), nz = Math.max(1, Math.floor(d / sz)); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) fn(x0 + (i + 0.5) * w / nx, z0 + (j + 0.5) * d / nz); };
    switch (f.look) {
      case 'barrels': grid(2.6, 2.6, (x, z) => b.put(R() < 0.2 ? 'barrel_small_stack' : 'barrel_small', x, 0, z, R() * 6.3, 1, Math.min(1.2, h / 2.5), 1)); break;
      case 'crate': { const s = Math.max(0.45, Math.min(1.2, h / 2.5)); grid(2.5 * s, 2.5 * s, (x, z) => b.put(R() < 0.3 ? 'box_small_decorated' : 'box_small', x, 0, z, Math.floor(R() * 4) * Math.PI / 2 + yawR() * 0.3, s)); break; }
      case 'sacks': { const layers = Math.max(1, Math.round(h / 0.7)); grid(1.5, 2.1, (x, z) => { for (let l = 0; l < layers; l++) b.put('sack', x + (R() - 0.5) * 0.3, l * 0.68, z + (R() - 0.5) * 0.3, R() < 0.5 ? 0 : Math.PI, 1, 1, 1); }); break; }
      case 'bucket': b.put('bucket_water', cx, 0, cz, R() * 6.3, Math.min(w, d) / 1.26); break;
      case 'rack': { const L = Math.max(w, d), n = Math.max(1, Math.round(L / 4.2)); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; if (w >= d) b.put('weaponrack', x0 + w * t, 0, cz, 0, L / (n * 4.2), h / 5, 1); else b.put('weaponrack', cx, 0, z0 + d * t, Math.PI / 2, L / (n * 4.2), h / 5, 1); } break; }
      case 'pile': pile(b, f, R); break;
      case 'pillar': b.put('pillar_decorated', cx, 0, cz, 0, w / 3.75, h / 10, d / 3.75); break;
    }
  }
  // Tables, worktops and benches ('over' furniture: mice run underneath).
  for (const f of FURNITURE) {
    if (f.kind !== 'over' || !['table', 'counter', 'bench'].includes(f.look)) continue;
    handled.add(f);
    const [x0, z0, x1, z1] = f.rect, w = x1 - x0, d = z1 - z0, alongX = w >= d, L = alongX ? w : d, S = alongX ? d : w;
    const model = f.look === 'bench' ? 'bench' : 'table_long', mw = f.look === 'bench' ? 1.875 : 5, ml = f.look === 'bench' ? 5 : 10, mh = f.look === 'bench' ? 1.25 : 2.5;
    const n = Math.max(1, Math.round(L / ml));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = alongX ? x0 + w * t : (x0 + x1) / 2, z = alongX ? (z0 + z1) / 2 : z0 + d * t;
      // table_long runs along its own z; the bench along its own x.
      const yaw = f.look === 'bench' ? (alongX ? 0 : Math.PI / 2) : (alongX ? Math.PI / 2 : 0);
      if (f.look === 'bench') b.put('bench', x, 0, z, yaw, L / (n * ml), f.top / mh, S / mw);
      else b.put(R() < 0.3 ? 'table_long_decorated_A' : model, x, 0, z, yaw, S / mw, f.top / mh, L / (n * ml));
    }
    // A few things left on top (scenery: the knock-over pots are separate, sim props).
    if (f.look !== 'bench') topClutter(b, f, R, sim);
  }
  hungDecor(b, spots, R, solidH);
  b.build(parent);
  return { handled };
}

// What's left lying about on a table or worktop. Kitchen worktops get cooking things.
function topClutter(b, f, R, sim) {
  const [x0, z0, x1, z1] = f.rect, kitchen = MAP.id === 'kitchen';
  const items = kitchen ? ['pot_A_stew', 'pan_A', 'cuttingboard', 'jar_A_large', 'jar_B_large', 'jar_C_medium', 'crate_carrots', 'crate_onions', 'bowl', 'food_ingredient_ham_cooked', 'dishrack_plates', 'pot_B']
    : ['plate_stack', 'bottle_A_brown', 'bottle_A_green', 'candle_lit', 'plate_food_A', 'plate_food_B', 'bottle_B_brown', 'candle_melted'];
  const area = (x1 - x0) * (z1 - z0), n = Math.min(14, Math.round(area / 9));
  const avoid = [...(sim.props || []).map(p => [p.x, p.z]), ...(sim.tops || []).map(t => [t.x, t.z])];
  for (let k = 0; k < n; k++) {
    const x = x0 + 0.8 + R() * (x1 - x0 - 1.6), z = z0 + 0.8 + R() * (z1 - z0 - 1.6);
    if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 1.6)) continue;
    const it = pick(R, items), s = it.startsWith('crate') ? 0.45 : 1;
    b.put(it, x, f.top, z, R() * 6.3, s);
  }
}

// A clutter pile (map 'pile' furniture): one tile-sized heap of stores — barrels, crates,
// kegs, sacks, trunks — as tall as the pile's collider. Cats can climb onto them.
function pile(b, f, R) {
  const [x0, z0, x1, z1] = f.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, s = Math.min(w, d);
  const kitchen = MAP.id === 'kitchen' || MAP.id === 'market';
  const kind = f.pile || wpick(R, kitchen ? [['crates', 3], ['veg', 4], ['barrels', 2], ['sacks', 2]] : MAP.id === 'cellar' ? [['kegs', 4], ['barrels', 3], ['crates', 2], ['trunk', 1]] : [['crates', 3], ['barrels', 3], ['sacks', 2], ['trunk', 1], ['kegs', 1]]);
  const yaw = Math.floor(R() * 4) * Math.PI / 2;
  switch (kind) {
    case 'crates': if (f.h > 3) b.put('crates_stacked', cx, 0, cz, yaw, s / 5.6, f.h / 5.35, s / 5.6); else b.put('box_large', cx, 0, cz, yaw, s / 3.75, f.h / 3.75, s / 3.75); break;
    case 'barrels': if (f.h > 3) b.put('barrel_large', cx, 0, cz, R() * 6.3, s / 4.5, f.h / 5, s / 4.5); else for (const [ox, oz] of [[-0.25, -0.25], [0.25, 0.25], [0.25, -0.25]].slice(0, s > 3 ? 3 : 1)) b.put('barrel_small', cx + ox * s, 0, cz + oz * s, R() * 6.3, s / (s > 3 ? 5.2 : 2.6), f.h / 2.5, s / (s > 3 ? 5.2 : 2.6)); break;
    case 'kegs': b.put(R() < 0.5 ? 'keg_decorated' : 'keg', cx, 0, cz, yaw, s / 5, f.h / 5.1, s / 5); break;
    case 'trunk': b.put(R() < 0.5 ? 'trunk_large_A' : 'chest', cx, 0, cz, yaw, s / 3.75, f.h / 2.5, s / 3.75); break;
    case 'sacks': for (let l = 0; l < Math.max(1, Math.round(f.h / 0.7)); l++) for (const o of [-0.25, 0.25]) b.put('sack', cx + o * s, l * 0.68, cz + (R() - 0.5) * 0.4, (l + (o > 0 ? 1 : 0)) % 2 ? 0 : Math.PI / 2, s / 2.6, 1, s / 2.6); break;
    case 'logs': { const n = Math.max(1, Math.round(Math.max(w, d) / 10)), L = Math.max(w, d); for (let l = 0; l < Math.max(1, Math.round(f.h / 1)); l++) for (let k = 0; k < n; k++) for (const o of [-0.3, 0, 0.3]) { const t = (k + 0.5) / n; if (w >= d) b.put('resource_lumber', x0 + w * t, l * 0.9, cz + o * d * 0.9, 0, L / (n * 10), 1, d / 4.8 / 1.6); else b.put('resource_lumber', cx + o * w * 0.9, l * 0.9, z0 + d * t, Math.PI / 2, L / (n * 10), 1, w / 4.8 / 1.6); } break; }
    case 'veg': b.put(pick(R, ['crate_carrots', 'crate_cheese', 'crate_onions', 'crate_potatoes', 'crate_tomatoes', 'crate_lettuce', 'crate_buns']), cx, 0, cz, yaw, s / 5, Math.max(1, f.h / 2.35), s / 5);
      if (f.h > 3) b.put(pick(R, ['crate_carrots', 'crate_onions', 'crate_potatoes']), cx, 2.35 * Math.max(1, f.h / 2.35) * 0.5, cz, yaw + 0.3, s / 5.5); break;
  }
}

// Tops of big blocks: pitched roofs on buildings, battlements on castle stonework.
function topOf(parent, f, style, R) {
  const [x0, z0, x1, z1] = f.rect, w = x1 - x0, d = z1 - z0, h = f.visH || f.h, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (style === 'building') {
    const alongX = w >= d, span = alongX ? d : w, len = alongX ? w : d, rise = span * 0.45, slope = Math.atan2(rise, span / 2), sl = Math.hypot(rise, span / 2);
    const rm = tmat('planks', 2, 0x6a4a3a);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len + 1 : sl + 0.4, 0.5, alongX ? sl + 0.4 : len + 1), rm);
      m.position.set(cx + (alongX ? 0 : side * span / 4), h + rise / 2, cz + (alongX ? side * span / 4 : 0));
      if (alongX) m.rotation.x = side * slope; else m.rotation.z = -side * slope;
      m.castShadow = m.receiveShadow = true; parent.add(m);
    }
    const shape = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)]);
    const gm = tmat('plaster', 4, 0xe8dcc8);
    for (const end of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), gm);
      if (alongX) { g.rotation.y = Math.PI / 2; g.position.set(cx + end * (len / 2 - 0.15) - 0.15, h, cz); } else g.position.set(cx, h, cz + end * (len / 2 - 0.15) - 0.15);
      g.castShadow = true; parent.add(g);
    }
  } else {
    // Flat stone top with merlons round the edge (castle), or a plain cap (plaster).
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), tmat('stone', 6, 0x9a948a)); cap.position.set(cx, h + 0.2, cz); cap.receiveShadow = true; parent.add(cap);
    if (style === 'castle' && h > 8) {
      const mm = tmat('stone', 4, 0xb0a89c);
      const merl = (x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 1.4), mm); m.position.set(x, h + 1.4, z); m.castShadow = true; parent.add(m); };
      for (let x = x0 + 0.7; x <= x1 - 0.7; x += 2.8) { merl(x, z0 + 0.7); merl(x, z1 - 0.7); }
      for (let z = z0 + 3.5; z <= z1 - 3.5; z += 2.8) { merl(x0 + 0.7, z); merl(x1 - 0.7, z); }
    }
  }
}

// Things hung on plain wall modules, facing whichever side has floor in front: banners and
// shields on castle stone, shelves with candles and keys indoors, pictures in the passages,
// a few unlit torches. About one module in three gets something.
function hungDecor(b, spots, R, solidH) {
  const id = MAP.id;
  const sets = {
    castle: [['banner_red', 3], ['banner_blue', 3], ['banner_patternA_red', 2], ['banner_patternB_blue', 2], ['banner_shield_red', 2], ['banner_thin_red', 1], ['banner_triple_yellow', 1], ['sword_shield', 3], ['torch_mounted', 2]],
    plaster: id === 'passages' ? [['pictureframe_large_A', 3], ['pictureframe_large_B', 3], ['pictureframe_medium', 3], ['shelf_small_candles', 2], ['keyring_hanging', 1]]
      : id === 'cellar' ? [['shelf_small_candles', 3], ['keyring_hanging', 2], ['torch_mounted', 2], ['shelf_large', 2]]
      : [['shelf_B_large_decorated', 3], ['shelf_small_candles', 2], ['torch_mounted', 1], ['pictureframe_medium', 1]],
    building: [['torch_mounted', 1], ['banner_thin_red', 1]],
  };
  for (const sp of spots) {
    if (R() > (sp.style === 'building' ? 0.12 : 0.4)) continue;
    const set = sets[sp.style] || sets.castle, name = wpick(R, set);
    // Which face: the side with floor in front of it.
    const half = sp.t / 2, pts = sp.axis === 'x' ? [[sp.mid, sp.c - half - 0.6, Math.PI], [sp.mid, sp.c + half + 0.6, 0]] : [[sp.c - half - 0.6, sp.mid, -Math.PI / 2], [sp.c + half + 0.6, sp.mid, Math.PI / 2]];
    const open = pts.filter(([x, z]) => solidH(x, z) < 0.5);
    if (!open.length) continue;
    const [px, pz, yaw] = open[Math.floor(R() * open.length)];
    const fx = sp.axis === 'x' ? sp.mid : sp.c + (yaw > 0 ? half : -half), fz = sp.axis === 'x' ? sp.c + (yaw === 0 ? half : -half) : sp.mid;
    const y = name.startsWith('banner') ? 0.2 : name === 'torch_mounted' ? 6.5 : name.startsWith('picture') ? 5 : name === 'sword_shield' ? 6 : 4.6;
    b.put(name, fx, y, fz, yaw, 1);
  }
}
