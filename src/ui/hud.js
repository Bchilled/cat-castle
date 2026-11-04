// hud.js — on-screen numbers, trap bar, prompts, Fred's subtitles, menus.
// Plain HTML over the canvas. Why: crisp text, easy to restyle, no 3D cost.

import { TRAPS, TRAP_ORDER, RULES, VERSION } from '../config.js';

const $ = (id) => document.getElementById(id);

// Paw-print icon (drawn as inline SVG so we don't depend on emoji fonts).
export const PAW = (on = true) => `<svg class="paw ${on ? 'on' : 'off'}" viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5" ry="4.2"/><circle cx="6" cy="10" r="2.2"/><circle cx="10" cy="6.5" r="2.2"/><circle cx="14" cy="6.5" r="2.2"/><circle cx="18" cy="10" r="2.2"/></svg>`;

export class Hud {
  constructor() {
    this.msgT = 0; this.subT = 0;
    $('trapbar').innerHTML = TRAP_ORDER.map(k =>
      `<div class="slot" data-k="${k}"><span class="key">${TRAPS[k].key}</span><span class="nm">${TRAPS[k].name}</span><span class="cost">${TRAPS[k].cost}</span></div>`).join('');
    $('version').textContent = 'v' + VERSION;
  }
  update(dt, h, sel, aimValid) {
    $('lives').textContent = h.lives;
    $('coins').textContent = h.coins;
    $('yarn').textContent = h.yarn;
    $('cheese').textContent = `${h.cheese}/${RULES.cheeseCarryCap}`;
    $('hpfill').style.width = Math.max(0, h.hp) + '%';
    $('wave').textContent = h.wave ? `Wave ${h.wave}${h.mode === 'normal' ? ' / ' + RULES.winWave : ''}` : 'Get ready';
    let status = '';
    if (h.phase === 'build') status = h.wave === 0 ? 'Press G to release the mice' : `Next wave in ${Math.ceil(h.phaseTimer)}s — G to start now`;
    else if (h.phase === 'wave') status = `${h.miceLeft} mice left`;
    $('status').textContent = status;
    document.querySelectorAll('.slot').forEach(s => {
      s.classList.toggle('sel', s.dataset.k === sel);
      s.classList.toggle('poor', TRAPS[s.dataset.k].cost > h.coins);
    });
    let prompt = '';
    if (!h.alive) prompt = `Respawning in ${Math.ceil(h.respawnT)}…`;
    else if (h.nearStall && h.cheese > 0) prompt = `E — sell ${h.cheese} cheese for ${h.cheese * RULES.cheesePrice} coins`;
    else if (sel) prompt = `Click to place ${TRAPS[sel].name}${sel === 'flipper' ? ' · R to turn' : ''} · X to sell · ${TRAPS[sel].key} to put away`;
    $('prompt').textContent = prompt;
    $('crosshair').classList.toggle('bad', !!sel && !aimValid);
    this.msgT -= dt; if (this.msgT <= 0) $('msg').classList.remove('show');
    this.subT -= dt; if (this.subT <= 0) $('sub').classList.remove('show');
  }
  message(text) { $('msg').textContent = text; $('msg').classList.add('show'); this.msgT = 2.5; }
  bark(text) { $('sub').innerHTML = `<b>Fred:</b> ${text}`; $('sub').classList.add('show'); this.subT = 3.2; }
  flashHurt() { const v = $('hurt'); v.classList.remove('go'); void v.offsetWidth; v.classList.add('go'); }

  showEnd(won, rating, sim, profile) {
    const el = $('end'); el.classList.add('show');
    let html = `<h1>${won ? 'Castle held' : 'The kitchen is overrun'}</h1>`;
    html += `<p>${won ? `All ${RULES.winWave} waves cleared` : `Fell on wave ${sim.wave}`} · ${sim.stats.kills} mice killed · ${sim.yarn} yarn</p>`;
    if (won && rating) {
      html += `<div class="paws">${Array.from({ length: 5 }, (_, i) => PAW(i < rating.base)).join('')}</div>`;
      html += '<ul class="bonus">' + rating.bonus.map(b =>
        `<li class="${b.got ? 'got' : ''}">${PAW(b.got)} ${b.name}${b.locked ? ' <i>(not in this build yet)</i>' : ''}</li>`).join('') + '</ul>';
      html += `<p>+${rating.total} paw prints</p>`;
    }
    html += `<p class="dim">Saved: ${profile.paws} paw prints · ${profile.yarn} yarn (unlock shop & yarn crafting coming next)</p>`;
    html += `<button onclick="location.reload()">Back to menu</button>`;
    el.innerHTML = html;
  }
}
