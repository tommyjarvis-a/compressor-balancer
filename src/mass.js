// Mass properties as raw moments: m, first moment M1 = ∫r dm, second moment S = ∫r rᵀ dm
// (about the world origin). Moments add linearly, so assemblies are plain sums.
// Units: mm, g, density in kg/m³ (×1e-6 → g/mm³).
export const KGM3 = 1e-6;
export const CG_MIN_MASS = 1e-12; // g; net mass at or below this (or negative) has no unique CG
export const zero = () => ({ m: 0, M1: [0, 0, 0], S: [0, 0, 0, 0, 0, 0, 0, 0, 0] });

export function add(a, b, k = 1) {
  return { m: a.m + k * b.m, M1: a.M1.map((v, i) => v + k * b.M1[i]), S: a.S.map((v, i) => v + k * b.S[i]) };
}
export const scale = (a, k) => add(zero(), a, k);

// Volume moments of a closed, outward-oriented triangle mesh (signed tetrahedra, exact for the mesh).
// pos: flat xyz array, idx: flat triangle indices. Computed about the bbox centre for precision.
export function meshMoments(pos, idx) {
  let lo = [1 / 0, 1 / 0, 1 / 0], hi = [-1 / 0, -1 / 0, -1 / 0];
  for (let i = 0; i < pos.length; i++) { const k = i % 3; if (pos[i] < lo[k]) lo[k] = pos[i]; if (pos[i] > hi[k]) hi[k] = pos[i]; }
  const o = lo.map((v, k) => (v + hi[k]) / 2);
  let V = 0; const F = [0, 0, 0], S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const p = (j, k) => pos[3 * j + k] - o[k];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = p(a, 0), ay = p(a, 1), az = p(a, 2), bx = p(b, 0), by = p(b, 1), bz = p(b, 2), cx = p(c, 0), cy = p(c, 1), cz = p(c, 2);
    const d = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx); // 6·vol
    V += d / 6;
    const s = [ax + bx + cx, ay + by + cy, az + bz + cz], P = [[ax, ay, az], [bx, by, bz], [cx, cy, cz]];
    for (let i = 0; i < 3; i++) {
      F[i] += d / 24 * s[i];
      for (let j = 0; j < 3; j++) S[3 * i + j] += d / 120 * (P[0][i] * P[0][j] + P[1][i] * P[1][j] + P[2][i] * P[2][j] + s[i] * s[j]);
    }
  }
  return translate({ m: V, M1: F, S }, o);
}

// Shift moments by translation t (body moved by +t).
export function translate(a, t) {
  const { m, M1 } = a, S = a.S.slice();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[3 * i + j] += M1[i] * t[j] + t[i] * M1[j] + m * t[i] * t[j];
  return { m, M1: M1.map((v, i) => v + m * t[i]), S };
}
// Rotate moments by 3x3 row-major R (about origin): M1' = R M1, S' = R S Rᵀ.
export function rotate(a, R) {
  const M1 = [0, 1, 2].map(i => R[3 * i] * a.M1[0] + R[3 * i + 1] * a.M1[1] + R[3 * i + 2] * a.M1[2]);
  return { m: a.m, M1, S: mul(mul(R, a.S), tr(R)) };
}
export const mul = (A, B) => A.map((_, n) => { const i = n / 3 | 0, j = n % 3; return A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]; });
export const tr = A => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];

// Derived: centre of mass and inertia tensor about the CoM (I = tr(S)·1 − S).
export function derive(a) {
  const c = a.M1.map(v => v / a.m), S = translate(a, c.map(v => -v)).S, t = S[0] + S[4] + S[8];
  return { m: a.m, c, I: S.map((v, n) => (n % 4 === 0 ? t : 0) - v) };
}

// Jacobi eigen-decomposition of a symmetric 3x3 (row-major). Returns {val:[3], vec:[[3]x3]} (vec[k] = k-th eigenvector).
export function eig3(A) {
  const a = A.slice(), V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[1] ** 2 + a[2] ** 2 + a[5] ** 2;
    if (off < 1e-30 * (a[0] ** 2 + a[4] ** 2 + a[8] ** 2 + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[3 * p + q]; if (Math.abs(apq) < 1e-300) continue;
      const th = (a[3 * q + q] - a[3 * p + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.hypot(th, 1)), c = 1 / Math.hypot(t, 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[3 * k + p], akq = a[3 * k + q]; a[3 * k + p] = c * akp - s * akq; a[3 * k + q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[3 * p + k], aqk = a[3 * q + k]; a[3 * p + k] = c * apk - s * aqk; a[3 * q + k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[3 * k + p], vkq = V[3 * k + q]; V[3 * k + p] = c * vkp - s * vkq; V[3 * k + q] = s * vkp + c * vkq; }
    }
  }
  return { val: [a[0], a[4], a[8]], vec: [0, 1, 2].map(k => [V[k], V[3 + k], V[6 + k]]) };
}

// Mesh closure check: weld vertices by position, count edges not shared by exactly two triangles in opposite directions.
export const openEdges = (pos, idx, tol) => edgeStats(pos, idx, tol).bad;
function edgeStats(pos, idx, tol = 1e-6) {
  let span = 0; for (const v of pos) span = Math.max(span, Math.abs(v));
  const q = 1 / Math.max(tol * (span || 1), 1e-12), id = new Map(), w = [];
  for (let i = 0; i < pos.length; i += 3) {
    const key = Math.round(pos[i] * q) + ',' + Math.round(pos[i + 1] * q) + ',' + Math.round(pos[i + 2] * q);
    if (!id.has(key)) id.set(key, id.size); w.push(id.get(key));
  }
  const e = new Map(), N = id.size;
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = w[idx[t + k]], b = w[idx[t + (k + 1) % 3]]; if (a === b) continue;
    const key = a < b ? a * N + b : b * N + a; e.set(key, (e.get(key) || 0) + (a < b ? 1 : -1) + 1000);
  }
  let bad = 0; for (const v of e.values()) if (v !== 2000) bad++;
  return { bad, edges: e.size };
}
// Does an imperfect mesh still give trustworthy mass properties? For a closed surface the vector area ΣA is 0
// and the signed-tetrahedron volume does not depend on the origin; with gaps it changes by t·ΣA/3 when the origin
// moves by t. eps = |ΣA|·(D/2)/(3|V|) is that relative volume ambiguity for a half-diagonal shift (the CoM ambiguity
// is of the same order). Unreliable when eps > 1e-4 or more than 5 % of the edges are open/non-manifold; a few
// bad edges with eps below the limit (T-junctions, duplicate seam nodes, slivers) only get a quiet note.
export const CLOSURE = { eps: 1e-4, frac: 0.05 };
export function meshCheck(pos, idx, V) {
  const { bad, edges } = edgeStats(pos, idx), A = [0, 0, 0], lo = [1 / 0, 1 / 0, 1 / 0], hi = [-1 / 0, -1 / 0, -1 / 0];
  for (let i = 0; i < pos.length; i++) { const k = i % 3; if (pos[i] < lo[k]) lo[k] = pos[i]; if (pos[i] > hi[k]) hi[k] = pos[i]; }
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    A[0] += (uy * vz - uz * vy) / 2; A[1] += (uz * vx - ux * vz) / 2; A[2] += (ux * vy - uy * vx) / 2;
  }
  const D = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 0, eps = bad ? Math.hypot(...A) * D / 6 / Math.abs(V) : 0, frac = edges ? bad / edges : 0;
  return { open: bad, frac, eps, unreliable: !(eps <= CLOSURE.eps) || frac > CLOSURE.frac };
}

// Tessellation error of a faceted curved surface scales ~θ² (θ = angular deflection), so two meshes at
// θ and θ/2 give a Richardson-extrapolated estimate M ≈ (4·M(θ/2) − M(θ)) / 3.
export const richardson = (coarse, fine) => add(scale(fine, 4 / 3), coarse, -1 / 3);
export const MESH = { fast: [{ linearDeflectionType: 'bounding_box_ratio', linearDeflection: 1e-4, angularDeflection: 0.05 }],
  accurate: [{ linearDeflectionType: 'bounding_box_ratio', linearDeflection: 1e-4, angularDeflection: 0.02 }, { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 2.5e-5, angularDeflection: 0.01 }] };

// Mass-weighted centre of gravity of a subset of bodies (REMOVE_* already carry sign −1).
// indices: selected body indexes. Returns {c, m, n, names, indices} or {error, ...}.
// error: 'none' (empty selection), 'zero' / 'negative' (net mass ≤ 0).
export function assemblyCG(bodies, indices) {
  const idx = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < bodies.length);
  if (!idx.length) return { error: 'none', n: 0, names: [], indices: [] };
  const tot = idx.reduce((a, i) => add(a, scale(bodies[i].vol, bodies[i].sign * bodies[i].rho * KGM3)), zero());
  const names = idx.map(i => bodies[i].name);
  if (!(tot.m > CG_MIN_MASS)) return { error: tot.m < 0 ? 'negative' : 'zero', m: tot.m, n: idx.length, names, indices: idx };
  return { c: tot.M1.map(v => v / tot.m), m: tot.m, n: idx.length, names, indices: idx };
}
