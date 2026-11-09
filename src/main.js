// main.js — wires input -> commands -> sim (fixed tick) -> renderer + HUD.

import { DT, TRAPS, MICE, CATS, ITEMS, RULES, COMBOS, VERSION, GAME_TITLE } from './config.js';
import { Sfx } from './audio/sfx.js';
import { Sim } from './sim/sim.js';
import { MAPS, MAP_ORDER } from './sim/map.js';
import { W, CELL, GATE } from './sim/map.js';
import { LocalTransport } from './net/local.js';
import { hostRoom, joinRoom, roomCode, snapshot, applySnapshot, applyEvent, SKIP_EVENTS } from './net/coop.js';
import { Scene } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { loadProfile, saveProfile, sandboxProfile, wipeProfile, upgradesFor, runReward, applyReward, noteWave } from './meta/profile.js';
import { initMenus } from './ui/menus.js';
import { makeFlyover } from './render/flyover.js';
import { Coach } from './ui/coach.js';
import { loadKit } from './render/kit.js';
// The castle's 3D models load in the background from the menu (a game waits for them if needed).
const kitLoad = loadKit();


// Saved progress between runs: paw prints, yarn, the furthest wave on each map (which decides
// what's unlocked), upgrades, hats (meta/profile.js).
// ?sandbox in the URL: everything unlocked with plenty to spend, nothing saved.
const SANDBOX = new URLSearchParams(location.search).has('sandbox');
const FLAGS = new URLSearchParams(location.search);
// Reload with one-shot flags (go = start straight away, kit = open Your traps), keeping ?sandbox.
const relaunch = (flag) => { location.href = location.pathname + '?' + [SANDBOX ? 'sandbox' : '', flag].filter(Boolean).join('&'); };
const dropFlags = () => history.replaceState(null, '', location.pathname + (SANDBOX ? '?sandbox' : ''));
window.__relaunch = relaunch;
let profile = SANDBOX ? sandboxProfile() : loadProfile();
const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
document.title = GAME_TITLE; $('logo').textContent = GAME_TITLE; $('version').textContent = `v${VERSION}`;   // (a working title until Brent picks the name)
if (SANDBOX) document.body.classList.add('sandbox');
let coop = null;   // co-op session (see the co-op section below); null = playing alone
// Sound: needs a click before the browser allows it, so unlock on the first one.
const sfx = new Sfx();
document.addEventListener('pointerdown', () => sfx.unlock(), { once: false });
document.addEventListener('keydown', () => sfx.unlock());

// ---------- menus (v0.32, src/ui/menus.js) ----------
const menus = initMenus({
  get profile() { return profile; }, sfx,
  isCoop: () => !!coop, isGuest: () => !!(coop && coop.role === 'guest'),
  solo: () => leaveCoop(),
  wipe: () => { profile = wipeProfile(); menus.state.slots = []; menus.state.map = 'entrance'; menus.state.item = 'laser'; },
  onKitChange: () => { if (coop && coop.role === 'guest' && coop.link) coop.link.send(hello()); },   // tell the host what you're bringing
  onPlay: () => {
    if (coop && coop.role === 'guest') return;
    if (coop && coop.role === 'host' && coop.guests.length) hostStart('normal', menus.state.map);
    else { leaveCoop(); start('normal'); }   // hosting but nobody joined: just play
  },
});

// (v0.32.1) The title shows Kanye's key art (assets/ui/title.jpg) instead of the live castle.

// First screen: the intro film (once per visit; it plays muted, Skip or any key skips it),
// then the title. ?go starts a game straight away (Try again, Onward), ?kit opens Your traps.
function intro() {
  const v = $('introvid');
  let left = false;
  const leave = () => { if (left) return; left = true; v.pause(); try { sessionStorage.setItem('catcastle.intro', '1'); } catch { /* private window */ } menus.go('title'); removeEventListener('keydown', leave); };
  if ((() => { try { return sessionStorage.getItem('catcastle.intro'); } catch { return null; } })()) { menus.go('title'); return; }
  menus.go('intro');
  v.onended = leave; v.onerror = leave; $('introskip').onclick = leave; addEventListener('keydown', leave);
  v.src = 'assets/intro/intro.mp4';
  v.play().catch(leave);
  setTimeout(() => { if (v.readyState < 2) leave(); }, 4000);   // not there, or too slow: straight to the title
}
if (FLAGS.has('go')) { dropFlags(); setTimeout(() => start('normal'), 0); }   // (after the rest of this file has run)
else if (FLAGS.has('kit')) { dropFlags(); menus.go('kit'); }
else intro();

// ---------- co-op (up to four cats online) ----------
// Host: makes a room code. Guests: type it in. The host picks the map and presses Play.
// Players: p1 = host, p2..p4 = guests in the order they joined.
const coopStatus = (t) => { $('coopstatus').innerHTML = t; };
const hello = () => ({ t: 'hello', cat: menus.state.cat, loadout: menus.loadout(), item: menus.state.item, upgrades: upgradesFor(profile), hat: profile.worn[menus.state.cat] || null });
// The room pill under the wallet: who's in.
const roomPill = () => {
  const el = $('w-room');
  if (!coop || !coop.code) { el.classList.remove('on'); return; }
  const names = coop.role === 'host' ? [CATS[menus.state.cat].name + ' (you)', ...coop.guests.map(g => CATS[g.hello.cat].name)] : [`you (${CATS[menus.state.cat].name})`];
  el.textContent = `Room ${coop.code}: ${names.join(', ')}`; el.classList.add('on');
};
const lobbyLine = () => coop.guests.length ? `Room <span class="roomcode">${coop.code}</span> ${coop.guests.length} friend${coop.guests.length > 1 ? 's' : ''} in. Choose your cat, then press Play.` : `Room <span class="roomcode">${coop.code}</span> Give your friends this code.`;
function leaveCoop() { if (coop && coop.room) coop.room.close(); if (coop && coop.link && coop.link.close) coop.link.close(); coop = null; coopStatus(''); $('mp-next').disabled = true; roomPill(); }
$('hostbtn').onclick = async () => {
  if (coop) return; sfx.unlock(); sfx.play('click');
  const code = roomCode(); coop = { role: 'host', code, guests: [] };
  try {
    coop.room = await hostRoom(code, coopStatus, ({ link, hello: h }) => {
      const g = { link, hello: h, id: 'p' + (coop.guests.length + 2) }; coop.guests.push(g);
      coopStatus(lobbyLine()); roomPill(); sfx.play('intro');
      link.on('data', (d) => { if (d && d.t === 'hello') { g.hello = d; if (!coop.started) { coopStatus(lobbyLine()); roomPill(); } } });
      link.on('close', () => { g.gone = true; if (!coop.started) { coop.guests = coop.guests.filter(x => x !== g); coopStatus(lobbyLine()); roomPill(); } });
    });
    coopStatus(lobbyLine()); roomPill(); $('mp-next').disabled = false;
  } catch { coop = null; }
};
// Host: tell every guest what we're playing (same map, same seed, who is who), then start.
function hostStart(mode, map) {
  const seed = (Date.now() & 0xffff) | 1;
  const live = coop.guests.filter(g => !g.gone);
  const players = [{ id: 'p1', cat: menus.state.cat, hat: profile.worn[menus.state.cat] || null, item: menus.state.item }, ...live.map(g => ({ id: g.id, cat: g.hello.cat, hat: g.hello.hat, item: g.hello.item }))];
  for (const g of live) g.link.send({ t: 'start', map, mode, seed, you: g.id, players, difficulty: menus.state.diff });
  start(mode, { ...coop, role: 'host', seed, map, players, guests: live, difficulty: menus.state.diff });
}
$('joinbtn').onclick = async () => {
  const code = $('joincode').value.trim().toUpperCase();
  if (coop || code.length !== 4) { sfx.play('deny'); return; }
  sfx.unlock(); sfx.play('click'); coop = { role: 'guest', code }; coopStatus(`Joining ${code}…`);
  try {
    const link = await joinRoom(code, hello(), coopStatus);
    coop.link = link; coopStatus(`You're in room <span class="roomcode">${code}</span> Choose your cat and traps; the host starts the game.`); $('mp-next').disabled = false; roomPill();
    // 'start' also arrives mid-game when the host moves everyone on to the next map.
    link.on('data', (d) => { if (d && d.t === 'start') start(d.mode, { ...coop, role: 'guest', seed: d.seed, map: d.map, you: d.you, players: d.players, difficulty: d.difficulty }); });
    link.on('close', () => { if (coop && !coop.started) { coop = null; coopStatus('The host closed the room.'); $('mp-next').disabled = true; roomPill(); menus.refreshKit(); } });
  } catch { coop = null; }
};

// co = null (solo) or a co-op session: { role: 'host'|'guest', seed, map, players: [{ id, cat, hat, item }],
// guests (host: [{ link, hello, id }]), link + you (guest: the link to the host and your player id) }.
// Calling start() again (next map in co-op) tears the running game down first.
let game = null;
async function start(mode, co = null) {
  await kitLoad;
  if (game) game.stop();
  menus.preview.dispose(); menus.go(null);   // menus away (and the wallet with them)
  document.body.classList.add('ingame');                       // the HUD shows only in a game
  sfx.unlock(); sfx.setMusic('build');
  if (co) { co.started = true; coop = co; }
  menus.fixKit();
  const chosenMap = co ? co.map : menus.state.map, chosenCat = menus.state.cat, loadout = menus.loadout(), chosenItem = menus.state.item;
  sfx.setAmbience(chosenMap);   // distant life of this map (voices, horses, pots, drips...)
  const guest = co && co.role === 'guest', LOCAL_ID = guest ? co.you : 'p1';
  const difficulty = co ? co.difficulty || 'normal' : menus.state.diff;   // co-op: the host's choice
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
    offs.push(co.link.on('data', (d) => {
      if (d && d.t === 'snap') inbox.push(d);
      else if (d && d.t === 'pause') hud.message(d.p ? 'The host paused the game' : 'Back to it!');
      else if (d && d.t === 'endless') { sim.mode = 'endless'; ended = false; endEl.classList.remove('show'); hud.message('Endless: hold them as long as you can'); }   // the host kept going after the win
    }));
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
  scene.onStep = (x, z) => sfx.play('footstep', x, z, { vol: 0.6 });   // humans walking past
  game = { stop() {
    running = false; ac.abort(); offs.forEach(f => f()); scene.dispose(); sfx.setAmbience(null); document.exitPointerLock?.();
    const c = document.getElementById('game'); c.replaceWith(c.cloneNode(false));   // a clean canvas for the next game
  } };

  // ---------- input ----------
  const keys = new Set();
  let yaw = Math.PI, pitch = 0.3;
  let attackHeld = false, jumpQ = false, jumpHeld = false, secondaryQ = false, altQ = false;
  let selected = null, rot = 0, aim = null;
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); }, sig);
  // First-run tips: cleared by doing what they ask; the pause screen can skip or replay them.
  const coach = new Coach(document.getElementById('coach')), tipsBtn = document.getElementById('tipsbtn');
  const coachSeen = { moved: 0, placed: 0, sniffed: false, at: null };
  tipsBtn.onclick = () => { if (coach.active) coach.skip(); else { coach.replay(); Object.assign(coachSeen, { moved: 0, placed: 0, sniffed: false }); } tipsBtn.textContent = coach.active ? 'Skip tips' : 'Replay tips'; };
  // Pause: losing the mouse (Esc) pauses the game and shows volume + controls.
  let paused = false, hadLock = false;
  const pauseEl = document.getElementById('pause');
  const setPaused = (p) => {
    paused = p; pauseEl.classList.toggle('show', p);
    tipsBtn.textContent = coach.active ? 'Skip tips' : 'Replay tips';
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
  // Wider field of view by default (v0.26: 75): the low camera needs it to take in how tall things are.
  const look = { sens: 1, invert: false, fov: 75, ...load('catcastle.look', {}) };
  if (!look.v2) { look.fov = 75; look.v2 = true; }
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
    // The trap grid (like Orcs Must Die): traps snap to whole 4x4-cell tiles, the tile(s)
    // under the crosshair. Wall traps snap along the wall.
    const tile = (v, span) => 4 * Math.round((v - span / 2) / 4);
    let ax, az;
    if (def.surface === 'wall') {
      const alongZ = aim.wallDir === 0 || aim.wallDir === 1;
      ax = alongZ ? aim.cell % W : tile(aim.point.x / CELL, w);
      az = alongZ ? tile(aim.point.z / CELL, w) : (aim.cell / W) | 0;
    } else {
      ax = tile(aim.point.x / CELL, w); az = tile(aim.point.z / CELL, d);
    }
    const res = sim.canPlace(selected, ax, az, rot, aim.wallDir, top);
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
      case 'beam': if (e.targets.length) sfx.play('beam', x, z); break;   // only when it catches a mouse, not when it lets go
      case 'cuckoo': if (e.hits) sfx.play('cuckoo', x, z); break;   // the clock strikes silently when nobody's there
      // Stalls share the shelf sounds, plus a sharp crack when the legs go.
      case 'stallHit': sfx.play('shelfHit', x, z); break;
      case 'stallFalling': sfx.play('legCrack', x, z); break;
      case 'stallFall': sfx.play('shelfFall', x, z); break;
      case 'stallBreak': sfx.play('shelfBreak', x, z); break;
      case 'stallUp': sfx.play('shelfUp', x, z); break;
      case 'combo': sfx.play('combo_' + e.kind, x, z); break;
      default: sfx.play(e.t, x, z, e);   // names that match a sound directly (snap, flip, zap, splat, ...)
    }
  }

  let last = performance.now(), acc = 0, ended = false, grindT = 0;
  // ---------- end of a run ----------
  // Pay out (paw prints for waves cleared, the rating and a first-win bonus; yarn from bosses),
  // list what got unlocked, and offer what's next. A win offers Keep going: the same run carries
  // on as endless (v0.32: endless isn't on the menu any more), and its end pays only the extra.
  const runUnlocks = { traps: [], items: [], maps: [] };
  let paidWaves = 0, paidYarn = 0;
  const endEl = document.getElementById('end');
  function endOfRun(e) {
    ended = true;
    const cleared = e.won ? sim.wave : Math.max(0, sim.wave - 1);
    const reward = runReward(profile, { won: e.won, waves: cleared, rating: e.rating, yarn: sim.yarn - paidYarn, map: chosenMap, difficulty, paid: paidWaves });
    const u = applyReward(profile, reward, { won: e.won, map: chosenMap, waves: cleared, again: paidWaves > 0 }); saveProfile(profile);
    for (const k of ['traps', 'items', 'maps']) runUnlocks[k].push(...u[k].filter(x => !runUnlocks[k].includes(x)));
    const endless = paidWaves > 0;
    paidWaves = cleared; paidYarn = sim.yarn;
    document.exitPointerLock?.();
    const nextMap = MAP_ORDER[MAP_ORDER.indexOf(chosenMap) + 1];
    const buttons = [];
    if (e.won && !guest) buttons.push({ label: 'Keep going (endless)', big: true, onClick: keepGoing });
    if (e.won && nextMap && !guest) buttons.push({ label: `Onward: ${MAPS[nextMap].name}`, big: !buttons.length, onClick: () => { try { localStorage.setItem('catcastle.map', JSON.stringify(nextMap)); } catch { /* private */ } if (co) { coop = co; hostStart(mode, nextMap); } else relaunch('go'); } });
    if (!e.won && !guest) buttons.push({ label: co ? 'Try again together' : 'Try again', big: true, onClick: () => co ? hostStart(mode, chosenMap) : relaunch('go') });
    if (!co) buttons.push({ label: 'Change traps', onClick: () => relaunch('kit') });
    buttons.push({ label: 'Main menu', onClick: () => relaunch('') });
    hud.showEnd(e.won, e.rating, sim, profile, reward, chosenCat, { unlocked: runUnlocks, buttons, endless, guest });
  }
  // Keep going after the win: the host (or you alone) carries the same run on from wave 25.
  function keepGoing() {
    if (!sim.continueEndless()) return;
    sendAll({ t: 'endless' });
    ended = false; endEl.classList.remove('show'); sfx.setMusic('build'); hud.message('Endless: hold them as long as you can');
    canvas.requestPointerLock();
  }
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
        if (e.t === 'trapAdd' && e.trap.by === LOCAL_ID) coachSeen.placed++;
        // (v0.32) A milestone wave (4, 8, 12...) cleared for the first time unlocks something
        // straight away: saved now, ready for your next game, listed again at the end.
        if (e.t === 'waveClear') {
          const u = noteWave(profile, chosenMap, e.wave); saveProfile(profile);
          for (const k of u.traps) { runUnlocks.traps.push(k); hud.message(`Unlocked: ${TRAPS[k].name}! Yours from your next game`); }
          for (const k of u.items) runUnlocks.items.push(k);
        }
        if (e.t === 'end' && !ended) endOfRun(e);
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
    // The trap grid while holding a trap; ceiling traps also light the floor tiles they'd hit.
    if (selected && aim && aim.point) {
      const good = p && p.cells ? p.cells.filter(i => i >= 0) : [], ceil = TRAPS[selected].surface === 'ceiling';
      const foot = ceil && good.length ? (() => { const xs = good.map(i => i % W), zs = good.map(i => (i / W) | 0); return [Math.min(...xs) * CELL, Math.min(...zs) * CELL, (Math.max(...xs) + 1) * CELL, (Math.max(...zs) + 1) * CELL]; })() : null;
      scene.setGrid(true, aim.point.x, aim.point.z, p && p.top ? p.y : ceil ? 0 : (aim.surface === 'floor' ? aim.point.y : 0), foot, p && p.ok);
    } else scene.setGrid(false);
    hud.update(dt, sim.hud(LOCAL_ID), selected, p ? p.ok : true);
    // Tips: how far you've walked, what you've placed, whether you've sniffed yet.
    if (me2 && !paused) { if (coachSeen.at) coachSeen.moved += Math.hypot(me2.x - coachSeen.at[0], me2.z - coachSeen.at[1]); coachSeen.at = [me2.x, me2.z]; }
    if (scene.sniff) coachSeen.sniffed = true;
    if (ended) document.getElementById('coach').classList.remove('show');
    else if (!paused) coach.update(dt, { moved: coachSeen.moved, sel: selected, placed: coachSeen.placed, phase: sim.phase, kills: sim.stats.kills, sniffed: coachSeen.sniffed });
    scene.render(dt, yaw, pitch, LOCAL_ID);
    requestAnimationFrame(frame);
  }
  // ---------- level start: the flyover (v0.32, render/flyover.js) ----------
  // Shows where the mice come in, the route they take and the hole they're after, then hands
  // over to your cat, turned to face back down that route (it used to start you staring at
  // the hole's door). Any key or click skips it.
  {
    const cap = document.getElementById('cinecap');
    const fly = makeFlyover(sim, (h) => { if (h) { cap.innerHTML = h; cap.classList.add('on'); } else cap.classList.remove('on'); }, LOCAL_ID);
    yaw = fly.faceYaw; pitch = 0.25;
    document.body.classList.add('cine');
    const skip = () => fly.skip();
    addEventListener('keydown', skip, sig); addEventListener('pointerdown', skip, sig);
    scene.camDriver = (cam, dt) => { const r = fly.drive(cam, dt); if (r === false) document.body.classList.remove('cine'); return r; };
    window.__skipFlyover = skip; window.__fly = fly;   // used by the screenshot tests
  }
  requestAnimationFrame(frame);
  window.__sim = sim; window.__scene = scene;   // handy for debugging in the browser console
  window.__setYaw = (y, p) => { yaw = y; if (p !== undefined) pitch = p; };   // used by the screenshot tests
}
