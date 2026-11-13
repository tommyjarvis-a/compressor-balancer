import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { meshMoments, derive, eig3, openEdges, richardson, MESH } from '../src/mass.js';
import { readDensities } from '../src/step-meta.js';
import { readStep } from './occt.mjs';

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

