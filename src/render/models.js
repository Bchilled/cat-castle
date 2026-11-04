// models.js — every 3D model, built from simple shapes in code.
// Why no asset files: keeps the look consistent (chunky low-poly, flat shaded,
// muted/grubby colours, thick dark outlines) and the repo tiny.

import * as THREE from 'three';

const matCache = new Map();
// Flat-shaded matte material. Cached so identical colours share one material.
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x15120f, side: THREE.BackSide });

// Inverted-hull outline: a slightly bigger black copy drawn inside-out.
// Why: gives the thick cartoon outline cheaply, no post-processing needed.
export function outline(mesh, thickness = 1.08) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE);
  o.scale.setScalar(thickness);
  mesh.add(o);
  return mesh;
}
function part(geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, line = true) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  if (line) outline(m);
  return m;
}

// ---------- Fred: scruffy ginger tom with a white snowball patch on his back ----------
export function makeFred() {
  const g = new THREE.Group();
  const GINGER = 0xc46a2b, DARK = 0x8a4518, WHITE = 0xe9e4d8;
  const body = part(new THREE.IcosahedronGeometry(0.42, 0), GINGER, 0, 0.5, 0, 1.0, 0.8, 1.45);
  g.add(body);
  // The snowball patch: round white tuft on top of the back.
  g.add(part(new THREE.IcosahedronGeometry(0.2, 0), WHITE, 0, 0.82, -0.12, 1.1, 0.45, 1.1, false));
  // Tabby stripes (uneven on purpose — he's a mess).
  for (let i = 0; i < 3; i++) g.add(part(new THREE.BoxGeometry(0.62, 0.05, 0.08), DARK, 0, 0.62 + i * 0.03, 0.18 - i * 0.22 + (i === 1 ? 0.03 : 0), 1 - i * 0.08, 1, 1, false));
  const head = new THREE.Group(); head.position.set(0, 0.85, 0.55); g.add(head);
  head.add(part(new THREE.IcosahedronGeometry(0.32, 0), GINGER, 0, 0, 0, 1.1, 0.95, 1));
  head.add(part(new THREE.ConeGeometry(0.11, 0.26, 4), GINGER, -0.19, 0.3, -0.02, 1, 1, 1));
  const tornEar = part(new THREE.ConeGeometry(0.11, 0.18, 4), GINGER, 0.2, 0.27, -0.02, 1, 1, 1);  // chewed ear
  tornEar.rotation.z = -0.35; head.add(tornEar);
  head.add(part(new THREE.BoxGeometry(0.2, 0.12, 0.1), WHITE, 0, -0.1, 0.28, 1, 1, 1, false));      // muzzle
  head.add(part(new THREE.BoxGeometry(0.06, 0.05, 0.04), 0x2a1810, 0, -0.04, 0.34, 1, 1, 1, false)); // nose
  for (const s of [-1, 1]) {
    head.add(part(new THREE.BoxGeometry(0.09, 0.05, 0.03), 0xd9c22a, s * 0.12, 0.06, 0.3, 1, 1, 1, false)); // squinty eyes
    const brow = part(new THREE.BoxGeometry(0.13, 0.035, 0.03), 0x241208, s * 0.12, 0.12, 0.31, 1, 1, 1, false);
    brow.rotation.z = s * 0.45; head.add(brow);                                                          // angry brows
  }
  head.add(part(new THREE.BoxGeometry(0.04, 0.07, 0.02), WHITE, 0.05, -0.17, 0.31, 1, 1, 1, false));  // snaggle tooth
  g.userData.legs = [];
  for (const [x, z] of [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.32], [0.2, -0.32]]) {
    const leg = part(new THREE.CylinderGeometry(0.08, 0.07, 0.4, 5), GINGER, x, 0.2, z);
    g.add(leg); g.userData.legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.6, -0.55); g.add(tail);
  const t1 = part(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 5), GINGER, 0, 0.18, -0.08); t1.rotation.x = -0.6; tail.add(t1);
  const t2 = part(new THREE.CylinderGeometry(0.05, 0.06, 0.35, 5), DARK, 0, 0.5, -0.12); t2.rotation.x = 0.4; tail.add(t2);
  g.userData.tail = tail; g.userData.head = head;
  // Claw swipe arc, flashed when attacking.
  const arc = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.5, 12, 1, -1.0, 2.0),
    new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  arc.rotation.x = -Math.PI / 2; arc.rotation.z = Math.PI / 2; arc.position.y = 0.6;
  g.add(arc); g.userData.arc = arc;
  return g;
}

// ---------- mice ----------
export function makeMouse(type, def) {
  const g = new THREE.Group();
  const s = def.size;
  const body = new THREE.Group(); g.add(body);
  body.add(part(new THREE.IcosahedronGeometry(0.5, 0), def.color, 0, 0.42 * s, 0, 0.8 * s, 0.7 * s, 1.15 * s));
  body.add(part(new THREE.IcosahedronGeometry(0.28, 0), def.color, 0, 0.5 * s, 0.5 * s, s, s, s));
  for (const x of [-1, 1]) {
    const ear = part(new THREE.CylinderGeometry(0.17 * s, 0.17 * s, 0.04, 7), 0xc9a3a0, x * 0.17 * s, 0.78 * s, 0.42 * s);
    ear.rotation.x = Math.PI / 2; body.add(ear);
    body.add(part(new THREE.BoxGeometry(0.05, 0.05, 0.03), def.boss ? 0xd8281a : 0x111111, x * 0.1 * s, 0.56 * s, 0.75 * s, s, s, s, false));
  }
  const tail = part(new THREE.CylinderGeometry(0.02 * s, 0.035 * s, 0.9 * s, 4), 0xc9a3a0, 0, 0.3 * s, -0.75 * s);
  tail.rotation.x = Math.PI / 2 - 0.3; body.add(tail);
  if (type === 'lobber') body.add(part(new THREE.BoxGeometry(0.3, 0.3, 0.3), 0x7b6a48, 0, 0.9 * s, -0.1));   // rock sack
  if (type === 'tank') body.add(part(new THREE.BoxGeometry(0.5 * s, 0.1, 0.6 * s), 0x55504a, 0, 0.78 * s, 0));  // pot-lid armour
  if (def.boss) {
    for (const x of [-1, 1]) body.add(part(new THREE.ConeGeometry(0.06 * s, 0.25 * s, 4), 0xddd6c8, x * 0.06 * s, 0.38 * s, 0.82 * s, 1, 1, 1, false)); // teeth
  }
  // HP bar (only shown when hurt)
  const bar = new THREE.Group(); bar.position.y = 1.2 * s + 0.3;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.08), new THREE.MeshBasicMaterial({ color: 0x220000, depthTest: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.08), new THREE.MeshBasicMaterial({ color: 0xd84a2a, depthTest: false }));
  fg.position.z = 0.001; bar.add(bg, fg); bar.visible = false; bar.renderOrder = 10; fg.renderOrder = 11;
  g.add(bar);
  g.userData = { body, bar, fg, tail };
  return g;
}

// ---------- traps ----------
export function makeTrap(kind, ghost = false) {
  const g = new THREE.Group();
  const p = (geo, c, x, y, z, sx, sy, sz) => { const m = part(geo, c, x, y, z, sx, sy, sz, !ghost); g.add(m); return m; };
  const box = new THREE.BoxGeometry(1, 1, 1);
  if (kind === 'barricade') {
    for (let i = 0; i < 3; i++) p(box, i % 2 ? 0x6e4e30 : 0x7d5a38, 0, 0.2 + i * 0.38, 0, 0.95, 0.3, 0.22);
    p(box, 0x5a3e25, -0.35, 0.6, 0.13, 0.12, 1.2, 0.08); p(box, 0x5a3e25, 0.35, 0.6, 0.13, 0.12, 1.2, 0.08);
  } else if (kind === 'mousetrap') {
    p(box, 0xb08a58, 0, 0.04, 0, 0.8, 0.08, 0.55);
    const bar = new THREE.Group(); bar.position.set(0, 0.1, 0); g.add(bar);
    const b = part(new THREE.BoxGeometry(0.75, 0.04, 0.04), 0x9a9a9a, 0, 0, 0.24, 1, 1, 1, !ghost); bar.add(b);
    bar.rotation.x = -2.6; g.userData.bar = bar;
    p(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 3), 0xe0c040, 0, 0.1, -0.1, 1, 1, 1);   // cheese bait
  } else if (kind === 'flipper') {
    p(box, 0x4d4a46, 0, 0.03, 0, 0.95, 0.06, 0.95);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.08, -0.45); g.add(hinge);
    const plate = part(box, 0x8d7a4f, 0, 0, 0.45, 0.85, 0.06, 0.88, !ghost); hinge.add(plate);
    g.userData.hinge = hinge;
    p(new THREE.ConeGeometry(0.12, 0.25, 3), 0xd8c048, 0, 0.14, 0.2, 1, 1, 1).rotation.x = Math.PI / 2;  // arrow
  } else if (kind === 'grinder') {
    // Sits on the wall face (local -z is the wall).
    p(box, 0x3c3a38, 0, 0.6, -0.42, 0.95, 1.1, 0.12);
    const drum = new THREE.Group(); drum.position.set(0, 0.45, -0.25); g.add(drum);
    const cyl = part(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 6), 0x7d7d80, 0, 0, 0, 1, 1, 1, !ghost); cyl.rotation.z = Math.PI / 2; drum.add(cyl);
    for (let i = 0; i < 6; i++) {
      const tooth = part(new THREE.ConeGeometry(0.06, 0.18, 3), 0xbfbfc4, 0, 0, 0, 1, 1, 1, false);
      const a = i / 6 * Math.PI * 2; tooth.position.set((i % 3 - 1) * 0.3, Math.cos(a) * 0.28, Math.sin(a) * 0.28);
      tooth.rotation.x = a; drum.add(tooth);
    }
    g.userData.drum = drum;
  } else if (kind === 'zapper') {
    p(box, 0x2f2c29, 0, 2.55, 0, 0.08, 0.5, 0.08);                         // hanging rod
    const lamp = p(box, 0x3a4458, 0, 2.15, 0, 0.55, 0.35, 0.55);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.45), new THREE.MeshBasicMaterial({ color: 0x6fb8ff }));
    glow.position.y = 2.12; g.add(glow); g.userData.glow = glow; g.userData.lamp = lamp;
  }
  if (ghost) g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; o.material.depthWrite = false; } });
  return g;
}

export function makeCheese() {
  const m = part(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 3), 0xe8c33a, 0, 0.15, 0);
  const g = new THREE.Group(); g.add(m); return g;
}
