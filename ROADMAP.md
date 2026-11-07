# Nine Lives Keep: roadmap

Orcs Must Die at heart, but it's cats and mice in a human castle. These are the big systems still to build, from Brent's notes (Nov 7 2026). Done items are in CHANGELOG.md.

## Already in (v0.8.0)
- Poison Box barricade: mice won't chew it unless there's no other way, and it poisons them while they chew.
- Cheese Chunk bait: lures mice off their route to stand and nibble.
- Sense of smell: hold F to see scent trails, the mouse routes, and the mice themselves through walls.
- Six cats, each with left click, right click, a jump and a passive.

## A. A living castle you can climb (scale and verticality)
- Furniture at real scale that cats and mice can both jump onto: market stalls, food stands, tables, benches, shelves, barrels, crates and sacks. Traps go on the floor, walls and ceilings of all of it.
- Mice climb and jump between levels. Pathing becomes multi-level, with jump links between floor, tabletops and shelves. Mice still never go over a barricade.
- Infesting: mice stop at food (stalls, sacks, the kitchen) to eat. That holds them in place and buys time to build.
- Things break or fall over: stalls collapse, barrels roll, shelves tip, all with physics. That opens or closes routes.
- Humans (cooks, market sellers) as moving hazards or scenery, at true human size.
- Maps: castle entrance (now), then the market, kitchens, cellar, great hall and the king's chamber.

## B. Many more traps (each with its own size, surface and ability)
Ideas still to pick from, cat-and-mouse versions of Orcs Must Die traps:
- **Floor:**
  - Hot plate (fire)
  - Ice tray (freeze)
  - Spilled-oil slick (slide, catches fire)
  - Sticky jam
  - Pin cushion
  - Spring-loaded spoon catapult
  - Rolling pin crusher
  - Trapdoor into the moat
- **Wall:**
  - Fork darts
  - Bellows (wind push)
  - Candle flamethrower
  - Cuckoo-clock hammer
  - Magnifying-glass sunbeam
- **Ceiling:**
  - Dropping pans
  - Chandelier swing
  - Hanging flypaper
  - Dripping honey
  - Salt shaker (holy)
- **Placed on furniture:** knife block, spice jar bombs, kettle steam.

## C. Out-of-game progression (like Orcs Must Die 2's spellbook)
- Currencies kept between runs: paw prints (rating) and yarn (from bosses).
- Shop: buy and unlock traps, cats, items and hats.
- Upgrades: each trap has upgrade tiers, then a choice between 2 special abilities. For example, a Snapper that either chains to the next mouse or leaves them bleeding.
- Loadout: pick which traps and items to bring before a map.

## D. Elements
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
Equippable actives with cooldowns, for example:
- Laser pointer (lures mice)
- Yarn bola (tangles a pack)
- Catnip bomb (cats buffed, mice confused)
- Flea bomb (poison cloud)
- Fish-oil potion (heal)
- Bell collar (scares a lane)
- Squeaky toy (decoy)

## F. Smarter mice
- Already in: they always take the cheapest route, adapt the moment barricades change, and never go over barricades.
- Next: avoid tiles where many mice just died (they learn), send scouts, and break props to open shortcuts. Siege mice wreck things along a long route.

## Open questions for Brent
1. Which of A–F comes first? Suggested order: A (climbing and infesting, because everything else sits on it), then C (shop and upgrades), with B, D and E filling in alongside.
2. Humans: hazards that can hurt mice and cats, or just scenery?
3. How many traps can you bring into a map (Orcs Must Die uses a limited loadout)?
