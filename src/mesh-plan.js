// Tessellation planning: deflection relative to the bounding-box diagonal D (mm, clamped) plus triangle
// budgets. Root cause of the 0.1.1 freeze: fixed fine settings (bbox ratio 1e-4 / 2.5e-5, 0.02 / 0.01 rad)
// that cost 1.5M–12M triangles and 100–600 s of blocking WASM on ordinary filleted parts.
// Triangle count is predicted from a coarse probe pass as T ≈ T0 · max(d0/d, (θ0/θ)²) (linear- vs
// angle-limited faces; conservative), and the mesh is coarsened until the prediction fits the budget.
export const LIMITS = {
  ratio: 5.8e-5,          // linear deflection / D  (= 1e-4 of the average bbox side, as in 0.1.x)
  minDefl: 1e-4, maxDefl: 1, // mm
  angular: { fast: 0.05, accurate: 0.02 }, maxAngular: 0.5,
  perBody: 600e3, total: 1.2e6, // triangles in the final pass
  refine: 4,              // pass 2: deflection/4, angle/2 → ≈4× triangles
};
export const PROBE = { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.01, angularDeflection: 0.5 };

// OCCT parameters; scale ≥ 1 coarsens (deflection ×scale, angle ×√scale), pass 2 refines.
export function passParams(D, mode, scale = 1, pass = 1, L = LIMITS) {
  const k = pass === 2 ? L.refine : 1;
  const d = Math.min(L.maxDefl, Math.max(L.minDefl, L.ratio * D * scale)) / k;
  return { linearDeflectionType: 'absolute_value', linearDeflection: d, angularDeflection: Math.min(L.maxAngular, L.angular[mode] * Math.sqrt(scale)) / Math.sqrt(k) };
}

export function predict(probeTris, D, p) {
  const d0 = PROBE.linearDeflection * D / Math.sqrt(3), th0 = PROBE.angularDeflection; // probe: ratio × average side
  const f = Math.max(d0 / p.linearDeflection, (th0 / p.angularDeflection) ** 2, 1);
  return probeTris.map(t => t * f);
}

// Plan from the probe: coarsening scale so that the final pass fits both budgets, and whether the refined
// (accurate) pass is planned. Returns warnings for the UI.
export function plan(probeTris, D, mode, L = LIMITS) {
  const warn = [], refine = mode === 'accurate', k = refine ? L.refine : 1;
  const fit = s => { const t = predict(probeTris, D, passParams(D, mode, s, 1, L)).map(v => v * k); return Math.max(t.reduce((a, b) => a + b, 0) / L.total, Math.max(0, ...t) / L.perBody); };
  let s = 1, capped = false;
  for (let i = 0; i < 40 && fit(s) > 1; i++) {
    const n = s * Math.max(1.25, Math.min(4, fit(s))), a = passParams(D, mode, s, 1, L), b = passParams(D, mode, n, 1, L);
    if (a.linearDeflection === b.linearDeflection && a.angularDeflection === b.angularDeflection) { capped = true; break; } // clamps reached
    s = n;
  }
  if (capped) warn.push(`coarsest mesh settings reached and the predicted size still exceeds the triangle budget`);
  if (s > 1) warn.push(`mesh coarsened ×${s < 1e4 ? s.toFixed(1) : s.toExponential(1)} to stay within ${fmtK(L.total)} triangles (${fmtK(L.perBody)} per body); accuracy is lower — see the per-body uncertainty`);
  return { scale: s, refine, warn, base: passParams(D, mode, s, 1, L), fine: refine ? passParams(D, mode, s, 2, L) : null };
}
// After the base pass: run the refined pass only if ≈refine × actual triangles fits the budgets.
export function refineOk(tris, L = LIMITS) {
  const total = tris.reduce((a, b) => a + b, 0) * L.refine, max = Math.max(0, ...tris) * L.refine;
  return total <= L.total && max <= L.perBody;
}
export function diagonal(meshes) {
  const lo = [1 / 0, 1 / 0, 1 / 0], hi = [-1 / 0, -1 / 0, -1 / 0];
  for (const m of meshes) { const p = m.attributes.position.array; for (let i = 0; i < p.length; i++) { const k = i % 3; if (p[i] < lo[k]) lo[k] = p[i]; if (p[i] > hi[k]) hi[k] = p[i]; } }
  return lo[0] <= hi[0] ? Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) : 0;
}
export const triCounts = meshes => meshes.map(m => m.index.array.length / 3);
export const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1e3) + 'k';
