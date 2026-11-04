// main.js — wires input -> commands -> sim (fixed tick) -> renderer + HUD.

import { DT, TRAPS, TRAP_ORDER } from './config.js';
import { Sim } from './sim/sim.js';
import { W, CELL } from './sim/map.js';
import { LocalTransport } from './net/local.js';
import { Scene } from './render/scene.js';
import { Hud } from './ui/hud.js';

const LOCAL_ID = 'p1';

// Saved progress between runs (paw prints + yarn). Why localStorage: no server
// needed yet; wrapped in try/catch because private windows can block it.
function loadProfile() { try { return JSON.parse(localStorage.getItem('catcastle.profile')) || { paws: 0, yarn: 0 }; } catch { return { paws: 0, yarn: 0 }; } }
function saveProfile(p) { try { localStorage.setItem('catcastle.profile', JSON.stringify(p)); } catch { /* ignore */ } }

const profile = loadProfile();
document.getElementById('profile').textContent = `${profile.paws} paw prints · ${profile.yarn} yarn`;
let chosenCat = 'fred';
document.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
  chosenCat = b.dataset.cat;
  document.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('picked', x === b));
}));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => start(b.dataset.mode)));

function start(mode) {
  document.getElementById('menu').classList.remove('show');
  const sim = new Sim({ mode, seed: (Date.now() & 0xffff) | 1 });
  sim.addPlayer(LOCAL_ID, chosenCat);
  const net = new LocalTransport(sim);
  const canvas = document.getElementById('game');
  const scene = new Scene(canvas, sim);
  const hud = new Hud(sim);

  // ---------- input ----------
  const keys = new Set();
  let yaw = Math.PI, pitch = 0.3;
  let clawHeld = false, jumpQ = false, fireQ = false, pounceQ = false;
  let selected = null, rot = 0, aim = null;
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0025;
    // Wide pitch range so you can look up at table undersides for ceiling traps.
    pitch = Math.max(-1.25, Math.min(1.2, pitch + e.movementY * 0.0025));
  });
  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) clawHeld = true;                       // left: always claw/bite
    if (e.button === 2) {                                       // right: place trap, else hairball
      if (selected) placeSelected(); else fireQ = true;
    }
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) clawHeld = false; });
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === ' ') e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === ' ') jumpQ = true;
    if (k === 'shift') pounceQ = true;
    const n = parseInt(k, 10);
    if (n >= 1 && n <= TRAP_ORDER.length) { const t = TRAP_ORDER[n - 1]; selected = selected === t ? null : t; }
    if (k === 'q') selected = null;
    if (k === 'r') rot = (rot + 1) % 4;
    if (k === 'e') net.send({ type: 'sellCheese', id: LOCAL_ID });
    if (k === 'x' && aim && aim.cell >= 0) net.send({ type: 'sellTrap', id: LOCAL_ID, cell: aim.cell, layer: aim.surface === 'top' ? 'floor' : aim.surface });
    if (k === 'g') net.send({ type: 'startWave', id: LOCAL_ID });
    if (k === 'h') document.getElementById('controls').classList.toggle('hidden');
  });
  document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  // Turn the crosshair hit into a trap anchor + footprint.
  function placement() {
    if (!selected || !aim) return null;
    const def = TRAPS[selected];
    if (aim.surface !== def.surface) return { ok: false, cells: aim.cell >= 0 ? sim.footprint(selected, aim.cell % W, (aim.cell / W) | 0, rot, aim.wallDir) : null, ax: 0, az: 0, wallDir: aim.wallDir };
    let [w, d] = def.size; if (def.surface !== 'wall' && rot % 2) [w, d] = [d, w];
    let ax, az;
    if (def.surface === 'wall') {
      const alongZ = aim.wallDir === 0 || aim.wallDir === 1;
      ax = alongZ ? aim.cell % W : Math.round(aim.point.x / CELL - w / 2);
      az = alongZ ? Math.round(aim.point.z / CELL - w / 2) : (aim.cell / W) | 0;
    } else {
      ax = Math.round(aim.point.x / CELL - w / 2); az = Math.round(aim.point.z / CELL - d / 2);
    }
    const res = sim.canPlace(selected, ax, az, rot, aim.wallDir);
    return { ok: res === true && sim.sardines >= def.cost, cells: sim.footprint(selected, ax, az, rot, aim.wallDir), ax, az, wallDir: aim.wallDir };
  }
  function placeSelected() {
    const p = placement(); if (!p || !p.cells) return;
    net.send({ type: 'place', id: LOCAL_ID, trap: selected, ax: p.ax, az: p.az, rot, wallDir: p.wallDir });
  }

  function sendInput() {
    const f = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    // forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw)
    let mx = Math.sin(yaw) * f - Math.cos(yaw) * r, mz = Math.cos(yaw) * f + Math.sin(yaw) * r;
    const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    const a = aim ? { x: aim.point.x, y: aim.point.y, z: aim.point.z } : null;
    // The cat faces whatever the crosshair is on, so claws, bites and pounces
    // go where you're pointing (the camera sits off to the side of the cat).
    let face = yaw;
    const me = sim.cats.get(LOCAL_ID);
    if (a && me && Math.hypot(a.x - me.x, a.z - me.z) > 0.8) face = Math.atan2(a.x - me.x, a.z - me.z);
    net.send({ type: 'input', id: LOCAL_ID, mx, mz, yaw: face, pitch, jump: jumpQ, claw: clawHeld, fire: fireQ, pounce: pounceQ, aim: a });
    jumpQ = fireQ = pounceQ = false;
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, ended = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    aim = scene.aim();
    while (acc >= DT) {
      sendInput(); sim.step(); acc -= DT;
      for (const e of sim.events) {
        scene.onEvent(e);
        if (e.t === 'msg') hud.message(e.text);
        if (e.t === 'bark') hud.bark(e.who, e.text);
        if (e.t === 'catHurt' && e.id === LOCAL_ID) hud.flashHurt();
        if (e.t === 'end' && !ended) {
          ended = true;
          if (e.won && e.rating) profile.paws += e.rating.total;
          profile.yarn += sim.yarn; saveProfile(profile);
          document.exitPointerLock?.();
          hud.showEnd(e.won, e.rating, sim, profile);
        }
      }
      sim.events.length = 0;
    }
    const p = placement();
    scene.setGhost(selected, p ? p.cells : null, p ? p.ok : false, rot, p ? p.wallDir : -1);
    hud.update(dt, sim.hud(LOCAL_ID), selected, p ? p.ok : true);
    scene.render(dt, yaw, pitch, LOCAL_ID);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__sim = sim; window.__scene = scene;   // handy for debugging in the browser console
}
