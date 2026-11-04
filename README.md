# Cat Castle

Cats vs mice trap tower defense in the browser (Three.js), at mouse scale in a human castle. Play as Fred (scruffy, fast ginger tom) or Puddin (big tanky calico) and stop the mice pushing room by room toward the king's chamber.

Play: https://brentsnow.ca/cat-castle/

## Play locally
Any static server from the repo root, then open `index.html`:

```
python -m http.server 8000
```

Then go to http://localhost:8000. (Opening the file directly won't work; browsers block ES modules from `file://`.)

## Controls
Click the game to lock the mouse. WASD move, mouse look, Space jump (Fred: again in the air to double-jump, at a wall to wall-kick). Left click claws (every third hit bites). Right click throws a hairball, or places the trap you're holding. Shift pounces (Puddin). Keys 1–8 pick a trap, R rotates it, X sells the trap under the crosshair, Q puts it away. E trades cheese at a stash. G starts the next wave. H hides the controls panel.

## How it plays
Map 1 is the entrance hall. Mice come in under the front door, cross the doormat, cross the drain on a yardstick and chew through a book wedged between the furniture. That falls in a few bites and stays down; a siege mouse knocks it down on wave 6 if it's still standing. Then they head for the gap under the inner door. They always take the cheapest route, counting distance and traps, and reroute when traps change. You can't seal every route, but they'll chew through barricades when that's cheaper.

Dead mice drop cheese; carry it to a stash and trade it for sardines, which buy traps. Rarely they drop trinkets that buff you for the rest of the run. Dying costs 3 lives and drops your cheese (lost if you drown). Anything in the drain dies.

20 lives. Clear wave 24 to win; mini boss every 6th wave, big boss rat every 12th. Endless keeps going. Winning rates 1–5 paw prints plus bonus paws, saved in the browser along with yarn from bosses.

## Code layout
`src/sim/` is the game rules with no graphics, on a fixed 30 Hz tick with seeded randomness. `src/render/` draws it, `src/ui/` is the HUD, `src/net/local.js` is the single-player transport. Every player action is a command object, so co-op later means swapping the transport (host runs the sim, clients send commands) without touching the rules.

## Tests
```
node tests/sim-test.mjs
```
Runs the rules headless: pathing, rerouting, gate, drowning, trap placement, cat physics, claw, cheese selling, and a long multi-wave run.
