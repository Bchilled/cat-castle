// traps.js — the Traps & Items screen (like Orcs Must Die 2's spellbook). One place to see
// every trap, unlock it, upgrade it and choose which 8 you bring (keys 1–8), plus your item.
//
// Top: your 8 trap slots and the item slot. Click a slot to pick it (it's where the next trap
// goes), × empties it. Below: every trap grouped by where it goes (floor, wall, ceiling,
// table tops), then the items; locked ones show their price. Click one to see it on the right:
// what it does, its numbers, Unlock, tier upgrades, specials, and "Put in slot N".
// The rules (prices, what you own) are in meta/profile.js; this file is only the screen.

import { TRAPS, TRAP_ORDER, ITEMS, ITEM_ORDER, SPECIALS, LOADOUT_SIZE, trapParams } from '../config.js';
import { price, buy, trapState, hasTrap, hasItem, saveProfile } from '../meta/profile.js';
import { elTag } from './catinfo.js';
import { trapIcons } from './icons.js';
import { statLine } from './shop.js';

const $ = (id) => document.getElementById(id);
const PAWS = '<span class="pp">🐾</span>';
const cost = (c) => !c ? '' : c.yarn ? `${c.yarn} yarn` : c.paws ? `${c.paws} ${PAWS}` : 'free';
const SIZE = (d) => { const w = d.size[0] / 4, h = Math.max(1, d.size[1] / 4); return d.surface === 'wall' ? `${w} tile${w > 1 ? 's' : ''} of wall` : `${w}×${h} tile${w * h > 1 ? 's' : ''}`; };
// Where each trap goes. Table-top-only traps get their own group.
export const GROUPS = [
  ['floor', 'Floor', (d) => d.surface === 'floor' && !d.topOnly],
  ['wall', 'Wall', (d) => d.surface === 'wall'],
  ['ceiling', 'Ceiling', (d) => d.surface === 'ceiling'],
  ['top', 'Table tops', (d) => !!d.topOnly],
];

// state: { loadout: [...trap kinds in slot order], item } — changed in place, then save() is called.
export function openTraps(profile, { sfx, state, save, onChange, slot: startSlot = null }) {
  const el = $('traps'); el.classList.add('show');
  const icons = trapIcons(TRAP_ORDER);
  // The slot the next trap goes into: the one you clicked, or the first empty one.
  let slot = startSlot != null ? startSlot : (state.loadout.length < LOADOUT_SIZE ? state.loadout.length : null);
  let pick = startSlot != null && state.loadout[startSlot] ? { type: 'trap', kind: state.loadout[startSlot] } : { type: 'trap', kind: state.loadout[0] || TRAP_ORDER[0] };
  let note = '';
  const click = (ok = true) => sfx && sfx.play(ok ? 'click' : 'deny');
  const changed = () => { save(); onChange && onChange(); };

  function putIn(k) {
    if (slot == null) { note = 'Click a slot at the top first: that is where it goes.'; click(false); return; }
    const was = state.loadout.indexOf(k);
    if (was >= 0) state.loadout.splice(was, 1, ...(slot < state.loadout.length ? [state.loadout[slot]] : []));   // already brought: swap places
    if (slot < state.loadout.length) state.loadout[slot] = k; else state.loadout.push(k);
    state.loadout = state.loadout.filter(Boolean);
    note = `${TRAPS[k].name} is on key ${state.loadout.indexOf(k) + 1}.`;
    slot = state.loadout.length < LOADOUT_SIZE ? state.loadout.length : null;
    click(); changed();
  }
  function takeOut(k) {
    state.loadout = state.loadout.filter(x => x !== k);
    slot = state.loadout.length; note = `${TRAPS[k].name} left behind.`;
    click(); changed();
  }
  function act(what) {
    const r = buy(profile, what);
    note = r.msg; sfx && sfx.play(r.ok ? 'sell' : 'deny');
    if (r.ok) { saveProfile(profile); changed(); }
  }

  function slotsHtml() {
    let h = '<div class="tslots">';
    for (let i = 0; i < LOADOUT_SIZE; i++) {
      const k = state.loadout[i];
      h += `<button class="tslot ${slot === i ? 'sel' : ''} ${k ? '' : 'empty'}" data-slot="${i}" title="${k ? TRAPS[k].name : 'Empty slot'}"><span class="key">${i + 1}</span>` +
        (k ? `${icons[k] ? `<img src="${icons[k]}" alt="">` : ''}<span class="nm">${TRAPS[k].name}</span><i class="x" data-out="${k}" title="Take it out">×</i>` : '<span class="nm">empty</span>') + '</button>';
    }
    const it = ITEMS[state.item];
    h += `<button class="tslot item" data-itemslot="1" title="Your item"><span class="key">Q</span><span class="nm">${it ? it.name : 'none'}</span></button>`;
    return h + '</div>';
  }
  function tile(k) {
    const d = TRAPS[k], own = hasTrap(profile, k), at = state.loadout.indexOf(k), on = pick.type === 'trap' && pick.kind === k;
    const p = own ? null : price(profile, { type: 'trap', kind: k });
    return `<button class="tt ${own ? '' : 'locked'} ${on ? 'on' : ''}" data-pick="${k}" title="${d.name}">` +
      (icons[k] ? `<img src="${icons[k]}" alt="">` : '') + `<span class="nm">${d.name}</span>` +
      (at >= 0 ? `<span class="in">${at + 1}</span>` : '') + (own ? '' : `<span class="lock">🔒 ${cost(p)}</span>`) + '</button>';
  }
  function itemTile(k) {
    const d = ITEMS[k], own = hasItem(profile, k), on = pick.type === 'item' && pick.kind === k;
    const p = own ? null : price(profile, { type: 'item', kind: k });
    return `<button class="tt item ${own ? '' : 'locked'} ${on ? 'on' : ''}" data-pickitem="${k}" title="${d.name}"><span class="nm">${d.name}</span>` +
      (state.item === k ? '<span class="in">Q</span>' : '') + (own ? '' : `<span class="lock">🔒 ${cost(p)}</span>`) + '</button>';
  }
  function detailHtml() {
    if (pick.type === 'item') {
      const k = pick.kind, d = ITEMS[k], own = hasItem(profile, k);
      let h = `<h3>${d.name} ${elTag(d.el)}</h3><small class="dim">Item · Q to use · cooldown ${d.cd}s</small><p>${d.desc}</p>`;
      if (!own) h += `<button data-buy='${JSON.stringify({ type: 'item', kind: k })}'>Unlock · ${cost(price(profile, { type: 'item', kind: k }))}</button>`;
      else h += state.item === k ? '<p class="ok">This is your item.</p>' : `<button class="play" data-useitem="${k}">Take this item</button>`;
      return h;
    }
    const k = pick.kind, d = TRAPS[k], own = hasTrap(profile, k), t = trapState(profile, k), P = trapParams(k, { tier: t.tier, special: t.special });
    let h = `<div class="dh">${icons[k] ? `<img src="${icons[k]}" alt="">` : ''}<div><h3>${d.name} ${elTag(d.el)}</h3><small class="dim">${GROUPS.find(g => g[2](d))[1]} · ${SIZE(d)} · ${d.cost} ${PAWS} to build</small></div></div>`;
    h += `<p>${d.desc}</p><p class="stat">${statLine(P)}</p>`;
    if (!own) return h + `<button class="play" data-buy='${JSON.stringify({ type: 'trap', kind: k })}'>Unlock · ${cost(price(profile, { type: 'trap', kind: k }))}</button><p class="dim">You have ${profile.paws} ${PAWS}. Paw prints come from runs: 1 per 3 waves, more for a win.</p>`;
    const at = state.loadout.indexOf(k);
    if (at >= 0) h += `<p class="ok">On key ${at + 1}.</p><button data-takeout="${k}">Take it out</button>` + (slot != null && slot !== at && slot < state.loadout.length ? ` <button data-putin="${k}">Swap to slot ${slot + 1}</button>` : '');
    else h += slot != null ? `<button class="play" data-putin="${k}">Put in slot ${slot + 1}</button>` : '<p class="dim">All 8 slots are full: click a slot at the top to swap this in.</p>';
    // Upgrades: tier 2 (+25% power), tier 3 (20% faster reset), then one of two specials.
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
    return h;
  }
  function draw() {
    const groups = GROUPS.map(([id, name, f]) => {
      const ks = TRAP_ORDER.filter(k => f(TRAPS[k])), owned = ks.filter(k => hasTrap(profile, k)).length;
      return `<h4>${name} <small>${owned}/${ks.length}</small></h4><div class="tgrid">${ks.map(tile).join('')}</div>`;
    }).join('') + `<h4>Items <small>${ITEM_ORDER.filter(k => hasItem(profile, k)).length}/${ITEM_ORDER.length}</small></h4><div class="tgrid">${ITEM_ORDER.map(itemTile).join('')}</div>`;
    el.innerHTML = `<div class="thead"><h1>Traps &amp; Items</h1><p class="wallet"><b>${profile.paws}</b> paw prints${profile.sandbox ? ' · <i>sandbox: nothing is saved</i>' : ''}</p></div>` +
      `<p class="dim">Your traps for the next map, keys 1–8. Click a slot, then a trap.</p>` + slotsHtml() +
      `<p class="note">${note}</p><div class="tbody"><div class="tlist">${groups}</div><div class="tdetail">${detailHtml()}</div></div>` +
      `<button class="play" id="trapsback">Done</button>`;
    el.querySelectorAll('[data-slot]').forEach(b => b.onclick = (e) => {
      if (e.target.dataset.out) return;            // the × inside the slot
      const i = +b.dataset.slot; slot = Math.min(i, state.loadout.length < LOADOUT_SIZE ? state.loadout.length : LOADOUT_SIZE - 1);
      if (state.loadout[slot]) pick = { type: 'trap', kind: state.loadout[slot] };
      note = ''; click(); draw();
    });
    el.querySelectorAll('[data-out]').forEach(b => b.onclick = (e) => { e.stopPropagation(); takeOut(b.dataset.out); draw(); });
    el.querySelectorAll('[data-itemslot]').forEach(b => b.onclick = () => { pick = { type: 'item', kind: state.item }; note = ''; click(); draw(); });
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { pick = { type: 'trap', kind: b.dataset.pick }; note = ''; click(); draw(); });
    el.querySelectorAll('[data-pickitem]').forEach(b => b.onclick = () => { pick = { type: 'item', kind: b.dataset.pickitem }; note = ''; click(); draw(); });
    // Double-click an owned trap: straight into the picked slot.
    el.querySelectorAll('[data-pick]').forEach(b => b.ondblclick = () => { const k = b.dataset.pick; if (hasTrap(profile, k) && !state.loadout.includes(k)) { putIn(k); draw(); } });
    el.querySelectorAll('[data-putin]').forEach(b => b.onclick = () => { putIn(b.dataset.putin); draw(); });
    el.querySelectorAll('[data-takeout]').forEach(b => b.onclick = () => { takeOut(b.dataset.takeout); draw(); });
    el.querySelectorAll('[data-useitem]').forEach(b => b.onclick = () => { state.item = b.dataset.useitem; note = `${ITEMS[state.item].name} is on Q.`; click(); changed(); draw(); });
    el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { act(JSON.parse(b.dataset.buy)); draw(); });
    $('trapsback').onclick = () => { el.classList.remove('show'); click(); onChange && onChange(); };
  }
  draw();
}
