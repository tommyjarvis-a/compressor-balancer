// Deterministic Nelder–Mead on an unconstrained vector. Box bounds are handled by the caller's transform.
export function nelderMead(f, x0, { step = 0.1, iters = 2000, tol = 1e-12 } = {}) {
  const n = x0.length, S = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step; S.push(x); }
  let F = S.map(f), evals = n + 1, it = 0;
  const comb = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
  for (; it < iters; it++) {
    const o = [...F.keys()].sort((i, j) => F[i] - F[j]); const Ss = o.map(i => S[i]), Fs = o.map(i => F[i]);
    S.splice(0, n + 1, ...Ss); F = Fs;
    if (F[n] - F[0] <= tol * (Math.abs(F[0]) + tol)) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += S[i][k] / n;
    const xr = comb(c, S[n], -1), fr = f(xr); evals++;
    if (fr < F[0]) { const xe = comb(c, S[n], -2), fe = f(xe); evals++; [S[n], F[n]] = fe < fr ? [xe, fe] : [xr, fr]; }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else {
      const xc = fr < F[n] ? comb(c, S[n], -0.5) : comb(c, S[n], 0.5), fc = f(xc); evals++;
      if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; }
      else { for (let i = 1; i <= n; i++) { S[i] = comb(S[0], S[i], 0.5); F[i] = f(S[i]); } evals += n; }
    }
  }
  const b = F.indexOf(Math.min(...F));
  return { x: S[b], f: F[b], iters: it, evals };
}
