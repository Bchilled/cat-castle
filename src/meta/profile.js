// profile.js — what you keep between runs: paw prints, yarn, the furthest wave cleared on
// each map (which decides what's unlocked), trap upgrades (tier + chosen special) and hats.
// Pure data + rules (no DOM), so the rules are tested headless like the game rules.
//
// Unlocking (v0.32): traps, items and maps are earned, never bought, and nothing you haven't
// earned is shown anywhere. Clearing wave 4, 8, 12, 16, 20 and 24 on a map for the first time
// unlocks that map's next trap (config UNLOCKS); 12 and 24 also an item; a win (wave 24) opens
// the next map.
// Earning: every run pays 1 paw print per 3 waves cleared; a win also pays its paw-print
// rating, and the first win on each map pays a bonus. Bosses drop yarn.
// Spending: paw prints buy trap upgrades (tier 2, tier 3, specials); yarn buys hats.

import { TRAPS, TRAP_ORDER, ITEMS, ITEM_ORDER, STARTER_TRAPS, STARTER_ITEMS, OLD_STARTER_TRAPS, OLD_STARTER_ITEMS, UNLOCKS, UPGRADE, SPECIALS, CAT_ORDER, DIFFICULTY, RULES } from '../config.js';
import { MAP_ORDER } from '../sim/map.js';

const KEY = 'catcastle.profile';
const VERSION = 2;   // 2 = v0.32 (earned unlocks)

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

// best: { map: furthest wave cleared there }. traps[k].unlocked / items: unlocks kept from
// saves before v0.32 (when they were bought).
export function freshProfile() {
  return { v: VERSION, paws: 0, yarn: 0, best: {}, traps: {}, items: [], hats: [], worn: {}, wins: {}, runs: 0 };
}
// Older saves: fill in what's missing. A save from before v0.32 keeps everything it had: the
// old eight starter traps and three items, and whatever it bought; a map it won counts as
// cleared to wave 24.
export function normalise(p) {
  const f = freshProfile(), out = { ...f, ...(p || {}) };
  for (const k of ['traps', 'worn', 'wins', 'best']) out[k] = { ...f[k], ...((p && p[k]) || {}) };
  for (const k of ['items', 'hats']) out[k] = Array.isArray(p && p[k]) ? [...p[k]] : [];
  if (p && (p.v || 1) < 2) {
    for (const k of OLD_STARTER_TRAPS) out.traps[k] = { tier: 1, owned: [], special: null, ...(out.traps[k] || {}), unlocked: true };
    for (const k of OLD_STARTER_ITEMS) if (!out.items.includes(k)) out.items.push(k);
    for (const m in out.wins) if (out.wins[m]) out.best[m] = Math.max(out.best[m] || 0, RULES.winWave);
  }
  out.v = VERSION;
  return out;
}
export function loadProfile() {
  try { const raw = localStorage.getItem(KEY); return raw ? normalise(JSON.parse(raw)) : freshProfile(); } catch { return freshProfile(); }
}
export function saveProfile(p) {
  if (p.sandbox) return;                                  // sandbox (?sandbox): try everything, keep nothing
  try { localStorage.setItem(KEY, JSON.stringify({ ...p, sandbox: undefined })); } catch { /* private window */ }
}
// New Game: forget everything (the caller confirms first).
export function wipeProfile() {
  try { localStorage.removeItem(KEY); for (const k of ['catcastle.loadout', 'catcastle.item', 'catcastle.map']) localStorage.removeItem(k); } catch { /* private window */ }
  return freshProfile();
}
// Anything to continue? (The title screen only offers Continue if so.)
export const hasProgress = (p) => (p.runs || 0) > 0 || Object.keys(p.best).length > 0;
// ?sandbox in the URL: everything unlocked, plenty of currency, nothing saved. For trying things out.
export function sandboxProfile() {
  const p = freshProfile(); p.sandbox = true; p.paws = 999; p.yarn = 99;
  for (const m of MAP_ORDER) p.best[m] = RULES.winWave;
  for (const k of TRAP_ORDER) p.traps[k] = { unlocked: true, tier: 1, owned: [], special: null };
  p.items = [...ITEM_ORDER]; return p;
}

// ---- what you have ----
// Every milestone reached so far: [{ map, wave, trap?, item? }].
export function milestones(p) {
  const out = [];
  for (const m of MAP_ORDER) for (const [w, u] of Object.entries(UNLOCKS[m] || {})) if ((p.best[m] || 0) >= +w) out.push({ map: m, wave: +w, ...u });
  return out;
}
const earnedTraps = (p) => new Set(milestones(p).map(u => u.trap).filter(Boolean));
const earnedItems = (p) => new Set(milestones(p).map(u => u.item).filter(Boolean));
export const trapState = (p, k) => ({ tier: 1, owned: [], special: null, ...(p.traps[k] || {}), unlocked: hasTrap(p, k) });
export const hasTrap = (p, k) => STARTER_TRAPS.includes(k) || !!(p.traps[k] && p.traps[k].unlocked) || earnedTraps(p).has(k);
export const hasItem = (p, k) => STARTER_ITEMS.includes(k) || p.items.includes(k) || earnedItems(p).has(k);
export const unlockedTraps = (p) => TRAP_ORDER.filter(k => hasTrap(p, k));
export const unlockedItems = (p) => ITEM_ORDER.filter(k => hasItem(p, k));
// Maps you can play: the entrance, and each map after one you've won.
export const unlockedMaps = (p) => MAP_ORDER.filter((m, i) => i === 0 || (p.best[MAP_ORDER[i - 1]] || 0) >= RULES.winWave || p.wins[MAP_ORDER[i - 1]]);
// The unlock waiting at this wave on this map, if it's the first time you get there.
export function unlockAt(p, map, wave) {
  const u = UNLOCKS[map] && UNLOCKS[map][wave];
  if (!u || (p.best[map] || 0) >= wave) return null;
  const out = {};
  if (u.trap && !hasTrap(p, u.trap)) out.trap = u.trap;
  if (u.item && !hasItem(p, u.item)) out.item = u.item;
  const i = MAP_ORDER.indexOf(map);
  if (wave >= RULES.winWave && MAP_ORDER[i + 1] && !unlockedMaps(p).includes(MAP_ORDER[i + 1])) out.map = MAP_ORDER[i + 1];
  return Object.keys(out).length ? out : null;
}
// The upgrade state the sim needs: { kind: { tier, special } } for every trap you have.
export function upgradesFor(p) {
  const out = {};
  for (const k of TRAP_ORDER) { const t = trapState(p, k); if (t.tier > 1 || t.special) out[k] = { tier: t.tier, special: t.special }; }
  return out;
}

// ---- prices ----
// What a purchase costs: { paws } or { yarn }, or null if it isn't for sale right now.
// Traps and items aren't for sale (v0.32: they're earned); upgrades and hats are.
export function price(p, what) {
  const { type, kind } = what;
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
  const t = () => { const s = trapState(p, kind); return (p.traps[kind] = { ...s, owned: [...(s.owned || [])] }); };
  switch (type) {
    case 'tier': { const s = t(); s.tier++; return { ok: true, msg: `${TRAPS[kind].name}: tier ${s.tier}` }; }
    case 'special': { const s = t(); if (!s.owned.includes(what.which)) s.owned.push(what.which); s.special = what.which; return { ok: true, msg: `${TRAPS[kind].name}: ${SPECIALS[kind][what.which].name}` }; }
    case 'hat': p.hats.push(kind); return { ok: true, msg: `${HATS[kind].name} bought` };
  }
  return { ok: false, msg: '?' };
}

// A wave cleared mid-run: remember it straight away (so a milestone counts even if you quit
// later) and say what that unlocked, same shape as applyReward. Caller saves.
export function noteWave(p, map, wave) {
  const t0 = unlockedTraps(p), i0 = unlockedItems(p), m0 = unlockedMaps(p);
  p.best[map] = Math.max(p.best[map] || 0, wave);
  return { traps: unlockedTraps(p).filter(k => !t0.includes(k)), items: unlockedItems(p).filter(k => !i0.includes(k)), maps: unlockedMaps(p).filter(k => !m0.includes(k)) };
}

// ---- earning ----
// What a finished run pays. waves = waves cleared; paid = waves already paid for this run
// (endless after a win: the win paid for 24, this pays for the rest).
export function runReward(p, { won, waves, rating, yarn, map, difficulty = 'normal', paid = 0 }) {
  const lines = [];
  const forWaves = Math.floor(waves / 3) - Math.floor(paid / 3);
  if (forWaves > 0) lines.push([paid ? `${waves - paid} more waves cleared` : `${waves} waves cleared`, forWaves]);
  if (won && rating) lines.push(['Paw-print rating', rating.total]);
  if (won && !p.wins[map]) lines.push(['First win on this map', FIRST_WIN_BONUS]);
  let paws = lines.reduce((a, [, n]) => a + n, 0);
  const mul = (DIFFICULTY[difficulty] || DIFFICULTY.normal).paws;
  if (mul !== 1 && paws) { const extra = Math.round(paws * mul) - paws; lines.push([`${DIFFICULTY[difficulty].name} difficulty`, extra]); paws += extra; }
  return { paws, yarn: yarn || 0, lines };
}
// Pay out, remember the furthest wave, and say what that unlocked:
// { traps: [...], items: [...], maps: [...] } (new this time).
// again = the endless part of a run already paid once (it isn't another run).
export function applyReward(p, r, { won, map, waves = 0, again = false }) {
  const t0 = unlockedTraps(p), i0 = unlockedItems(p), m0 = unlockedMaps(p);
  p.paws += r.paws; p.yarn += r.yarn; if (!again) p.runs = (p.runs || 0) + 1;
  if (won) p.wins[map] = (p.wins[map] || 0) + 1;
  p.best[map] = Math.max(p.best[map] || 0, won ? Math.max(waves, RULES.winWave) : waves);
  return { traps: unlockedTraps(p).filter(k => !t0.includes(k)), items: unlockedItems(p).filter(k => !i0.includes(k)), maps: unlockedMaps(p).filter(k => !m0.includes(k)) };
}
