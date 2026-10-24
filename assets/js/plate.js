// The plate: Nourished's signature graphic. A ceramic plate whose inner ring
// shows how the day's energy splits between carbohydrates, protein and fat.

const NS = 'http://www.w3.org/2000/svg';
const R = 66;                // ring radius in a 200 x 200 viewBox
const C = 2 * Math.PI * R;   // ring circumference
const GAP = 2.2;             // gap between segments, in px of circumference

const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

let gradId = 0;

function base(label) {
  const id = `rim${++gradId}`;
  const svg = s('svg', { viewBox: '0 0 200 200', class: 'plate-svg', role: 'img' });
  const title = s('title');
  title.textContent = label;
  svg.append(title);
  const defs = s('defs');
  const g = s('radialGradient', { id, cx: '50%', cy: '45%', r: '60%' });
  g.append(s('stop', { offset: '70%', 'stop-color': '#F1E6D7' }), s('stop', { offset: '100%', 'stop-color': '#E2CFB7' }));
  defs.append(g);
  svg.append(defs);
  svg.append(s('circle', { cx: 100, cy: 100, r: 98, fill: `url(#${id})` }));
  svg.append(s('circle', { cx: 100, cy: 100, r: 84, fill: '#FFFDF8', stroke: '#E5D2BB', 'stroke-width': 1 }));
  svg.append(s('circle', { cx: 100, cy: 100, r: 80, fill: 'none', stroke: '#F3EADF', 'stroke-width': 1 }));
  svg.append(s('circle', { cx: 100, cy: 100, r: R, fill: 'none', stroke: '#EFE3D3', 'stroke-width': 13, class: 'track' }));
  const ring = s('g', { transform: 'rotate(-90 100 100)', class: 'ring' });
  svg.append(ring);
  const big = s('text', { x: 100, y: 101, 'text-anchor': 'middle', class: 'plate-big', 'font-size': 30 });
  const small = s('text', { x: 100, y: 124, 'text-anchor': 'middle', class: 'plate-small', 'font-size': 11.5 });
  svg.append(big, small);
  return svg;
}

/**
 * parts: [{ value, color }] in kcal. scale: the kcal that fills the whole ring
 * (defaults to the sum of parts). big/small: centre text. label: accessible description.
 */
export function renderPlate(container, { parts, scale, big, small, label }) {
  let svg = container.querySelector('svg.plate-svg');
  if (!svg) {
    svg = base(label || '');
    container.replaceChildren(svg);
  }
  svg.querySelector('title').textContent = label || '';
  const ring = svg.querySelector('.ring');
  const total = parts.reduce((a, p) => a + Math.max(0, p.value || 0), 0);
  const full = scale && scale > 0 ? Math.max(scale, total) : total;

  // ensure the right number of segment circles
  while (ring.children.length < parts.length) {
    ring.append(s('circle', {
      cx: 100, cy: 100, r: R, fill: 'none', 'stroke-width': 13, class: 'seg',
      'stroke-dasharray': `0 ${C}`, 'stroke-dashoffset': 0, 'stroke-linecap': 'butt',
    }));
  }
  while (ring.children.length > parts.length) ring.lastChild.remove();

  let offset = 0;
  const visible = parts.filter((p) => p.value > 0).length;
  parts.forEach((p, i) => {
    const seg = ring.children[i];
    const len = full > 0 ? (Math.max(0, p.value || 0) / full) * C : 0;
    const gap = visible > 1 && len > GAP * 2 ? GAP : 0;
    const drawn = Math.max(0, len - gap);
    seg.setAttribute('stroke', p.color);
    const start = offset;
    // next frame, so the transition runs from the previous value
    requestAnimationFrame(() => {
      seg.setAttribute('stroke-dasharray', `${drawn} ${C}`);
      seg.setAttribute('stroke-dashoffset', `${-start}`);
    });
    offset += len;
  });

  svg.querySelector('.plate-big').textContent = big ?? '';
  svg.querySelector('.plate-small').textContent = small ?? '';
}

/** Singapore's My Healthy Plate: half fruit and vegetables, quarter wholegrains, quarter protein. */
export function healthyPlate(container) {
  const svg = s('svg', { viewBox: '0 0 200 200', class: 'plate-svg', role: 'img' });
  const t = s('title');
  t.textContent = 'A plate split into half fruit and vegetables, a quarter wholegrains and a quarter protein';
  svg.append(t);
  svg.append(s('circle', { cx: 100, cy: 100, r: 98, fill: '#E9DAC6' }));
  svg.append(s('circle', { cx: 100, cy: 100, r: 86, fill: '#FFFDF8', stroke: '#E5D2BB' }));
  const r = 76;
  const wedge = (a0, a1, fill) => {
    const p = (a) => [100 + r * Math.cos((a - 90) * Math.PI / 180), 100 + r * Math.sin((a - 90) * Math.PI / 180)];
    const [x0, y0] = p(a0); const [x1, y1] = p(a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return s('path', { d: `M100 100 L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`, fill, stroke: '#FFFDF8', 'stroke-width': 3 });
  };
  svg.append(wedge(0, 180, '#777354'), wedge(180, 270, '#C4973F'), wedge(270, 360, '#B85C3F'));
  const label = (x, y, text) => {
    const el = s('text', { x, y, 'text-anchor': 'middle', fill: '#FFFDF8', 'font-size': 14, 'font-weight': 700, 'font-family': 'Inter, sans-serif' });
    el.textContent = text;
    return el;
  };
  svg.append(label(140, 96, 'Fruit'), label(140, 113, '& veg'));
  svg.append(label(66, 148, 'Grains'));
  svg.append(label(66, 66, 'Protein'));
  container.replaceChildren(svg);
}

export const MACRO_COLORS = { carbs: '#777354', protein: '#8F3F2B', fat: '#C4973F' };

/** Convenience: parts from grams. */
export const partsFromGrams = ({ carbs = 0, protein = 0, fat = 0 }) => [
  { value: carbs * 4, color: MACRO_COLORS.carbs },
  { value: protein * 4, color: MACRO_COLORS.protein },
  { value: fat * 9, color: MACRO_COLORS.fat },
];
