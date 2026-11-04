// scene.js — draws the sim. Reads state, never changes it.
// Why read-only: the renderer can be swapped, or run on a co-op client that only
// receives snapshots from a host, without touching game rules.

import * as THREE from 'three';
import {
  W, H, CELL, T, FURNITURE, DRAIN, BRIDGE, GATE, HOLE, RUG, SPAWN, STALLS, DIRS4, cellOf, WORLD_W, WORLD_H,
} from '../sim/map.js';
import { MICE, CATS, TRAPS, TRINKETS } from '../config.js';
import { ROT_DIR } from '../sim/sim.js';
import { mat, outline, part, OUTLINE, makeCat, makeTrap, makeCheese, makeTrinket, makeFurniture } from './models.js';

const MAX_MICE = 800;
// DIRS4 index -> yaw that points a model's local +z that way.
const YAW_FOR = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];
const OPP = [1, 0, 3, 2];

export class Scene {
  constructor(canvas, sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c1612);
    this.scene.fog = new THREE.Fog(0x241c16, 28, 80);           // dim, dusty hall
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    this.scene.add(new THREE.HemisphereLight(0xffe2c0, 0x3a2a1c, 1.25));
    const sun = new THREE.DirectionalLight(0xffe8c8, 0.9); sun.position.set(-20, 40, 30); this.scene.add(sun);

    this.cats = new Map(); this.trapMeshes = new Map(); this.cheeseMeshes = new Map(); this.lootMeshes = new Map();
    this.shotMeshes = new Map(); this.hairMeshes = new Map(); this.bossBars = new Map(); this.mouseLerp = new Map();
    this.particles = []; this.decals = [];
    this.aimProxies = new THREE.Group();
    this.buildWorld();
    this.buildMiceInstancing();
    this.ghost = null; this.ghostKind = null;
    this.ray = new THREE.Raycaster();
    this.resize(); window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // Invisible boxes the crosshair ray hits (floor, furniture, gate).
  proxy(x0, y0, z0, x1, y1, z1, tag) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.userData.tag = tag;
    this.aimProxies.add(m); return m;
  }

  // ---------- static world ----------
  buildWorld() {
    const s = this.scene;
    // Flagstone floor: 2x2-unit stones with grime variation.
    const stones = [];
    for (let z = 1; z < WORLD_H - 1; z += 2) for (let x = 1; x < WORLD_W - 1; x += 2) {
      if (z + 2 > DRAIN.z0 && z < DRAIN.z1) continue;
      stones.push([x, z]);
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.94, 0.3, 1.94), mat(0xffffff), stones.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    stones.forEach(([x, z], k) => {
      m4.makeTranslation(x + 1, -0.15, z + 1); inst.setMatrixAt(k, m4);
      const j = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 100 / 100;
      c.setHex(0x6a625a).offsetHSL(0, -0.02, (j - 0.5) * 0.1); inst.setColorAt(k, c);
    });
    s.add(inst);
    const grout = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), mat(0x2e2924));
    grout.rotation.x = -Math.PI / 2; grout.position.set(WORLD_W / 2, -0.29, WORLD_H / 2); s.add(grout);
    // Doormat.
    const rug = new THREE.Mesh(new THREE.BoxGeometry(RUG.x1 - RUG.x0, 0.06, RUG.z1 - RUG.z0), mat(0x6a3a2a));
    rug.position.set((RUG.x0 + RUG.x1) / 2, 0.03, (RUG.z0 + RUG.z1) / 2); s.add(rug);
    const rugBand = new THREE.Mesh(new THREE.BoxGeometry(RUG.x1 - RUG.x0 - 1, 0.07, RUG.z1 - RUG.z0 - 1), mat(0x8a5a3a));
    rugBand.position.copy(rug.position); s.add(rugBand);
    // Rainwater drain (the moat): stone channel with murky water.
    const dw = DRAIN.x1 - DRAIN.x0, dd = DRAIN.z1 - DRAIN.z0, dcx = (DRAIN.x0 + DRAIN.x1) / 2, dcz = (DRAIN.z0 + DRAIN.z1) / 2;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.2, dd), mat(0x1e2422)); bed.position.set(dcx, -1.3, dcz); s.add(bed);
    for (const k of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(dw, 1.3, 0.1), mat(0x4e4a44)); side.position.set(dcx, -0.65, dcz + k * dd / 2); s.add(side); }
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(dw, dd), new THREE.MeshLambertMaterial({ color: 0x3a5258, transparent: true, opacity: 0.85 }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(dcx, -0.45, dcz); s.add(this.water);
    // Yardstick bridge with tick marks.
    const bw = BRIDGE.x1 - BRIDGE.x0, bd = BRIDGE.z1 - BRIDGE.z0;
    const plank = outline(new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, bd), mat(0xc8a860)), 1.01);
    plank.position.set((BRIDGE.x0 + BRIDGE.x1) / 2, -0.04, (BRIDGE.z0 + BRIDGE.z1) / 2); s.add(plank);
    for (let k = 0; k < 12; k++) { const tick = new THREE.Mesh(new THREE.BoxGeometry(k % 4 === 0 ? 1.2 : 0.6, 0.02, 0.05), mat(0x2a2218)); tick.position.set(BRIDGE.x0 + (k % 4 === 0 ? 0.6 : 0.3), 0.03, BRIDGE.z0 + 0.3 + k * (bd - 0.6) / 11); s.add(tick); }
    this.proxy(0, -0.3, 0, WORLD_W, 0, WORLD_H, 'floor');

    // Furniture.
    for (const f of FURNITURE) {
      s.add(makeFurniture(f));
      const [x0, z0, x1, z1] = f.rect;
      if (f.kind === 'solid') this.proxy(x0, 0, z0, x1, f.h, z1, 'solid');
      else {
        this.proxy(x0, f.bot, z0, x1, f.top, z1, 'slab');
        if (f.sides) { this.proxy(x0, 0, z0, x0 + 0.5, f.top, z1, 'solid'); this.proxy(x1 - 0.5, 0, z0, x1, f.top, z1, 'solid'); }
      }
    }
    // Front door (south wall) with a bright gap underneath where mice squeeze in.
    const door = outline(new THREE.Mesh(new THREE.BoxGeometry(18, 10, 0.6), mat(0x4a3220)), 1.005);
    door.position.set(26, 0.25 + 5, 79.1); s.add(door);
    for (let k = -1; k <= 1; k++) { const band = new THREE.Mesh(new THREE.BoxGeometry(18.1, 0.35, 0.7), mat(0x26221e)); band.position.set(26, 2.5 + (k + 1) * 3, 79.1); s.add(band); }
    const daylight = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.25), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
    daylight.position.set(26, 0.125, 78.79); daylight.rotation.y = Math.PI; s.add(daylight);
    const spawnLight = new THREE.PointLight(0xfff0d0, 6, 10, 1.5); spawnLight.position.set(SPAWN.x, 0.6, 78); s.add(spawnLight);
    // Inner door (north wall) — the gap underneath is the exit to defend (X).
    const inner = outline(new THREE.Mesh(new THREE.BoxGeometry(8, 9, 0.6), mat(0x5a3a22)), 1.005);
    inner.position.set(6.25, 0.3 + 4.5, 0.9); s.add(inner);
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.x1 - HOLE.x0 + 0.6, 0.32), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    gap.position.set((HOLE.x0 + HOLE.x1) / 2, 0.16, 1.21); s.add(gap);
    const exitRing = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 20), new THREE.MeshBasicMaterial({ color: 0xc8302a, transparent: true, opacity: 0.8 }));
    exitRing.rotation.x = -Math.PI / 2; exitRing.position.set((HOLE.x0 + HOLE.x1) / 2, 0.03, 1.8); s.add(exitRing); this.exitRing = exitRing;
    const kitchenGlow = new THREE.PointLight(0xffa050, 8, 8, 1.5); kitchenGlow.position.set(6.25, 0.5, 2); s.add(kitchenGlow);
    // Book gate.
    const gw = GATE.x1 - GATE.x0, gd = GATE.z1 - GATE.z0;
    const book = new THREE.Group(); book.position.set((GATE.x0 + GATE.x1) / 2, 0, GATE.z1);
    const cover = outline(new THREE.Mesh(new THREE.BoxGeometry(gw, 4.2, gd), mat(0x6a2a24)), 1.01); cover.position.set(0, 2.1, -gd / 2); book.add(cover);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(gw - 0.15, 4.0, gd - 0.3), mat(0xe8dcc0)); pages.position.set(0, 2.1, -gd / 2 + 0.01); pages.scale.x = 1.01; book.add(pages);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, gd + 0.05), new THREE.MeshBasicMaterial({ color: 0x0c0806 })); notch.position.set(0, 0.57, -gd / 2); book.add(notch);  // cat-sized tear
    const title = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.04), mat(0xc8a040)); title.position.set(0, 3.2, 0.02); book.add(title);
    s.add(book); this.gateMesh = book;
    this.gateProxy = this.proxy(GATE.x0, 0, GATE.z0, GATE.x1, 4.2, GATE.z1, 'solid');
    // Ceiling beams far overhead and tapestries: look up and feel small.
    for (let z = 6; z < WORLD_H; z += 9) { const beam = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W, 1.2, 1.2), mat(0x2a1e14)); beam.position.set(WORLD_W / 2, 15, z); s.add(beam); }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), mat(0x1a1410)); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(WORLD_W / 2, 16, WORLD_H / 2); s.add(ceiling);
    for (const [x, z, rot, c] of [[1.05, 22, Math.PI / 2, 0x5a2430], [46.95, 30, -Math.PI / 2, 0x2a3a5a], [1.05, 60, Math.PI / 2, 0x3a4a2a]]) {
      const tap = new THREE.Mesh(new THREE.PlaneGeometry(8, 9), mat(c, { side: THREE.DoubleSide })); tap.position.set(x, 8.5, z); tap.rotation.y = rot; s.add(tap);
    }
    for (const [x, z] of [[1.5, 35], [46.5, 15], [46.5, 55], [1.5, 72]]) {
      const l = new THREE.PointLight(0xffb060, 9, 22, 1.4); l.position.set(x, 6, z); s.add(l);
      const sconce = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 5), new THREE.MeshBasicMaterial({ color: 0xffc070 })); sconce.position.set(x, 6.2, z); s.add(sconce);
    }
    // Cheese stashes.
    for (const st of STALLS) {
      const [x0, z0, x1, z1] = st.rect;
      const crate = outline(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0), mat(0x8a6a44))); crate.position.set((x0 + x1) / 2, 0.5, (z0 + z1) / 2); s.add(crate);
      for (let k = 0; k < 3; k++) { const ch = makeCheese(1.6); ch.position.set((x0 + x1) / 2 + (k - 1) * 0.5, 1.0, (z0 + z1) / 2); s.add(ch); }
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xe0b030, side: THREE.DoubleSide })); flag.position.set(x1 - 0.2, 2.1, z0 + 0.2); s.add(flag);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.05), mat(0x3a2a1a)); pole.position.set(x1 - 0.6, 1.6, z0 + 0.2); s.add(pole);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.05, 24), new THREE.MeshBasicMaterial({ color: 0xe0b030, transparent: true, opacity: 0.35 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(st.sell[0], 0.04, st.sell[1]); s.add(ring);
    }
    this.aimProxies.updateMatrixWorld(true);
  }

  // Hundreds of mice drawn with a handful of instanced meshes.
  buildMiceInstancing() {
    const mk = (geo, material, count = MAX_MICE) => { const m = new THREE.InstancedMesh(geo, material, count); m.count = 0; m.frustumCulled = false; this.scene.add(m); return m; };
    const colored = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.mi = {
      body: mk(new THREE.IcosahedronGeometry(0.5, 0), colored),
      bodyO: mk(new THREE.IcosahedronGeometry(0.5, 0), OUTLINE),
      head: mk(new THREE.IcosahedronGeometry(0.28, 0), colored),
      ear: mk(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 7), mat(0xc9a3a0), MAX_MICE * 2),
      tail: mk(new THREE.CylinderGeometry(0.02, 0.035, 0.9, 4), mat(0xc9a3a0)),
      eyes: mk(new THREE.BoxGeometry(0.26, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff })),
    };
    this._m = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  ensureCat(cat) {
    if (!this.cats.has(cat.id)) {
      const m = makeCat(cat.kind); this.scene.add(m);
      this.cats.set(cat.id, { mesh: m, walk: 0, swipeT: 0, swipeSide: 0, biteT: 0, kind: cat.kind });
    }
    return this.cats.get(cat.id);
  }

  // Place a trap model on its footprint.
  placeTrapModel(g, kind, cells, rot, wallDir) {
    const xs = cells.filter(i => i >= 0).map(i => i % W), zs = cells.filter(i => i >= 0).map(i => (i / W) | 0);
    if (!xs.length) { g.visible = false; return; }
    g.visible = true;
    const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * CELL, cz = (Math.min(...zs) + Math.max(...zs) + 1) / 2 * CELL;
    let y = 0;
    const def = TRAPS[kind];
    if (def.surface === 'ceiling') { const i = cells[0]; y = i >= 0 ? this.sim.map.slabBot[i] : 0; }
    g.position.set(cx, y, cz);
    if (def.surface === 'wall') g.rotation.y = wallDir >= 0 ? YAW_FOR[OPP[wallDir]] : 0;
    else g.rotation.y = YAW_FOR[ROT_DIR[rot % 4]];
  }

  setGhost(kind, cells, valid, rot, wallDir) {
    if (this.ghostKind !== kind) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = kind ? makeTrap(kind, true) : null; this.ghostKind = kind;
      if (this.ghost) this.scene.add(this.ghost);
    }
    if (!this.ghost) return;
    if (!cells) { this.ghost.visible = false; return; }
    this.placeTrapModel(this.ghost, kind, cells, rot, wallDir);
    const col = valid ? 0x5ee06a : 0xe0503a;
    this.ghost.traverse(o => { if (o.isMesh) o.material.color.setHex(col); });
  }

  spawnParticles(x, y, z, color, n = 8, speed = 3, size = 0.08) {
    for (let k = 0; k < n; k++) {
      if (this.particles.length > 400) { const old = this.particles.shift(); this.scene.remove(old); }
      const p = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color, transparent: true }));
      p.position.set(x, y, z);
      p.userData = { vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed, vz: (Math.random() - 0.5) * speed, life: 0.7 };
      this.scene.add(p); this.particles.push(p);
    }
  }
  // Flat splat mark on the floor that fades out.
  decal(x, z, color, r, y = 0.02) {
    if (this.decals.length > 80) { const old = this.decals.shift(); this.scene.remove(old); }
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 9), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    d.rotation.x = -Math.PI / 2; d.rotation.z = Math.random() * 6; d.position.set(x, y + Math.random() * 0.005, z); d.userData.life = 8;
    this.scene.add(d); this.decals.push(d);
  }

  // Visual reactions to sim events (cosmetic only).
  onEvent(e) {
    const trap = (id) => this.trapMeshes.get(id);
    switch (e.t) {
      case 'trapAdd': {
        const g = makeTrap(e.trap.kind);
        this.placeTrapModel(g, e.trap.kind, e.trap.cells, e.trap.rot, e.trap.wallDir);
        g.userData.id = e.trap.id; g.userData.kind = e.trap.kind; g.userData.anim = 0;
        this.scene.add(g); this.trapMeshes.set(e.trap.id, g); break;
      }
      case 'trapRemove': { const g = trap(e.id); if (g) { this.spawnParticles(g.position.x, 0.4, g.position.z, 0xc4a46a, 10); this.scene.remove(g); this.trapMeshes.delete(e.id); } break; }
      case 'snap': case 'flip': case 'zap': case 'blow': { const g = trap(e.id); if (g) g.userData.anim = 1; break; }
      case 'kill': if (!e.drowned) { this.spawnParticles(e.x, e.y + 0.3, e.z, 0x8a1c14, e.splat ? 16 : 6, e.splat ? 5 : 3); this.decal(e.x, e.z, 0x5a1410, e.splat ? 0.5 : 0.25, Math.max(0.02, e.y + 0.02)); } else this.spawnParticles(e.x, -0.4, e.z, 0x8fb4c0, 8); break;
      case 'splat': this.spawnParticles(e.x, e.y + 0.1, e.z, 0x7a1810, e.big ? 20 : 10, e.big ? 6 : 4); this.decal(e.x, e.z, 0x5a1410, e.big ? 0.7 : 0.45, Math.max(0.02, e.y + 0.02)); break;
      case 'splash': this.spawnParticles(e.x, -0.4, e.z, 0xbfe0ea, 14, 4); break;
      case 'boom': this.spawnParticles(e.x, 2, e.z, 0x8a8478, 24, 6); break;
      case 'gateBreak': {
        // The book gets torn apart: remove it, scatter pages, leave loose pages on the floor.
        this.scene.remove(this.gateMesh); this.aimProxies.remove(this.gateProxy);
        const gx = (GATE.x0 + GATE.x1) / 2, gz = (GATE.z0 + GATE.z1) / 2;
        this.spawnParticles(gx, 2, gz, 0xe8dcc0, 40, 6, 0.15);
        for (let k = 0; k < 9; k++) {
          const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), mat(0xe8dcc0, { side: THREE.DoubleSide }));
          pg.rotation.x = -Math.PI / 2; pg.rotation.z = Math.random() * 6;
          pg.position.set(gx + (Math.random() - 0.5) * 6, 0.02 + k * 0.002, gz + (Math.random() - 0.5) * 5); this.scene.add(pg);
        }
        const cover = new THREE.Mesh(new THREE.BoxGeometry(GATE.x1 - GATE.x0, 0.12, 2.2), mat(0x6a2a24));
        cover.position.set(gx + 3.5, 0.06, gz + 1.5); cover.rotation.y = 0.5; this.scene.add(cover);
        break;
      }
      case 'claw': { const c = this.cats.get(e.id); if (c) { c.swipeT = 0.12; c.swipeSide = e.n % 2; } break; }
      case 'bite': { const c = this.cats.get(e.id); if (c) c.biteT = 0.18; break; }
      case 'pounceLand': this.spawnParticles(e.x, e.y + 0.1, e.z, 0xd8d0c0, 18, 5); break;
      case 'hairSplat': this.spawnParticles(e.x, e.y + 0.1, e.z, 0x6a7a3a, 14, 4); this.decal(e.x, e.z, 0x5a6a2a, 0.9, Math.max(0.02, e.y + 0.02)); break;
      case 'wallkick': this.spawnParticles(e.x, e.y + 0.5, e.z, 0xd8d0c0, 6, 2); break;
    }
  }

  // Raycast the crosshair: what surface are we pointing at?
  aim(maxDist = 22) {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.ray.intersectObjects(this.aimProxies.children, false);
    const me = this.localCat ? this.localCat.mesh.position : null;
    for (const h of hits) {
      if (me && h.point.distanceTo(me) > maxDist) return null;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      const p = h.point;
      let surface, cell, wallDir = -1;
      if (n.y > 0.7) { surface = p.y < 0.15 ? 'floor' : 'top'; cell = cellOf(p.x, p.z); }
      else if (n.y < -0.7) { surface = 'ceiling'; cell = cellOf(p.x, p.z); }
      else {
        surface = 'wall';
        cell = cellOf(p.x + n.x * 0.25, p.z + n.z * 0.25);
        wallDir = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 1 : 0) : (n.z > 0 ? 3 : 2);   // direction from cell toward the wall
      }
      return { point: p.clone(), normal: n, surface, cell, wallDir };
    }
    return null;
  }

  render(dt, camYaw, camPitch, localId) {
    const sim = this.sim, k = 1 - Math.exp(-dt * 20), now = performance.now();
    // ----- cats -----
    for (const cat of sim.cats.values()) {
      const c = this.ensureCat(cat), m = c.mesh, ud = m.userData;
      if (cat.id === localId) this.localCat = c;
      m.visible = cat.alive;
      if (Math.hypot(cat.x - m.position.x, cat.z - m.position.z) > 3) m.position.set(cat.x, cat.y, cat.z);
      m.position.x += (cat.x - m.position.x) * k; m.position.y += (cat.y - m.position.y) * k; m.position.z += (cat.z - m.position.z) * k;
      m.rotation.y = cat.yaw;
      const moving = Math.hypot(cat.vx, cat.vz) > 0.5 && cat.onGround;
      c.walk += moving ? dt * (cat.kind === 'puddin' ? 10 : 15) : 0;
      ud.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(c.walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
      // Claw swipe: one front paw lashes forward, scratch streaks flash.
      c.swipeT = Math.max(0, c.swipeT - dt); c.biteT = Math.max(0, c.biteT - dt);
      if (c.swipeT > 0) { const leg = ud.legs[c.swipeSide]; leg.rotation.x = -1.6 + (0.12 - c.swipeT) * 10; leg.rotation.z = (c.swipeSide ? -1 : 1) * 0.4; }
      else { ud.legs[0].rotation.z = ud.legs[1].rotation.z = 0; }
      ud.slash.children.forEach(st => { st.material.opacity = c.swipeT > 0 ? c.swipeT / 0.12 * 0.8 : 0; });
      ud.slash.rotation.z = c.swipeSide ? -0.5 : 0.5;
      // Bite: head lunges, jaw drops.
      ud.head.position.z = 0.55 * ud.scale + (c.biteT > 0 ? 0.2 : 0);
      ud.jaw.rotation.x = c.biteT > 0.09 ? 0.6 : 0;
      ud.head.rotation.x = -camPitch * 0.3;
      ud.body.rotation.x = cat.pouncing ? -0.35 : 0;     // stretched out mid-pounce
      ud.tail.rotation.z = Math.sin(now / 300) * 0.3;
      ud.body.position.y = cat.hurtT > 0 ? 0.05 : 0;
    }
    // ----- mice (instanced) -----
    this.drawMice(dt, k, now);
    // ----- cheese, trinkets, shots, hairballs -----
    this.syncSimple(sim.cheese, this.cheeseMeshes, () => makeCheese(1), (g, ch) => {
      g.position.set(ch.x, ch.y + 0.1 + Math.sin(now / 300 + ch.id) * 0.06, ch.z); g.rotation.y += dt * 2; g.scale.setScalar(1 + Math.min(ch.amount, 10) * 0.06);
    });
    this.syncSimple(sim.loot, this.lootMeshes, (l) => makeTrinket(TRINKETS[l.key].tier), (g, l) => {
      g.position.set(l.x, l.y + Math.sin(now / 250 + l.id) * 0.08, l.z); g.rotation.y += dt * 3;
    });
    this.syncSimple(sim.shots, this.shotMeshes, () => outline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), mat(0x6f6a62))), (g, s) => { g.position.set(s.x, s.y, s.z); g.rotation.x += dt * 8; });
    this.syncSimple(sim.hairballs, this.hairMeshes, () => outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), mat(0x6a7a3a))), (g, b) => { g.position.set(b.x, b.y, b.z); g.rotation.y += dt * 10; });
    // ----- trap animations -----
    for (const g of this.trapMeshes.values()) {
      const ud = g.userData; ud.anim = Math.max(0, ud.anim - dt * 3);
      const tr = sim.traps.get(ud.id);
      if (ud.kind === 'mousetrap') ud.bar.rotation.x = ud.anim > 0 ? -0.1 : -2.6;
      if (ud.kind === 'flipper') ud.hinge.rotation.x = -ud.anim * 1.3;
      if (ud.kind === 'grinder' && tr && tr.active) ud.drum.rotation.x += dt * 25;
      if (ud.kind === 'zapper') ud.glow.material.color.setHex(ud.anim > 0.5 ? 0xffffff : tr && tr.cd > 0 ? 0x2c4a6a : 0x6fb8ff);
      if (ud.kind === 'hairdryer') ud.gust.material.opacity = ud.anim * 0.4;
      if (ud.kind === 'gluepad' && tr) ud.goo.material.opacity = tr.charges > 0 ? 0.8 : 0.2;
      if (ud.kind === 'barricade' && tr) g.scale.y = 0.55 + 0.45 * (tr.hp / tr.maxHp);
    }
    // ----- particles & decals -----
    this.particles = this.particles.filter(p => {
      const u = p.userData; u.life -= dt; u.vy -= 9 * dt;
      p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
      p.material.opacity = Math.max(0, u.life / 0.7);
      if (u.life <= 0) { this.scene.remove(p); return false; } return true;
    });
    this.decals = this.decals.filter(d => { d.userData.life -= dt; d.material.opacity = Math.min(0.7, d.userData.life / 3); if (d.userData.life <= 0) { this.scene.remove(d); return false; } return true; });
    this.water.position.y = -0.45 + Math.sin(now / 900) * 0.02;
    this.exitRing.material.opacity = 0.5 + Math.sin(now / 250) * 0.3;

    // ----- third-person camera, low and close so the world towers over you -----
    const me = this.localCat;
    if (me) {
      const p = me.mesh.position, catH = me.kind === 'puddin' ? 1.25 : 0.95, dist = me.kind === 'puddin' ? 3.6 : 3.0;
      const target = new THREE.Vector3(p.x, p.y + catH * 0.95, p.z);
      const back = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
      let d = dist;
      for (let s = 0.4; s <= dist; s += 0.2) {
        const q = target.clone().addScaledVector(back, s);
        if (q.y < 0.15 || q.y > 15.5 || sim.blocks(cellOf(q.x, q.z), q.y - 0.15, 0.3, 0, true)) { d = Math.max(0.6, s - 0.25); break; }
      }
      const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
      this.camera.position.copy(target).addScaledVector(back, d).addScaledVector(right, 0.45);
      this.camera.lookAt(target.clone().addScaledVector(back, -12).addScaledVector(right, 0.45));
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Generic: keep one mesh per sim entity in a list.
  syncSimple(list, store, make, update) {
    const seen = new Set();
    for (const e of list) {
      seen.add(e.id); let g = store.get(e.id);
      if (!g) { g = make(e); this.scene.add(g); store.set(e.id, g); }
      update(g, e);
    }
    for (const [id, g] of store) if (!seen.has(id)) { this.scene.remove(g); store.delete(id); }
  }

  drawMice(dt, k, now) {
    const { body, bodyO, head, ear, tail, eyes } = this.mi;
    const M = this._m, L = this._l, q = this._q, e = this._e, v = this._v, sc = this._s, col = this._c;
    let n = 0;
    const set = (mesh, i, ox, oy, oz, rx, sx, sy, sz) => {
      L.compose(v.set(ox, oy, oz), q.setFromEuler(e.set(rx, 0, 0)), sc.set(sx, sy, sz));
      L.premultiply(M); mesh.setMatrixAt(i, L);
    };
    const seen = new Set();
    for (const mo of this.sim.mice) {
      if (n >= MAX_MICE) break;
      seen.add(mo.id);
      let p = this.mouseLerp.get(mo.id);
      if (!p) { p = { x: mo.x, y: mo.y, z: mo.z }; this.mouseLerp.set(mo.id, p); }
      p.x += (mo.x - p.x) * k; p.y += (mo.y - p.y) * k; p.z += (mo.z - p.z) * k;
      const d = MICE[mo.type], s = d.size;
      const bob = mo.state === 'walk' ? Math.abs(Math.sin(now / 60 + mo.id)) * 0.04 * s : 0;
      const tumble = mo.state === 'air' ? now / 90 : 0;
      M.compose(v.set(p.x, p.y + bob, p.z), q.setFromEuler(e.set(tumble, mo.yaw || 0, 0, 'YXZ')), sc.set(s, s, s));
      set(body, n, 0, 0.42, 0, 0, 0.8, 0.7, 1.15);
      set(bodyO, n, 0, 0.42, 0, 0, 0.88, 0.78, 1.23);
      set(head, n, 0, 0.5, 0.5, 0, 1, 1, 1);
      set(ear, n * 2, -0.17, 0.78, 0.42, Math.PI / 2, 1, 1, 1);
      set(ear, n * 2 + 1, 0.17, 0.78, 0.42, Math.PI / 2, 1, 1, 1);
      set(tail, n, 0, 0.3, -0.75, Math.PI / 2 - 0.3 + Math.sin(now / 150 + mo.id) * 0.2, 1, 1, 1);
      set(eyes, n, 0, 0.56, 0.75, 0, 1, 1, 1);
      // Colour: base, flash white when hit, green when hairball-slowed, yellow when glued.
      col.setHex(d.color);
      if (mo.flash > 0) col.lerp(new THREE.Color(0xffffff), 0.7);
      else if (mo.state === 'stuck') col.lerp(new THREE.Color(0xe0d060), 0.5);
      else if (mo.slowT > 0) col.lerp(new THREE.Color(0x7a9a3a), 0.5);
      else if (mo.stunT > 0) col.lerp(new THREE.Color(0xa0a0ff), 0.4);
      body.setColorAt(n, col); head.setColorAt(n, col);
      eyes.setColorAt(n, col.setHex(d.boss ? 0xff2a1a : 0x111111));
      n++;
      // Boss HP bars.
      if (d.boss) {
        let bar = this.bossBars.get(mo.id);
        if (!bar) {
          bar = new THREE.Group();
          const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14), new THREE.MeshBasicMaterial({ color: 0x220000, depthTest: false }));
          const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14), new THREE.MeshBasicMaterial({ color: 0xd84a2a, depthTest: false }));
          fg.position.z = 0.001; bg.renderOrder = 10; fg.renderOrder = 11; bar.add(bg, fg); bar.userData.fg = fg;
          this.scene.add(bar); this.bossBars.set(mo.id, bar);
        }
        bar.position.set(p.x, p.y + s * 1.3 + 0.3, p.z); bar.quaternion.copy(this.camera.quaternion);
        const f = Math.max(0, mo.hp / mo.maxHp); bar.userData.fg.scale.x = f; bar.userData.fg.position.x = -0.8 * (1 - f);
      }
    }
    for (const mesh of [body, bodyO, head, tail, eyes]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    ear.count = n * 2; ear.instanceMatrix.needsUpdate = true;
    for (const id of this.mouseLerp.keys()) if (!seen.has(id)) this.mouseLerp.delete(id);
    for (const [id, bar] of this.bossBars) if (!seen.has(id)) { this.scene.remove(bar); this.bossBars.delete(id); }
  }
}
