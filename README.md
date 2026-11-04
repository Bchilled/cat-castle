# Cat Castle

Cats vs mice trap tower defense in the browser (Three.js). Fred, a scruffy ginger tom, defends a castle kitchen from waves of mice.

## Play locally
Any static server from the repo root, then open `index.html`:

```
python -m http.server 8000
```

Then go to http://localhost:8000. (Opening the file directly won't work; browsers block ES modules from `file://`.)

## Controls
Click the game to lock the mouse. WASD move, mouse look, Space jump (again in the air to double-jump, at a wall to wall-kick), hold left click to claw. Keys 1–5 pick a trap, left click places it, R turns a flipper, X sells the trap under the crosshair. E sells carried cheese at the stall. G starts the next wave.

## How it plays
Mice spawn at the forest burrow, walk the road, cross the drawbridge, break the gate (it falls in a few hits and stays down; a siege mouse knocks it down on wave 6 if it's still up) and head for the kitchen mouse hole. They always take the cheapest route, counting distance and traps, and recalculate whenever traps change. Sealing every lane makes them chew through the weakest barricade.

Dead mice drop cheese. Carry it to the stall beside the kitchen hole and sell it for coins; coins buy traps. If Fred dies he drops his cheese (lost if he drowns) and costs 3 lives. Anything in the moat dies. Mice stranded where they can't path die over time.

20 lives. Clear wave 24 to win; mini boss every 6th wave, big boss rat every 12th. Endless mode keeps going. Winning rates 1–5 paw prints plus bonus paws, saved in the browser along with yarn from bosses.

## Code layout
`src/sim/` is the game rules with no graphics, on a fixed 30 Hz tick with seeded randomness. `src/render/` draws it, `src/ui/` is the HUD, `src/net/local.js` is the single-player transport. Every player action is a command object, so co-op later means swapping the transport (host runs the sim, clients send commands) without touching the rules.

## Tests
```
node tests/sim-test.mjs
```
Runs the rules headless: pathing, rerouting, gate, drowning, trap placement, cat physics, claw, cheese selling, and a long multi-wave run.
