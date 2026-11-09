import { CATS, ATTACK_EL, ELEMENTS } from '../config.js';
// catinfo.js — the words for each cat: role, blurb, and the name + one-line note for
// each of their moves. Every cat has the same layout: left-click attack, right-click
// ability, E ability, a jump, and (some) a passive. Used by the menu and the HUD.

export const CAT_INFO = {
  fred: {
    role: 'Ranged · fast · fragile',
    blurb: 'Scruffy ginger alley tom with a mouth on him.',
    pri: ['Spitball', 'rapid single shots, each one bleeds'], sec: ['Hack-up', 'coughs up a soggy furball that bowls mice over and leaves a wet trail'],
    e: ['Alley Dash', 'dart forward slashing all you pass'], jump: ['Double Jump', 'plus two wall kicks'],
  },
  puddin: {
    role: 'Melee tank · slow',
    blurb: 'Enormous long-haired calico. Posh, lazy, always hungry.',
    pri: ['Chomp', 'one heavy bite; a kill eats and heals'], sec: ['Pounce', 'leap in, splat and stun'],
    e: ['Big Sit', 'flatten and pin mice, take half damage'], jump: ['Belly Flop', 'hold to charge, flings mice'],
  },
  scary: {
    role: 'Reach melee · crowd control · fragile',
    blurb: 'Scrawny, beat-up black cat. Bad luck on four legs.',
    pri: ['Tail Whip', 'one long lash, hits 4 in a line'], sec: ['Hiss', 'arches up, mice scatter in fear'],
    e: ['Leap Back', 'backflip out of trouble'], jump: ['High Jump', 'jumps higher than anyone'],
  },
  nebbie: {
    role: 'Ranged support · evasive',
    blurb: 'Sleek, clever grey cat. Always three moves ahead.',
    pri: ['Whisker Darts', 'single darts that pierce 3 mice'], sec: ['Purr', 'heals over time + buffs cats nearby'],
    e: ['Tinker', 'resets nearby traps, +25% damage'], jump: ['Long Jump', 'low and far'],
    passive: ['Dodge', '30% of hits miss her'],
  },
  casper: {
    role: 'Brawler · tank · draws aggro',
    blurb: 'Pure-white pedigree show cat with a terrifying temper.',
    pri: ['Claws', 'flurry of swipes, every hit builds rage'], sec: ['Frenzy', '3 s of all-round fury'],
    e: ['Show Off', 'every mouse nearby comes for him; takes less'], jump: ['Leap Strike', 'jump, then Space again to smash'],
    passive: ['Rage', 'up to +100% damage; mice target him first'],
  },
  meow: {
    role: 'Control support · fast',
    blurb: 'Friendly grey outdoor cat with a white beard. Kills you nicely.',
    pri: ['Sticky Burrs', 'single burrs; slow, 4 hits = asleep'], sec: ['Big Yawn', 'mice nearby nod off, cats get buffed'],
    e: ['Groom', 'heal the most-hurt cat nearby 30%'], jump: ['Triple Jump', 'three jumps, runs fast'],
    passive: ['Catnap', 'stand still: nap and heal'],
  },
  mimo: {
    role: 'Ranged hunter · debuffer',
    blurb: "Frisky tabby tom. Neutered. Still thinks he's a lion.",
    pri: ['Pebble Flick', 'single pebbles, x2 vs ranged mice'], sec: ['Lion Roar', 'everything nearby takes +35%, birds drop'],
    e: ['Sky Swipe', 'spring at the nearest bird'], jump: ['Double Jump', 'two jumps'],
    passive: ['Bird Hunter', 'x3 damage to birds'],
  },
};

// Rows for the menu's detail panel: [key, name, note, element].
export const abilityRows = (k) => {
  const c = CAT_INFO[k], d = CATS[k];
  return [['Left click', ...c.pri, ATTACK_EL[d.primary]], ['Right click', ...c.sec, ATTACK_EL[d.secondary]], ['E', ...c.e, ATTACK_EL[d.ability2]], ['Space', ...c.jump, null], ...(c.passive ? [['Passive', ...c.passive, null]] : [])];
};
// Little coloured element tag, e.g. <span class="el">Fire</span>.
export const elTag = (el) => el && ELEMENTS[el] ? `<span class="el" style="color:${ELEMENTS[el].color};border-color:${ELEMENTS[el].color}">${ELEMENTS[el].name}</span>` : '';
