import { eig3 } from './mass.js';
// Spin-axis picking from mesh data (mm). OCCT tessellates each B-rep face separately and occt-import-js reports
// its triangle range (brep_faces: first..last), so one picked triangle gives the whole face.
// Every fit returns { p, d, r, rms } (point on the axis, unit direction, radius, relative RMS) or { error }.
export const FIT = { rms: 0.01, flat: 1e-3, spread: 1e-4, gap: Math.PI / 3 }; // max RMS/r; max λ0/λ1 (normals); min λ1/λ2 (curvature); max loop gap
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
const V = (pos, i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
// Deterministic sign: the largest component of a direction is positive.
export const canon = d => { const k = [0, 1, 2].reduce((b, i) => Math.abs(d[i]) > Math.abs(d[b]) + 1e-12 ? i : b, 0); return d[k] < 0 ? d.map(v => -v || 0) : d; };
// Index of the B-rep face (faces: flat [first, last, …] triangle ranges) holding triangle t.
export function faceOf(faces, t) { for (let f = 0; f < faces.length; f += 2) if (t >= faces[f] && t <= faces[f + 1]) return [faces[f], faces[f + 1]]; return null; }
// In-plane basis (u, v) for normal n.
function basis(n) { const h = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = unit(cross(h, n)); return [u, cross(n, u)]; }
// Kåsa circle fit of 3-D points projected onto the plane ⊥ n through their centroid.
function circle(pts, n) {
  const c0 = pts.reduce((a, p) => a.map((v, k) => v + p[k] / pts.length), [0, 0, 0]), [u, v] = basis(n);
  const q = pts.map(p => { const d = sub(p, c0); return [dot(d, u), dot(d, v)]; }), A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
  for (const [x, y] of q) { const row = [x, y, 1], z = -(x * x + y * y); for (let i = 0; i < 3; i++) { b[i] += row[i] * z; for (let j = 0; j < 3; j++) A[3 * i + j] += row[i] * row[j]; } }
  const s = solve3(A, b); if (!s) return null;
  const cx = -s[0] / 2, cy = -s[1] / 2, r = Math.sqrt(cx * cx + cy * cy - s[2]);
  const rms = Math.sqrt(q.reduce((a, [x, y]) => a + (Math.hypot(x - cx, y - cy) - r) ** 2, 0) / q.length) / r;
  return { c: [0, 1, 2].map(k => c0[k] + cx * u[k] + cy * v[k]), r, rms };
}
function solve3(A, b) { // Cramer's rule
  const det = M => M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]), D = det(A);
  if (!(Math.abs(D) > 1e-300)) return null;
  return [0, 1, 2].map(k => det(A.map((v, n) => n % 3 === k ? b[n / 3 | 0] : v)) / D);
}
function uniq(pos, idx, first, last) {
  const seen = new Set(), out = []; for (let t = first; t <= last; t++) for (let k = 0; k < 3; k++) { const i = idx[3 * t + k]; if (!seen.has(i)) { seen.add(i); out.push(V(pos, i)); } } return out;
}
const bad = (f, what) => !f || !isFinite(f.r) || !(f.r > 0) ? { error: `${what}: circle fit failed` } : f.rms > FIT.rms ? { error: `${what}: points are not on a circle (RMS ${(100 * f.rms).toFixed(1)} % of r, limit ${100 * FIT.rms} %)` } : null;

// Cylindrical face → its axis. Facet normals of a cylinder are all ⊥ the axis, so the axis is the null vector of
// N = Σ area·n nᵀ (smallest eigenvalue λ0 ≪ λ1); the radius and axis position come from a circle fit of the face's
// vertices projected along it. Cones, spheres, tori, planes and freeform faces are rejected.
export function fitCylinder(pos, idx, first, last) {
  const N = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let t = first; t <= last; t++) {
    const a = V(pos, idx[3 * t]), n = cross(sub(V(pos, idx[3 * t + 1]), a), sub(V(pos, idx[3 * t + 2]), a)), A = Math.hypot(...n); if (!A) continue;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) N[3 * i + j] += n[i] * n[j] / A;
  }
  const e = eig3(N), o = [0, 1, 2].sort((i, j) => e.val[i] - e.val[j]), [l0, l1, l2] = o.map(i => e.val[i]);
  if (!(l1 > FIT.spread * l2)) return { error: 'picked face is flat (not a cylinder) — use "circle" for a planar face or hole edge' };
  if (!(l0 < FIT.flat * l1)) return { error: 'picked face is not cylindrical (cone, sphere, torus or freeform)' };
  const d = canon(unit(e.vec[o[0]])), f = circle(uniq(pos, idx, first, last), d), no = bad(f, 'cylinder');
  return no || { p: f.c, d, r: f.r, rms: f.rms };
}

// Circular edge loop of a face (hole, boss, planar circular face, end of a cylinder) → its centre and normal.
// Boundary edges of the face's triangles are grouped into loops; the loop nearest the picked point is fitted
// with a plane (smallest-variance direction) and a circle in that plane.
export function fitLoop(pos, idx, first, last, hit) {
  let span = 0; for (let t = first; t <= last; t++) for (let k = 0; k < 3; k++) { const p = V(pos, idx[3 * t + k]); span = Math.max(span, ...p.map(Math.abs)); }
  const q = 1e6 / (span || 1), id = new Map(), w = new Map(), P = [];
  const weld = i => { if (w.has(i)) return w.get(i); const p = V(pos, i), key = p.map(v => Math.round(v * q)).join(); if (!id.has(key)) { id.set(key, P.length); P.push(p); } w.set(i, id.get(key)); return id.get(key); };
  const E = new Map();
  for (let t = first; t <= last; t++) for (let k = 0; k < 3; k++) {
    const a = weld(idx[3 * t + k]), b = weld(idx[3 * t + (k + 1) % 3]); if (a === b) continue;
    const key = a < b ? a + ',' + b : b + ',' + a; E.set(key, (E.get(key) || 0) + 1);
  }
  const par = P.map((_, i) => i), root = i => par[i] === i ? i : (par[i] = root(par[i]));
  const on = new Set(); for (const [key, n] of E) if (n === 1) { const [a, b] = key.split(',').map(Number); on.add(a); on.add(b); par[root(a)] = root(b); }
  if (!on.size) return { error: 'picked face has no boundary loop' };
  const groups = new Map(); for (const i of on) { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(P[i]); }
  let best = null, bd = 1 / 0;
  for (const g of groups.values()) for (const p of g) { const dd = Math.hypot(...sub(p, hit)); if (dd < bd) { bd = dd; best = g; } }
  if (best.length < 6) return { error: `edge loop has only ${best.length} points — not a circle` };
  const c = best.reduce((a, p) => a.map((v, k) => v + p[k] / best.length), [0, 0, 0]), C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of best) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] += d[i] * d[j]; }
  const e = eig3(C), o = [0, 1, 2].sort((i, j) => e.val[i] - e.val[j]), d = canon(unit(e.vec[o[0]]));
  const f = circle(best, d), no = bad(f, 'edge loop'); if (no) return no;
  const flat = Math.sqrt(Math.max(0, e.val[o[0]]) / best.length) / f.r;
  if (flat > FIT.rms) return { error: `edge loop is not planar (${(100 * flat).toFixed(1)} % of r)` };
  // a closed circular loop has points all the way round: reject large angular gaps (e.g. a narrow
  // rectangle's four corners are concyclic)
  const [u, v] = basis(d), ang = best.map(p => { const q = sub(p, f.c); return Math.atan2(dot(q, v), dot(q, u)); }).sort((a, b) => a - b);
  const gap = Math.max(...ang.map((a, i) => (i ? a - ang[i - 1] : a + 2 * Math.PI - ang.at(-1))));
  if (gap > FIT.gap) return { error: `edge loop is not a full circle (gap of ${(gap * 180 / Math.PI).toFixed(0)}°)` };
  return { p: f.c, d, r: f.r, rms: Math.max(f.rms, flat) };
}

// Typed or two-point axis: unit direction, non-zero, finite.
export function makeAxis(p, d) {
  if (![...p, ...d].every(Number.isFinite)) return { error: 'axis point and direction must be numbers' };
  const n = Math.hypot(...d); if (!(n > 1e-12)) return { error: 'axis direction must be non-zero' };
  return { p: p.slice(), d: d.map(v => v / n || 0) };
}
