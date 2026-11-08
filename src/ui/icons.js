// icons.js — little pictures of each trap, rendered once from the real 3D models.
// Shared by the trap bar, the loadout picker and the shop. Cached per page.

import * as THREE from 'three';
import { TRAPS } from '../config.js';
import { makeTrap } from '../render/models.js';

const cache = {};
export function trapIcons(kinds) {
  const need = kinds.filter(k => !cache[k] && TRAPS[k]);
  if (need.length) {
    try {
      const cv = document.createElement('canvas'); cv.width = 96; cv.height = 72;
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff0e0, 0x3a2a1c, 2.2));
      const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(2, 4, 3); sc.add(dl);
      const cam = new THREE.PerspectiveCamera(32, 96 / 72, 0.1, 50);
      for (const k of need) {
        const def = TRAPS[k], m = makeTrap(k);
        if (m.userData.lamp) m.userData.lamp.visible = false;
        if (m.userData.aura) m.userData.aura.visible = false;
        if (def.surface === 'ceiling') { m.position.y = 1.4; cam.position.set(2.6, 0.2, 3.4); cam.lookAt(0, 0.6, 0); }
        else if (def.surface === 'wall') { cam.position.set(2.6, 2.4, 3.6); cam.lookAt(0, 0.45, 0.4); }
        else { cam.position.set(2.4, 3.0, 3.4); cam.lookAt(0, k === 'barricade' ? 0.6 : 0.1, 0); }
        sc.add(m); r.render(sc, cam); cache[k] = cv.toDataURL(); sc.remove(m);
      }
      r.dispose(); r.forceContextLoss && r.forceContextLoss();
    } catch { /* no WebGL for icons: names only */ }
  }
  const out = {}; for (const k of kinds) if (cache[k]) out[k] = cache[k];
  return out;
}
