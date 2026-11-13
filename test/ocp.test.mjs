// Optional independent oracle: exact OpenCascade BRepGProp via cadquery-ocp (Python).
// Runs only when CB_OCP_PY points at a Python with `OCP` installed; otherwise skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { derive } from '../src/mass.js';
import { toolMoments } from '../src/tools.js';
import { FIX } from './fixtures.mjs';
const py = process.env.CB_OCP_PY;
test('fixtures are valid B-reps with exact mass properties in OpenCascade (BRepGProp)', { skip: !py && 'set CB_OCP_PY to run' }, () => {
  for (const [k, ts] of Object.entries(FIX)) {
    const out = execFileSync(py, [new URL('../tools/ocp-check.py', import.meta.url).pathname, new URL(`./fixtures/${k}.stp`, import.meta.url).pathname], { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
    assert.equal(out.length, ts.length, k);
    ts.forEach((t, i) => {
      const a = derive(toolMoments({ ...t, rho: 1e6 })), o = out[i], tol = 1e-9 * Math.max(1, a.m);
      assert.ok(o.valid, `${k}/${t.name} BRepCheck`);
      assert.ok(Math.abs(o.V - a.m) / a.m < 1e-10, `${k}/${t.name} V ${o.V} vs ${a.m}`);
      a.c.forEach((v, j) => assert.ok(Math.abs(o.c[j] - v) < 1e-9 * Math.cbrt(a.m), `${k} c${j}`));
      a.I.forEach((v, j) => assert.ok(Math.abs(o.I[j] - v) < 1e-9 * Math.hypot(...a.I), `${k} I${j} ${o.I[j]} vs ${v}`));
    });
  }
});
