// main.js — wires input -> commands -> sim (fixed tick) -> renderer + HUD.

import { DT, TRAPS, TRAP_ORDER } from './config.js';
import { Sim } from './sim/sim.js';
import { DIRS4 } from './sim/map.js';
import { LocalTransport } from './net/local.js';
import { Scene } from './render/scene.js';
import { Hud } from './ui/hud.js';

const LOCAL_ID = 'p1';

// Saved progress between runs (paw prints + yarn). Why localStorage: no
// server needed yet; wrapped in try/catch because private windows can block it.
function loadProfile() { try { return JSON.parse(localStorage.getItem('catcastle.profile')) || { paws: 0, yarn: 0 }; } catch { return { paws: 0, yarn: 0 }; } }
function saveProfile(p) { try { localStorage.setItem('catcastle.profile', JSON.stringify(p)); } catch { /* ignore */ } }

const menu = document.getElementById('menu');
const profile = loadProfile();
document.getElementById('profile').textContent = `${profile.paws} paw prints · ${profile.yarn} yarn`;
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => start(b.dataset.mode)));

function start(mode) {
  menu.classList.remove('show');
  const sim = new Sim({ mode, seed: (Date.now() & 0xffff) | 1 });
  sim.addPlayer(LOCAL_ID, 'Fred');
  const net = new LocalTransport(sim);
  const canvas = document.getElementById('game');
  const scene = new Scene(canvas, sim);
  const hud = new Hud();

  // ---------- input ----------
  const keys = new Set();
  let yaw = Math.PI, pitch = 0.35, mouseDown = false, jumpQueued = false;
  let selected = null, flipRot = 0;
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-0.2, Math.min(1.1, pitch + e.movementY * 0.0025));
  });
  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas || e.button !== 0) return;
    if (selected) {
      const tile = scene.aimTile();
      if (tile >= 0) net.send({ type: 'place', id: LOCAL_ID, trap: selected, tile, dir: flipperDir() });
    } else mouseDown = true;
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === ' ') { jumpQueued = true; e.preventDefault(); }
    const slot = TRAP_ORDER.find(t => TRAPS[t].key === k);
    if (slot) selected = selected === slot ? null : slot;
    if (k === 'q') selected = null;
    if (k === 'r') flipRot = (flipRot + 1) % 4;
    if (k === 'e') net.send({ type: 'sellCheese', id: LOCAL_ID });
    if (k === 'x') { const t = scene.aimTile(); if (t >= 0) net.send({ type: 'sellTrap', id: LOCAL_ID, tile: t }); }
    if (k === 'g') net.send({ type: 'startWave', id: LOCAL_ID });
  });
  document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  // Flipper launch direction: the cardinal direction you're facing, plus R turns.
  function flipperDir() {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const order = [0, 2, 1, 3];   // +x, +z, -x, -z (clockwise seen from above)
    let base = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : (fz > 0 ? 2 : 3);
    return order[(order.indexOf(base) + flipRot) % 4];
  }

  function sendInput() {
    const f = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    // forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw)
    let mx = Math.sin(yaw) * f - Math.cos(yaw) * r, mz = Math.cos(yaw) * f + Math.sin(yaw) * r;
    const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    net.send({ type: 'input', id: LOCAL_ID, mx, mz, yaw, jump: jumpQueued, claw: mouseDown && !selected });
    jumpQueued = false;
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, ended = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    while (acc >= DT) {
      sendInput(); sim.step(); acc -= DT;
      for (const e of sim.events) {
        scene.onEvent(e);
        if (e.t === 'msg') hud.message(e.text);
        if (e.t === 'bark') hud.bark(e.text);
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
    const tile = selected ? scene.aimTile() : -1;
    const valid = selected && tile >= 0 && sim.canPlace(selected, tile) && sim.coins >= TRAPS[selected].cost;
    scene.setGhost(selected, tile, valid, flipperDir());
    hud.update(dt, sim.hud(LOCAL_ID), selected, valid);
    scene.render(dt, yaw, pitch, LOCAL_ID);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__sim = sim; window.__scene = scene;   // handy for debugging in the browser console
}
export { DIRS4 };
