// waves.js — what spawns each wave, plus the end-of-map paw-print rating.
// Rules from Brent: 24 waves wins the map, mini boss every 6th wave, big boss
// rat every 12th (it replaces the mini boss on 12 and 24), endless keeps going.
// Mice come in mobs: packs of 6–15 that leave the hole together, with the odd
// straggler wandering out on its own between packs.
// Wave 6 also brings a siege lobber if the gate is somehow still standing.

// Queue entries: { type, gap, pack } — gap = seconds until the next entry.
export function buildWave(n, rng, gateUp) {
  const pool = [];
  const pups = Math.min(220, 12 + n * 8);
  const others = Math.min(60, 4 + n * 2);
  for (let i = 0; i < others; i++) {
    const r = rng();
    let type = 'mouse';
    if (n >= 5 && r < Math.min(0.25, 0.06 + n * 0.008)) type = 'tank';
    else if (n >= 3 && r < 0.35) type = 'runner';
    pool.push(type);
  }
  for (let i = 0; i < pups; i++) pool.splice(Math.floor(rng() * (pool.length + 1)), 0, 'pup');

  const queue = [];
  if (n === 6 && gateUp) queue.push({ type: 'lobber', gap: 2, pack: 1 });   // guaranteed gate breaker
  while (pool.length) {
    if (rng() < 0.12) { queue.push({ type: pool.shift(), gap: 0.8 + rng() * 1.2, pack: 1 }); continue; }   // straggler
    const size = Math.min(pool.length, 6 + Math.floor(rng() * 10));
    for (let k = 0; k < size; k++) queue.push({ type: pool.shift(), gap: k === size - 1 ? Math.max(2.2, 5 - n * 0.1) + rng() : 0.04, pack: size });
  }
  if (n % 12 === 0) queue.push({ type: 'bigboss', gap: 0, pack: 1 });
  else if (n % 6 === 0) queue.push({ type: 'miniboss', gap: 0, pack: 1 });
  return {
    queue,
    // HP grows each wave; endless keeps scaling past 24.
    hpMul: 1 + 0.045 * (n - 1) + (n > 24 ? 0.08 * (n - 24) : 0),
  };
}

// Paw-print rating: base 1–5 from lives left; bonus paws for optional challenges.
export function ratePaws(lives, stats) {
  const base = Math.max(1, Math.min(5, 5 - Math.floor((20 - lives) / 4)));
  const bonus = [
    { name: 'No traps', got: stats.trapsPlaced === 0 },
    { name: 'Never got hit', got: stats.damageTaken === 0 },
    { name: 'No right-click abilities', got: stats.abilitiesUsed === 0 },
    { name: 'No energy used', got: stats.energyUsed === 0 },
  ];
  return { base, bonus, total: base + bonus.filter(b => b.got).length };
}
