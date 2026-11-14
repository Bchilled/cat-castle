// models.js — every 3D model, built from simple shapes in code.
// Why no asset files: keeps the look consistent (chunky low-poly, flat shaded,
// muted/grubby colours, thick dark outlines) and the repo tiny.
// Scale: 1 unit ≈ 30 cm, so a cat is ~1 unit and furniture towers over it.

import * as THREE from 'three';
import { CELL } from '../sim/map.js';
import { tmat } from './textures.js';
import { CATS, TRAPS } from '../config.js';

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
  // Legs (v0.30): upper leg from the shoulder/hip, a knee (wrist/hock) joint, lower leg, paw.
  // The scene bends the knees to lift the paws as they swing, so the gait isn't stiff sticks.
  const legs = [];
  for (const [x, z] of [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.32], [0.2, -0.32]]) {
    const pivot = new THREE.Group(); pivot.position.set(x * s, 0.4 * s, z * s); body.add(pivot);
    pivot.add(part(cyl(0.085 * s, 0.075 * s, 0.22 * s, 5), look.legs || look.base, 0, -0.11 * s, 0));
    const knee = new THREE.Group(); knee.position.y = -0.21 * s; pivot.add(knee);
    knee.add(part(cyl(0.075 * s, 0.065 * s, 0.21 * s, 5), look.legs || look.base, 0, -0.095 * s, 0));
    pivot.userData.knee = knee;
    // Paw with claws (visible when swiping).
    const paw = new THREE.Group(); paw.position.y = -0.19 * s; knee.add(paw); pivot.userData.paw = paw;
    paw.add(box(look.paw || look.base, 0, 0.02, 0.03, 0.15 * s, 0.07 * s, 0.17 * s, false));
    for (const c of [-1, 0, 1]) { const cl = part(new THREE.ConeGeometry(0.015 * s, 0.08 * s, 3), 0xf2eee4, c * 0.04 * s, 0.01, 0.13 * s, 1, 1, 1, false); cl.rotation.x = Math.PI / 2; paw.add(cl); }
    legs.push(pivot);
  }
  // Tail (v0.30): a chain of segments, base -> mid -> tip, so the scene can let the end lag
  // behind the base (follow-through) instead of swinging the whole tail as one stick.
  const tail = new THREE.Group(); tail.position.set(0, 0.6 * s, -0.55 * s); body.add(tail);
  const seg1 = new THREE.Group(); seg1.rotation.x = -0.6; tail.add(seg1);
  seg1.add(part(cyl(0.06 * s * look.tailFluff, 0.08 * s * look.tailFluff, 0.5 * s, 5), look.tail || look.base, 0, 0.25 * s, 0));
  const seg2 = new THREE.Group(); seg2.position.y = 0.48 * s; seg2.rotation.x = 1.0; seg1.add(seg2);
  seg2.add(part(cyl(0.05 * s * look.tailFluff, 0.06 * s * look.tailFluff, 0.38 * s, 5), look.tailTip || look.base, 0, 0.19 * s, 0));
  const tailTip = new THREE.Group(); tailTip.position.y = 0.37 * s; seg2.add(tailTip);
  // Swipe trail: three claw scratch streaks in front of the face.
  const slash = new THREE.Group(); slash.position.set(0, 0.55 * s, 0.9 * s); g.add(slash);
  // (claw scratch streaks removed: Fred is ranged now)
  // Faint claw-reach wedge on the floor so you can see what a swipe will hit.
  // Ring sector centred on +z (theta -PI/2 maps to +z once laid flat).
  // Starts at the nose (not under the body) so it reads as "in front of the cat".
  const reach = new THREE.Mesh(new THREE.RingGeometry(0.85 * look.scale, look.reach || 0.3, 16, 1, -Math.PI / 2 - 0.9, 1.8),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.18, depthWrite: false }));
  reach.rotation.x = -Math.PI / 2; reach.position.y = 0.03; reach.visible = !!look.reach; g.add(reach);
  g.userData = { body, head, jaw, legs, tail, tailMid: seg2, tailTip, slash, reach, scale: s };
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
  const t3p = new THREE.Group(); t3p.rotation.set(-1.3, 0, 0.4); g.userData.tailTip.add(t3p);
  t3p.add(part(cyl(0.025, 0.035, 0.42 * s, 4), 0x1d1b1e, 0, 0.21 * s, 0, 1, 1, 1, false));
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
// Hats (bought with yarn in the shop). Built in head units: sits between the ears.
export function makeHat(kind) {
  const g = new THREE.Group();
  const P = (geo, c, x, y, z, sx = 1, sy = 1, sz = 1, line = true) => { const m = part(geo, c, x, y, z, sx, sy, sz, line); g.add(m); return m; };
  switch (kind) {
    case 'paper': for (let k = 0; k < 5; k++) { const pt = P(new THREE.ConeGeometry(0.06, 0.16, 3), 0xf0d060, Math.cos(k * 1.256) * 0.13, 0.1, Math.sin(k * 1.256) * 0.13, 1, 1, 1, false); } P(cyl(0.15, 0.15, 0.08, 12), 0xf0d060, 0, 0.02, 0, 1, 1, 1, false); break;
    case 'party': P(new THREE.ConeGeometry(0.13, 0.38, 12), 0xe0407a, 0, 0.19, 0); P(new THREE.SphereGeometry(0.05, 6, 5), 0xfff060, 0, 0.4, 0, 1, 1, 1, false); break;
    case 'beanie': P(new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a7ad8, 0, 0, 0); P(cyl(0.015, 0.015, 0.12, 4), 0x333333, 0, 0.22, 0, 1, 1, 1, false);
      { const pr = P(BOX, 0xe0402a, 0, 0.28, 0, 0.36, 0.02, 0.07, false); pr.userData.spin = true; } break;
    case 'chef': P(cyl(0.15, 0.14, 0.16, 12), 0xf4f4f0, 0, 0.06, 0); P(new THREE.SphereGeometry(0.2, 10, 8), 0xf4f4f0, 0, 0.22, 0, 1, 0.7, 1); break;
    case 'tophat': P(cyl(0.24, 0.24, 0.025, 14), 0x1a1a1a, 0, 0, 0); P(cyl(0.14, 0.15, 0.3, 14), 0x1a1a1a, 0, 0.15, 0); P(cyl(0.152, 0.152, 0.05, 14), 0xa02a2a, 0, 0.05, 0, 1, 1, 1, false); break;
    case 'pirate': P(BOX, 0x1a1a1a, 0, 0.08, 0, 0.5, 0.16, 0.22); P(new THREE.SphereGeometry(0.035, 6, 5), 0xf0f0f0, 0, 0.1, 0.12, 1, 1, 1, false); break;
    case 'wizard': P(new THREE.ConeGeometry(0.17, 0.5, 12), 0x3a2a8a, 0, 0.25, 0); P(cyl(0.27, 0.27, 0.025, 14), 0x3a2a8a, 0, 0, 0); for (let k = 0; k < 4; k++) P(new THREE.OctahedronGeometry(0.03, 0), 0xffe060, Math.cos(k * 1.6) * 0.1, 0.12 + k * 0.08, Math.sin(k * 1.6) * 0.1 + 0.03, 1, 1, 1, false); break;
    case 'viking': P(new THREE.SphereGeometry(0.18, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a8a92, 0, -0.02, 0); for (const x of [-1, 1]) { const hn = P(new THREE.ConeGeometry(0.045, 0.25, 6), 0xf0e8d0, x * 0.2, 0.1, 0); hn.rotation.z = -x * 0.9; } break;
    case 'flower': for (let k = 0; k < 7; k++) P(new THREE.SphereGeometry(0.05, 6, 5), [0xff6a8a, 0xffe060, 0xffffff, 0xa070ff][k % 4], Math.cos(k * 0.9) * 0.17, 0.02, Math.sin(k * 0.9) * 0.17, 1, 1, 1, false); P(new THREE.TorusGeometry(0.17, 0.02, 4, 16), 0x4a8a3a, 0, 0, 0, 1, 1, 1, false).rotation.x = Math.PI / 2; break;
    case 'crown': P(cyl(0.16, 0.15, 0.12, 12), 0xe8b830, 0, 0.05, 0); for (let k = 0; k < 6; k++) P(new THREE.ConeGeometry(0.04, 0.1, 4), 0xe8b830, Math.cos(k * 1.047) * 0.14, 0.16, Math.sin(k * 1.047) * 0.14, 1, 1, 1, false); P(new THREE.OctahedronGeometry(0.035, 0), 0xe02a3a, 0, 0.07, 0.16, 1, 1, 1, false); break;
  }
  return g;
}
export function makeCat(kind, hat = null) {
  const g = ({ puddin: makePuddin, scary: makeScary, nebbie: makeNebbie, casper: makeCasper, meow: makeMeow, mimo: makeMimo }[kind] || makeFred)();
  if (hat && g.userData.head) { const sc = g.userData.scale || 1, h = makeHat(hat); h.position.set(0, 0.27 * sc, -0.02 * sc); h.scale.setScalar(sc); g.userData.head.add(h); g.userData.hat = h; }
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
  // (v0.31) Ceiling traps are built at their real footprint (the renderer doesn't stretch
  // them) and bolted flush to the ceiling: a dark backing plate with an iron frame round the
  // trap's tiles, so it reads as fitted to the ceiling right over the tiles it hits.
  // y = 0 is the ceiling; everything hangs below. Returns the footprint [W, D] in units.
  const ceilMount = () => {
    const [cw, cd] = TRAPS[kind].size, W = cw * CELL, D = cd * CELL;
    B(0x2e2a26, 0, -0.04, 0, W * 0.96, 0.08, D * 0.96);
    for (const sz of [-1, 1]) B(0x1a1816, 0, -0.1, sz * D * 0.46, W * 0.96, 0.08, 0.12);
    for (const sx of [-1, 1]) B(0x1a1816, sx * W * 0.46, -0.1, 0, 0.12, 0.08, D * 0.96);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(cyl(0.07, 0.07, 0.05, 6), 0x8a8478, sx * W * 0.43, -0.15, sz * D * 0.43);
    return [W, D];
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
    // (v0.31) A big bug zapper set flush into the ceiling: an iron cage round a glowing blue
    // tube block, grid wires on every side. It fires bolts the whole way down to the floor.
    const [W, D] = ceilMount();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0x24221f, sx * W * 0.33, -0.55, sz * D * 0.33, 0.09, 0.95, 0.09);   // cage posts
    B(0x3a3632, 0, -0.2, 0, W * 0.72, 0.2, D * 0.72);                                                                     // housing
    const glow = new THREE.Mesh(new THREE.BoxGeometry(W * 0.56, 0.55, D * 0.56), new THREE.MeshBasicMaterial({ color: 0x6fb8ff }));
    glow.position.y = -0.62; add(glow); g.userData.glow = glow;
    for (let k = -3; k <= 3; k++) for (const sd of [-1, 1]) {                                                             // the grid wires
      B(0x9aa8b8, k * W * 0.09, -0.62, sd * D * 0.31, 0.025, 0.6, 0.025); B(0x9aa8b8, sd * W * 0.31, -0.62, k * D * 0.09, 0.025, 0.6, 0.025);
    }
    B(0x24221f, 0, -1.0, 0, W * 0.72, 0.08, D * 0.72);                                                                    // drip tray
    lamp(W * 0.42, -0.2, D * 0.42);
  } else if (kind === 'tenderizer') {
    // (v0.31) The Meat Tenderizer: an iron press housed in the ceiling. A piston drives the
    // studded head all the way down to the floor (the renderer stretches the rod), then it
    // winches back up. Head at rest: bottom 2.3 below the ceiling.
    const [W, D] = ceilMount();
    B(0x3a3632, 0, -0.32, 0, W * 0.72, 0.5, D * 0.72);                                        // housing
    for (const sx of [-1, 1]) B(0xc89a2a, sx * W * 0.36, -0.32, 0, 0.04, 0.3, D * 0.6);      // brass trim
    P(cyl(0.38, 0.38, 0.45, 12), 0x2a2826, 0, -0.78, 0);                                      // sleeve
    const rod = P(cyl(0.2, 0.2, 1, 10), 0xa8a8b0, 0, -1, 0); g.userData.rod = rod;             // piston (scaled by the renderer)
    const head = new THREE.Group(); head.position.y = -1.6; add(head); g.userData.head = head;
    head.add(part(BOX, 0x4a4642, 0, 0, 0, W * 0.86, 0.7, D * 0.86, !ghost));
    head.add(part(BOX, 0x6a6560, 0, 0.38, 0, W * 0.7, 0.08, D * 0.7, false));
    for (const sz of [-1, 1]) for (let k = 0; k < 6; k++) head.add(part(BOX, k % 2 ? 0x1a1a1a : 0xe0b020, (k - 2.5) * W * 0.14, 0, sz * D * 0.432, W * 0.14, 0.18, 0.02, false));   // hazard band
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {                                  // the tenderizer face: pyramid studs
      const st = part(new THREE.ConeGeometry(0.26, 0.3, 4), 0x2e2c2a, (i - 2) * W * 0.17, -0.5, (j - 2) * D * 0.17, 1, 1, 1, false);
      st.rotation.x = Math.PI; st.rotation.y = Math.PI / 4; head.add(st);
    }
    lamp(W * 0.42, -0.2, D * 0.42);
  } else if (kind === 'gluepad') {  } else if (kind === 'gluepad') {
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
  else if (kind === 'hotplate') {
    // Stove ring: black iron plate with two glowing coils. Glows hot when armed.
    B(0x2a2826, 0, 0.06, 0, S * 0.92, 0.12, S * 0.92);
    const coilMat = new THREE.MeshBasicMaterial({ color: 0xff4a1a });
    const coils = new THREE.Group(); coils.position.y = 0.14; add(coils); g.userData.coils = coils; g.userData.coilMat = coilMat;
    for (const r of [0.62, 0.36]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 28), coilMat); t.rotation.x = Math.PI / 2; coils.add(t); }
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) P(cyl(0.07, 0.07, 0.06, 6), 0x6a6a6a, x, 0.15, z);
    lamp(h - 0.15, 0.4, -h + 0.15);
  } else if (kind === 'icetray') {
    // Freezer tray: white plastic, a grid of ice cubes, frost on the rim.
    B(0xe8eef2, 0, 0.06, 0, S * 0.9, 0.12, S * 0.9);
    const cubes = new THREE.Group(); cubes.position.y = 0.2; add(cubes); g.userData.cubes = cubes;
    const iceMat = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: !ghost, opacity: 0.85, flatShading: true });
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.42), iceMat); c.position.set(((i % 3) - 1) * 0.55, 0, (Math.floor(i / 3) - 1) * 0.55); c.rotation.y = (i * 0.37) % 0.4; cubes.add(c); }
    lamp(h - 0.15, 0.4, -h + 0.15);
  } else if (kind === 'oilslick') {
    // A tipped oil can and the black glossy puddle running out of it.
    const pud = new THREE.Mesh(new THREE.CircleGeometry(0.92, 22), new THREE.MeshPhongMaterial({ color: 0x15120e, shininess: 120, specular: 0x6a6a5a }));
    pud.rotation.x = -Math.PI / 2; pud.position.y = 0.015; pud.scale.set(1.05, 0.85, 1); add(pud);
    const can = P(cyl(0.2, 0.2, 0.45, 10), 0x7a2a22, 0.7, 0.2, -0.7); can.rotation.z = Math.PI / 2; can.rotation.y = 0.6;
    P(cyl(0.05, 0.08, 0.18, 6), 0xb0b0b0, 0.42, 0.2, -0.52).rotation.z = Math.PI / 2;
  } else if (kind === 'rollingpin') {
    // Rails along the tile and a huge wooden rolling pin that rolls across.
    for (const x of [-h * 0.92, h * 0.92]) B(0x6a5a48, x, 0.08, 0, 0.12, 0.16, S * 0.95);
    const pin = new THREE.Group(); pin.position.set(0, 0.36, -0.72); add(pin); g.userData.pin = pin;
    const body = part(cyl(0.28, 0.28, S * 0.78, 12), 0xd8b080, 0, 0, 0, 1, 1, 1, !ghost); body.rotation.z = Math.PI / 2; pin.add(body);
    for (const x of [-1, 1]) { const hd = part(cyl(0.09, 0.09, 0.3, 8), 0xa07a50, x * (S * 0.39 + 0.12), 0, 0, 1, 1, 1, !ghost); hd.rotation.z = Math.PI / 2; pin.add(hd); }
    lamp(h - 0.15, 0.5, -h + 0.15);
  } else if (kind === 'skull') {
    // A mouse skull on a grave-stone, eyes glowing purple, a faint ring showing its reach.
    B(0x5a5a62, 0, 0.1, 0, 1.3, 0.2, 1.3);
    const sk = new THREE.Group(); sk.position.y = 0.6; sk.scale.setScalar(1.6); add(sk);
    sk.add(part(new THREE.SphereGeometry(0.3, 10, 8), 0xe8e2d0, 0, 0, 0, 1, 0.9, 1.25, !ghost));
    sk.add(part(BOX, 0xd8d0bc, 0, -0.2, 0.22, 0.26, 0.1, 0.3, false));
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb070ff }); g.userData.eyeMat = eyeMat;
    for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), eyeMat); e.position.set(x, 0.05, 0.3); sk.add(e); }
    if (!ghost) {
      const aura = new THREE.Mesh(new THREE.RingGeometry(2.85, 3, 48), new THREE.MeshBasicMaterial({ color: 0x8a5ab8, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; add(aura); g.userData.aura = aura;
    }
  } else if (kind === 'forkdarts') {
    // A wooden cutlery block on the wall bristling with forks, tines out.
    B(0x6e4e30, 0, 0.5, -0.14, S * 0.8, 0.8, 0.22);
    const forks = new THREE.Group(); add(forks); g.userData.forks = forks;
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Group(); f.position.set((k - 2) * 0.3, 0.3 + (k % 2) * 0.35, 0); forks.add(f);
      f.add(part(BOX, 0xc8c8cc, 0, 0, 0.12, 0.05, 0.03, 0.3, false));
      for (const tx of [-0.04, 0, 0.04]) f.add(part(BOX, 0xd8d8dc, tx, 0, 0.32, 0.015, 0.015, 0.14, false));
    }
    lamp(h - 0.15, 1.05, -0.12);
  } else if (kind === 'bellows') {
    // Fireplace bellows on a bracket, nozzle pointing across the lane.
    B(0x4a3a2a, 0, 0.5, -0.2, 0.8, 0.9, 0.1);
    const bag = new THREE.Group(); bag.position.set(0, 0.5, 0.05); add(bag); g.userData.bag = bag;
    bag.add(part(BOX, 0x8a5a30, 0, 0.18, 0.3, 0.7, 0.05, 0.6, !ghost)); bag.add(part(BOX, 0x8a5a30, 0, -0.18, 0.3, 0.7, 0.05, 0.6, !ghost));
    bag.add(part(BOX, 0x5a3420, 0, 0, 0.3, 0.6, 0.32, 0.5, false));
    const noz = P(new THREE.ConeGeometry(0.1, 0.45, 8), 0x9a8a6a, 0, 0.5, 0.8); noz.rotation.x = Math.PI / 2;
    lamp(h - 0.15, 1.05, -0.12);
  } else if (kind === 'candle') {
    // A fat church candle in an iron sconce; a little bellows behind it spits the flame.
    B(0x2f2c29, 0, 0.35, -0.2, 0.6, 0.6, 0.08);
    B(0x2f2c29, 0, 0.1, 0.1, 0.5, 0.06, 0.5);
    P(cyl(0.2, 0.22, 0.7, 12), 0xf0e6c8, 0, 0.48, 0.12);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xffb040 })); fl.position.set(0, 0.98, 0.12); add(fl); g.userData.flame = fl;
    lamp(h - 0.15, 0.9, -0.12);
  } else if (kind === 'hypno') {
    // A black-and-white spiral wheel that never stops turning.
    B(0x3a2a40, 0, 0.6, -0.2, 0.3, 1.1, 0.1);
    const wheel = new THREE.Group(); wheel.position.set(0, 0.7, 0.0); add(wheel); g.userData.spiral = wheel;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), new THREE.MeshBasicMaterial({ map: spiralTexture(), side: THREE.DoubleSide })); wheel.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.04, 6, 32), mat(0x6a3a8a)); wheel.add(rim);
    lamp(h - 0.15, 1.2, -0.12);
  } else if (kind === 'flowerpot') {
    // A terracotta pot on a bracket screwed to the ceiling. Drops when mice pass underneath (it
    // falls the whole way); a new one is hung while it resets.
    const [W, D] = ceilMount();
    B(0x2a2826, 0, -0.35, 0, 0.08, 0.6, 0.08); B(0x2a2826, 0, -0.62, 0, 0.5, 0.06, 0.06);
    const pot = new THREE.Group(); pot.position.y = -1.05; add(pot); g.userData.pot = pot;
    pot.add(part(cyl(0.45, 0.32, 0.65, 12), 0xc8643a, 0, 0, 0, 1, 1, 1, !ghost));
    pot.add(part(cyl(0.41, 0.41, 0.04, 12), 0x4a3020, 0, 0.31, 0, 1, 1, 1, false));
    for (let k = 0; k < 5; k++) { const lf = part(new THREE.ConeGeometry(0.09, 0.45, 4), 0x4a8a3a, Math.cos(k * 1.3) * 0.15, 0.52, Math.sin(k * 1.3) * 0.15, 1, 1, 1, false); lf.rotation.z = Math.cos(k * 1.3) * 0.4; pot.add(lf); }
    for (const sx of [-1, 1]) B(0x2a2826, sx * 0.25, -0.75, 0, 0.03, 0.3, 0.03);
    lamp(W * 0.38, -0.2, D * 0.38);
  } else if (kind === 'bucket') {
    // A big wooden tub hung in an iron yoke from the ceiling. It tips and the water falls the
    // whole way to the floor.
    const [W, D] = ceilMount();
    for (const sx of [-1, 1]) B(0x2a2826, sx * 1.0, -0.5, 0, 0.1, 0.9, 0.14);                 // yoke arms
    const tip = new THREE.Group(); tip.position.y = -0.95; add(tip); g.userData.tip = tip;
    const ax = P(cyl(0.06, 0.06, 2.1, 6), 0x2a2826, 0, -0.95, 0); ax.rotation.z = Math.PI / 2;
    tip.add(part(cyl(0.9, 0.72, 1.1, 14), 0x8a6a48, 0, -0.35, 0, 1, 1, 1, !ghost));
    for (const y of [-0.05, -0.65]) { const band = new THREE.Mesh(new THREE.TorusGeometry(y > -0.3 ? 0.88 : 0.8, 0.035, 4, 24), mat(0x4a4a4a)); band.rotation.x = Math.PI / 2; band.position.y = y; tip.add(band); }
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.84, 18), mat(0x3a7ad8)); water.rotation.x = -Math.PI / 2; water.position.y = 0.16; tip.add(water);
    lamp(W * 0.42, -0.2, D * 0.42);
  } else if (kind === 'salt') {
    // A giant salt shaker hung cap-down from the ceiling; blessed salt rains the whole way down.
    const [W, D] = ceilMount();
    B(0x2a2826, 0, -0.2, 0, 0.06, 0.3, 0.06);
    const sh = new THREE.Group(); sh.position.y = -0.35; add(sh); g.userData.shaker = sh;
    sh.add(part(cyl(0.6, 0.6, 1.5, 14), 0xe8f0f4, 0, -0.8, 0, 1, 1, 1, !ghost));
    sh.add(part(cyl(0.55, 0.55, 1.0, 14), 0xffffff, 0, -0.85, 0, 1, 1, 1, false));
    sh.add(part(cyl(0.62, 0.5, 0.4, 14), 0xb8b8c0, 0, -1.72, 0, 1, 1, 1, !ghost));
    for (let k = 0; k < 7; k++) { const a = k * 0.9, r = k ? 0.28 : 0; sh.add(part(cyl(0.04, 0.04, 0.02, 5), 0x3a3a40, Math.cos(a) * r, -1.93, Math.sin(a) * r, 1, 1, 1, false)); }
    lamp(W * 0.42, -0.2, D * 0.42);
  } else if (kind === 'flypaper') {
    // Sticky yellow ribbons off rolls on two rails along the ceiling. They hang almost to the
    // floor (the renderer sets their length from the ceiling height), flies stuck on.
    const [W, D] = ceilMount();
    const strips = new THREE.Group(); add(strips); g.userData.strips = strips; g.userData.flies = [];
    for (const sz of [-1, 1]) B(0x5a4a3a, 0, -0.14, sz * D * 0.25, W * 0.85, 0.1, 0.1);
    for (let k = 0; k < 6; k++) {
      const x = ((k % 3) - 1) * W * 0.28, z = (Math.floor(k / 3) - 0.5) * D * 0.5;
      P(cyl(0.08, 0.08, 0.24, 6), 0x8a6a40, x, -0.24, z);
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1), new THREE.MeshLambertMaterial({ color: 0xe8d050, side: THREE.DoubleSide, transparent: ghost, opacity: ghost ? 0.5 : 1 }));
      st.position.set(x, -1.2, z); st.rotation.y = k * 0.8; st.userData.strip = true; strips.add(st);
      for (let f = 0; f < 3; f++) { const fly = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 3), mat(0x111111)); fly.position.set(x + (f - 1) * 0.06, -1, z); fly.userData.frac = 0.2 + f * 0.25; strips.add(fly); g.userData.flies.push(fly); }
    }
  } else if (kind === 'trapdoor') {  } else if (kind === 'trapdoor') {
    // A hinged hatch flush with the floor: two plank leaves drop open over a dark chute.
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.88, S * 0.88), new THREE.MeshBasicMaterial({ color: 0x050403 })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.012; add(hole);
    for (const [x, z, sx, sz] of [[0, -h + 0.06, S, 0.12], [0, h - 0.06, S, 0.12], [-h + 0.06, 0, 0.12, S], [h - 0.06, 0, 0.12, S]]) B(0x4a3624, x, 0.03, z, sx, 0.06, sz);
    const leaves = [];
    for (const sd of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(sd * (h - 0.12), 0.045, 0); add(hinge); hinge.userData.sd = sd;
      const L = h - 0.13;
      hinge.add(part(BOX, 0x8a6038, -sd * L / 2, 0, 0, L, 0.05, S * 0.86, !ghost));
      for (const z of [-0.45, 0, 0.45]) hinge.add(part(BOX, 0x5e4026, -sd * L / 2, 0.03, z, L * 0.96, 0.02, 0.03, false));   // plank seams
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 10), mat(0x3a3836)); ring.rotation.x = Math.PI / 2; ring.position.set(-sd * (L - 0.15), 0.035, 0); hinge.add(ring);
      leaves.push(hinge);
    }
    g.userData.leaves = leaves;
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'magnifier') {
    // A big brass magnifying glass on a wall arm, tilted down to focus a sunbeam into the lane.
    B(0x3a3632, 0, 0.6, -0.2, 0.3, 0.5, 0.08);
    const arm = P(cyl(0.04, 0.04, 0.6, 6), 0x9a7a3a, 0, 0.75, 0.1); arm.rotation.x = Math.PI / 2;
    const lens = new THREE.Group(); lens.position.set(0, 0.85, 0.45); lens.rotation.x = -0.6; add(lens); g.userData.lens = lens;
    lens.add(part(new THREE.TorusGeometry(0.42, 0.05, 6, 24), 0xc8a040, 0, 0, 0, 1, 1, 1, !ghost));
    lens.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })));
    lens.add(part(cyl(0.05, 0.06, 0.5, 8), 0x5a3a20, 0, -0.68, 0, 1, 1, 1, !ghost));
    lamp(h - 0.15, 1.05, -0.12);
  } else if (kind === 'knifeblock') {
    // A slanted wooden knife block, a row of black handles sticking out of it.
    B(0x7a4a2a, 0, 0.04, 0, 1.3, 0.08, 1.0);
    const blk = new THREE.Group(); blk.position.set(0, 0.5, 0); blk.rotation.x = -0.35; add(blk);
    blk.add(part(BOX, 0x9a6a3a, 0, 0, 0, 1.1, 0.9, 0.7, !ghost));
    const handles = [];
    for (let k = 0; k < 5; k++) { const hd = part(BOX, 0x1e1a18, (k - 2) * 0.2, 0.62, 0.08 - (k % 2) * 0.14, 0.09, 0.4, 0.12, !ghost); blk.add(hd); handles.push(hd); }
    g.userData.handles = handles;
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'honey') {
    // A honeycomb hanging from the ceiling, honey drooping off it; when it drips, a strand of
    // honey runs the whole way down to the puddle (stretched by the renderer).
    const [W, D] = ceilMount();
    B(0x2a2826, 0, -0.3, 0, 0.06, 0.5, 0.06);
    const comb = new THREE.Group(); comb.position.y = -0.95; add(comb); g.userData.comb = comb;
    comb.add(part(cyl(0.95, 0.8, 0.8, 6), 0xd89a20, 0, 0, 0, 1, 1, 1, !ghost));
    for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.82, 6), mat(0xb87a10)); c.position.set(Math.cos(k * 1.05) * 0.5, 0, Math.sin(k * 1.05) * 0.5); comb.add(c); }
    const drips = [];
    for (let k = 0; k < 5; k++) { const d = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.45, 6), mat(0xe8a820)); d.rotation.x = Math.PI; d.position.set(Math.cos(k * 1.3) * 0.45, -0.6, Math.sin(k * 1.3) * 0.45); comb.add(d); drips.push(d); }
    g.userData.drips = drips;
    if (!ghost) { const strand = new THREE.Mesh(cyl(0.06, 0.03, 1, 6), new THREE.MeshBasicMaterial({ color: 0xe8a820, transparent: true, opacity: 0.85 })); strand.visible = false; add(strand); g.userData.strand = strand; }
    lamp(W * 0.42, -0.2, D * 0.42);
  } else if (kind === 'cuckoo') {  } else if (kind === 'cuckoo') {
    // A carved cuckoo clock: a little wooden house with a dial, pine-cone weights on chains,
    // a door the bird pops out of, and a mallet arm that slams down on the lane.
    B(0x6a4426, 0, 1.25, -0.12, 0.9, 1.0, 0.3);
    for (const sd of [-1, 1]) { const r = B(0x4a2e18, sd * 0.26, 1.88, -0.1, 0.62, 0.08, 0.42); r.rotation.z = -sd * 0.6; }
    const dial = P(cyl(0.26, 0.26, 0.03, 16), 0xf0e8d0, 0, 1.12, 0.05); dial.rotation.x = Math.PI / 2;
    B(0x1a1a1a, 0, 1.18, 0.07, 0.03, 0.15, 0.01); B(0x1a1a1a, 0.05, 1.12, 0.07, 0.11, 0.025, 0.01);
    B(0x3a2414, 0, 1.6, 0.04, 0.2, 0.2, 0.02);
    g.userData.bird = B(0xe0c040, 0, 1.6, 0.0, 0.12, 0.1, 0.16);
    for (const x of [-0.2, 0.2]) { B(0x2a2a2a, x, 0.55, -0.05, 0.015, 0.4, 0.015); P(cyl(0.06, 0.09, 0.25, 6), 0x5a3a1a, x, 0.25, -0.05); }
    // The mallet hangs beside the house (so it doesn't hide the dial) and swings down onto the lane.
    const ham = new THREE.Group(); ham.position.set(0.6, 0.95, 0.1); ham.rotation.x = -0.9; add(ham); g.userData.hammer = ham;
    ham.add(part(BOX, 0x8a6a48, 0, 0, 0.65, 0.1, 0.1, 1.3, !ghost));
    ham.add(part(BOX, 0x5a3a20, 0, -0.08, 1.3, 0.5, 0.36, 0.36, !ghost));
    lamp(h - 0.15, 1.95, -0.12);
  } else if (kind === 'chandelier') {
    // An iron ring of candles hung on a chain; the ring (body) drops when it falls.
    P(cyl(0.45, 0.3, 0.16, 12), 0x2a2826, 0, -0.08, 0);                                       // (v0.31) ceiling rose: it's fixed to the ceiling
    const chain = B(0x2a2826, 0, -0.65, 0, 0.04, 1.3, 0.04); g.userData.chain = chain;
    const body = new THREE.Group(); body.position.y = -1.3; add(body); g.userData.body = body;
    const ring = part(new THREE.TorusGeometry(1.1, 0.07, 6, 24), 0x3a3632, 0, 0, 0, 1, 1, 1, !ghost); ring.rotation.x = Math.PI / 2; body.add(ring);
    for (const r of [0, Math.PI / 2]) { const sp = part(BOX, 0x3a3632, 0, 0, 0, 2.2, 0.05, 0.05, false); sp.rotation.y = r; body.add(sp); }
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, x = Math.cos(a) * 1.1, z = Math.sin(a) * 1.1;
      body.add(part(cyl(0.06, 0.06, 0.28, 6), 0xf0e8d8, x, 0.17, z, 1, 1, 1, false));
      if (!ghost) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 5), new THREE.MeshBasicMaterial({ color: 0xffb040 })); fl.position.set(x, 0.38, z); body.add(fl); }
    }
    lamp(0.6, -0.15, 0);
  } else if (kind === 'kettle') {
    // A dented enamel kettle on the table top: steams out of the spout when it boils.
    P(new THREE.SphereGeometry(0.45, 12, 8), 0x3a6a9a, 0, 0.38, 0, 1, 0.8, 1);
    const lid = new THREE.Group(); lid.position.y = 0.72; add(lid); g.userData.lid = lid;
    lid.add(part(cyl(0.2, 0.24, 0.07, 10), 0x3a6a9a, 0, 0, 0, 1, 1, 1, !ghost)); lid.add(part(new THREE.SphereGeometry(0.06, 6, 5), 0x1a1a1a, 0, 0.07, 0, 1, 1, 1, false));
    const sp = P(cyl(0.04, 0.08, 0.5, 8), 0x3a6a9a, 0.46, 0.45, 0); sp.rotation.z = -0.9;
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 5, 12, Math.PI), mat(0x1a1a1a)); hd.position.y = 0.72; add(hd);
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'spicejar') {
    // A glass pepper jar with a perforated cap; it tips over to shake out a cloud.
    const jar = new THREE.Group(); add(jar); g.userData.jar = jar;
    jar.add(part(cyl(0.21, 0.21, 0.42, 10), 0x8a2a14, 0, 0.23, 0, 1, 1, 1, false));
    jar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 12), new THREE.MeshLambertMaterial({ color: 0xd8e8f0, transparent: true, opacity: 0.4, depthWrite: false }))); jar.children[1].position.y = 0.31;
    jar.add(part(cyl(0.26, 0.26, 0.1, 12), 0x2a2a2a, 0, 0.66, 0, 1, 1, 1, !ghost));
    jar.add(part(BOX, 0xf0e4c8, 0, 0.32, 0.25, 0.3, 0.18, 0.01, false));
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'stickyjam') {
    // A glossy puddle of berry jam spreading from a tipped-over jar.
    const jam = new THREE.MeshLambertMaterial({ color: 0x8a1830, emissive: 0x2a0410, transparent: ghost, opacity: ghost ? 0.5 : 1 });
    for (const [x, z, r] of [[0, 0, 0.75], [-0.4, 0.35, 0.45], [0.45, -0.3, 0.5], [0.3, 0.5, 0.35], [-0.5, -0.45, 0.35]]) { const p = new THREE.Mesh(cyl(r, r, 0.04, 14), jam); p.position.set(x, 0.025, z); add(p); }
    for (let k = 0; k < 6; k++) P(new THREE.SphereGeometry(0.08, 6, 5), 0x5a0a20, Math.cos(k * 1.9) * 0.5, 0.07, Math.sin(k * 1.9) * 0.5);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12), new THREE.MeshLambertMaterial({ color: 0xd8e8f0, transparent: true, opacity: 0.4, depthWrite: false }));
    jar.rotation.z = Math.PI / 2; jar.position.set(-0.55, 0.28, -0.55); add(jar);
    const fill = P(cyl(0.24, 0.24, 0.5, 10), 0x8a1830, -0.55, 0.25, -0.55); fill.rotation.z = Math.PI / 2;
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'pincushion') {
    // A fat red tomato pin cushion sunk in the floor, bristling with pins.
    B(0x4a3624, 0, 0.04, 0, S * 0.9, 0.08, S * 0.9);
    P(new THREE.SphereGeometry(0.75, 14, 8), 0xc0281e, 0, 0.12, 0, 1, 0.38, 1);
    for (let k = 0; k < 5; k++) { const seam = B(0x8a1a14, 0, 0.3, 0, 0.03, 0.05, 1.45); seam.rotation.y = k * Math.PI / 5; }
    const pins = new THREE.Group(); add(pins); g.userData.pins = pins;
    for (let k = 0; k < 12; k++) {
      const a = k * 2.4, r = 0.2 + (k % 4) * 0.14, pin = new THREE.Group(); pin.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r); pin.rotation.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3); pins.add(pin);
      pin.add(part(cyl(0.012, 0.012, 0.45, 4), 0xc8c8cc, 0, 0.22, 0, 1, 1, 1, false));
      pin.add(part(new THREE.SphereGeometry(0.05, 6, 5), [0xf0d040, 0x3a6ad8, 0xf0f0f0, 0x40a040][k % 4], 0, 0.46, 0, 1, 1, 1, false));
    }
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'catapult') {
    // A big wooden spoon on a sprung hinge: the bowl at the back flips up and over to the
    // front (the arrow), lobbing whatever was in it.
    B(0x4d4a46, 0, 0.05, 0, S * 0.96, 0.1, S * 0.96);
    B(0x5a3a20, 0, 0.2, 0.45, 0.6, 0.3, 0.2);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.32, 0.45); add(hinge); g.userData.hinge = hinge;
    hinge.add(part(BOX, 0xb08850, 0, 0, -0.5, 0.16, 0.08, 1.0, !ghost));
    hinge.add(part(new THREE.SphereGeometry(0.38, 12, 8), 0xb08850, 0, 0.04, -1.0, 1, 0.32, 1.2, !ghost));   // the spoon's bowl
    const arrow = P(new THREE.ConeGeometry(0.22, 0.45, 3), 0xd8c048, 0, 0.18, 0.75); arrow.rotation.x = Math.PI / 2;
    lamp(h - 0.15, 0.4, -h + 0.15);
  } else if (kind === 'pans') {
    // A rack of heavy iron pans on a rail hung from the ceiling; one drops the whole way down.
    const [W, D] = ceilMount();
    for (const x of [-W * 0.38, W * 0.38]) B(0x2a2826, x, -0.35, 0, 0.04, 0.6, 0.04);
    B(0x3a3632, 0, -0.66, 0, W * 0.85, 0.1, 0.1);
    const pans = [];
    for (const x of [-0.42, -0.14, 0.14, 0.42]) {
      const pg = new THREE.Group(); pg.position.set(x * W, -0.66, 0); add(pg); pans.push(pg);
      pg.add(part(BOX, 0x1e1c1a, 0, -0.3, 0, 0.07, 0.55, 0.05, false));
      const pan = part(cyl(0.42, 0.36, 0.1, 16), 0x2a2826, 0, -0.95, 0, 1, 1, 1, !ghost); pan.rotation.x = Math.PI / 2; pg.add(pan);
    }
    g.userData.pans = pans;
    lamp(W * 0.42, -0.2, D * 0.38);
  } else if (kind === 'firecracker') {
    // A bundle of red paper bangers with a fuse; once it's gone off, a scorch mark.
    const body = new THREE.Group(); add(body); g.userData.body = body;
    for (const [x, z] of [[0, 0], [0.32, 0.1], [-0.2, 0.28], [0.1, -0.3]]) {
      body.add(part(cyl(0.16, 0.16, 0.8, 10), 0xc8281e, x, 0.4, z, 1, 1, 1, !ghost));
      for (const y of [0.15, 0.65]) body.add(part(cyl(0.165, 0.165, 0.06, 10), 0xe0b030, x, y, z, 1, 1, 1, false));
    }
    body.add(part(cyl(0.02, 0.02, 0.4, 4), 0x2a2420, 0, 0.98, 0, 1, 1, 1, false));
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd040 })); spark.position.y = 1.2; spark.visible = false; body.add(spark); g.userData.spark = spark;
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.7, depthWrite: false })); scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.02; scorch.visible = false; add(scorch); g.userData.scorch = scorch;
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'wheel') {
    // A wire hamster wheel on a stand. It spins while a mouse is running in it.
    for (const x of [-0.35, 0.35]) { const leg = B(0x8a8a90, x, 0.45, 0, 0.05, 0.9, 0.05); leg.rotation.z = x > 0 ? 0.2 : -0.2; }
    const wheel = new THREE.Group(); wheel.position.y = 0.9; add(wheel); g.userData.wheel = wheel;
    for (const x of [-0.3, 0.3]) { const r = part(new THREE.TorusGeometry(0.8, 0.035, 5, 20), 0xb8b8c0, x, 0, 0, 1, 1, 1, !ghost); r.rotation.y = Math.PI / 2; wheel.add(r); }
    for (let k = 0; k < 14; k++) { const a = k * Math.PI / 7, rung = part(cyl(0.015, 0.015, 0.6, 4), 0xa0a0a8, 0, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 1, 1, 1, false); rung.rotation.z = Math.PI / 2; wheel.add(rung); }   // the rungs it runs on
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'cord') {
    // A frayed lamp cord lying across the floor (3 units along x): bare copper in the middle, a plug at one end.
    const c1 = P(cyl(0.06, 0.06, 1.2, 6), 0xe8e0d0, -0.85, 0.06, 0); c1.rotation.z = Math.PI / 2;
    const c2 = P(cyl(0.06, 0.06, 1.2, 6), 0xe8e0d0, 0.85, 0.06, 0.05); c2.rotation.z = Math.PI / 2;
    for (let k = 0; k < 6; k++) { const w = P(cyl(0.012, 0.012, 0.35, 3), 0xd07a30, -0.2 + k * 0.08, 0.07, (k % 3 - 1) * 0.06); w.rotation.z = Math.PI / 2 + (k % 2 ? 0.4 : -0.4); }
    B(0xe8e0d0, 1.45, 0.1, 0.05, 0.14, 0.18, 0.2); for (const z of [-0.05, 0.15]) B(0xc0a040, 1.56, 0.12, z, 0.1, 0.03, 0.03);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), new THREE.MeshBasicMaterial({ color: 0x2a2420, transparent: true, opacity: 0.35, depthWrite: false })); scorch.rotation.x = -Math.PI / 2; scorch.position.set(0, 0.015, 0); add(scorch);   // scorched where it sparks
    lamp(1.4, 0.35, 0.4);
  } else if (kind === 'peg') {
    // A giant wooden clothes peg on its side: the top jaw springs shut on whatever steps in.
    B(0xb89068, 0, 0.12, 0, 1.6, 0.18, 0.3);
    const jaw = new THREE.Group(); jaw.position.set(0.3, 0.22, 0); add(jaw); g.userData.jaw = jaw;
    jaw.add(part(BOX, 0xb89068, -0.3, 0.1, 0, 1.6, 0.18, 0.3, !ghost));
    const spring = part(new THREE.TorusGeometry(0.16, 0.035, 5, 12), 0xb0b0b8, 0.3, 0.25, 0, 1, 1, 1, false); spring.rotation.y = Math.PI / 2; add(spring);
    lamp(h - 0.15, 0.35, -h + 0.15);
  } else if (kind === 'bubbles') {
    // A brass bubble machine set in the ceiling: a soap drum and a pipe that blows bubbles
    // down round the mice below.
    const [W, D] = ceilMount();
    P(cyl(0.7, 0.7, 0.6, 14), 0xc89a3a, 0, -0.4, 0);
    P(cyl(0.72, 0.72, 0.06, 14), 0x8a6a28, 0, -0.72, 0);
    const pipe = new THREE.Group(); pipe.position.y = -0.85; add(pipe); g.userData.pipe = pipe;
    const stem = part(cyl(0.06, 0.06, 1.2, 6), 0x7a4a2a, 0.4, 0, 0, 1, 1, 1, !ghost); stem.rotation.z = 1.2; pipe.add(stem);
    pipe.add(part(cyl(0.26, 0.2, 0.4, 10), 0x7a4a2a, -0.2, -0.2, 0, 1, 1, 1, !ghost));
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16 + k * 0.05, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.35, depthWrite: false })); b.position.set(-0.4 - k * 0.25, -0.6 - k * 0.25, 0.12 * k); pipe.add(b); }
    lamp(W * 0.42, -0.2, D * 0.42);
  }
  if (ghost) g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; o.material.depthWrite = false; } });
  return g;
}
// A falling iron pan (Dropping Pans).
export function makePan() {
  const g = new THREE.Group();
  g.add(part(cyl(0.3, 0.26, 0.08, 14), 0x2a2826, 0, 0, 0, 1, 1, 1, true));
  g.add(part(BOX, 0x1e1c1a, 0, 0, 0.5, 0.06, 0.04, 0.5, false));
  return g;
}
// A thrown kitchen knife (Knife Block): steel blade, black handle, along +z.
export function makeKnife() {
  const g = new THREE.Group();
  g.add(part(BOX, 0xd8dce0, 0, 0, 0.18, 0.03, 0.09, 0.4, false));
  g.add(part(BOX, 0x1e1a18, 0, 0, -0.12, 0.05, 0.08, 0.22, false));
  return g;
}
// Hypno Wheel face: a black-and-white spiral drawn once onto a canvas.
let SPIRAL = null;
function spiralTexture() {
  if (SPIRAL) return SPIRAL;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#111'; x.lineWidth = 9; x.beginPath();
  for (let a = 0; a < Math.PI * 10; a += 0.05) { const r = a * 2; const px = 64 + Math.cos(a) * r, py = 64 + Math.sin(a) * r; if (a === 0) x.moveTo(px, py); else x.lineTo(px, py); }
  x.stroke();
  SPIRAL = new THREE.CanvasTexture(c); return SPIRAL;
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
// Humans (scenery, never hazards): full size, about 6 units (1.8 m) tall, so a cat comes up
// to their ankle. kind: guard | shopper | stablehand | cook. userData: legs, arms for walking.
export function makeHuman(kind, seed = 0) {
  const g = new THREE.Group(), R = (k) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const pick = (arr, k) => arr[Math.floor(R(k) * arr.length)];
  const skin = pick([0xe8c0a0, 0xc89878, 0x8a5a3a, 0xf0d0b8], 1);
  const look = {
    guard: { shirt: 0x8a8a92, legs: 0x4a4038, shoe: 0x2a2018, hat: 'helmet' },
    shopper: { shirt: pick([0x9a3a3a, 0x3a5a9a, 0x6a8a3a, 0x8a6a3a, 0x7a4a8a], 2), legs: pick([0x5a4a3a, 0x3a3a4a, 0x6a5a40], 3), shoe: 0x3a2a1a, hat: pick(['none', 'hood', 'cap'], 4), basket: R(5) < 0.6 },
    stablehand: { shirt: 0xb89a6a, legs: 0x5a4028, shoe: 0x2a1a10, hat: 'straw' },
    cook: { shirt: 0xf0ece4, legs: 0x4a4a4a, shoe: 0x222222, hat: 'chef', apron: true },
  }[kind] || {};
  const P = (geo, c, x, y, z, line = true) => { const m = part(geo, c, x, y, z, 1, 1, 1, line); return m; };
  const legs = [], arms = [];
  for (const sx of [-0.35, 0.35]) {   // hips at y 3.0
    const hip = new THREE.Group(); hip.position.set(sx, 3.0, 0); g.add(hip); legs.push(hip);
    hip.add(P(new THREE.BoxGeometry(0.42, 2.8, 0.45), look.legs, 0, -1.4, 0));
    hip.add(P(new THREE.BoxGeometry(0.48, 0.3, 0.95), look.shoe, 0, -2.85, 0.2));
  }
  g.add(P(new THREE.BoxGeometry(1.25, 2.1, 0.7), look.shirt, 0, 4.05, 0));           // body
  if (look.apron) g.add(P(new THREE.BoxGeometry(1.0, 2.2, 0.05), 0xffffff, 0, 3.5, 0.38, false));
  for (const sx of [-0.8, 0.8]) {   // shoulders at y 5
    const sh = new THREE.Group(); sh.position.set(sx, 5.0, 0); g.add(sh); arms.push(sh);
    sh.add(P(new THREE.BoxGeometry(0.32, 1.9, 0.36), look.shirt, 0, -0.95, 0));
    sh.add(P(new THREE.BoxGeometry(0.3, 0.32, 0.32), skin, 0, -2.0, 0));
  }
  const head = P(new THREE.BoxGeometry(0.75, 0.85, 0.75), skin, 0, 5.65, 0); g.add(head);
  for (const ex of [-0.17, 0.17]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), mat(0x1a1a1a)); e.position.set(ex, 5.75, 0.38); g.add(e); }
  if (look.hat === 'helmet') { g.add(P(new THREE.SphereGeometry(0.48, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a9aa2, 0, 5.95, 0)); const sp = P(new THREE.CylinderGeometry(0.05, 0.05, 8, 6), 0x6a4a2a, 0.95, 4.2, 0.3); g.add(sp); g.add(P(new THREE.ConeGeometry(0.14, 0.5, 6), 0xb0b0b8, 0.95, 8.4, 0.3)); }
  else if (look.hat === 'straw') { g.add(P(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 14), 0xe0c070, 0, 6.1, 0)); g.add(P(new THREE.CylinderGeometry(0.38, 0.42, 0.35, 12), 0xe0c070, 0, 6.28, 0)); }
  else if (look.hat === 'chef') { g.add(P(new THREE.CylinderGeometry(0.4, 0.38, 0.45, 12), 0xffffff, 0, 6.25, 0)); g.add(P(new THREE.SphereGeometry(0.5, 10, 8), 0xffffff, 0, 6.6, 0)); }
  else if (look.hat === 'hood') g.add(P(new THREE.BoxGeometry(0.85, 0.5, 0.85), look.shirt, 0, 6.05, -0.05));
  else if (look.hat === 'cap') g.add(P(new THREE.BoxGeometry(0.8, 0.22, 0.85), 0x4a3a2a, 0, 6.15, 0.05));
  if (look.basket) { const b = P(new THREE.CylinderGeometry(0.45, 0.35, 0.5, 10), 0xb8904a, 0, -2.3, 0.3); arms[1].add(b); }
  if (kind === 'stablehand') { const fork = P(new THREE.CylinderGeometry(0.04, 0.04, 5, 6), 0x8a6a40, 0, -1.6, 0.4); fork.rotation.x = 0.2; arms[0].add(fork); }
  g.userData = { legs, arms };
  return g;
}

export function makeFurniture(f) {
  if (f.visH) f = { ...f, h: f.visH, look: 'curb', tex: 'stone', tint: 0xb8b0a4 };   // a wall drawn low (a curb): the collider stays tall, so nobody leaves the map
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
    case 'stairs': {
      // Treads 1 unit deep (30 cm), each half a unit higher (15 cm), on a solid stone or plank base.
      const { axis, from, to } = f.stairs, run = axis === 'x' ? w : d, n = Math.max(1, Math.round(run)), wood = f.tex === 'planks';
      for (let k = 0; k < n; k++) {
        const top = from + (to - from) * (k + 1) / n, a = -run / 2 + (k + 0.5) * run / n;
        const [px, pz, sx, sz] = axis === 'x' ? [a, 0, run / n, d] : [0, a, w, run / n];
        TB(wood ? 'planks' : 'stone', wood ? 2 : 4, wood ? 0xa07c58 : 0xc8beb0, px, top / 2, pz, sx, Math.max(0.05, top), sz, k === 0 || k === n - 1);
        B(0x3e3a34, px, top - 0.03, pz, axis === 'x' ? 0.08 : w, 0.06, axis === 'x' ? d : 0.08, false);   // tread edge
      }
      break;
    }
    case 'hearth': {
      // The spit hearth: a low ring of stones round a log fire (the flames are the fire effect),
      // iron uprights and a spit across with something roasting on it.
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; B(0x8a8278, Math.cos(a) * (w / 2 - 0.5), 0.45, Math.sin(a) * (d / 2 - 0.5), 1.1, 0.9, 1.1); }
      for (const r of [0.5, -0.6, 1.6]) { const l = B(0x4a3020, 0, 0.35, 0, w * 0.55, 0.4, 0.4); l.rotation.y = r; }
      for (const sx of [-1, 1]) B(0x2a2826, sx * (w / 2 - 0.3), 2, 0, 0.2, 4, 0.2, false);
      B(0x2a2826, 0, 3.8, 0, w - 0.4, 0.12, 0.12, false);
      const roast = B(0xa0582a, 0, 3.5, 0, 1.6, 0.9, 0.9); roast.rotation.x = 0.3;
      break;
    }
    case 'horse': {
      // A horse standing in its stall, head to the aisle (+x): 1.6 m at the withers (5.3 units),
      // 2.4 m nose to tail. The collider is the 5-unit box of its back, so cats can hop up on it.
      const c = f.tint || 0x8a5a32, dark = 0x2a1a10;
      B(c, -0.5, 4.0, 0, 6.2, 2.2, 1.9);                                                // barrel
      for (const lx of [-2.9, 2.1]) for (const lz of [-0.55, 0.55]) { B(c, lx, 2.0, lz, 0.55, 3.0, 0.5); B(dark, lx, 0.25, lz, 0.6, 0.5, 0.55, false); }   // legs, hooves
      const neck = B(c, 3.0, 5.0, 0, 1.7, 2.6, 0.95); neck.rotation.z = -0.8;           // thick, reaching forward
      const head = B(c, 4.3, 5.6, 0, 2.0, 0.85, 0.75); head.rotation.z = -1.0;           // nose down
      B(0x1a1210, 3.9, 6.15, 0.39, 0.15, 0.15, 0.04, false); B(0x1a1210, 3.9, 6.15, -0.39, 0.15, 0.15, 0.04, false);   // eyes
      for (const ez of [-0.25, 0.25]) B(c, 3.55, 6.65, ez, 0.2, 0.5, 0.15, false);       // ears
      const mane = B(dark, 2.55, 5.6, 0, 1.9, 0.35, 0.3, false); mane.rotation.z = -0.8;
      const tail = B(dark, -3.75, 3.6, 0, 0.35, 2.4, 0.35, false); tail.rotation.z = -0.25;
      break;
    }
    case 'tower': {
      // A squat stone watchtower: platform at f.h with merlons round the edge (scenery: no collision).
      TB('stone', 6, 0xd0c8bc, 0, f.h / 2, 0, w, f.h, d);
      TB('planks', 2, 0x9a7a58, 0, f.h + 0.03, 0, w - 0.2, 0.06, d - 0.2, false);
      for (let x = -w / 2 + 0.6; x <= w / 2 - 0.5; x += 2) for (const sz of [-1, 1]) B(0xc0b8aa, x, f.h + 0.6, sz * (d / 2 - 0.35), 1, 1.2, 0.7);
      for (let z = -d / 2 + 2.6; z <= d / 2 - 2.5; z += 2) for (const sx of [-1, 1]) B(0xc0b8aa, sx * (w / 2 - 0.35), f.h + 0.6, z, 0.7, 1.2, 1);
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
      for (let pz = 0; pz < d; pz += 4) for (const px of f.legs === 'west' ? [0.5] : f.legs === 'east' ? [w - 0.5] : [0.5, w - 0.5]) {   // (v0.31) one side only for an arcade
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
    case 'house': case 'plaster': {
      // Building backs (market, stables) and indoor walls: stone footing, plaster above,
      // dark timber beams on the 'house' look.
      const H = f.h;
      TB('stone', 6, 0xc8beb0, 0, 1.5, 0, w, 3, d);
      TB('plaster', 4, f.look === 'house' ? 0xe8dcc4 : 0xd8d0c0, 0, 3 + (H - 3) / 2, 0, w - 0.05, H - 3, d - 0.05, false);
      if (f.look === 'house') {
        const long = w >= d, L = long ? w : d;
        for (let k = -L / 2 + 3; k < L / 2; k += 6) {
          const post = long ? [k, 3 + (H - 3) / 2, 0, 0.5, H - 3, d + 0.04] : [0, 3 + (H - 3) / 2, k, w + 0.04, H - 3, 0.5];
          B(DARKWOOD, ...post, false);
        }
        for (const y of [3.2, 8, H - 0.4]) if (y < H) B(DARKWOOD, 0, y, 0, w + 0.04, 0.4, d + 0.04, false);
      }
      break;
    }
    case 'stall': {
      // Market stall counter seen from behind/below: thick plank top on four legs, with a
      // striped cloth valance (inside the counter's own thickness).
      // The counter (top + valance) is its own group and the legs are kept, so the scene
      // can bring the whole thing down when the cats break the legs (v0.20).
      const counter = new THREE.Group(); g.add(counter); const n0 = g.children.length;
      TB('planks', 2.5, 0xb89068, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (let k = 0; k < Math.floor(w / 1.5); k++) for (const zz of [-d / 2 - 0.01, d / 2 + 0.01])
        B(k % 2 ? 0xc83a2a : 0xf0e4c8, -w / 2 + 0.75 + k * 1.5, (f.bot + f.top) / 2, zz, 1.5, f.top - f.bot, 0.02, false);
      for (const m of g.children.slice(n0)) counter.add(m);   // (TB/B add to g; move them into the counter)
      g.userData.counter = counter;
      g.userData.legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => TB('planks', 2, 0x8a6a48, sx * (w / 2 - 0.5), f.bot / 2, sz * (d / 2 - 0.5), 1, f.bot, 1));
      break;
    }
    case 'sacks': {
      // Burlap sacks heaped together (the food pile sits on top).
      for (let k = 0; k < 4; k++) {
        const sx = (k % 2 - 0.5) * w * 0.45, sz = (Math.floor(k / 2) - 0.5) * d * 0.45;
        const sack = part(new THREE.SphereGeometry(Math.min(w, d) * 0.3, 8, 6), 0xa08a5a, sx, f.h * 0.45, sz, 1, f.h / (Math.min(w, d) * 0.6), 1); g.add(sack);
      }
      break;
    }
    case 'partition': TB('planks', 2, 0x8a6a48, 0, f.h / 2, 0, w, f.h, d); break;
    case 'fence': {
      const long = w >= d, L = long ? w : d;
      for (let k = -L / 2; k <= L / 2 + 0.01; k += 3) TB('planks', 2, 0x7a5a38, long ? k : 0, f.h / 2, long ? 0 : k, long ? 0.3 : w, f.h, long ? d : 0.3);
      for (const y of [f.h * 0.45, f.h * 0.9]) TB('planks', 2, 0x9a7a58, 0, y, 0, w, 0.15, d, false);
      break;
    }
    case 'loft': {
      // Hay loft floor over the stable aisle, on posts; hay spilling over the edge.
      TB('planks', 3, 0x9a7a58, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (let pz = 0; pz < d; pz += 4) for (const px of [0.5, w - 0.5]) TB('planks', 2, 0x6e5030, -w / 2 + px, f.bot / 2, -d / 2 + pz + 0.5, 1, f.bot, 1);
      B(0xc8a858, 0, f.top + 0.01, 0, w * 0.9, 0.02, d * 0.95, false);
      break;
    }
    case 'vault': case 'beams': {
      if (w * d > 300) g.userData.noCast = true;   // (v0.31) a room's ceiling: light comes in the high windows, so it throws no shadow
      TB(f.look === 'vault' ? 'stone' : 'planks', 4, f.look === 'vault' ? 0x9a9288 : 0xb09070, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d, false);
      for (let z = -d / 2 + 3; z < d / 2; z += 6) B(f.look === 'vault' ? 0x4e4840 : DARKWOOD, 0, f.bot + 0.15, z, w, 0.3, 0.6, false);   // ribs / beams
      // (v0.31) Sheds and lean-tos stand on posts (where the map makes them solid).
      const post = (px, pz) => TB('planks', 2, 0x6e5030, px, f.bot / 2, pz, 1, f.bot, 1);
      if (f.legs === 'corners') for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(sx * (w / 2 - 0.5), sz * (d / 2 - 0.5));
      if (f.legs === 'west' || f.legs === 'east') for (let pz = 0; pz < d; pz += 4) post((f.legs === 'west' ? -1 : 1) * (w / 2 - 0.5), -d / 2 + pz + 0.5);
      break;
    }
    case 'winerack': {
      TB('planks', 2, 0x4a3422, 0, f.h / 2, 0, w, f.h, d);
      // Bottle ends poking out of both faces (inside the rack's footprint).
      const long = w >= d, L = long ? w : d;
      for (let k = -L / 2 + 0.6; k < L / 2; k += 0.9) for (let y = 0.6; y < f.h - 0.3; y += 0.9) for (const sgn of [-1, 1]) {
        const b = part(new THREE.CircleGeometry(0.22, 8), (Math.round(k * 7 + y * 3) % 3) ? 0x1a3a1a : 0x3a1a1a, long ? k : sgn * (w / 2 + 0.005), y, long ? sgn * (d / 2 + 0.005) : k, 1, 1, 1, false);
        b.rotation.y = long ? (sgn > 0 ? 0 : Math.PI) : sgn * Math.PI / 2; g.add(b);
      }
      break;
    }
    case 'cheesewheel': {
      const r = Math.min(w, d) / 2;
      outline(TC('plaster', 2, 0xf0c838, cyl(r, r, f.h, 24), 0, f.h / 2, 0), 1.01);
      g.add(part(cyl(r * 0.98, r * 0.98, 0.05, 24), 0xd8a828, 0, f.h + 0.01, 0, 1, 1, 1, false));
      for (const [a, y, rr] of [[0.3, 1, 0.35], [1.5, 2, 0.25], [2.8, 1.4, 0.4], [4.2, 0.8, 0.3], [5.4, 2.2, 0.2]]) {
        const hole = part(new THREE.CircleGeometry(rr, 10), 0xc89a20, Math.sin(a) * (r + 0.01), y, Math.cos(a) * (r + 0.01), 1, 1, 1, false); hole.rotation.y = a; g.add(hole);
      }
      break;
    }
    case 'counter': {
      // Kitchen counter: thick scrubbed top on chunky legs; you live underneath.
      TB('planks', 3, 0xd8c0a0, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) TB('planks', 2, 0x8a6a48, sx * (w / 2 - 0.5), f.bot / 2, sz * (d / 2 - 0.5), 1, f.bot, 1);
      B(DARKWOOD, 0, f.bot - 0.2, 0, w - 1, 0.25, 0.25, false);
      break;
    }
    case 'oven': {
      // Brick oven / hearth with a glowing arched mouth facing the room (+z).
      TB('stone', 3, 0xb06a4a, 0, f.h / 2, 0, w, f.h, d);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, f.h) * 0.25, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff7a20 }));
      mouth.position.set(0, f.h * 0.25, d / 2 + 0.02); g.add(mouth);
      const sq = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, f.h) * 0.5, f.h * 0.25), new THREE.MeshBasicMaterial({ color: 0xff7a20 }));
      sq.position.set(0, f.h * 0.125, d / 2 + 0.02); g.add(sq);
      break;
    }
    case 'basket': {
      const r = Math.min(w, d) / 2;
      outline(TC('planks', 1, 0xc8a060, cyl(r, r * 0.85, f.h, 12), 0, f.h / 2, 0), 1.03);
      for (let y = 0.2; y < f.h; y += 0.3) g.add(part(cyl(r * 1.01, r * 1.01, 0.05, 12), 0x8a6a38, 0, y, 0, 1, 1, 1, false));
      break;
    }
    // ---- v0.31: the high road. Boards, beams and shelves the rats run along, up off the floor.
    case 'plank': {
      // A rough board laid across the crates (or between racks): cleats under it, nail heads.
      const long = w >= d, L = long ? w : d, th = f.top - f.bot;
      TB('planks', 2, 0xa88a62, 0, (f.bot + f.top) / 2, 0, w, th, d);
      for (let k = -L / 2 + 1; k < L / 2; k += 3) B(0x6e5030, long ? k : 0, f.bot - 0.05, long ? 0 : k, long ? 0.3 : w * 0.9, 0.1, long ? d * 0.9 : 0.3, false);
      for (let k = -L / 2 + 0.5; k < L / 2; k += 1.5) for (const o of [-0.3, 0.3]) B(0x2a2622, long ? k : o * w, f.top + 0.005, long ? o * d : k, 0.06, 0.01, 0.06, false);
      break;
    }
    case 'beam': {
      // A squared timber with iron straps, hung on short iron hangers from whatever is above
      // (the vault, the rafters). A pot rack gets copper pots on hooks under it.
      const long = w >= d, L = long ? w : d, th = f.top - f.bot;
      TB('planks', 3, 0x7a5a3a, 0, (f.bot + f.top) / 2, 0, w, th, d);
      for (let k = -L / 2 + 1.5; k < L / 2; k += 4) B(0x2a2622, long ? k : 0, (f.bot + f.top) / 2, long ? 0 : k, long ? 0.15 : w + 0.04, th + 0.04, long ? d + 0.04 : 0.15, false);
      const up = f.hang || 2.5;   // how far the hangers reach up
      for (let k = -L / 2 + 2; k < L / 2; k += 7) for (const o of [-0.3, 0.3]) B(0x2a2826, long ? k : o * w, f.top + up / 2, long ? o * d : k, 0.06, up, 0.06, false);
      if (/pot rack/i.test(f.name)) for (let k = -L / 2 + 3; k < L / 2; k += 4.5) {
        const sd = (Math.round(k) % 2 ? 1 : -1) * (long ? d : w) * 0.3;
        B(0x2a2622, long ? k : sd, f.bot - 0.3, long ? sd : k, 0.04, 0.6, 0.04, false);
        const pot = part(cyl(0.45, 0.4, 0.5, 12), 0xb8683a, long ? k : sd, f.bot - 0.85, long ? sd : k); g.add(pot);
      }
      break;
    }
    case 'shelfboard': {
      // A long shelf on iron brackets against the wall, jars and crocks along the back.
      const long = w >= d, L = long ? w : d, th = f.top - f.bot;
      TB('planks', 2, 0x9a7a52, 0, (f.bot + f.top) / 2, 0, w, th, d);
      for (let k = -L / 2 + 1; k < L / 2; k += 3.5) {
        B(0x2a2826, long ? k : 0, f.bot - 0.45, long ? 0 : k, long ? 0.08 : w * 0.8, 0.9, long ? d * 0.8 : 0.08, false);
        B(0x2a2826, long ? k : 0, f.bot - 0.05, long ? 0 : k, long ? 0.08 : w * 0.9, 0.1, long ? d * 0.9 : 0.08, false);
      }
      for (let k = -L / 2 + 0.8; k < L / 2; k += 2.6) if ((Math.round(k * 3) % 5) < 2) g.add(part(cyl(0.22, 0.26, 0.55, 8), [0x8a5a3a, 0x5a6a4a, 0xc8b8a0][Math.abs(Math.round(k)) % 3], long ? k : w * 0.25, f.top + 0.27, long ? d * 0.25 : k));   // to one side: the rats run past them
      break;
    }
    default: TB(f.tex || 'planks', 3, f.tint || 0xb08a60, 0, (f.h || 1) / 2, 0, w, f.h || 1, d);
  }
  return g;
}

// Knock-over props: small human things on tables, counters and shelves. Origin = base.
export function makeProp(kind) {
  const g = new THREE.Group();
  if (kind === 'pot') {
    g.add(part(new THREE.CylinderGeometry(0.32, 0.25, 0.6, 12), 0xb8643a, 0, 0.3, 0));
    const rim = part(new THREE.TorusGeometry(0.3, 0.05, 6, 14), 0x9a4a2a, 0, 0.6, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
  } else if (kind === 'jug') {
    g.add(part(new THREE.SphereGeometry(0.3, 12, 8), 0xd8d0c0, 0, 0.32, 0, 1, 1.1, 1));
    g.add(part(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 10), 0xd8d0c0, 0, 0.75, 0));
  } else if (kind === 'bucket') {
    g.add(part(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 12), 0x8a6a48, 0, 0.3, 0));
    g.add(part(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 12), 0x2e2c2a, 0, 0.5, 0, 1, 1, 1, false));
  } else {
    g.add(part(new THREE.CylinderGeometry(0.4, 0.32, 0.45, 12), 0xc8a060, 0, 0.22, 0));   // basket
    for (let k = 0; k < 4; k++) g.add(part(new THREE.SphereGeometry(0.12, 6, 5), [0xc83a2a, 0xe0c040, 0x6aa040, 0xc83a2a][k], Math.cos(k * 1.6) * 0.18, 0.48, Math.sin(k * 1.6) * 0.18, 1, 1, 1, false));
  }
  return g;
}

// ---------- things that fall over (0.17) ----------
// A tall shelf, built so it falls toward local +x: the group's origin is the front-bottom
// edge it tips over on. Body spans x -thick..0, y 0..h, z -len/2..len/2. The scene turns
// the group to face the shelf's fall direction and tilts the inner group about z.
export function makeShelf(sh) {
  const outer = new THREE.Group(), tilt = new THREE.Group(); outer.add(tilt);
  const along = sh.dir[0] !== 0, [x0, z0, x1, z1] = sh.rect;
  const thick = along ? x1 - x0 : z1 - z0, len = along ? z1 - z0 : x1 - x0, h = sh.h;
  const wood = 0x8a5a34, dark = 0x5e3c22, cx = -thick / 2;
  tilt.add(box(wood, cx, h / 2, -len / 2 + 0.08, thick, h, 0.16));             // side panels
  tilt.add(box(wood, cx, h / 2, len / 2 - 0.08, thick, h, 0.16));
  tilt.add(box(dark, -thick + 0.05, h / 2, 0, 0.1, h, len, false));             // back
  tilt.add(box(wood, cx, h - 0.08, 0, thick, 0.16, len));                       // top
  tilt.add(box(dark, cx, 0.15, 0, thick, 0.3, len));                            // plinth
  const boards = h >= 7 ? 4 : 3, kind = /linen/i.test(sh.name) ? 'linen' : /boot/i.test(sh.name) ? 'boot' : 'jar';
  for (let b = 1; b <= boards; b++) {
    const y = 0.3 + (h - 0.6) * b / (boards + 1);
    tilt.add(box(wood, cx, y, 0, thick * 0.95, 0.1, len - 0.3, false));
    // What's on it: folded linen, jars or boots (rattles about when hit; spills when it falls).
    const n = Math.max(2, Math.floor((len - 0.6) / 1.1));
    for (let k = 0; k < n; k++) {
      const z = -len / 2 + 0.6 + (len - 1.2) * (k + 0.5) / n, s = 0.85 + ((b * 7 + k * 3) % 5) * 0.06;
      if (kind === 'linen') {
        const col = [0xe8e0d0, 0xb8c8e0, 0xe0b8b8, 0xd0e0c0][(b + k) % 4];
        tilt.add(box(col, cx + 0.05, y + 0.18, z, thick * 0.7, 0.26, 0.9 * s));
        tilt.add(box(col, cx + 0.05, y + 0.44, z, thick * 0.66, 0.24, 0.86 * s));
      } else if (kind === 'boot') {
        const col = [0x4a3424, 0x2e2a28, 0x6a4a2a][(b + k) % 3];
        tilt.add(box(col, cx + 0.05, y + 0.32, z - 0.15, thick * 0.35, 0.55 * s, 0.24));
        tilt.add(box(col, cx + 0.12, y + 0.12, z - 0.15, thick * 0.6, 0.2, 0.26));
        tilt.add(box(col, cx + 0.05, y + 0.32, z + 0.18, thick * 0.35, 0.55 * s, 0.24));
        tilt.add(box(col, cx + 0.12, y + 0.12, z + 0.18, thick * 0.6, 0.2, 0.26));
      } else {
        const col = [0xd8a030, 0x6a8a3a, 0xa02a3a, 0xc87a3a][(b + k) % 4];
        tilt.add(part(cyl(0.24 * s, 0.24 * s, 0.55 * s, 10), col, cx + 0.05, y + 0.05 + 0.28 * s, z));
        tilt.add(part(cyl(0.2 * s, 0.2 * s, 0.08, 10), 0xc8b890, cx + 0.05, y + 0.1 + 0.55 * s, z, 1, 1, 1, false));
      }
    }
  }
  outer.userData = { tilt, thick, len };
  return outer;
}
// A barrel standing upright (centre 1.1 up). The scene lays it on its side to roll it.
const BARREL_GEO = new THREE.LatheGeometry([[0.001, -1.1], [0.72, -1.1], [0.88, -0.55], [0.92, 0], [0.88, 0.55], [0.72, 1.1], [0.001, 1.1]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
export function makeBarrel() {
  const g = new THREE.Group();
  g.add(outline(new THREE.Mesh(BARREL_GEO, mat(0x9a6a3a)), 1.05));
  for (const y of [-0.8, -0.3, 0.3, 0.8]) {
    const r = 0.92 - Math.abs(y) * 0.2, hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 5, 16), mat(0x3a3836)); hoop.rotation.x = Math.PI / 2; hoop.position.y = y; g.add(hoop);
  }
  for (const y of [-1.105, 1.105]) { const lid = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), mat(0x6a4426)); lid.rotation.x = y > 0 ? -Math.PI / 2 : Math.PI / 2; lid.position.y = y; g.add(lid); }
  return g;
}
