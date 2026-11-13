import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { LIMITS, PROBE, ERR, passParams, predict, plan, refineOk } from '../src/mesh-plan.js';
import { importStep } from '../src/import-core.js';
import { derive } from '../src/mass.js';
import { toolMoments } from '../src/tools.js';
import { FIX } from './fixtures.mjs';

const occtP = createRequire(import.meta.url)('../vendor/occt-import-js/occt-import-js.js')();
const fix = n => new Uint8Array(readFileSync(new URL(`./fixtures/${n}.stp`, import.meta.url)));
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

test('deflection is relative to the bbox diagonal and clamped', () => {
  assert.equal(passParams(100, 'accurate').linearDeflection, LIMITS.ratio * 100);
  assert.equal(passParams(1e-3, 'fast').linearDeflection, LIMITS.minDefl);
  assert.equal(passParams(1e6, 'fast').linearDeflection, LIMITS.maxDefl);
  const b = passParams(100, 'accurate'), f = passParams(100, 'accurate', 1, 2);
  assert.ok(Math.abs(f.linearDeflection - b.linearDeflection / 4) < 1e-15 && Math.abs(f.angularDeflection - b.angularDeflection / 2) < 1e-15);
  assert.ok(passParams(100, 'fast', 1e6).angularDeflection <= LIMITS.maxAngular);
});

test('plan keeps the predicted final pass within the per-body and total triangle budgets', () => {
  const ok = plan([100, 200], 50, 'accurate'); assert.equal(ok.scale, 1); assert.equal(ok.warn.length + ok.note.length, 0); assert.ok(ok.refine);
  for (const probe of [[3280], [25828, 400], [5e4, 5e4, 5e4, 5e4]]) for (const mode of ['fast', 'accurate']) {
    const k = mode === 'accurate' ? LIMITS.refine : 1, p = plan(probe, 120, mode), t = predict(probe, 120, p.base).map(v => v * k);
    const t1 = predict(probe, 120, passParams(120, mode)).map(v => v * k), needs = t1.reduce((a, b) => a + b, 0) > LIMITS.total || Math.max(...t1) > LIMITS.perBody;
    assert.equal(p.scale > 1, needs); assert.equal(p.note.length > 0, needs, 'note iff coarsened'); assert.equal(p.warn.length, 0);
    assert.ok(t.reduce((a, b) => a + b, 0) <= LIMITS.total * 1.0001 && Math.max(...t) <= LIMITS.perBody * 1.0001, `${probe} ${mode} → ${t}`);
  }
  // the 0.1.1 settings on the QA-like filleted shaft: probe 3280 tris → prediction ≥ the measured 1.49M
  assert.ok(predict([3280], 140, { linearDeflection: 1e-4 * 140 / Math.sqrt(3), angularDeflection: 0.02 })[0] >= 1.49e6);
  assert.ok(refineOk([1000, 2000])); assert.ok(!refineOk([LIMITS.perBody / 2])); assert.ok(!refineOk(new Array(10).fill(LIMITS.total / 30)));
});

test('importStep falls back to fast mode (with a warning) when the refined pass would exceed the budget', () => {
  // fake occt whose real triangle count is 10× what the probe-based prediction expects
  const calls = [], occt = { ReadStepFile: (_, p) => { calls.push(p);
    const n = p.linearDeflectionType === PROBE.linearDeflectionType ? 1000 : Math.round(10 * predict([1000], Math.sqrt(3e4), p)[0]);
    return { success: true, meshes: [{ name: 'b', attributes: { position: { array: [0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100] } }, index: { array: new Array(3 * n).fill(0) } }] }; } };
  const r = importStep(occt, new Uint8Array(1), { mode: 'accurate' });
  assert.equal(r.stats.mode, 'fast'); assert.ok(r.warn.some(w => /fell back to fast/.test(w)), r.warn.join());
  assert.equal(calls.length, 2, 'probe + base only');
});

test('importStep pipeline accuracy on fixtures (accurate mode, within budget)', async () => {
  const occt = await occtP;
  for (const [k, tol] of [['cylinder', 1e-7], ['sector-offset', 1e-7], ['box', 1e-12], ['rotor-unbalanced', 1e-6]]) {
    const r = importStep(occt, fix(k), { mode: 'accurate' });
    assert.equal(r.stats.mode, 'accurate', k); assert.deepEqual(r.warn, [], k);
    FIX[k].forEach(t => { const b = r.bodies.find(x => x.name === t.name), a = derive(toolMoments({ ...t, rho: 1e6 })); assert.ok(rel(b.vol.m, a.m) < tol, `${k}/${t.name} ${b.vol.m} vs ${a.m}`); });
    assert.ok(r.stats.ms < 10000, `${k} ${r.stats.ms} ms`);
  }
});

test('L5: coarsening is a warning only when the estimated error exceeds ERR (1e-4 rel. volume / 1 µm CoM)', () => {
  // fake occt: a closed 100 mm cube (planar → exact at any mesh size) padded with degenerate triangles so that
  // the probe forces coarsening; pass 2 optionally scaled to fake a large tessellation error
  const cube = (k = 1) => ({ position: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1].map(v => 100 * k * v),
    index: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7] });
  const fake = err => { let n = 0; return { ReadStepFile: () => { // calls: probe, base, refined
    const k = n++, c = cube(k === 2 ? 1 + err : 1);
    return { success: true, meshes: [{ name: 'b', attributes: { position: { array: c.position } }, index: { array: [...c.index, ...new Array(k ? 0 : 3 * 1e4).fill(0)] } }] }; } }; };
  const a = importStep(fake(0), new Uint8Array(1), { mode: 'accurate' });
  assert.ok(a.stats.scale > 1, 'coarsened'); assert.equal(a.stats.mode, 'accurate');
  assert.deepEqual(a.warn, []); assert.ok(a.info.some(w => /coarsened/.test(w)), a.info.join());
  const b = importStep(fake(1e-3), new Uint8Array(1), { mode: 'accurate' });
  assert.ok(b.bodies[0].unc.dV > ERR.rel); assert.ok(b.warn.some(w => /coarsened.*accuracy is lower/.test(w)), b.warn.join()); assert.deepEqual(b.info, []);
});
