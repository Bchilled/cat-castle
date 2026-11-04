# Changelog

## 0.2.1 — 2026-11-03
Fixed
- Camera sat low and close so the cat covered the crosshair; it now sits higher over the right shoulder with the cat low-left in frame. `src/render/scene.js` camera block (~lines 337–356).
- Attacks didn't go where the crosshair pointed; the cat now turns to face the crosshair target, so claws, bites and pounces land where you aim. `src/main.js` sendInput (~lines 96–110).
- Furniture drawn bigger than its collision (coal scuttle, log basket, boot tunnel) so you seemed to walk through it; visuals now match. Removed tabletop props that had no collision. `src/render/models.js` furniture cases.
Added
- Faint claw-reach wedge on the floor in front of the cat, brighter while holding claw. `src/render/models.js` catRig; `src/render/scene.js` cat sync.

## 0.2.0 — 2026-11-03
Mouse-scale rebuild: Map 1 is now the castle entrance hall, seen at real size by cats and mice.

Added
- Entrance hall map from Brent's sketch: mice squeeze under the great front door (Y), cross the doormat and flagstones, cross a rainwater drain on a yardstick, chew through a book wedged in the furniture line, then weave between a side table, blanket chest, coal scuttle, suit of armour and long bench to the gap under the inner door (X). Half-tile grid so traps fit in quarters and sit flush against furniture. Tables, benches and an old boot are overhangs you walk under (ceiling traps hang there) and stand on. Climbing crates. Three cheese stashes. `src/sim/map.js` lines 1–143.
- Two playable cats: Fred (fast, agile, double jump + wall kick) and Puddin (big long-haired calico, tanky, slow, no double jump, pounce that stuns). `src/config.js` lines 36–75; `src/render/models.js` lines 39–112.
- Every third claw hit is a bite; hairball ranged attack (right click) with splash + slow; Puddin's pounce (Shift); energy pool that powers them; ability cooldowns. `src/sim/sim.js` lines 374–495, 665–686.
- Three new traps: glue pad, tack strip, hairdryer (blows mice back, combos with the drain). Trap footprints in half-tiles, R rotates any trap, wall/ceiling traps snap to the surface you aim at. `src/config.js` lines 90–99; `src/sim/sim.js` lines 185–260, 687–754; `src/render/models.js` lines 115–176.
- Swarms of tiny weak pups mixed into every wave. `src/sim/waves.js` lines 7–31; `src/config.js` lines 78–86.
- Roguelike trinkets: rare drops (bosses always) that stack for the run, including cooldown reducers. `src/config.js` lines 106–118; `src/sim/sim.js` lines 262–295.
- Harsher flippers and physics splats: mice hit hard by landings or furniture take damage and leave splat marks. `src/sim/sim.js` lines 551–590.
- Placement that would seal every route is refused ("Leave them a way through"); mice still chew barricades when that's cheaper. `src/sim/sim.js` lines 197–223.
- HUD: whisker crosshair (left whiskers health, right whiskers energy), ability cooldown icons with bite pips, square radar top right, trinket icons, 8-slot trap bar, controls panel bottom right (H hides). `src/ui/hud.js` lines 1–133; `index.html` lines 1–124.
- Rendering: furniture models, drain and yardstick, doors with daylight gap and glowing exit, ceiling beams far overhead, wall lights, instanced mice (hundreds on screen), claw swipe and bite animations, boss HP bars, decals, low close camera with wall pull-in. `src/render/scene.js` lines 1–419.
- Input: left click claw, right click hairball or place trap, Shift pounce, 1–8 traps, R rotate, wide look up/down, crosshair raycast onto floors, walls and ceilings. `src/main.js` lines 1–137.

Changed
- Currency is sardines (cheese trades for sardines at a stash). Traps sell for full price; chewed barricades refund by health left. Barricade is a solid 1-unit wooden toy block.
- Claw damage +50%, Fred runs faster. Pitch range widened.
- Flow fields now run on the fine grid with a separate route for big bosses (can't fit under low benches or through one-cell gaps). `src/sim/path.js` lines 1–104.
- Tests rewritten for the new map and features (30 checks). `tests/sim-test.mjs` lines 1–146.

Fixed
- Claw swipe showed behind the cat; now paws lash forward with scratch streaks in front.
- Couldn't look up to place ceiling traps.
- Kitchen exit was invisible and sat in an outer wall; now a glowing gap under the inner door, marked on the radar.

Removed
- Outdoor castle map, stone gate, castle walls/towers (stairs to towers are moot: you climb furniture instead).

## 0.1.0 — 2026-11-03
First playable prototype.

Added
- Castle map from Brent's sketch: forest road from the burrow (Y), moat and drawbridge, gate, walled courtyard with stables, blacksmith, well house, chapel and barracks, kitchen mouse hole (X), cheese stall beside the hole. `src/sim/map.js` lines 1–118.
- Path of least resistance: flow field from the kitchen hole weighing distance, trap danger and chew cost; recalculates on every trap/barricade/gate change; no diagonal squeezing past barricades; sealed lanes get chewed through. `src/sim/path.js` lines 1–107.
- Game rules (fixed 30 Hz, seeded, command-driven for future co-op): waves, gate that falls in a few hits and stays down, wave-6 siege lobber, mice types (mouse, runner, tank, lobber, mini boss, big boss rat), cheese drops/carry/sell, lives (−1 mouse, −5 boss, −3 cat death), drowning, stranded mice dying over time, cat physics (double jump, wall kick, step-up), claw with bleed stacks, trap behaviours, Fred's bleeped barks. `src/sim/sim.js` lines 1–542.
- Wave builder and paw-print rating (base 1–5 from lives, bonus for no traps / never hit; no-abilities and no-energy bonuses shown locked until abilities exist). `src/sim/waves.js` lines 1–38.
- Tunables (costs, HP, speeds, rules). `src/config.js` lines 1–69.
- Low-poly grubby models built in code with outlines: Fred (ginger, white snowball patch, chewed ear), mice and bosses, five traps, cheese. `src/render/models.js` lines 1–144.
- Renderer: tile ground, moat, walls, towers, gate fall animation, buildings, awnings/walkways for ceiling traps, trees, rocks, burrow, stall, trap animations, particles, over-shoulder camera with wall pull-in, crosshair aiming and placement ghost. `src/render/scene.js` lines 1–339.
- HUD: lives/coins/yarn, wave status, HP and cheese, trap bar, prompts, subtitles, end screen with paw prints. `src/ui/hud.js` lines 1–60.
- Input, game loop, saved profile (paw prints, yarn). `src/main.js` lines 1–112.
- Single-player transport (swap point for co-op). `src/net/local.js` lines 1–11.
- Page, styles, menu (24 waves / Endless) and controls. `index.html` lines 1–82.
- Headless rules tests. `tests/sim-test.mjs` lines 1–97; `package.json` line 1.

Notes
- Physics is our own lightweight height-field physics instead of the Rapier engine planned earlier: deterministic for multiplayer, no extra download, and covers launches, arcs, wall bounces, fall damage and drowning.
- Not yet built: unlock shop for paw prints, yarn crafting, energy/abilities, co-op networking, sound.
