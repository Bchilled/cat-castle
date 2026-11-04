// hud.js — on-screen info: whisker crosshair (health/energy), ability
// cooldowns, square radar, trap bar, trinkets, prompts, cat subtitles, menus.
// Plain HTML/SVG/canvas over the 3D view. Why: crisp text, cheap, easy to restyle.

import { TRAPS, TRAP_ORDER, RULES, TRINKETS, CAT, MICE } from '../config.js';
import { W, H, CELL, T, STALLS, HOLE, SPAWNS, GATE } from '../sim/map.js';

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
  constructor(sim) {
    this.sim = sim; this.msgT = 0; this.subT = 0;
    $('trapbar').innerHTML = TRAP_ORDER.map((k, i) =>
      `<div class="slot" data-k="${k}"><span class="key">${i + 1}</span><span class="nm">${TRAPS[k].name}</span><span class="cost">${TRAPS[k].cost}</span></div>`).join('');
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
      b.fillStyle = sim.map.covered[i] ? '#3a342c' : TYPE_RGB[t]; b.fillRect(this.rox + x * this.rs, z * this.rs, this.rs + 0.5, this.rs + 0.5);
    }
  }
  rx(wx) { return this.rox + wx / CELL * this.rs; }
  rz(wz) { return wz / CELL * this.rs; }

  update(dt, h, sel, aimValid) {
    $('lives').textContent = h.lives;
    $('sardines').textContent = h.sardines;
    $('yarn').textContent = h.yarn;
    $('tails').textContent = `${h.tails}/${RULES.tailCarryCap}`;
    $('catname').textContent = h.name;
    $('wave').textContent = h.wave ? `Wave ${h.wave}${h.mode === 'normal' ? ' / ' + RULES.winWave : ''}` : 'Get ready';
    let status = '';
    if (h.phase === 'build') status = h.wave === 0 ? 'Press G to release the mice' : `Next wave in ${Math.ceil(h.phaseTimer)}s — G to start now`;
    else if (h.phase === 'wave') status = `${h.miceLeft} mice left`;
    $('status').textContent = status;
    // Whiskers: stroke-dashoffset trims each whisker from the tip inward.
    for (const p of this.whp) p.style.strokeDasharray = `${Math.max(0, h.hp) * 100} 100`;
    for (const p of this.wen) p.style.strokeDasharray = `${Math.max(0, h.energy) * 100} 100`;
    $('crosshair').classList.toggle('bad', !!sel && !aimValid);
    // Ability panel, per cat.
    const fred = h.kind === 'fred';
    $('ab-pri-name').textContent = fred ? 'Spit' : 'Bite';
    $('ab-pri-note').textContent = fred ? 'bleed' : (h.eatCd > 0 ? `eat ${Math.ceil(h.eatCd * CAT.eatCooldown)}s` : 'eat ready');
    $('ab-sec-name').textContent = fred ? 'Hairball' : 'Pounce';
    setCd($('ab-sec'), h.secCd, h.energy * CAT.maxEnergy >= h.secCost);
    $('ab-jump-name').textContent = fred ? 'Double jump' : 'Charge leap';
    $('ab-charge').style.width = `${Math.round(h.charge * 100)}%`;
    // Trap bar.
    document.querySelectorAll('.slot').forEach(s => {
      s.classList.toggle('sel', s.dataset.k === sel);
      s.classList.toggle('poor', TRAPS[s.dataset.k].cost > h.sardines);
    });
    // Trinkets.
    const tk = Object.entries(h.trinkets);
    $('trinkets').innerHTML = tk.map(([k, n]) => `<span class="tk ${TRINKETS[k].tier}" title="${TRINKETS[k].name}: ${TRINKETS[k].desc}">${TRINKETS[k].name.split(' ').map(w => w[0]).join('')}${n > 1 ? '<b>' + n + '</b>' : ''}</span>`).join('');
    let prompt = '';
    if (!h.alive) prompt = `Respawning in ${Math.ceil(h.respawnT)}…`;
    else if (h.nearStall && h.tails > 0) prompt = `E — trade ${h.tails} tails for sardines`;
    else if (sel) prompt = `Right click to place ${TRAPS[sel].name} · R rotate · X sell · Q put away`;
    $('prompt').textContent = prompt;
    this.msgT -= dt; if (this.msgT <= 0) $('msg').classList.remove('show');
    this.subT -= dt; if (this.subT <= 0) $('sub').classList.remove('show');
    this.drawRadar();
  }

  drawRadar() {
    const c = this.rctx, sim = this.sim;
    c.drawImage(this.base, 0, 0);
    if (!sim.gate.up) { c.fillStyle = TYPE_RGB[T.FLOOR]; c.fillRect(this.rx(GATE.x0), this.rz(GATE.z0), this.rx(GATE.x1) - this.rx(GATE.x0), this.rz(GATE.z1) - this.rz(GATE.z0)); }
    for (const tr of sim.traps.values()) { c.fillStyle = tr.kind === 'barricade' ? '#c4a46a' : tr.layer === 'ceiling' ? '#6fb8ff' : '#7fd06a'; c.fillRect(this.rx(tr.x0), this.rz(tr.z0), Math.max(2, this.rx(tr.x1) - this.rx(tr.x0)), Math.max(2, this.rz(tr.z1) - this.rz(tr.z0))); }
    // Mouse route.
    c.strokeStyle = 'rgba(180,138,255,0.75)'; c.lineWidth = 1.5;
    for (const route of sim.routes()) { c.beginPath(); route.forEach(([x, z], k) => { if (k === 0) c.moveTo(this.rx(x), this.rz(z)); else c.lineTo(this.rx(x), this.rz(z)); }); c.stroke(); }
    c.fillStyle = '#e8c33a'; for (const t of sim.tails) c.fillRect(this.rx(t.x) - 1, this.rz(t.z) - 1, 2, 2);
    for (const m of sim.mice) {
      const d = MICE[m.type]; c.fillStyle = d.boss ? '#ff3a2a' : '#e86a4a';
      const r = d.boss ? 4 : d.size > 0.5 ? 2 : 1.3;
      c.beginPath(); c.arc(this.rx(m.x), this.rz(m.z), r, 0, 7); c.fill();
    }
    for (const cat of sim.cats.values()) {
      if (!cat.alive) continue;
      const x = this.rx(cat.x), z = this.rz(cat.z), a = cat.yaw;
      c.fillStyle = cat.kind === 'puddin' ? '#f0e8da' : '#f08a30';
      c.beginPath(); c.moveTo(x + Math.sin(a) * 6, z + Math.cos(a) * 6); c.lineTo(x + Math.sin(a + 2.5) * 4, z + Math.cos(a + 2.5) * 4); c.lineTo(x + Math.sin(a - 2.5) * 4, z + Math.cos(a - 2.5) * 4); c.fill();
    }
    // Labels: exit X, spawn Y.
    c.font = 'bold 11px sans-serif'; c.fillStyle = '#ff5a3a'; c.fillText('X', this.rx((HOLE.x0 + HOLE.x1) / 2) - 4, this.rz(HOLE.z1) + 12);
    c.fillStyle = '#b48aff'; SPAWNS.forEach(sp => c.fillText('Y', this.rx(sp.x) - 4, this.rz(sp.z) - 2));
  }

  message(text) { $('msg').textContent = text; $('msg').classList.add('show'); this.msgT = 2.5; }
  bark(who, text) { $('sub').innerHTML = `<b>${who}:</b> ${text}`; $('sub').classList.add('show'); this.subT = 3.2; }
  flashHurt() { const v = $('hurt'); v.classList.remove('go'); void v.offsetWidth; v.classList.add('go'); }

  showEnd(won, rating, sim, profile) {
    const el = $('end'); el.classList.add('show');
    let html = `<h1>${won ? 'The hall holds' : 'They got through'}</h1>`;
    html += `<p>${won ? `All ${RULES.winWave} waves cleared` : `Fell on wave ${sim.wave}`} · ${sim.stats.kills} mice killed · ${sim.yarn} yarn</p>`;
    if (won && rating) {
      html += `<div class="paws">${Array.from({ length: 5 }, (_, i) => PAW(i < rating.base)).join('')}</div>`;
      html += '<ul class="bonus">' + rating.bonus.map(b => `<li class="${b.got ? 'got' : ''}">${PAW(b.got)} ${b.name}</li>`).join('') + '</ul>';
      html += `<p>+${rating.total} paw prints</p>`;
    }
    html += `<p class="dim">Saved: ${profile.paws} paw prints · ${profile.yarn} yarn (unlock shop & yarn crafting coming next)</p>`;
    html += `<button onclick="location.reload()">Back to menu</button>`;
    el.innerHTML = html;
  }
}

// Cooldown sweep on an ability icon; dimmed if there isn't enough energy.
function setCd(el, frac, enough) {
  const f = Math.max(0, Math.min(1, frac || 0));
  el.style.setProperty('--cd', `${f * 360}deg`);
  el.classList.toggle('cooling', f > 0); el.classList.toggle('noenergy', !enough);
}
