# Nine Lives Keep

Cats vs mice trap tower defense in the browser (Three.js), in the spirit of Orcs Must Die, at mouse scale in a human castle. Seven cats, each with their own attacks, abilities, jump and health. Six maps make one journey from the castle entrance to the kitchen. There are 39 traps, 10 items and 12 elements that combo, and a shop between runs. Play solo or with up to three friends online. Sound and music are synthesised live in the browser (no audio files).

Play: https://brentsnow.ca/cat-castle/

## Play locally
Any static server from the repo root, then open `index.html`:

```
python -m http.server 8000
```

Then go to http://localhost:8000. (Opening the file directly won't work; browsers block ES modules from `file://`.)

URL options:
- `?sandbox` unlocks everything with plenty of paw prints to try things out (nothing is saved).
- `?local` tests co-op in two tabs on one computer, instead of over the internet.

## Controls
Click the game to lock the mouse.

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Wheel | Zoom |
| Left click (hold) | Attack |
| Right click | Your cat's ability, or place the trap you're holding |
| E | Second ability |
| Space | Jump |
| Q | Your item |
| 1–8 | Pick a trap (press again to put it away) |
| R | Rotate the trap |
| X | Sell the trap under the crosshair |
| G | Start the next wave |
| F (hold) | Sniff out where the mice are going |
| M | Mute |
| Esc | Pause |
| H | Hide the controls |

Traps snap to the trap grid, like Orcs Must Die: one tile is 2×2 units (60 cm), and the grid shows on the floor while you hold a trap. Most traps take one tile; some take two or four. A Poison Box is one tile. Ceiling traps sit flush on the ceiling over the tiles they hit (marked on the floor), and what they do reaches the floor: the Meat Tenderizer press slams all the way down, water and salt pour down, pans and pots fall. Every map has ceilings over its lanes (alleys, sheds, lean-tos, the kitchen ceiling) so floor, wall and ceiling traps all work along the routes. Floor traps also go on table and counter tops: aim at the top.

## How it plays
Mice pour out of the holes and take the cheapest route to the exit. You can see that route as glowing arrows on the floor.
- **Routes:** each hole has one route, the path of least resistance, and every pack from that hole takes it. They re-route when you build. Lanes and doorways are a whole number of tiles wide (mostly 4), so a few Poison Boxes close one and send everyone the long way. You can wall them into a maze, but never seal them in.
- **More doors:** every map starts with one way in. A second door opens on wave 8 and a third on wave 16; the wave before, it's marked on the minimap and its route shows, and you can hear them banging on the boards.
- **High roads:** on every map but the first the rats also run up off the floor: up brooms and ladders, along planks over the crates, beams, high shelves and the pot rack, and the floor lanes run underneath them. The market and stables have a second level, the cellar and kitchen a third. Put top traps up there, or a Poison Box on the run to send them back down.
- **Packs:** scouts run ahead.
- **Shortcuts:** they smash through crate stacks when it's worth it, and climb over fences, crates and the cellar cheese wheel when that beats going round, and take to the kitchen counters and the hay loft if you wall off the floor. A Poison Box on top closes a route.
- **Food:** they stop to eat food piles, and climb furniture to eat what's on top. Eating makes them tougher.
- **Things that fall over:** hit a tall shelf a few times and it topples across the corridor, flattening mice and blocking the way until they chew through. Break a market stall's legs and the counter comes down on the mice under it. Run into a barrel to roll it through a pack. They all reset each wave.
- **Ways up:** stairs take the cats up onto the entrance walkways and the two watchtowers, the market's fish and cheese counters, the stables hay loft and the kitchen worktops. Mice can't use stairs.
- **A lived-in castle:** things at real human size (banners, shields, ladders, brooms, boots, chairs, saddles, copper pans, hams, two horses in the stables), bunting and washing across the market alleys, dust in the air, flies over food, smoke from the oven, and the far-off sounds of each place (voices, horses, pots, drips, birds).
- **Bosses:** a mini boss every 6th wave and a big boss every 12th. Clear wave 24 to win the map and move onward.

Kills pay Paw Points, which buy traps in the game. Every attack and trap has an element:
- **Wet + electric** chains between mice.
- **Oily + fire** blazes.
- **Wet + ice** freezes.
- **Wind** spreads fire and poison.
- **Dirty + physics** knocks mice flat.

**Traps & Items** (click your trap slots on the main menu): every trap grouped by where it goes (floor, wall, ceiling, table tops) and every item. Click one to see what it does, unlock it, upgrade it, and put it in one of your 8 slots (keys 1–8) or take it out.

Paw prints and yarn are kept between runs, and spent there or in the shop:
- unlock traps and items
- upgrade traps (tier 2 and 3, then one of two specials)
- buy hats

## Co-op
Up to four cats. One player presses **Host a game** and reads out the 4-letter code. The others type it in and press **Join**. The host picks the map and presses Play.

When the map is won, the host takes everyone onward to the next map; after a loss, the host can try again with everyone.

The host's browser runs the game and the guests' browsers mirror it; they connect peer-to-peer over WebRTC using PeerJS. Your own cat moves the moment you press a key, and the host corrects it gently.

Paw Points and lives are shared. Each player brings their own cat, traps, upgrades and hat. If the host pauses, everyone pauses.

## Code layout
- `src/sim/` is the game rules with no graphics. It runs on a fixed 30 Hz tick with seeded randomness.
- `src/render/` draws the game.
- `src/render/kit.js` loads the 3D model kit; `src/render/dress.js` builds each map's walls, floors, stores and tables out of it.
- `src/ui/` is the HUD, the shop and the menus.
- `src/meta/profile.js` holds what's kept between runs.
- `src/net/` is the transport. Every player action is a command object, so co-op only swaps the transport (`coop.js`: snapshots out, commands in) without touching the rules.

## Tests
```
node tests/sim-test.mjs
```
Runs the rules headless:
- pathing, re-routing and mazes
- every trap, element combo and resistance
- the shop
- smarter mice and climbing
- shelves and barrels
- co-op snapshots

## Credits
The castle's 3D models (walls, floors, barrels, crates, tables, banners, torches, food, lanterns, trees) are from the KayKit packs by Kay Lousberg (www.kaylousberg.com), CC0: Dungeon Remastered, Restaurant Bits, Furniture Bits, Halloween Bits and the Medieval Hexagon Pack. See `assets/kaykit/CREDITS.md`.
