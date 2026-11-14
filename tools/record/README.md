# Recording the gameplay video and the intro soundtrack (v0.34)

Everything is recorded headless (no screen grabbed, nothing to click), frame by frame on a
fake clock, so the video is smooth however slow the machine is and every sound lands exactly
on its frame.

- `inject.js` runs before the game loads: it replaces `performance.now`, `Date.now`,
  `requestAnimationFrame` and the timers with a clock that only moves when the recorder says,
  and makes the game's `AudioContext` an `OfflineAudioContext` on that same clock. At the end the
  whole soundtrack is rendered to a WAV.
- `record.mjs <url> <outdir> <seconds> [fps] [warmup]` steps the game one frame at a time,
  screenshots each frame (JPEG), then writes `audio.wav` and `timing.json` (where the audio
  starts relative to the first frame).
- `intro-audio.mjs <out.wav>` renders `tools/intro-soundtrack.html`: the intro film's soundtrack,
  cued to the picture, made from the game's own sounds.

Needs Google Chrome and `npm i` here (puppeteer-core only, it doesn't download a browser).

```sh
cd <repo> && python3 -m http.server 8765 --bind 127.0.0.1 &
cd tools/record && npm i
MAP=kitchen CAT=puddin node record.mjs "http://127.0.0.1:8765/index.html?go&demo&sandbox&wave=6" /tmp/rec 45 30 10
# frames + sound -> mp4 (audio starts timing.json's offsetSecs before the first frame):
ffmpeg -framerate 30 -i /tmp/rec/frames/f%05d.jpg -ss <offsetSecs> -i /tmp/rec/audio.wav \
  -map 0:v -map 1:a -c:v libx264 -crf 18 -pix_fmt yuv420p -af loudnorm=I=-16:TP=-1.5 -c:a aac -b:a 192k -shortest out.mp4

node intro-audio.mjs /tmp/intro.wav
ffmpeg -i assets/intro/intro.mp4 -i /tmp/intro.wav -map 0:v -map 1:a -c:v copy -af loudnorm=I=-16:TP=-1.5 -c:a aac -b:a 160k -shortest intro-with-sound.mp4
```

The `?demo` URL flag (src/demo.js) makes the game play itself: three cats, traps laid along the
routes, a busy chaos wave. `?calm` turns chaos mode off.
