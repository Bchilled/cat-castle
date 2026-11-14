// Injected before the game loads: a fake clock (performance.now, Date.now, rAF, timers) that only
// moves when the recorder says, and an AudioContext that is really an OfflineAudioContext on the
// same clock, so every sound lands exactly on its frame and is rendered to a WAV at the end.
(() => {
  const CFG = window.__CAPCFG || { audioSecs: 90, sr: 48000, prefs: null, ls: {} };
  try { for (const [k, v] of Object.entries(CFG.ls || {})) localStorage.setItem(k, v); } catch {}
  const realNow = performance.now.bind(performance), realDate = Date.now;
  let fakeT = realNow(); const dateBase = realDate() - fakeT;
  performance.now = () => fakeT;
  Date.now = () => Math.floor(dateBase + fakeT);
  const rafQ = []; let rafId = 0;
  window.requestAnimationFrame = (cb) => { rafQ.push([++rafId, cb]); return rafId; };
  window.cancelAnimationFrame = (id) => { const i = rafQ.findIndex(r => r[0] === id); if (i >= 0) rafQ.splice(i, 1); };
  const timers = new Map(); let tid = 1;
  window.setTimeout = (f, d = 0, ...a) => { const id = tid++; timers.set(id, { f, at: fakeT + Math.max(0, +d || 0), a }); return id; };
  window.setInterval = (f, d = 0, ...a) => { const id = tid++; timers.set(id, { f, at: fakeT + Math.max(1, +d || 0), every: Math.max(1, +d || 0), a }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  const runTimers = (end) => {
    for (let guard = 0; guard < 10000; guard++) {
      let nid = null, nt = null;
      for (const [id, t] of timers) if (t.at <= end && (!nt || t.at < nt.at)) { nid = id; nt = t; }
      if (!nt) break;
      fakeT = Math.max(fakeT, nt.at);
      if (nt.every) nt.at += nt.every; else timers.delete(nid);
      try { typeof nt.f === 'function' ? nt.f(...nt.a) : 0; } catch (e) { console.error('timer', e && e.stack || e); }
    }
  };
  window.__advance = (ms) => {
    const end = fakeT + ms;
    runTimers(end); fakeT = end;
    const q = rafQ.splice(0);
    for (const [, cb] of q) { try { cb(fakeT); } catch (e) { console.error('raf', e && e.stack || e); } }
    return fakeT;
  };
  window.__now = () => fakeT;
  // ---- audio ----
  const OAC = window.OfflineAudioContext;
  window.__audio = null;
  function FakeAC() {
    const c = new OAC(2, Math.round(CFG.sr * CFG.audioSecs), CFG.sr), t0 = fakeT;
    Object.defineProperty(c, 'currentTime', { get: () => (fakeT - t0) / 1000 });
    Object.defineProperty(c, 'state', { get: () => 'running' });
    c.resume = () => Promise.resolve(); c.suspend = () => Promise.resolve(); c.close = () => Promise.resolve();
    window.__audio = { ctx: c, t0 };
    return c;
  }
  window.AudioContext = FakeAC; window.webkitAudioContext = FakeAC;
  window.__renderAudio = async () => {
    const A = window.__audio; if (!A) return null;
    const buf = await A.ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = buf.length;
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    window.__pcm = new Uint8Array(pcm.buffer);
    return { t0: A.t0, sr: buf.sampleRate, n, bytes: window.__pcm.length };
  };
  window.__pcmChunk = (off, len) => { const u = window.__pcm.subarray(off, off + len); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
})();
