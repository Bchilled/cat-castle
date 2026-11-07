import { CATS } from '../config.js';
// portraits.js — hand-drawn cartoon portraits of the cats, as inline SVG.
// Why SVG: crisp at any size (menu cards, HUD badge, subtitle icon), tiny, and
// no image files to host. Each portrait is built from the same face kit
// (ears, head, cheeks, eyes, brows, nose, mouth, whiskers) with per-cat colours,
// expression and extras, so they read as one cast.

const INK = '#1b130f';
// Outline attributes; w = stroke width (an SVG element can't repeat an attribute).
const L = (w = 5) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const line = L();

// Almond eye. lid = how closed (0 open .. 0.8 sleepy), tilt = angry slant (+ = inner corner down).
function eye(cx, cy, side, { iris, lid = 0, tilt = 0, pupil = 'slit', size = 1, lidColor = '#888' }) {
  const w = 22 * size, h = 15 * size;
  const ix = cx - side * 0, t = tilt * side;
  const top = cy - h + lid * h * 1.6;
  return `
  <g>
    <path d="M${cx - w} ${cy + t * 4} Q${cx} ${cy - h * 1.5} ${cx + w} ${cy - t * 4} Q${cx} ${cy + h * 1.3} ${cx - w} ${cy + t * 4}Z" fill="#fffbe8" ${line}/>
    <clipPath id="e${cx}${cy}"><path d="M${cx - w} ${cy + t * 4} Q${cx} ${cy - h * 1.5} ${cx + w} ${cy - t * 4} Q${cx} ${cy + h * 1.3} ${cx - w} ${cy + t * 4}Z"/></clipPath>
    <g clip-path="url(#e${cx}${cy})">
      <circle cx="${ix}" cy="${cy}" r="${13 * size}" fill="${iris}"/>
      <circle cx="${ix}" cy="${cy}" r="${13 * size}" fill="url(#irisShade)"/>
      ${pupil === 'slit' ? `<ellipse cx="${ix}" cy="${cy}" rx="${3.2 * size}" ry="${11 * size}" fill="${INK}"/>`
        : pupil === 'pin' ? `<circle cx="${ix}" cy="${cy}" r="${2.6 * size}" fill="${INK}"/>`
        : `<ellipse cx="${ix}" cy="${cy}" rx="${6.5 * size}" ry="${9 * size}" fill="${INK}"/>`}
      <circle cx="${ix + 4 * size}" cy="${cy - 5 * size}" r="${3.2 * size}" fill="#fff"/>
      ${lid > 0 ? `<rect x="${cx - w - 2}" y="${cy - h * 2}" width="${w * 2 + 4}" height="${top - (cy - h * 2)}" fill="${lidColor}"/>
      <path d="M${cx - w} ${top} L${cx + w} ${top}" ${line}/>` : ''}
    </g>
  </g>`;
}
function brow(cx, cy, side, ang, thick = 7, len = 22) {
  const a = ang * side, dx = Math.cos(a) * len, dy = Math.sin(a) * len;
  return `<path d="M${cx - dx} ${cy - dy} L${cx + dx} ${cy + dy}" stroke="${INK}" stroke-width="${thick}" stroke-linecap="round"/>`;
}
function ear(side, { fill, inner, torn = false, tall = 1 }) {
  const x = 100 + side * 44, tip = 26 - (tall - 1) * 30;
  const notch = torn ? `L${x + side * 6} ${tip + 26} L${x + side * 16} ${tip + 20}` : '';
  return `<path d="M${x - side * 30} 92 L${x + side * 6} ${tip} ${notch} L${x + side * 26} 86 Z" fill="${fill}" ${line}/>
    <path d="M${x - side * 18} 86 L${x + side * 5} ${tip + 20} L${x + side * 14} 84 Z" fill="${inner}"/>`;
}
function whiskers(len = 46, droop = 0, col = '#fff') {
  let w = '';
  for (const side of [-1, 1]) for (const k of [0, 1, 2]) {
    const y = 140 + k * 7, x0 = 100 + side * 26;
    w += `<path d="M${x0} ${y} Q${x0 + side * len * 0.6} ${y - 4 + k * 3 + droop} ${x0 + side * len} ${y + (k - 1) * 8 + droop * 2}" stroke="${col}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>`;
  }
  return w;
}

function portrait(c) {
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="${c.bg[0]}"/><stop offset="1" stop-color="${c.bg[1]}"/></radialGradient>
    <radialGradient id="irisShade" cx="50%" cy="30%" r="70%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
    <radialGradient id="faceShade" cx="45%" cy="35%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
  </defs>
  <rect width="200" height="200" rx="22" fill="url(#bg)"/>
  ${c.behind || ''}
  <path d="M${c.bodyW ? 100 - c.bodyW : 52} 200 Q100 ${150 - (c.chest || 0)} ${c.bodyW ? 100 + c.bodyW : 148} 200 Z" fill="${c.fur}" ${line}/>
  ${ear(-1, c.earL)}${ear(1, c.earR)}
  <path d="${c.head}" fill="${c.fur}" ${line}/>
  <path d="${c.head}" fill="url(#faceShade)"/>
  ${c.markings || ''}
  <ellipse cx="100" cy="142" rx="${c.muzzleW || 30}" ry="22" fill="${c.muzzle}"/>
  ${eye(72, 112, -1, { lidColor: c.fur, ...c.eye })}${eye(128, 112, 1, { lidColor: c.fur, ...c.eye })}
  ${brow(72, 92 + (c.browY || 0), -1, c.browL ?? 0.35)}${brow(128, 92 + (c.browY || 0), 1, c.browR ?? 0.35)}
  <path d="M92 130 Q100 126 108 130 L100 139 Z" fill="${c.nose}" ${L(3.5)}/>
  ${c.mouth}
  ${whiskers(c.whiskerLen, c.whiskerDroop, c.whiskerCol)}
  ${c.extra || ''}
  ${c.collar ? `<path d="M58 186 Q100 204 142 186" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>
  <path d="M58 186 Q100 204 142 186" fill="none" stroke="${c.collar}" stroke-width="10" stroke-linecap="round"/>
  <circle cx="100" cy="199" r="7" fill="#e0c040" ${L(3)}/>` : ''}
</svg>`;
}

const HEAD_ROUND = 'M100 62 C140 62 166 84 166 118 C166 152 138 172 100 172 C62 172 34 152 34 118 C34 84 60 62 100 62 Z';
const HEAD_FLUFF = 'M100 58 C130 56 160 70 170 96 L182 104 L172 112 L184 124 L170 130 L178 146 L160 150 L162 166 L140 164 L132 178 L116 170 L100 182 L84 170 L68 178 L60 164 L38 166 L40 150 L22 146 L30 130 L16 124 L28 112 L18 104 L30 96 C40 70 70 56 100 58 Z';
const HEAD_GAUNT = 'M100 64 C136 62 158 82 160 112 C162 138 146 152 132 162 L124 176 L112 166 L100 178 L88 166 L76 176 L68 162 C54 152 38 138 40 112 C42 82 64 62 100 64 Z';
const HEAD_SLEEK = 'M100 60 C138 60 162 84 162 116 C162 150 132 172 100 174 C68 172 38 150 38 116 C38 84 62 60 100 60 Z';

// Each portrait wears the cat's collar colour (the same colour marks the cat on the radar).
const P = (kind, c) => portrait({ ...c, collar: CATS[kind].collar });

export const PORTRAITS = {
  // Fred: scruffy ginger tabby, chewed ear, snaggle tooth, cocky sneer.
  fred: P('fred', {
    bg: ['#e8a050', '#7a3a14'], fur: '#d9772f', muzzle: '#f2e8d8', nose: '#c4706a',
    earL: { fill: '#d9772f', inner: '#e8a8a0' }, earR: { fill: '#d9772f', inner: '#e8a8a0', torn: true },
    head: HEAD_ROUND, eye: { iris: '#e8c820', lid: 0.35, tilt: 1 }, browL: 0.45, browR: 0.25, browY: 2,
    markings: `<path d="M86 66 L90 84 M100 63 L100 82 M114 66 L110 84" stroke="#9a4a18" stroke-width="7" stroke-linecap="round"/>
      <path d="M40 112 L56 116 M38 126 L54 126 M160 112 L144 116 M162 126 L146 126" stroke="#9a4a18" stroke-width="6" stroke-linecap="round"/>`,
    mouth: `<path d="M84 146 Q94 156 100 146 Q108 152 120 142" fill="none" ${L(4)}/>
      <path d="M110 148 L113 158 L117 147 Z" fill="#fff" ${L(2.5)}/>`,
    whiskerLen: 44, whiskerDroop: 2, extra: `<path d="M78 200 L82 182 L90 190 L96 176 L104 188 L110 176 L116 190 L122 200 Z" fill="#f2e8d8" ${L(3)}/>`,
  }),
  // Puddin: huge fluffy calico, lazy half-shut eyes, smug little smile, big ruff.
  puddin: P('puddin', {
    bg: ['#d8e8b0', '#4a6a2a'], fur: '#f3ede0', muzzle: '#fffaf0', nose: '#e0a0a0', bodyW: 70, chest: 20,
    earL: { fill: '#d97a34', inner: '#f0b8b0' }, earR: { fill: '#2e2622', inner: '#c89898' },
    head: HEAD_FLUFF, eye: { iris: '#86b83a', lid: 0.6, tilt: -0.3, pupil: 'round' }, browL: -0.15, browR: -0.15, browY: 2,
    markings: `<path d="M60 70 C78 60 96 66 98 84 C92 104 70 104 50 96 C46 86 50 76 60 70 Z" fill="#d97a34"/>
      <path d="M118 66 C140 62 162 76 164 96 C150 104 128 100 120 90 Z" fill="#2e2622"/>`,
    mouth: `<path d="M86 148 Q100 158 114 148" fill="none" ${L(4)}/>`,
    whiskerLen: 48, whiskerDroop: 4,
  }),
  // Scary Cat: scrawny black cat, torn ears, scar, huge staring eyes, fangs, spiky fur.
  scary: P('scary', {
    bg: ['#5a4a7a', '#120e1a'], fur: '#222026', muzzle: '#38333c', nose: '#6a5a62',
    earL: { fill: '#222026', inner: '#5a4048', torn: true, tall: 1.15 }, earR: { fill: '#222026', inner: '#5a4048', torn: true, tall: 1.1 },
    head: HEAD_GAUNT, eye: { iris: '#c8e030', tilt: 0.6, pupil: 'pin', size: 1.12 }, browL: 0.55, browR: 0.6, browY: -4,
    behind: `<path d="M30 200 L40 168 L52 184 L58 160 L72 178 L80 156 L100 172 L120 156 L128 178 L142 160 L148 184 L160 168 L170 200 Z" fill="#222026" ${line}/>`,
    markings: `<path d="M56 92 L84 128" stroke="#b07a80" stroke-width="4" stroke-linecap="round"/>
      <path d="M58 98 L64 94 M66 108 L72 104 M74 118 L80 114" stroke="#b07a80" stroke-width="3" stroke-linecap="round"/>
      <path d="M134 150 L146 156" stroke="#4a454e" stroke-width="5" stroke-linecap="round"/>`,
    mouth: `<path d="M82 148 Q100 162 118 148 Q100 154 82 148 Z" fill="#7a2a30" ${L(3.5)}/>
      <path d="M88 149 L91 160 L94 150 Z M106 150 L109 160 L112 149 Z" fill="#fff" ${L(2)}/>`,
    whiskerLen: 40, whiskerDroop: -3, whiskerCol: '#bbb',
  }),
  // Nebbie: sleek grey, clever blue eyes, one eyebrow raised, knowing smirk, collar.
  nebbie: P('nebbie', {
    bg: ['#a8d8f0', '#2a4a6a'], fur: '#8d949c', muzzle: '#e6e9ec', nose: '#d89aa0', bodyW: 44,
    earL: { fill: '#8d949c', inner: '#e8b8c0', tall: 1.12 }, earR: { fill: '#8d949c', inner: '#e8b8c0', tall: 1.12 },
    head: HEAD_SLEEK, eye: { iris: '#3ab0f0', lid: 0.15, pupil: 'slit' }, browL: 0.15, browR: -0.35, browY: -2,
    markings: `<path d="M84 66 L88 80 M100 62 L100 78 M116 66 L112 80" stroke="#6d747c" stroke-width="5" stroke-linecap="round"/>`,
    mouth: `<path d="M86 146 Q96 152 100 146 Q108 154 118 144" fill="none" ${L(4)}/>`,
    whiskerLen: 62, whiskerDroop: 0,

  }),
  // Casper: pure-white pedigree, odd eyes (blue + gold), furious brows, fangs bared, gold collar with a ruby.
  casper: P('casper', {
    bg: ['#f0a0a0', '#7a1a1a'], fur: '#f7f5f1', muzzle: '#ffffff', nose: '#f0a8b0', bodyW: 60, chest: 12,
    earL: { fill: '#f7f5f1', inner: '#f4c4c8' }, earR: { fill: '#f7f5f1', inner: '#f4c4c8' },
    head: HEAD_FLUFF, eye: { iris: '#3a90f0', tilt: 1.2, pupil: 'slit' }, browL: 0.65, browR: 0.65, browY: 0,
    markings: `<path d="M50 120 Q60 112 70 120 M130 120 Q140 112 150 120" stroke="#e8e0d8" stroke-width="3" fill="none"/>`,
    mouth: `<path d="M80 146 Q100 166 120 146 Q100 152 80 146 Z" fill="#8a2a30" ${L(3.5)}/>
      <path d="M86 147 L89 159 L93 148 Z M107 148 L111 159 L114 147 Z" fill="#fff" ${L(2)}/>`,
    whiskerLen: 50, whiskerDroop: -2, whiskerCol: '#d8d8d8',
    extra: `<circle cx="128" cy="112" r="12" fill="#e0b020"/><ellipse cx="128" cy="112" rx="3.2" ry="10" fill="${INK}"/><circle cx="132" cy="107" r="3" fill="#fff"/>
`,
  }),
  // Meow Meow: grey tabby with a white beard and chest, big friendly amber eyes, happy smile, leaf behind her ear.
  meow: P('meow', {
    bg: ['#c8e8a0', '#3a6a3a'], fur: '#86827e', muzzle: '#f6f4f0', nose: '#d89090', bodyW: 50, chest: 14, muzzleW: 36,
    earL: { fill: '#86827e', inner: '#e8b8b0' }, earR: { fill: '#86827e', inner: '#e8b8b0' },
    head: HEAD_ROUND, eye: { iris: '#e0a030', tilt: -0.6, pupil: 'round', size: 1.1 }, browL: -0.12, browR: -0.12, browY: -9,
    markings: `<path d="M86 66 L89 82 M100 63 L100 80 M114 66 L111 82" stroke="#5c5854" stroke-width="6" stroke-linecap="round"/>
      <path d="M40 110 L54 114 M160 110 L146 114" stroke="#5c5854" stroke-width="5" stroke-linecap="round"/>
      <path d="M70 150 Q100 186 130 150 Q100 162 70 150 Z" fill="#f6f4f0"/>`,
    mouth: `<path d="M86 144 Q93 154 100 145 Q107 154 114 144" fill="none" ${L(4)}/>`,
    whiskerLen: 46, whiskerDroop: 1,
    extra: `<path d="M52 194 Q100 168 148 194" fill="#f6f4f0"/>
      <path d="M44 40 Q30 52 40 70 Q56 58 44 40 Z" fill="#6aaa3a" ${L(3)}/><path d="M44 42 L41 66" stroke="#3a6a2a" stroke-width="2"/>`,
  }),
  // Mimo: frisky brown-grey mackerel tabby. "M" on the forehead, cheeky wink, eyebrow up, grin.
  mimo: P('mimo', {
    bg: ['#f0c8a0', '#6a3a2a'], fur: '#8c7e6a', muzzle: '#ece4d4', nose: '#c88a80', bodyW: 54, chest: 10,
    earL: { fill: '#8c7e6a', inner: '#e0b0a0' }, earR: { fill: '#8c7e6a', inner: '#e0b0a0' },
    head: HEAD_ROUND, eye: { iris: '#b8d030', tilt: 0, pupil: 'slit', size: 1.05 }, browL: -0.1, browR: -0.45, browY: -6,
    markings: `<path d="M80 84 L88 68 L100 80 L112 68 L120 84" fill="none" stroke="#3a3028" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M38 108 L56 112 M36 122 L54 122 M162 108 L144 112 M164 122 L146 122" stroke="#3a3028" stroke-width="6" stroke-linecap="round"/>
      <path d="M64 58 C70 62 74 64 80 64 M136 58 C130 62 126 64 120 64" stroke="#3a3028" stroke-width="5" stroke-linecap="round" fill="none"/>`,
    mouth: `<path d="M82 144 Q100 162 120 142" fill="none" ${L(4)}/><path d="M112 150 Q116 160 108 158" fill="#d86a70" ${L(2.5)}/>`,
    whiskerLen: 48, whiskerDroop: 0,
    // Winking: his left eye is a happy closed curve.
    extra: `<ellipse cx="72" cy="110" rx="25" ry="20" fill="#8c7e6a"/><path d="M52 114 Q72 98 92 114" fill="none" ${L(5)}/>`,
  }),
};

export const portraitURL = (kind) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PORTRAITS[kind] || PORTRAITS.fred);
