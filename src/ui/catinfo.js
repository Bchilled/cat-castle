// catinfo.js — the words for each cat: role, blurb, ability names and notes.
// Used by the cat-select menu and the in-game ability panel.

export const CAT_INFO = {
  fred: {
    role: 'Ranged · fast · fragile',
    blurb: 'Scruffy ginger alley tom with a mouth on him.',
    abil: [['Left click', 'Spitball', 'rapid fire, makes them bleed'], ['Right click', 'Hairball', 'arcing splash, slows'], ['Space', 'Double Jump', 'plus two wall kicks']],
  },
  puddin: {
    role: 'Melee tank · slow',
    blurb: 'Enormous long-haired calico. Posh, lazy, always hungry.',
    abil: [['Left click', 'Chomp', 'a killing bite eats the mouse and heals'], ['Right click', 'Pounce', 'leap in, splat and stun'], ['Space', 'Belly Flop', 'hold to charge, flings mice']],
  },
  scary: {
    role: 'Reach melee · crowd control · fragile',
    blurb: 'Scrawny, beat-up black cat. Bad luck on four legs.',
    abil: [['Left click', 'Tail Whip', 'long, narrow, hits 4 in a line'], ['Right click', 'Hiss', 'arches up, mice scatter in fear'], ['Space', 'High Jump', 'jumps higher than anyone'], ['Shift', 'Leap Back', 'backflip out of trouble']],
  },
  nebbie: {
    role: 'Ranged support · evasive',
    blurb: 'Sleek, clever grey cat. Always three moves ahead.',
    abil: [['Left click', 'Whisker Darts', 'fast, pierce through 3 mice'], ['Right click', 'Purr', 'heals over time + buffs cats nearby'], ['Space', 'Long Jump', 'low and far'], ['Passive', 'Dodge', '30% of hits miss her']],
  },
  casper: {
    role: 'Brawler · tank · draws aggro',
    blurb: 'Pure-white pedigree show cat with a terrifying temper.',
    abil: [['Left click', 'Claws', 'fast swipes, every hit builds rage'], ['Right click', 'Frenzy', '3 s of all-round fury'], ['Space ×2', 'Leap Strike', 'jump, then leap forward and smash'], ['Passive', 'Rage', 'up to +100% damage; mice target him first']],
  },
  meow: {
    role: 'Control support · fast',
    blurb: 'Friendly grey outdoor cat with a white beard. Kills you nicely.',
    abil: [['Left click', 'Sticky Burrs', 'slows, 4 hits = asleep'], ['Right click', 'Big Yawn', 'mice nearby nod off, cats get buffed'], ['Space', 'Triple Jump', 'three jumps, runs fast'], ['Passive', 'Catnap', 'stand still: nap + heal']],
  },
};
