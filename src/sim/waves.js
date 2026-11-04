// waves.js — what spawns each wave, plus the end-of-map paw-print rating.
// Rules from Brent: 24 waves wins the map, mini boss every 6th wave, big boss
// rat every 12th (it replaces the mini boss on 12 and 24), endless keeps going.
// Waves are swarms: lots of tiny weak pups mixed with the bigger types.
// Wave 6 also brings a siege lobber if the gate is somehow still standing.

export function buildWave(n, rng, gateUp) {
  const list = [];
  const pups = Math.min(220, 12 + n * 8);
  const others = Math.min(60, 4 + n * 2);
  for (let i = 0; i < others; i++) {
    const r = rng();
    let type = 'mouse';
    if (n >= 5 && r < Math.min(0.25, 0.06 + n * 0.008)) type = 'tank';
    else if (n >= 3 && r < 0.35) type = 'runner';
    list.push(type);
  }
  for (let i = 0; i < pups; i++) list.splice(Math.floor(rng() * (list.length + 1)), 0, 'pup');
  if (n === 6 && gateUp) list.unshift('lobber');      // guaranteed gate breaker
  if (n % 12 === 0) list.push('bigboss');
  else if (n % 6 === 0) list.push('miniboss');
  return {
    queue: list,
    // Pups pour in fast; the gap shrinks a little each wave.
    interval: Math.max(0.12, 0.4 - n * 0.01),
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
    { name: 'No abilities (hairball, pounce)', got: stats.abilitiesUsed === 0 },
    { name: 'No energy used', got: stats.energyUsed === 0 },
  ];
  return { base, bonus, total: base + bonus.filter(b => b.got).length };
}
