// profile.js — what you keep between runs: paw prints, yarn, unlocked traps and items,
// trap upgrades (tier + chosen special) and hats. Pure data + rules (no DOM), so the
// shop rules are tested headless like the game rules.
//
// Earning: every run pays 1 paw print per 3 waves cleared; a win also pays its paw-print
// rating, and the first win on each map pays a bonus. Bosses drop yarn.
// Spending: paw prints unlock traps and items and buy trap upgrades; yarn buys hats.

import { TRAPS, TRAP_ORDER, ITEMS, ITEM_ORDER, STARTER_TRAPS, STARTER_ITEMS, UPGRADE, SPECIALS, CAT_ORDER } from '../config.js';

const KEY = 'catcastle.profile';

// Unlock prices in paw prints (starters are free). Pricier = stronger or more specialised.
export const UNLOCK = {
  traps: { glove: 6, bucket: 5, oilslick: 5, flypaper: 5, hotplate: 8, icetray: 8, bellows: 8, flowerpot: 8, candle: 10, hypno: 10, forkdarts: 10, rollingpin: 10, salt: 10, skull: 14 },
  items: { catnip: 5, flea: 6, squeaky: 6, bell: 6, pistol: 5, matches: 7, holy: 8 },
};
export const HATS = {
  paper:  { name: 'Paper Crown',      yarn: 1 },
  party:  { name: 'Party Hat',        yarn: 1 },
  flower: { name: 'Flower Crown',     yarn: 2 },
  beanie: { name: 'Propeller Beanie', yarn: 2 },
  chef:   { name: "Chef's Hat",       yarn: 2 },
  pirate: { name: 'Pirate Hat',       yarn: 3 },
  tophat: { name: 'Top Hat',          yarn: 3 },
  viking: { name: 'Viking Helmet',    yarn: 4 },
  wizard: { name: 'Wizard Hat',       yarn: 4 },
  crown:  { name: 'Golden Crown',     yarn: 5 },
};
export const HAT_ORDER = Object.keys(HATS);
export const FIRST_WIN_BONUS = 5;

export function freshProfile() {
  return { paws: 0, yarn: 0, traps: {}, items: [], hats: [], worn: {}, wins: {}, runs: 0 };
}
// Older saves only had { paws, yarn }: fill in the rest.
export function normalise(p) {
  const f = freshProfile(), out = { ...f, ...(p || {}) };
  for (const k of ['traps', 'worn', 'wins']) out[k] = { ...f[k], ...((p && p[k]) || {}) };
  for (const k of ['items', 'hats']) out[k] = Array.isArray(p && p[k]) ? [...p[k]] : [];
  return out;
}
export function loadProfile() {
  try { return normalise(JSON.parse(localStorage.getItem(KEY))); } catch { return freshProfile(); }
}
export function saveProfile(p) {
  if (p.sandbox) return;                                  // sandbox (?sandbox): try everything, keep nothing
  try { localStorage.setItem(KEY, JSON.stringify({ ...p, sandbox: undefined })); } catch { /* private window */ }
}
// ?sandbox in the URL: everything unlocked, plenty of currency, nothing saved. For trying things out.
export function sandboxProfile() {
  const p = freshProfile(); p.sandbox = true; p.paws = 999; p.yarn = 99;
  for (const k of TRAP_ORDER) p.traps[k] = { unlocked: true, tier: 1, owned: [], special: null };
  p.items = [...ITEM_ORDER]; return p;
}

// ---- what you have ----
export const trapState = (p, k) => p.traps[k] || { unlocked: STARTER_TRAPS.includes(k), tier: 1, owned: [], special: null };
export const hasTrap = (p, k) => STARTER_TRAPS.includes(k) || !!(p.traps[k] && p.traps[k].unlocked);
export const hasItem = (p, k) => STARTER_ITEMS.includes(k) || p.items.includes(k);
export const unlockedTraps = (p) => TRAP_ORDER.filter(k => hasTrap(p, k));
export const unlockedItems = (p) => ITEM_ORDER.filter(k => hasItem(p, k));
// The upgrade state the sim needs: { kind: { tier, special } } for every trap you have.
export function upgradesFor(p) {
  const out = {};
  for (const k of TRAP_ORDER) { const t = trapState(p, k); if (t.tier > 1 || t.special) out[k] = { tier: t.tier, special: t.special }; }
  return out;
}

// ---- prices ----
// What a purchase costs: { paws } or { yarn }, or null if it isn't for sale right now.
export function price(p, what) {
  const { type, kind } = what;
  if (type === 'trap') return hasTrap(p, kind) ? null : { paws: UNLOCK.traps[kind] ?? UPGRADE.unlock };
  if (type === 'item') return hasItem(p, kind) ? null : { paws: UNLOCK.items[kind] ?? 6 };
  if (type === 'tier') { const t = trapState(p, kind); if (!hasTrap(p, kind) || t.tier >= 3) return null; return { paws: t.tier === 1 ? UPGRADE.tier2 : UPGRADE.tier3 }; }
  if (type === 'special') {
    const t = trapState(p, kind); if (!hasTrap(p, kind) || t.tier < 3 || !SPECIALS[kind] || !SPECIALS[kind][what.which]) return null;
    return (t.owned || []).includes(what.which) ? { paws: 0 } : { paws: UPGRADE.special };   // owned ones swap for free
  }
  if (type === 'hat') return p.hats.includes(kind) || !HATS[kind] ? null : { yarn: HATS[kind].yarn };
  return null;
}
// Buy (or swap a special, or wear a hat). Returns { ok, msg }. Mutates p; caller saves.
export function buy(p, what) {
  const { type, kind } = what;
  if (type === 'wear') {                                   // wear (or take off) an owned hat on a cat
    if (kind && !p.hats.includes(kind)) return { ok: false, msg: "You don't own that hat" };
    if (!CAT_ORDER.includes(what.cat)) return { ok: false, msg: 'No such cat' };
    p.worn[what.cat] = p.worn[what.cat] === kind ? null : kind; return { ok: true, msg: kind && p.worn[what.cat] ? `${HATS[kind].name} on` : 'Hat off' };
  }
  const c = price(p, what);
  if (!c) return { ok: false, msg: type === 'special' && trapState(p, kind).tier < 3 ? 'Upgrade to tier 3 first' : 'Not for sale' };
  if ((c.paws || 0) > p.paws) return { ok: false, msg: `Needs ${c.paws} paw prints` };
  if ((c.yarn || 0) > p.yarn) return { ok: false, msg: `Needs ${c.yarn} yarn` };
  p.paws -= c.paws || 0; p.yarn -= c.yarn || 0;
  const t = () => (p.traps[kind] = { ...trapState(p, kind), owned: [...(trapState(p, kind).owned || [])] });
  switch (type) {
    case 'trap': { const s = t(); s.unlocked = true; return { ok: true, msg: `${TRAPS[kind].name} unlocked` }; }
    case 'item': p.items.push(kind); return { ok: true, msg: `${ITEMS[kind].name} unlocked` };
    case 'tier': { const s = t(); s.unlocked = true; s.tier++; return { ok: true, msg: `${TRAPS[kind].name}: tier ${s.tier}` }; }
    case 'special': { const s = t(); if (!s.owned.includes(what.which)) s.owned.push(what.which); s.special = what.which; return { ok: true, msg: `${TRAPS[kind].name}: ${SPECIALS[kind][what.which].name}` }; }
    case 'hat': p.hats.push(kind); return { ok: true, msg: `${HATS[kind].name} bought` };
  }
  return { ok: false, msg: '?' };
}

// ---- earning ----
// What a finished run pays. waves = waves cleared.
export function runReward(p, { won, waves, rating, yarn, map }) {
  const lines = [];
  const forWaves = Math.floor(waves / 3); if (forWaves) lines.push([`${waves} waves cleared`, forWaves]);
  if (won && rating) lines.push(['Paw-print rating', rating.total]);
  if (won && !p.wins[map]) lines.push(['First win on this map', FIRST_WIN_BONUS]);
  const paws = lines.reduce((a, [, n]) => a + n, 0);
  return { paws, yarn: yarn || 0, lines };
}
export function applyReward(p, r, { won, map }) {
  p.paws += r.paws; p.yarn += r.yarn; p.runs = (p.runs || 0) + 1;
  if (won) p.wins[map] = (p.wins[map] || 0) + 1;
}
