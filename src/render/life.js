// life.js — the castle going about its day (v0.29). Scenery only: nothing here touches
// the game rules, nothing collides, nothing is sent to co-op guests (each browser makes
// its own).
//   • Dressing at real human size, so a cat feels cat-sized: banners and shields on the
//     walls, a ladder and a broom leaning on them, boots by a door, bunting and washing
//     strung high across the alleys, shop signs, saddles and a pitchfork in the stables,
//     hams under the cellar vault, copper pans and herbs in the kitchen, chairs.
//   • Motion: dust drifting in the air round you, flies over food, smoke from the oven
//     chimney, cloth swaying, lanterns swinging a little.
// Sizes: 1 unit = 30 cm. A chair seat is 45 cm (1.5), a door 2.1 m (7), a broom 1.4 m (4.6).

import * as THREE from 'three';
import { mat, part } from './models.js';
import { kitObject } from './kit.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const WOOD = 0x7a5a38, DARK = 0x4a3420, IRON = 0x2e2a26, CLOTHS = [0xb83a30, 0x2f5a9a, 0xd8a838, 0x3a7a3a, 0xe8e0d0, 0x8a3a8a];

// What goes where, per map: [kind, x, y, z, facing (radians; 0 = facing +z), extra].
// Wall things sit on the wall face and face out from it; strung things go from one point to another.
// v0.30: banners, shields, shelves and pictures on the walls are placed automatically by the
// map builder (dress.js); these are the hand-placed extras. 'kit:<name>' places a kit model.
const DRESSING = {
  entrance: [
    ['ladder', 16, 0, 30, 0], ['broom', 84, 0, 30, 0], ['boots', 80, 0, 31, 0.3], ['bucket', 82.5, 0, 31, 0],
    ['lantern', 48, 7, 80, 0], ['kit:target', 14, 0, 34, 0.3], ['kit:target', 18, 0, 34.5, -0.2],
    ['kit:wheelbarrow', 24, 0, 66, 0.5], ['kit:pallet', 28, 0, 72, 0.2],
    ['bunting', 6, 11, 53, 0, [90, 11, 53]], ['bunting', 74, 13, 30, 0, [66, 13, 30]], ['bunting', 22, 12, 30, 0, [30, 12, 30]],
  ],
  market: [
    ...[80, 92].map(z => ['bunting', 18, 12, z, 0, [26, 12, z + 2]]), ...[78, 90].map(z => ['bunting', 62, 12, z, 0, [70, 12, z - 2]]),
    ['bunting', 2, 12, 46, 0, [6, 12, 48]], ['bunting', 58, 12, 28, 0, [64, 12, 30]], ['bunting', 58, 12, 36, 0, [64, 12, 34]],
    ['bunting', 14, 15, 44, 0, [74, 15, 48]], ['bunting', 14, 15, 66, 0, [74, 15, 62]],
    ['laundry', 18, 16, 86, 0, [26, 16, 86]], ['laundry', 62, 16, 96, 0, [70, 16, 96]], ['laundry', 2, 16, 32, 0, [6, 16, 32]],
    ['sign', 14.05, 8, 46, Math.PI / 2, 0], ['sign', 73.95, 8, 58, -Math.PI / 2, 1], ['sign', 48, 8, 40.05, 0, 2], ['sign', 40, 8, 73.95, Math.PI, 3],
    ['broom', 2, 0, 66, Math.PI / 2], ['boots', 84.5, 0, 14, -1.2], ['chair', 53, 0, 9.5, 0.4], ['chair', 69, 0, 9.5, -0.4],
    ['kit:tent', 44, 0, 46, 0], ['kit:wheelbarrow', 34, 0, 12, -0.6],
  ],
  stables: [
    ['saddle', 27.95, 3.6, 20, -Math.PI / 2], ['saddle', 27.95, 3.6, 44, -Math.PI / 2], ['saddle', 27.95, 3.6, 64, -Math.PI / 2],
    ['pitchfork', 30, 0, 46, Math.PI / 2], ['broom', 30, 0, 66, Math.PI / 2], ['bucket', 15, 0, 33, 0], ['bucket', 15, 0, 57, 0],
    ['lantern', 23, 5.5, 30, 0], ['lantern', 23, 5.5, 66, 0], ['boots', 33, 0, 4, 0.4], ['kit:wheelbarrow', 47, 0, 62, 0.3], ['kit:pallet', 80, 0, 48, 0.1],
  ],
  cellar: [
    ['ham', 36, 8, 30, 0], ['ham', 38, 8, 31, 1], ['ham', 46, 8, 74, 2], ['ham', 48, 8, 75, 0],
    ['cobweb', 2, 7, 2, 0], ['cobweb', 82, 7, 2, -Math.PI / 2], ['cobweb', 2, 7, 98, Math.PI / 2], ['cobweb', 82, 7, 98, Math.PI],
    ['candle', 74, 3, 6, 0], ['candle', 79, 3, 9, 0], ['candle', 5, 3, 91, 0], ['lantern', 42, 8, 60, 0], ['lantern', 12, 8, 78, 0],
  ],
  passages: [
    ['painting', 34.05, 4.5, 44, Math.PI / 2, 0x6a8aa0], ['painting', 39.95, 4.5, 54, -Math.PI / 2, 0xa0805a], ['painting', 14, 4.5, 30.05, 0, 0x7a9a6a],
    ['coat', 7.95, 4.6, 18, -Math.PI / 2, 0x6a3a2a], ['coat', 7.95, 4.6, 21, -Math.PI / 2, 0x2a3a5a], ['broom', 78, 0, 94, -Math.PI / 2], ['bucket', 76.5, 0, 92, 0],
    ['laundry', 43, 5.4, 84, 0, [69, 5.4, 84]], ['laundry', 43, 5.4, 72, 0, [69, 5.4, 72]],
  ],
  kitchen: [
    ['pans', 13, 6, 2.05, 0], ['herbs', 29, 7.5, 2.4, 0], ['herbs', 31.5, 7.5, 2.4, 1], ['herbs', 56, 7.5, 2.4, 2],
    ['onions', 2.05, 6, 10, Math.PI / 2], ['onions', 93.95, 6, 10, -Math.PI / 2],
    ['chair', 28, 0, 62.6, Math.PI], ['chair', 58, 0, 62.6, Math.PI], ['chair', 86, 0, 4, 0.4],
    ['broom', 24, 0, 64, Math.PI], ['bucket', 26, 0, 63, 0], ['pans', 36, 5.5, 63.95, Math.PI],
  ],
};

// ---------- models (real sizes) ----------
function makeDecor(kind, extra) {
  const g = new THREE.Group(), add = (m) => { g.add(m); return m; };
  const B = (c, x, y, z, sx, sy, sz, line = true) => add(part(BOX, c, x, y, z, sx, sy, sz, line));
  switch (kind) {
    case 'banner': {   // 1.2 m wide, 2.4 m long cloth from a pole; the cloth sways
      B(DARK, 0, 0, 0.25, 4.6, 0.25, 0.25);
      const cloth = new THREE.Group(); cloth.position.set(0, -0.1, 0.3); g.add(cloth);
      cloth.add(part(BOX, extra, 0, -4, 0, 4, 8, 0.08, false));
      cloth.add(part(BOX, 0xd8a838, 0, -1.2, 0.05, 4, 0.5, 0.04, false));
      cloth.add(part(new THREE.ConeGeometry(2, 1.6, 3), extra, 0, -8.6, 0, 1, 1, 0.04, false)).rotation.z = Math.PI;
      g.userData.sway = cloth; break;
    }
    case 'shield': {   // round shield 75 cm across, iron boss
      const s = add(part(cyl(1.25, 1.25, 0.2, 16), extra, 0, 0, 0.12)); s.rotation.x = Math.PI / 2;
      const b = add(part(new THREE.SphereGeometry(0.35, 10, 6), IRON, 0, 0, 0.25)); b.scale.z = 0.6;
      const rim = add(new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 6, 20), mat(IRON))); rim.position.z = 0.22;
      break;
    }
    case 'ladder': {   // 3 m ladder leaning on the wall, foot 1.2 m out
      const L = new THREE.Group(); L.position.set(0, 0, 4); L.rotation.x = -0.42; g.add(L);
      for (const sx of [-0.7, 0.7]) L.add(part(BOX, WOOD, sx, 5, 0, 0.2, 10, 0.25));
      for (let y = 1; y < 10; y += 1) L.add(part(BOX, WOOD, 0, y, 0, 1.4, 0.15, 0.15, false));
      break;
    }
    case 'broom': {   // 1.4 m broom leaning in, bristles on the floor
      const L = new THREE.Group(); L.position.set(0, 0, 0.9); L.rotation.x = -0.2; g.add(L);
      L.add(part(cyl(0.07, 0.07, 4.6, 6), WOOD, 0, 2.6, 0));
      L.add(part(cyl(0.18, 0.55, 1.1, 8), 0xc8a050, 0, 0.55, 0));
      break;
    }
    case 'pitchfork': {
      const L = new THREE.Group(); L.position.set(0, 0, 0.9); L.rotation.x = -0.2; g.add(L);
      L.add(part(cyl(0.07, 0.07, 5, 6), WOOD, 0, 3.4, 0));
      for (const sx of [-0.3, 0, 0.3]) L.add(part(cyl(0.035, 0.02, 1.1, 4), IRON, sx, 0.55, 0, 1, 1, 1, false));
      L.add(part(BOX, IRON, 0, 1.1, 0, 0.7, 0.08, 0.08, false));
      break;
    }
    case 'boots': {   // a pair of riding boots, 40 cm tall
      for (const [sx, r] of [[-0.3, 0.1], [0.35, -0.2]]) {
        const b = new THREE.Group(); b.position.x = sx; b.rotation.y = r; g.add(b);
        b.add(part(BOX, 0x3a2416, 0, 0.75, 0, 0.42, 1.5, 0.45)); b.add(part(BOX, 0x3a2416, 0, 0.15, 0.3, 0.42, 0.3, 0.95));
      }
      break;
    }
    case 'bucket': { add(part(cyl(0.5, 0.42, 1.0, 12), 0x8a6a48, 0, 0.5, 0)); add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 4, 12, Math.PI), mat(IRON))).position.y = 1.0; break; }
    case 'chair': {   // seat 45 cm up, back to 95 cm
      B(WOOD, 0, 1.45, 0, 1.5, 0.15, 1.5);
      for (const sx of [-0.65, 0.65]) for (const sz of [-0.65, 0.65]) B(DARK, sx, 0.7, sz, 0.15, 1.4, 0.15, false);
      for (const sx of [-0.65, 0.65]) B(DARK, sx, 2.3, -0.65, 0.15, 1.7, 0.15, false);
      B(WOOD, 0, 2.6, -0.65, 1.4, 0.5, 0.1); B(WOOD, 0, 2.0, -0.65, 1.4, 0.2, 0.1, false);
      break;
    }
    case 'lantern': {   // hangs on a chain; swings a little
      const L = new THREE.Group(); g.add(L);
      L.add(part(cyl(0.02, 0.02, 1.2, 4), IRON, 0, -0.6, 0, 1, 1, 1, false));
      L.add(part(BOX, IRON, 0, -1.4, 0, 0.6, 0.08, 0.6, false));
      L.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.45), new THREE.MeshBasicMaterial({ color: 0xffc070 }))).position.y = -1.75;
      L.add(part(new THREE.ConeGeometry(0.42, 0.35, 4), IRON, 0, -1.3, 0, 1, 1, 1, false)).rotation.y = Math.PI / 4;
      g.userData.swing = L; break;
    }
    case 'sign': {   // a shop sign hanging from an iron bracket: boot, fish, loaf, cheese
      B(IRON, 0, 0, 1.2, 0.1, 0.1, 2.4, false);
      const s = new THREE.Group(); s.position.set(0, -0.05, 1.6); g.add(s);
      s.add(part(BOX, 0xc89a5a, 0, -1.1, 0, 0.12, 1.6, 2.0));
      const icon = [[0x3a2416, 0.8, 0.9], [0x8ab0c8, 1.2, 0.5], [0xd0a060, 1.1, 0.6], [0xf0c838, 1.0, 0.7]][extra % 4];
      s.add(part(BOX, icon[0], 0.08, -1.1, 0, 0.05, icon[2], icon[1], false));
      s.rotation.y = Math.PI / 2; g.userData.swing = s; break;
    }
    case 'saddle': {   // on a wooden peg
      B(WOOD, 0, 0, 0.4, 0.3, 0.3, 0.8, false);
      const s = add(part(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x6a3a1e, 0, 0.1, 0.9)); s.scale.set(0.9, 0.55, 1.2);
      B(0x4a2a14, 0, -0.9, 0.9, 1.6, 1.4, 0.06, false);
      B(IRON, -0.7, -1.6, 0.9, 0.1, 0.5, 0.1, false); B(IRON, 0.7, -1.6, 0.9, 0.1, 0.5, 0.1, false);
      break;
    }
    case 'ham': {   // a cured ham on a string
      add(part(cyl(0.02, 0.02, 1.0, 4), 0xd8c8a0, 0, -0.5, 0, 1, 1, 1, false));
      const h = add(part(new THREE.SphereGeometry(0.6, 8, 6), 0xa0503a, 0, -1.6, 0)); h.scale.set(0.8, 1.4, 0.8);
      add(part(cyl(0.12, 0.2, 0.5, 6), 0xe8d8b8, 0, -0.85, 0, 1, 1, 1, false));
      g.userData.swing = g; break;
    }
    case 'cobweb': {   // a corner web: faint white threads
      const m = new THREE.LineBasicMaterial({ color: 0xe0e0e0, transparent: true, opacity: 0.45 }), pts = [];
      for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI / 2; pts.push(0, 0, 0, Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5); }   // spokes out of the corner
      for (const r of [0.8, 1.5, 2.2]) for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI / 2, b = (k + 1) / 6 * Math.PI / 2; pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const l = new THREE.LineSegments(geo, m); l.rotation.x = -0.6; g.add(l); break;
    }
    case 'candle': {
      add(part(cyl(0.12, 0.12, 0.6, 8), 0xf0e8d0, 0, 0.3, 0));
      add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), new THREE.MeshBasicMaterial({ color: 0xffb040 }))).position.y = 0.72;
      g.userData.flicker = g.children[g.children.length - 1]; break;
    }
    case 'painting': {   // framed picture, 90 by 70 cm
      B(0x8a6a2a, 0, 0, 0.06, 3.2, 2.6, 0.12);
      B(extra, 0, 0, 0.13, 2.7, 2.1, 0.02, false); B(0xe0c070, 0.4, -0.2, 0.15, 0.9, 0.9, 0.02, false);
      break;
    }
    case 'coat': {   // a coat on a peg
      B(WOOD, 0, 0.3, 0.25, 0.15, 0.15, 0.5, false);
      B(extra, 0, -1.4, 0.35, 1.5, 3.2, 0.4); B(extra, -0.8, -0.9, 0.35, 0.3, 2.2, 0.3, false); B(extra, 0.8, -0.9, 0.35, 0.3, 2.2, 0.3, false);
      break;
    }
    case 'pans': {   // copper pans on hooks along a rail
      B(IRON, 0, 0.3, 0.1, 5, 0.12, 0.12, false);
      [[-1.8, 0.55], [-0.4, 0.75], [1.2, 0.95]].forEach(([x, r]) => {
        const p = add(part(cyl(r, r * 0.85, 0.3, 14), 0xc87840, x, -r - 0.2, 0.25)); p.rotation.x = Math.PI / 2;
        B(0xa05a2a, x, -0.05, 0.25, 0.12, 0.6, 0.06, false);
      });
      break;
    }
    case 'herbs': {   // a bunch of drying herbs hung upside down
      add(part(cyl(0.02, 0.02, 0.8, 4), 0xd8c8a0, 0, -0.4, 0, 1, 1, 1, false));
      add(part(new THREE.ConeGeometry(0.45, 1.2, 7), [0x5a7a3a, 0x7a8a4a, 0x4a6a3a][extra % 3], 0, -1.3, 0)).rotation.x = Math.PI;
      g.userData.swing = g; break;
    }
    case 'onions': {   // a string of onions down the wall
      add(part(cyl(0.03, 0.03, 3, 4), 0xd8c8a0, 0, -1.5, 0.3, 1, 1, 1, false));
      for (let k = 0; k < 6; k++) add(part(new THREE.SphereGeometry(0.28, 8, 6), 0xc89a50, (k % 2 ? 0.18 : -0.18), -0.5 - k * 0.45, 0.4));
      break;
    }
  }
  return g;
}

// Pennants or washing on a sagging line between two points (world coordinates).
function makeLine(kind, a, b) {
  const g = new THREE.Group(), [ax, ay, az] = a, [bx, by, bz] = b, len = Math.hypot(bx - ax, bz - az), sag = Math.min(2.5, len * 0.12);
  const at = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t];
  const pts = []; for (let k = 0; k <= 16; k++) pts.push(new THREE.Vector3(...at(k / 16)));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a3026 })));
  const yaw = Math.atan2(bx - ax, bz - az), sway = [];
  const n = kind === 'bunting' ? Math.max(3, Math.round(len / 1.4)) : Math.max(2, Math.round(len / 3.5));
  for (let k = 1; k < n; k++) {
    const [x, y, z] = at(k / n), h = new THREE.Group(); h.position.set(x, y, z); h.rotation.y = yaw + Math.PI / 2; g.add(h);
    if (kind === 'bunting') { const f = part(new THREE.ConeGeometry(0.45, 1.1, 3), CLOTHS[k % CLOTHS.length], 0, -0.55, 0, 1, 1, 0.08, false); f.rotation.z = Math.PI; h.add(f); }
    else h.add(part(BOX, [0xf0ece4, 0xd8d0f0, 0xe8d0c0, 0xc8d8e8][k % 4], 0, -1.5, 0, 2.6, 3, 0.05, false));   // sheets and shirts
    sway.push(h);
  }
  g.userData.sway = sway; return g;
}

// A soft round dot texture for motes and smoke.
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); return t;
}

export class Life {
  constructor(scene, sim, map) {
    this.scene = scene; this.sim = sim; this.root = new THREE.Group(); scene.add(this.root);
    this.swayers = []; this.swingers = []; this.flickers = [];
    // Dressing.
    for (const [kind, x, y, z, rot, extra] of DRESSING[map.id] || []) {
      if (kind === 'bunting' || kind === 'laundry') { const l = makeLine(kind, [x, y, z], extra); this.root.add(l); this.swayers.push(...l.userData.sway.map((h, k) => ({ o: h, k: k + x, amp: kind === 'laundry' ? 0.12 : 0.25 }))); continue; }
      const g = kind.startsWith('kit:') ? kitObject(kind.slice(4)) : makeDecor(kind, extra); g.position.set(x, y, z); g.rotation.y = rot; this.root.add(g);
      if (g.userData.sway) this.swayers.push({ o: g.userData.sway, k: x + z, amp: 0.05, axis: 'x' });
      if (g.userData.swing) this.swingers.push({ o: g.userData.swing, k: x * 0.7 + z });
      if (g.userData.flicker) this.flickers.push(g.userData.flicker);
    }
    const dot = dotTexture();
    // Dust in the air: a box of slow motes that follows the camera (warm in the light, faint in the dark).
    const N = map.dark ? 140 : 260, pos = new Float32Array(N * 3);
    this.motes = { N, seed: Array.from({ length: N }, (_, k) => [Math.random(), Math.random(), Math.random(), 0.3 + Math.random() * 0.7, k]) };
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes.pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dot, size: 0.045, color: map.dark ? 0x9a8a70 : 0xfff0d0, transparent: true, opacity: map.dark ? 0.3 : 0.4, depthWrite: false, sizeAttenuation: true }));
    this.motes.pts.frustumCulled = false; this.root.add(this.motes.pts);
    // Flies over the food (food piles and the food on furniture tops).
    const spots = [...(sim.foods || []).map(f => [f.x, 0.6, f.z, f]), ...(sim.tops || []).map(f => [f.x, f.y + 0.5, f.z, f])];
    this.flies = [];
    const flyGeo = new THREE.SphereGeometry(0.05, 4, 3), flyMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const [x, y, z, f] of spots) for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(flyGeo, flyMat); this.root.add(m); this.flies.push({ m, x, y, z, f, a: Math.random() * 6.3, r: 0.4 + Math.random() * 0.9, w: 3 + Math.random() * 4, h: Math.random() * 0.8 }); }
    // Smoke from the oven chimney and the hearth (kitchen), drifting up and spreading.
    this.smoke = []; this.smokeAt = [];
    for (const f of map.furniture) if (f.look === 'oven' || f.look === 'hearth') this.smokeAt.push([(f.rect[0] + f.rect[2]) / 2, f.h, (f.rect[1] + f.rect[3]) / 2]);
    if (this.smokeAt.length) {
      const sm = new THREE.SpriteMaterial({ map: dot, color: 0x8a8278, transparent: true, opacity: 0.35, depthWrite: false });
      for (let k = 0; k < 24; k++) { const s = new THREE.Sprite(sm.clone()); s.visible = false; this.root.add(s); this.smoke.push({ s, life: 0 }); }
    }
    this.smokeT = 0;
  }
  step(dt, now, cam) {
    const t = now / 1000;
    // Cloth and lines sway on a slow breeze; lanterns, hams and signs swing a touch.
    for (const s of this.swayers) { const v = Math.sin(t * 1.3 + s.k * 0.7) * s.amp + Math.sin(t * 2.9 + s.k) * s.amp * 0.3; s.o.rotation.x = v; }
    for (const s of this.swingers) s.o.rotation.z = Math.sin(t * 1.1 + s.k) * 0.06;
    for (const f of this.flickers) { const n = Math.sin(now / 70 + f.id) * 0.5 + Math.sin(now / 31) * 0.5; f.scale.set(1 + n * 0.15, 1 + n * 0.3, 1 + n * 0.15); }
    // Motes: each wraps inside a 16 x 6 x 16 box round the camera, drifting and bobbing.
    const M = this.motes, p = M.pts.geometry.attributes.position.array;
    for (let i = 0; i < M.N; i++) {
      const [sx, sy, sz, sp, k] = M.seed[i];
      const wx = ((sx * 16 + t * 0.15 * sp + Math.sin(t * 0.3 + k) * 0.4) % 16 + 16) % 16, wz = ((sz * 16 + t * 0.1 * sp) % 16 + 16) % 16, wy = ((sy * 6 + Math.sin(t * 0.5 + k) * 0.3) % 6 + 6) % 6;
      p[i * 3] = cam.x - 8 + wx; p[i * 3 + 1] = Math.max(0.05, cam.y - 2 + wy); p[i * 3 + 2] = cam.z - 8 + wz;
    }
    M.pts.geometry.attributes.position.needsUpdate = true;
    // Flies: buzzing loops over food that's still there.
    for (const fl of this.flies) {
      const on = fl.f.left > 0; fl.m.visible = on; if (!on) continue;
      fl.a += dt * fl.w; const r = fl.r * (1 + Math.sin(t * 5 + fl.w) * 0.2);
      fl.m.position.set(fl.x + Math.cos(fl.a) * r, fl.y + fl.h + Math.sin(t * 7 + fl.w) * 0.15, fl.z + Math.sin(fl.a * 1.3) * r);
    }
    // Smoke puffs: a new one every 0.35 s per chimney; rise 1.2 units/s, grow, fade over 5 s.
    if (this.smokeAt.length) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = 0.35; for (const [x, y, z] of this.smokeAt) { const s = this.smoke.find(q => q.life <= 0); if (s) { s.life = 5; s.x = x + (Math.random() - 0.5) * 2; s.y = y; s.z = z + (Math.random() - 0.5); s.s.visible = true; } } }
      for (const s of this.smoke) {
        if (s.life <= 0) continue; s.life -= dt; if (s.life <= 0) { s.s.visible = false; continue; }
        const a = 5 - s.life; s.s.position.set(s.x + Math.sin(a * 0.8) * 0.6 + a * 0.3, s.y + a * 1.2, s.z); s.s.scale.setScalar(1 + a * 0.9); s.s.material.opacity = 0.35 * Math.min(1, s.life / 2) * Math.min(1, a * 2);
      }
    }
  }
  dispose() { this.scene.remove(this.root); }
}
