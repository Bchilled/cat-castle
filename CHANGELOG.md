# Changelog

## 0.4.3 — 2026-11-07
Fixed
- Route arrows pointed backward (toward the entrances); they now point the way the mice run. `src/render/scene.js` buildRoute().
- Puddin's bite cone sat mostly under his body so it looked beside/behind him; it now starts at his nose and is brighter. Bite reach raised 1.4 → 2.1 (from his centre) so it actually reaches past his face. `src/render/models.js` catRig; `src/config.js` CAT.biteRange; `src/render/scene.js` cat sync.
Added
- Kenney Castle Kit (CC0) models in `assets/castle-kit/` (added by Kanye; not wired in yet).

## 0.4.2 — 2026-11-03
Changed
- Starting sardines 300 → 1000 (enough for ~15–20 traps on the first build). `src/config.js` RULES.
- Clearing a wave pays 100 + 10 × wave number sardines, on top of tails. `src/config.js` RULES; `src/sim/sim.js` stepPhase().

## 0.4.1 — 2026-11-03
Fixed
- White stripes in front of the cat: leftover claw-scratch streaks were being forced visible every frame by the camera-fade code. Streaks removed; fade now only touches the body. `src/render/models.js` catRig; `src/render/scene.js` camera block.
- Traps were scaring mice off their route (every trap added path cost), so in wide lanes mice just walked around them and ceiling traps rarely fired. Only barricades and the gate shape the route now. `src/config.js` TRAPS (pathCost 0).
- Bug zapper reach 1.3 → 2.4 and draws lightning down to each mouse it hits. `src/config.js`; `src/sim/sim.js` stepTraps; `src/render/scene.js` onEvent.
Changed
- Fred is smaller and leaner (85% size, slimmer body) to read as the fast, agile one. `src/render/models.js` makeFred.
Added (not wired in yet)
- Procedural textures (stone blocks, cobbles, dirt, bark, plaster, slate, planks, leaves) and a world-space triplanar material for the upcoming castle art pass. `src/render/textures.js` lines 1–150.

## 0.4.0 — 2026-11-03
New, much bigger Map 1 built on trap-defense level-design lessons (our own layout).

Added
- Map is now 96 x 120 units (was 48 x 80): two entrances (stump holes Y1/Y2) on 10-wide walled forest roads, each with a hollow-log roof, meeting in a clearing (kill room) before a 14-wide log bridge over the moat; a 16-wide gatehouse hall with a 9-high roof; a big courtyard kill room with a well and raised walkways on both sides (crates to climb); three ways north (roofed colonnade with pillars, roofed passage through the guardhouse, open lane past hay bales and a cart); exit hole mid north wall. `src/sim/map.js` lines 1–171.
- Packs alternate entrances; route preview shows both routes on the floor and radar. `src/sim/sim.js` routes(), stepPhase(), spawnMouse().
- Roofs fade out while you or the camera are under them so you can see the fight. `src/render/scene.js` render().
- New furniture models: well, walkways, crates, colonnade with pillars, cart. `src/render/models.js` makeFurniture().

Changed
- Pathfinding ~4x faster (typed-array heap, precomputed trap costs) and no longer re-paths on every chew, only when a blocker breaks. `src/sim/path.js` lines 16–75; `src/sim/sim.js` updateFlow().
- Tests moved to the new map (31 checks). `tests/sim-test.mjs`.

Removed
- The narrow 4-wide tunnel map from 0.3.0.

## 0.3.0 — 2026-11-03
Working core for one map: corridor-style castle entrance, two distinct cats, tails economy, mobs.

Added
- New Map 1, the castle entrance as walled lanes: arched mouse hole in a stump (Y), forest road walled by roots/rocks/bushes with a hollow-log roofed stretch, real moving moat water crossed on a fallen branch, wooden board jammed in the portcullis gap (gate, with a cat-sized hole), roofed stone gatehouse tunnel, guard yard splitting into a roofed lane under a long bench (barrels as its wall) and a lane between the guardhouse and hay bales, a gallery roof before the arched mouse hole into the great hall (X). Barrels and bales are cat walkways. `src/sim/map.js` lines 1–155.
- Fred kit: hold left click to spit pellets (light damage, each adds bleed), right click big hairball, double jump, wall kicks, auto-mantle onto ledges, 70 HP, fastest. Puddin kit: hold left click to bite (heavy; a killing bite eats the mouse — heals 15% on a 6 s cooldown, no tail), right click pounce with stun, hold Space to charge a leap whose landing flings small mice, 200 HP, slow. `src/config.js` lines 37–90; `src/sim/sim.js` lines 387–570.
- Tails replace cheese: dead mice drop tails, cats carry and trade them at tail stashes for sardines; traded tails get pegged on the stash line. `src/sim/sim.js` lines 290–330; `src/render/scene.js` stash lines.
- Mobs: waves spawn in packs of 6–15 plus stragglers; mice push apart, slide along walls, spread across lanes; a mouse with 5+ packmates nearby is 20% faster and takes 15% less damage; flung mice bowl over others; cats shove through crowds (Puddin harder). `src/sim/waves.js` lines 1–48; `src/sim/sim.js` lines 619–780.
- Visible mouse route: glowing chevrons on the floor (bright in build phase) and a line on the radar, updated whenever traps change the route. `src/sim/sim.js` lines 184–195; `src/render/scene.js` buildRoute/updateRoute; `src/ui/hud.js` drawRadar.
- Responsive tail: idle sway, lifts and swishes when running, flicks on turns, droops when hurt; crouch when charging, stretch when pouncing. `src/render/scene.js` cat sync.
- Splash page with both cats turning on their cards; mouse-wheel camera zoom. `index.html`; `src/main.js` lines 1–45.

Changed
- Every visible solid now sits inside its collider (furniture art rebuilt to fit; stashes have full-height colliders; forest hedge is exactly as tall as its collision).
- Camera further back over the right shoulder (Fred 5.5, Puddin 6.5, wheel zooms 2.5–10); the cat fades if the camera is pushed right up against it.
- Ranged attacks always fire toward the crosshair, even at nothing (previously hairballs silently failed beyond ~20 units).
- Version number removed from every screen.
- Tests rewritten for the new map and kits (29 checks). `tests/sim-test.mjs` lines 1–147.

Fixed
- Infinite wall kicks let Fred climb out of the map: wall kicks now refresh only on landing, can't repeat on the same wall, and nothing goes above the wall tops.

Removed
- Entrance-hall household map (drain, yardstick, book gate), Shift pounce key, claw for Fred, bite-every-third-hit.

## 0.2.2 — 2026-11-03
Changed
- Hairball nerfed: damage 22 → 12, splash radius 1.4 → 1.0, energy cost 25 → 35, cooldown 0.6 → 1.2 s. Slow unchanged. `src/config.js` CAT block (~lines 44–51).

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
