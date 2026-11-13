import { add } from './mass.js';
import { imbalance } from './imbalance.js';
import { toolMoments, valid } from './tools.js';
import { nelderMead } from './nm.js';
// Two-plane balancing: free tool parameters (with box bounds) are mapped from unbounded u by
// x = lo + (hi − lo)(1 + sin u)/2, then J = |U|² + (w·|C|/L)² + λ·(Δm)² is minimised with Nelder–Mead
// from several deterministic starts, then polished with restarts from the best point.
export function objective(base, tools, fr, { L = 50, w = 1, lam = 0 } = {}) {
  return () => {
    let mom = base, dm = 0;
    for (const t of tools) { if (!valid(t)) return { J: 1e30, r: null, dm: 0 }; const tm = toolMoments(t); mom = add(mom, tm); dm += tm.m; }
    const r = imbalance(mom, fr);
    return { J: r.Umag ** 2 + (w * r.Cmag / L) ** 2 + lam * dm * dm, r, dm };
  };
}

export function optimize(base, tools, free, fr, opt = {}) {
  const work = structuredClone(tools), byId = new Map(work.map(t => [t.id, t])), ev = objective(base, work, fr, opt);
  const set = u => free.forEach((p, i) => { byId.get(p.id)[p.key] = p.lo + (p.hi - p.lo) * (1 + Math.sin(u[i])) / 2; });
  const f = u => { set(u); return ev().J; };
  const before = ev();
  let u = free.map(p => { const s = Math.min(1, Math.max(-1, 2 * (byId.get(p.id)[p.key] - p.lo) / (p.hi - p.lo) - 1)); return Math.asin(s); });
  // Deterministic multi-start: the current point plus low-discrepancy (golden-ratio) points in the box.
  const starts = [u];
  for (let k = 1; k <= (opt.starts ?? 8); k++) starts.push(free.map((_, i) => Math.asin(2 * ((k * (0.6180339887 + i * 0.4142135624)) % 1) - 1)));
  let best = { x: u, f: f(u) }, iters = 0, evals = 0;
  for (const x0 of starts) {
    const res = nelderMead(f, x0, { step: 0.8, iters: opt.iters ?? 1500 }); iters += res.iters; evals += res.evals;
    if (res.f < best.f) best = res;
  }
  for (let r = 0; r < (opt.restarts ?? 3); r++) { // polish
    const res = nelderMead(f, best.x, { step: 0.2 / (r + 1), iters: opt.iters ?? 1500 }); iters += res.iters; evals += res.evals;
    if (res.f < best.f * (1 - 1e-9)) best = res; else break;
  }
  set(best.x); const after = ev();
  return { tools: work, before, after, iters, evals, params: free.map(p => ({ ...p, value: byId.get(p.id)[p.key] })) };
}
