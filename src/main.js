// main.js — wires input -> commands -> sim (fixed tick) -> renderer + HUD.

import { DT, TRAPS, TRAP_ORDER, MICE, CATS, CAT_ORDER, ITEMS, ITEM_ORDER, LOADOUT_SIZE, RULES, COMBOS } from './config.js';
import { CAT_INFO, abilityRows, elTag } from './ui/catinfo.js';
import { portraitURL } from './ui/portraits.js';
import { Sfx } from './audio/sfx.js';
import { Sim } from './sim/sim.js';
import { MAPS, MAP_ORDER } from './sim/map.js';
import { W, CELL, GATE } from './sim/map.js';
import { LocalTransport } from './net/local.js';
import { Scene } from './render/scene.js';
import { Hud } from './ui/hud.js';
import * as THREE from 'three';
import { makeCat } from './render/models.js';
import { loadProfile, saveProfile, sandboxProfile, unlockedTraps, unlockedItems, upgradesFor, runReward, applyReward } from './meta/profile.js';
import { openShop } from './ui/shop.js';
import { trapIcons } from './ui/icons.js';

const LOCAL_ID = 'p1';

// Saved progress between runs: paw prints, yarn, unlocks, upgrades, hats (meta/profile.js).
// ?sandbox in the URL: everything unlocked with plenty to spend, nothing saved.
const SANDBOX = new URLSearchParams(location.search).has('sandbox');
// Reload with one-shot flags (go = start straight away, shop = open the shop), keeping ?sandbox.
const relaunch = (flag) => { location.href = location.pathname + '?' + [SANDBOX ? 'sandbox' : '', flag].filter(Boolean).join('&'); };
const dropFlags = () => history.replaceState(null, '', location.pathname + (SANDBOX ? '?sandbox' : ''));
window.__relaunch = relaunch;   // the end screen's buttons use it
const profile = SANDBOX ? sandboxProfile() : loadProfile();
// Sound: needs a click before the browser allows it, so unlock on the first one.
const sfx = new Sfx();
document.addEventListener('pointerdown', () => sfx.unlock(), { once: false });
document.addEventListener('keydown', () => sfx.unlock());
// Loading-screen tips.
const TIPS = [
  'Mice always get a way through. Poison Boxes decide WHICH way: build a maze and they walk all of it.',
  'Put a Flinger beside the moat and point it at the water. Free drowning.',
  'When Puddin kills a mouse with a Chomp he eats it and gets health back.',
  'Eat a Mama Mouse and her Pinkies never come out.',
  'A red ring on the floor means a boss is about to stomp. Move.',
  'Stunned mice see stars. The circle of stars shrinks as the stun wears off.',
  'Trap lamps: green = ready, red = resetting.',
  'Bug Zappers hang under anything with a roof: passages, tables, benches, stall counters, the cellar vault.',
  'Packs of mice split between routes that cost about the same. Make one dearer and they take another.',
  'Every kill pays Paw Points on the spot. Kill plenty, build more.',
  'Bring 8 traps and 1 item. Pick them under the cats on this screen.',
  'Q uses your item. E is your second ability. Hold F to sniff out where the mice are going.',
  'Fred can kick off walls twice before he has to land.',
  'Brush past a pot on a table edge and it falls. Time it right and it lands on a pack of mice.',
  'Market food piles make mice tougher. Kill them before they get there, or bait them away.',
  "In the servants' passages the doors swing shut on a timer. Watch the radar: brown = shut.",
  'Kitchen fires burn mice and cats alike. Fling mice into them.',
  'Win a map to move onward: entrance, market, stables, cellar, passages, kitchen.',
];
{ let k = Math.floor(Math.random() * TIPS.length); const show = () => { const el = document.getElementById('tip'); if (el) el.textContent = 'Tip: ' + TIPS[k++ % TIPS.length]; }; show(); setInterval(show, 6000); }
const showWallet = () => { document.getElementById('profile').textContent = `${profile.paws} paw prints · ${profile.yarn} yarn${SANDBOX ? ' · sandbox (nothing saved)' : ''}`; };
showWallet();
// Cat select: a grid of portraits, and a detail panel with the chosen cat turning in 3D.
let chosenCat = CAT_ORDER.includes(localStorage.getItem('catcastle.cat')) ? localStorage.getItem('catcastle.cat') : 'fred';
const catsEl = document.getElementById('cats');
catsEl.innerHTML = CAT_ORDER.map(k => `<button class="catpick" data-cat="${k}"><img src="${portraitURL(k)}" alt=""><b>${CATS[k].name}</b><small>${CAT_INFO[k].role}</small></button>`).join('');
let previewOn = true, previewCat = null;
const pv = (() => {
  const cv = document.getElementById('catview');
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffe8d0, 0x3a2a1c, 2)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(2, 3, 2); sc.add(dl);
  const cam = new THREE.PerspectiveCamera(35, cv.width / cv.height, 0.1, 50);
  const tick = (t) => {
    if (!previewOn) { r.dispose(); return; }
    if (previewCat) { previewCat.rotation.y = t / 1600; previewCat.userData.tail.rotation.z = Math.sin(t / 400) * 0.3; }
    r.render(sc, cam); requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { show(kind) {
    if (previewCat) sc.remove(previewCat);
    previewCat = makeCat(kind, profile.worn[kind]); sc.add(previewCat);
    if (previewCat.userData.reach) previewCat.userData.reach.visible = false;   // no attack markers on the menu
    if (previewCat.userData.rage) previewCat.userData.rage.visible = false;
    const big = kind === 'puddin';
    cam.position.set(0, big ? 1.4 : 1.1, big ? 4.6 : 3.6); cam.lookAt(0, big ? 0.7 : 0.55, 0);
  } };
})();
function pickCat(k) {
  chosenCat = k; try { localStorage.setItem('catcastle.cat', k); } catch { /* private window */ }
  document.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('picked', x.dataset.cat === k));
  const d = CATS[k], info = CAT_INFO[k];
  document.getElementById('catdetail').innerHTML = `<h2>${d.name}</h2><p>${info.blurb}</p>` +
    abilityRows(k).map(([key, name, note, el]) => `<div class="ab-row"><i>${key}</i> <b>${name}</b> ${elTag(el)} — ${note}</div>`).join('') +
    `<div class="stats">Health ${d.maxHp} · Energy ${d.maxEnergy} (+${d.energyRegen}/s) · Speed ${d.speed}</div>`;
  pv.show(k);
}
document.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { sfx.unlock(); sfx.play('click'); pickCat(b.dataset.cat); }));
pickCat(chosenCat);
// Loadout: pick 8 traps to bring, and 1 item. Remembered between visits.
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
// Only traps and items you've unlocked (shop) can be brought.
let loadout = load('catcastle.loadout', TRAP_ORDER.slice(0, LOADOUT_SIZE)).filter(k => TRAPS[k] && unlockedTraps(profile).includes(k));
let chosenItem = unlockedItems(profile).includes(load('catcastle.item', 'laser')) ? load('catcastle.item', 'laser') : 'laser';
function drawLoadout() {
  const traps = unlockedTraps(profile), items = unlockedItems(profile), icons = trapIcons(traps);
  loadout = loadout.filter(k => traps.includes(k));
  const more = TRAP_ORDER.length - traps.length, moreI = ITEM_ORDER.length - items.length;
  document.getElementById('loadout').innerHTML = `<div class="lh">Traps <b>${loadout.length}/${LOADOUT_SIZE}</b></div>` +
    traps.map(k => `<button class="lt ${loadout.includes(k) ? 'on' : ''}" data-trap="${k}" title="${TRAPS[k].desc}">${icons[k] ? `<img src="${icons[k]}" alt="">` : ''}${TRAPS[k].name}</button>`).join('') +
    (more ? `<span class="dim"> +${more} more in the shop</span>` : '') +
    `<div><div class="lh">Item (Q)</div>` + items.map(k => `<button class="lt ${chosenItem === k ? 'on' : ''}" data-item="${k}" title="${ITEMS[k].desc}">${ITEMS[k].name}</button>`).join('') +
    (moreI ? `<span class="dim"> +${moreI} more in the shop</span>` : '') + `</div><p class="dim" id="loadhint">${ITEMS[chosenItem].desc}</p>`;
  document.querySelectorAll('[data-trap]').forEach(b => b.onclick = () => {
    const k = b.dataset.trap;
    if (loadout.includes(k)) loadout = loadout.filter(x => x !== k);
    else if (loadout.length < LOADOUT_SIZE) loadout = TRAP_ORDER.filter(x => loadout.includes(x) || x === k);
    else { sfx.play('deny'); return; }
    save('catcastle.loadout', loadout); sfx.play('click'); drawLoadout();
  });
  document.querySelectorAll('[data-item]').forEach(b => b.onclick = () => { chosenItem = b.dataset.item; save('catcastle.item', chosenItem); sfx.play('click'); drawLoadout(); });
}
drawLoadout();
// Shop (between runs). Also opens straight away from the end screen's Shop button (?shop=1).
const shop = () => openShop(profile, { sfx, cat: () => chosenCat, onChange: () => { showWallet(); drawLoadout(); pickCat(chosenCat); } });
document.getElementById('shopbtn').onclick = () => { sfx.unlock(); sfx.play('click'); shop(); };
if (new URLSearchParams(location.search).has('shop')) { dropFlags(); shop(); }
// Map select: the six stretches of the journey, entrance to kitchen.
let chosenMap = MAPS[load('catcastle.map', 'entrance')] ? load('catcastle.map', 'entrance') : 'entrance';
function drawMaps() {
  document.getElementById('maps').innerHTML = MAP_ORDER.map((k, i) => `<button class="mp ${k === chosenMap ? 'on' : ''}" data-map="${k}"><b>${i + 1}. ${MAPS[k].name}</b><small>${MAPS[k].twist}</small></button>`).join('');
  document.querySelectorAll('[data-map]').forEach(b => b.onclick = () => { chosenMap = b.dataset.map; save('catcastle.map', chosenMap); sfx.play('click'); drawMaps(); });
  // The play button names the map you'll be playing.
  const pb = document.querySelector('[data-mode="normal"]'); if (pb) pb.textContent = `${MAPS[chosenMap].name} · ${RULES.winWave} waves`;
}
drawMaps();
if (new URLSearchParams(location.search).has('go')) setTimeout(() => { previewOn = false; dropFlags(); start('normal'); }, 0);
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  if (loadout.length < 1) { sfx.play('deny'); return; }
  previewOn = false; start(b.dataset.mode);
}));

function start(mode) {
  document.getElementById('menu').classList.remove('show');
  sfx.unlock(); sfx.setMusic('build');
  const sim = new Sim({ mode, seed: (Date.now() & 0xffff) | 1, map: chosenMap });
  sim.addPlayer(LOCAL_ID, chosenCat, { loadout, item: chosenItem, upgrades: upgradesFor(profile), hat: profile.worn[chosenCat] || null });
  const net = new LocalTransport(sim);
  const canvas = document.getElementById('game');
  const scene = new Scene(canvas, sim);
  const hud = new Hud(sim, loadout);

  // ---------- input ----------
  const keys = new Set();
  let yaw = Math.PI, pitch = 0.3;
  let attackHeld = false, jumpQ = false, jumpHeld = false, secondaryQ = false, altQ = false;
  let selected = null, rot = 0, aim = null;
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
  // Pause: losing the mouse (Esc) pauses the game and shows volume + controls.
  let paused = false, hadLock = false;
  const pauseEl = document.getElementById('pause');
  const setPaused = (p) => { paused = p; pauseEl.classList.toggle('show', p); };
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) { hadLock = true; setPaused(false); }
    else if (hadLock && !ended) setPaused(true);
  });
  document.getElementById('resume').onclick = () => { setPaused(false); canvas.requestPointerLock(); };
  // Element combos cheat sheet on the pause screen.
  document.getElementById('combos').innerHTML = '<b>Element combos</b><br>' + Object.values(COMBOS).map(t => `<b>${t.split(':')[0]}</b>:${t.split(':').slice(1).join(':')}`).join('<br>');
  document.getElementById('quit').onclick = () => relaunch('');
  for (const k of ['master', 'music', 'sfx']) {
    const el = document.getElementById('vol-' + k); el.value = sfx.prefs[k];
    el.oninput = () => { sfx.set(k, +el.value); sfx.play('click'); };
  }
  const muteBtn = document.getElementById('mute'), mutedEl = document.getElementById('muted');
  const showMute = () => { muteBtn.textContent = sfx.prefs.muted ? 'Unmute' : 'Mute'; mutedEl.style.display = sfx.prefs.muted ? 'block' : 'none'; };
  muteBtn.onclick = () => { sfx.toggleMute(); showMute(); }; showMute();
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0025;
    // Wide pitch range so you can look up at table undersides for ceiling traps.
    pitch = Math.max(-1.25, Math.min(1.2, pitch + e.movementY * 0.0025));
  });
  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) attackHeld = true;                     // left: Fred spits, Puddin bites (hold)
    if (e.button === 2) {                                       // right: place the held trap, else hairball / pounce
      if (selected) placeSelected(); else secondaryQ = true;
    }
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) attackHeld = false; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); scene.zoom(e.deltaY * 0.004); }, { passive: false });   // camera distance
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === ' ') e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === ' ') { jumpQ = true; jumpHeld = true; }
    if (k === 'e' || e.key === 'Shift') altQ = true;   // E: second ability
    if (k === 'f') { scene.sniff = true; document.body.classList.add('sniffing'); }   // hold F: sense of smell
    const n = parseInt(k, 10);
    if (n >= 1 && n <= loadout.length) { const t = loadout[n - 1]; selected = selected === t ? null : t; sfx.play('click'); }   // press again to put it away
    if (k === 'm') { sfx.toggleMute(); showMute(); }
    if (k === 'q') net.send({ type: 'item', id: LOCAL_ID, aim: aim && aim.point ? { x: aim.point.x, y: aim.point.y, z: aim.point.z } : null });   // Q: use your item
    if (k === 'r') rot = (rot + 1) % 4;
    if (k === 'x' && aim && aim.cell >= 0 && aim.surface !== 'none') net.send({ type: 'sellTrap', id: LOCAL_ID, cell: aim.cell, layer: aim.surface });
    if (k === 'g') net.send({ type: 'startWave', id: LOCAL_ID });
    if (k === 'h') document.getElementById('controls').classList.toggle('hidden');
  });
  document.addEventListener('keyup', e => {
    if (e.key.toLowerCase() === 'f') { scene.sniff = false; document.body.classList.remove('sniffing'); } const k = e.key.toLowerCase(); keys.delete(k); if (k === ' ') jumpHeld = false; });

  // Turn the crosshair hit into a trap anchor + footprint.
  function placement() {
    if (!selected || !aim) return null;
    const def = TRAPS[selected];
    // Floor traps can also go on furniture tops (tables, counters, crates...): aim at the top.
    const top = aim.surface === 'top' && def.surface === 'floor';
    if (aim.surface !== def.surface && !top) return { ok: false, cells: aim.cell >= 0 && aim.surface !== 'none' ? sim.footprint(selected, aim.cell % W, (aim.cell / W) | 0, rot, aim.wallDir) : null, ax: 0, az: 0, wallDir: aim.wallDir };
    let [w, d] = def.size; if (def.surface !== 'wall' && rot % 2) [w, d] = [d, w];
    // Traps snap to half-tiles (2 cells). If that spot clips a wall, try nudging one cell
    // so a trap still fits snug against walls that aren't on the half-tile grid.
    const half = (v) => 2 * Math.round(v / 2);
    let ax, az;
    if (def.surface === 'wall') {
      const alongZ = aim.wallDir === 0 || aim.wallDir === 1;
      ax = alongZ ? aim.cell % W : half(aim.point.x / CELL - w / 2);
      az = alongZ ? half(aim.point.z / CELL - w / 2) : (aim.cell / W) | 0;
    } else {
      ax = half(aim.point.x / CELL - w / 2); az = half(aim.point.z / CELL - d / 2);
    }
    let res = sim.canPlace(selected, ax, az, rot, aim.wallDir, top);
    if (res !== true) {
      const along = def.surface === 'wall' ? ((aim.wallDir === 0 || aim.wallDir === 1) ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]])
        : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (const [ox, oz] of along) { if (sim.canPlace(selected, ax + ox, az + oz, rot, aim.wallDir, top) === true) { ax += ox; az += oz; res = true; break; } }
    }
    const cells = sim.footprint(selected, ax, az, rot, aim.wallDir);
    return { ok: res === true && sim.sardines >= def.cost, cells, ax, az, wallDir: aim.wallDir, top, y: top ? sim.topHeight(cells[0] >= 0 ? cells[0] : aim.cell) : 0 };
  }
  function placeSelected() {
    const p = placement(); if (!p || !p.cells) return;
    if (!p.ok) sfx.play('deny');
    net.send({ type: 'place', id: LOCAL_ID, trap: selected, ax: p.ax, az: p.az, rot, wallDir: p.wallDir, top: p.top });
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
    net.send({ type: 'input', id: LOCAL_ID, mx, mz, yaw: face, pitch, jump: jumpQ, jumpHeld, primary: attackHeld && !selected, secondary: secondaryQ, alt: altQ, aim: a });
    jumpQ = secondaryQ = altQ = false;
  }

  // ---------- loop ----------
  // Where each sim event makes its sound (and how loud).
  const at = (e) => {
    if (e.x !== undefined) return [e.x, e.z];
    if (e.id !== undefined && sim.cats.has(e.id)) { const c = sim.cats.get(e.id); return [c.x, c.z]; }
    if (e.id !== undefined && sim.traps.has(e.id)) { const t = sim.traps.get(e.id); return [(t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2]; }
    return [undefined, undefined];
  };
  const GATE_POS = GATE ? [(GATE.x0 + GATE.x1) / 2, (GATE.z0 + GATE.z1) / 2] : [0, 0];   // only the entrance has a gate
  function sound(e) {
    const [x, z] = at(e);
    switch (e.t) {
      case 'kill': if (!e.drowned) sfx.play('squeak', x, z, { big: MICE[e.type].size >= 0.9 }); break;
      case 'spit': sfx.play('pellet', x, z); break;
      case 'pelletHit': if (e.mouse) sfx.play('hit', x, z); break;
      case 'trapAdd': sfx.play('place', (e.trap.x0 + e.trap.x1) / 2, (e.trap.z0 + e.trap.z1) / 2); break;
      case 'sold': sfx.play('sell', x, z); break;
      case 'gateHit': sfx.play('gateHit', ...GATE_POS); break;
      case 'gateBreak': sfx.play('gateBreak', ...GATE_POS, { vol: 1.4 }); break;
      case 'leak': sfx.play('leak'); break;
      case 'catHurt': if (e.id === LOCAL_ID) sfx.play('catHurt'); else sfx.play('catHurt', x, z); break;
      case 'catDeath': sfx.play('catDeath', x, z); break;
      case 'pickup': sfx.play('pickup'); break;
      case 'item': sfx.play('item_' + e.item, e.x, e.z); break;
      case 'trinket': sfx.play('trinket'); break;
      case 'waveStart': sfx.play('waveStart', undefined, undefined, { boss: e.boss }); if (e.wave === 1) document.getElementById('controls').classList.add('hidden'); break;   // tuck the controls away once play starts (H brings them back)
      case 'waveClear': sfx.play('waveClear'); break;
      case 'msg': if (e.text.startsWith('NEW:')) sfx.play('intro'); break;
      case 'end': sfx.play(e.won ? 'win' : 'lose'); sfx.setMusic('menu'); break;
      case 'slam': case 'strike': sfx.play('pounceLand', x, z); break;
      case 'leapback': sfx.play('leap', x, z); break;
      case 'bossRoar': sfx.play('bossRoar', undefined, undefined, { vol: 0.9 }); break;
      case 'crateHit': sfx.play('barricadeHit', x, z); break;
      case 'combo': sfx.play('combo_' + e.kind, x, z); break;
      default: sfx.play(e.t, x, z, e);   // names that match a sound directly (snap, flip, zap, splat, ...)
    }
  }

  let last = performance.now(), acc = 0, ended = false, grindT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    aim = scene.aim();
    if (paused) acc = 0;
    while (acc >= DT) {
      sendInput(); sim.step(); acc -= DT;
      for (const e of sim.events) {
        scene.onEvent(e);
        sound(e);
        if (e.t === 'msg') hud.message(e.text);
        if (e.t === 'bark') hud.bark(e.who, e.text, e.kind);
        if (e.t === 'catHurt' && e.id === LOCAL_ID) hud.flashHurt();
        if (e.t === 'end' && !ended) {
          ended = true;
          // Pay out: paw prints for waves cleared, the rating and a first-win bonus; yarn from bosses.
          const cleared = e.won ? sim.wave : Math.max(0, sim.wave - 1);
          const reward = runReward(profile, { won: e.won, waves: cleared, rating: e.rating, yarn: sim.yarn, map: chosenMap });
          applyReward(profile, reward, { won: e.won, map: chosenMap }); saveProfile(profile);
          document.exitPointerLock?.();
          hud.showEnd(e.won, e.rating, sim, profile, reward, chosenCat);
          // Won a map: offer the next stretch of the journey.
          const nextMap = MAP_ORDER[MAP_ORDER.indexOf(chosenMap) + 1];
          const endEl = document.getElementById('end');
          if (e.won && nextMap) {
            const b = document.createElement('button'); b.className = 'play'; b.textContent = `Onward: ${MAPS[nextMap].name}`;
            b.onclick = () => { save('catcastle.map', nextMap); relaunch('go'); };
            endEl.prepend(b);
          }
        }
      }
      sim.events.length = 0;
    }
    // Sound bookkeeping: listener on your cat, grinders whirring, music by phase.
    const me2 = sim.cats.get(LOCAL_ID);
    if (me2) sfx.listener(me2.x, me2.z, yaw);
    grindT -= dt;
    if (grindT <= 0) { grindT = 0.3; for (const t of sim.traps.values()) if (t.kind === 'grinder' && t.active) sfx.play('grind', (t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2); }
    if (!ended) sfx.setMusic(sim.phase === 'wave' ? (sim.mice.some(m => MICE[m.type].boss) ? 'boss' : 'wave') : 'build');
    const p = placement();
    scene.setGhost(selected, p ? p.cells : null, p ? p.ok : false, rot, p ? p.wallDir : -1, p ? p.y : 0);
    hud.update(dt, sim.hud(LOCAL_ID), selected, p ? p.ok : true);
    scene.render(dt, yaw, pitch, LOCAL_ID);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__sim = sim; window.__scene = scene;   // handy for debugging in the browser console
  window.__setYaw = (y, p) => { yaw = y; if (p !== undefined) pitch = p; };   // used by the screenshot tests
}
