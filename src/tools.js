import { KGM3, rotate, translate } from './mass.js';
// Parametric correction bodies: a planar profile in local XY, extruded along local +Z over [0, h],
// then rotated (Rz·Ry·Rx, degrees) and translated to (x, y, z). Mass properties are exact (closed form).
const D = Math.PI / 180;
export const KINDS = {
  cylinder: { r: 10, ri: 0 },
  sector: { ri: 20, ro: 40, a0: 0, sweep: 90 },
  prism: { sc: 1, pts: [[0, 0], [20, 0], [20, 10], [0, 10]] },
};
export const COMMON = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, h: 5, rho: 7850, sign: 1 };
export const PARAMS = { cylinder: ['r', 'ri'], sector: ['ri', 'ro', 'a0', 'sweep'], prism: ['sc'] };
export const COMMON_PARAMS = ['h', 'x', 'y', 'z', 'rx', 'ry', 'rz', 'rho'];

let seq = 0;
export function makeTool(kind, o = {}) {
  return { id: ++seq, kind, role: 'counterweight', name: kind + seq, ...COMMON, ...structuredClone(KINDS[kind]), ...o };
}

export function rotMat(t) {
  const [a, b, c] = [t.rx * D, t.ry * D, t.rz * D], [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  // Rz(c)·Ry(b)·Rx(a)
  return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa, sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa, -sb, cb * sa, cb * ca];
}

const ring = t => t.kind === 'cylinder' ? { ri: t.ri, ro: t.r, a0: 0, sw: 360 } : { ri: t.ri, ro: t.ro, a0: t.a0, sw: t.sweep };
const polyPts = t => {
  let p = t.pts.map(([x, y]) => [x * t.sc, y * t.sc]);
  let A = 0; p.forEach((a, i) => { const b = p[(i + 1) % p.length]; A += a[0] * b[1] - b[0] * a[1]; });
  return A < 0 ? p.reverse() : p; // CCW
};

// Planar region integrals [∫1, ∫x, ∫y, ∫x², ∫xy, ∫y²] dA.
export function region(t) {
  if (t.kind === 'prism') {
    const p = polyPts(t), r = [0, 0, 0, 0, 0, 0];
    p.forEach(([x0, y0], i) => {
      const [x1, y1] = p[(i + 1) % p.length], c = x0 * y1 - x1 * y0;
      r[0] += c / 2; r[1] += (x0 + x1) * c / 6; r[2] += (y0 + y1) * c / 6;
      r[3] += (x0 * x0 + x0 * x1 + x1 * x1) * c / 12; r[4] += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c / 24; r[5] += (y0 * y0 + y0 * y1 + y1 * y1) * c / 12;
    });
    return r;
  }
  const { ri, ro, a0, sw } = ring(t), a = a0 * D, b = (a0 + sw) * D, R2 = (ro ** 2 - ri ** 2) / 2, R3 = (ro ** 3 - ri ** 3) / 3, R4 = (ro ** 4 - ri ** 4) / 4;
  const d2 = (Math.sin(2 * b) - Math.sin(2 * a)) / 4, dA = b - a;
  return [dA * R2, R3 * (Math.sin(b) - Math.sin(a)), R3 * (Math.cos(a) - Math.cos(b)), R4 * (dA / 2 + d2), R4 * (Math.sin(b) ** 2 - Math.sin(a) ** 2) / 2, R4 * (dA / 2 - d2)];
}

export function valid(t) {
  if (!(t.h > 0) || !(t.rho > 0)) return false;
  if (t.kind === 'prism') return t.sc > 0 && t.pts.length >= 3 && Math.abs(region(t)[0]) > 0;
  const { ri, ro, sw } = ring(t);
  return ri >= 0 && ro > ri && sw > 0 && sw <= 360;
}

// World moments of a tool (g, g·mm, g·mm²); removal tools (sign −1) give negative mass.
export function toolMoments(t) {
  const [A, Sx, Sy, Sxx, Sxy, Syy] = region(t), h = t.h, k = t.rho * KGM3 * (t.sign < 0 ? -1 : 1), h2 = h * h / 2;
  const loc = { m: k * A * h, M1: [k * h * Sx, k * h * Sy, k * A * h2], S: [h * Sxx, h * Sxy, Sx * h2, h * Sxy, h * Syy, Sy * h2, Sx * h2, Sy * h2, A * h ** 3 / 3].map(v => k * v) };
  return translate(rotate(loc, rotMat(t)), [t.x, t.y, t.z]);
}

// Boundary loops (local XY) as line / arc segments; outer loop CCW, holes CW. Angles in radians.
export function loops(t) {
  if (t.kind === 'prism') { const p = polyPts(t); return [p.map((a, i) => ({ t: 'L', p: a, q: p[(i + 1) % p.length] }))]; }
  const { ri, ro, a0, sw } = ring(t), a = a0 * D, b = (a0 + sw) * D, P = (r, th) => [r * Math.cos(th), r * Math.sin(th)];
  const arc = (r, s, e) => ({ t: 'A', r, a0: s, a1: e, p: P(r, s), q: P(r, e) });
  if (sw >= 360) {
    const m = a + Math.PI, out = [arc(ro, a, m), arc(ro, m, a + 2 * Math.PI)];
    return ri > 0 ? [out, [arc(ri, a + 2 * Math.PI, m), arc(ri, m, a)]] : [out];
  }
  if (ri > 0) return [[arc(ro, a, b), { t: 'L', p: P(ro, b), q: P(ri, b) }, arc(ri, b, a), { t: 'L', p: P(ri, a), q: P(ro, a) }]];
  return [[arc(ro, a, b), { t: 'L', p: P(ro, b), q: [0, 0] }, { t: 'L', p: [0, 0], q: P(ro, a) }]];
}
