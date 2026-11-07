// models.js — every 3D model, built from simple shapes in code.
// Why no asset files: keeps the look consistent (chunky low-poly, flat shaded,
// muted/grubby colours, thick dark outlines) and the repo tiny.
// Scale: 1 unit ≈ 30 cm, so a cat is ~1 unit and furniture towers over it.

import * as THREE from 'three';
import { CELL } from '../sim/map.js';

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
export const makeCat = (kind) => kind === 'puddin' ? makePuddin() : makeFred();

// ---------- traps (built at their real footprint, centred on the origin) ----------
export function makeTrap(kind, ghost = false) {
  const g = new THREE.Group();
  const add = (m) => { g.add(m); return m; };
  const P = (geo, c, x, y, z, sx = 1, sy = 1, sz = 1) => add(part(geo, c, x, y, z, sx, sy, sz, !ghost));
  const B = (c, x, y, z, sx, sy, sz) => P(BOX, c, x, y, z, sx, sy, sz);
  const u = CELL;
  if (kind === 'barricade') {
    // A child's wooden alphabet block: solid, chunky, 1x1 unit.
    B(0xc4a46a, 0, 0.6, 0, 2 * u * 0.98, 1.2, 2 * u * 0.98);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat(0xa8442e));
    face.position.set(0, 0.6, u + 0.001); add(face);
    const face2 = face.clone(); face2.material = mat(0x3e6a8a); face2.rotation.y = Math.PI / 2; face2.position.set(u + 0.001, 0.6, 0); add(face2);
  } else if (kind === 'mousetrap') {
    B(0xb08a58, 0, 0.03, 0, u * 0.95, 0.06, u * 0.7);
    const bar = new THREE.Group(); bar.position.set(0, 0.07, 0); add(bar);
    bar.add(part(new THREE.BoxGeometry(u * 0.9, 0.025, 0.025), 0x9a9a9a, 0, 0, u * 0.3, 1, 1, 1, !ghost));
    bar.rotation.x = -2.6; g.userData.bar = bar;
    P(cyl(0.05, 0.05, 0.02, 3), 0xe0c040, 0, 0.07, -0.05);
  } else if (kind === 'flipper') {
    B(0x4d4a46, 0, 0.03, 0, 2 * u * 0.95, 0.06, 2 * u * 0.95);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.07, -u * 0.95); add(hinge);
    hinge.add(part(BOX, 0x8d7a4f, 0, 0, u * 0.95, 2 * u * 0.88, 0.05, 2 * u * 0.9, !ghost));
    const spring = part(cyl(0.06, 0.06, 0.12, 6), 0xaaaaaa, 0, 0.04, 0.15, 1, 1, 1, false); add(spring);
    g.userData.hinge = hinge;
    const arrow = P(new THREE.ConeGeometry(0.1, 0.22, 3), 0xd8c048, 0, 0.12, 0.2); arrow.rotation.x = Math.PI / 2;
  } else if (kind === 'grinder') {
    // Rotary cheese-grater drum on a wall bracket (local -z is the wall).
    B(0x3c3a38, 0, 0.45, -u * 0.42, 2 * u * 0.95, 0.8, 0.08);
    const drum = new THREE.Group(); drum.position.set(0, 0.28, -0.05); add(drum);
    const c = part(cyl(0.2, 0.2, 2 * u * 0.9, 8), 0xa8a8ac, 0, 0, 0, 1, 1, 1, !ghost); c.rotation.z = Math.PI / 2; drum.add(c);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const tooth = part(new THREE.ConeGeometry(0.03, 0.09, 3), 0xdadade, ((i % 3) - 1) * 0.25, Math.cos(a) * 0.21, Math.sin(a) * 0.21, 1, 1, 1, false); tooth.rotation.x = a; drum.add(tooth); }
    g.userData.drum = drum;
  } else if (kind === 'zapper') {
    // Hangs from the underside; the group origin is moved up to the ceiling by the scene.
    B(0x2f2c29, 0, -0.12, 0, 0.04, 0.24, 0.04);
    B(0x3a4458, 0, -0.38, 0, 0.36, 0.26, 0.36);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x6fb8ff }));
    glow.position.y = -0.4; add(glow); g.userData.glow = glow;
  } else if (kind === 'gluepad') {
    B(0xd8c24a, 0, 0.015, 0, 2 * u * 0.95, 0.03, 2 * u * 0.95);
    const goo = new THREE.Mesh(new THREE.PlaneGeometry(2 * u * 0.85, 2 * u * 0.85), new THREE.MeshLambertMaterial({ color: 0xe9df8a, transparent: true, opacity: 0.8 }));
    goo.rotation.x = -Math.PI / 2; goo.position.y = 0.032; add(goo); g.userData.goo = goo;
  } else if (kind === 'tacks') {
    B(0x6b5a44, 0, 0.015, 0, u * 0.8, 0.03, 2 * u * 0.95);
    for (let i = 0; i < 6; i++) {
      const x = ((i % 2) - 0.5) * 0.2, z = (Math.floor(i / 2) - 1) * 0.3;
      P(cyl(0.06, 0.06, 0.02, 6), [0xc83a2a, 0x2a6ac8, 0xe0c040][i % 3], x, 0.05, z);
      const pin = P(new THREE.ConeGeometry(0.015, 0.08, 4), 0xdadada, x, 0.1, z);
    }
  } else if (kind === 'hairdryer') {
    // Wall-mounted, blowing away from the wall (+z).
    B(0x3c3a38, 0, 0.5, -u * 0.42, 0.5, 0.5, 0.06);
    const body = P(cyl(0.18, 0.2, 0.55, 8), 0xd27aa0, 0, 0.55, -0.1); body.rotation.x = Math.PI / 2;
    const nozzle = P(cyl(0.13, 0.17, 0.2, 8), 0x9a4a72, 0, 0.55, 0.25); nozzle.rotation.x = Math.PI / 2;
    P(BOX, 0x9a4a72, 0, 0.3, -0.12, 0.1, 0.4, 0.12);
    const gust = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    gust.rotation.x = -Math.PI / 2; gust.position.set(0, 0.55, 1.3); add(gust); g.userData.gust = gust;
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
  const leg = 0.5;
  switch (f.look) {
    case 'stone': {
      B(STONE2, 0, f.h / 2, 0, w, f.h, d, false);
      // Mortar courses: thin darker bands, flush with the faces.
      for (let y = 1.2; y < f.h; y += 1.4) B(0x4a453f, 0, y, 0, w + 0.02, 0.08, d + 0.02, false);
      break;
    }
    case 'hallwall': {
      B(STONE2, 0, f.h / 2, 0, w, f.h, d, false);
      for (let y = 1.2; y < f.h; y += 1.4) B(0x4a453f, 0, y, 0, w + 0.02, 0.08, d + 0.02, false);
      // The great hall's human-size door, painted flush on the wall face.
      B(0x4a3220, -w / 2 + 29, 5, d / 2 + 0.01, 9, 10, 0.02, false);
      for (let k = 0; k < 3; k++) B(0x26221e, -w / 2 + 29, 2 + k * 3, d / 2 + 0.02, 9.1, 0.3, 0.02, false);
      break;
    }
    case 'tunnelroof': {
      B(STONE2, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d, false);
      for (let z = -d / 2 + 2; z < d / 2; z += 3) B(0x3e3a34, 0, f.bot + 0.15, z, w, 0.3, 0.6, false);   // ribs under the vault
      break;
    }
    case 'guardhouse': {
      B(0x7a7268, 0, f.h / 2, 0, w, f.h, d);
      for (let y = 1.2; y < f.h; y += 1.4) B(0x5a544c, 0, y, 0, w + 0.02, 0.08, d + 0.02, false);
      B(0x4a3220, 0, 3, d / 2 + 0.01, 3.5, 6, 0.02, false);          // door, flush
      B(0x1a1612, w / 4, 4, d / 2 + 0.01, 2, 1.5, 0.02, false);      // window, flush
      const roof = new THREE.Group(); roof.position.y = f.h;
      const cone = outline(new THREE.Mesh(new THREE.ConeGeometry(0.71, 1, 4, 1), mat(0x4a3a2c)), 1.02);
      cone.rotation.y = Math.PI / 4; cone.position.y = 0.5; roof.add(cone); roof.scale.set(w, 3, d); g.add(roof);
      break;
    }
    case 'barrels': {
      // Barrels packed into the block; the collider is the whole block.
      const r = 0.95;
      for (let bx = -w / 2 + r; bx <= w / 2 - r + 0.01; bx += 2 * r + 0.05)
        for (let bz = -d / 2 + r; bz <= d / 2 - r + 0.01; bz += 2 * r + 0.05) {
          g.add(part(cyl(r * 0.92, r, f.h, 10), 0x7a5634, bx, f.h / 2, bz));
          for (const y of [0.4, f.h - 0.4]) g.add(part(cyl(r * 0.97, r * 0.97, 0.12, 10), 0x2e2c2a, bx, y, bz, 1, 1, 1, false));
        }
      break;
    }
    case 'bales': {
      for (let bz = -d / 2; bz < d / 2 - 0.01; bz += 2.2) {
        const len = Math.min(2.2, d / 2 - bz);
        B(0xc8a858, 0, f.h / 2, bz + len / 2, w, f.h, len - 0.04);
        B(0x8a6a38, 0, f.h / 2, bz + len / 2, w + 0.02, 0.1, len * 0.9, false);   // twine
      }
      break;
    }
    case 'bench': {
      B(WOOD, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(DARKWOOD, sx * (w / 2 - leg / 2), f.bot / 2, sz * (d / 2 - leg / 2), leg, f.bot, leg);
      break;
    }
    case 'arch': {
      // Wooden gallery over the last stretch before the hall door.
      B(DARKWOOD, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (let x = -w / 2 + 1; x < w / 2; x += 3) B(0x3a2a1a, x, f.bot - 0.0, -d / 2 + 0.3, 0.3, 0.01, d - 0.6, false);
      break;
    }
    case 'log': {
      // Hollow log: flat-bottomed bark roof over the road (collider = slab).
      B(0x5a4030, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (const k of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.BoxGeometry(w, f.top - f.bot, 0.05), mat(0xb08a5a));
        ring.position.set(0, (f.bot + f.top) / 2, k * (d / 2 + 0.01)); g.add(ring);
      }
      break;
    }
    case 'well': {
      const r = Math.min(w, d) / 2;
      g.add(part(cyl(r, r, f.h, 14), 0x7a7268, 0, f.h / 2, 0));
      g.add(part(cyl(r * 0.75, r * 0.75, 0.05, 14), 0x1a2a2a, 0, f.h + 0.01, 0, 1, 1, 1, false));   // dark water inside
      break;
    }
    case 'walkway': {
      B(0x6a6258, 0, f.h / 2, 0, w, f.h, d);
      B(0x4a3a2a, 0, f.h + 0.03, 0, w, 0.06, d, false);    // plank deck, flush on top
      break;
    }
    case 'crate': {
      B(0x8a6a44, 0, f.h / 2, 0, w, f.h, d);
      for (const k of [-1, 1]) B(0x5a4228, 0, f.h / 2, k * (d / 2 + 0.01), w * 1.01, 0.18, 0.02, false);
      break;
    }
    case 'colonnade': {
      // Roof slab plus the pillars the map makes solid (1x1 every 4 units on both long sides).
      B(0x5a4a3a, 0, (f.bot + f.top) / 2, 0, w, f.top - f.bot, d);
      for (let pz = 0; pz < d; pz += 4) for (const px of [0.5, w - 0.5]) {
        B(0x7a7268, -w / 2 + px, f.bot / 2, -d / 2 + pz + 0.5, 1, f.bot, 1);
      }
      break;
    }
    case 'cart': {
      B(0x6e4e30, 0, f.h * 0.6, 0, w, f.h * 0.8, d);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const wh = part(cyl(0.9, 0.9, 0.3, 10), 0x3a2a1a, sx * (w / 2 - 0.15), 0.9, sz * (d / 2 - 1.2)); wh.rotation.z = Math.PI / 2; g.add(wh);
      }
      break;
    }
    default: B(WOOD, 0, (f.h || 1) / 2, 0, w, f.h || 1, d);
  }
  return g;
}
