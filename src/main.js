// main.js — wires input -> commands -> sim (fixed tick) -> renderer + HUD.

import { DT, TRAPS, TRAP_ORDER, MICE, CATS, CAT_ORDER, ITEMS, ITEM_ORDER, LOADOUT_SIZE, RULES, COMBOS, DIFFICULTY, DIFFICULTY_ORDER } from './config.js';
import { CAT_INFO, abilityRows, elTag } from './ui/catinfo.js';
import { portraitURL } from './ui/portraits.js';
import { Sfx } from './audio/sfx.js';
import { Sim } from './sim/sim.js';
import { MAPS, MAP_ORDER } from './sim/map.js';
import { W, CELL, GATE } from './sim/map.js';
import { LocalTransport } from './net/local.js';
import { hostRoom, joinRoom, roomCode, snapshot, applySnapshot, applyEvent, SKIP_EVENTS } from './net/coop.js';
import { Scene } from './render/scene.js';
import { Hud } from './ui/hud.js';
import * as THREE from 'three';
import { makeCat } from './render/models.js';
import { loadProfile, saveProfile, sandboxProfile, unlockedTraps, unlockedItems, upgradesFor, runReward, applyReward } from './meta/profile.js';
import { openShop } from './ui/shop.js';
import { trapIcons } from './ui/icons.js';


// Saved progress between runs: paw prints, yarn, unlocks, upgrades, hats (meta/profile.js).
// ?sandbox in the URL: everything unlocked with plenty to spend, nothing saved.
const SANDBOX = new URLSearchParams(location.search).has('sandbox');
// Reload with one-shot flags (go = start straight away, shop = open the shop), keeping ?sandbox.
const relaunch = (flag) => { location.href = location.pathname + '?' + [SANDBOX ? 'sandbox' : '', flag].filter(Boolean).join('&'); };
const dropFlags = () => history.replaceState(null, '', location.pathname + (SANDBOX ? '?sandbox' : ''));
window.__relaunch = relaunch;   // the end screen's buttons use it
const profile = SANDBOX ? sandboxProfile() : loadProfile();
let coop = null;   // co-op session (see the co-op section below); null = playing alone
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
  'Mice climb over fences, crates and buckets when it beats going round. Box both sides, or trap the top.',
  'Co-op: up to four cats. The host picks the map; when you win, the host takes everyone onward.',
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
  if (coop && coop.role === 'guest' && coop.link) coop.link.send(hello());   // tell the host which cat you picked
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
// Difficulty: Relaxed / Normal / Brutal (remembered).
let chosenDiff = DIFFICULTY[load('catcastle.diff', 'normal')] ? load('catcastle.diff', 'normal') : 'normal';
function drawDiff() {
  document.getElementById('diff').innerHTML = DIFFICULTY_ORDER.map(k => `<button class="df ${k === chosenDiff ? 'picked' : ''}" data-diff="${k}" title="${DIFFICULTY[k].desc}">${DIFFICULTY[k].name}</button>`).join('') + `<small>${DIFFICULTY[chosenDiff].desc}</small>`;
  document.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { chosenDiff = b.dataset.diff; save('catcastle.diff', chosenDiff); sfx.play('click'); drawDiff(); });
}
drawDiff();
if (new URLSearchParams(location.search).has('go')) setTimeout(() => { previewOn = false; dropFlags(); start('normal'); }, 0);
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  if (loadout.length < 1) { sfx.play('deny'); return; }
  if (coop && coop.role === 'guest') { sfx.play('deny'); coopStatus('The host starts the game.'); return; }
  previewOn = false;
  if (coop && coop.role === 'host' && coop.guests.length) hostStart(b.dataset.mode, chosenMap);
  else { if (coop && coop.room) coop.room.close(); coop = null; start(b.dataset.mode); }   // hosting but nobody joined yet: just play
}));

// ---------- co-op (up to four cats online) ----------
// Host: makes a room code. Guests: type it in. The host picks the map and presses Play.
// Players: p1 = host, p2..p4 = guests in the order they joined.
const coopStatus = (t) => { document.getElementById('coopstatus').textContent = t; };
const hello = () => ({ t: 'hello', cat: chosenCat, loadout, item: chosenItem, upgrades: upgradesFor(profile), hat: profile.worn[chosenCat] || null });
const lobbyLine = () => coop.guests.length ? `Room ${coop.code}: ${[CATS[chosenCat].name + ' (you)', ...coop.guests.map(g => CATS[g.hello.cat].name)].join(', ')}. Pick a map and press Play.` : `Room ${coop.code}: waiting for friends…`;
document.getElementById('hostbtn').onclick = async () => {
  if (coop) return; sfx.unlock(); sfx.play('click');
  const code = roomCode(); coop = { role: 'host', code, guests: [] };
  try {
    coop.room = await hostRoom(code, coopStatus, ({ link, hello: h }) => {
      const g = { link, hello: h, id: 'p' + (coop.guests.length + 2) }; coop.guests.push(g);
      coopStatus(lobbyLine()); sfx.play('intro');
      link.on('data', (d) => { if (d && d.t === 'hello') { g.hello = d; if (!coop.started) coopStatus(lobbyLine()); } });
      link.on('close', () => { g.gone = true; if (!coop.started) { coop.guests = coop.guests.filter(x => x !== g); coopStatus(lobbyLine()); } });
    });
  } catch { coop = null; }
};
// Host: tell every guest what we're playing (same map, same seed, who is who), then start.
function hostStart(mode, map) {
  const seed = (Date.now() & 0xffff) | 1;
  const live = coop.guests.filter(g => !g.gone);
  const players = [{ id: 'p1', cat: chosenCat, hat: profile.worn[chosenCat] || null, item: chosenItem }, ...live.map(g => ({ id: g.id, cat: g.hello.cat, hat: g.hello.hat, item: g.hello.item }))];
  for (const g of live) g.link.send({ t: 'start', map, mode, seed, you: g.id, players, difficulty: chosenDiff });
  start(mode, { ...coop, role: 'host', seed, map, players, guests: live, difficulty: chosenDiff });
}
document.getElementById('joinbtn').onclick = async () => {
  const code = document.getElementById('joincode').value.trim().toUpperCase();
  if (coop || code.length !== 4) { sfx.play('deny'); return; }
  sfx.unlock(); sfx.play('click'); coop = { role: 'guest', code }; coopStatus(`Joining ${code}…`);
  try {
    const link = await joinRoom(code, hello(), coopStatus);
    coop.link = link;
    // 'start' also arrives mid-game when the host moves everyone on to the next map.
    link.on('data', (d) => { if (d && d.t === 'start') { previewOn = false; start(d.mode, { ...coop, role: 'guest', seed: d.seed, map: d.map, you: d.you, players: d.players, difficulty: d.difficulty }); } });
    link.on('close', () => { if (!coop.started) { coop = null; coopStatus('The host closed the room.'); } });
  } catch { coop = null; }
};

// co = null (solo) or a co-op session: { role: 'host'|'guest', seed, map, players: [{ id, cat, hat, item }],
// guests (host: [{ link, hello, id }]), link + you (guest: the link to the host and your player id) }.
// Calling start() again (next map in co-op) tears the running game down first.
let game = null;
function start(mode, co = null) {
  if (game) game.stop();
  document.getElementById('menu').classList.remove('show'); document.getElementById('end').classList.remove('show');
  sfx.unlock(); sfx.setMusic('build');
  if (co) { co.started = true; chosenMap = co.map; coop = co; }
  const guest = co && co.role === 'guest', LOCAL_ID = guest ? co.you : 'p1';
  const difficulty = co ? co.difficulty || 'normal' : chosenDiff;   // co-op: the host's choice
  const sim = new Sim({ mode, seed: co ? co.seed : (Date.now() & 0xffff) | 1, map: chosenMap, difficulty });
  const mine = { loadout, item: chosenItem, upgrades: upgradesFor(profile), hat: profile.worn[chosenCat] || null };
  if (!co) sim.addPlayer('p1', chosenCat, mine);
  else for (const p of co.players) {
    if (p.id === LOCAL_ID) sim.addPlayer(p.id, chosenCat, mine);
    else if (!guest) { const g = co.guests.find(x => x.id === p.id), h = g.hello; sim.addPlayer(p.id, h.cat, { loadout: h.loadout, item: h.item, upgrades: h.upgrades, hat: h.hat }); }
    else sim.addPlayer(p.id, p.cat, { hat: p.hat, item: p.item });
  }
  // Everything this game hooks up, so the next game can unhook it: DOM listeners and link handlers.
  const ac = new AbortController(), sig = { signal: ac.signal }, offs = [];
  let running = true;
  // Solo/host: commands go straight into the sim. Guest: they go to the host (with a sequence
  // number, so the host can say which input it has got to: see prediction below).
  let seq = 0;
  const net = guest ? { send: (cmd) => co.link.send({ t: 'cmd', cmd: { ...cmd, seq: cmd.type === 'input' ? seq : undefined } }) } : new LocalTransport(sim);
  let outbox = [], snapT = 0, inbox = [];
  if (co && !guest) {
    // Each guest's commands come in on its own link, as its own player (whatever it claims).
    for (const g of co.guests) {
      offs.push(g.link.on('data', (d) => { if (d && d.t === 'cmd' && d.cmd) sim.command({ ...d.cmd, id: g.id }); }));
      offs.push(g.link.on('close', () => { if (!g.gone) { g.gone = true; hud.message(`${sim.cats.get(g.id).name} left. Carry on!`); } }));
    }
  }
  if (guest) {
    offs.push(co.link.on('data', (d) => { if (d && d.t === 'snap') inbox.push(d); else if (d && d.t === 'pause') hud.message(d.p ? 'The host paused the game' : 'Back to it!'); }));
    offs.push(co.link.on('close', () => { if (!ended) { hud.message('The host left the game.'); setTimeout(() => relaunch(''), 3000); } }));
  }
  const sendAll = (o) => { if (co && !guest) for (const g of co.guests) if (!g.gone) g.link.send(o); };
  // Guest prediction: your own cat moves locally at once; the host's word corrects it gently.
  // The host says which of our inputs it had reached (inSeq); compare where it has us with where
  // we had ourselves after that same input, and shift by half the difference (snap if way off:
  // a respawn, a boss stomp fling...). Old predictions shift too, so a correction isn't re-applied.
  const hist = new Array(128);
  const reconcile = () => {
    const me = sim.cats.get(LOCAL_ID); if (!me || !me.srv) return;
    const h = hist[me.inSeq & 127], srv = me.srv;
    const base = h && h.s === me.inSeq ? h : me;
    const ex = srv.x - base.x, ey = srv.y - base.y, ez = srv.z - base.z, far = Math.hypot(ex, ez) > 3 || Math.abs(ey) > 3 || !me.alive;
    const k = far ? 1 : 0.5;
    if (far) Object.assign(me, srv); else { me.x += ex * k; me.y += ey * k; me.z += ez * k; }
    for (const q of hist) if (q) { q.x += ex * k; q.y += ey * k; q.z += ez * k; }
  };
  const canvas = document.getElementById('game');
  const scene = new Scene(canvas, sim);
  const hud = new Hud(sim, loadout);
  game = { stop() {
    running = false; ac.abort(); offs.forEach(f => f()); scene.dispose(); document.exitPointerLock?.();
    const c = document.getElementById('game'); c.replaceWith(c.cloneNode(false));   // a clean canvas for the next game
  } };

  // ---------- input ----------
  const keys = new Set();
  let yaw = Math.PI, pitch = 0.3;
  let attackHeld = false, jumpQ = false, jumpHeld = false, secondaryQ = false, altQ = false;
  let selected = null, rot = 0, aim = null;
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); }, sig);
  // Pause: losing the mouse (Esc) pauses the game and shows volume + controls.
  let paused = false, hadLock = false;
  const pauseEl = document.getElementById('pause');
  const setPaused = (p) => {
    paused = p; pauseEl.classList.toggle('show', p);
    sendAll({ t: 'pause', p });   // the host pausing pauses everyone
  };
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) { hadLock = true; setPaused(false); }
    else if (hadLock && !ended) setPaused(true);
  }, sig);
  document.getElementById('resume').onclick = () => { setPaused(false); canvas.requestPointerLock(); };
  // Element combos cheat sheet on the pause screen.
  document.getElementById('combos').innerHTML = '<b>Element combos</b><br>' + Object.values(COMBOS).map(t => `<b>${t.split(':')[0]}</b>:${t.split(':').slice(1).join(':')}`).join('<br>');
  document.getElementById('quit').onclick = () => relaunch('');
  // Look settings (saved): mouse sensitivity, invert up/down, field of view.
  const look = { sens: 1, invert: false, fov: 65, ...load('catcastle.look', {}) };
  const applyLook = () => { scene.camera.fov = look.fov; scene.camera.updateProjectionMatrix(); save('catcastle.look', look); };
  const sensEl = document.getElementById('look-sens'), fovEl = document.getElementById('look-fov'), invEl = document.getElementById('look-invert');
  sensEl.value = look.sens; fovEl.value = look.fov; invEl.checked = look.invert;
  sensEl.oninput = () => { look.sens = +sensEl.value; applyLook(); };
  fovEl.oninput = () => { look.fov = +fovEl.value; applyLook(); };
  invEl.onchange = () => { look.invert = invEl.checked; applyLook(); };
  applyLook();
  for (const k of ['master', 'music', 'sfx']) {
    const el = document.getElementById('vol-' + k); el.value = sfx.prefs[k];
    el.oninput = () => { sfx.set(k, +el.value); sfx.play('click'); };
  }
  const muteBtn = document.getElementById('mute'), mutedEl = document.getElementById('muted');
  const showMute = () => { muteBtn.textContent = sfx.prefs.muted ? 'Unmute' : 'Mute'; mutedEl.style.display = sfx.prefs.muted ? 'block' : 'none'; };
  muteBtn.onclick = () => { sfx.toggleMute(); showMute(); }; showMute();
  canvas.addEventListener('contextmenu', e => e.preventDefault(), sig);
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0025 * look.sens;
    // Wide pitch range so you can look up at table undersides for ceiling traps.
    pitch = Math.max(-1.25, Math.min(1.2, pitch + e.movementY * 0.0025 * look.sens * (look.invert ? -1 : 1)));
  }, sig);
  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) attackHeld = true;                     // left: Fred spits, Puddin bites (hold)
    if (e.button === 2) {                                       // right: place the held trap, else hairball / pounce
      if (selected) placeSelected(); else secondaryQ = true;
    }
  }, sig);
  document.addEventListener('mouseup', e => { if (e.button === 0) attackHeld = false; }, sig);
  canvas.addEventListener('wheel', e => { e.preventDefault(); scene.zoom(e.deltaY * 0.004); }, { passive: false, signal: ac.signal });   // camera distance
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
  }, sig);
  document.addEventListener('keyup', e => {
    if (e.key.toLowerCase() === 'f') { scene.sniff = false; document.body.classList.remove('sniffing'); } const k = e.key.toLowerCase(); keys.delete(k); if (k === ' ') jumpHeld = false; }, sig);

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
    const cmd = { type: 'input', id: LOCAL_ID, mx, mz, yaw: face, pitch, jump: jumpQ, jumpHeld, primary: attackHeld && !selected, secondary: secondaryQ, alt: altQ, aim: a };
    net.send(cmd);
    if (guest && me) {
      // Prediction: run this input on our own cat here and now (its sounds and effects come
      // from the host, so anything it emits locally is dropped), and remember where it put us.
      sim.command(cmd); const ev = sim.events.length; sim.stepCat(me); sim.events.length = ev;
      hist[seq & 127] = { s: seq, x: me.x, y: me.y, z: me.z };
    }
    seq++;
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
    if (!running) return;                     // this game was torn down (next map in co-op)
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    aim = scene.aim();
    if (paused) acc = 0;
    // Guest: apply whatever the host has sent (positions + events), newest last.
    if (guest) {
      for (const d of inbox) { applySnapshot(sim, d.s, LOCAL_ID); for (const e of d.ev) { applyEvent(sim, e); sim.events.push(e); } }
      if (inbox.length) reconcile();
      inbox.length = 0;
    }
    while (acc >= DT || (guest && sim.events.length)) {
      if (acc >= DT) { sendInput(); if (!guest) sim.step(); acc -= DT; }
      if (co && !guest) {
        for (const e of sim.events) if (!SKIP_EVENTS.has(e.t)) outbox.push(e);
        if (++snapT % 2 === 0) { sendAll({ t: 'snap', s: snapshot(sim), ev: outbox }); outbox = []; }   // 15 snapshots a second, to every guest
      }
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
          const reward = runReward(profile, { won: e.won, waves: cleared, rating: e.rating, yarn: sim.yarn, map: chosenMap, difficulty });
          applyReward(profile, reward, { won: e.won, map: chosenMap }); saveProfile(profile);
          document.exitPointerLock?.();
          hud.showEnd(e.won, e.rating, sim, profile, reward, chosenCat);
          // Won a map: offer the next stretch of the journey.
          const nextMap = MAP_ORDER[MAP_ORDER.indexOf(chosenMap) + 1];
          const endEl = document.getElementById('end');
          if (e.won && nextMap && !guest) {   // co-op: the host takes everyone on together
            const b = document.createElement('button'); b.className = 'play'; b.textContent = `Onward: ${MAPS[nextMap].name}`;
            b.onclick = () => { save('catcastle.map', nextMap); if (co) { coop = co; hostStart(mode, nextMap); } else relaunch('go'); };
            endEl.prepend(b);
          }
          if (co && !e.won && !guest) {        // co-op: try the same map again, together
            const b = document.createElement('button'); b.className = 'play'; b.textContent = 'Try again together';
            b.onclick = () => hostStart(mode, chosenMap); endEl.prepend(b);
          }
          if (guest) { const p = document.createElement('p'); p.className = 'dim'; p.textContent = 'The host can take everyone on to the next map, or try again.'; endEl.prepend(p); }
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
