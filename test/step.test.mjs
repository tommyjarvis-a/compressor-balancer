import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, scale, MESH, richardson } from '../src/mass.js';
import { toolMoments } from '../src/tools.js';
import { toStep } from '../src/step-export.js';
import { FIX, fixtureStep } from './fixtures.mjs';
import { readStep } from './occt.mjs';
import { readFileSync } from 'node:fs';

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const vol = t => scale(toolMoments({ ...t, rho: 1e6 }), 1);
const fix = n => new URL(`./fixtures/${n}.stp`, import.meta.url).pathname;

test('committed fixtures are what the exporter writes (regenerate with npm run fixtures)', () => {
  for (const [k, ts] of Object.entries(FIX)) {
    const strip = s => s.replace(/FILE_NAME\([^;]*;/, '');
    assert.equal(strip(readFileSync(fix(k), 'utf8')), strip(fixtureStep(k)), k);
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

test('L3: removal tools round-trip as REMOVE_ solids and re-import as negative mass', async () => {
  const { buildBodies } = await import('../src/bodies.js'), { readDensities } = await import('../src/step-meta.js'), { readPasses } = await import('./occt.mjs');
  const { add, zero, KGM3 } = await import('../src/mass.js'), { imbalance, frame } = await import('../src/imbalance.js');
  const { writeFileSync, mkdtempSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const { makeTool } = await import('../src/tools.js');
  const ts = [makeTool('sector', { name: 'cw', ri: 20, ro: 30, a0: 40, sweep: 50, h: 4, z: 30 }), makeTool('cylinder', { name: 'drill', r: 3, h: 8, x: -12, y: 5, sign: -1, rho: 2700 })];
  const txt = toStep(ts), p = join(mkdtempSync(join(tmpdir(), 'cb-')), 'rt.stp'); writeFileSync(p, txt);
  assert.match(txt, /MANIFOLD_SOLID_BREP\('REMOVE_drill'/);
  const bs = buildBodies(await readPasses(p, MESH.accurate), readDensities(txt), 7850);
  assert.deepEqual(bs.map(b => [b.name, b.sign, b.rho]), [['cw', 1, 7850], ['REMOVE_drill', -1, 2700]]);
  const mom = bs.reduce((a, b) => add(a, { m: b.sign * b.rho * KGM3 * b.vol.m, M1: b.vol.M1.map(v => v * b.sign * b.rho * KGM3), S: b.vol.S.map(v => v * b.sign * b.rho * KGM3) }), zero());
  const ref = ts.reduce((a, t) => add(a, toolMoments(t)), zero()), fr = frame([0, 0, 0], [0, 0, 1]), r = imbalance(mom, fr), q = imbalance(ref, fr);
  assert.ok(rel(mom.m, ref.m) < 1e-6, `mass ${mom.m} vs ${ref.m}`);
  [0, 1].forEach(k => { close(r.U[k], q.U[k], 1e-6 * q.Umag, 'U'); close(r.C[k], q.C[k], 1e-6 * q.Cmag, 'C'); });
});
