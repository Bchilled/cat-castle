// node record.mjs <url> <outdir> <seconds> [fps] [warmupSecs]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [url, out, secsS, fpsS, warmS] = process.argv.slice(2);
const SECS = +secsS || 10, FPS = +fpsS || 30, WARM = +warmS || 0;
fs.mkdirSync(out + '/frames', { recursive: true });
const inject = fs.readFileSync(new URL('./inject.js', import.meta.url), 'utf8');
const cfg = { audioSecs: WARM + SECS + 8, sr: 48000, ls: {
  'catcastle.audio': JSON.stringify({ master: 0.9, music: 0.45, sfx: 0.95, muted: false, musicV2: true }),
  'catcastle.cat': JSON.stringify(process.env.CAT || 'puddin'), 'catcastle.map': JSON.stringify(process.env.MAP || 'market'),
  'catcastle.coach': JSON.stringify({ done: true, skipped: true, step: 99 }), 'catcastle.intro': '1',
} };
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', '--user-data-dir=' + (process.env.PROFILE || '/tmp/nlk-cap-profile') + ''] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', m => { const t = m.text(); if (m.type() === 'error' || /error/i.test(t)) console.log('[page]', m.type(), t.slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.evaluateOnNewDocument(`window.__CAPCFG = ${JSON.stringify(cfg)};\n` + inject);
await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
await page.addStyleTag({ content: '#coach{display:none!important}' });
// Let the game boot: step the clock until the demo is running.
const dt = 1000 / FPS;
for (let i = 0; i < 600; i++) { await page.evaluate((d) => window.__advance(d), dt); if (await page.evaluate(() => !!window.__demo)) break; if (i % 30 === 0) await new Promise(r => setTimeout(r, 200)); }
console.log('demo:', JSON.stringify(await page.evaluate(() => window.__demo)));
for (let i = 0; i < WARM * FPS; i++) await page.evaluate((d) => window.__advance(d), dt);
const startT = await page.evaluate(() => window.__now());
const client = await page.createCDPSession();
const t0 = Date.now();
const N = SECS * FPS;
for (let f = 0; f < N; f++) {
  await page.evaluate((d) => window.__advance(d), dt);
  const { data } = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  fs.writeFileSync(`${out}/frames/f${String(f).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
  if (f % 60 === 0) { const st = await page.evaluate(() => { const s = window.__sim; return s ? { wave: s.wave, phase: s.phase, mice: s.mice.length, kills: s.stats.kills, lives: s.lives } : null; }); console.log('frame', f, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(st)); }
}
const info = await page.evaluate(() => window.__renderAudio());
console.log('audio', JSON.stringify(info));
if (info) {
  const chunks = []; const CH = 4 << 20;
  for (let off = 0; off < info.bytes; off += CH) chunks.push(Buffer.from(await page.evaluate((o, l) => window.__pcmChunk(o, l), off, CH), 'base64'));
  const pcm = Buffer.concat(chunks);
  const hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(info.sr, 24); hdr.writeUInt32LE(info.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(out + '/audio.wav', Buffer.concat([hdr, pcm]));
  fs.writeFileSync(out + '/timing.json', JSON.stringify({ audioT0: info.t0, videoT0: startT, offsetSecs: (startT - info.t0) / 1000, fps: FPS, frames: N }));
}
await browser.close();
