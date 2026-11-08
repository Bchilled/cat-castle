// shop.js — the between-runs shop: unlock traps and items, upgrade traps (tier 2, tier 3,
// then pick one of two specials), and buy hats with yarn. Opens over the main menu.
// The rules (prices, what you own) live in meta/profile.js; this is only the screen.

import { TRAPS, TRAP_ORDER, ITEMS, ITEM_ORDER, SPECIALS, CATS, trapParams } from '../config.js';
import { price, buy, trapState, hasTrap, hasItem, HATS, HAT_ORDER, saveProfile } from '../meta/profile.js';
import { elTag } from './catinfo.js';
import { trapIcons } from './icons.js';

const $ = (id) => document.getElementById(id);
const PAWS = '<span class="pp">🐾</span>';
const cost = (c) => !c ? '' : c.yarn ? `${c.yarn} yarn` : c.paws ? `${c.paws} ${PAWS}` : 'free';

// One readable line of a trap's working numbers (changes as you upgrade).
export function statLine(P) {
  const out = [];
  if (P.damage) out.push(`${Math.round(P.damage)} dmg`);
  if (P.dps) out.push(P.maxDps ? `${Math.round(P.dps)}–${Math.round(P.maxDps)}/s` : `${Math.round(P.dps)}/s`);
  if (P.launchDamage) out.push(`${Math.round(P.launchDamage)} dmg`);
  if (P.hp) out.push(`${Math.round(P.hp)} hp`);
  if (P.cooldown) out.push(`resets ${P.cooldown.toFixed(1)}s`);
  if (P.recharge) out.push(`recharge ${P.recharge.toFixed(1)}s`);
  if (P.radius) out.push(`radius ${P.radius.toFixed(1)}`);
  if (P.reach) out.push(`reach ${P.reach.toFixed(1)}`);
  if (P.charges) out.push(`${P.charges} charges`);
  if (P.maxHits) out.push(`up to ${P.maxHits}`);
  if (P.swallow) out.push(`drops ${P.swallow}`);
  if (P.rampSecs) out.push(`full heat ${P.rampSecs.toFixed(1)}s`);
  if (P.puddleSecs) out.push(`puddles ${P.puddleSecs.toFixed(1)}s`);
  return out.join(' · ');
}

export function openShop(profile, { sfx, onChange, cat }) {
  const el = $('shop'); el.classList.add('show');
  let tab = 'traps', note = '';
  const icons = trapIcons(TRAP_ORDER);
  const act = (what) => {
    const r = buy(profile, what);
    note = r.msg; sfx && sfx.play(r.ok ? 'sell' : 'deny');
    if (r.ok) { saveProfile(profile); onChange && onChange(); }
    draw();
  };
  function trapCard(k) {
    const d = TRAPS[k], t = trapState(profile, k), own = hasTrap(profile, k), P = trapParams(k, { tier: t.tier, special: t.special });
    let h = `<div class="card ${own ? '' : 'locked'}"><div class="ch">${icons[k] ? `<img src="${icons[k]}" alt="">` : ''}<div><b>${d.name}</b> ${elTag(d.el)}<small>${d.surface} · ${d.cost} ${PAWS} in game</small></div></div>`;
    h += `<p>${d.desc}</p><p class="stat">${statLine(P)}</p>`;
    if (!own) return h + `<button data-buy='${JSON.stringify({ type: 'trap', kind: k })}'>Unlock · ${cost(price(profile, { type: 'trap', kind: k }))}</button></div>`;
    h += `<div class="tier">${[1, 2, 3].map(n => `<i class="${n <= t.tier ? 'on' : ''}">★</i>`).join('')} <span>Tier ${t.tier}</span>`;
    const next = price(profile, { type: 'tier', kind: k });
    if (next) h += ` <button data-buy='${JSON.stringify({ type: 'tier', kind: k })}'>${t.tier === 1 ? '+25% power' : '20% faster reset'} · ${cost(next)}</button>`;
    h += '</div>';
    const sp = SPECIALS[k];
    if (sp) {
      h += '<div class="specials">';
      for (const w of ['a', 'b']) {
        const s = sp[w], on = t.special === w, owned = (t.owned || []).includes(w), c = price(profile, { type: 'special', kind: k, which: w });
        const btn = t.tier < 3 ? '<em>tier 3 first</em>' : on ? '<em>in use</em>' : `<button data-buy='${JSON.stringify({ type: 'special', kind: k, which: w })}'>${owned ? 'Use' : 'Buy · ' + cost(c)}</button>`;
        h += `<div class="sp ${on ? 'on' : ''}"><b>${s.name}</b> ${s.desc} ${btn}</div>`;
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  function itemCard(k) {
    const d = ITEMS[k], own = hasItem(profile, k);
    return `<div class="card ${own ? '' : 'locked'}"><b>${d.name}</b> ${elTag(d.el)}<p>${d.desc}</p><p class="stat">cooldown ${d.cd}s</p>` +
      (own ? '<em>unlocked</em>' : `<button data-buy='${JSON.stringify({ type: 'item', kind: k })}'>Unlock · ${cost(price(profile, { type: 'item', kind: k }))}</button>`) + '</div>';
  }
  function hatCard(k) {
    const d = HATS[k], own = profile.hats.includes(k), worn = profile.worn[cat()] === k;
    return `<div class="card ${own ? '' : 'locked'}"><b>${d.name}</b><p class="stat">${d.yarn} yarn</p>` +
      (own ? `<button data-buy='${JSON.stringify({ type: 'wear', kind: k, cat: cat() })}'>${worn ? 'Take off' : 'Wear on ' + CATS[cat()].name}</button>` : `<button data-buy='${JSON.stringify({ type: 'hat', kind: k })}'>Buy · ${d.yarn} yarn</button>`) + '</div>';
  }
  function draw() {
    const list = tab === 'traps' ? TRAP_ORDER.map(trapCard) : tab === 'items' ? ITEM_ORDER.map(itemCard) : HAT_ORDER.map(hatCard);
    el.innerHTML = `<h1>The Larder Shop</h1><p class="wallet"><b>${profile.paws}</b> paw prints · <b>${profile.yarn}</b> yarn${profile.sandbox ? ' · <i>sandbox: nothing is saved</i>' : ''}</p>` +
      `<p class="dim">Paw prints: 1 per 3 waves cleared, your rating when you win, and a bonus for the first win on each map. Yarn: from bosses.</p>` +
      `<div class="tabs">${[['traps', 'Traps'], ['items', 'Items'], ['hats', 'Hats']].map(([k, n]) => `<button class="${tab === k ? 'picked' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>` +
      `<p class="note">${note}</p><div class="cards">${list.join('')}</div><button class="play" id="shopback">Back</button>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; note = ''; sfx && sfx.play('click'); draw(); });
    el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => act(JSON.parse(b.dataset.buy)));
    $('shopback').onclick = () => { el.classList.remove('show'); sfx && sfx.play('click'); onChange && onChange(); };
  }
  draw();
}
