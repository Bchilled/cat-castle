# Where the sounds come from

**No audio files, no samples, nothing licensed.** Every sound effect and all the music in the
game is synthesised live in the browser with the Web Audio API, in `src/audio/sfx.js`: oscillators
(sine, triangle, square, sawtooth) with pitch slides and envelopes, and filtered white noise.
It's original code written for this game, so there is nothing to credit or pay for.

The intro film's soundtrack (`assets/intro/intro.mp4`, from v0.34) is made from the same
synthesised sounds: `tools/intro-soundtrack.html` cues them to the picture and renders a WAV
offline, which is muxed into the film with ffmpeg (see `tools/record/README.md`).

v0.34 added (all synthesised, in `sfx.js`): coin (Paw Points from a kill), boing (a flung mouse),
scurry (a pack bursting from a hole), rumble (the castle shaking), knock / tip / smash (pots
knocked off, toppled, smashed: these events were silent before), propBack, nick (a scurry mouse
stealing crumbs), gorged (a mouse stuffing itself), and meow (each cat has its own pitch; it plays
whenever a cat says something).
