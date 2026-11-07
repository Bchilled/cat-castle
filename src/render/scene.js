// scene.js — draws the sim. Reads state, never changes it.
// Why read-only: the renderer can be swapped, or run on a co-op client that only
// receives snapshots from a host, without touching game rules.
// Rule kept throughout: every visible solid thing sits inside a collider.

import * as THREE from 'three';
import {
  W, H, CELL, T, FURNITURE, DRAIN, BRIDGE, GATE, HOLE, SPAWNS, cellOf, WORLD_W, WORLD_H, MAP,
} from '../sim/map.js';
import { MICE, TRAPS, TRINKETS, CAT } from '../config.js';
import { ROT_DIR } from '../sim/sim.js';
import { mat, outline, OUTLINE, makeCat, makeTrap, makeTrinket, makeFurniture, makeBird, makeProp } from './models.js';
import { tmat } from './textures.js';

const MAX_MICE = 800;
const YAW_FOR = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];   // DIRS4 index -> yaw pointing local +z that way
const OPP = [1, 0, 3, 2];

export class Scene {
  constructor(canvas, sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene = new THREE.Scene();
    // Lighting per map: daylight outside, dim indoors, near-black in the cellar
    // (the cat carries a little glow there so you can see your own paws).
    const dark = !!MAP.dark, indoor = MAP.birds === false || dark;
    const sky = dark ? 0x0a0806 : indoor ? 0x2a2420 : 0x8fa4b0;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, dark ? 12 : indoor ? 35 : 50, dark ? 48 : indoor ? 120 : 170);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 250);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ea, 0x4a4030, dark ? 0.25 : indoor ? 0.9 : 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, dark ? 0.1 : indoor ? 0.6 : 1.3); sun.position.set(-25, 45, 30); this.scene.add(sun);
    if (dark) { this.lantern = new THREE.PointLight(0xffd8a0, 14, 22, 1.4); this.scene.add(this.lantern); }
    this.camDist = null;                                            // set per cat on first frame; wheel zooms

    this.cats = new Map(); this.trapMeshes = new Map(); this.tailMeshes = new Map(); this.lootMeshes = new Map();
    this.shotMeshes = new Map(); this.globMeshes = new Map(); this.birdMeshes = new Map(); this.zoneMeshes = new Map(); this.decoyMeshes = new Map(); this.rings = []; this.shake = 0; this.missileMeshes = new Map(); this.bossBars = new Map(); this.mouseLerp = new Map();
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
    // Real-size detail: 11 cm cobbles in the castle, packed dirt outside. One instanced
    // slab per unit square, textured by world position so the pattern runs seamlessly.
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    function i(x, z) { return z * W + x; }
    const isDirt = ([x, z, t]) => t === T.ROAD || !!map.forest[i(x, z)];
    const FLOORS = { cobbles: ['cobbles', 3, 0xc8c0b4], dirt: ['dirt', 4, 0xd8ccb8], stone: ['stone', 4, 0xb8b0a4], planks: ['planks', 2.5, 0xb89a78] };
    const fl = FLOORS[MAP.floor] || FLOORS.cobbles;
    for (const [dirt, tex, scale, tint] of [[false, ...fl], [true, 'dirt', 4, 0xd8ccb8]]) {
      const list = ground.filter(g => isDirt(g) === dirt);
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, 1), tmat(tex, scale, tint), list.length);
      list.forEach(([x, z], k) => {
        m4.makeTranslation((x + 1) * CELL, -0.15, (z + 1) * CELL); inst.setMatrixAt(k, m4);
        const j = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 100 / 100;
        c.setHex(0xffffff).offsetHSL(0, 0, (j - 0.5) * 0.06); inst.setColorAt(k, c);   // faint patchiness
      });
      s.add(inst);
    }
    const indoor = MAP.birds === false || !!MAP.dark;
    const under = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 200, WORLD_H + 200), mat(indoor ? 0x1a1612 : 0x3a4a2a));
    under.rotation.x = -Math.PI / 2; under.position.set(WORLD_W / 2, -0.31, WORLD_H / 2); s.add(under);
    this.proxy(0, -0.3, 0, WORLD_W, 0, WORLD_H);

    // Water: the moat (entrance) and troughs (stables) — sunk below the floor, gently moving.
    this.waters = [];
    for (const DRAIN of [...(MAP.drain ? [MAP.drain] : []), ...(MAP.waters || [])]) {
    const dw = DRAIN.x1 - DRAIN.x0, dd = DRAIN.z1 - DRAIN.z0, dcx = (DRAIN.x0 + DRAIN.x1) / 2, dcz = (DRAIN.z0 + DRAIN.z1) / 2;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.2, dd), mat(0x1a2a2a)); bed.position.set(dcx, -1.4, dcz); s.add(bed);
    for (const k of [-1, 1]) { const bank = new THREE.Mesh(new THREE.BoxGeometry(dw, 1.4, 0.2), mat(0x4e463c)); bank.position.set(dcx, -0.7, dcz + k * dd / 2); s.add(bank); }
    const wgeo = new THREE.PlaneGeometry(dw, dd, 48, 6);
    this.water = new THREE.Mesh(wgeo, new THREE.MeshLambertMaterial({ color: 0x2f6f9a, transparent: true, opacity: 0.88, flatShading: true }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(dcx, -0.45, dcz); s.add(this.water);
    this.waterBase = Float32Array.from(wgeo.attributes.position.array);
    this.waters.push({ mesh: this.water, base: this.waterBase });
    if (DRAIN !== MAP.drain) for (const [ox, oz, sx, sz] of [[0, -dd / 2, dw + 0.4, 0.2], [0, dd / 2, dw + 0.4, 0.2], [-dw / 2, 0, 0.2, dd], [dw / 2, 0, 0.2, dd]]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz), tmat('planks', 2, 0x8a6a48)); rim.position.set(dcx + ox, 0.06, dcz + oz); s.add(rim);   // trough rim, flush
    }
    }
    // Mud (stables): a dark, wet layer over the dirt.
    for (const mr of MAP.muds || []) {
      const mud = new THREE.Mesh(new THREE.PlaneGeometry(mr.x1 - mr.x0, mr.z1 - mr.z0), tmat('dirt', 3, 0x5a4028)); mud.material.transparent = true; mud.material.opacity = 0.85;
      mud.rotation.x = -Math.PI / 2; mud.position.set((mr.x0 + mr.x1) / 2, 0.015, (mr.z0 + mr.z1) / 2); s.add(mud);
    }
    if (BRIDGE) {
    // Fallen branch across the moat (the mouse-sized bridge).
    const bw = BRIDGE.x1 - BRIDGE.x0, bd = BRIDGE.z1 - BRIDGE.z0;
    const branch = outline(new THREE.Mesh(new THREE.CylinderGeometry(bw / 2, bw / 2 * 0.85, bd, 12), tmat('bark', 3, 0xc0a890)), 1.01);
    branch.rotation.x = Math.PI / 2; branch.scale.set(1, 1, 0.5); branch.position.set((BRIDGE.x0 + BRIDGE.x1) / 2, -bw / 4 + 0.02, (BRIDGE.z0 + BRIDGE.z1) / 2); s.add(branch);
    }

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
      const trunk = outline(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 22, 8), tmat('bark', 3, 0xb09880)));
      trunk.position.set((x + 0.5) * CELL, 11, (z + 0.5) * CELL); s.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 0), mat(0x2e4428)); crown.position.set((x + 0.5) * CELL, 24, (z + 0.5) * CELL); s.add(crown);
    }
    // Spawn: arched mouse hole — in a huge stump at the road's end outside, in the wall indoors.
    for (const sp of SPAWNS) {
      if (MAP.roads) {
        const stump = outline(new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 7, 16), tmat('bark', 4, 0xc0a890)), 1.01);
        stump.position.set(sp.x, 3.5, WORLD_H + 7); s.add(stump);
      }
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

    // Gate: a wooden board jammed in the portcullis gap, with a cat-sized hole (entrance map only).
    if (GATE) {
    const gw = GATE.x1 - GATE.x0, gd = GATE.z1 - GATE.z0, gx = (GATE.x0 + GATE.x1) / 2, gz = (GATE.z0 + GATE.z1) / 2;
    const gate = new THREE.Group(); gate.position.set(gx, 0, gz);
    for (const side of [-1, 1]) {
      const plank = outline(new THREE.Mesh(new THREE.BoxGeometry(gw / 2 - 0.6, 4.2, gd), tmat('planks', 2, 0xb08a60)), 1.01);
      plank.position.set(side * (gw / 4 + 0.3), 2.1, 0); gate.add(plank);
    }
    const lintel = outline(new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2 - 1.3, gd), tmat('planks', 2, 0xb08a60)), 1.01); lintel.position.set(0, 1.3 + (4.2 - 1.3) / 2, 0); gate.add(lintel);
    s.add(gate); this.gateMesh = gate;
    this.gateProxy = this.proxy(GATE.x0, 0, GATE.z0, GATE.x1, 4.2, GATE.z1);
    // Portcullis raised into the tunnel roof (bars end at the roof line).
    for (let k = 0; k < 20; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat(0x2a2826)); bar.position.set(GATE.x0 + 0.4 + k * 0.8, 9 + 1.5, GATE.z1 - 0.3); s.add(bar); }
    }

    // Exit X: arched mouse hole in the great hall wall, glowing.
    const hx = (HOLE.x0 + HOLE.x1) / 2;
    this.archHole(hx, 1.0, 0, (HOLE.x1 - HOLE.x0) / 2 + 0.2, 0x0a0604);
    const glow = new THREE.PointLight(0xffa050, 10, 9, 1.5); glow.position.set(hx, 0.6, 2); s.add(glow);
    this.exitRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 24), new THREE.MeshBasicMaterial({ color: 0xc8302a, transparent: true, opacity: 0.8 }));
    this.exitRing.rotation.x = -Math.PI / 2; this.exitRing.position.set(hx, 0.03, 2.2); s.add(this.exitRing);
    // Wall torches at human height (2.4 m) in iron sconces: [x, z, face normal x, z].
    this.flames = [];
    for (const [x, z, nx, nz] of MAP.torches || []) {
      const g = new THREE.Group(); g.position.set(x, 8, z); g.rotation.y = Math.atan2(nx, nz); s.add(g);
      g.add(part3(new THREE.BoxGeometry(0.5, 0.8, 0.12), 0x26221e, 0, 0, 0.06));
      const stick = part3(new THREE.CylinderGeometry(0.12, 0.08, 1.2, 6), 0x5a3a20, 0, 0.3, 0.45); stick.rotation.x = 0.35; g.add(stick);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
      flame.position.set(0, 1.05, 0.65); g.add(flame); this.flames.push(flame);
      const l = new THREE.PointLight(0xffb060, 10, 30, 1.4); l.position.set(x + nx * 1, 9, z + nz * 1); s.add(l);
    }
    function part3(geo, color, x, y, z) { const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); return m; }
    this.aimProxies.updateMatrixWorld(true);
  }

  // Dark arched hole facing +z (rotY 0) or -z (rotY PI), flush with a wall face.
  // ---------- map features (built once, animated every frame) ----------
  buildMapFeatures() {
    const s = this.scene;
    // Timed doors: plank doors that slide up into the ceiling when open.
    this.doorMeshes = (MAP.doors || []).map(d => {
      const [x0, z0, x1, z1] = d.rect, m = outline(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 6, z1 - z0), tmat('planks', 2, 0x9a7a58)), 1.01);
      m.position.set((x0 + x1) / 2, 3, (z0 + z1) / 2); s.add(m); return m;
    });
    // Fires: flames, a glow and embers in front of the ovens and hearth.
    this.fireFx = (MAP.fires || []).map(f => {
      const g = new THREE.Group(); g.position.set(f.x, 0, f.z); s.add(g);
      for (let k = 0; k < 5; k++) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 6), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xffa030 : 0xff5a1a, transparent: true, opacity: 0.85 }));
        fl.position.set(Math.cos(k * 1.26) * f.r * 0.4, 0.6, Math.sin(k * 1.26) * f.r * 0.4); g.add(fl);
      }
      const glow = new THREE.Mesh(new THREE.CircleGeometry(f.r, 24), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.25, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; g.add(glow);
      const l = new THREE.PointLight(0xff7a30, 18, 14, 1.4); l.position.y = 1.5; g.add(l);
      return { g, f };
    });
    // Food piles: produce heaped on the sacks; the heap shrinks as mice eat it.
    this.foodFx = this.sim.foods.map(f => {
      const g = new THREE.Group(); g.position.set(f.x, 0.8, f.z); s.add(g);
      const col = /cheese/i.test(f.name) ? 0xf0c838 : /bread|oat/i.test(f.name) ? 0xc89a5a : /cabbage|veg/i.test(f.name) ? 0x6aa040 : 0xc83a2a;
      if (!/wheel/i.test(f.name)) for (let k = 0; k < 9; k++) {
        const a = k * 2.4, r = 0.35 + (k % 3) * 0.3;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(col)); ball.position.set(Math.cos(a) * r, 0.15 + (k % 2) * 0.2, Math.sin(a) * r); g.add(ball);
      }
      return { g, f };
    });
    this.propMeshes = new Map();
  }
  drawMapFeatures(dt, now) {
    if (!this.doorMeshes) this.buildMapFeatures();
    this.sim.doors.forEach((d, k) => { const m = this.doorMeshes[k]; const ty = d.open ? 9.3 : 3;   // open: tucked up above the ceiling m.position.y += (ty - m.position.y) * Math.min(1, dt * 6); });
    for (const { g } of this.fireFx) g.children.forEach((c, k) => { if (c.geometry && c.geometry.type === 'ConeGeometry') c.scale.y = 0.8 + Math.sin(now / 70 + k * 1.9) * 0.3; });
    if (Math.random() < dt * 8) for (const { f } of this.fireFx) this.spawnParticles(f.x + (Math.random() - 0.5) * f.r, 0.5, f.z + (Math.random() - 0.5) * f.r, 0xff8a30, 1, 2, 0.05);
    for (const { g, f } of this.foodFx) { const k = Math.max(0, f.left / f.amount); g.scale.setScalar(Math.max(0.01, k)); g.visible = k > 0; }
    // Knock-over props: pots, jugs, baskets, buckets.
    this.syncSimple(this.sim.props, this.propMeshes, (p) => makeProp(p.kind), (g, p) => {
      g.position.set(p.x, p.y, p.z); g.rotation.z = p.state === 'up' ? 0 : Math.min(Math.PI / 2, p.tilt);
    });
    if (this.lantern) { const c = this.sim.cats.values().next().value; if (c) this.lantern.position.set(c.x, c.y + 2.5, c.z); }
  }

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
      // Stun stars circling a dazed mouse's head; the circle shrinks as the stun runs out (its timer).
      stars: mk(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_MICE * 3),   // tinted per instance: yellow stun, blue sleep
    };
    this._m = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color(); this._w = new THREE.Color(0xffffff);
  }

  // Glowing chevrons on the floor showing where the mice will run right now.
  buildRoute() {
    const shape = new THREE.Shape(); shape.moveTo(-0.3, -0.15); shape.lineTo(0, 0.15); shape.lineTo(0.3, -0.15); shape.lineTo(0.3, -0.02); shape.lineTo(0, 0.28); shape.lineTo(-0.3, -0.02);
    const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI);   // tip points +z, i.e. along the route
    this.routeMat = new THREE.MeshBasicMaterial({ color: 0xb48aff, transparent: true, opacity: 0.6, depthWrite: false });
    this.routeMesh = new THREE.InstancedMesh(geo, this.routeMat, 1200); this.routeMesh.count = 0; this.routeMesh.frustumCulled = false;
    this.scene.add(this.routeMesh); this.routeRef = null;
  }
  updateRoute(now) {
    const routes = this.sim.routes();
    if (routes !== this.routeRef) {
      this.routeRef = routes;
      // Several lanes share stretches (both entrances, every route choice): draw each spot once.
      let n = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), used = new Set();
      for (const pts of routes) for (let k = 0; k < pts.length - 2 && n < 1200; k += 3) {
        const [x, z] = pts[k], [x2, z2] = pts[k + 2], key = Math.round(x) * 1000 + Math.round(z);
        if (used.has(key)) continue; used.add(key);
        q.setFromAxisAngle(up, Math.atan2(x2 - x, z2 - z));
        m4.compose(new THREE.Vector3(x, 0.04, z), q, new THREE.Vector3(1.4, 1, 1.4)); this.routeMesh.setMatrixAt(n++, m4);
      }
      this.routeMesh.count = n; this.routeMesh.instanceMatrix.needsUpdate = true;
    }
    this.routeMat.opacity = this.sniff ? 0.9 : (this.sim.phase === 'build' ? 0.55 : 0.2) + Math.sin(now / 300) * 0.08;
    this.routeMat.depthTest = !this.sniff;   // sniffing: the routes show through walls
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
  // Cat's sense of smell (hold F): every mouse leaves a scent trail. While sniffing,
  // the last ~12 s of trails glow through walls, mice glow through walls, and the
  // routes the mice will take light up. Trails are always recorded, only drawn when sniffing.
  drawScent(dt, now) {
    if (!this.scent) {
      const N = 4000;
      this.scent = { N, x: new Float32Array(N), z: new Float32Array(N), t: new Float64Array(N), head: 0, sampleT: 0 };
      const geo = new THREE.CircleGeometry(0.22, 8); geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
      this.scentMesh = new THREE.InstancedMesh(geo, m, N); this.scentMesh.count = 0; this.scentMesh.frustumCulled = false; this.scentMesh.renderOrder = 5;
      this.scentMesh.setColorAt(0, new THREE.Color(0)); this.scene.add(this.scentMesh);
    }
    const sc = this.scent;
    sc.sampleT -= dt;
    if (sc.sampleT <= 0) {
      sc.sampleT = 0.35;
      for (const m of this.sim.mice) { if (m.dead) continue; sc.x[sc.head] = m.x; sc.z[sc.head] = m.z; sc.t[sc.head] = now; sc.head = (sc.head + 1) % sc.N; }
    }
    const mice = this.mi;
    for (const k of ['body', 'head', 'ear', 'tail', 'eyes']) { mice[k].material.depthTest = !this.sniff; mice[k].renderOrder = this.sniff ? 6 : 0; }
    if (!this.sniff) { this.scentMesh.count = 0; return; }
    const L = this._l, col = this._c; let n = 0;
    for (let i = 0; i < sc.N; i++) {
      const age = (now - sc.t[i]) / 12000; if (!sc.t[i] || age > 1) continue;
      L.makeTranslation(sc.x[i], 0.06, sc.z[i]); this.scentMesh.setMatrixAt(n, L);
      col.setRGB(0.35 * (1 - age), 0.9 * (1 - age), 0.3 * (1 - age)); this.scentMesh.setColorAt(n, col); n++;
    }
    this.scentMesh.count = n; this.scentMesh.instanceMatrix.needsUpdate = true; this.scentMesh.instanceColor.needsUpdate = true;
  }

  // Burst of colour where an item goes off.
  itemFx(e) {
    const col = { laser: 0xff2020, bola: 0xe0a0c0, catnip: 0x8ae06a, flea: 0x6a5a2a, tonic: 0x6ad0ff, squeaky: 0xffd020 }[e.item] || 0xffffff;
    if (e.r) this.ring(e.x, e.z, e.r, col, 0.5, false, true);
    this.spawnParticles(e.x, 0.5, e.z, col, 12, 3, 0.06);
  }

  // Flat ring on the floor: warn = pulsing danger zone; grow = shockwave expanding to r.
  ring(x, z, r, color, life, warn = false, grow = false, y = 0) {
    const m = new THREE.Mesh(new THREE.RingGeometry(warn ? 0 : r * 0.85, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.04, z); m.userData = { life, max: life, warn, grow };
    this.scene.add(m); this.rings.push(m);
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
      case 'snap': case 'flip': case 'punch': { const g = trap(e.id); if (g) g.userData.anim = 1; break; }
      case 'stompWarn': this.ring(e.x, e.z, e.r, 0xe0302a, 0.7, true); break;
      case 'stomp': this.ring(e.x, e.z, e.r, 0xd8d0c0, 0.5, false, true); this.spawnParticles(e.x, 0.2, e.z, 0x8a8478, 30, 7, 0.14); this.shake = 0.5; break;
      case 'bossRoar': this.shake = 0.8; break;
      case 'burst': this.spawnParticles(e.x, e.y + 0.3, e.z, 0x9a6a8a, 14, 5); break;
      case 'globSplat': this.spawnParticles(e.x, e.y + 0.05, e.z, 0x9adf3a, 8, 2); this.decal(e.x, e.z, 0x6a8a2a, 0.35, Math.max(0.02, e.y + 0.02)); break;
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
      case 'roar': this.ring(e.x, e.z, e.r, 0xff9a2a, 0.6, false, true); this.shake = Math.max(this.shake, 0.35); break;
      case 'birdKill': this.spawnParticles(e.x, e.y, e.z, 0x1a1a22, 16, 4, 0.08); this.spawnParticles(e.x, e.y, e.z, 0xf0f0f0, 6, 3, 0.06); break;
      case 'steal': this.spawnParticles(e.x, 0.6, e.z, 0xf0c838, 8, 2, 0.06); break;
      case 'birdDrop': this.spawnParticles(e.x, 1, e.z, 0x8a8580, 6, 2, 0.06); break;
      case 'spit': case 'bite': case 'whisker': case 'burr': case 'pebble': { const c = this.cats.get(e.id); if (c) { c.atkT = 0.14; c.side ^= 1; } break; }
      case 'claw': { const c = this.cats.get(e.id); if (c) { c.clawT = 0.15; c.side ^= 1; } const cat = this.sim.cats.get(e.id); if (cat && e.hits) this.spawnParticles(cat.x + Math.sin(cat.yaw), cat.y + 0.4, cat.z + Math.cos(cat.yaw), 0xffffff, 3, 3, 0.05); break; }
      case 'whip': {
        const c = this.cats.get(e.id), cat = this.sim.cats.get(e.id); if (c) c.whipT = 0.25;
        if (cat) {   // a quick crack-line along the whip's reach
          const len = CAT.whipRange, streak = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), new THREE.MeshBasicMaterial({ color: 0xe8f070, transparent: true, opacity: 0.8, depthWrite: false }));
          streak.position.set(cat.x + Math.sin(cat.yaw) * len / 2, cat.y + 0.45, cat.z + Math.cos(cat.yaw) * len / 2); streak.rotation.y = cat.yaw;
          streak.userData = { life: 0.15, max: 0.15 }; this.scene.add(streak); this.rings.push(streak);
        }
        break;
      }
      case 'hiss': this.ring(e.x, e.z, e.r, 0xa060ff, 0.5, false, true); break;
      case 'purr': this.ring(e.x, e.z, e.r, 0xffd060, 0.8, false, true); for (const id of e.who) { const c2 = this.sim.cats.get(id); if (c2) this.spawnParticles(c2.x, c2.y + 0.5, c2.z, 0x9af08a, 10, 2, 0.06); } break;
      case 'yawn': this.ring(e.x, e.z, e.r, 0x9ac8ff, 0.9, false, true); break;
      case 'frenzy': { const cat = this.sim.cats.get(e.id); if (cat) this.spawnParticles(cat.x, cat.y + 0.5, cat.z, 0xff3a2a, 14, 4, 0.07); break; }
      case 'strike': this.ring(e.x, e.z, e.r, 0xff6a4a, 0.4, false, true, e.y); this.spawnParticles(e.x, e.y + 0.1, e.z, 0xd8d0c0, 14, 4); break;
      case 'dodge': { const cat = this.sim.cats.get(e.id); if (cat) this.spawnParticles(cat.x, cat.y + 0.5, cat.z, 0xc8e8ff, 6, 3, 0.05); break; }
      case 'pounceLand': this.spawnParticles(e.x, e.y + 0.1, e.z, 0xd8d0c0, 18, 5); this.ring(e.x, e.z, CAT.pounceRadius, 0xfff0a0, 0.45, false, true, e.y); this.shake = Math.max(this.shake, 0.2); break;
      case 'slam': this.spawnParticles(e.x, e.y + 0.1, e.z, 0xd8d0c0, 18, 5); break;
      case 'pelletHit': this.spawnParticles(e.x, e.y + 0.1, e.z, e.mouse ? 0x8a1c14 : 0x8a8a6a, 4, 2, 0.05); break;
      case 'hairSplat': this.spawnParticles(e.x, e.y + 0.1, e.z, 0x6a7a3a, 14, 4); this.decal(e.x, e.z, 0x5a6a2a, 0.9, Math.max(0.02, e.y + 0.02)); break;
      case 'wallkick': this.spawnParticles(e.x, e.y + 0.5, e.z, 0xd8d0c0, 6, 2); break;
      case 'item': this.itemFx(e); break;
      case 'smash': this.spawnParticles(e.x, e.y + 0.3, e.z, 0xb86a3a, 16, 4, 0.08); this.shake = Math.max(this.shake, 0.15); break;
      case 'gorged': this.spawnParticles(e.x, 0.6, e.z, 0xe8c040, 4, 1.5, 0.05); break;
      case 'dash': { const cat = this.sim.cats.get(e.id); if (cat) this.spawnParticles(cat.x, cat.y + 0.2, cat.z, 0xd8d0c0, 10, 3); break; }
      case 'sit': this.ring(e.x, e.z, e.r, 0xd8d0c0, 0.4, false, true); this.spawnParticles(e.x, 0.2, e.z, 0xd8d0c0, 20, 5, 0.1); this.shake = Math.max(this.shake, 0.3); break;
      case 'tinker': this.ring(e.x, e.z, e.r, 0x6fd8ff, 0.6, false, true); break;
      case 'showoff': this.ring(e.x, e.z, e.r, 0xff3a2a, 0.6, false, true); break;
      case 'groom': { const cat = this.sim.cats.get(e.id); if (cat) this.spawnParticles(cat.x, cat.y + 0.6, cat.z, 0x9af08a, 14, 2, 0.06); break; }
      case 'skyswipe': { const cat = this.sim.cats.get(e.id); if (cat) this.spawnParticles(cat.x, cat.y + 0.2, cat.z, 0xd8d0c0, 8, 3); break; }
      case 'points': if (Math.random() < 0.35) this.spawnParticles(e.x, 0.6, e.z, 0xffd060, 2, 1.5, 0.05); break;
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
      m.rotation.order = 'YXZ'; m.rotation.y = cat.yaw;
      // Scary Cat's backflip: a full turn backwards over her local x axis.
      m.rotation.x = cat.flipT > 0 ? -(1 - cat.flipT / 0.5) * Math.PI * 2 : 0;
      const speed = Math.hypot(cat.vx, cat.vz), moving = speed > 0.5 && cat.onGround;
      c.walk += moving ? dt * speed * 1.6 : 0;
      ud.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(c.walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; l.rotation.z = 0; });
      // Attack anims: Fred jerks his head forward to spit, Puddin lunges and bites.
      c.atkT = Math.max(0, c.atkT - dt);
      ud.head.position.z = 0.55 * ud.scale + (c.atkT > 0 ? 0.15 : 0);
      ud.jaw.rotation.x = c.atkT > 0.07 ? 0.6 : 0;
      ud.head.rotation.x = -camPitch * 0.3 + (c.atkT > 0 ? 0.2 : 0);
      ud.slash.children.forEach(st => { st.material.opacity = 0; });
      if (ud.reach) ud.reach.material.opacity = cat.attacking ? 0.4 : 0.18;
      ud.body.rotation.x = cat.pouncing || cat.striking ? -0.35 : cat.charge > 0 ? 0.25 : 0;      // stretch mid-pounce, crouch when charging
      ud.body.position.y = cat.charge > 0 ? -0.08 * cat.charge / 0.8 : cat.hurtT > 0 ? 0.05 : 0;
      ud.body.scale.set(1, 1, 1); ud.body.rotation.y = 0; ud.tail.scale.setScalar(1);
      // Scary Cat's hiss: back arched up high, fur on end, tail straight up and puffed.
      if (cat.hissT > 0) { ud.body.position.y = 0.12 * ud.scale; ud.body.scale.set(1.1, 1.3, 0.9); ud.head.rotation.x = 0.35; ud.tail.scale.setScalar(1.5); }
      // Casper's frenzy: furious side-to-side thrashing.
      if (cat.frenzyT > 0) ud.body.rotation.y = Math.sin(now / 40) * 0.6;
      // Casper's rage glows red under him.
      if (ud.rage) ud.rage.material.opacity = (cat.rage || 0) / 100 * (0.35 + Math.sin(now / 120) * 0.1);
      // Meow Meow napping: lies down, legs tucked, head down; little Zzz float up.
      if (cat.napping) {
        ud.body.position.y = -0.22 * ud.scale; ud.head.rotation.x = 0.5; ud.legs.forEach(l => { l.rotation.x = 1.4; });
        c.zzT = (c.zzT || 0) - dt; if (c.zzT <= 0) { c.zzT = 0.8; this.spawnParticles(cat.x, cat.y + 0.8, cat.z, 0xddeeff, 1, 0.6, 0.08); }
      }
      // Buffed by a purr or a yawn: soft golden shimmer.
      if (cat.buffT > 0 && Math.random() < dt * 6) this.spawnParticles(cat.x + (Math.random() - 0.5) * 0.6, cat.y + 0.3, cat.z + (Math.random() - 0.5) * 0.6, 0xffe080, 1, 1, 0.05);
      // Tail: idle sway, lifts and swishes faster when running, flicks on turns, droops when hurt.
      const run = Math.min(1, speed / cat.def.speed);
      const targetX = (cat.hurtT > 0 ? 0.6 : 0) - run * 0.7 + (cat.onGround ? 0 : -0.4);
      c.tailSwish += dt * (2 + run * 8);
      const turnFlick = Math.max(-1, Math.min(1, (cat.turn || 0) * 12));
      const targetZ = Math.sin(c.tailSwish) * (0.25 + run * 0.25) - turnFlick * 0.6;
      c.tailX += (targetX - c.tailX) * Math.min(1, dt * 8); c.tailZ += (targetZ - c.tailZ) * Math.min(1, dt * 10);
      ud.tail.rotation.x = c.tailX; ud.tail.rotation.z = c.tailZ;
      // Tail whip: the tail cracks forward over her back like a scorpion's.
      c.whipT = Math.max(0, (c.whipT || 0) - dt);
      if (c.whipT > 0) ud.tail.rotation.x = 2.3 * Math.sin(c.whipT / 0.25 * Math.PI);
      if (cat.hissT > 0) { ud.tail.rotation.x = -0.1; ud.tail.rotation.z = 0; }
      // Claw swipe: a front leg slashes.
      if (c.clawT > 0) { c.clawT -= dt; ud.legs[c.side & 1].rotation.x = -1.6 * Math.sin((1 - c.clawT / 0.15) * Math.PI); }
    }
    this.drawMice(dt, k, now);
    this.drawScent(dt, now);
    this.syncSimple(sim.tails, this.tailMeshes, () => {
      const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.6, 4), mat(0xc9a3a0)); t.rotation.z = Math.PI / 2; t.position.y = 0.05; g.add(t);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 12), new THREE.MeshBasicMaterial({ color: 0xe0b030, transparent: true, opacity: 0.6 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); return g;
    }, (g, t) => { g.position.set(t.x, t.y, t.z); g.children[0].rotation.y += dt; g.scale.setScalar(1 + Math.min(t.amount, 10) * 0.08); });
    this.syncSimple(sim.loot, this.lootMeshes, (l) => makeTrinket(TRINKETS[l.key].tier), (g, l) => { g.position.set(l.x, l.y + Math.sin(now / 250 + l.id) * 0.08, l.z); g.rotation.y += dt * 3; });
    this.syncSimple(sim.shots, this.shotMeshes, () => outline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), mat(0x6f6a62))), (g, s) => { g.position.set(s.x, s.y, s.z); g.rotation.x += dt * 8; });
    // Item effects: the laser dot, flea clouds, squeaky toys.
    this.syncSimple(sim.zones, this.zoneMeshes, (z) => {
      if (z.kind === 'laser') { const m = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), new THREE.MeshBasicMaterial({ color: 0xff2020 })); m.rotation.x = -Math.PI / 2; return m; }
      if (z.kind === 'spill') {   // what came out of the pot: water, milk, oil, grain
        const col = { pot: 0x3a6a8a, jug: 0xe8e4d8, basket: 0xc8a050, bucket: 0x3a6a8a }[z.what] || 0x3a6a8a;
        const m = new THREE.Mesh(new THREE.CircleGeometry(z.r, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.userData.spill = true; return m;
      }
      const m = new THREE.Mesh(new THREE.SphereGeometry(z.r, 16, 10), new THREE.MeshBasicMaterial({ color: 0x8a7a3a, transparent: true, opacity: 0.25, depthWrite: false })); m.scale.y = 0.35; return m;
    }, (g, z) => {
      if (z.kind === 'laser') g.position.set(z.x + Math.sin(now / 160) * 0.8, 0.06, z.z + Math.cos(now / 130) * 0.8);   // the dot dances about
      else if (g.userData.spill) { g.position.set(z.x, this.sim.groundAt(cellOf(z.x, z.z), 5, 0.3, true) + 0.03, z.z); g.material.opacity = Math.min(0.55, z.t / 3); }
      else { g.position.set(z.x, 0.3, z.z); g.material.opacity = 0.18 + Math.sin(now / 90) * 0.06; if (Math.random() < 0.3) this.spawnParticles(z.x + (Math.random() - 0.5) * z.r * 1.5, 0.4, z.z + (Math.random() - 0.5) * z.r * 1.5, 0x3a3a1a, 1, 1, 0.03); }
    });
    this.syncSimple(sim.decoys, this.decoyMeshes, () => {
      // Squeaky toy: a bright rubber mouse.
      const g = new THREE.Group();
      g.add(outline(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0xffd020)))); g.children[0].scale.set(1, 0.8, 1.4); g.children[0].position.y = 0.25;
      for (const k of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), mat(0xff6a8a)); ear.position.set(k * 0.15, 0.48, 0.2); g.add(ear); }
      return g;
    }, (g, d) => { g.position.set(d.x, 0, d.z); g.scale.setScalar(0.9 + Math.max(0, Math.sin(now / 120)) * 0.15); });
    // Birds: flapping, tumbling when roared at, carrying mice underneath (crows).
    this.syncSimple(sim.birds, this.birdMeshes, (b) => makeBird(b.type), (g, b) => {
      g.position.set(b.x, b.y, b.z); g.rotation.y = b.yaw;
      const flap = b.stunT > 0 ? 0.2 : Math.sin(now / (b.state === 'act' ? 60 : 110) + b.id) * 0.9;
      g.userData.wings[0].rotation.z = flap; g.userData.wings[1].rotation.z = -flap;
      g.rotation.z = b.stunT > 0 ? now / 80 : 0;
      g.userData.cargo.visible = b.carry > 0;
    });
    this.syncSimple(sim.globs, this.globMeshes, () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0x9adf3a })), (g, b) => { g.position.set(b.x, b.y, b.z); });
    this.syncSimple(sim.missiles, this.missileMeshes, (b) => b.kind === 'pellet' ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(0x8a8a5a))
      : b.kind === 'whisker' ? new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      : b.kind === 'burr' ? new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 1), mat(0x7a5a2a))
      : b.kind === 'pebble' ? new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), mat(0x9a948a))
      : outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(0x6a7a3a))), (g, b) => {
        g.position.set(b.x, b.y, b.z);
        if (b.kind === 'whisker') g.rotation.set(0, Math.atan2(b.vx, b.vz), 0); else g.rotation.y += dt * 10;   // needles fly point-first
      });
    // Traps. f = how far through its reset a trap is (1 = just fired, 0 = armed).
    // Each trap's moving part follows f, and the lamp goes red -> green.
    for (const g of this.trapMeshes.values()) {
      const ud = g.userData; ud.anim = Math.max(0, ud.anim - dt * 4);
      const tr = sim.traps.get(ud.id); if (!tr) continue;
      const f = tr.cdMax > 0 ? Math.min(1, tr.cd / tr.cdMax) : 0;
      if (ud.lamp) {
        const busy = tr.kind === 'gluepad' || tr.kind === 'bait' ? tr.charges <= 0 : tr.kind === 'grinder' ? false : tr.kind === 'tacks' ? false : f > 0;
        ud.lamp.material.color.setHex(busy ? 0xe0402a : 0x5ee06a);
        ud.lamp.scale.setScalar(busy ? 1 : 1 + Math.sin(now / 200) * 0.15);
      }
      if (ud.kind === 'mousetrap') ud.bar.rotation.x = f > 0 ? -0.15 - (2.75 * Math.max(0, (1 - f - 0.15) / 0.85)) : -2.9;   // slams, then cranks back
      if (ud.kind === 'flipper') ud.hinge.rotation.x = -Math.max(ud.anim, f > 0.8 ? 1 : f / 0.8) * 1.2;   // flips up, eases down
      if (ud.kind === 'grinder') { if (tr.active) ud.drum.rotation.x += dt * 25; }
      if (ud.kind === 'zapper') ud.glow.material.color.setHex(ud.anim > 0.5 ? 0xffffff : f > 0 ? new THREE.Color(0x1c2a3a).lerp(new THREE.Color(0x6fb8ff), 1 - f).getHex() : 0x6fb8ff);
      if (ud.kind === 'glove') {
        const out = ud.anim > 0 ? 1 : f > 0 ? Math.max(0, (f - 0.2) / 0.8) : 0;     // punch out, wind back in
        const len = 0.1 + out * 1.6;
        ud.glove.position.z = len; ud.spring.scale.z = Math.max(0.05, len);
      }
      if (ud.kind === 'gluepad') ud.goo.material.opacity = tr.charges > 0 ? 0.25 + 0.55 * tr.charges / TRAPS.gluepad.charges : 0.1;
      if (ud.kind === 'barricade') g.scale.y = 0.55 + 0.45 * (tr.hp / tr.maxHp);
      if (ud.kind === 'bait') ud.cheese.scale.setScalar(Math.max(0.05, tr.charges / TRAPS.bait.nibbles));
    }
    // Warning/shockwave rings on the floor (boss stomps, pounce landings).
    this.rings = this.rings.filter(r => {
      r.userData.life -= dt; const u = r.userData;
      if (u.grow) r.scale.setScalar(Math.max(0.01, 1 - u.life / u.max)); 
      r.material.opacity = u.warn ? 0.35 + 0.35 * Math.sin(now / 60) : Math.max(0, u.life / u.max) * 0.7;
      if (u.life <= 0) { this.scene.remove(r); return false; } return true;
    });
    // Particles, decals, water, route
    this.particles = this.particles.filter(p => {
      const u = p.userData; u.life -= dt; if (!p.isLine) u.vy -= 9 * dt;
      p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
      p.material.opacity = Math.max(0, u.life / 0.7);
      if (u.life <= 0) { this.scene.remove(p); return false; } return true;
    });
    this.decals = this.decals.filter(d => { d.userData.life -= dt; d.material.opacity = Math.min(0.7, d.userData.life / 3); if (d.userData.life <= 0) { this.scene.remove(d); return false; } return true; });
    const t = now / 600;
    for (const wtr of this.waters) {
      const pos = wtr.mesh.geometry.attributes.position, base = wtr.base;
      for (let v = 0; v < pos.count; v++) { const x = base[v * 3], y = base[v * 3 + 1]; pos.array[v * 3 + 2] = Math.sin(x * 0.6 + t) * 0.06 + Math.cos(y * 0.9 + t * 1.3) * 0.05; }
      pos.needsUpdate = true; wtr.mesh.geometry.computeVertexNormals();
    }
    this.drawMapFeatures(dt, now);
    this.exitRing.material.opacity = 0.5 + Math.sin(now / 250) * 0.3;
    this.flames.forEach((f, k) => { const n = Math.sin(now / 90 + k * 1.7) * 0.5 + Math.sin(now / 37 + k) * 0.5; f.scale.set(1 + n * 0.12, 1 + n * 0.25, 1 + n * 0.12); });
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
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const a = this.shake * 0.35; this.camera.position.x += (Math.random() - 0.5) * a; this.camera.position.y += (Math.random() - 0.5) * a; }
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
    const { body, bodyO, head, ear, tail, eyes, stars } = this.mi;
    let ns = 0;
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
      if (mo.stunT > 0 && ns < MAX_MICE * 3 - 3) {
        const sleepy = mo.asleep;
        const left = Math.min(1, mo.stunT / (mo.stunMax || 1)), rad = (0.25 + 0.35 * left) * Math.max(1, s * 1.4);
        for (let k = 0; k < 3; k++) {
          const a = now / 180 + k * 2.094;
          L.compose(v.set(p.x + Math.cos(a) * rad, p.y + s * 1.05 + 0.25, p.z + Math.sin(a) * rad), q.identity(), sc.set(0.6 + left, 0.6 + left, 0.6 + left));
          stars.setColorAt(ns, col.setHex(sleepy ? 0xa8d0ff : 0xffe040)); stars.setMatrixAt(ns++, L);
        }
      }
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
    stars.count = ns; stars.instanceMatrix.needsUpdate = true; if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
    for (const id of this.mouseLerp.keys()) if (!seen.has(id)) this.mouseLerp.delete(id);
    for (const [id, bar] of this.bossBars) if (!seen.has(id)) { this.scene.remove(bar); this.bossBars.delete(id); }
  }
}
