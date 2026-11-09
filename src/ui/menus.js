// menus.js — (v0.32) the menu screens, in the order you see them:
//   title (Continue / New game / Multiplayer) -> multiplayer (host or join) -> choose your cat
//   -> choose a map (only once you've opened more than one) -> your traps -> Play.
// The wallet (paw prints, yarn) sits in the top-right corner on every one of them.
// Only what you've unlocked is ever shown: locked traps, items, maps and hats don't appear.
// The rules (what's unlocked, prices) are in meta/profile.js; this file is only the screens.

import * as THREE from 'three';
import { TRAPS, ITEMS, CATS, CAT_ORDER, SLOTS, STARTER_TRAPS, SPECIALS, DIFFICULTY, DIFFICULTY_ORDER, RULES, trapParams, ATTACK_EL } from '../config.js';
import { MAPS } from '../sim/map.js';
import { CAT_INFO, elTag } from './catinfo.js';
import { portraitURL, svgPortraitURL, fullArtURL } from './portraits.js';
import { trapIcons } from './icons.js';
import { makeCat } from '../render/models.js';
import { unlockedTraps, unlockedItems, unlockedMaps, trapState, price, buy, saveProfile, HATS, HAT_ORDER, hasProgress } from '../meta/profile.js';

const $ = (id) => document.getElementById(id);
const PAWS = '<span class="pp">🐾</span>';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

// One readable line of a trap's working numbers (changes as you upgrade).
export function statLine(P) {
  const out = [];
  if (P.damage) out.push(`${Math.round(P.damage)} damage`);
  if (P.dps) out.push(P.maxDps ? `${Math.round(P.dps)}–${Math.round(P.maxDps)} damage a second` : `${Math.round(P.dps)} damage a second`);
  if (P.launchDamage) out.push(`${Math.round(P.launchDamage)} damage`);
  if (P.hp) out.push(`${Math.round(P.hp)} health`);
  if (P.cooldown) out.push(`resets in ${P.cooldown.toFixed(1)}s`);
  if (P.recharge) out.push(`recharges in ${P.recharge.toFixed(1)}s`);
  if (P.radius) out.push(`radius ${P.radius.toFixed(1)}`);
  if (P.reach) out.push(`reach ${P.reach.toFixed(1)}`);
  if (P.charges) out.push(`${P.charges} charges`);
  if (P.maxHits) out.push(`hits up to ${P.maxHits}`);
  return out.join(', ');
}
const SIZE = (d) => { const w = d.size[0] / 4, h = Math.max(1, d.size[1] / 4); return d.surface === 'wall' ? `${w} tile${w > 1 ? 's' : ''} of wall` : `${w}×${h} tile${w * h > 1 ? 's' : ''}`; };
// Bars on the cat screen (0..1 of the best cat at it). Jumping counts extra jumps and wall kicks.
const jumpScore = (d) => d.jumpVel * (1 + 0.5 * d.airJumps) + (d.wallKick ? 2 : 0) + (d.longJump ? 2 : 0);
const BARS = [
  ['Health', (d) => d.maxHp], ['Speed', (d) => d.speed], ['Jumping', jumpScore], ['Energy', (d) => d.maxEnergy + d.energyRegen * 3],
];
const BEST = BARS.map(([, f]) => Math.max(...CAT_ORDER.map(k => f(CATS[k]))));
// A slot with nothing to show yet (only when every trap that fits is somehow gone).
const EMPTY = '<span class="noimg"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#7a5a46" stroke-width="2" stroke-dasharray="3 3"/></svg></span>';

// ctx: { profile, sfx, onPlay(), onBack(screen) , isGuest(), onKitChange() }
export function initMenus(ctx) {
  const { sfx } = ctx;
  const P = () => ctx.profile;
  const click = (ok = true) => sfx && sfx.play(ok ? 'click' : 'deny');
  const state = {
    cat: CAT_ORDER.includes(load('catcastle.cat', 'fred')) ? load('catcastle.cat', 'fred') : 'fred',
    map: load('catcastle.map', 'entrance'), diff: DIFFICULTY[load('catcastle.diff', 'normal')] ? load('catcastle.diff', 'normal') : 'normal',
    slots: load('catcastle.loadout', []), item: load('catcastle.item', 'laser'),
  };
  let screen = null;

  // ----- wallet -----
  const wallet = () => { $('w-paws').textContent = P().paws; $('w-yarn').textContent = P().yarn; };

  // ----- loadout: one trap per slot kind, only unlocked ones -----
  // Saved as [floor, ceiling, wall, barricade]; older saves (a list of up to 8) are sorted in.
  function fixKit() {
    const have = unlockedTraps(P()), old = Array.isArray(state.slots) ? state.slots : [];
    state.slots = SLOTS.map((sl, i) => {
      const fits = (k) => k && TRAPS[k] && have.includes(k) && sl.fits(TRAPS[k], k);
      if (fits(old[i])) return old[i];
      return old.find(fits) || have.find(k => STARTER_TRAPS.includes(k) && fits(k)) || have.find(fits) || null;   // nothing saved: the starter
    });
    if (!unlockedItems(P()).includes(state.item)) state.item = unlockedItems(P())[0];
    if (!unlockedMaps(P()).includes(state.map)) state.map = unlockedMaps(P()).slice(-1)[0];
  }
  const saveKit = () => { save('catcastle.loadout', state.slots); save('catcastle.item', state.item); ctx.onKitChange && ctx.onKitChange(); };

  // ----- screens -----
  function go(id) {
    screen = id;
    for (const el of document.querySelectorAll('.screen')) el.classList.toggle('show', el.id === id);
    document.body.classList.toggle('menus', !!id && id !== 'intro');
    preview.on(id === 'pickcat');
    if (id === 'title') drawTitle();
    if (id === 'pickcat') drawCats();
    if (id === 'pickmap') drawMaps();
    if (id === 'kit') drawKit();
    wallet();
  }

  // ----- title -----
  function drawTitle() {
    const can = !!(hasProgress(P()) || P().sandbox);
    $('t-continue').hidden = !can; $('t-confirm').hidden = true;
    $('t-new').classList.toggle('quiet', can);
  }
  $('t-continue').onclick = () => { click(); ctx.solo(); go('pickcat'); };
  $('t-new').onclick = () => {
    click();
    if (hasProgress(P()) && !P().sandbox) { $('t-confirm').hidden = false; return; }
    ctx.solo(); go('pickcat');
  };
  $('t-keep').onclick = () => { click(); $('t-confirm').hidden = true; };
  $('t-wipe').onclick = () => { click(); ctx.wipe(); fixKit(); ctx.solo(); go('pickcat'); };
  $('t-mp').onclick = () => { click(); go('mp'); };
  $('mp-back').onclick = () => { click(); ctx.solo(); go('title'); };
  $('mp-next').onclick = () => { click(); go('pickcat'); };

  // ----- choose your cat -----
  // The big picture: Kanye's full-body art (assets/portraits/web/<cat>-full.webp); until it has
  // loaded (or if it's missing), the cat's 3D model turning.
  const preview = (() => {
    const cv = $('catview');
    let r = null, sc, cam, model = null, live = false, raf = 0;
    const setup = () => {
      r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffe8d0, 0x3a2a1c, 2.2));
      const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(2, 3, 3); sc.add(dl);
      cam = new THREE.PerspectiveCamera(30, cv.width / cv.height, 0.1, 50);
    };
    const tick = (t) => {
      if (!live) return;
      if (model) { model.rotation.y = 0.6 + Math.sin(t / 2200) * 0.7; if (model.userData.tail) model.userData.tail.rotation.z = Math.sin(t / 400) * 0.3; }
      r.render(sc, cam); raf = requestAnimationFrame(tick);
    };
    return {
      on(v) { if (v === live) return; live = v; if (v) { if (!r) setup(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf); },
      show(kind) {
        if (!r) setup();
        if (model) sc.remove(model);
        model = makeCat(kind, P().worn[kind]); sc.add(model);
        for (const k of ['reach', 'rage']) if (model.userData[k]) model.userData[k].visible = false;   // no attack markers on the menu
        const big = kind === 'puddin';
        cam.position.set(0, big ? 1.3 : 1.0, big ? 5.2 : 4.0); cam.lookAt(0, big ? 0.65 : 0.5, 0);
      },
      dispose() { live = false; cancelAnimationFrame(raf); if (r) r.dispose(); r = null; },
    };
  })();
  // Roster cards: Kanye's portraits, the old drawn ones if an image is missing.
  const tryImg = (img, src, fallback) => { img.onerror = () => { img.onerror = null; fallback(); }; img.src = src; };
  function drawCats() {
    const ro = $('roster');
    if (!ro.children.length) {
      ro.innerHTML = CAT_ORDER.map(k => `<button class="who" data-cat="${k}" style="--collar:${CATS[k].collar}"><img alt=""><span>${CATS[k].name}</span><small>${CAT_INFO[k].role.split(' · ')[0]}</small></button>`).join('');
      ro.querySelectorAll('[data-cat]').forEach(b => {
        const img = b.querySelector('img'), k = b.dataset.cat;
        tryImg(img, portraitURL(k), () => { img.src = svgPortraitURL(k); });
        b.onclick = () => { click(); pickCat(k); };
      });
    }
    pickCat(state.cat);
  }
  let hatNote = '';
  function pickCat(k) {
    state.cat = k; save('catcastle.cat', k);
    document.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x.dataset.cat === k));
    const d = CATS[k], info = CAT_INFO[k], el = (a) => elTag(ATTACK_EL[a]);
    $('hero').style.setProperty('--collar', d.collar); $('heroart').style.setProperty('--collar', d.collar);
    const img = $('heroimg'), cv = $('catview');
    img.hidden = true; cv.hidden = false; preview.show(k);
    img.onload = () => { if (state.cat === k) { img.hidden = false; cv.hidden = true; } };
    img.onerror = () => {}; img.src = fullArtURL(k);
    // Moves, by what they are (not which button: the game shows that).
    const moves = [['Attack', info.pri, el(d.primary)], ['Special', info.sec, el(d.secondary)], ['Special', info.e, el(d.ability2)], ['Jump', info.jump, ''], ...(info.passive ? [['Always on', info.passive, '', 'passive']] : [])];
    let h = `<h3>${d.name}</h3><p class="role">${info.role.replace(/ · /g, ', ')}</p><p class="blurb">${info.blurb}</p>`;
    h += '<div class="stats">' + BARS.map(([name, f], i) => `<span>${name}</span><div class="meter" role="img" aria-label="${name} ${Math.round(100 * f(d) / BEST[i])} out of 100"><i style="width:${Math.max(8, 100 * f(d) / BEST[i])}%"></i></div>`).join('') + '</div>';
    h += '<div class="moves">' + moves.map(([what, [name, note], tag, cls]) => `<div class="move ${cls || ''}"><b>${name} ${tag}</b><span>${what}: ${note}</span></div>`).join('') + '</div>';
    // Hats: only once you've got yarn (bosses drop it) or a hat.
    const p = P();
    if (p.yarn > 0 || p.hats.length) {
      h += `<div class="hats"><h4>Hats</h4>` + HAT_ORDER.map(hk => {
        const own = p.hats.includes(hk), worn = p.worn[k] === hk;
        if (own) return `<button class="quiet ${worn ? 'on' : ''}" data-wear="${hk}">${HATS[hk].name}${worn ? ' (on)' : ''}</button>`;
        return `<button class="quiet" data-hat="${hk}" ${HATS[hk].yarn > p.yarn ? 'disabled' : ''}>${HATS[hk].name}: ${HATS[hk].yarn} yarn</button>`;
      }).join('') + `<div class="note">${hatNote}</div></div>`;
    }
    $('heroinfo').innerHTML = h; hatNote = '';
    $('heroinfo').querySelectorAll('[data-hat]').forEach(b => b.onclick = () => { const r = buy(p, { type: 'hat', kind: b.dataset.hat }); hatNote = r.msg; sfx && sfx.play(r.ok ? 'sell' : 'deny'); if (r.ok) { buy(p, { type: 'wear', kind: b.dataset.hat, cat: k }); saveProfile(p); } wallet(); pickCat(k); });
    $('heroinfo').querySelectorAll('[data-wear]').forEach(b => b.onclick = () => { const r = buy(p, { type: 'wear', kind: b.dataset.wear, cat: k }); hatNote = r.msg; click(); saveProfile(p); pickCat(k); });
    ctx.onKitChange && ctx.onKitChange();
  }
  $('cat-back').onclick = () => { click(); go(ctx.isCoop() ? 'mp' : 'title'); };
  $('cat-next').onclick = () => { click(); go(unlockedMaps(P()).length > 1 && !ctx.isGuest() ? 'pickmap' : 'kit'); };

  // ----- choose a map (only maps you've opened) -----
  function drawMaps() {
    const maps = unlockedMaps(P());
    if (!maps.includes(state.map)) state.map = maps[maps.length - 1];
    $('maplist').innerHTML = maps.map(k => {
      const best = P().best[k] || 0, wins = P().wins[k] || 0;
      return `<button class="mapc ${k === state.map ? 'on' : ''}" data-map="${k}">${MAPS[k].name}<small>${MAPS[k].twist}</small><em>${wins ? `Won ${wins === 1 ? 'once' : wins + ' times'}` : best ? `Best: wave ${best} of ${RULES.winWave}` : 'Not played yet'}</em></button>`;
    }).join('');
    $('maplist').querySelectorAll('[data-map]').forEach(b => b.onclick = () => { state.map = b.dataset.map; save('catcastle.map', state.map); click(); drawMaps(); });
  }
  $('map-back').onclick = () => { click(); go('pickcat'); };
  $('map-next').onclick = () => { click(); go('kit'); };

  // ----- your traps -----
  let open = 0, note = '';   // open = the slot being changed (0-3 traps, 4 = item)
  function drawKit() {
    fixKit();
    const kinds = state.slots.filter(Boolean), icons = trapIcons(kinds.concat(unlockedTraps(P())));
    let h = '';
    SLOTS.forEach((sl, i) => {
      const k = state.slots[i];
      h += `<button class="kslot ${open === i ? 'on' : ''}" data-slot="${i}"><span class="key">${i + 1}</span><span class="kind"><img src="assets/ui/web/${sl.id}.webp" alt="">${sl.name}</span>${k && icons[k] ? `<img src="${icons[k]}" alt="">` : EMPTY}${k ? TRAPS[k].name : 'Nothing yet'}</button>`;
    });
    h += `<button class="kslot ${open === 4 ? 'on' : ''}" data-slot="4"><span class="key">Q</span><span class="kind">Item</span>${EMPTY}${ITEMS[state.item] ? ITEMS[state.item].name : 'None'}</button>`;
    $('kslots').innerHTML = h;
    $('kslots').querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { open = +b.dataset.slot; note = ''; click(); drawKit(); });
    // What can go in the open slot (only what you've unlocked), and the picked one in detail.
    let opts, title, pick;
    if (open < 4) {
      const sl = SLOTS[open];
      opts = unlockedTraps(P()).filter(k => sl.fits(TRAPS[k], k)); pick = state.slots[open]; title = `${sl.name} traps`;
    } else { opts = unlockedItems(P()); pick = state.item; title = 'Items'; }
    let o = `<div class="kopts"><h3>${title}</h3><div class="kgrid">` + opts.map(k => open < 4
      ? `<button class="kopt ${k === pick ? 'on' : ''}" data-opt="${k}">${icons[k] ? `<img src="${icons[k]}" alt="">` : ''}${TRAPS[k].name}<span class="tag">${'★'.repeat(trapState(P(), k).tier)}</span></button>`
      : `<button class="kopt ${k === pick ? 'on' : ''}" data-opt="${k}">${ITEMS[k].name}<span class="tag">every ${ITEMS[k].cd}s</span></button>`).join('') + '</div>';
    if (opts.length < 2) o += `<p class="none">${open < 4 ? 'More traps for this slot unlock as you get further.' : 'More items unlock as you get further.'}</p>`;
    o += '</div><div class="kdetail">' + (open < 4 ? trapDetail(pick) : itemDetail(pick)) + `<p class="knote">${note}</p></div>`;
    $('kpick').innerHTML = o;
    $('kpick').querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
      if (open < 4) state.slots[open] = b.dataset.opt; else state.item = b.dataset.opt;
      note = ''; click(); saveKit(); drawKit();
    });
    $('kpick').querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const r = buy(P(), JSON.parse(b.dataset.buy)); note = r.msg; sfx && sfx.play(r.ok ? 'sell' : 'deny');
      if (r.ok) { saveProfile(P()); saveKit(); } wallet(); drawKit();
    });
    drawDiff();
    const guest = ctx.isGuest();
    $('play').disabled = guest || !state.slots.some(Boolean);
    $('play').textContent = guest ? 'Waiting for the host' : 'Play';
  }
  const cost = (c) => !c ? '' : c.yarn ? `${c.yarn} yarn` : c.paws ? `${c.paws} ${PAWS}` : 'free';
  function trapDetail(k) {
    if (!k) return '<p>Nothing unlocked for this slot yet.</p>';
    const d = TRAPS[k], t = trapState(P(), k), prm = trapParams(k, { tier: t.tier, special: t.special });
    let h = `<h3>${d.name} ${elTag(d.el)}</h3><p class="meta">${SIZE(d)}, costs ${d.cost} Paw Points to build</p><p>${d.desc}</p><p class="stat">${statLine(prm)}</p>`;
    // Upgrades (paw prints): tier 2 = +25% power, tier 3 = resets 20% faster, then a special.
    h += `<div class="stars">${[1, 2, 3].map(n => `<span class="${n <= t.tier ? 'on' : ''}">★</span>`).join('')}<small>Tier ${t.tier}</small></div>`;
    const next = price(P(), { type: 'tier', kind: k });
    if (next) h += `<button data-buy='${JSON.stringify({ type: 'tier', kind: k })}' ${next.paws > P().paws ? 'disabled' : ''}>Upgrade: ${t.tier === 1 ? '+25% power' : 'resets 20% faster'} (${cost(next)})</button>`;
    const sp = SPECIALS[k];
    if (sp && t.tier >= 3) for (const w of ['a', 'b']) {
      const s = sp[w], on = t.special === w, owned = (t.owned || []).includes(w), c = price(P(), { type: 'special', kind: k, which: w });
      h += `<div class="spc ${on ? 'on' : ''}"><b>${s.name}</b>${s.desc} ` + (on ? '<em>In use</em>' : `<button data-buy='${JSON.stringify({ type: 'special', kind: k, which: w })}' ${c && c.paws > P().paws ? 'disabled' : ''}>${owned ? 'Use this' : 'Buy (' + cost(c) + ')'}</button>`) + '</div>';
    }
    else if (sp) h += '<p class="meta">At tier 3 it gets one of two specials.</p>';
    return h;
  }
  function itemDetail(k) {
    const d = ITEMS[k]; if (!d) return '';
    return `<h3>${d.name} ${elTag(d.el)}</h3><p class="meta">Use it with Q, then it takes ${d.cd}s to come back</p><p>${d.desc}</p>`;
  }
  function drawDiff() {
    $('diffseg').innerHTML = DIFFICULTY_ORDER.map(k => `<button class="${k === state.diff ? 'on' : ''}" data-diff="${k}" ${ctx.isGuest() ? 'disabled' : ''}>${DIFFICULTY[k].name}</button>`).join('');
    $('diffnote').textContent = ctx.isGuest() ? 'The host picks the difficulty.' : DIFFICULTY[state.diff].desc;
    $('diffseg').querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { state.diff = b.dataset.diff; save('catcastle.diff', state.diff); click(); drawDiff(); });
  }
  $('kit-back').onclick = () => { click(); go(unlockedMaps(P()).length > 1 && !ctx.isGuest() ? 'pickmap' : 'pickcat'); };
  $('play').onclick = () => { if ($('play').disabled) { click(false); return; } click(); ctx.onPlay(); };

  fixKit();
  return {
    go, wallet, state, fixKit, preview,
    get screen() { return screen; },
    loadout: () => state.slots.filter(Boolean),
    refreshKit: () => { if (screen === 'kit') drawKit(); },
  };
}
