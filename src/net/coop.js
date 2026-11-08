// coop.js — two-player online co-op.
//
// Host-authoritative: the host runs the one real Sim with both cats in it. The guest runs a
// "mirror" Sim of the same map that never steps: it only receives snapshots (where everything
// is, 15 times a second) plus the events (for sounds and effects), and sends its own commands
// (inputs, trap placing, items) to the host. Nothing in sim.js knows about networking.
//
// Connection: WebRTC via PeerJS (peer-to-peer; the free PeerJS server only introduces the two
// browsers). Room code = 4 letters. For testing on one computer, ?local uses a
// BroadcastChannel between two tabs instead.

import { MICE, CATS } from '../config.js';
import { cellCenter, T } from '../sim/map.js';

const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'ninelives-keep-';
export const LOCAL_TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('local');

export function roomCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let k = 0; k < 4; k++) s += A[Math.floor(Math.random() * A.length)]; return s; }

let peerLib = null;
function loadPeer() {
  if (peerLib) return peerLib;
  peerLib = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = PEER_URL;
    sc.onload = () => res(window.Peer || (window.peerjs && window.peerjs.Peer));
    sc.onerror = () => rej(new Error("Couldn't load the co-op library"));
    document.head.appendChild(sc);
  });
  return peerLib;
}

// A link: send(obj), on('data'|'close', fn), close(). Same shape for PeerJS and the local test.
function wrapPeerConn(conn, peer) {
  const h = { data: [], close: [] };
  conn.on('data', (d) => h.data.forEach(f => f(d)));
  conn.on('close', () => h.close.forEach(f => f()));
  conn.on('error', () => h.close.forEach(f => f()));
  return { send: (o) => { if (conn.open) conn.send(o); }, on: (k, f) => h[k].push(f), close: () => { try { conn.close(); peer.destroy(); } catch { /* gone */ } } };
}
function localLink(code, role) {
  const ch = new BroadcastChannel(PREFIX + code), h = { data: [], close: [] }, other = role === 'host' ? 'guest' : 'host';
  ch.onmessage = (e) => { if (e.data.to === role) { if (e.data.bye) h.close.forEach(f => f()); else h.data.forEach(f => f(e.data.m)); } };
  return { ch, send: (m) => ch.postMessage({ to: other, m }), on: (k, f) => h[k].push(f), close: () => { ch.postMessage({ to: other, bye: true }); ch.close(); } };
}

// Host: open a room and resolve with the link once a guest connects.
export async function hostRoom(code, status) {
  if (LOCAL_TEST) {
    const link = localLink(code, 'host');
    status(`Room ${code} (local test) — open another tab with ?local and join ${code}`);
    return new Promise(res => { link.ch.addEventListener('message', function hi(e) { if (e.data.to === 'host' && e.data.m && e.data.m.t === 'hello') { link.ch.removeEventListener('message', hi); res({ link, hello: e.data.m }); } }); });
  }
  const Peer = await loadPeer();
  return new Promise((res, rej) => {
    const peer = new Peer(PREFIX + code);
    peer.on('open', () => status(`Room ${code} — tell your friend the code. Waiting…`));
    peer.on('error', (err) => { status(`Co-op error: ${err.type || err.message}`); rej(err); });
    let taken = false;
    peer.on('connection', (conn) => {
      if (taken) { conn.on('open', () => conn.close()); return; }   // two players only
      taken = true;
      conn.on('open', () => {
        const link = wrapPeerConn(conn, peer);
        conn.on('data', function hi(d) { if (d && d.t === 'hello') { conn.off && conn.off('data', hi); res({ link, hello: d }); } });
      });
    });
  });
}
// Guest: join a room by code.
export async function joinRoom(code, hello, status) {
  if (LOCAL_TEST) { const link = localLink(code, 'guest'); link.send(hello); status(`Joined ${code} (local test). Waiting for the host to start…`); return link; }
  const Peer = await loadPeer();
  return new Promise((res, rej) => {
    const peer = new Peer();
    peer.on('error', (err) => { status(err.type === 'peer-unavailable' ? `No room called ${code}` : `Co-op error: ${err.type || err.message}`); rej(err); });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { const link = wrapPeerConn(conn, peer); link.send(hello); status(`Joined ${code}. Waiting for the host to start…`); res(link); });
    });
  });
}

// ---------- snapshots (host -> guest) ----------
const MT = Object.keys(MICE);                 // mouse/bird type <-> index
const MK = ['pellet', 'whisker', 'burr', 'pebble', 'hairball'];
const r2 = (v) => Math.round(v * 100) / 100;
// Cat fields the renderer and HUD read.
const CAT_KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'hp', 'energy', 'alive', 'respawnT', 'onGround', 'attacking', 'pouncing', 'striking', 'dashing', 'charge',
  'hurtT', 'hissT', 'flipT', 'frenzyT', 'rage', 'napping', 'buffT', 'secT', 'altT', 'itemT', 'eatT', 'turn', 'guardT', 'tauntT', 'stunT'];
// Mouse flags packed into one number.
const F = { asleep: 4, frozen: 8, burn: 16, wet: 32, oil: 64, dirty: 128, confuse: 256, slow: 512, climbing: 1024, flash: 2048, gorged: 4096 };
const STATES = ['walk', 'air', 'stuck', 'stranded'];

export function snapshot(sim) {
  const cats = [...sim.cats.values()].map(c => [c.id, c.kind, c.hat || null, c.item || null, ...CAT_KEYS.map(k => typeof c[k] === 'number' ? r2(c[k]) : c[k])]);
  const mice = [];
  for (const m of sim.mice) {
    if (m.dead) continue;
    const fl = Math.max(0, STATES.indexOf(m.state)) | (m.asleep ? F.asleep : 0) | (m.frozen ? F.frozen : 0) | (m.burnT > 0 ? F.burn : 0) | (m.wetT > 0 ? F.wet : 0) | (m.oilT > 0 ? F.oil : 0)
      | (m.dirtyT > 0 ? F.dirty : 0) | (m.confuseT > 0 ? F.confuse : 0) | (m.slowT > 0 ? F.slow : 0) | (m.climbing ? F.climbing : 0) | (m.flash > 0 ? F.flash : 0) | (m.gorged ? F.gorged : 0);
    mice.push(m.id, MT.indexOf(m.type), Math.round(m.x * 100), Math.round(m.y * 100), Math.round(m.z * 100), Math.round((m.yaw || 0) * 100),
      Math.round(Math.max(0, m.hp) / m.maxHp * 1000), fl, Math.round(m.stunT > 0 ? m.stunT / (m.stunMax || 1) * 100 : 0), Math.round((m.scale || 1) * 100), Math.round((m.shade || 0) * 100));
  }
  return {
    phase: sim.phase, wave: sim.wave, phaseTimer: r2(sim.phaseTimer === Infinity ? 1e9 : sim.phaseTimer), lives: sim.lives, sardines: sim.sardines, yarn: sim.yarn, time: r2(sim.time),
    gate: sim.gate, kills: sim.stats.kills, combos: sim.stats.combos || 0, trinkets: sim.trinkets, rating: sim.rating || null, left: sim.spawn ? sim.spawn.queue.length : 0,
    cats, mice,
    birds: sim.birds.map(b => [b.id, MT.indexOf(b.type), r2(b.x), r2(b.y), r2(b.z), r2(b.yaw), b.stunT > 0 ? 1 : 0, b.stuckT > 0 ? 1 : 0, b.carry, Math.round(b.hp / b.maxHp * 100)]),
    traps: [...sim.traps.values()].map(t => [t.id, r2(t.cd), r2(t.cdMax), r2(t.charges), Math.round(t.hp), t.active ? 1 : 0]),
    missiles: sim.missiles.map(b => [b.id, MK.indexOf(b.kind), r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vz)]),
    globs: sim.globs.map(g => [g.id, r2(g.x), r2(g.y), r2(g.z)]), shots: sim.shots.map(s => [s.id, r2(s.x), r2(s.y), r2(s.z)]),
    zones: sim.zones.map(z => ({ id: z.id, kind: z.kind, x: r2(z.x), z: r2(z.z), r: z.r, t: r2(z.t), what: z.what })),
    decoys: sim.decoys.map(d => ({ id: d.id, x: r2(d.x), z: r2(d.z), hp: d.hp })),
    props: sim.props.map(p => [r2(p.x), r2(p.y), r2(p.z), p.state, r2(p.tilt)]),
    doors: sim.doors.map(d => d.open), foods: sim.foods.map(f => f.left), tops: sim.tops.map(f => f.left), crates: sim.crates.map(c => [c.up, c.hp]),
    loot: sim.loot.map(l => ({ id: l.id, x: r2(l.x), y: r2(l.y), z: r2(l.z), key: l.key })), danger: sim.dangerSpots,
  };
}

// Apply a snapshot to the guest's mirror sim (reusing objects so the renderer's smoothing keeps working).
export function applySnapshot(sim, s) {
  Object.assign(sim, { phase: s.phase, wave: s.wave, phaseTimer: s.phaseTimer >= 1e9 ? Infinity : s.phaseTimer, lives: s.lives, sardines: s.sardines, yarn: s.yarn, time: s.time, trinkets: s.trinkets, rating: s.rating });
  sim.stats.kills = s.kills; sim.stats.combos = s.combos;
  if (s.gate.up !== sim.gate.up) { sim.gate.up = s.gate.up; sim.flowDirty = true; }
  sim.gate.hp = s.gate.hp;
  sim.spawn = { queue: { length: s.left } };
  for (const row of s.cats) {
    const [id, kind, hat, item] = row; let c = sim.cats.get(id);
    if (!c) { c = sim.addPlayer(id, kind, { hat, item }); }
    CAT_KEYS.forEach((k, j) => { c[k] = row[4 + j]; });
    c.item = item;
  }
  // Mice: flat array, 11 numbers each.
  const keep = new Map(sim.mice.map(m => [m.id, m])), out = [];
  for (let k = 0; k < s.mice.length; k += 11) {
    const id = s.mice[k]; let m = keep.get(id);
    if (!m) m = { id, bleed: [] };
    const fl = s.mice[k + 7];
    m.type = MT[s.mice[k + 1]]; m.x = s.mice[k + 2] / 100; m.y = s.mice[k + 3] / 100; m.z = s.mice[k + 4] / 100; m.yaw = s.mice[k + 5] / 100;
    m.maxHp = 1000; m.hp = s.mice[k + 6]; m.state = STATES[fl & 3]; m.stunMax = 1; m.stunT = s.mice[k + 8] / 100;
    m.scale = s.mice[k + 9] / 100; m.shade = s.mice[k + 10] / 100; m.dead = false;
    m.asleep = !!(fl & F.asleep); m.frozen = !!(fl & F.frozen); m.burnT = fl & F.burn ? 1 : 0; m.wetT = fl & F.wet ? 1 : 0; m.oilT = fl & F.oil ? 1 : 0;
    m.dirtyT = fl & F.dirty ? 1 : 0; m.confuseT = fl & F.confuse ? 1 : 0; m.slowT = fl & F.slow ? 1 : 0; m.climbing = !!(fl & F.climbing); m.flash = fl & F.flash ? 0.1 : 0; m.gorged = !!(fl & F.gorged);
    out.push(m);
  }
  sim.mice = out;
  sim.birds = s.birds.map(([id, ti, x, y, z, yaw, stun, stuck, carry, hp]) => ({ id, type: MT[ti], x, y, z, yaw, stunT: stun, stuckT: stuck, carry, hp, maxHp: 100, state: 'in' }));
  for (const [id, cd, cdMax, charges, hp, active] of s.traps) { const t = sim.traps.get(id); if (t) Object.assign(t, { cd, cdMax, charges, hp, active: !!active }); }
  sim.missiles = s.missiles.map(([id, ki, x, y, z, vx, vz]) => ({ id, kind: MK[ki], x, y, z, vx, vz, vy: 0 }));
  sim.globs = s.globs.map(([id, x, y, z]) => ({ id, x, y, z })); sim.shots = s.shots.map(([id, x, y, z]) => ({ id, x, y, z }));
  sim.zones = s.zones; sim.decoys = s.decoys.map(d => ({ ...d, alive: true }));
  s.props.forEach(([x, y, z, state, tilt], k) => { const p = sim.props[k]; if (p) Object.assign(p, { x, y, z, state, tilt }); });
  s.doors.forEach((open, k) => { const d = sim.doors[k]; if (d && d.open !== open) mirrorDoor(sim, k, open); });
  s.foods.forEach((n, k) => { if (sim.foods[k]) sim.foods[k].left = n; });
  s.tops.forEach((n, k) => { if (sim.tops[k]) sim.tops[k].left = n; });
  s.crates.forEach(([up, hp], k) => { const c = sim.crates[k]; if (!c) return; if (c.up !== up) { c.up = up; sim.flowDirty = true; } c.hp = hp; });
  sim.loot = s.loot; sim.dangerSpots = s.danger || [];
}
function mirrorDoor(sim, di, open) {
  const d = sim.doors[di]; d.open = open;
  for (let i = 0; i < sim.map.door.length; i++) if (sim.map.door[i] === di) { sim.map.solid[i] = open ? 0 : 6; }
  sim.flowDirty = true;
}
// Events that change the mirror's layout (so routes, placement previews and the radar match).
export function applyEvent(sim, e) {
  if (e.t === 'trapAdd') {
    const tr = { ...e.trap };
    for (const i of tr.cells) sim.occ[tr.layer][i] = tr.id;
    sim.traps.set(tr.id, tr); sim.flowDirty = true; sim.layoutVer++;
  } else if (e.t === 'trapRemove') {
    const tr = sim.traps.get(e.id); if (!tr) return;
    for (const i of tr.cells) if (sim.occ[tr.layer][i] === tr.id) sim.occ[tr.layer][i] = 0;
    sim.traps.delete(e.id); sim.flowDirty = true; sim.layoutVer++;
  } else if (e.t === 'gateBreak') { sim.gate.up = false; sim.flowDirty = true; }
}
// Events the guest doesn't need (damage numbers, Paw Point sparkles): saves bandwidth.
export const SKIP_EVENTS = new Set(['dmg', 'points']);
export { CATS, cellCenter };
