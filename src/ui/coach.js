// coach.js — first-run hints. One short tip at a time in a card on the left; each one
// clears when you do what it asks (move, pick a trap, place it, start the wave...).
// Shown once per browser (remembered in localStorage); "Replay tips" on the pause
// screen starts them again, "Skip tips" on the card stops them.

const KEY = 'catcastle.coach';
// done(s): s = { moved, sel, placed, phase, kills, sniffed, t } (t = seconds on this tip).
export const STEPS = [
  { text: '<b>WASD</b> to move, <b>mouse</b> to look. Click the game first to lock the mouse.', done: (s) => s.moved > 4 },
  { text: 'Press <b>1</b> to pick up a Poison Box.', done: (s) => !!s.sel || s.placed > 0 },
  { text: '<b>Right click</b> to place it. Mice walk round Poison Boxes, so you can wall them toward your traps.', done: (s) => s.placed >= 1 },
  { text: 'The <b>purple arrows</b> show where the mice will run. Press <b>2</b> and put a Snapper on them.', done: (s) => s.placed >= 2 },
  { text: "Press <b>G</b> when you're ready to let the mice in.", done: (s) => s.phase === 'wave' },
  { text: 'Hold <b>left click</b> to attack. <b>Right click</b> is your ability, <b>E</b> your second one.', done: (s) => s.kills >= 5 },
  { text: 'Hold <b>F</b> to sniff out where the mice are going. <b>Q</b> uses your item.', done: (s) => s.sniffed || s.t > 15 },
  { text: 'Kills pay <b>Paw Points</b>: build more between waves. Winning earns paw prints for the shop.', done: (s) => s.t > 9 },
];

const read = () => { try { const v = localStorage.getItem(KEY); return v === null ? 0 : +v; } catch { return 0; } };
const write = (n) => { try { localStorage.setItem(KEY, String(n)); } catch { /* private window */ } };

export class Coach {
  constructor(el) {
    this.el = el; this.step = read(); this.t = 0; this.shown = -1;
    el.onclick = (e) => { if (e.target.dataset.skip !== undefined) this.skip(); };
  }
  skip() { this.step = STEPS.length; write(this.step); this.render(); }
  replay() { this.step = 0; this.t = 0; write(0); this.shown = -1; }
  get active() { return this.step < STEPS.length; }
  // Advance past every tip already done (e.g. you pressed G before placing anything).
  update(dt, s) {
    if (!this.active) { if (this.shown !== -2) this.render(); return; }
    this.t += dt;
    while (this.active && STEPS[this.step].done({ ...s, t: this.t })) { this.step++; this.t = 0; write(this.step); }
    this.render();
  }
  render() {
    const k = this.active ? this.step : -2;
    if (k === this.shown) return;
    this.shown = k;
    if (k < 0) { this.el.classList.remove('show'); return; }
    this.el.innerHTML = `<small>Tip ${k + 1} of ${STEPS.length} · <a data-skip>Skip tips</a></small>${STEPS[k].text}`;
    this.el.classList.remove('show'); void this.el.offsetWidth; this.el.classList.add('show');   // replay the fade-in
  }
}
