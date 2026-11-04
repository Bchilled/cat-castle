# Changelog

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
