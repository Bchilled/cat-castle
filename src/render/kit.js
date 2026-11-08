// kit.js — the 3D model kit (v0.30). Real modelled castle pieces instead of boxes: KayKit packs
// by Kay Lousberg, CC0 (assets/kaykit, see CREDITS.md). Loaded once at start-up; the map
// builder (dress.js) places them.
//
// Scale: a KayKit table is 1.0 high = 75 cm = 2.5 of our units (1 unit = 30 cm), so the
// dungeon, restaurant, furniture and Halloween packs are scaled by 2.5. The hexagon-board
// props are miniatures, so each gets its own scale to its real size (a barrel 90 cm, a tree 10 m).
//
// Every model is stored as plain geometry already scaled into our units, one entry per
// material, and every model in a pack shares one material (they all use that pack's texture
// atlas). So the map builder can merge thousands of placed pieces into a handful of meshes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const S = 2.5;
const BASE = new URL('../../assets/kaykit/', import.meta.url).href;
// name -> [pack, scale]. File is assets/kaykit/<pack>/<name>.glb (dungeon) or .gltf.
const PACK_OF = {
  dungeon: ['wall', 'wall_arched', 'wall_window_closed', 'wall_window_open', 'wall_archedwindow_open', 'wall_archedwindow_gated', 'wall_doorway', 'wall_cracked', 'wall_broken', 'wall_pillar', 'wall_gated', 'wall_half', 'wall_shelves', 'wall_scaffold', 'wall_window_closed_scaffold', 'wall_doorway_scaffold', 'wall_open_scaffold', 'wall_corner', 'pillar', 'pillar_decorated', 'column',
    'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A', 'floor_tile_small_decorated', 'floor_tile_big_grate', 'floor_wood_large', 'floor_wood_large_dark', 'floor_dirt_large', 'floor_dirt_large_rocky',
    'barrel_large', 'barrel_large_decorated', 'barrel_small', 'barrel_small_stack', 'box_large', 'box_small', 'box_small_decorated', 'box_stacked', 'crates_stacked', 'keg', 'keg_decorated',
    'table_long', 'table_long_decorated_A', 'table_long_tablecloth_decorated_A', 'table_medium', 'table_medium_decorated_A', 'table_small', 'table_small_decorated_A', 'chair', 'stool', 'shelves', 'shelf_large', 'shelf_small_candles',
    'banner_red', 'banner_blue', 'banner_patternA_red', 'banner_patternB_blue', 'banner_shield_red', 'banner_shield_blue', 'banner_thin_red', 'banner_triple_yellow',
    'torch_mounted', 'torch_lit', 'candle_lit', 'candle_triple', 'candle_melted', 'bottle_A_brown', 'bottle_A_green', 'bottle_B_brown', 'plate_stack', 'plate_food_A', 'plate_food_B',
    'trunk_large_A', 'trunk_medium_A', 'chest', 'sword_shield', 'rubble_half', 'rubble_large', 'barrier', 'barrier_column', 'keyring_hanging'],
  restaurant: ['crate_carrots', 'crate_cheese', 'crate_onions', 'crate_potatoes', 'crate_tomatoes', 'crate_ham', 'crate_lettuce', 'crate_buns', 'crate', 'pot_large', 'pot_A_stew', 'pot_B', 'pan_A', 'pan_B', 'cuttingboard', 'jar_A_large', 'jar_B_large', 'jar_C_medium', 'jar_D_small', 'dishrack_plates', 'food_ingredient_ham_cooked', 'food_ingredient_cheese', 'food_ingredient_carrot', 'food_ingredient_onion', 'bowl', 'plate'],
  furniture: ['shelf_B_large_decorated', 'book_set', 'pictureframe_large_A', 'pictureframe_large_B', 'pictureframe_medium', 'rug_rectangle_A', 'rug_rectangle_stripes_A', 'rug_oval_A', 'chair_A_wood', 'cabinet_medium_decorated', 'table_medium_long', 'chair_stool_wood'],
  halloween: ['lantern_hanging', 'lantern_standing', 'post_lantern', 'bench', 'bench_decorated', 'fence', 'fence_pillar', 'pumpkin_orange', 'pumpkin_yellow', 'tree_dead_large', 'plaque_candles'],
  hexprops: ['barrel', 'sack', 'wheelbarrow', 'tent', 'weaponrack', 'bucket_water', 'bucket_empty', 'crate_open', 'crate_long_A', 'pallet', 'resource_lumber', 'ladder', 'target'],
  hexnature: ['tree_single_A', 'tree_single_B', 'rock_single_C', 'rock_single_E'],
};
// Miniatures scaled to real size (our units per model unit).
const OWN_SCALE = { barrel: 14, sack: 12.5, wheelbarrow: 10, tent: 19, weaponrack: 21, bucket_water: 9, bucket_empty: 9, crate_open: 9.5, crate_long_A: 10, pallet: 11, resource_lumber: 14.5, ladder: 13, target: 16,
  tree_single_A: 28, tree_single_B: 28, rock_single_C: 10, rock_single_E: 10 };

export const KIT = {};           // name -> { parts: [{ geo, mat }], box: Box3 (our units) }
const MATS = {};                  // pack -> shared material
let loading = null;

// Load everything once (in the background from the menu). Resolves to true, or false if the
// models can't be loaded (then the old box-built look is used, so the game still runs).
export function loadKit() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const jobs = [];
  for (const [pack, names] of Object.entries(PACK_OF)) for (const name of names) {
    const url = `${BASE}${pack}/${name}.${pack === 'dungeon' ? 'glb' : 'gltf'}`;
    jobs.push(loader.loadAsync(url).then(g => store(pack, name, g.scene)));
  }
  loading = Promise.all(jobs).then(() => true).catch((e) => { console.warn('model kit failed to load', e); return false; });
  return loading;
}
export const kitReady = () => !!KIT.wall;

function store(pack, name, root) {
  const sc = OWN_SCALE[name] || S, parts = [], box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    if (!MATS[pack]) {
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      // Lambert: lit per pixel, cheaper than the PBR material the files ask for, and the
      // atlas colours read the same.
      MATS[pack] = new THREE.MeshLambertMaterial({ map: src.map || null, color: src.map ? 0xffffff : src.color });
    }
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().makeScale(sc, sc, sc).multiply(o.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (geo.index) { /* keep */ } else geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    geo.computeBoundingBox(); box.union(geo.boundingBox);
    parts.push({ geo, mat: MATS[pack] });
  });
  KIT[name] = { parts, box };
}

// One model as a normal object (for things that move or are few). The geometry is shared.
export function kitObject(name) {
  const k = KIT[name], g = new THREE.Group(); if (!k) return g;
  for (const p of k.parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}
export const kitSize = (name) => { const k = KIT[name]; return k ? k.box.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1); };

// A batch of placed static pieces, merged per material into a few big meshes on build().
// Placed in chunks of 32x32 units so whatever is off screen isn't drawn.
export class KitBatch {
  constructor() { this.items = new Map(); }
  // m: a Matrix4 (position, turn, scale) in world units.
  add(name, m) {
    const k = KIT[name]; if (!k) return;
    const e = new THREE.Vector3().setFromMatrixPosition(m), key = `${Math.floor(e.x / 32)},${Math.floor(e.z / 32)}`;
    for (const p of k.parts) {
      const mk = key + '|' + p.mat.uuid;
      if (!this.items.has(mk)) this.items.set(mk, { mat: p.mat, geos: [] });
      this.items.get(mk).geos.push(p.geo.clone().applyMatrix4(m));
    }
  }
  // Shortcut: name at (x, y, z), turned yaw, scaled (sx, sy, sz).
  put(name, x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx) {
    this.add(name, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz)));
  }
  build(parent, { cast = true } = {}) {
    for (const { mat, geos } of this.items.values()) {
      const geo = mergeGeometries(geos, false); if (!geo) continue;
      geos.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh);
    }
    this.items.clear();
  }
}
