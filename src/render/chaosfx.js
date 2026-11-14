// chaosfx.js — (v0.34) the look of chaos mode, on top of the scene's own particles and shake.
// - Mice killed by a trap or a cat sometimes go flying: a little cartoon body tumbles through
//   the air, bounces once and goes up in a puff of fur.
// - Every kill pops gold specks (Paw Points); flung mice kick up dust.
// - Rumbles shake the camera and shower dust down from the ceiling around you.
// - Big hits (explosions, shelves and stalls coming down, smashed pots) flash the screen.
// Drawn only: nothing here changes the sim.
import * as THREE from 'three';
import { MICE } from '../config.js';

const MAX_FLYERS = 36;
const BIG_FLASH = { boom: [0xffe0a0, 0.35], bang: [0xffd080, 0.35], firecracker: [0xffd080, 0.3], shelfFall: [0xfff4e0, 0.25], stallFall: [0xfff4e0, 0.3], pound: [0xffffff, 0.22],
  gateBreak: [0xffffff, 0.4], chandelier: [0xffe8b0, 0.25], smash: [0xffffff, 0.12], combo: [0xfff0a0, 0.15], stomp: [0xffffff, 0.2], rumble: [0xd8b890, 0.14], zap: [0xbfe4ff, 0.08] };

export class ChaosFx {
  constructor(scene) {
    this.s = scene; this.flyers = []; this.shakeAcc = 0;
    // Bigger particle pool for the swarms (the scene builds its own lazily; make it 1600 here).
    if (!scene.pool || scene.pool.N < 1600) { if (scene.pmesh) scene.scene.remove(scene.pmesh); scene.pool = null; scene.pmesh = null; scene.buildParticles = bigParticles(scene); scene.buildParticles(); }
    this.geo = { body: new THREE.SphereGeometry(1, 10, 8), ear: new THREE.CircleGeometry(1, 10), tail: new THREE.CylinderGeometry(0.03, 0.015, 1, 5) };
    this.pink = new THREE.MeshLambertMaterial({ color: 0xf0a0a8, side: THREE.DoubleSide });
    this.eye = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.mats = new Map();
    const el = this.flashEl = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;mix-blend-mode:screen;transition:none';
    document.body.appendChild(el); this.flash = 0;
  }
  dispose() { for (const f of this.flyers) this.s.scene.remove(f.g); this.flyers = []; this.flashEl.remove(); }
  matFor(type) {
    if (!this.mats.has(type)) this.mats.set(type, new THREE.MeshLambertMaterial({ color: (MICE[type] && MICE[type].color) || 0x8a8580 }));
    return this.mats.get(type);
  }
  // A little tumbling mouse: body, head, ears, eyes, tail.
  makeMouse(type) {
    const g = new THREE.Group(), m = this.matFor(type), sz = Math.max(0.5, Math.min(1.4, ((MICE[type] && MICE[type].size) || 0.45) / 0.45));
    const body = new THREE.Mesh(this.geo.body, m); body.scale.set(0.16, 0.13, 0.24); g.add(body);
    const head = new THREE.Mesh(this.geo.body, m); head.scale.set(0.1, 0.09, 0.11); head.position.set(0, 0.04, 0.25); g.add(head);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(this.geo.ear, this.pink); ear.scale.setScalar(0.06); ear.position.set(sx * 0.07, 0.13, 0.22); g.add(ear);
      const eye = new THREE.Mesh(this.geo.body, this.eye); eye.scale.setScalar(0.018); eye.position.set(sx * 0.045, 0.07, 0.34); g.add(eye);
    }
    const tail = new THREE.Mesh(this.geo.tail, this.pink); tail.scale.set(1, 0.4, 1); tail.rotation.x = Math.PI / 2.4; tail.position.set(0, 0.02, -0.38); g.add(tail);
    g.scale.setScalar(sz * 1.6);
    return g;
  }
  fly(x, y, z, type, power = 1) {
    if (this.flyers.length >= MAX_FLYERS) { const old = this.flyers.shift(); this.s.scene.remove(old.g); }
    const g = this.makeMouse(type), a = Math.random() * Math.PI * 2, h = (2.5 + Math.random() * 3) * power;
    g.position.set(x, y + 0.2, z); this.s.scene.add(g);
    this.flyers.push({ g, vx: Math.cos(a) * h, vy: (5 + Math.random() * 4) * power, vz: Math.sin(a) * h, sx: (Math.random() - 0.5) * 18, sy: (Math.random() - 0.5) * 12, t: 0, bounced: false });
  }
  addShake(n, cap = 0.45) { this.s.shake = Math.min(cap, Math.max(this.s.shake, 0) + n); }
  flashAt(col, a) { this.flashEl.style.background = '#' + col.toString(16).padStart(6, '0'); this.flash = Math.max(this.flash, a); }

  onEvent(e) {
    const s = this.s, fx = BIG_FLASH[e.t];
    if (fx) this.flashAt(fx[0], fx[1]);
    switch (e.t) {
      case 'kill':
        if (e.drowned || e.eaten) break;
        s.spawnParticles(e.x, (e.y || 0) + 0.3, e.z, 0xd8d0c8, 6, 4, 0.06);   // fur tufts
        if (Math.random() < (e.splat ? 0.3 : 0.55)) this.fly(e.x, e.y || 0, e.z, e.type, e.splat ? 1.3 : 1);
        this.addShake(0.03, 0.25);
        break;
      case 'points': s.spawnParticles(e.x, 0.7, e.z, 0xffd040, 3, 2.5, 0.07); break;
      case 'fling': s.spawnParticles(e.x, 0.2, e.z, 0xc8b8a0, 14, 4, 0.1); s.ring(e.x, e.z, 1.6, 0xffe0a0, 0.35, false, true); this.addShake(0.08); break;
      case 'scurry': s.spawnParticles(e.x, 0.3, e.z, 0xb8a888, 18, 4, 0.1); this.addShake(0.06); break;
      case 'rumble': {
        this.addShake(0.5, 0.6);
        const c = s.localCat && s.localCat.mesh.position;
        if (c) for (let k = 0; k < 60; k++) { const a = Math.random() * 7, r = 1 + Math.random() * 9; s.spawnParticles(c.x + Math.cos(a) * r, 3 + Math.random() * 3, c.z + Math.sin(a) * r, Math.random() < 0.7 ? 0xb8a888 : 0x8a7a66, 1, 0.6, 0.06 + Math.random() * 0.05); }
        break;
      }
      case 'knock': s.spawnParticles(e.x, 1, e.z, 0xd8c8b0, 6, 2, 0.06); break;
      case 'smash': this.addShake(0.08); s.spawnParticles(e.x, (e.y || 0) + 0.3, e.z, 0xe8d8c0, 10, 5, 0.06); break;
      case 'propBack': s.spawnParticles(e.x, 1, e.z, 0xffffff, 6, 1.5, 0.05); break;
      case 'steal': s.spawnParticles(e.x, 0.3, e.z, 0xffd060, 5, 2, 0.06); break;
      case 'boom': case 'bang': case 'pound': case 'stallFall': case 'shelfFall': this.addShake(0.2, 0.7); break;
    }
  }
  step(dt) {
    const s = this.s;
    for (let k = this.flyers.length - 1; k >= 0; k--) {
      const f = this.flyers[k], g = f.g; f.t += dt;
      f.vy -= 18 * dt; g.position.x += f.vx * dt; g.position.y += f.vy * dt; g.position.z += f.vz * dt;
      g.rotation.x += f.sx * dt; g.rotation.y += f.sy * dt;
      if (g.position.y < 0.12 && f.vy < 0) {
        if (!f.bounced) { f.bounced = true; f.vy = -f.vy * 0.4; f.vx *= 0.5; f.vz *= 0.5; s.spawnParticles(g.position.x, 0.1, g.position.z, 0xc8b8a0, 5, 2, 0.06); }
        else { g.position.y = 0.12; f.vx *= 0.8; f.vz *= 0.8; f.sx *= 0.8; f.sy *= 0.8; }
      }
      if (f.t > 1.6) { s.spawnParticles(g.position.x, g.position.y + 0.1, g.position.z, 0xf0f0f0, 10, 2.5, 0.08); s.scene.remove(g); this.flyers.splice(k, 1); }
    }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 2.2); }
    this.flashEl.style.opacity = this.flash.toFixed(3);
  }
}

// The scene's particle pool, with room for 1600 specks.
function bigParticles(scene) {
  return function () {
    const N = 1600;
    scene.pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    scene.pmesh.count = 0; scene.pmesh.frustumCulled = false; scene.pmesh.setColorAt(0, new THREE.Color()); scene.scene.add(scene.pmesh);
    scene.pool = { N, n: 0, head: 0, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
      life: new Float32Array(N), size: new Float32Array(N) };
  };
}
