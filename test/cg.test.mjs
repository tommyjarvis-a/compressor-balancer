import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { KGM3, add, zero, scale, derive, assemblyCG } from '../src/mass.js';
import { toolMoments } from '../src/tools.js';
import { FIX } from './fixtures.mjs';
import { buildBodies } from '../src/bodies.js';
import { readDensities } from '../src/step-meta.js';
import { readPasses } from './occt.mjs';
import { MESH } from '../src/mass.js';

const py = process.env.CB_OCP_PY;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const fix = n => new URL(`./fixtures/${n}.stp`, import.meta.url).pathname;
const asBody = t => ({ name: (t.sign < 0 ? 'REMOVE_' : '') + t.name, sign: t.sign < 0 ? -1 : 1, rho: t.rho, vol: scale(toolMoments({ ...t, rho: 1e6, sign: 1 }), 1) });
const byName = (bs, n) => bs.findIndex(b => b.name === n);

test('assemblyCG: empty selection, zero and negative net mass', () => {
  const a = { name: 'A', sign: 1, rho: 1000, vol: { m: 1000, M1: [1000, 0, 0], S: Array(9).fill(0) } }; // 1 g at (1,0,0)
  const b = { name: 'REMOVE_B', sign: -1, rho: 1000, vol: { m: 1000, M1: [2000, 0, 0], S: Array(9).fill(0) } };
  assert.equal(assemblyCG([], []).error, 'none');
  assert.equal(assemblyCG([a], []).error, 'none');
  assert.equal(assemblyCG([a, b], [0, 1]).error, 'zero');
  const heavy = { ...b, vol: { m: 2000, M1: [2000, 0, 0], S: Array(9).fill(0) } };
  assert.equal(assemblyCG([a, heavy], [0, 1]).error, 'negative');
});

test('assemblyCG: closed-form multi-body CoM, REMOVE_* subtraction, and a subset', () => {
  const ts = FIX['cg-assembly'], bs = ts.map(asBody);
  assert.deepEqual(bs.map(b => [b.name, b.sign]), [['block', 1], ['boss', 1], ['REMOVE_slot', -1]]);
  const all = assemblyCG(bs, [0, 1, 2]), sub = assemblyCG(bs, [0, 2]);
  // hand-checked: block 62.8 g at (20,10,5); boss π·100·20·2700e-6 g at (80,10,10); slot −7.85 g at (10,10,5)
  const mBlock = 8000 * 7850 * KGM3, mSlot = 1000 * 7850 * KGM3, mBoss = Math.PI * 100 * 20 * 2700 * KGM3;
  close(all.m, mBlock + mBoss - mSlot, 1e-12, 'all mass');
  close(sub.m, mBlock - mSlot, 1e-12, 'subset mass');
  const ref = (masses, cs) => masses.reduce((s, m, i) => s + m * cs[i], 0) / masses.reduce((s, m) => s + m, 0);
  close(all.c[0], ref([mBlock, mBoss, -mSlot], [20, 80, 10]), 1e-12, 'all X');
  close(all.c[1], 10, 1e-12, 'all Y');
  close(all.c[2], ref([mBlock, mBoss, -mSlot], [5, 10, 5]), 1e-12, 'all Z');
  close(sub.c[0], ref([mBlock, -mSlot], [20, 10]), 1e-12, 'subset X');
  close(sub.c[1], 10, 1e-12, 'subset Y');
  close(sub.c[2], 5, 1e-12, 'subset Z');
  assert.equal(all.n, 3); assert.equal(sub.n, 2);
  assert.deepEqual(sub.names, ['block', 'REMOVE_slot']);
  // tool-moment sum of the same set must agree (independent of the closed-form arithmetic above)
  const mom = ts.reduce((a, t) => add(a, toolMoments(t)), zero()), c = mom.M1.map(v => v / mom.m);
  all.c.forEach((v, k) => close(v, c[k], 1e-12, 'vs toolMoments c' + k));
  close(all.m, mom.m, 1e-12, 'vs toolMoments m');
});

test('assemblyCG: imported cg-assembly meshes match closed form (accurate mode)', async () => {
  const path = fix('cg-assembly'), ts = FIX['cg-assembly'];
  const bs = buildBodies(await readPasses(path, MESH.accurate), readDensities(readFileSync(path, 'latin1')), 7850, 'cg-assembly');
  assert.deepEqual(bs.map(b => [b.name, b.sign, b.rho]), [['block', 1, 7850], ['boss', 1, 2700], ['REMOVE_slot', -1, 7850]]);
  const ref = assemblyCG(ts.map(asBody), [0, 1, 2]), got = assemblyCG(bs, [0, 1, 2]);
  close(got.m, ref.m, 1e-6, 'mesh mass'); // boss is a cylinder; accurate+Richardson is ~1e-8 relative
  got.c.forEach((v, k) => close(v, ref.c[k], 1e-6, 'mesh c' + k));
  const sub = assemblyCG(bs, [byName(bs, 'block'), byName(bs, 'REMOVE_slot')]), sref = assemblyCG(ts.map(asBody), [0, 2]);
  close(sub.m, sref.m, 1e-12, 'planar subset mass'); // both prisms: exact
  sub.c.forEach((v, k) => close(v, sref.c[k], 1e-12, 'planar subset c' + k));
});

test('assemblyCG: combined CoM agrees with OpenCascade BRepGProp (signed masses, subset)', { skip: !py && 'set CB_OCP_PY to run' }, () => {
  const path = fix('cg-assembly'), ts = FIX['cg-assembly'], bs = ts.map(asBody);
  const out = execFileSync(py, [new URL('../tools/ocp-check.py', import.meta.url).pathname, path], { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
  assert.equal(out.length, 3);
  // OCP volumes are unsigned; apply each body's density and REMOVE_* sign
  const ocpBodies = out.map((o, i) => ({ name: bs[i].name, sign: bs[i].sign, rho: bs[i].rho, vol: { m: o.V, M1: o.c.map(v => v * o.V), S: Array(9).fill(0) } }));
  const refAll = assemblyCG(bs, [0, 1, 2]), ocpAll = assemblyCG(ocpBodies, [0, 1, 2]);
  close(ocpAll.m, refAll.m, 1e-9, 'OCP all mass');
  ocpAll.c.forEach((v, k) => close(v, refAll.c[k], 1e-9, 'OCP all c' + k));
  const refSub = assemblyCG(bs, [0, 2]), ocpSub = assemblyCG(ocpBodies, [0, 2]);
  close(ocpSub.m, refSub.m, 1e-9, 'OCP subset mass');
  ocpSub.c.forEach((v, k) => close(v, refSub.c[k], 1e-9, 'OCP subset c' + k));
  // CoM of the subset (block + REMOVE_slot) must differ from the block alone
  const block = assemblyCG(bs, [0]);
  assert.ok(Math.abs(refSub.c[0] - block.c[0]) > 1, `slot should shift X (${block.c[0]} → ${refSub.c[0]})`);
});
