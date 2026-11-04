// scene.js — draws the sim. Reads state, never changes it.
// Why read-only: the renderer can be swapped, or run on a co-op client that only
// receives snapshots from a host, without touching game rules.
// Rule kept throughout: every visible solid thing sits inside a collider.

import * as THREE from 'three';
import {
  W, H, CELL, T, FURNITURE, DRAIN, BRIDGE, GATE, HOLE, SPAWNS, STALLS, cellOf, WORLD_W, WORLD_H,
} from '../sim/map.js';
import { MICE, TRAPS, TRINKETS } from '../config.js';
import { ROT_DIR } from '../sim/sim.js';
import { mat, outline, OUTLINE, makeCat, makeTrap, makeTrinket, makeFurniture } from './models.js';

const MAX_MICE = 800;
const YAW_FOR = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];   // DIRS4 index -> yaw pointing local +z that way
const OPP = [1, 0, 3, 2];

export class Scene {
  constructor(canvas, sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fa4b0);           // overcast sky over the yard
    this.scene.fog = new THREE.Fog(0x8fa4b0, 50, 170);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 250);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ea, 0x4a4030, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.3); sun.position.set(-25, 45, 30); this.scene.add(sun);
    this.camDist = null;                                            // set per cat on first frame; wheel zooms

    this.cats = new Map(); this.trapMeshes = new Map(); this.tailMeshes = new Map(); this.lootMeshes = new Map();
    this.shotMeshes = new Map(); this.missileMeshes = new Map(); this.bossBars = new Map(); this.mouseLerp = new Map();
    this.particles = []; this.decals = [];
    this.aimProxies = new THREE.Group();
    this.buildWorld();
    this.buildMiceInstancing();
    this.buildRoute();
    this.ghost = null; this.ghostKind = null;
    this.ray = new THREE.Raycaster();
    this.resize(); window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // Invisible boxes the crosshair ray hits (floor, furniture, gate).
  proxy(x0, y0, z0, x1, y1, z1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.aimProxies.add(m); return m;
  }

  // ---------- static world ----------
  buildWorld() {
    const s = this.scene, map = this.sim.map;
    // Ground: cobbles in the yard and tunnel, packed dirt on the forest road.
    const ground = [];
    for (let z = 0; z < H; z += 2) for (let x = 0; x < W; x += 2) {
      const i = z * W + x, t = map.type[i];
      if (t === T.WATER) continue;
      ground.push([x, z, t]);
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.97, 0.3, 0.97), mat(0xffffff), ground.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    ground.forEach(([x, z, t], k) => {
      m4.makeTranslation((x + 1) * CELL, -0.15, (z + 1) * CELL); inst.setMatrixAt(k, m4);
      const j = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 100 / 100;
      const base = t === T.ROAD || map.forest[i(x, z)] ? 0x6a5236 : 0x6e675e;
      c.setHex(base).offsetHSL(0, -0.02, (j - 0.5) * 0.1); inst.setColorAt(k, c);
    });
    function i(x, z) { return z * W + x; }
    s.add(inst);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 200, WORLD_H + 200), mat(0x3a4a2a));
    under.rotation.x = -Math.PI / 2; under.position.set(WORLD_W / 2, -0.31, WORLD_H / 2); s.add(under);
    this.proxy(0, -0.3, 0, WORLD_W, 0, WORLD_H);

    // The moat: real water, sunk below the banks, gently moving.
    const dw = DRAIN.x1 - DRAIN.x0, dd = DRAIN.z1 - DRAIN.z0, dcx = (DRAIN.x0 + DRAIN.x1) / 2, dcz = (DRAIN.z0 + DRAIN.z1) / 2;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.2, dd), mat(0x1a2a2a)); bed.position.set(dcx, -1.4, dcz); s.add(bed);
    for (const k of [-1, 1]) { const bank = new THREE.Mesh(new THREE.BoxGeometry(dw, 1.4, 0.2), mat(0x4e463c)); bank.position.set(dcx, -0.7, dcz + k * dd / 2); s.add(bank); }
    const wgeo = new THREE.PlaneGeometry(dw, dd, 48, 6);
    this.water = new THREE.Mesh(wgeo, new THREE.MeshLambertMaterial({ color: 0x2f6f9a, transparent: true, opacity: 0.88, flatShading: true }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(dcx, -0.45, dcz); s.add(this.water);
    this.waterBase = Float32Array.from(wgeo.attributes.position.array);
    // Fallen branch across the moat (the mouse-sized bridge).
    const bw = BRIDGE.x1 - BRIDGE.x0, bd = BRIDGE.z1 - BRIDGE.z0;
    const branch = outline(new THREE.Mesh(new THREE.CylinderGeometry(bw / 2, bw / 2 * 0.85, bd, 9), mat(0x5a4028)), 1.01);
    branch.rotation.x = Math.PI / 2; branch.scale.set(1, 1, 0.5); branch.position.set((BRIDGE.x0 + BRIDGE.x1) / 2, -bw / 4 + 0.02, (BRIDGE.z0 + BRIDGE.z1) / 2); s.add(branch);

    // Forest: a dense hedge of roots, rocks and bushes along the road (that's
    // the lane wall), with tall trunks further back. All on solid forest cells.
    const edge = [], back = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const ii = z * W + x; if (!map.forest[ii]) continue;
      let nearRoad = false;
      for (let dz = -2; dz <= 2 && !nearRoad; dz++) for (let dx = -2; dx <= 2; dx++) {
        const n = (z + dz) * W + x + dx; if (n >= 0 && n < W * H && map.type[n] === T.ROAD) { nearRoad = true; break; }
      }
      if (nearRoad) edge.push([x, z]); else if (x % 6 === 0 && z % 6 === 0) back.push([x, z]);
    }
    const hedge = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 1, CELL), mat(0xffffff), edge.length);
    edge.forEach(([x, z], k) => {
      const j = (((x * 7919) ^ (z * 104729)) >>> 0) % 100 / 100, h = 4.2 + j * 0.8;   // never taller than the 5-unit collider
      m4.compose(new THREE.Vector3((x + 0.5) * CELL, h / 2, (z + 0.5) * CELL), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)); hedge.setMatrixAt(k, m4);
      c.setHex(j < 0.35 ? 0x5a5650 : j < 0.7 ? 0x3e5230 : 0x4a3a28).offsetHSL(0, 0, (j - 0.5) * 0.08); hedge.setColorAt(k, c);
    });
    s.add(hedge);
    for (const [x, z] of back) {
      const trunk = outline(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 22, 8), mat(0x4a3622)));
      trunk.position.set((x + 0.5) * CELL, 11, (z + 0.5) * CELL); s.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 0), mat(0x2e4428)); crown.position.set((x + 0.5) * CELL, 24, (z + 0.5) * CELL); s.add(crown);
    }
    // Spawn: arched mouse hole in a huge stump at the road's end (Y).
    for (const sp of SPAWNS) {
      const stump = outline(new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 7, 12), mat(0x5a4230)), 1.01);
      stump.position.set(sp.x, 3.5, WORLD_H + 7); s.add(stump);
      this.archHole(sp.x, WORLD_H, Math.PI, 1.6, 0x050403);
    }

    // Furniture, walls, guardhouse, tunnel.
    this.roofs = [];
    for (const f of FURNITURE) {
      const fg = makeFurniture(f); s.add(fg);
      if (f.kind !== 'solid') this.roofs.push({ f, g: fg });
      const [x0, z0, x1, z1] = f.rect;
      if (f.kind === 'solid') this.proxy(x0, 0, z0, x1, f.h, z1);
      else this.proxy(x0, f.bot, z0, x1, f.top, z1);
    }
    // Forest walls for the crosshair too (so traps can mount on the hedge).
    // One proxy per solid forest cell next to the road is enough.
    for (const [x, z] of edge) this.proxy(x * CELL, 0, z * CELL, (x + 1) * CELL, 5, (z + 1) * CELL);

    // Gate: a wooden board jammed in the portcullis gap, with a cat-sized hole.
    const gw = GATE.x1 - GATE.x0, gd = GATE.z1 - GATE.z0, gx = (GATE.x0 + GATE.x1) / 2, gz = (GATE.z0 + GATE.z1) / 2;
    const gate = new THREE.Group(); gate.position.set(gx, 0, gz);
    for (const side of [-1, 1]) {
      const plank = outline(new THREE.Mesh(new THREE.BoxGeometry(gw / 2 - 0.6, 4.2, gd), mat(0x7a5a38)), 1.01);
      plank.position.set(side * (gw / 4 + 0.3), 2.1, 0); gate.add(plank);
    }
    const lintel = outline(new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2 - 1.3, gd), mat(0x7a5a38)), 1.01); lintel.position.set(0, 1.3 + (4.2 - 1.3) / 2, 0); gate.add(lintel);
    s.add(gate); this.gateMesh = gate;
    this.gateProxy = this.proxy(GATE.x0, 0, GATE.z0, GATE.x1, 4.2, GATE.z1);
    // Portcullis raised into the tunnel roof (bars end at the roof line).
    for (let k = 0; k < 20; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat(0x2a2826)); bar.position.set(GATE.x0 + 0.4 + k * 0.8, 9 + 1.5, GATE.z1 - 0.3); s.add(bar); }

    // Exit X: arched mouse hole in the great hall wall, glowing.
    const hx = (HOLE.x0 + HOLE.x1) / 2;
    this.archHole(hx, 1.0, 0, (HOLE.x1 - HOLE.x0) / 2 + 0.2, 0x0a0604);
    const glow = new THREE.PointLight(0xffa050, 10, 9, 1.5); glow.position.set(hx, 0.6, 2); s.add(glow);
    this.exitRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 24), new THREE.MeshBasicMaterial({ color: 0xc8302a, transparent: true, opacity: 0.8 }));
    this.exitRing.rotation.x = -Math.PI / 2; this.exitRing.position.set(hx, 0.03, 2.2); s.add(this.exitRing);
    // Torches on the yard walls.
    for (const [x, z] of [[2.2, 40], [93.8, 40], [39.8, 66], [56.2, 66], [48, 2.2], [27.8, 20], [68.2, 20]]) {
      const l = new THREE.PointLight(0xffb060, 8, 26, 1.4); l.position.set(x, 6, z); s.add(l);
    }
    // Tail stashes: crate + a frame with a string to peg tails on. Fits inside its 2.2 collider.
    this.stashLines = [];
    for (const st of STALLS) {
      const [x0, z0, x1, z1] = st.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0;
      const g = new THREE.Group(); g.position.set(cx, 0, cz); s.add(g);
      g.add(outline(new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, z1 - z0), mat(0x8a6a44)))); g.children[0].position.y = 0.45;
      for (const k of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), mat(0x3a2a1a)); post.position.set(k * (w / 2 - 0.1), 1.55, 0); g.add(post); }
      const line = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.03, 0.03), mat(0xd8d0c0)); line.position.y = 2.15; g.add(line);
      const pegs = new THREE.Group(); g.add(pegs); this.stashLines.push({ pegs, w, n: 0 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.05, 24), new THREE.MeshBasicMaterial({ color: 0xe0b030, transparent: true, opacity: 0.35 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(st.sell[0], 0.04, st.sell[1]); s.add(ring);
    }
    this.aimProxies.updateMatrixWorld(true);
  }

  // Dark arched hole facing +z (rotY 0) or -z (rotY PI), flush with a wall face.
  archHole(x, z, rotY, r, color) {
    const g = new THREE.Group(); g.position.set(x, 0, z + (rotY ? -0.01 : 0.01)); g.rotation.y = rotY;
    const m = new THREE.MeshBasicMaterial({ color });
    const top = new THREE.Mesh(new THREE.CircleGeometry(r, 16, 0, Math.PI), m); top.position.y = r * 0.6; g.add(top);
    const body = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 0.6), m); body.position.y = r * 0.3; g.add(body);
    const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.15, 16, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a2a1c })); rim.position.y = r * 0.6; rim.position.z = 0.002; g.add(rim);
    this.scene.add(g);
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
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color(); this._w = new THREE.Color(0xffffff);
  }

  // Glowing chevrons on the floor showing where the mice will run right now.
  buildRoute() {
    const shape = new THREE.Shape(); shape.moveTo(-0.3, -0.15); shape.lineTo(0, 0.15); shape.lineTo(0.3, -0.15); shape.lineTo(0.3, -0.02); shape.lineTo(0, 0.28); shape.lineTo(-0.3, -0.02);
    const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
    this.routeMat = new THREE.MeshBasicMaterial({ color: 0xb48aff, transparent: true, opacity: 0.6, depthWrite: false });
    this.routeMesh = new THREE.InstancedMesh(geo, this.routeMat, 600); this.routeMesh.count = 0; this.routeMesh.frustumCulled = false;
    this.scene.add(this.routeMesh); this.routeRef = null;
  }
  updateRoute(now) {
    const routes = this.sim.routes();
    if (routes !== this.routeRef) {
      this.routeRef = routes;
      let n = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (const pts of routes) for (let k = 0; k < pts.length - 2 && n < 600; k += 3) {
        const [x, z] = pts[k], [x2, z2] = pts[k + 2];
        q.setFromAxisAngle(up, Math.atan2(x2 - x, z2 - z));
        m4.compose(new THREE.Vector3(x, 0.04, z), q, new THREE.Vector3(1.4, 1, 1.4)); this.routeMesh.setMatrixAt(n++, m4);
      }
      this.routeMesh.count = n; this.routeMesh.instanceMatrix.needsUpdate = true;
    }
    this.routeMat.opacity = (this.sim.phase === 'build' ? 0.55 : 0.2) + Math.sin(now / 300) * 0.08;
  }

  ensureCat(cat) {
    if (!this.cats.has(cat.id)) {
      const m = makeCat(cat.kind); this.scene.add(m);
      this.cats.set(cat.id, { mesh: m, walk: 0, atkT: 0, side: 0, kind: cat.kind, tailX: 0, tailZ: 0, tailSwish: 0 });
    }
    return this.cats.get(cat.id);
  }

  placeTrapModel(g, kind, cells, rot, wallDir) {
    const good = cells.filter(i => i >= 0);
    if (!good.length) { g.visible = false; return; }
    const xs = good.map(i => i % W), zs = good.map(i => (i / W) | 0);
    g.visible = true;
    const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * CELL, cz = (Math.min(...zs) + Math.max(...zs) + 1) / 2 * CELL;
    const def = TRAPS[kind];
    const y = def.surface === 'ceiling' ? this.sim.map.slabBot[good[0]] : 0;
    g.position.set(cx, y, cz);
    g.rotation.y = def.surface === 'wall' ? (wallDir >= 0 ? YAW_FOR[OPP[wallDir]] : 0) : YAW_FOR[ROT_DIR[rot % 4]];
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
      if (this.particles.length > 400) this.scene.remove(this.particles.shift());
      const p = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color, transparent: true }));
      p.position.set(x, y, z);
      p.userData = { vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed, vz: (Math.random() - 0.5) * speed, life: 0.7 };
      this.scene.add(p); this.particles.push(p);
    }
  }
  decal(x, z, color, r, y = 0.02) {
    if (this.decals.length > 80) this.scene.remove(this.decals.shift());
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 9), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    d.rotation.x = -Math.PI / 2; d.rotation.z = Math.random() * 6; d.position.set(x, y + Math.random() * 0.005, z); d.userData.life = 8;
    this.scene.add(d); this.decals.push(d);
  }

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
      case 'snap': case 'flip': case 'blow': { const g = trap(e.id); if (g) g.userData.anim = 1; break; }
      case 'zap': {
        const g = trap(e.id); if (!g) break; g.userData.anim = 1;
        for (const v of e.hits || []) {
          const pts = [], a = new THREE.Vector3(g.position.x, g.position.y - 0.5, g.position.z), b = new THREE.Vector3(v[0], 0.3, v[1]);
          for (let k = 0; k <= 6; k++) { const p = a.clone().lerp(b, k / 6); if (k && k < 6) { p.x += (Math.random() - 0.5) * 0.5; p.z += (Math.random() - 0.5) * 0.5; } pts.push(p); }
          const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbfe4ff, transparent: true }));
          bolt.userData = { vx: 0, vy: 0, vz: 0, life: 0.2 }; this.scene.add(bolt); this.particles.push(bolt);
        }
        break;
      }
      case 'kill':
        if (e.drowned) this.spawnParticles(e.x, -0.4, e.z, 0x9cc8e4, 8);
        else if (!e.eaten) { this.spawnParticles(e.x, e.y + 0.3, e.z, 0x8a1c14, e.splat ? 16 : 6, e.splat ? 5 : 3); this.decal(e.x, e.z, 0x5a1410, e.splat ? 0.5 : 0.25, Math.max(0.02, e.y + 0.02)); }
        break;
      case 'eat': this.spawnParticles(e.x, 0.3, e.z, 0x8a1c14, 10, 2); { const c = this.cats.get(e.id); if (c) c.atkT = 0.3; } break;
      case 'splat': this.spawnParticles(e.x, e.y + 0.1, e.z, 0x7a1810, e.big ? 20 : 10, e.big ? 6 : 4); this.decal(e.x, e.z, 0x5a1410, e.big ? 0.7 : 0.45, Math.max(0.02, e.y + 0.02)); break;
      case 'splash': this.spawnParticles(e.x, -0.4, e.z, 0xbfe0ea, 14, 4); break;
      case 'boom': this.spawnParticles(e.x, 2, e.z, 0x8a8478, 24, 6); break;
      case 'gateBreak': {
        this.scene.remove(this.gateMesh); this.aimProxies.remove(this.gateProxy);
        this.spawnParticles((GATE.x0 + GATE.x1) / 2, 2, (GATE.z0 + GATE.z1) / 2, 0x7a5a38, 40, 6, 0.15);
        break;
      }
      case 'spit': case 'bite': { const c = this.cats.get(e.id); if (c) { c.atkT = 0.14; c.side ^= 1; } break; }
      case 'pounceLand': case 'slam': this.spawnParticles(e.x, e.y + 0.1, e.z, 0xd8d0c0, 18, 5); break;
      case 'pelletHit': this.spawnParticles(e.x, e.y + 0.1, e.z, e.mouse ? 0x8a1c14 : 0x8a8a6a, 4, 2, 0.05); break;
      case 'hairSplat': this.spawnParticles(e.x, e.y + 0.1, e.z, 0x6a7a3a, 14, 4); this.decal(e.x, e.z, 0x5a6a2a, 0.9, Math.max(0.02, e.y + 0.02)); break;
      case 'wallkick': this.spawnParticles(e.x, e.y + 0.5, e.z, 0xd8d0c0, 6, 2); break;
      case 'stash': this.addStashTails(e.stall, e.n); break;
    }
  }
  // Peg traded tails onto the stash's line so the haul visibly grows.
  addStashTails(si, n) {
    const L = this.stashLines[si]; if (!L) return;
    for (let k = 0; k < Math.min(n, 30) && L.n < 24; k++, L.n++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.5, 4), mat(0xc9a3a0));
      t.position.set(-L.w / 2 + 0.2 + (L.n % 12) * ((L.w - 0.4) / 11), 1.9 - Math.floor(L.n / 12) * 0.05, (L.n % 2) * 0.05); L.pegs.add(t);
    }
  }

  // Crosshair ray: what surface are we pointing at? Always returns a point
  // (far along the ray if nothing is hit) so ranged attacks never fizzle.
  aim(maxDist = 30) {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.ray.intersectObjects(this.aimProxies.children, false);
    const me = this.localCat ? this.localCat.mesh.position : null;
    const h = hits.find(h => !me || h.point.distanceTo(me) > 0.4);
    if (!h || (me && h.point.distanceTo(me) > maxDist)) {
      const p = this.ray.ray.origin.clone().addScaledVector(this.ray.ray.direction, maxDist);
      return { point: p, normal: new THREE.Vector3(0, 1, 0), surface: 'none', cell: -1, wallDir: -1 };
    }
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    const p = h.point;
    let surface, cell, wallDir = -1;
    if (n.y > 0.7) { surface = p.y < 0.15 ? 'floor' : 'top'; cell = cellOf(p.x, p.z); }
    else if (n.y < -0.7) { surface = 'ceiling'; cell = cellOf(p.x, p.z); }
    else {
      surface = 'wall';
      cell = cellOf(p.x + n.x * 0.25, p.z + n.z * 0.25);
      wallDir = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 1 : 0) : (n.z > 0 ? 3 : 2);
    }
    return { point: p.clone(), normal: n, surface, cell, wallDir };
  }

  zoom(delta) { if (this.camDist != null) this.camDist = Math.max(2.5, Math.min(10, this.camDist + delta)); }

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
      const speed = Math.hypot(cat.vx, cat.vz), moving = speed > 0.5 && cat.onGround;
      c.walk += moving ? dt * speed * 1.6 : 0;
      ud.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(c.walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; l.rotation.z = 0; });
      // Attack anims: Fred jerks his head forward to spit, Puddin lunges and bites.
      c.atkT = Math.max(0, c.atkT - dt);
      ud.head.position.z = 0.55 * ud.scale + (c.atkT > 0 ? 0.15 : 0);
      ud.jaw.rotation.x = c.atkT > 0.07 ? 0.6 : 0;
      ud.head.rotation.x = -camPitch * 0.3 + (c.atkT > 0 ? 0.2 : 0);
      ud.slash.children.forEach(st => { st.material.opacity = 0; });
      if (ud.reach) ud.reach.material.opacity = cat.attacking ? 0.28 : 0.1;
      ud.body.rotation.x = cat.pouncing ? -0.35 : cat.charge > 0 ? 0.25 : 0;      // stretch mid-pounce, crouch when charging
      ud.body.position.y = cat.charge > 0 ? -0.08 * cat.charge / 0.8 : cat.hurtT > 0 ? 0.05 : 0;
      // Tail: idle sway, lifts and swishes faster when running, flicks on turns, droops when hurt.
      const run = Math.min(1, speed / cat.def.speed);
      const targetX = (cat.hurtT > 0 ? 0.6 : 0) - run * 0.7 + (cat.onGround ? 0 : -0.4);
      c.tailSwish += dt * (2 + run * 8);
      const turnFlick = Math.max(-1, Math.min(1, (cat.turn || 0) * 12));
      const targetZ = Math.sin(c.tailSwish) * (0.25 + run * 0.25) - turnFlick * 0.6;
      c.tailX += (targetX - c.tailX) * Math.min(1, dt * 8); c.tailZ += (targetZ - c.tailZ) * Math.min(1, dt * 10);
      ud.tail.rotation.x = c.tailX; ud.tail.rotation.z = c.tailZ;
    }
    this.drawMice(dt, k, now);
    this.syncSimple(sim.tails, this.tailMeshes, () => {
      const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.6, 4), mat(0xc9a3a0)); t.rotation.z = Math.PI / 2; t.position.y = 0.05; g.add(t);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 12), new THREE.MeshBasicMaterial({ color: 0xe0b030, transparent: true, opacity: 0.6 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); return g;
    }, (g, t) => { g.position.set(t.x, t.y, t.z); g.children[0].rotation.y += dt; g.scale.setScalar(1 + Math.min(t.amount, 10) * 0.08); });
    this.syncSimple(sim.loot, this.lootMeshes, (l) => makeTrinket(TRINKETS[l.key].tier), (g, l) => { g.position.set(l.x, l.y + Math.sin(now / 250 + l.id) * 0.08, l.z); g.rotation.y += dt * 3; });
    this.syncSimple(sim.shots, this.shotMeshes, () => outline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), mat(0x6f6a62))), (g, s) => { g.position.set(s.x, s.y, s.z); g.rotation.x += dt * 8; });
    this.syncSimple(sim.missiles, this.missileMeshes, (b) => b.kind === 'pellet'
      ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(0x8a8a5a))
      : outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(0x6a7a3a))), (g, b) => { g.position.set(b.x, b.y, b.z); g.rotation.y += dt * 10; });
    // Traps
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
    // Particles, decals, water, route
    this.particles = this.particles.filter(p => {
      const u = p.userData; u.life -= dt; if (!p.isLine) u.vy -= 9 * dt;
      p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
      p.material.opacity = Math.max(0, u.life / 0.7);
      if (u.life <= 0) { this.scene.remove(p); return false; } return true;
    });
    this.decals = this.decals.filter(d => { d.userData.life -= dt; d.material.opacity = Math.min(0.7, d.userData.life / 3); if (d.userData.life <= 0) { this.scene.remove(d); return false; } return true; });
    const pos = this.water.geometry.attributes.position, base = this.waterBase, t = now / 600;
    for (let v = 0; v < pos.count; v++) { const x = base[v * 3], y = base[v * 3 + 1]; pos.array[v * 3 + 2] = Math.sin(x * 0.6 + t) * 0.06 + Math.cos(y * 0.9 + t * 1.3) * 0.05; }
    pos.needsUpdate = true; this.water.geometry.computeVertexNormals();
    this.exitRing.material.opacity = 0.5 + Math.sin(now / 250) * 0.3;
    this.updateRoute(now);
    // Roofs fade out from below while you're under them, so you can see the fight.
    if (this.localCat) {
      const p = this.localCat.mesh.position, cp = this.camera.position;
      for (const r of this.roofs) {
        const [x0, z0, x1, z1] = r.f.rect;
        const under = (q) => q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1 && q.y < r.f.bot + 0.5;
        const fade = under(p) || under(cp);
        if (r.faded !== fade) {
          r.faded = fade;
          r.g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = fade; o.material.opacity = fade ? 0.22 : 1; o.material.depthWrite = !fade; } });
        }
      }
    }

    // ----- third-person camera: over the right shoulder; mouse wheel zooms -----
    const me = this.localCat;
    if (me) {
      if (this.camDist == null) this.camDist = me.kind === 'puddin' ? 6.5 : 5.5;
      const p = me.mesh.position, catH = me.kind === 'puddin' ? 1.25 : 0.95;
      const target = new THREE.Vector3(p.x, p.y + catH * 1.4, p.z);
      const back = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
      const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
      const shoulder = 0.9;
      let d = this.camDist;
      for (let s = 0.4; s <= this.camDist; s += 0.2) {
        const q = target.clone().addScaledVector(back, s).addScaledVector(right, shoulder * Math.min(1, s / 2));
        if (q.y < 0.15 || q.y > 16 || sim.blocks(cellOf(q.x, q.z), q.y - 0.15, 0.3, 0, true)) { d = Math.max(0.6, s - 0.25); break; }
      }
      const sh = shoulder * Math.min(1, d / 2);
      this.camera.position.copy(target).addScaledVector(back, d).addScaledVector(right, sh);
      this.camera.lookAt(target.clone().addScaledVector(back, -14).addScaledVector(right, sh));
      // Fade the cat when the camera is squeezed right up against it.
      const close = d < 1.6;
      if (me.close !== close) { me.close = close; me.mesh.userData.body.traverse(o => { if (o.isMesh && o.material !== OUTLINE) { o.material = o.material.clone(); o.material.transparent = close; o.material.opacity = close ? 0.35 : 1; } }); }
    }
    this.renderer.render(this.scene, this.camera);
  }

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
    const set = (mesh, i, ox, oy, oz, rx, sx, sy, sz) => { L.compose(v.set(ox, oy, oz), q.setFromEuler(e.set(rx, 0, 0)), sc.set(sx, sy, sz)); L.premultiply(M); mesh.setMatrixAt(i, L); };
    const seen = new Set();
    for (const mo of this.sim.mice) {
      if (n >= MAX_MICE) break;
      seen.add(mo.id);
      let p = this.mouseLerp.get(mo.id);
      if (!p) { p = { x: mo.x, y: mo.y, z: mo.z }; this.mouseLerp.set(mo.id, p); }
      p.x += (mo.x - p.x) * k; p.y += (mo.y - p.y) * k; p.z += (mo.z - p.z) * k;
      const d = MICE[mo.type], s = d.size * (mo.scale || 1);
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
      col.setHex(d.color).offsetHSL(0, 0, mo.shade || 0);
      if (mo.flash > 0) col.lerp(this._w, 0.7);
      else if (mo.state === 'stuck') col.lerp(new THREE.Color(0xe0d060), 0.5);
      else if (mo.slowT > 0) col.lerp(new THREE.Color(0x7a9a3a), 0.5);
      else if (mo.stunT > 0) col.lerp(new THREE.Color(0xa0a0ff), 0.4);
      body.setColorAt(n, col); head.setColorAt(n, col);
      eyes.setColorAt(n, col.setHex(d.boss ? 0xff2a1a : 0x111111));
      n++;
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
