import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, scale, MESH, richardson } from '../src/mass.js';
import { toolMoments } from '../src/tools.js';
import { toStep } from '../src/step-export.js';
import { FIX } from './fixtures.mjs';
import { readStep } from './occt.mjs';
import { readFileSync } from 'node:fs';

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const vol = t => scale(toolMoments({ ...t, rho: 1e6 }), 1);
const fix = n => new URL(`./fixtures/${n}.stp`, import.meta.url).pathname;

test('committed fixtures are what the exporter writes (regenerate with npm run fixtures)', () => {
  for (const [k, ts] of Object.entries(FIX)) {
    const strip = s => s.replace(/FILE_NAME\([^;]*;/, '');
    assert.equal(strip(readFileSync(fix(k), 'utf8')), strip(toStep(ts, { name: k, unit: k.endsWith('metre') ? 'm' : 'mm' })), k);
  }
});

test('STEP export round-trips through occt-import-js (volume, CoM, inertia) and units', async () => {
  for (const [k, ts] of Object.entries(FIX)) {
    const meshes = await readStep(fix(k)); assert.equal(meshes.length, ts.length, k + ' body count');
    ts.forEach((t, i) => {
      const a = derive(vol(t)), m = meshes.find(x => x.name === t.name) || meshes[i], b = derive(m.vol);
      assert.equal(m.open, 0, `${k}/${t.name} closed`);
      assert.ok(rel(b.m, a.m) < 2e-4, `${k}/${t.name} V ${b.m} vs ${a.m}`);
      const L = Math.cbrt(a.m); a.c.forEach((v, j) => close(b.c[j], v, 2e-4 * L, `${k}/${t.name} c${j}`));
      const In = Math.hypot(...a.I); a.I.forEach((v, j) => close(b.I[j], v, 5e-4 * In, `${k}/${t.name} I${j}`));
    });
  }
});


test('offset sector: extrapolated mesh CoM error < 1e-6 mm', async () => {
  const t = FIX['sector-offset'][0], a = derive(vol(t)), [c] = await readStep(fix('sector-offset'), MESH.accurate[0]), [f] = await readStep(fix('sector-offset'), MESH.accurate[1]);
  const d = derive(richardson(c.vol, f.vol)), e = Math.hypot(...d.c.map((v, i) => v - a.c[i]));
  console.log(`  sector-offset CoM error: plain θ0.01 ${Math.hypot(...derive(f.vol).c.map((v, i) => v - a.c[i])).toExponential(1)} mm, extrapolated ${e.toExponential(1)} mm`);
  assert.ok(e < 1e-6 && rel(d.m, a.m) < 1e-9);
});
