import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { meshMoments, derive, eig3, openEdges, meshCheck, CLOSURE, richardson, MESH } from '../src/mass.js';
import { readDensities } from '../src/step-meta.js';
import { readStep, readPasses } from './occt.mjs';

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const fix = n => new URL(`./fixtures/${n}.stp`, import.meta.url).pathname;
// Closed-form references for the synthetic fixtures (mm, density-free volume properties).
const BOX = { V: 8000, c: [25, 7, 7], I: [8000 * (400 + 100) / 12, 0, 0, 0, 8000 * (1600 + 100) / 12, 0, 0, 0, 8000 * (1600 + 400) / 12] };
const CYL = { V: Math.PI * 225 * 30, c: [0, 0, 15] }; CYL.I = [CYL.V * (3 * 225 + 900) / 12, 0, 0, 0, CYL.V * (3 * 225 + 900) / 12, 0, 0, 0, CYL.V * 225 / 2];

test('mesh moments are exact for a hand-built cube', () => {
  const P = [0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0, 0, 0, 4, 2, 0, 4, 2, 3, 4, 0, 3, 4].map((v, i) => v + [10, -5, 7][i % 3]);
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const d = derive(meshMoments(P, I));
  close(d.m, 24, 1e-9, 'V'); [11, -3.5, 9].forEach((v, k) => close(d.c[k], v, 1e-9, 'c'));
  [(9 + 16) * 2, (4 + 16) * 2, (4 + 9) * 2].forEach((v, k) => close(d.I[4 * k], v, 1e-9, 'I')); // m(b²+c²)/12 with m=24
  assert.equal(openEdges(P, I), 0); assert.ok(openEdges(P, I.slice(3)) > 0);
});

test('L6: closure check — a few bad edges on a closed surface are OK, a real gap is unreliable', async () => {
  const P = [0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0, 0, 0, 4, 2, 0, 4, 2, 3, 4, 0, 3, 4];
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const ok = meshCheck(P, I, 24); assert.deepEqual([ok.open, ok.eps, ok.unreliable], [0, 0, false]);
  // a missing triangle (3 mm² gap on a 24 mm³ box) → eps ≫ 1e-4 → unreliable
  const g = meshCheck(P, I.slice(3), meshMoments(P, I.slice(3)).m); assert.ok(g.open === 3 && g.eps > CLOSURE.eps && g.unreliable, JSON.stringify(g));
  // realistic mesh: occt cylinder (~1000 triangles)
  const [r] = await readPasses(fix('cylinder'), [{ linearDeflectionType: 'bounding_box_ratio', linearDeflection: 5e-4, angularDeflection: 0.05 }]);
  const p = [...r.meshes[0].attributes.position.array], ix = [...r.meshes[0].index.array], V = meshMoments(p, ix).m;
  assert.equal(meshCheck(p, ix, V).open, 0);
  // T-junction: split one triangle at an edge midpoint without splitting its neighbour → 3 bad edges, still closed
  const [a, b, c] = ix.slice(0, 3), n = p.length / 3, mid = [0, 1, 2].map(k => (p[3 * a + k] + p[3 * b + k]) / 2);
  const pt = [...p, ...mid], it = [a, n, c, n, b, c, ...ix.slice(3)], t = meshCheck(pt, it, meshMoments(pt, it).m);
  assert.ok(t.open === 3 && t.frac < 0.01 && t.eps < 1e-9 && !t.unreliable, JSON.stringify(t));
  // one sliver triangle dropped (area ~1e-9 of the surface): open, but the volume barely depends on it
  const area = q => { const [u, v] = [1, 2].map(j => [0, 1, 2].map(k => p[3 * ix[q + j] + k] - p[3 * ix[q] + k])); return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; };
  let qs = 0; for (let q = 0; q < ix.length; q += 3) if (area(q) < area(qs)) qs = q;
  const is = [...ix.slice(0, qs), ...ix.slice(qs + 3)], sv = meshCheck(p, is, meshMoments(p, is).m);
  assert.ok(sv.open === 3 && sv.eps < CLOSURE.eps && !sv.unreliable, JSON.stringify(sv)); // ≈7e-7 for the 0.0017 mm² sliver
  // a whole end cap missing: big gap → unreliable
  const f0 = r.meshes[0].brep_faces.find(f => { const q = 3 * f.first; return [0, 1, 2].every(j => Math.abs(p[3 * ix[q + j] + 2] - p[3 * ix[q] + 2]) < 1e-9); });
  const ic = [...ix.slice(0, 3 * f0.first), ...ix.slice(3 * f0.last + 3)];
  assert.ok(meshCheck(p, ic, meshMoments(p, ic).m).unreliable);
});

test('principal moments via Jacobi eigen-decomposition', () => {
  const e = eig3([4, 1, 0, 1, 3, 1, 0, 1, 2]), s = e.val.slice().sort((a, b) => a - b);
  [3 - Math.sqrt(3), 3, 3 + Math.sqrt(3)].forEach((v, i) => close(s[i], v, 1e-12, 'eig'));
});

test('occt-import-js meshes of box / cylinder / metre-unit box match closed form', async () => {
  for (const [k, R, tol] of [['box', BOX, 1e-12], ['box-metre', BOX, 1e-9], ['cylinder', CYL, 2e-4]]) {
    const [m] = await readStep(fix(k)), d = derive(m.vol), L = Math.cbrt(R.V), In = Math.hypot(...R.I);
    assert.equal(m.open, 0, k + ' closed');
    assert.ok(rel(d.m, R.V) < tol, `${k} V ${d.m}`); R.c.forEach((v, j) => close(d.c[j], v, tol * L, k + ' c'));
    R.I.forEach((v, j) => close(d.I[j], v, 2 * tol * In, k + ' I'));
  }
});

test('tessellation error: plain mesh converges ~θ², two-pass Richardson extrapolation is near exact', async () => {
  const [c] = await readStep(fix('cylinder'), MESH.accurate[0]), [f] = await readStep(fix('cylinder'), MESH.accurate[1]), In = Math.hypot(...CYL.I);
  const err = m => { const d = derive(m); return [rel(d.m, CYL.V), Math.hypot(...d.I.map((v, i) => v - CYL.I[i])) / In]; };
  const ec = err(c.vol), ef = err(f.vol), er = err(richardson(c.vol, f.vol));
  console.log(`  cylinder dV: θ0.02 ${ec[0].toExponential(1)}, θ0.01 ${ef[0].toExponential(1)}, extrapolated ${er[0].toExponential(1)} (dI ${er[1].toExponential(1)})`);
  assert.ok(ef[0] < ec[0] / 3 && er[0] < 1e-7 && er[1] < 1e-7);
});

test('density is read back from exported STEP', () => {
  const d = readDensities(readFileSync(fix('sector-offset'), 'latin1'));
  assert.equal(d.length, 1); assert.equal(d[0].product, 'sector'); close(d[0].density, 2700, 1e-9, 'rho');
  const r = readDensities(readFileSync(fix('rotor-unbalanced'), 'latin1')); assert.deepEqual(r.map(x => x.density), [7850, 7650, 7850, 7850]);
});

