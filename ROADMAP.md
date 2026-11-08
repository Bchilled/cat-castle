# Nine Lives Keep: roadmap

Orcs Must Die at heart, but it's cats and mice in a human castle. These are the big systems still to build, from Brent's notes (Nov 7 2026). Done items are in CHANGELOG.md.

## Already in (v0.8.0)
- Poison Box barricade: mice won't chew it unless there's no other way, and it poisons them while they chew.
- Cheese Chunk bait: lures mice off their route to stand and nibble.
- Sense of smell: hold F to see scent trails, the mouse routes, and the mice themselves through walls.
- Six cats, each with left click, right click, a jump and a passive.

## A. A living castle you can climb (scale and verticality)
In from v0.10.0: all six maps, mazing with Poison Boxes, knock-over props, food piles mice gorge on, mud, troughs, darkness, timed doors, fire. In from v0.12.0: mice climb furniture to eat, floor traps on furniture tops, crate stacks mice smash open. In from v0.14.0: furniture routes (mice climb over fences, crates and the cheese wheel when it's shorter). In from v0.16.0: humans in the background (shoppers, stable hands, cooks beyond a low curb; guards on the walls). In from v0.17.0: shelves that topple across a corridor and barrels that roll through packs. In from v0.20.0: market stall counters that come down when the cats break the legs. Still to do here: longer runs along tabletops and shelves.
- Furniture at real scale that cats and mice can both jump onto: market stalls, food stands, tables, benches, shelves, barrels, crates and sacks. Traps go on the floor, walls and ceilings of all of it.
- Mice climb and jump between levels. Pathing becomes multi-level, with jump links between floor, tabletops and shelves. Mice still never go over a barricade.
- Infesting: mice stop at food (stalls, sacks, the kitchen) to eat. That holds them in place and buys time to build.
- Things break or fall over: stalls collapse, barrels roll, shelves tip, all with physics. That opens or closes routes.
- **Humans stay out of zone.** The main human spaces (the market square, the hall floor, the cooks' work area) are out of bounds and lit. Cats and mice live in the side areas and shadows: behind and under the stalls, along the walls, gutters and drains, crawlspaces, back rooms, inside the walls. Humans pass by in the background at full size to sell the scale. They are scenery, not hazards.
- **The campaign is one journey**, entrance to kitchen. Each map is the next stretch:
  1. Castle Entrance: the gatehouse sidings and the drain gate (now).
  2. Market Back Alleys: behind and under the stalls, crates, sacks and awnings to climb, dropped food the mice stop to eat.
  3. Stables and Yard: hay lofts, troughs (water), barrels, cart wheels.
  4. Cellar and Storerooms: shelves, wine racks, cheese wheels (a big infest target).
  5. Servants' Passages: narrow runs inside the walls, ceilings everywhere.
  6. The Kitchen: under the counters, behind the ovens (fire), the pantry. The last stand.

## B. Many more traps (each with its own size, surface and ability)
In from v0.11.0: Hot Plate, Ice Tray, Oil Slick, Rolling Pin, Mouse Skull, Fork Darts, Bellows, Candle Torch, Hypno Wheel, Flower Pot, Leaky Bucket, Salt Shaker, Flypaper (22 traps in all). In from v0.19.0: Trapdoor, Magnifying Glass, Knife Block (table tops only), Honey Drip (26 in all). In from v0.21.0: Cuckoo Clock, Chandelier, Kettle and Spice Jar (table tops only) (30 in all). Ideas still to pick from (the rest of the original list is built):
- **Floor:** sticky jam, pin cushion, spring-loaded spoon catapult.
- **Ceiling:** dropping pans.

## C. Out-of-game progression (like Orcs Must Die 2's spellbook)
In from v0.11.0: the shop (unlocks, tier 2 and 3, a choice of two specials per trap, hats for yarn).
- Currencies kept between runs: paw prints (rating) and yarn (from bosses).
- Shop: buy and unlock traps, cats, items and hats.
- Upgrades: each trap has upgrade tiers, then a choice between 2 special abilities. For example, a Snapper that either chains to the next mouse or leaves them bleeding.
- Loadout: pick which traps and items to bring before a map.

## D. Elements
In from v0.11.0: all twelve, with resistances and the combos below.
Physical, fire, ice, water, wind, earth, electric, psychic, poison, physics, holy and death.
- Traps and attacks carry an element.
- Mice have weaknesses and resistances. For example, plague rats resist poison and are weak to holy and fire; ghost mice are weak to holy.
- Combos change how traps work:
  - wet + electric = chain shock
  - oil + fire = blaze
  - water + ice = frozen solid
  - wind spreads fire or poison
  - earth + physics = knock-down

## E. Items (like Orcs Must Die's weavers and items)
Started in v0.9.0: every cat equips one (Laser Pointer, Yarn Bola, Catnip Bomb, Flea Bomb, Fish-Oil Tonic, Squeaky Toy). More to come:
Equippable actives with cooldowns, for example:
- Laser pointer (lures mice)
- Yarn bola (tangles a pack)
- Catnip bomb (cats buffed, mice confused)
- Flea bomb (poison cloud)
- Fish-oil potion (heal)
- Bell collar (scares a lane)
- Squeaky toy (decoy)

## F. Smarter mice
- In from v0.12.0: danger memory (they avoid where they keep dying), scouts, smashing crate shortcuts, avoiding fires, climbing furniture to eat.
- Already in: they always take the cheapest route, adapt the moment barricades change, and never go over barricades.
- Next: avoid tiles where many mice just died (they learn), send scouts, and break props to open shortcuts. Siege mice wreck things along a long route.

## G. Co-op
In from v0.13.0: online co-op (room codes, peer-to-peer). In from v0.14.0: up to four cats, onward or retry together, instant movement for guests.

## H. Getting started
In from v0.18.0: first-run tips, one at a time, each cleared by doing it (skip or replay from the pause screen).

## Open questions for Brent
1. Which of A–F comes first? Suggested order: A (climbing and infesting, because everything else sits on it), then C (shop and upgrades), with B, D and E filling in alongside.
2. ~~Humans: hazards or scenery?~~ Decided: out of zone, scenery in the lit areas; we play in the shadows.
3. ~~Loadout size?~~ Decided: 8 traps of your choosing + 1 item per cat (in from v0.9.0).
