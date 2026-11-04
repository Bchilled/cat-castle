# Cat Castle

Cats vs mice trap tower defense in the browser (Three.js), at mouse scale in a human castle. Play as Fred (quick, fragile, ranged ginger tom) or Puddin (huge, slow, biting calico) and stop the mice pushing room by room toward the king's chamber.

Play: https://brentsnow.ca/cat-castle/

## Play locally
Any static server from the repo root, then open `index.html`:

```
python -m http.server 8000
```

Then go to http://localhost:8000. (Opening the file directly won't work; browsers block ES modules from `file://`.)

## Controls
Click the game to lock the mouse. WASD move, mouse look, wheel zooms the camera. Hold left click to attack (Fred spits pellets, Puddin bites). Right click is Fred's hairball or Puddin's pounce, or places the trap you're holding. Space jumps (Fred double-jumps and wall-kicks; Puddin holds to charge a leap). Keys 1–8 pick a trap, R rotates it, X sells the trap under the crosshair, Q puts it away. E trades tails at a stash. G starts the next wave. H hides the controls panel.

## How it plays
Map 1 is the castle entrance. Mice pour out of a hole in a tree stump, run the walled forest road, cross the moat on a fallen branch, chew through a board jammed in the portcullis (it breaks in a few bites and stays down; a siege mouse knocks it out on wave 6 if it's still standing), run the roofed gatehouse tunnel, then split around the guardhouse toward the mouse hole into the great hall. They take the cheapest route, which you can see as glowing arrows on the floor, and reroute when traps change. You can't seal every route, but they'll chew through barricades when that's cheaper. They come in mobs, and a packed mob is faster and tougher.

Dead mice drop tails; carry them to a stash and trade them for sardines, which buy traps. Rarely they drop trinkets that buff you for the rest of the run. Dying costs 3 lives and drops your tails (lost if you drown). Anything in the moat dies.

20 lives. Clear wave 24 to win; mini boss every 6th wave, big boss rat every 12th. Endless keeps going. Winning rates 1–5 paw prints plus bonus paws, saved in the browser along with yarn from bosses.

## Code layout
`src/sim/` is the game rules with no graphics, on a fixed 30 Hz tick with seeded randomness. `src/render/` draws it, `src/ui/` is the HUD, `src/net/local.js` is the single-player transport. Every player action is a command object, so co-op later means swapping the transport (host runs the sim, clients send commands) without touching the rules.

## Tests
```
node tests/sim-test.mjs
```
Runs the rules headless: pathing, rerouting, gate, drowning, trap placement, cat physics, claw, cheese selling, and a long multi-wave run.
