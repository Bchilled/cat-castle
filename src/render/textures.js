// textures.js — procedural textures (drawn on canvases at load) and a
// "triplanar" material that maps them by world position.
// Why procedural: no image files to ship or license. Why triplanar: walls,
// floors and blocks of any size get evenly-sized stones without stretching,
// so every wall reads as a castle built from the same blocks.

import * as THREE from 'three';

const SIZE = 256;
function canvas() { const c = document.createElement('canvas'); c.width = c.height = SIZE; return [c, c.getContext('2d')]; }
// Seeded noise so textures look the same every load.
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function shade(hex, f) {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * f)), g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * f)), b = Math.min(255, Math.max(0, (hex & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function speckle(ctx, n, alpha) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${alpha * rnd()})`; ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 2, 2); }
}

// Cut-stone blocks in running bond, each block a slightly different shade.
function stone(base = 0x857c70) {
  const [c, x] = canvas();
  x.fillStyle = '#2e2924'; x.fillRect(0, 0, SIZE, SIZE);                // mortar
  const rows = 4, rh = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    let px = r % 2 ? -rh * 0.9 : 0;
    while (px < SIZE) {
      const w = rh * (1.4 + rnd() * 1.0);
      x.fillStyle = shade(base, 0.82 + rnd() * 0.3);
      x.fillRect(px + 3, r * rh + 3, w - 6, rh - 6);
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(px + 3, r * rh + 3, w - 6, 4);          // lit top edge
      x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(px + 3, r * rh + rh - 7, w - 6, 4);           // shadowed bottom edge
      // wrap the block across the tile edge so the pattern tiles seamlessly
      if (px + w > SIZE) { x.fillStyle = shade(base, 0.82 + rnd() * 0.3); x.fillRect(px - SIZE + 3, r * rh + 3, w - 6, rh - 6); }
      px += w;
    }
  }
  speckle(x, 2500, 0.18);
  return c;
}
// Rounded cobbles packed in rows.
function cobbles() {
  const [c, x] = canvas();
  x.fillStyle = '#28231e'; x.fillRect(0, 0, SIZE, SIZE);
  for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) {
    const cx = k * 32 + (r % 2) * 16 + (rnd() - 0.5) * 6, cy = r * 32 + 16 + (rnd() - 0.5) * 6;
    x.fillStyle = shade(0x7a7064, 0.75 + rnd() * 0.4);
    for (const ox of [-SIZE, 0, SIZE]) { x.beginPath(); x.ellipse(cx + ox, cy, 14 + rnd() * 2, 12 + rnd() * 2, rnd(), 0, 7); x.fill(); }
  }
  speckle(x, 2000, 0.15);
  return c;
}
function dirt() {
  const [c, x] = canvas();
  x.fillStyle = '#5e4a32'; x.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 900; i++) { x.fillStyle = shade(0x5e4a32, 0.7 + rnd() * 0.6); x.beginPath(); x.arc(rnd() * SIZE, rnd() * SIZE, 1 + rnd() * 5, 0, 7); x.fill(); }
  for (let i = 0; i < 60; i++) { x.fillStyle = shade(0x80766a, 0.8 + rnd() * 0.4); x.beginPath(); x.ellipse(rnd() * SIZE, rnd() * SIZE, 3 + rnd() * 5, 2 + rnd() * 4, rnd() * 3, 0, 7); x.fill(); }
  return c;
}
function bark() {
  const [c, x] = canvas();
  x.fillStyle = '#4a3624'; x.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 70; i++) { x.fillStyle = shade(0x4a3624, 0.55 + rnd() * 0.8); x.fillRect(rnd() * SIZE, 0, 2 + rnd() * 8, SIZE); }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(rnd() * SIZE, rnd() * SIZE, 2, 10 + rnd() * 40); }
  return c;
}
function plaster() {
  const [c, x] = canvas();
  x.fillStyle = '#d6cbb4'; x.fillRect(0, 0, SIZE, SIZE); speckle(x, 3000, 0.12);
  return c;
}
// Slate roof: overlapping rows of dark tiles.
function slate() {
  const [c, x] = canvas();
  x.fillStyle = '#20232a'; x.fillRect(0, 0, SIZE, SIZE);
  for (let r = 0; r < 8; r++) for (let k = 0; k < 9; k++) {
    x.fillStyle = shade(0x4a505c, 0.75 + rnd() * 0.4);
    x.fillRect(k * 32 - (r % 2) * 16 + 1, r * 32 + 1, 30, 30);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(k * 32 - (r % 2) * 16 + 1, r * 32 + 26, 30, 5);
  }
  return c;
}
function planks() {
  const [c, x] = canvas();
  for (let r = 0; r < 8; r++) { x.fillStyle = shade(0x6e4e30, 0.8 + rnd() * 0.35); x.fillRect(0, r * 32, SIZE, 32); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, r * 32 + 30, SIZE, 2); }
  for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(rnd() * SIZE, rnd() * SIZE, 20 + rnd() * 40, 1); }
  return c;
}
function leaves() {
  const [c, x] = canvas();
  x.fillStyle = '#2e4426'; x.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 1500; i++) { x.fillStyle = shade(0x3a5a2e, 0.6 + rnd() * 0.8); x.beginPath(); x.arc(rnd() * SIZE, rnd() * SIZE, 2 + rnd() * 4, 0, 7); x.fill(); }
  return c;
}

const MAKERS = { stone, cobbles, dirt, bark, plaster, slate, planks, leaves };
const texCache = new Map(), matCache = new Map();
function texture(name) {
  if (!texCache.has(name)) {
    const t = new THREE.CanvasTexture(MAKERS[name]());
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texCache.set(name, t);
  }
  return texCache.get(name);
}

// Triplanar material: picks the texture projection from the surface normal,
// using world position as UVs. `scale` = world units per texture repeat.
export function tmat(name, scale = 4, color = 0xffffff) {
  const key = name + scale + color;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ map: texture(name), color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTriScale = { value: 1 / scale };
    sh.vertexShader = 'varying vec3 vWPos; varying vec3 vWNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wp = vec4(transformed, 1.0); vec3 wn = objectNormal;
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;
      #endif
      vWPos = (modelMatrix * wp).xyz; vWNrm = normalize(mat3(modelMatrix) * wn);`);
    sh.fragmentShader = 'uniform float uTriScale; varying vec3 vWPos; varying vec3 vWNrm;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 an = abs(vWNrm);
      vec2 tuv = an.x > an.y && an.x > an.z ? vWPos.zy : (an.y > an.z ? vWPos.xz : vWPos.xy);
      vec4 sampledDiffuseColor = texture2D(map, tuv * uTriScale);
      diffuseColor *= sampledDiffuseColor;`);
  };
  m.customProgramCacheKey = () => 'tri' + scale;
  matCache.set(key, m);
  return m;
}
