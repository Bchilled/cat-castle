// models.js — every 3D model, built from simple shapes in code.
// Why no asset files: keeps the look consistent (chunky low-poly, flat shaded,
// muted/grubby colours, thick dark outlines) and the repo tiny.
// Scale: 1 unit ≈ 30 cm, so a cat is ~1 unit and furniture towers over it.

import * as THREE from 'three';
import { CELL } from '../sim/map.js';
import { tmat } from './textures.js';
import { CATS } from '../config.js';

const matCache = new Map();
// Flat-shaded matte material, cached so identical colours share one material.
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}
export const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x15120f, side: THREE.BackSide });

// Inverted-hull outline: a slightly bigger black copy drawn inside-out.
// Why: thick cartoon outline without post-processing.
export function outline(mesh, thickness = 1.08) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE);
  o.scale.setScalar(thickness);
  mesh.add(o);
  return mesh;
}
export function part(geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, line = true) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  if (line) outline(m);
  return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const box = (c, x, y, z, sx, sy, sz, line = true) => part(BOX, c, x, y, z, sx, sy, sz, line);
const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);

// ---------- cats ----------
// Shared rig: body, head (with jaw for bites), four legs (front ones swipe),
// tail. Fur colours and proportions come from the cat's look.
function catRig(look) {
  const g = new THREE.Group();
  const s = look.scale;
  const body = new THREE.Group(); g.add(body);
  body.add(part(new THREE.IcosahedronGeometry(0.42, 0), look.base, 0, 0.5 * s, 0, 1.0 * s * look.girth, 0.8 * s, 1.45 * s));
  const head = new THREE.Group(); head.position.set(0, 0.85 * s, 0.55 * s); body.add(head);
  head.add(part(new THREE.IcosahedronGeometry(0.32, 0), look.head || look.base, 0, 0, 0, 1.1 * s, 0.95 * s, 1 * s));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1 * s, 0.25 * s); head.add(jaw);
  jaw.add(box(look.muzzle, 0, 0, 0.03, 0.2 * s, 0.1 * s, 0.1 * s, false));
  head.add(box(0x2a1810, 0, -0.04 * s, 0.34 * s, 0.06 * s, 0.05 * s, 0.04 * s, false));          // nose
  for (const k of [-1, 1]) {
    const ear = part(new THREE.ConeGeometry(0.11 * s, 0.26 * s, 4), look.ear || look.base, k * 0.19 * s, 0.3 * s, -0.02, 1, 1, 1);
    if (look.chewedEar && k === 1) { ear.scale.y = 0.7; ear.rotation.z = -0.35; }
    head.add(ear);
    head.add(box(look.eye, k * 0.12 * s, 0.06 * s, 0.3 * s, 0.09 * s, 0.05 * s, 0.03 * s, false));
    const brow = box(0x241208, k * 0.12 * s, 0.12 * s, 0.31 * s, 0.13 * s, 0.035 * s, 0.03 * s, false);
    brow.rotation.z = k * 0.45; head.add(brow);                                                    // mean brows
  }
  const legs = [];
  for (const [x, z] of [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.32], [0.2, -0.32]]) {
    const pivot = new THREE.Group(); pivot.position.set(x * s, 0.4 * s, z * s); body.add(pivot);
    pivot.add(part(cyl(0.08 * s, 0.07 * s, 0.4 * s, 5), look.legs || look.base, 0, -0.2 * s, 0));
    // Paw with claws (visible when swiping).
    const paw = new THREE.Group(); paw.position.y = -0.4 * s; pivot.add(paw);
    paw.add(box(look.paw || look.base, 0, 0.02, 0.03, 0.15 * s, 0.07 * s, 0.17 * s, false));
    for (const c of [-1, 0, 1]) { const cl = part(new THREE.ConeGeometry(0.015 * s, 0.08 * s, 3), 0xf2eee4, c * 0.04 * s, 0.01, 0.13 * s, 1, 1, 1, false); cl.rotation.x = Math.PI / 2; paw.add(cl); }
    legs.push(pivot);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.6 * s, -0.55 * s); body.add(tail);
  const t1 = part(cyl(0.06 * s * look.tailFluff, 0.08 * s * look.tailFluff, 0.5 * s, 5), look.tail || look.base, 0, 0.18 * s, -0.08 * s); t1.rotation.x = -0.6; tail.add(t1);
  const t2 = part(cyl(0.05 * s * look.tailFluff, 0.06 * s * look.tailFluff, 0.38 * s, 5), look.tailTip || look.base, 0, 0.5 * s, -0.12 * s); t2.rotation.x = 0.4; tail.add(t2);
  // Swipe trail: three claw scratch streaks in front of the face.
  const slash = new THREE.Group(); slash.position.set(0, 0.55 * s, 0.9 * s); g.add(slash);
  // (claw scratch streaks removed: Fred is ranged now)
  // Faint claw-reach wedge on the floor so you can see what a swipe will hit.
  // Ring sector centred on +z (theta -PI/2 maps to +z once laid flat).
  // Starts at the nose (not under the body) so it reads as "in front of the cat".
  const reach = new THREE.Mesh(new THREE.RingGeometry(0.85 * look.scale, look.reach || 0.3, 16, 1, -Math.PI / 2 - 0.9, 1.8),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.18, depthWrite: false }));
  reach.rotation.x = -Math.PI / 2; reach.position.y = 0.03; reach.visible = !!look.reach; g.add(reach);
  g.userData = { body, head, jaw, legs, tail, slash, reach, scale: s };
  return g;
}

// Fred: scruffy ginger tom, white snowball patch on his back, chewed ear.
export function makeFred() {
  const g = catRig({ reach: 0, scale: 0.85, girth: 0.72, base: 0xc46a2b, muzzle: 0xe9e4d8, eye: 0xd9c22a, chewedEar: true, tailFluff: 1, tailTip: 0x8a4518 });
  const b = g.userData.body;
  b.add(part(new THREE.IcosahedronGeometry(0.2, 0), 0xe9e4d8, 0, 0.7, -0.1, 0.8, 0.4, 1.0, false));         // snowball patch
  for (let i = 0; i < 3; i++) b.add(box(0x8a4518, 0, 0.55 + i * 0.02, 0.15 - i * 0.2, 0.44 - i * 0.04, 0.05, 0.07, false)); // tabby stripes
  g.userData.head.add(box(0xe9e4d8, 0.05, -0.17, 0.31, 0.04, 0.07, 0.02, false));                             // snaggle tooth
  return g;
}

// Puddin: big long-haired calico. White base with orange and black patches,
// fluffy ruff and tail, heavy-set.
export function makePuddin() {
  const s = 1.3;
  const g = catRig({ reach: 2.1, scale: s, girth: 1.15, base: 0xeee7da, head: 0xeee7da, muzzle: 0xfaf6ee, eye: 0x7fae3a, tailFluff: 2.2,
    tail: 0x2b2420, tailTip: 0xd27a34, ear: 0xd27a34, legs: 0xeee7da });
  const b = g.userData.body;
  // Calico patches.
  b.add(part(new THREE.IcosahedronGeometry(0.22, 0), 0xd27a34, 0.2 * s, 0.68 * s, 0.15 * s, 1.3, 0.8, 1.6, false));
  b.add(part(new THREE.IcosahedronGeometry(0.2, 0), 0x2b2420, -0.18 * s, 0.7 * s, -0.25 * s, 1.4, 0.8, 1.5, false));
  b.add(part(new THREE.IcosahedronGeometry(0.15, 0), 0xd27a34, -0.05 * s, 0.82 * s, -0.05 * s, 1.5, 0.6, 1.2, false));
  // Long-hair fluff: spiky tufts around the chest and haunches.
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2;
    const tuft = part(new THREE.ConeGeometry(0.07 * s, 0.22 * s, 4), k % 3 === 0 ? 0xd27a34 : 0xeee7da, Math.cos(a) * 0.36 * s, 0.4 * s, 0.35 * s + Math.sin(a) * 0.12 * s, 1, 1, 1, false);
    tuft.rotation.z = Math.cos(a) * 1.2; tuft.rotation.x = 0.5; b.add(tuft);
  }
  const head = g.userData.head;
  head.add(part(new THREE.IcosahedronGeometry(0.2, 0), 0x2b2420, 0.12 * s, 0.1 * s, 0.05, 1.1, 0.9, 1.2, false));  // face patch
  for (const k of [-1, 1]) { const ruff = part(new THREE.ConeGeometry(0.1 * s, 0.25 * s, 4), 0xfaf6ee, k * 0.28 * s, -0.12 * s, 0, 1, 1, 1, false); ruff.rotation.z = k * 1.9; head.add(ruff); }
  return g;
}
// Scary Cat: scrawny, beat-up black cat. Thin body, torn ears, a scar over one
// eye, mangy grey patches, ribs showing, a long thin kinked tail (it's her whip).
export function makeScary() {
  const s = 0.82;
  const g = catRig({ reach: 0, scale: s, girth: 0.56, base: 0x1d1b1e, head: 0x232026, muzzle: 0x35303a, eye: 0xc8e030, chewedEar: true,
    tailFluff: 0.55, tail: 0x1d1b1e, tailTip: 0x2a262c, legs: 0x1d1b1e, paw: 0x2a262c, ear: 0x2a262c });
  const b = g.userData.body, head = g.userData.head;
  for (let i = 0; i < 4; i++) b.add(box(0x3a363e, 0.13 * s, 0.42 * s, 0.2 * s - i * 0.09 * s, 0.03, 0.2 * s, 0.025, false));   // ribs showing
  b.add(part(new THREE.IcosahedronGeometry(0.1, 0), 0x4a454e, -0.12 * s, 0.68 * s, -0.25 * s, 1.2, 0.5, 1.5, false));         // mangy patch
  b.add(part(new THREE.IcosahedronGeometry(0.07, 0), 0x4a454e, 0.1 * s, 0.6 * s, 0.25 * s, 1, 0.5, 1.2, false));
  for (let k = 0; k < 5; k++) { const sp = part(new THREE.ConeGeometry(0.035, 0.14, 3), 0x1d1b1e, 0, 0.82 * s, (0.25 - k * 0.13) * s, 1, 1, 1, false); sp.rotation.x = -0.3; b.add(sp); }   // spiky spine fur
  const scar = box(0xb07a80, -0.12 * s, 0.07 * s, 0.32 * s, 0.025, 0.2 * s, 0.02, false); scar.rotation.z = 0.35; head.add(scar);
  // Her tail is long: add a third, thin segment with a kink.
  const t3 = part(cyl(0.025, 0.035, 0.42 * s, 4), 0x1d1b1e, 0, 0.82 * s, -0.08 * s, 1, 1, 1, false); t3.rotation.x = -0.5; t3.rotation.z = 0.4; g.userData.tail.add(t3);
  // Whip reach: a long thin strip on the floor straight ahead.
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.0), new THREE.MeshBasicMaterial({ color: 0xc8e030, transparent: true, opacity: 0.15, depthWrite: false }));
  strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.03, 0.6 + 1.5); g.add(strip); g.userData.reach = strip;
  return g;
}

// Nebbie: sleek, clever grey cat. Slim and elegant, pale chest blaze, sharp blue
// eyes, extra-long whiskers (she shoots them) and a smart blue collar with a tag.
export function makeNebbie() {
  const s = 0.86;
  const g = catRig({ reach: 0, scale: s, girth: 0.64, base: 0x8a9199, head: 0x959ca4, muzzle: 0xdfe3e7, eye: 0x3ab0f0,
    tailFluff: 0.8, tail: 0x8a9199, tailTip: 0x6a7179, legs: 0x8a9199, paw: 0xdfe3e7, ear: 0x7a8189 });
  const b = g.userData.body, head = g.userData.head;
  b.add(part(new THREE.IcosahedronGeometry(0.16, 0), 0xdfe3e7, 0, 0.45 * s, 0.42 * s, 0.9, 1.1, 0.6, false));   // chest blaze
  for (let i = 0; i < 3; i++) b.add(box(0x6a7179, 0, 0.75 * s, (0.1 - i * 0.18) * s, 0.3 * s, 0.03, 0.05, false)); // faint stripes
  for (const k of [-1, 1]) for (const y of [-0.06, -0.1]) {
    const w = box(0xf4f4f4, k * 0.25 * s, y * s, 0.3 * s, 0.32 * s, 0.008, 0.008, false); w.rotation.z = k * (y + 0.08) * 2; head.add(w);   // long whiskers
  }
  return g;
}

// Casper: pure-white pedigree show cat. Fluffy ruff, odd eyes (blue and gold),
// gold collar with a red gem. Red glow under him shows his rage.
export function makeCasper() {
  const s = 0.95;
  const g = catRig({ reach: 1.5, scale: s, girth: 0.82, base: 0xf6f4f0, head: 0xfaf8f4, muzzle: 0xffffff, eye: 0x3a90f0,
    tailFluff: 1.8, tail: 0xf6f4f0, tailTip: 0xffffff, legs: 0xf6f4f0, paw: 0xffffff, ear: 0xf0dcdc });
  const b = g.userData.body, head = g.userData.head;
  head.add(box(0xe0b020, 0.12 * s, 0.06 * s, 0.31 * s, 0.09 * s, 0.05 * s, 0.03 * s, false));   // gold right eye (odd-eyed)
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2;
    const tuft = part(new THREE.ConeGeometry(0.06 * s, 0.2 * s, 4), 0xffffff, Math.cos(a) * 0.3 * s, 0.45 * s, 0.38 * s + Math.sin(a) * 0.1 * s, 1, 1, 1, false);
    tuft.rotation.z = Math.cos(a) * 1.2; tuft.rotation.x = 0.5; b.add(tuft);                 // show-cat ruff
  }
  const rage = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.9, 24), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false }));
  rage.rotation.x = -Math.PI / 2; rage.position.y = 0.04; g.add(rage); g.userData.rage = rage;
  return g;
}

// Meow Meow: friendly grey outdoor cat with a white beard and chest, warm amber
// eyes, tabby stripes, scruffy cheek tufts and a leaf stuck behind one ear.
export function makeMeow() {
  const s = 0.84;
  const g = catRig({ reach: 0, scale: s, girth: 0.68, base: 0x7e7a76, head: 0x86827e, muzzle: 0xf6f4f0, eye: 0xe0a030,
    tailFluff: 1.1, tail: 0x7e7a76, tailTip: 0x5c5854, legs: 0x7e7a76, paw: 0xf6f4f0, ear: 0x6e6a66 });
  const b = g.userData.body, head = g.userData.head;
  b.add(part(new THREE.IcosahedronGeometry(0.17, 0), 0xf6f4f0, 0, 0.45 * s, 0.42 * s, 1, 1.2, 0.6, false));     // white chest
  head.add(part(new THREE.IcosahedronGeometry(0.13, 0), 0xf6f4f0, 0, -0.14 * s, 0.24 * s, 1.2, 0.9, 0.8, false));  // white beard
  for (let i = 0; i < 4; i++) b.add(box(0x5c5854, 0, 0.74 * s, (0.2 - i * 0.15) * s, 0.36 * s, 0.03, 0.06, false));   // tabby stripes
  for (const k of [-1, 1]) { const t = part(new THREE.ConeGeometry(0.06 * s, 0.16 * s, 4), 0x86827e, k * 0.3 * s, -0.08 * s, 0.05, 1, 1, 1, false); t.rotation.z = k * 1.8; head.add(t); }
  const leaf = part(new THREE.ConeGeometry(0.06, 0.2, 3), 0x5a9a3a, -0.24 * s, 0.32 * s, -0.04, 1, 1, 0.3, false); leaf.rotation.z = 0.9; head.add(leaf);
  return g;
}

// Mimo: frisky brown-grey mackerel tabby tom. Dark stripes, an "M" on his forehead,
// pale chin, yellow-green eyes, a solid build.
export function makeMimo() {
  const s = 0.9;
  const g = catRig({ reach: 0, scale: s, girth: 0.74, base: 0x8a7c6a, head: 0x92846f, muzzle: 0xe8e0d0, eye: 0xb8d030,
    tailFluff: 1.0, tail: 0x8a7c6a, tailTip: 0x3a3028, legs: 0x8a7c6a, paw: 0xd8d0c0, ear: 0x6a5c4a });
  const b = g.userData.body, head = g.userData.head;
  for (let i = 0; i < 6; i++) b.add(box(0x3a3028, 0, 0.76 * s, (0.33 - i * 0.13) * s, 0.42 * s, 0.035, 0.05, false));   // mackerel stripes
  for (const k of [-1, 1]) for (let i = 0; i < 3; i++) b.add(box(0x3a3028, k * 0.2 * s, 0.55 * s, (0.2 - i * 0.2) * s, 0.02, 0.2 * s, 0.05, false));
  for (const [x, r] of [[-0.06, 0.4], [0.06, -0.4]]) { const m = box(0x3a3028, x * s, 0.16 * s, 0.3 * s, 0.02, 0.12 * s, 0.02, false); m.rotation.z = r; head.add(m); }   // the "M"
  return g;
}

// Every cat wears a collar in its own colour (contrasting its fur), with a little tag.
// The same colour marks the cat on the radar.
export function makeCat(kind) {
  const g = ({ puddin: makePuddin, scary: makeScary, nebbie: makeNebbie, casper: makeCasper, meow: makeMeow, mimo: makeMimo }[kind] || makeFred)();
  const def = CATS[kind] || CATS.fred, s = g.userData.scale || 1, b = g.userData.body;
  if (b && def.collar) {
    const c = new THREE.Color(def.collar).getHex();
    const collar = part(new THREE.TorusGeometry(0.2 * s, 0.04 * s, 5, 14), c, 0, 0.72 * s, 0.42 * s, 1, 1, 1, false); collar.rotation.x = 1.2; b.add(collar);
    const tag = part(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.02, 8), 0xe0c040, 0, 0.55 * s, 0.6 * s, 1, 1, 1, false); tag.rotation.x = 1.4; b.add(tag);
  }
  return g;
}

// Birds. Magpie: black and white with a long tail. Crow: all black, heavier beak.
// wings flap in the scene; a crow carrying mice shows them dangling underneath.
export function makeBird(type) {
  const g = new THREE.Group(), crow = type === 'crow', blk = crow ? 0x16161c : 0x1a1a24;
  const body = part(new THREE.SphereGeometry(0.28, 10, 8), blk, 0, 0, 0, 0.9, 0.8, 1.4); g.add(body);
  if (!crow) g.add(part(new THREE.SphereGeometry(0.2, 8, 6), 0xf0f0f0, 0, -0.06, 0.05, 1, 0.7, 1.3, false));   // white belly
  g.add(part(new THREE.SphereGeometry(0.17, 8, 6), blk, 0, 0.12, 0.38));                                       // head
  const beak = part(new THREE.ConeGeometry(0.06, crow ? 0.28 : 0.2, 5), crow ? 0x2a2a2a : 0x101010, 0, 0.1, crow ? 0.62 : 0.58); beak.rotation.x = Math.PI / 2; g.add(beak);
  for (const k of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.03, 5, 4), 0xffffff, k * 0.09, 0.16, 0.5, 1, 1, 1, false));       // eye glints
  const tail = part(new THREE.BoxGeometry(0.16, 0.03, crow ? 0.35 : 0.6), blk, 0, 0.02, crow ? -0.5 : -0.62); g.add(tail);
  const wings = [];
  for (const k of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(k * 0.2, 0.08, 0); g.add(pivot);
    const w = part(new THREE.BoxGeometry(0.6, 0.03, 0.34), blk, k * 0.3, 0, 0); pivot.add(w);
    if (!crow) pivot.add(part(new THREE.BoxGeometry(0.25, 0.035, 0.2), 0xf0f0f0, k * 0.22, 0.005, 0.04, 1, 1, 1, false));   // white wing patch
    wings.push(pivot);
  }
  const cargo = new THREE.Group(); cargo.position.y = -0.4; g.add(cargo);
  for (let k = 0; k < 3; k++) cargo.add(part(new THREE.SphereGeometry(0.12, 6, 5), 0x8a8580, (k - 1) * 0.18, 0, 0, 1, 0.8, 1.5));
  g.userData = { wings, cargo };
  return g;
}

// ---------- traps (built at their real footprint, centred on the origin) ----------
// Traps are built at tile scale: one tile = 2x2 units (Orcs Must Die footprint), so a
// trap is about two cats wide. Origin = tile centre on the floor (wall traps: local -z is
// the wall; ceiling traps: origin is on the ceiling and they hang down).
// Every trap except the barricade carries a status lamp (green = armed, red = resetting);
// the scene also animates each trap's reset so you can see when it's ready again.
export function makeTrap(kind, ghost = false) {
  const g = new THREE.Group();
  const add = (m) => { g.add(m); return m; };
  const P = (geo, c, x, y, z, sx = 1, sy = 1, sz = 1) => add(part(geo, c, x, y, z, sx, sy, sz, !ghost));
  const B = (c, x, y, z, sx, sy, sz) => P(BOX, c, x, y, z, sx, sy, sz);
  const S = 4 * CELL, h = S / 2;          // tile size (2 units) and half
  const lamp = (x, y, z) => {
    if (ghost) return;
    B(0x3a3632, x, y - 0.14, z, 0.05, 0.28, 0.05);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5ee06a }));
    l.position.set(x, y, z); add(l); g.userData.lamp = l;
  };
  if (kind === 'barricade') {
    // Poison Box: a big cardboard crate of rat poison, a full tile, green labels with a
    // skull and crossbones on every side, taped lid. Shrinks as it gets chewed.
    const H = 1.4;
    B(0xb89a6a, 0, H / 2, 0, S * 0.98, H, S * 0.98);
    B(0xd8c8a0, 0, H + 0.005, 0, 0.3, 0.01, S * 0.98);                                     // tape on the lid
    for (let k = 0; k < 4; k++) {
      const face = new THREE.Group(); face.rotation.y = k * Math.PI / 2; add(face);
      const z = h * 0.98 + 0.01;
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.78, H * 0.7), mat(0x3a8a3a)); lab.position.set(0, H / 2, z); face.add(lab);
      const skull = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), mat(0xf0ece0)); skull.position.set(0, H * 0.58, z + 0.01); face.add(skull);
      const jaw = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), mat(0xf0ece0)); jaw.position.set(0, H * 0.45, z + 0.01); face.add(jaw);
      for (const ex of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.055, 8), mat(0x1a1a1a)); e.position.set(ex, H * 0.6, z + 0.02); face.add(e); }
      for (const r of [-0.7, 0.7]) { const bone = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.08), mat(0xf0ece0)); bone.position.set(0, H * 0.3, z + 0.01); bone.rotation.z = r; face.add(bone); }
    }
  } else if (kind === 'bait') {
    // Cheese Chunk: a big wedge of holey cheese on a board. Gets smaller as it's nibbled.
    B(0x8a6a48, 0, 0.04, 0, S * 0.8, 0.08, S * 0.8);
    const wedge = new THREE.Group(); wedge.position.y = 0.08; add(wedge); g.userData.cheese = wedge;
    const geo = new THREE.CylinderGeometry(0.85, 0.85, 1.1, 3, 1); geo.rotateY(Math.PI);   // one flat face toward +z
    wedge.add(part(geo, 0xf0c838, 0, 0.55, 0, 1, 1, 1, !ghost));
    for (const [x, y, z, r] of [[0.2, 0.7, 0.42, 0.12], [-0.25, 0.35, 0.42, 0.09], [0.05, 0.25, 0.42, 0.07], [-0.1, 0.85, 0.42, 0.06]])
      { const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 8), mat(0xc89a20)); hole.position.set(x, y, z); wedge.add(hole); }
    lamp(h - 0.15, 0.4, -h + 0.15);
  } else if (kind === 'mousetrap') {
    // A giant snap trap: wooden board, cheese on the trigger, a big kill bar on a hinge
    // across the middle. Armed: bar laid back. Fired: bar slammed flat. It cranks back while resetting.
    B(0xb08a58, 0, 0.06, 0, S * 0.96, 0.12, S * 0.96);
    for (const x of [-0.6, 0.6]) { const c = P(cyl(0.09, 0.09, 0.22, 8), 0x9a9a9a, x, 0.2, 0); c.rotation.z = Math.PI / 2; }   // springs
    const bar = new THREE.Group(); bar.position.set(0, 0.2, 0); add(bar);
    bar.add(part(new THREE.BoxGeometry(S * 0.86, 0.06, 0.06), 0xb0b0b0, 0, 0, 0.85, 1, 1, 1, !ghost));
    for (const x of [-S * 0.43, S * 0.43]) bar.add(part(new THREE.BoxGeometry(0.06, 0.06, 0.85), 0xb0b0b0, x, 0, 0.42, 1, 1, 1, !ghost));
    bar.rotation.x = -2.9; g.userData.bar = bar;
    B(0xd8a83a, 0, 0.16, 0.5, 0.4, 0.06, 0.3);                                            // trigger plate
    P(cyl(0.16, 0.16, 0.14, 3), 0xe8c33a, 0, 0.26, 0.5);                                  // cheese bait
    lamp(h - 0.15, 0.4, -h + 0.15);
  } else if (kind === 'flipper') {
    B(0x4d4a46, 0, 0.05, 0, S * 0.96, 0.1, S * 0.96);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.11, -h * 0.92); add(hinge);
    hinge.add(part(BOX, 0x8d7a4f, 0, 0, h * 0.92, S * 0.9, 0.08, S * 0.9, !ghost));
    for (const x of [-0.5, 0.5]) add(part(cyl(0.08, 0.08, 0.14, 6), 0xaaaaaa, x, 0.08, 0.3, 1, 1, 1, false));
    g.userData.hinge = hinge;
    const arrow = P(new THREE.ConeGeometry(0.22, 0.45, 3), 0xd8c048, 0, 0.18, 0.35); arrow.rotation.x = Math.PI / 2; g.userData.arrow = arrow;
    lamp(h - 0.15, 0.4, -h + 0.15);
  } else if (kind === 'grinder') {
    // Rotary cheese-grater drum on a wall bracket, a tile long.
    B(0x3c3a38, 0, 0.55, -0.21, S * 0.96, 1.0, 0.08);
    const drum = new THREE.Group(); drum.position.set(0, 0.32, 0.05); add(drum);
    const c = part(cyl(0.3, 0.3, S * 0.9, 10), 0xa8a8ac, 0, 0, 0, 1, 1, 1, !ghost); c.rotation.z = Math.PI / 2; drum.add(c);
    for (let i = 0; i < 24; i++) { const a = i / 8 * Math.PI * 2; const tooth = part(new THREE.ConeGeometry(0.04, 0.12, 3), 0xdadade, ((i % 6) - 2.5) * 0.3, Math.cos(a) * 0.31, Math.sin(a) * 0.31, 1, 1, 1, false); tooth.rotation.x = a; drum.add(tooth); }
    g.userData.drum = drum;
    lamp(h - 0.15, 1.15, -0.15);
  } else if (kind === 'zapper') {
    // Hangs from the underside of a roof; a big blue bug zapper on a chain.
    B(0x2f2c29, 0, -0.25, 0, 0.05, 0.5, 0.05);
    B(0x3a4458, 0, -0.75, 0, 0.8, 0.55, 0.8);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), new THREE.MeshBasicMaterial({ color: 0x6fb8ff }));
    glow.position.y = -0.78; add(glow); g.userData.glow = glow;
    lamp(0, -1.12, 0);
  } else if (kind === 'gluepad') {
    B(0xd8c24a, 0, 0.02, 0, S * 0.96, 0.04, S * 0.96);
    const goo = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.86, S * 0.86), new THREE.MeshLambertMaterial({ color: 0xe9df8a, transparent: true, opacity: 0.8 }));
    goo.rotation.x = -Math.PI / 2; goo.position.y = 0.045; add(goo); g.userData.goo = goo;
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'tacks') {
    B(0x6b5a44, 0, 0.02, 0, S * 0.96, 0.04, S * 0.96);
    for (let i = 0; i < 25; i++) {
      const x = ((i % 5) - 2) * 0.36, z = (Math.floor(i / 5) - 2) * 0.36;
      P(cyl(0.08, 0.08, 0.03, 6), [0xc83a2a, 0x2a6ac8, 0xe0c040][i % 3], x, 0.06, z);
      P(new THREE.ConeGeometry(0.02, 0.12, 4), 0xdadada, x, 0.13, z);
    }
  } else if (kind === 'glove') {
    // Tom & Jerry spring glove: wall plate, accordion spring, big red boxing glove.
    // Punches out when it fires, then winds back in while it resets.
    B(0x6e4e30, 0, 0.5, -0.21, S * 0.7, 0.9, 0.08);
    const arm = new THREE.Group(); arm.position.set(0, 0.45, -0.15); add(arm);
    const spring = new THREE.Group(); arm.add(spring); g.userData.spring = spring;
    for (let k = 0; k < 6; k++) spring.add(part(BOX, k % 2 ? 0x8a8a8a : 0xb0b0b0, (k % 2 ? 0.08 : -0.08), 0, k / 5, 0.32, 0.06, 0.06, false));
    const glove = new THREE.Group(); arm.add(glove); g.userData.glove = glove;
    glove.add(part(new THREE.SphereGeometry(0.32, 10, 8), 0xc42a22, 0, 0, 0.3, 1, 0.85, 1.1, !ghost));
    glove.add(part(new THREE.SphereGeometry(0.13, 8, 6), 0xc42a22, 0.27, 0.05, 0.22, 1, 1, 1, !ghost));   // thumb
    const cuff = part(cyl(0.22, 0.24, 0.16, 10), 0xf0e4c8, 0, 0, 0.02, 1, 1, 1, !ghost); cuff.rotation.x = Math.PI / 2; glove.add(cuff);
    g.userData.armLen = 0;
    lamp(h - 0.15, 1.1, -0.15);
  }
  if (ghost) g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; o.material.depthWrite = false; } });
  return g;
}

export function makeCheese(scale = 1) {
  const g = new THREE.Group();
  g.add(part(cyl(0.16 * scale, 0.16 * scale, 0.12 * scale, 3), 0xe8c33a, 0, 0.1 * scale, 0));
  return g;
}
const TIER_COLOR = { common: 0xc9c2b0, rare: 0x5aa0e0, legendary: 0xf0b030 };
export function makeTrinket(tier) {
  const g = new THREE.Group();
  g.add(part(new THREE.OctahedronGeometry(0.22, 0), TIER_COLOR[tier], 0, 0.35, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 4, 12), new THREE.MeshBasicMaterial({ color: TIER_COLOR[tier] }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  return g;
}

// ---------- furniture ----------
// Rule: every piece of art stays inside its collision box (rect + height), so
// anything you can see, you bump into. Nothing decorative pokes into walkways.
const WOOD = 0x6e4e30, DARKWOOD = 0x4a3420, STONE = 0x6f6a62, STONE2 = 0x5e5850;
export function makeFurniture(f) {
  const [x0, z0, x1, z1] = f.rect, w = x1 - x0, d = z1 - z0;
  const g = new THREE.Group(); g.position.set(x0 + w / 2, 0, z0 + d / 2);
  const B = (c, x, y, z, sx, sy, sz, line = true) => { const m = box(c, x, y, z, sx, sy, sz, line); g.add(m); return m; };
  // Textured box: texture name + world units per repeat. Detail at real size
  // (45 cm stone blocks, 12 cm cobbles, 15 cm planks) is what makes the world read huge.
  const TB = (tex, scale, tint, x, y, z, sx, sy, sz, line = true) => {
    const m = new THREE.Mesh(BOX, tmat(tex, scale, tint)); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    if (line) outline(m, 1.005); g.add(m); return m;
  };
  const TC = (tex, scale, tint, geo, x, y, z) => { const m = new THREE.Mesh(geo, tmat(tex, scale, tint)); m.position.set(x, y, z); g.add(m); return m; };
  switch (f.look) {
    case 'stone': {
      TB('stone', 6, 0xd8d0c4, 0, f.h / 2, 0, w, f.h, d, false);
      B(0x4a453f, 0, f.h - 0.4, 0, w + 0.3, 0.8, d + 0.3, false);         // coping along the top
      break;
    }
    case 'hallwall': {
      TB('stone', 6, 0xd0c6b6, 0, f.h / 2, 0, w, f.h, d, false);
      // The great hall's human doors: 3 m wide, 4.2 m tall, studded planks in a stone arch.
      TB('planks', 3, 0x9a7a58, -w / 2 + 29, 7, d / 2 + 0.03, 10, 14, 0.06, false);
      for (let k = 0; k < 3; k++) B(0x26221e, -w / 2 + 29, 2 + k * 4.5, d / 2 + 0.08, 10.1, 0.35, 0.04, false);   // iron straps
      B(0x26221e, -w / 2 + 31, 7, d / 2 + 0.1, 0.5, 0.5, 0.1, false);                                            // ring handle
      break;
    }
    case 'tunnelroof': {
      TB('stone', 6, 0xc8beb0, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d, false);
      for (let z = -d / 2 + 2; z < d / 2; z += 3) B(0x3e3a34, 0, f.bot + 0.2, z, w, 0.4, 0.7, false);   // ribs under the vault
      break;
    }
    case 'guardhouse': {
      // Stone plinth, timber-framed plaster walls, a human door (2.1 m) and windows
      // well above a cat's head, slate roof.
      TB('stone', 6, 0xc8beb0, 0, 1.5, 0, w, 3, d);
      TB('plaster', 4, 0xe8e0d0, 0, 3 + (f.h - 3) / 2, 0, w - 0.1, f.h - 3, d - 0.1, false);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(DARKWOOD, sx * (w / 2 - 0.3), 3 + (f.h - 3) / 2, sz * (d / 2 - 0.3), 0.6, f.h - 3, 0.6, false);
      for (const y of [3.2, f.h - 0.3]) { B(DARKWOOD, 0, y, d / 2 - 0.02, w, 0.5, 0.1, false); B(DARKWOOD, 0, y, -d / 2 + 0.02, w, 0.5, 0.1, false); }
      TB('planks', 3, 0x8a6a48, 0, 3.5, d / 2 + 0.03, 3.6, 7, 0.06, false);                    // door, flush
      B(0x26221e, 1.2, 3.5, d / 2 + 0.08, 0.35, 0.35, 0.06, false);                            // handle
      for (const wx of [-w / 4 - 1, w / 4 + 1]) {
        B(0x1a1612, wx, 10, d / 2 + 0.02, 2.4, 3, 0.04, false);                              // window
        B(DARKWOOD, wx, 10, d / 2 + 0.05, 2.6, 0.2, 0.04, false); B(DARKWOOD, wx, 10, d / 2 + 0.06, 0.2, 3.2, 0.04, false);
      }
      const roof = new THREE.Group(); roof.position.y = f.h;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.71, 1, 4, 1), tmat('slate', 3, 0xc0c4cc)); outline(cone, 1.02);
      cone.rotation.y = Math.PI / 4; cone.position.y = 0.5; roof.add(cone); roof.scale.set(w + 1, 6, d + 1); g.add(roof);
      break;
    }
    case 'barrels': {
      // Barrels packed into the block (90 cm tall, 60 cm wide); the collider is the whole block.
      const r = 0.95;
      for (let bx = -w / 2 + r; bx <= w / 2 - r + 0.01; bx += 2 * r + 0.05)
        for (let bz = -d / 2 + r; bz <= d / 2 - r + 0.01; bz += 2 * r + 0.05) {
          outline(TC('planks', 2, 0xb08a60, cyl(r * 0.92, r, f.h, 12), bx, f.h / 2, bz), 1.02);
          for (const y of [0.4, f.h / 2, f.h - 0.4]) g.add(part(cyl(r * 0.97, r * 0.97, 0.12, 12), 0x2e2c2a, bx, y, bz, 1, 1, 1, false));
        }
      break;
    }
    case 'bales': {
      for (let bz = -d / 2; bz < d / 2 - 0.01; bz += 2.2) {
        const len = Math.min(2.2, d / 2 - bz);
        B(0xc8a858, 0, f.h / 2, bz + len / 2, w, f.h, len - 0.04);
        for (const k of [-0.3, 0.3]) B(0x8a6a38, 0, f.h / 2, bz + len / 2 + k * len, w + 0.02, f.h + 0.02, 0.08, false);   // twine
      }
      break;
    }
    case 'bench': {
      // A human bench (45 cm seat): planks on four legs; mice run underneath.
      TB('planks', 2, 0xb08a60, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) TB('planks', 2, 0x8a6a48, sx * (w / 2 - 0.5), f.bot / 2, sz * (d / 2 - 0.5), 1, f.bot, 1);
      break;
    }
    case 'table': {
      // Trestle table (75 cm): big plank top, a leg in each corner, a stretcher too high to trip on.
      TB('planks', 2.5, 0xb89068, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) TB('planks', 2, 0x8a6a48, sx * (w / 2 - 0.5), f.bot / 2, sz * (d / 2 - 0.5), 1, f.bot, 1);
      B(DARKWOOD, 0, f.bot - 0.25, 0, w - 1, 0.3, 0.3, false);
      break;
    }
    case 'bucket': {
      const r = Math.min(w, d) / 2;
      outline(TC('planks', 1.5, 0xa08060, cyl(r, r * 0.85, f.h, 12), 0, f.h / 2, 0), 1.03);
      for (const y of [0.25, f.h - 0.2]) g.add(part(cyl(r * 1.01, r * 0.9, 0.1, 12), 0x2e2c2a, 0, y, 0, 1, 1, 1, false));
      g.add(part(cyl(r * 0.85, r * 0.85, 0.04, 12), 0x2a4a5a, 0, f.h - 0.15, 0, 1, 1, 1, false));   // water
      break;
    }
    case 'helmet': {
      // A soldier's kettle hat dropped by the bridge: dome + wide brim, fits the 3x3 block.
      const r = Math.min(w, d) / 2;
      const dome = part(new THREE.SphereGeometry(r * 0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a8a90, 0, 0.15, 0);
      dome.scale.y = (f.h - 0.15) / (r * 0.75); g.add(dome);
      g.add(part(cyl(r, r, 0.15, 16), 0x6e6e74, 0, 0.08, 0));
      break;
    }
    case 'rack': {
      // Spear rack: two posts, two rails, spears standing in it (all inside the block).
      for (const sx of [-1, 1]) TB('planks', 2, 0x8a6a48, sx * (w / 2 - 0.4), f.h / 2, 0, 0.8, f.h, d);
      for (const y of [1.5, 4.5]) TB('planks', 2, 0x9a7a58, 0, y, 0, w, 0.4, d * 0.8);
      for (let k = 0; k < 7; k++) {
        const x = -w / 2 + 1.5 + k * (w - 3) / 6;
        g.add(part(cyl(0.12, 0.12, f.h - 0.6, 6), 0x6e5030, x, (f.h - 0.6) / 2, 0, 1, 1, 1, false));
        const tip = part(new THREE.ConeGeometry(0.22, 0.6, 4), 0xb0b0b8, x, f.h - 0.3, 0); g.add(tip);
      }
      break;
    }
    case 'log': {
      // Hollow log: flat-bottomed bark roof over the road (collider = slab).
      TB('bark', 3, 0xb09080, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (const k of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.BoxGeometry(w, f.top - f.bot, 0.05), mat(0xb08a5a));
        ring.position.set(0, (f.bot + f.top) / 2, k * (d / 2 + 0.01)); g.add(ring);
      }
      break;
    }
    case 'well': {
      const r = Math.min(w, d) / 2;
      outline(TC('stone', 3, 0xd0c8bc, cyl(r, r, f.h, 16), 0, f.h / 2, 0), 1.01);
      g.add(part(cyl(r * 0.75, r * 0.75, 0.05, 16), 0x1a2a2a, 0, f.h + 0.01, 0, 1, 1, 1, false));   // dark water inside
      break;
    }
    case 'walkway': {
      TB('stone', 6, 0xc0b8aa, 0, f.h / 2, 0, w, f.h, d);
      TB('planks', 2, 0x9a7a58, 0, f.h + 0.03, 0, w, 0.06, d, false);    // plank deck, flush on top
      break;
    }
    case 'crate': {
      TB('planks', 1.5, 0xb89068, 0, f.h / 2, 0, w, f.h, d);
      for (const k of [-1, 1]) B(0x5a4228, 0, f.h / 2, k * (d / 2 + 0.01), w * 1.01, 0.18, 0.02, false);
      break;
    }
    case 'colonnade': {
      // Roof slab plus the pillars the map makes solid (1x1 every 4 units on both long sides).
      TB('planks', 3, 0x9a7a58, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (let pz = 0; pz < d; pz += 4) for (const px of [0.5, w - 0.5]) {
        TB('stone', 3, 0xd0c8bc, -w / 2 + px, f.bot / 2, -d / 2 + pz + 0.5, 1, f.bot, 1);
      }
      break;
    }
    case 'cart': {
      // Farm cart: bed at human waist height on big spoked wheels (~1 m across).
      TB('planks', 2, 0xa07c58, 0, 2.5, 0, w - 0.8, 0.5, d);
      for (const k of [-1, 1]) TB('planks', 2, 0x8a6a48, k * (w / 2 - 0.5), 3.05, 0, 0.2, 1.1, d);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const wh = part(cyl(1.6, 1.6, 0.3, 14), 0x3a2a1a, sx * (w / 2 - 0.15), 1.6, sz * (d / 2 - 1.7)); wh.rotation.z = Math.PI / 2; g.add(wh);
      }
      B(DARKWOOD, 0, 2.1, d / 2 + 0, 0.3, 0.3, 0.02, false);
      break;
    }
    default: B(WOOD, 0, (f.h || 1) / 2, 0, w, f.h || 1, d);
  }
  return g;
}
