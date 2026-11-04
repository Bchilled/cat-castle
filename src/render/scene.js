// scene.js — draws the sim. Reads state, never changes it.
// Why read-only: the renderer can be swapped or run on a client that only
// receives snapshots from a host, without touching game rules.

import * as THREE from 'three';
import { W, H, T, BUILDINGS, CASTLE, GATE_CELLS, HOLE, STALL, SPAWN, DIRS4 } from '../sim/map.js';
import { MICE } from '../config.js';
import { mat, outline, makeFred, makeMouse, makeTrap, makeCheese } from './models.js';

// Muted, dirty palette per tile type, with per-tile jitter for grime.
const TILE_COLOR = {
  [T.GRASS]: 0x55613a, [T.ROAD]: 0x6b5236, [T.FLOOR]: 0x6f675b, [T.BRIDGE]: 0x6a4a2c,
  [T.HOLE]: 0x2a2520, [T.GATE]: 0x6f675b, [T.STALL]: 0x6f675b,
};

export class Scene {
  constructor(canvas, sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8a9298);
    this.scene.fog = new THREE.Fog(0x8a9298, 30, 75);           // overcast, grubby
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xc8ccd0, 0x4a4030, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.4); sun.position.set(-20, 40, 10); this.scene.add(sun);

    this.mice = new Map(); this.trapMeshes = new Map(); this.cheeseMeshes = new Map(); this.shotMeshes = new Map();
    this.cats = new Map(); this.particles = [];
    this.buildWorld();
    this.ghost = null; this.ghostKind = null;
    this.resize(); window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------- static world ----------
  buildWorld() {
    const s = this.scene, map = this.sim.map;
    // Ground tiles: one instanced mesh, coloured per tile.
    const tiles = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = map.type[z * W + x];
      if (TILE_COLOR[t] !== undefined || t === T.TREE || t === T.ROCK) tiles.push([x, z, t]);
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, 1), mat(0xffffff), tiles.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    tiles.forEach(([x, z, t], k) => {
      const base = TILE_COLOR[t] ?? TILE_COLOR[T.GRASS];
      const yOff = t === T.BRIDGE ? 0.05 : 0;
      m4.makeTranslation(x + 0.5, -0.15 + yOff, z + 0.5); inst.setMatrixAt(k, m4);
      const j = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 100 / 100;   // stable grime noise
      c.setHex(base).offsetHSL(0, -0.03, (j - 0.5) * 0.08); inst.setColorAt(k, c);
    });
    s.add(inst);
    // Water + moat bed.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, 42 + 20), new THREE.MeshLambertMaterial({ color: 0x3d5a63, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(W / 2, -0.3, 21 - 10); s.add(water); this.water = water;
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, 62), mat(0x25302c));
    bed.rotation.x = -Math.PI / 2; bed.position.set(W / 2, -1.3, 11); s.add(bed);
    // Outer grass beyond the map edge (so the world doesn't end in a void).
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), mat(0x4b5634));
    outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.31, H + 18); s.add(outer);
    // Island base under the castle.
    const island = new THREE.Mesh(new THREE.BoxGeometry(CASTLE.x1 - CASTLE.x0 + 1, 1.5, CASTLE.z1 - CASTLE.z0 + 1), mat(0x4e4a42));
    island.position.set((CASTLE.x0 + CASTLE.x1 + 1) / 2, -0.8, (CASTLE.z0 + CASTLE.z1 + 1) / 2); s.add(island);

    this.buildCastle();
    // Trees & rocks.
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = map.type[z * W + x];
      if (t === T.TREE) {
        const tr = new THREE.Group(); tr.position.set(x + 0.5, 0, z + 0.5);
        tr.add(outline(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 5), mat(0x4a3622))));
        tr.children[0].position.y = 0.6;
        for (let k = 0; k < 3; k++) {
          const cone = outline(new THREE.Mesh(new THREE.ConeGeometry(1.1 - k * 0.25, 1.5, 6), mat(0x2f4a2a)));
          cone.position.y = 1.5 + k * 0.85; tr.add(cone);
        }
        tr.rotation.y = x * 1.7; s.add(tr);
      } else if (t === T.ROCK) {
        const r = outline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), mat(0x7a7873)));
        r.position.set(x + 0.5, 0.35, z + 0.5); r.scale.set(1, 0.75, 0.9); r.rotation.set(x, z, 0); s.add(r);
      }
    }
    // Spawn burrow (Y).
    const burrow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 9), new THREE.MeshBasicMaterial({ color: 0x120e0a }));
    burrow.rotation.x = -Math.PI / 2; burrow.position.set(SPAWN.x, 0.02, SPAWN.z); s.add(burrow);
    const mound = outline(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.25, 4, 9), mat(0x5a4330)));
    mound.rotation.x = Math.PI / 2; mound.position.set(SPAWN.x, 0.05, SPAWN.z); s.add(mound);
  }

  buildCastle() {
    const s = this.scene, map = this.sim.map;
    const STONE = 0x77726a, STONE2 = 0x666158;
    const { x0, z0, x1, z1 } = CASTLE;
    const wall = (ax, az, bx, bz) => {
      const w = bx - ax, d = bz - az;
      const m = outline(new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), mat(STONE)), 1.01);
      m.position.set(ax + w / 2, 2, az + d / 2); s.add(m);
      // Crenellations along the top.
      const n = Math.max(w, d) | 0;
      for (let k = 0; k < n; k += 2) {
        const cr = new THREE.Mesh(new THREE.BoxGeometry(w > d ? 0.9 : w, 0.6, w > d ? d : 0.9), mat(STONE2));
        cr.position.set(w > d ? ax + k + 0.5 : ax + w / 2, 4.3, w > d ? az + d / 2 : az + k + 0.5); s.add(cr);
      }
    };
    wall(x0, z0, x1 + 1, z0 + 1); wall(x0, z0 + 1, x0 + 1, z1); wall(x1, z0 + 1, x1 + 1, z1);
    wall(x0, z1, GATE_CELLS[0], z1 + 1); wall(GATE_CELLS[3] + 1, z1, x1 + 1, z1 + 1);
    // Gatehouse arch over the gate.
    const arch = outline(new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.6, 1.4), mat(STONE2)), 1.02);
    arch.position.set(GATE_CELLS[0] + 2, 4.8, z1 + 0.5); s.add(arch);
    // Towers: two tall front towers like the sketch, two squat back ones.
    const tower = (x, z, h, r) => {
      const t = outline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 7), mat(STONE)), 1.02);
      t.position.set(x, h / 2, z); s.add(t);
      const roof = outline(new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, h * 0.6, 7), mat(0x3e3a44)));
      roof.position.set(x, h + h * 0.3, z); s.add(roof);
    };
    tower(x0 + 0.5, z1 + 0.5, 9, 1.8); tower(x1 + 0.5, z1 + 0.5, 11, 1.9);
    tower(x0 + 0.5, z0 + 0.5, 6, 1.4); tower(x1 + 0.5, z0 + 0.5, 6, 1.4);
    // Gate (falls flat outward when broken).
    const gate = new THREE.Group(); gate.position.set(GATE_CELLS[0] + 2, 0, z1 + 1);
    const door = outline(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.35), mat(0x5b3f26)), 1.02);
    door.position.set(0, 2, -0.18); gate.add(door);
    for (let k = -1; k <= 1; k++) { const band = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.15, 0.4), mat(0x2e2c2a)); band.position.set(0, 2 + k * 1.2, -0.18); gate.add(band); }
    s.add(gate); this.gateMesh = gate;
    // Buildings.
    for (const b of BUILDINGS) {
      const [bx0, bz0, bx1, bz1] = b.rect; const w = bx1 - bx0, d = bz1 - bz0;
      const g = new THREE.Group(); g.position.set(bx0 + w / 2, 0, bz0 + d / 2); s.add(g);
      const body = outline(new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), mat(b.color)), 1.01);
      body.position.y = b.height / 2; g.add(body);
      // Pyramid roof: rotate the 4-sided cone inside a group, scale the group,
      // so the roof stretches to the building's footprint instead of skewing.
      const roof = new THREE.Group();
      const cone = outline(new THREE.Mesh(new THREE.ConeGeometry(0.71, 1, 4, 1), mat(b.roof)), 1.02);
      cone.rotation.y = Math.PI / 4; roof.add(cone);
      roof.scale.set(w * 1.05, 1.6, d * 1.05); roof.position.y = b.height + 0.8; g.add(roof);
      if (b.chimney) { const ch = outline(new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.8), mat(0x4a4643))); ch.position.set(w / 3, b.height + 1.1, 0); g.add(ch); }
      if (b.steeple) {
        const st = outline(new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.5, 4), mat(0x4a4a52))); st.position.set(0, b.height + 2.4, -d / 4); g.add(st);
      }
      // Doors/windows as dark slabs for some life.
      const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.05), mat(0x2b2118)); door.position.set(0, 0.8, d / 2 + 0.03); g.add(door);
    }
    // Awnings / walkways over "covered" tiles — where bug zappers can hang.
    const cov = [];
    for (let i = 0; i < W * H; i++) if (map.covered[i]) cov.push(i);
    const aw = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), mat(0x5c4a3a), cov.length);
    const m4 = new THREE.Matrix4();
    cov.forEach((i, k) => { m4.makeTranslation(i % W + 0.5, 2.75, ((i / W) | 0) + 0.5); aw.setMatrixAt(k, m4); });
    s.add(aw);
    // Kitchen mouse hole (X): dark arch in the corner wall, ringed red.
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    hole.position.set(HOLE.x + 0.5, 0.01, HOLE.z + 0.02); s.add(hole);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 10, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xb02a20 }));
    ring.position.copy(hole.position); ring.position.z += 0.005; s.add(ring);
    // Cheese stall.
    const stall = new THREE.Group(); stall.position.set(STALL.x + 0.5, 0, (STALL.z0 + STALL.z1) / 2); s.add(stall);
    const counter = outline(new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, STALL.z1 - STALL.z0), mat(0x7a5a38))); counter.position.y = 0.55; stall.add(counter);
    for (let k = -1; k <= 1; k++) { const ch = makeCheese(); ch.position.set(0, 1.0, k * 0.8); ch.scale.setScalar(1.4); stall.add(ch); }
    const awn = outline(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, STALL.z1 - STALL.z0 + 0.4), mat(0xb8a23a)));
    awn.position.set(0.4, 2.4, 0); awn.rotation.z = -0.25; stall.add(awn);
    for (const zz of [-1.4, 1.4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), mat(0x4a3622)); post.position.set(0.9, 1.2, zz); stall.add(post); }
    this.stallMesh = stall;
  }

  // ---------- per-frame sync ----------
  ensureCat(cat) {
    if (!this.cats.has(cat.id)) { const m = makeFred(); this.scene.add(m); this.cats.set(cat.id, { mesh: m, walk: 0, arcT: 0 }); }
    return this.cats.get(cat.id);
  }

  setGhost(kind, tile, valid, dir) {
    if (this.ghostKind !== kind) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = kind ? makeTrap(kind, true) : null; this.ghostKind = kind;
      if (this.ghost) this.scene.add(this.ghost);
    }
    if (!this.ghost) return;
    this.ghost.visible = tile >= 0;
    if (tile < 0) return;
    this.ghost.position.set(tile % W + 0.5, 0, ((tile / W) | 0) + 0.5);
    this.orientTrap(this.ghost, kind, dir, this.sim.map.wallSide[tile]);
    const col = valid ? 0x5ee06a : 0xe0503a;
    this.ghost.traverse(o => { if (o.isMesh) o.material.color.setHex(col); });
  }

  orientTrap(g, kind, dir, wallDir) {
    // DIRS4: 0:+x 1:-x 2:+z 3:-z. Models face +z by default.
    const yawFor = (d) => [Math.PI / 2, -Math.PI / 2, 0, Math.PI][d] ?? 0;
    if (kind === 'flipper') g.rotation.y = yawFor(dir);
    else if (kind === 'grinder') g.rotation.y = yawFor(wallDir) + Math.PI;  // back against the wall
    else g.rotation.y = 0;
  }

  spawnParticles(x, y, z, color, n = 8, speed = 3) {
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color, transparent: true }));
      p.position.set(x, y, z);
      p.userData = { vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed, vz: (Math.random() - 0.5) * speed, life: 0.7 };
      this.scene.add(p); this.particles.push(p);
    }
  }

  // Visual reactions to sim events (cosmetic only).
  onEvent(e) {
    const trapById = (id) => [...this.trapMeshes.values()].find(t => t.userData.id === id);
    switch (e.t) {
      case 'trapAdd': {
        const g = makeTrap(e.trap.kind); g.position.set(e.trap.tile % W + 0.5, 0, ((e.trap.tile / W) | 0) + 0.5);
        this.orientTrap(g, e.trap.kind, e.trap.dir, e.trap.wallDir);
        g.userData.id = e.trap.id; g.userData.kind = e.trap.kind; g.userData.anim = 0;
        this.scene.add(g); this.trapMeshes.set(e.trap.id, g); break;
      }
      case 'trapRemove': { const g = this.trapMeshes.get(e.id); if (g) { this.spawnParticles(g.position.x, 0.5, g.position.z, 0x6e4e30, 10); this.scene.remove(g); this.trapMeshes.delete(e.id); } break; }
      case 'snap': case 'flip': case 'zap': { const g = trapById(e.id); if (g) g.userData.anim = 1; break; }
      case 'kill': this.spawnParticles(e.x, 0.4, e.z, e.drowned ? 0x8fb4c0 : 0x8a1c14, 10); break;
      case 'splash': this.spawnParticles(e.x, -0.2, e.z, 0xbfe0ea, 14, 4); break;
      case 'boom': this.spawnParticles(e.x, 2, e.z, 0x8a8478, 24, 6); break;
      case 'gateBreak': this.gateFalling = true; this.spawnParticles(GATE_CELLS[0] + 2, 2, CASTLE.z1 + 1, 0x5b3f26, 30, 6); break;
      case 'claw': { const c = this.cats.get(e.id); if (c) c.arcT = 0.1; break; }
      case 'wallkick': this.spawnParticles(e.x, e.y + 0.5, e.z, 0xd8d0c0, 6, 2); break;
    }
  }

  render(dt, camYaw, camPitch, localId) {
    const sim = this.sim, k = 1 - Math.exp(-dt * 18);   // smoothing between 30 Hz ticks
    // Cats
    for (const cat of sim.cats.values()) {
      const c = this.ensureCat(cat), m = c.mesh;
      m.visible = cat.alive;
      m.position.x += (cat.x - m.position.x) * k; m.position.y += (cat.y - m.position.y) * k; m.position.z += (cat.z - m.position.z) * k;
      if (Math.abs(cat.x - m.position.x) > 3 || Math.abs(cat.z - m.position.z) > 3) m.position.set(cat.x, cat.y, cat.z); // respawn snap
      m.rotation.y = cat.yaw;
      const moving = Math.hypot(cat.vx, cat.vz) > 0.5 && cat.onGround;
      c.walk += moving ? dt * 14 : 0;
      m.userData.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(c.walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
      m.userData.tail.rotation.z = Math.sin(performance.now() / 300) * 0.3;
      c.arcT = Math.max(0, c.arcT - dt); m.userData.arc.material.opacity = c.arcT > 0 ? 0.6 : 0;
      m.userData.head.rotation.x = -camPitch * 0.3;
    }
    // Mice
    const seen = new Set();
    for (const mo of sim.mice) {
      seen.add(mo.id);
      let g = this.mice.get(mo.id);
      if (!g) { g = makeMouse(mo.type, MICE[mo.type]); g.position.set(mo.x, mo.y, mo.z); this.scene.add(g); this.mice.set(mo.id, g); }
      g.position.x += (mo.x - g.position.x) * k; g.position.y += (mo.y - g.position.y) * k; g.position.z += (mo.z - g.position.z) * k;
      if (mo.yaw !== undefined) g.rotation.y = mo.yaw;
      const ud = g.userData;
      ud.body.position.y = mo.state === 'walk' ? Math.abs(Math.sin(performance.now() / 70 + mo.id)) * 0.06 : 0;
      ud.body.rotation.x = mo.state === 'air' ? performance.now() / 100 : 0;          // tumbling when launched
      const hurt = mo.hp < mo.maxHp;
      ud.bar.visible = hurt; ud.fg.scale.x = Math.max(0, mo.hp / mo.maxHp); ud.fg.position.x = -0.4 * (1 - ud.fg.scale.x);
      ud.bar.quaternion.copy(this.camera.quaternion); ud.bar.quaternion.premultiply(g.quaternion.clone().invert());
      ud.body.scale.setScalar(mo.flash > 0 ? 1.12 : 1);
    }
    for (const [id, g] of this.mice) if (!seen.has(id)) { this.scene.remove(g); this.mice.delete(id); }
    // Cheese on the ground
    const cs = new Set();
    for (const ch of sim.cheese) {
      cs.add(ch.id);
      let g = this.cheeseMeshes.get(ch.id);
      if (!g) { g = makeCheese(); this.scene.add(g); this.cheeseMeshes.set(ch.id, g); }
      g.position.set(ch.x, ch.y + 0.15 + Math.sin(performance.now() / 300 + ch.id) * 0.08, ch.z);
      g.rotation.y += dt * 2; g.scale.setScalar(1 + Math.min(ch.amount, 10) * 0.08);
    }
    for (const [id, g] of this.cheeseMeshes) if (!cs.has(id)) { this.scene.remove(g); this.cheeseMeshes.delete(id); }
    // Lobber rocks
    const ss = new Set();
    for (const sh of sim.shots) {
      ss.add(sh.id); let g = this.shotMeshes.get(sh.id);
      if (!g) { g = outline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mat(0x6f6a62))); this.scene.add(g); this.shotMeshes.set(sh.id, g); }
      g.position.set(sh.x, sh.y, sh.z); g.rotation.x += dt * 8;
    }
    for (const [id, g] of this.shotMeshes) if (!ss.has(id)) { this.scene.remove(g); this.shotMeshes.delete(id); }
    // Trap animations
    for (const g of this.trapMeshes.values()) {
      const ud = g.userData; ud.anim = Math.max(0, ud.anim - dt * 3);
      const tr = [...sim.traps.values()].find(t => t.id === ud.id);
      if (ud.kind === 'mousetrap') ud.bar.rotation.x = ud.anim > 0 ? -0.1 : -2.6;
      if (ud.kind === 'flipper') ud.hinge.rotation.x = -ud.anim * 1.2;
      if (ud.kind === 'grinder' && tr && tr.active) ud.drum.rotation.x += dt * 20;
      if (ud.kind === 'zapper') ud.glow.material.color.setHex(ud.anim > 0.5 ? 0xffffff : tr && tr.cd > 0 ? 0x2c4a6a : 0x6fb8ff);
      if (ud.kind === 'barricade' && tr) g.scale.y = 0.6 + 0.4 * (tr.hp / tr.maxHp);
    }
    // Gate falling
    if (this.gateFalling && this.gateMesh.rotation.x < Math.PI / 2) {
      this.gateMesh.rotation.x = Math.min(Math.PI / 2, this.gateMesh.rotation.x + dt * 3);
    }
    // Particles
    this.particles = this.particles.filter(p => {
      const u = p.userData; u.life -= dt; u.vy -= 9 * dt;
      p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
      p.material.opacity = Math.max(0, u.life / 0.7);
      if (u.life <= 0) { this.scene.remove(p); return false; }
      return true;
    });
    this.water.position.y = -0.3 + Math.sin(performance.now() / 900) * 0.03;

    // Third-person camera behind the local cat, pulled in if a wall is in the way.
    const me = this.cats.get(localId);
    if (me) {
      const p = me.mesh.position, dist = 6;
      const target = new THREE.Vector3(p.x, p.y + 1.4, p.z);
      const back = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
      let d = dist;
      for (let s = 0.5; s <= dist; s += 0.25) {
        const q = target.clone().addScaledVector(back, s);
        if (q.y < sim.solidHeight(sim.tileAt(q.x, q.z)) + 0.2) { d = Math.max(1.2, s - 0.3); break; }
      }
      this.camera.position.copy(target).addScaledVector(back, d);
      // Look slightly over the shoulder so the crosshair isn't blocked by Fred.
      const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
      this.camera.position.addScaledVector(right, 0.6);
      this.camera.lookAt(target.clone().addScaledVector(back, -10).addScaledVector(right, 0.6));
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Tile under the crosshair (ray from screen centre hits ground y=0).
  aimTile(maxDist = 16) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.y >= -0.01) return -1;
    const t = -o.y / d.y; const x = o.x + d.x * t, z = o.z + d.z * t;
    const me = [...this.cats.values()][0];
    if (me && Math.hypot(x - me.mesh.position.x, z - me.mesh.position.z) > maxDist) return -1;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (tx < 0 || tz < 0 || tx >= W || tz >= H) return -1;
    return tz * W + tx;
  }
}
export { DIRS4 };
