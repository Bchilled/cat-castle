// flyover.js — (v0.32) the level-start flyover. Before you get control the camera starts high
// over the hole the mice break in through, swoops down and follows their route (the glowing
// trail on the ground) all the way to the mouse hole they're after, then glides down into
// your cat's camera, which is turned to face back down that route. Captions say what you're
// looking at: where they come in, what opens later, where they're going.
// Any key or click skips it.

import * as THREE from 'three';
import { HOLE, SPAWNS, MAP, FURNITURE } from '../sim/map.js';

const SPEED = 14;            // units a second along the route
const UP = 10;               // camera height over the route (roofs fade during the flyover)
const BACK = 8;              // how far behind the point it's looking at
// Never inside a building: the top of any solid block under (x, z), plus a bit.
const clearOf = (x, z) => 2.5 + Math.max(0, ...FURNITURE.filter(f => f.kind === 'solid' && x > f.rect[0] - 1 && x < f.rect[2] + 1 && z > f.rect[1] - 1 && z < f.rect[3] + 1).map(f => f.h || 0));

// sim: the game; caption(html|null): shows a caption card; localId: your cat. Returns { drive, skip, faceYaw }.
// drive(camera, dt) is the scene's camDriver (false = finished). faceYaw = the yaw that points
// the cat back down the route (set it when the flyover starts, so the glide lands on it).
export function makeFlyover(sim, caption, localId = 'p1') {
  const route = (sim.routes()[0] || []).filter((p, i, a) => i % 2 === 0 || i === a.length - 1);
  const sp = SPAWNS[0], hx = (HOLE.x0 + HOLE.x1) / 2, hz = (HOLE.z0 + HOLE.z1) / 2;
  const pts = route.length > 4 ? route.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z)) : [new THREE.Vector3(sp.x, 0, sp.z), new THREE.Vector3(hx, 0, hz + 2)];
  // Evenly spaced samples along the route (every 6 units), so the camera moves at a steady pace.
  const lookCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const len = lookCurve.getLength(), n = Math.max(4, Math.round(len / 6));
  const looks = [], cams = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = lookCurve.getPointAt(u), ahead = lookCurve.getPointAt(Math.min(1, u + 0.03));
    const dir = ahead.clone().sub(lookCurve.getPointAt(Math.max(0, u - 0.03))).setY(0).normalize();
    looks.push(p.clone().setY(p.y + 0.4));
    cams.push(p.clone().addScaledVector(dir, -BACK).setY(p.y + UP));
  }
  // Opening shot: high over the first hole (just inside the wall, so the woods outside don't
  // block the view), looking in along the route.
  const inDir = looks[Math.min(3, n)].clone().sub(looks[0]).setY(0).normalize();
  cams.unshift(new THREE.Vector3(sp.x, 0, sp.z).addScaledVector(inDir, 3).setY(17));
  looks.unshift(looks[0].clone().addScaledVector(inDir, 20));
  // Never outside the castle walls (the woods and the outer walls would fill the screen).
  for (const c of cams) { c.x = Math.min(MAP.w - 3, Math.max(3, c.x)); c.z = Math.min(MAP.h - 3, Math.max(3, c.z)); c.y = Math.max(c.y, clearOf(c.x, c.z)); }
  // Closing shot: over the mouse hole, looking down at it.
  cams.push(new THREE.Vector3(hx, 5, hz + 9)); looks.push(new THREE.Vector3(hx, 0.3, hz));
  const camC = new THREE.CatmullRomCurve3(cams, false, 'centripetal'), lookC = new THREE.CatmullRomCurve3(looks, false, 'centripetal');
  const dur = Math.max(9, Math.min(17, len / SPEED + 4));

  // Captions: where they come in (and what opens later), then where they're going.
  const later = SPAWNS.map((s, k) => ({ s, k })).filter(({ s }) => (s.opens || 1) > 1);
  const caps = [
    [0.0, `<b>${MAP.name}</b>The mice break in here: ${sp.name || 'the first hole'}.`],
    [0.3, 'They follow this trail. Build on it to stop them.'],
    ...(later.length ? [[0.55, `More ways in open later: ${later.map(({ s }) => `${s.name} on wave ${s.opens}`).join(', ')}.`]] : []),
    [0.8, '<b>The mouse hole</b>This is where they\'re going. Every mouse that gets in costs a life.'],
  ];
  let t = 0, done = false, capAt = -1;
  // The cat ends up facing back down the route, about 14 units out from the hole.
  const tail = route.length ? route[Math.max(0, route.length - 1 - 28)] : [sp.x, sp.z];
  const me = sim.cats.get(localId);
  const faceYaw = me ? Math.atan2(tail[0] - me.x, tail[1] - me.z) : Math.PI;

  const drive = (camera, dt) => {
    if (done) { caption(null); return false; }
    t += dt;
    const u = Math.min(1, t / dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;   // ease in and out
    camera.position.copy(camC.getPointAt(e)); camera.lookAt(lookC.getPointAt(e));
    let k = -1; for (let i = 0; i < caps.length; i++) if (u >= caps[i][0]) k = i;
    if (k !== capAt) { capAt = k; caption(caps[k][1]); }
    if (u >= 1) { done = true; caption(null); return false; }
    return true;
  };
  return { drive, skip: () => { done = true; }, seek: (u) => { t = u * dur; }, faceYaw, dur };   // seek: for the screenshot tests
}
