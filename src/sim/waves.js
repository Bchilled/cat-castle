// waves.js — what spawns each wave, plus the end-of-map paw-print rating.
// Rules from Brent: 24 waves wins the map, mini boss every 6th wave, big boss
// rat every 12th (it replaces the mini boss on 12 and 24), endless keeps going.
// Mice come in mobs: packs of 6–15 that leave the hole together, with the odd
// straggler wandering out on its own between packs.
// Wave 6 also brings a siege lobber if the gate is somehow still standing.
import { MICE } from '../config.js';

// What each new kind does — shown when it first appears.
export const INTRO_TEXT = {
  magpie: 'steals your Cheese Chunks and pecks Paw Points off cats. Shoot it down.',
  crow: 'carries mice over your traps and drops them near the hole. Kill it in the air and they fall to their deaths.',
  miniboss: 'huge, fast, and it STOMPS. Red ring on the floor = get out.',
  bigboss: 'the King Rat himself. Bigger stomp. Bring everything.',
  runner: 'quick and flimsy. Glue Traps and Snappers love it.',
  splitter: 'bursts into two Pinkies when killed. Have Puddin eat her and they never come out.',
  tank: 'tough and slow, shrugs off claws. Chews through Poison Boxes fast. Weak to electricity.',
  plague: 'spits plague at cats from range. Immune-ish to poison; fire and holy hurt it. Kill it first.',
  fatty: "huge, slow, and full of mice. Don't ask. Burns well.",
  scout: 'runs ahead of the pack. Where a scout dies, the pack remembers, and finds another way.',
  ghost: 'claws and poison pass right through it. Holy and psychic tear it apart.',
};

// Queue entries: { type, gap, pack, intro? } — gap = seconds until the next entry.
// New kinds are introduced one at a time: on its intro wave the newcomer walks out ALONE
// at the start (with a long gap so you can watch it), and stays out of that wave's mobs.
// From the next wave on it mixes into the packs.
const KINDS = [   // [type, weight once introduced]
  ['scout', 0], ['runner', 0.5], ['splitter', 0.35], ['tank', 0.3], ['plague', 0.25], ['fatty', 0.12], ['ghost', 0.2],   // scouts lead packs instead (below)
];
export function buildWave(n, rng, gateUp, opts = {}) {
  const pool = [];
  const pups = Math.min(220, 12 + n * 8);
  const others = Math.min(60, 4 + n * 2);
  const live = KINDS.filter(([t]) => MICE[t].intro < n);           // already introduced
  const total = 1 + live.reduce((a, [, w]) => a + w, 0);
  for (let i = 0; i < others; i++) {
    let r = rng() * total, type = 'mouse';
    for (const [t, w] of live) { if (r < w) { type = t; break; } r -= w; }
    pool.push(type);
  }
  for (let i = 0; i < pups; i++) pool.splice(Math.floor(rng() * (pool.length + 1)), 0, 'pup');

  const queue = [];
  const fresh = KINDS.filter(([t]) => MICE[t].intro === n);
  for (const [t] of fresh) queue.push({ type: t, gap: 9, pack: 1, intro: true });   // the newcomer, alone
  if (n === 6 && gateUp) queue.push({ type: 'lobber', gap: 2, pack: 1 });          // guaranteed gate breaker
  while (pool.length) {
    if (rng() < 0.12) { queue.push({ type: pool.shift(), gap: 0.8 + rng() * 1.2, pack: 1 }); continue; }   // straggler
    const size = Math.min(pool.length, 6 + Math.floor(rng() * 10));
    if (n > MICE.scout.intro && size >= 6) queue.push({ type: 'scout', gap: 0.04, pack: size });   // a scout runs at the front of every big pack
    for (let k = 0; k < size; k++) queue.push({ type: pool.shift(), gap: k === size - 1 ? Math.max(2.2, 5 - n * 0.1) + rng() : 0.04, pack: size });
  }
  // Birds: a few per wave once introduced, slipped in mid-wave. The first ever comes alone.
  for (const bt of opts.birds === false ? [] : ['magpie', 'crow']) {      // no birds indoors
    const b0 = MICE[bt].intro; if (n < b0) continue;
    const count = n === b0 ? 1 : 1 + Math.floor((n - b0) / 4);
    for (let k = 0; k < count; k++) {
      const at = Math.min(queue.length, Math.floor(queue.length * (0.2 + 0.6 * rng())));
      queue.splice(n === b0 ? 0 : at, 0, { type: bt, gap: n === b0 ? 6 : 0.3, pack: 1, intro: n === b0 && k === 0 });
    }
  }
  // Bosses come last with an escort mob right behind them.
  const boss = n % 12 === 0 ? 'bigboss' : n % 6 === 0 ? 'miniboss' : null;
  if (boss) {
    queue.push({ type: boss, gap: 1.5, pack: 1, intro: n === 6 || n === 12 });
    for (let k = 0; k < 10 + n; k++) queue.push({ type: k % 4 ? 'pup' : 'mouse', gap: 0.05, pack: 10 + n });
  }
  return {
    queue,
    // HP grows each wave; endless keeps scaling past 24.
    hpMul: 1 + 0.045 * (n - 1) + (n > 24 ? 0.08 * (n - 24) : 0),
  };
}

// Paw-print rating: base 1–5 from lives left; bonus paws for optional challenges.
// start = lives you began with (difficulty changes it): lose a fifth of them per paw.
export function ratePaws(lives, stats, start = 20) {
  const base = Math.max(1, Math.min(5, 5 - Math.floor((start - lives) / (start / 5))));
  const bonus = [
    { name: 'No traps', got: stats.trapsPlaced === 0 },
    { name: 'Never got hit', got: stats.damageTaken === 0 },
    { name: 'No right-click abilities', got: stats.abilitiesUsed === 0 },
    { name: 'No energy used', got: stats.energyUsed === 0 },
  ];
  return { base, bonus, total: base + bonus.filter(b => b.got).length };
}

// What the next wave holds, for the HUD during the build phase. Uses a fixed
// stand-in random so it never touches the game's own random sequence.
export function previewWave(n, gateUp, opts = {}) {
  let seed = n * 7919 + 1; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const { queue } = buildWave(n, rng, gateUp, opts);
  const counts = {};
  for (const e of queue) counts[e.type] = (counts[e.type] || 0) + 1;
  return {
    total: queue.length,
    fresh: queue.filter(e => e.intro && !MICE[e.type].boss).map(e => MICE[e.type].name),
    boss: queue.filter(e => MICE[e.type].boss).map(e => MICE[e.type].name)[0] || null,
    counts,
  };
}
