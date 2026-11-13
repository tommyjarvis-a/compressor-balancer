import { translate, rotate } from './mass.js';
// Spin-axis frame: origin o, unit direction a. Returns R (rows u, v, a) so r' = R(r − o).
export function frame(o, a) {
  const n = Math.hypot(...a), w = a.map(x => x / n);
  const h = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [h[1] * w[2] - h[2] * w[1], h[2] * w[0] - h[0] * w[2], h[0] * w[1] - h[1] * w[0]];
  const un = Math.hypot(...u); u = u.map(x => x / un);
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  // Keep world X/Y as u/v when the axis is world Z (the common case), so residuals read as X/Y.
  if (Math.abs(w[2] - 1) < 1e-12) return { o, R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  return { o, R: [...u, ...v, ...w] };
}

// Residual imbalance about the axis. Moments in g, g·mm, g·mm².
// Static U = m·e (g·mm): first moment perpendicular to the axis.
// Couple C (g·mm²): products of inertia ∫x'z' dm, ∫y'z' dm about the axial plane through the CoM
// (equivalently −Ixz, −Iyz). With U = 0 the couple is independent of the reference plane.
export function imbalance(mom, fr) {
  const L = rotate(translate(mom, fr.o.map(v => -v)), fr.R), m = L.m;
  const zc = m ? L.M1[2] / m : 0;
  const U = [L.M1[0], L.M1[1]], C = [L.S[2] - zc * L.M1[0], L.S[5] - zc * L.M1[1]];
  return { m, zc, U, C, Umag: Math.hypot(...U), Cmag: Math.hypot(...C), e: m ? Math.hypot(...U) / m : 0 };
}

// Equivalent two-plane residuals (g·mm) at axial planes z1 < z2 (axis frame): solves
// U1 + U2 = U and z1·U1 + z2·U2 = C + zc·U (moments about the frame origin).
export function twoPlane(r, z1, z2) {
  const Mz = [r.C[0] + r.zc * r.U[0], r.C[1] + r.zc * r.U[1]], d = z2 - z1;
  const U2 = [0, 1].map(k => (Mz[k] - z1 * r.U[k]) / d), U1 = [0, 1].map(k => r.U[k] - U2[k]);
  return { U1, U2 };
}
