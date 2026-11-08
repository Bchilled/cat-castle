// hud.js — on-screen info: whisker crosshair (health/energy), ability
// cooldowns, square radar, trap bar, trinkets, prompts, cat subtitles, menus.
// Plain HTML/SVG/canvas over the 3D view. Why: crisp text, cheap, easy to restyle.

import * as THREE from 'three';
import { TRAPS, TRAP_ORDER, RULES, TRINKETS, CAT, MICE, CATS, ITEMS } from '../config.js';
import { W, H, CELL, T, HOLE, SPAWNS, GATE } from '../sim/map.js';
import { previewWave } from '../sim/waves.js';
import { trapIcons } from './icons.js';
import { BARKS } from '../sim/sim.js';

import { CAT_INFO, elTag } from './catinfo.js';
import { portraitURL } from './portraits.js';
const SURFACE = { floor: 'Floor', wall: 'Wall', ceiling: 'Ceiling (under roofs, tables, benches)' };

const $ = (id) => document.getElementById(id);

// Paw-print icon as inline SVG (no emoji-font dependency).
export const PAW = (on = true) => `<svg class="paw ${on ? 'on' : 'off'}" viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5" ry="4.2"/><circle cx="6" cy="10" r="2.2"/><circle cx="10" cy="6.5" r="2.2"/><circle cx="14" cy="6.5" r="2.2"/><circle cx="18" cy="10" r="2.2"/></svg>`;

// Whisker crosshair: three whiskers each side of a nose. Left = health
// (white, turning black as you're hurt), right = energy (yellow, turning black as spent).
const WHISK_L = ['M52 19 L8 9', 'M52 22 L4 22', 'M52 25 L8 35'];
const WHISK_R = ['M68 19 L112 9', 'M68 22 L116 22', 'M68 25 L112 35'];
function whiskerSvg() {
  const lines = (paths, cls) => paths.map(d => `<path d="${d}" class="wbase"/><path d="${d}" class="${cls}" pathLength="100"/>`).join('');
  return `<svg viewBox="0 0 120 44">${lines(WHISK_L, 'whp')}${lines(WHISK_R, 'wen')}<path d="M56 19 L64 19 L60 25 Z" class="nose"/></svg>`;
}
const TYPE_RGB = { [T.FLOOR]: '#5a544c', [T.ROAD]: '#5a4630', [T.WATER]: '#2f6f9a', [T.BRIDGE]: '#7a5a38', [T.SOLID]: '#1e1a16', [T.GATE]: '#7a5a38', [T.HOLE]: '#d8402a', [T.STALL]: '#c8a030' };

export class Hud {
  constructor(sim, loadout = TRAP_ORDER.slice(0, 8)) {
    this.sim = sim; this.msgT = 0; this.subT = 0;
    const icons = trapIcons(loadout);
    $('trapbar').innerHTML = loadout.map((k, i) =>
      `<div class="slot" data-k="${k}"><span class="key">${i + 1}</span>${icons[k] ? `<img src="${icons[k]}" alt="">` : ''}<span class="nm">${TRAPS[k].name}</span><span class="cost">${TRAPS[k].cost}</span></div>`).join('');
    this.preview = null; this.previewWave = -1; this.lastTk = '';
    $('crosshair').innerHTML = whiskerSvg();
    this.whp = [...document.querySelectorAll('#crosshair .whp')];
    this.wen = [...document.querySelectorAll('#crosshair .wen')];
    // Radar: draw the static map once into an offscreen canvas.
    this.radar = $('radar'); this.rctx = this.radar.getContext('2d');
    const size = this.radar.width; this.rs = size / H;                       // px per cell (fit height)
    this.rox = (size - W * this.rs) / 2;
    this.base = document.createElement('canvas'); this.base.width = this.base.height = size;
    const b = this.base.getContext('2d'); b.fillStyle = '#120e0b'; b.fillRect(0, 0, size, size);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x, t = sim.map.type[i];
      b.fillStyle = sim.map.mud[i] ? '#4a3a28' : sim.map.covered[i] ? '#3a342c' : TYPE_RGB[t]; b.fillRect(this.rox + x * this.rs, z * this.rs, this.rs + 0.5, this.rs + 0.5);
    }
  }
  rx(wx) { return this.rox + wx / CELL * this.rs; }
  rz(wz) { return wz / CELL * this.rs; }

  update(dt, h, sel, aimValid) {
    $('lives').textContent = h.lives;
    $('sardines').textContent = h.sardines;
    $('yarn').textContent = h.yarn;
    $('kills').textContent = this.sim.stats.kills;
    $('catname').textContent = h.name;
    $('wave').textContent = h.wave ? `Wave ${h.wave}${h.mode === 'normal' ? ' / ' + RULES.winWave : ''}` : 'Get ready';
    let status = '';
    if (h.phase === 'build') status = h.wave === 0 ? 'Build, then press G to release the mice' : `Next wave in ${Math.ceil(h.phaseTimer)}s — G to start now`;
    else if (h.phase === 'wave') status = `${h.miceLeft} mice left`;
    $('status').textContent = status;
    // What's coming next (build phase only).
    let next = '';
    if (h.phase === 'build') {
      const n = h.wave + 1;
      if (this.previewWave !== n) { this.preview = previewWave(n, h.gateUp, { birds: this.sim.mapDef.birds !== false }); this.previewWave = n; }
      const p = this.preview;
      next = `Wave ${n}: ~${p.total} mice` + (p.fresh.length ? ` · <b class="new">NEW: ${p.fresh.join(', ')}</b>` : '') + (p.boss ? ` · <b class="boss">BOSS: ${p.boss}</b>` : '');
    }
    $('next').innerHTML = next; $('next').style.display = next ? '' : 'none';
    // Boss health bar: the biggest boss alive.
    const boss = this.sim.mice.filter(m => !m.dead && MICE[m.type].boss).sort((a, b) => b.maxHp - a.maxHp)[0];
    $('bossbar').style.display = boss ? '' : 'none';
    if (boss) { $('bossname').textContent = MICE[boss.type].name; $('bosshp').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`; }
    // Whiskers: stroke-dashoffset trims each whisker from the tip inward.
    for (const p of this.whp) p.style.strokeDasharray = `${Math.max(0, h.hp) * 100} 100`;
    for (const p of this.wen) p.style.strokeDasharray = `${Math.max(0, h.energy) * 100} 100`;
    $('crosshair').classList.toggle('bad', !!sel && !aimValid);
    // Ability panel, per cat.
    // Boxes: left click, right click, E, Space, Q (item). Same layout for every cat.
    const info = CAT_INFO[h.kind] || CAT_INFO.fred;
    $('ab-pri-name').textContent = info.pri[0];
    $('ab-pri-note').textContent = h.kind === 'puddin' ? (h.eatCd > 0 ? `eat in ${Math.ceil(h.eatCd * CAT.eatCooldown)}s` : 'kill = eat + heal')
      : h.kind === 'casper' ? `rage +${Math.round(h.rage * 100)}% dmg` : info.pri[1].split(',')[0];
    $('ab-sec-name').textContent = info.sec[0];
    $('ab-sec-note').textContent = `${h.secCost} energy`;
    setCd($('ab-sec'), h.secCd, h.energyAbs >= h.secCost);
    $('ab-alt-name').textContent = info.e[0];
    $('ab-alt-note').textContent = h.altCost ? `${h.altCost} energy` : 'free';
    setCd($('ab-alt'), h.altCd, h.energyAbs >= h.altCost);
    $('ab-jump-name').textContent = info.jump[0];
    $('ab-jump-note').textContent = h.napping ? 'napping… +HP' : info.passive ? info.passive[0] + ': ' + info.passive[1].split(';')[0] : info.jump[1];
    $('ab-charge').parentElement.style.display = h.kind === 'puddin' || h.kind === 'casper' ? '' : 'none';
    $('ab-charge').style.width = `${Math.round((h.kind === 'casper' ? h.rage : h.charge) * 100)}%`;
    $('ab-charge').style.background = h.kind === 'casper' ? '#e0402a' : '';
    $('ab-item').style.display = h.item ? '' : 'none';
    if (h.item) { $('ab-item-name').textContent = ITEMS[h.item].name; $('ab-item-note').textContent = h.itemCd > 0 ? `${Math.ceil(h.itemCd * ITEMS[h.item].cd)}s` : 'ready'; setCd($('ab-item'), h.itemCd, true); }
    if (this.portraitKind !== h.kind) { this.portraitKind = h.kind; $('me-face').src = portraitURL(h.kind); $('me-face').style.outline = `3px solid ${(CATS[h.kind] || CATS.fred).collar}`; }
    $('me').classList.toggle('buffed', h.buffT > 0);
    // Co-op: your friend's health under your name.
    const mates = [...this.sim.cats.values()].filter(c => c.id !== h.id);
    const mk = mates.map(c => `${c.name} ${c.alive ? Math.max(0, Math.round(c.hp / c.def.maxHp * 100)) + '%' : 'down'}`).join(' · ');
    if (mk !== this.lastMates) { this.lastMates = mk; $('mates').textContent = mk; }
    // Trap info card while a trap is in hand.
    if (sel) {
      const d = TRAPS[sel];
      $('trapinfo').innerHTML = `<b>${d.name}</b> ${elTag(d.el)} <span class="cost">${d.cost}</span><small>${SURFACE[d.surface]} · ${d.size[0] / 4}×${Math.max(1, d.size[1] / 4)} tile${d.size[0] * Math.max(4, d.size[1]) > 16 ? 's' : ''}${d.surface === 'wall' ? ' of wall' : ''}</small><p>${d.desc}</p>`;
    }
    $('trapinfo').style.display = sel ? '' : 'none';
    // Trap bar.
    document.querySelectorAll('.slot').forEach(s => {
      s.classList.toggle('sel', s.dataset.k === sel);
      s.classList.toggle('poor', TRAPS[s.dataset.k].cost > h.sardines);
    });
    // Trinkets.
    const tk = Object.entries(h.trinkets), key = JSON.stringify(tk);
    if (key !== this.lastTk) {
      this.lastTk = key;
      $('trinkets').innerHTML = tk.map(([k, n]) => `<div class="tk ${TRINKETS[k].tier}">${TRINKETS[k].name}${n > 1 ? ' <b>×' + n + '</b>' : ''}<small>${TRINKETS[k].desc}</small></div>`).join('');
    }
    let prompt = '';
    if (!h.alive) prompt = `Respawning in ${Math.ceil(h.respawnT)}…`;
    else if (sel) prompt = `Right click to place · R rotate · X sell · press the number again to put it away`;
    $('prompt').textContent = prompt;
    this.msgT -= dt; if (this.msgT <= 0) $('msg').classList.remove('show');
    this.subT -= dt; if (this.subT <= 0) $('sub').classList.remove('show');
    this.drawRadar();
  }

  drawRadar() {
    const c = this.rctx, sim = this.sim;
    c.drawImage(this.base, 0, 0);
    // Map features: doors (shut = dark), fires, food piles.
    sim.doors.forEach(d => { const [x0, z0, x1, z1] = d.rect; c.fillStyle = d.open ? TYPE_RGB[T.FLOOR] : '#8a5a2a'; c.fillRect(this.rx(x0), this.rz(z0), Math.max(2, this.rx(x1) - this.rx(x0)), Math.max(2, this.rz(z1) - this.rz(z0))); });
    c.fillStyle = '#ff7a20'; for (const f of sim.mapDef.fires || []) { c.beginPath(); c.arc(this.rx(f.x), this.rz(f.z), 3, 0, 7); c.fill(); }
    c.fillStyle = '#e8c040'; for (const f of sim.foods) if (f.left > 0) { c.beginPath(); c.arc(this.rx(f.x), this.rz(f.z), 2.5, 0, 7); c.fill(); }
    // Food up on furniture: yellow ring. Crate stacks: brown while standing.
    c.strokeStyle = '#e8c040'; c.lineWidth = 1.5; for (const f of sim.tops) if (f.left > 0) { c.beginPath(); c.arc(this.rx(f.x), this.rz(f.z), 3, 0, 7); c.stroke(); }
    // Shelves: dark brown while standing; once down their spot is open floor (the fallen shelf shows as a crate stack).
    for (const sh of sim.shelves || []) { const [x0, z0, x1, z1] = sh.rect; c.fillStyle = sh.state === 'up' || sh.state === 'falling' ? '#6a3e22' : sim.map.covered[sh.cells[0]] ? '#3a342c' : TYPE_RGB[T.FLOOR]; c.fillRect(this.rx(x0), this.rz(z0), Math.max(2, this.rx(x1) - this.rx(x0)), Math.max(2, this.rz(z1) - this.rz(z0))); }
    c.fillStyle = '#b07a44'; for (const b of sim.barrels || []) { c.beginPath(); c.arc(this.rx(b.x), this.rz(b.z), 2.2, 0, 7); c.fill(); }
    c.fillStyle = '#9a6a3a'; for (const cr of sim.crates) if (cr.up) { const [x0, z0, x1, z1] = cr.rect; c.fillRect(this.rx(x0), this.rz(z0), Math.max(2, this.rx(x1) - this.rx(x0)), Math.max(2, this.rz(z1) - this.rz(z0))); }
    // Where the mice are scared of (danger memory): faint red patches.
    for (const [x, z, k] of sim.dangerSpots) { c.fillStyle = `rgba(220,40,30,${0.12 + 0.35 * k})`; const r = 4 / CELL * this.rs; c.fillRect(this.rx(x) - r / 2, this.rz(z) - r / 2, r, r); }
    if (GATE && !sim.gate.up) { c.fillStyle = TYPE_RGB[T.FLOOR]; c.fillRect(this.rx(GATE.x0), this.rz(GATE.z0), this.rx(GATE.x1) - this.rx(GATE.x0), this.rz(GATE.z1) - this.rz(GATE.z0)); }
    for (const tr of sim.traps.values()) { c.fillStyle = tr.kind === 'barricade' ? '#c4a46a' : tr.layer === 'ceiling' ? '#6fb8ff' : '#7fd06a'; c.fillRect(this.rx(tr.x0), this.rz(tr.z0), Math.max(2, this.rx(tr.x1) - this.rx(tr.x0)), Math.max(2, this.rz(tr.z1) - this.rz(tr.z0))); }
    // Mouse route.
    c.strokeStyle = 'rgba(180,138,255,0.75)'; c.lineWidth = 1.5;
    for (const route of sim.routes()) { c.beginPath(); route.forEach(([x, z], k) => { if (k === 0) c.moveTo(this.rx(x), this.rz(z)); else c.lineTo(this.rx(x), this.rz(z)); }); c.stroke(); }
    for (const m of sim.mice) {
      const d = MICE[m.type]; c.fillStyle = d.boss ? '#ff3a2a' : '#e86a4a';
      const r = d.boss ? 4 : d.size > 0.5 ? 2 : 1.3;
      c.beginPath(); c.arc(this.rx(m.x), this.rz(m.z), r, 0, 7); c.fill();
    }
    // Birds: small white chevrons (crows carrying mice in red).
    for (const b of sim.birds) {
      const x = this.rx(b.x), z = this.rz(b.z);
      c.strokeStyle = b.carry ? '#ff5a3a' : '#f0f0f0'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x - 4, z - 2); c.lineTo(x, z + 1); c.lineTo(x + 4, z - 2); c.stroke();
    }
    for (const cat of sim.cats.values()) {
      if (!cat.alive) continue;
      const x = this.rx(cat.x), z = this.rz(cat.z), a = cat.yaw;
      // Each cat's marker is its collar colour, outlined so it pops on any floor.
      c.fillStyle = cat.def.collar || '#f08a30'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + Math.sin(a) * 7, z + Math.cos(a) * 7); c.lineTo(x + Math.sin(a + 2.5) * 5, z + Math.cos(a + 2.5) * 5); c.lineTo(x + Math.sin(a - 2.5) * 5, z + Math.cos(a - 2.5) * 5); c.closePath(); c.stroke(); c.fill();
    }
    // Labels: exit X, spawn Y.
    c.font = 'bold 11px sans-serif'; c.fillStyle = '#ff5a3a'; c.fillText('X', this.rx((HOLE.x0 + HOLE.x1) / 2) - 4, this.rz(HOLE.z1) + 12);
    c.fillStyle = '#b48aff'; SPAWNS.forEach(sp => c.fillText('Y', this.rx(sp.x) - 4, this.rz(sp.z) - 2));
  }

  message(text) { $('msg').textContent = text; $('msg').classList.add('show'); this.msgT = 2.5; }
  bark(who, text, kind) { $('sub').innerHTML = `<img class="face" src="${portraitURL(kind)}" alt=""><b style="color:${(CATS[kind] || CATS.fred).collar}">${who}:</b> ${text}`; $('sub').classList.add('show'); this.subT = 3.2; }
  flashHurt() { const v = $('hurt'); v.classList.remove('go'); void v.offsetWidth; v.classList.add('go'); }

  // End of a map: the result, your cat's last word, what you earned (paw prints, yarn) and the way to the shop.
  showEnd(won, rating, sim, profile, reward, kind = 'fred') {
    const el = $('end'); el.classList.add('show');
    const lines = (BARKS[kind] || BARKS.fred)[won ? 'clear' : 'death'];
    let html = `<h1>${won ? 'The hall holds' : 'They got through'}</h1><p class="quip">${CATS[kind] ? CATS[kind].name : 'Fred'}: ${lines[Math.floor(Math.random() * lines.length)]}</p>`;
    html += `<p>${won ? `All ${RULES.winWave} waves cleared` : `Fell on wave ${sim.wave}`} · ${sim.stats.kills} mice killed · ${sim.stats.combos || 0} combos</p>`;
    if (won && rating) {
      html += `<div class="paws">${Array.from({ length: 5 }, (_, i) => PAW(i < rating.base)).join('')}</div>`;
      html += '<ul class="bonus">' + rating.bonus.map(b => `<li class="${b.got ? 'got' : ''}">${PAW(b.got)} ${b.name}</li>`).join('') + '</ul>';
    }
    if (reward) {
      html += '<ul class="bonus">' + reward.lines.map(([t, n]) => `<li class="got">${n < 0 ? '' : '+'}${n} paw prints · ${t}</li>`).join('') + (reward.yarn ? `<li class="got">+${reward.yarn} yarn · bosses</li>` : '') + '</ul>';
    }
    html += `<p class="dim">You have ${profile.paws} paw prints · ${profile.yarn} yarn${profile.sandbox ? ' (sandbox: not saved)' : ''}. Spend them in the shop.</p>`;
    html += `<button onclick="window.__relaunch('shop')">Shop</button><button onclick="window.__relaunch('')">Back to menu</button>`;
    el.innerHTML = html;
  }
}

// Cooldown sweep on an ability icon; dimmed if there isn't enough energy.
function setCd(el, frac, enough) {
  const f = Math.max(0, Math.min(1, frac || 0));
  el.style.setProperty('--cd', `${f * 360}deg`);
  el.classList.toggle('cooling', f > 0); el.classList.toggle('noenergy', !enough);
}
