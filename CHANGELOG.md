# Changelog

## 0.18.0 — 2026-11-07
First-run tips
- A new player gets one short tip at a time in a card on the left, and each clears when you do what it asks: move, press 1 for a Poison Box, place it, put a Snapper on the purple arrows, press G, attack (5 kills), sniff with F, then a last word on Paw Points and the shop. Tips you've already done are skipped (press G early and the build tips stay put until you've built).
- Shown once per browser. "Skip tips" on the card, or on the pause screen, stops them; "Replay tips" on the pause screen starts them over.
- Traps now remember which cat placed them (used to count your own placements in co-op).
- `src/ui/coach.js` (new, 45 lines); `src/main.js` wiring (19, 261–264, 270, 453, 488–492); `index.html` #coach card and style (78–81, 169), pause button (203); `src/sim/sim.js` placeTrap `by` (538).

Tests: 194 checks, all passing (tips advance, skip ahead, finish and replay).

## 0.17.0 — 2026-11-07
Things that fall over
- Tall shelves in the servants' passages (linen shelf, boot rack, pantry shelf) and the cellar (two jar shelves). Hit one four times and it topples:
  - it counts claws, bites, whips, pounces, and pellets or darts that hit it; a barrel rolled into it counts double
  - anything under it is flattened (120 damage, half for bosses); a cat under it takes a knock and is shoved out the nearest open side
  - in the passages it falls right across the corridor and leans on the far wall, so the lane is blocked until the mice chew through it (150 health), or they go another way; in the wider cellar aisles it lies flat and narrows the aisle
  - servants stand it back up at the start of the next wave
  - traps can't go on a shelf's spot or hang on it; its fall area is fine while it stands (a trap it lands on is just covered until the mice chew it away)
- Barrels on the entrance, market, stables, kitchen and cellar maps. Run into one, or hit it (claws, bites, whips, pounces), and it rolls off the way you were going:
  - it flattens each mouse in its path once (30 damage plus more the faster it goes) and flings small survivors aside
  - it bounces off walls, crates and water, then slows to a stop on its side
  - mice walk round a barrel that's standing still; barrels go home at the start of each wave
- Radar: standing shelves in dark brown, barrels as brown dots. Sounds for the knock, the crash with breaking jars, the roll and the bump. The passages description mentions the shelves, and two new menu tips.
- Co-op: shelf states and barrel positions are in the snapshot; the guest's mirror opens a shelf's spot when it falls.
- `src/sim/map.js` SHELVES, BARRELS (241–256, 268), passages twist (177); `src/sim/sim.js` constants (151–153), constructor shelves/barrels/shelfAt (200–211), noBuild and placement (305–307, 494–506), wave-start reset (646–648), hitWorld, meleeWorld, rollBarrel, standShelf, stepFallers (1340–1433), hooks in claw/whip/bite/missiles/pounceLand, breakCrate (2115); `src/render/models.js` makeShelf, makeBarrel (799–852); `src/render/scene.js` shelfFx, barrelFx, drawFallers (304–349), events (636–639); `src/ui/hud.js` radar (143–145); `src/audio/sfx.js` shelfHit, shelfFall, shelfUp, shelfBreak, barrelRoll, barrelHit (245–251); `src/net/coop.js` snapshot and mirrorShelf (141, 184–194); `src/main.js` tips (56–57).

Tests: 192 checks, all passing (toppling by bites and pellets, crushing, blocking, chewing through, standing back up, barrels rolling through a pack and going home, the co-op mirror).

## 0.16.0 — 2026-11-07
Humans (scenery only, out of zone)
- Market, stables and kitchen: the east wall is now a low curb. It still can't be crossed (its collider stays full height). Beyond it is the lit human space, with people walking up and down at full size, about 1.8 m to your cat's 30 cm:
  - shoppers with baskets in the market square
  - stable hands with pitchforks
  - cooks in the kitchen
- They stop and turn now and then, and you can hear their footsteps when they pass close.
- Castle Entrance: guards with spears patrol the tops of the curtain walls and the hall wall.
- The cellar and the servants' passages have no humans: one is dark, the other is inside the walls.
- `src/render/models.js` makeHuman, makeFurniture (low curb drawing); `src/sim/map.js` HUMANS; `src/render/scene.js` buildHumans, stepHumans; `src/audio/sfx.js` footstep; `src/main.js` footstep hook.

## 0.15.0 — 2026-11-07
Balance pass. A "new player" bot was used to check this: starter traps only, no upgrades, one kill zone at the hole, cat standing still and attacking. Before the changes it lost every map by wave 6–18, almost all of it at boss waves. After them, a bot with Puddin wins 4 of 6 maps on Normal, and one with Fred gets to waves 18–24. It's a rough guide; real hands-on play should decide the rest.
- Danger memory reworked. Mice used to step around any patch where friends had died, so after a few kills they simply skirted kill zones in open yards and traps felt useless. Now danger only weighs which lane a pack picks; inside the lane they still walk into your traps. `src/sim/sim.js` laneDanger, chooseVia, routes() (traces per lane), updateFlow.
- Bosses softer. Rat Captain 900 → 600 health, King Rat 2600 → 1600. Bosses also get only half the per-wave health growth (a wave-24 King Rat was over 5000). `src/config.js` MICE, `src/sim/sim.js` spawnMouse.
- Snapper: 70 → 75 damage, resets in 2.5 s (was 3). Thumbtacks: 3 → 4 damage a tick. Wave-clear bonus grows 15 per wave (was 10). `src/config.js`, `src/sim/sim.js`.
- New: difficulty on the menu, remembered. In co-op the host's choice applies.
  - Relaxed: 75% mouse health, 30 lives, half the paw prints.
  - Normal.
  - Brutal: 130% mouse health, 12 lives, 50% more paw prints.
  - The paw-print rating is now out of your starting lives, so a flawless Brutal run still rates 5.
  - `src/config.js` DIFFICULTY, `src/sim/sim.js` constructor, `src/sim/waves.js` ratePaws, `src/meta/profile.js` runReward, `src/main.js` menu, `index.html`.
- Fixed: the Castle Entrance description said the gate holds until wave 6. In fact the mice chew through the board; a siege mouse only breaks it on wave 6 if it's still standing. `src/sim/map.js`.

Tests: 177 checks, all passing (lane-only danger, difficulty, rating).

## 0.14.0 — 2026-11-07
Furniture routes
- Mice now climb over low furniture when going over is shorter than going round:
  - the stable fences (14 crossings)
  - crates and buckets on the entrance, market and cellar maps
  - the linen basket and coal scuttle in the passages
  - the big cellar cheese wheel (both ways)
- They scramble up, run across the top and climb down the far side. Traps up there hit them, and the floor arrows show the route going over.
- Poison Box walls along the floor don't stop a mouse that can go over the furniture. Put a Poison Box on top (it now fits on furniture tops) to close the route, or box both sides. The "leave them a way through" check counts open furniture routes. Bosses don't climb.
- `src/sim/map.js` buildMap (links, 348–376) and LINKS; `src/sim/path.js` computeFlow and nextCell take links; `src/sim/sim.js` openLinks, linkFrom, stepLink, routes() drawn over furniture, seal check; `src/render/scene.js` route arrows at furniture height.

Settings
- Mouse sensitivity, field of view and invert up/down on the pause screen. They're saved. `index.html`, `src/main.js`.

Co-op
- Up to four cats (the host plus three). The lobby lists everyone.
- When you win, the host's Onward button takes everyone to the next map together, with no new room. After a loss there's "Try again together".
- Your own cat responds the instant you press a key. Guests run their own cat's movement locally; the host says which input it has reached, and the guest shifts by half the difference (snaps if it's way off, e.g. a respawn or a boss fling).
- The game now tears down cleanly between maps (listeners, link handlers, the 3D scene and canvas) instead of needing a page reload.
- `src/net/coop.js` (multi-guest rooms, removable handlers, predicted fields), `src/main.js` (lobby, hostStart, start/stop, prediction and reconcile), `src/render/scene.js` dispose, `src/sim/sim.js` (inputs carry a sequence number).
- Tested with three tabs on one computer: lobby, three cats in game, a guest moving before the host has stepped, and Onward taking all three to the market.

Tests: 173 checks, all passing (fence crossing, closing a route with a box on the cheese wheel).

## 0.13.2 — 2026-11-07
- Servants' Passages description on the map picker updated for the door change in 0.13.1: mice queue at a shut door, or take another way if it's shorter. `src/sim/map.js` (passages twist).

## 0.13.1 — 2026-11-07
Fixed: found by soak runs (every map, all 24 waves, with traps and a fighting cat, headless)
- A freeze of up to 30 seconds. When path costs got big (Poison Box mazes plus danger memory), one route search could re-check "equal" paths millions of times, because of a rounding mismatch. Worst sim step on every map is now under 40 ms. `src/sim/path.js` computeFlow (lines 75–78).
- A slow Fat Rat in the servants' passages could get stuck forever. It turned round every time a door swung and never got anywhere. Mice now wait at a shut door (a wait costs about as much as a short detour) instead of flip-flopping; mice further back still re-route. Shut doors are a wall to bodies but not to the pathing. `src/sim/sim.js` doorShut, DOOR_WAIT_COST, updateFlow, stepMapFeatures, the blocker branch in stepMouse; `src/net/coop.js` mirrorDoor.
- The floor arrows showed a "direct" route no pack ever took (packs only picked side lanes). The direct, cheapest route is now one of the choices and gets the biggest share, so every arrow is a route mice really use. `src/sim/sim.js` chooseVia (386–396).

Tests: 170 checks, all passing (plus the three regressions above).

## 0.13.0 — 2026-11-07
Online co-op (two players)
- On the menu, one player presses Host a game and gets a 4-letter room code; the other types it in and presses Join. The host picks the map and presses Play; both start together.
- The host's browser runs the game. The guest's browser mirrors it: 15 snapshots a second (about 1–12 KB each) plus the events for sounds and effects. The guest sends its own inputs, trap placing, items and wave starts.
- Shared: Paw Points, lives and wave. Each player's own: cat, loadout, upgrades, item and hat.
- Your friend's health shows under your name.
- If the host pauses, both pause. If either leaves, the other is told (a host leaving ends the guest's game).
- Each player earns their own paw prints and yarn at the end.
- Connection: peer-to-peer WebRTC through PeerJS (its free server only introduces the two browsers). `?local` runs co-op between two tabs on one computer for testing.
- Not tested yet over the real internet from here (the sandbox can't reach the PeerJS server). Tested: two tabs on one browser (connect, start, guest moves and starts the wave, both see the same game) and a headless mirror test.
- `src/net/coop.js` (new), `src/main.js` (menu co-op panel, start() takes a co-op session, snapshot loop, 136–195 and 357–367), `src/ui/hud.js` (teammate health), `src/render/scene.js` (cellar glow follows your own cat), `index.html` (co-op panel), `src/sim/sim.js` (hud snapshot carries the player id).

Docs
- README rewritten for the current game (it still described tails, stashes and two cats).

Tests: 167 checks, all passing:
- co-op: the guest's mirror has the same mice, in the same places
- the guest's cat moves and its traps go down on the host
- shared Paw Points, wave and lives match
- snapshot size

## 0.12.0 — 2026-11-07
Smarter mice
- They learn: every mouse that dies marks its patch of floor (a 4x4-unit area) as dangerous. Small mice add that to their path cost, so a lane they keep dying in gets dearer and packs pick other lanes. In tests, packs take a deadly lane about 1 time in 40 instead of 1 in 3. It fades over about 20 seconds (and halves between waves). Bosses don't care. The radar shows where they're scared of as faint red patches. `src/sim/sim.js` addDanger, stepDanger, updateFlow (danger added for small mice only), extraOfBig.
- Scouts (new, from wave 2): quick, flimsy mice that run at the front of every big pack. A scout's death counts four times as much, and the first one tells you so. `src/config.js` MICE.scout, `src/sim/waves.js`.
- They smash shortcuts open: crate stacks block a corridor on three maps (the entrance guard passage, the market centre alley, the last stretch of the servants' passages). When the way round is long enough, mice chew through and that shortcut stays open for the rest of the wave; servants stack the crates back between waves. Crates show on the radar. `src/sim/map.js` CRATES, `src/sim/sim.js` crates, crateUp, breakCrate.
- They go round fires (kitchen ovens and hearth) when there's another way. You can still fling them in.

Climbing and infesting
- Food up on the furniture on every map: a meat pie on the entrance trestle table, fish and cheese on the market stalls, oats on the stable hay, the top of the cellar cheese wheel, crumbs on the coal scuttle, a roast, a cake and a pie on the kitchen counters.
- About a third of small mice leave their route to climb up, walk to the food, gorge (30% tougher), and climb back down. They scramble up nose-first. Shown on the radar as yellow rings.
- Floor traps can now go on furniture tops (tables, counters, stalls, crates, the well): aim at the top. They hit mice up there. A Snapper on the kitchen island is a fine way to ruin dinner. (Not Poison Boxes or Cheese Chunks.) `src/sim/sim.js` stepClimb, topHeight, canPlace(top), trap levels in stepTraps; `src/main.js` placement; `src/render/scene.js` traps at top height.
- Fixed: standing on a table faded it out as if you were under it. `src/render/scene.js` (line 763).

Tests: 161 checks, all passing:
- danger re-routes packs, and fades
- scouts lead packs
- mice smash crates; crates come back
- fire avoidance
- a mouse climbs, eats, comes down tougher
- a Snapper on the island catches it

## 0.11.0 — 2026-11-07
Elements
- Every attack and trap now carries one of 12 elements: physical, fire, ice, water, wind, earth, electric, psychic, poison, physics, holy, death.
- Mice have weaknesses and resistances:
  - plague rats shrug off poison and hate holy and fire
  - sewer rats resist claws and fry on electricity
  - fat rats burn well and barely budge
  - bosses resist psychic and death
  - birds are blown about by wind
- Elements leave statuses on mice: wet, burning, chilled, oily, dirty, confused, poisoned.
- Statuses combo:
  - wet + electric = Chain Shock (arcs to nearby mice)
  - oily + fire = Blaze (3x burn, spreads)
  - wet or three chills + ice = Frozen Solid
  - wind spreads burning and poison through a pack
  - dirty + physics = Knockdown
  - wet + fire = Steam (it fizzles)
  - death finishes off anything under 20%
- The first time each combo happens, it explains itself. The pause screen lists them all. Mice glow with their status (blue = wet, orange = burning, ice-white = frozen, brown = dirty, purple = confused).
- Map hazards join in. Stables mud makes mice dirty. Spills from knocked-over props soak mice (pots and buckets), oil them (jugs) or cover them in dirt (baskets).
- Cat attacks have elements:
  - Fred's hairball soaks (water)
  - Meow Meow's burrs and Mimo's pebbles dirty (earth)
  - Puddin's pounce and Casper's leap strike are physics
  - hiss, yawn and roar are psychic
  - The cat menu shows each move's element.
- `src/config.js` ELEMENTS, COMBOS, STATUS, ATTACK_EL, MICE res (39-80, 222-227). `src/sim/sim.js` damageMouse, applyStatus, chainShock, combo, status ticks and confusion in stepMouse (570-650 and around). `src/render/scene.js` status tints, combo effects, bolt(). `src/audio/sfx.js` combo sounds.

New mouse
- Ghost Mouse (from wave 11): floats, takes only 40% from claws and physics, nothing from poison, double-plus from holy and psychic.

13 new traps (22 in all)
- Floor:
  - Hot Plate (fire)
  - Ice Tray (ice)
  - Oil Slick (oils mice and makes them slip)
  - Rolling Pin (physics, flattens the tile)
  - Mouse Skull (death aura that kills the badly hurt)
- Wall:
  - Fork Darts (physical volley, bleeds)
  - Bellows (wind: blows mice back, spreads fire and poison, knocks birds down)
  - Candle Torch (fire jet)
  - Hypno Wheel (psychic: mice wander back the way they came)
- Ceiling:
  - Flower Pot (earth drop, dirties for knockdowns)
  - Leaky Bucket (water: soaks for chain shocks and freezes)
  - Salt Shaker (holy)
  - Flypaper (catches birds, gums up small mice)
- Every trap reads its numbers from one place (`trapParams`), so upgrades apply to all of them. `src/sim/sim.js` stepTraps (rewritten). `src/render/models.js` makeTrap (357-475). `src/render/scene.js` animations and effects. `src/audio/sfx.js` 13 new sounds.

4 new items (10 in all)
- Bell Collar (everything near you panics)
- Water Pistol (soaking stream)
- Box of Matches (patch of fire; oily mice blaze)
- Holy Water (holy splash)

The shop (between runs)
- Paw prints:
  - Earned: 1 per 3 waves cleared, win or lose; your rating on a win; +5 for the first win on each map.
  - Spent on: unlocking traps and items, tier upgrades (tier 2: +25% power; tier 3: 20% faster reset), and then a choice of two specials per trap (44 in all, e.g. Snapper: Bleeding Edge or Chain Snap; Bug Zapper: Arc or Stun Coil). Buy both and swap freely.
- Yarn (from bosses) buys 10 hats. Each cat wears its own; you see it on the menu and in game.
- You start with 8 traps and 3 items unlocked; the rest are in the shop.
- The loadout picker shows trap pictures and only what you own. The end screen shows what you earned, with a Shop button.
- `?sandbox` in the URL unlocks everything with 999 paw prints to try things out; nothing is saved.
- `src/meta/profile.js` (new), `src/ui/shop.js` (new), `src/ui/icons.js` (new, shared trap pictures), `src/main.js` (menu, loadout, rewards), `src/ui/hud.js` (end screen), `src/render/models.js` makeHat, `index.html` (shop screen and styles).

Tests: 150 checks, all passing:
- every element combo and resistance
- every trap placed and hitting a mouse
- upgrade numbers
- shop buying, swapping and rewards
- old saves loading

## 0.10.2 — 2026-11-07
Performance
- Mouse pathing is about 3x faster: the flow field samples its rules into typed arrays once per cell instead of calling them 8 times per cell. Doors, mazes and route choices re-path mid-wave without a hitch. `src/sim/path.js` computeFlow (lines 43–80).
- Holding a Poison Box no longer re-runs the "don't seal the route" path search every frame for the ghost; the answer is cached per spot until something changes. `src/sim/sim.js` canPlace, layoutVer.
- Particles are one pooled instanced mesh (600 specks) instead of a new mesh per speck. Projectiles share one shape per kind. Rings, decals and zap bolts free their GPU memory when they go. Long games no longer slowly leak memory and stutter. `src/render/scene.js` buildParticles / spawnParticles / stepParticles, render(), decal().
- No new colour objects per mouse per frame. `src/render/scene.js` TINT.
Fixed
- Messages still said "sardines": now Paw Points (not enough, sold, wave bonus). `src/sim/sim.js`.
- Birds only spawned across the entrance map's width; now across any map. `src/sim/sim.js` spawnBird.
- Gate sounds came from a fixed spot; now from the gate. `src/main.js` GATE_POS.
- The controls panel covered the Q item box. `index.html` #controls.
- Pause screen listed Q twice. `index.html`.
Polish
- Play button names the map you picked. Loading tips rewritten for the current game (mazes, pots, doors, fires, the journey). Subtitles show each cat's name in its collar colour. `src/main.js`, `src/ui/hud.js`.

## 0.10.1 — 2026-11-07
Fixed
- The game wouldn't load (v0.10.0): a comment had swallowed the end of the door-animation line. `src/render/scene.js` drawMapFeatures (~line 235).

## 0.10.0 — 2026-11-07
Six maps: the journey from the castle entrance to the kitchen (pick any on the menu; winning a map offers "Onward" to the next)
- 1 Castle Entrance (as before) — now with pots, jugs and baskets to knock over.
- 2 Market Back Alleys — three alleys behind the stalls, crossings under the stall counters. Twist: food piles; mice stop to gorge and come out 30% tougher until the pile is eaten. Pots on the counters to knock onto them.
- 3 Stables and Yard — a long aisle under the hay loft with horse pens, a muddy yard. Twist: mud slows mice and cats; troughs drown mice.
- 4 Cellar and Storerooms — wine-rack corridors under a stone vault (ceiling traps anywhere) and a giant cheese wheel mice gorge on. Twist: it's dark (your cat carries a little glow; sniff with F). No birds underground.
- 5 Servants' Passages — a grid of narrow roofed passages. Twist: servants open and shut four doors on timers, rerouting the mice mid-wave (a door never shuts on anyone; there's always a way through).
- 6 The Kitchen — under the counters and the island to the pantry. Twist: three entrances; the ovens and hearth burn mice and cats.
- Maps further along are tougher (+8% mouse health per map).
`src/sim/map.js` (MAPS registry, useMap, shell walls, generalised buildMap: troughs, mud, doors); `src/render/scene.js` (per-map lighting, floors, water, mud, fire, food piles, doors, cellar lantern); `src/render/models.js` (house, plaster, stall, sacks, partition, fence, loft, vault, beams, wine rack, cheese wheel, counter, oven, basket looks); `src/main.js` + `index.html` (map picker, Onward button); `src/ui/hud.js` (radar shows doors, fires, food, mud).
Mazing
- Poison Boxes now act as walls to the mice's pathfinding (cost 5000 per cell), so you can build proper zig-zag mazes and corridors; mice walk the maze rather than chew. The no-sealing rule still applies. Fixed the route step choosing a box cell just because its own distance was low: `src/sim/path.js` nextCell now counts the cost of stepping in.
Knock-over props
- Pots, jugs, baskets and buckets sit on tables, counters, benches and walkways. Brush past one and your cat swats it the way it's facing; it skids along the surface and off the edge. Dropped onto mice it smashes them (25 + 6 per unit fallen) and leaves a spill that slows them for 8 s. They're back in place every wave. `src/sim/sim.js` stepMapFeatures; `src/render/models.js` makeProp.
Tests: 100 checks, all passing (every map: both/all entrances reach the hole for mice and bosses; maze is walked not chewed; mud, fire, food, doors and pot smashes all work).

## 0.9.0 — 2026-11-07
New cat
- Mimo: frisky brown-grey mackerel tabby (neutered, still thinks he's a lion). Pebble Flick (x2 damage to ranged mice: Plague Rats, Siege Mice), Lion Roar (everything within 6.5 takes +35% damage for 6 s; birds get knocked out of the sky), Sky Swipe (E: springs at the nearest bird), Double Jump, Bird Hunter (x3 damage to birds). Voice lines, model, winking portrait. `src/config.js`; `src/sim/sim.js` (firePebble, roar, swatBirds); `src/render/models.js` makeMimo; `src/ui/portraits.js`.
Birds (new enemy)
- Magpies (from wave 8) steal Cheese Chunks or peck a cat and steal 15 Paw Points. Crows (from wave 10) carry 3 mice over your traps and drop them near the hole; shoot a crow down in the air and its mice fall and splat. Any projectile or melee can hit them; Bug Zappers fry low-flying birds. Shown on the radar as chevrons (red = carrying mice). `src/sim/sim.js` spawnBird/stepBirds/damageBird; `src/sim/waves.js`; `src/render/models.js` makeBird; `src/render/scene.js`; `src/ui/hud.js`.
Every cat: attack + 2 abilities + jump, and its own numbers
- New E ability for every cat: Fred Alley Dash, Puddin Big Sit, Scary Cat Leap Back (moved from Shift), Nebbie Tinker (resets nearby traps, +25% damage), Casper Show Off (pulls every mouse to him, takes less damage), Meow Meow Groom (heals the most-hurt cat nearby), Mimo Sky Swipe. `src/config.js` ABILITY2; `src/sim/sim.js` ability2 + ab_*.
- Each cat now has its own health, max energy and energy recharge rate. `src/config.js` CATS.
- Collar colours: each cat wears its own collar colour, picked to contrast its fur (Fred blue, Puddin purple, Scary Cat lime, Nebbie pink, Casper red, Meow Meow orange, Mimo cyan): on the model, the portrait, the HUD badge and the radar marker. `src/config.js`; `src/render/models.js` makeCat; `src/ui/portraits.js`; `src/ui/hud.js`.
Loadout and items
- Pick 8 traps to bring (from 9) and 1 item on the menu; remembered between visits. Only traps you brought can be placed. `src/main.js`; `src/sim/sim.js` placeTrap.
- Items (Q): Laser Pointer (mice chase the dot), Yarn Bola (ties up mice where it lands), Catnip Bomb (cats buffed, mice confused), Flea Bomb (damage cloud), Fish-Oil Tonic (heal half), Squeaky Toy (mice attack it instead of moving on). `src/config.js` ITEMS; `src/sim/sim.js` useItem/stepZones; `src/render/scene.js`.
Economy
- Tails and stashes removed. Every kill pays Paw Points straight away (Pinkie 2, House Mouse 5, Sewer Rat 12, Fat Rat 25, Rat Captain 150, King Rat 400, birds 10–15). "Sardines" renamed Paw Points everywhere. Rusty Bell now +25% Paw Points per kill; Mouldy Rind now +50% wave-clear bonus. `src/config.js`; `src/sim/sim.js` killMouse; `src/sim/map.js` (stashes gone); `src/render/scene.js`; `index.html`.
UI
- Ability bar: Left click / Right click / E / Space / Q item for every cat, with energy costs and cooldowns. Cat select is a 4-wide portrait grid; detail shows health, energy and recharge. Controls panel tucks away when wave 1 starts (H brings it back). Trap costs show a paw icon. Menu scrolls on short screens.
Tests: 80 checks, all passing.

## 0.8.0 — 2026-11-07
Added
- Poison Box replaces the Toy Block barricade: a crate of rat poison. Mice route around it if they possibly can; if forced to chew through, the poison hurts them every second they chew (bosses take 40%). `src/config.js` 217; `src/sim/sim.js` 1060-1066, 1197; `src/render/models.js` 209-221.
- Cheese Chunk (trap 9, 25 sardines): mice within 6 units leave their route to nibble it for a few seconds, standing still on whatever you put around it. Shrinks as it's eaten, restocks after 12 s, lamp shows when it's empty. Bosses ignore it. `src/config.js` 224-228; `src/sim/sim.js` 699-709, 1067-1087, 1343-1348; `src/render/models.js` 223-231; `src/render/scene.js` 499, 514.
- Sense of smell (hold F): every mouse leaves a scent trail; while sniffing, the last ~12 s of trails glow green, mice show through walls, and every route lights up through walls. `src/render/scene.js` 236-237, 281-310; `src/main.js` 137, 148-149; `index.html` 43-45.
- ROADMAP.md: the big systems from Brent's notes (climbable furniture and infesting, more traps, unlock/upgrade shop with 2-choice specials, elements, items, smarter mice) with a suggested order and open questions.
Tests: 66 checks, all passing.

## 0.7.0 — 2026-11-07
New cats (6 total)
- Scary Cat: scrawny beat-up black cat (55 HP). Tail Whip (long narrow line, hits 4), Hiss (arches up, mice in 5.5 units flee for ~2.5 s, bosses slowed), High Jump (highest in the game), Shift = Leap Back (backflip). `src/config.js` 80-104, 160-166; `src/sim/sim.js` 698-760, 1038-1047 (fear); `src/render/models.js` 116-140.
- Nebbie: sleek clever grey cat (75 HP). Whisker Darts (fast, fly level, pierce 3), Purr (heal 30% over 5 s + damage/speed buff for every cat nearby), Long Jump, 30% dodge. `src/sim/sim.js` 760-790, 1232-1251; `src/render/models.js` 142-156.
- Casper (he): pure-white pedigree show cat (115 HP). Claws (fast swipes, each hit builds rage), Rage (+1% damage per point up to +100%, drains when he stops fighting), Frenzy (3 s all-round fury), Leap Strike (jump, then Space again to leap forward and smash), mice target him first. `src/sim/sim.js` 579-648, 790-823; `src/render/models.js` 158-176.
- Meow Meow: friendly grey outdoor cat with a white beard and chest (80 HP). Sticky Burrs (slow; 4 hits = asleep; any damage wakes), Big Yawn (crowd falls asleep, cats nearby buffed), Triple Jump, runs fast, Catnap (stand still to nap and heal). `src/sim/sim.js`; `src/render/models.js` 178-188.
- Each new cat has its own voice lines, animations (arched hiss, scorpion tail whip, backflip, frenzy thrash, rage glow, napping with Zzz, buff shimmer), effects and sounds. Sleeping mice show blue Zzz stars instead of yellow stun stars. `src/render/scene.js`; `src/audio/sfx.js` 177-187.
Art
- Cartoon portraits for all six cats (hand-built SVG): cat-select cards, your HUD badge, and next to every voice line. `src/ui/portraits.js` (new).
- New cat select: 3×2 portrait grid + detail panel (turning 3D model, abilities, health/speed); remembers your last pick. `src/main.js` 43-79; `index.html` 88-100, 130-145; `src/ui/catinfo.js` (new).
- Ability panel shows a 4th box (Shift or passive), Casper's rage bar, Meow Meow's nap. `src/ui/hud.js` 106-128.
Fixes
- Fast projectiles move in sub-steps so they can't skip over a mouse between ticks. `src/sim/sim.js` 1189-1197.
- Getting hit returns whether it landed (dodges skip boss-stomp stun too).
Tests: 62 checks (16 new for the four cats), all passing.

## 0.6.0 — 2026-11-07
Sound (new)
- All sound and music synthesised live with WebAudio, no files: 46 effects (squeaks, spitballs, hairball hork, chomp/eat, pounce, belly flop, every trap, gate cracks, splats, splashes, boss roar and stomp, tails, stash ka-ching, wave horn and fanfare, win/lose). Positional (fades with distance, panned left/right), rate-limited so swarms don't clip. Music: sneaky plucked bass while building, drums for waves, heavier groove for bosses. `src/audio/sfx.js` 1-211 (new); wiring `src/main.js` 177-239.
- M mutes; Esc pauses with Master / Music / Effects sliders (saved between visits). `index.html` 141-154; `src/main.js` 55-94.
Scale and look
- Human-scale castle (1 unit = 30 cm): walls 8.5 m, gatehouse towers 10 m, guardhouses 4.8 m with 2.1 m doors and windows above cat height, slate roofs; colonnade roof 2.7 m. `src/sim/map.js` 31-55.
- Real-size textures: 11 cm cobbles, 45 cm stone blocks, planks, bark, plaster, slate (the unused triplanar textures are now wired in). `src/render/models.js` 236-377; `src/render/scene.js` 66-80, 95-123.
- New human props, all solid with matching colliders: bench and trestle table (walk under them; Bug Zappers go underneath), bucket by the well, soldier's helmet in the clearing, spear rack in the courtyard. Bigger cart on 1 m wheels. Wall torches in iron sconces with flickering flames. `src/sim/map.js` 52-65, 149-154; `src/render/models.js`; `src/render/scene.js` 160-170, 460.
Names and flavour
- Game renamed Nine Lives Keep. Traps: Toy Block, Snapper, Flinger, Cheese Grater, Bug Zapper, Glue Trap, Thumbtacks, Boxing Glove, each with a description. Mice: Pinkie, House Mouse, Scamper, Mama Mouse, Sewer Rat, Siege Mouse, Plague Rat, Fat Rat, Rat Captain, King Rat. Abilities: Spitball / Hairball / Double Jump (Fred), Chomp / Pounce / Belly Flop (Puddin). `src/config.js` 8-9, 101-148; `src/ui/hud.js` 8-35.
- Each cat has its own voice (Fred: mouthy alley scrapper; Puddin: posh, lazy glutton), new lines for leaks and wave clears; trinket flavour text; new-mouse intro lines; loading-screen tips; end-screen quips. `src/sim/sim.js` 15-44, 146-152; `src/sim/waves.js` 11-17; `src/main.js` 21-39.
UI
- Trap bar shows a picture of each trap (rendered from the 3D models); trap info card while one is held; next-wave preview in the build phase (count, NEW kinds, boss); boss health bar; kill counter; trinkets listed by name with their effect; ability panel shows per-cat names, energy cost, notes; Fred's unused charge bar hidden. `src/ui/hud.js` 55-182; `index.html` 22-73, 101-134.
Fixes and tuning
- A boss could get stuck forever chasing a cat it couldn't reach (wave never ended); mice now give up a blocked chase for 2 s, and the stomp triggers at 90% of its radius. `src/sim/sim.js` 872-898.
- House Mouse bite 6 → 5, Sewer Rat 12 → 10 (mice now hunt cats, so bites hurt more often).
- Plague spit event renamed so it no longer triggers Fred's spit effects. New events: waveStart, waveClear, jump, glue, sold.
- Favicon (paw print). README renamed.
Tests: 46 checks pass; every sound verified to play and produce signal in headless Chrome.

## 0.5.0 — 2026-11-07
Traps (Orcs Must Die footprints)
- Every trap is now one tile = 4x4 cells (2x2 units, two cats wide); barricade is a full-tile, 1.4-tall block whose collision matches its model. Traps snap to half-tiles and nudge one cell to fit against walls. `src/config.js` 114-131; `src/main.js` 95-110; `src/sim/sim.js` 151-152.
- Traps actually hit: mousetrap snaps everything on its tile (spike-trap style, up to 6); wall grinder reaches 2 units out from the wall. `src/sim/sim.js` 999-1063.
- Hairdryer removed → Spring glove (wall, Tom & Jerry boxing glove): punches small mice across the lane, dazes big ones. Same files + `src/render/models.js` 195-207.
- Reset cues: every trap has a lamp (green armed, red resetting) and its moving part animates the reset (mousetrap bar cranks back, flipper eases down, zapper glow refills, glove winds back in, glue fades by charges). `src/render/models.js` 118-207; `src/render/scene.js` 408-434.
Mice
- Lanes: mice follow the flow's direction and steer to their own spot across the corridor, so mobs fill the road instead of one file. `src/sim/sim.js` 871-919.
- Route divergence: three lanes north of the courtyard (colonnade, guard passage, east lane). Each pack picks one weighted toward the cheapest; barricading a lane pushes mobs to the others. Floor arrows/radar show every live lane. `src/sim/map.js` 77-84; `src/sim/sim.js` 197-256; `src/render/scene.js` 206-217.
- Mice fight: they turn off the route to go bite a nearby cat; plague rats spit at range while walking. `src/sim/sim.js` 811-857, 925-947.
- New kinds: Splitter (bursts into 2 pups), Plague rat (ranged), Fat rat (huge, slow, bursts into 3 mice); speed/size tiers. Each new kind is introduced ALONE the first time with a "NEW:" message. `src/config.js` 96-111; `src/sim/waves.js` 7-54; `src/sim/sim.js` 465-497.
- Wave-6 Rat captain: 2x bigger, faster, 900 HP, telegraphed stomp (red ring) that hurts, stuns and flings cats; King rat bigger again. Escort mob behind bosses, roar + camera shake. Bosses need wider clearance. `src/config.js` 104-111; `src/sim/map.js` 167-178; `src/sim/sim.js` 811-853; `src/render/scene.js` 267-295.
Puddin
- Pounce: radius 1.6 → 2.6, stun 1.8 → 3.0 s, damage 40 → 50; shockwave ring on landing; stunned mice show circling stars that shrink as the stun runs out. `src/config.js` 71-73; `src/sim/sim.js` 640-641; `src/render/scene.js` 194-195, 529-552.
Tests
- New checks for tile traps, grinder reach, lane spread, three-way routes, aggro bites, spit, splitter, intros, boss stomp, pounce stun timer (46 checks, all passing). `tests/sim-test.mjs`.

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
