import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KGM3, MESH } from '../src/mass.js';
import { readDensities } from '../src/step-meta.js';
import { buildBodies } from '../src/bodies.js';
import { readPasses } from './occt.mjs';

const fix = n => new URL(`./fixtures/${n}.stp`, import.meta.url).pathname;
const load = async (n, defRho) => buildBodies(await readPasses(fix(n), MESH.accurate), readDensities(readFileSync(fix(n), 'latin1')), defRho, n);
const mass = b => b.vol.m * b.rho * KGM3, by = (bs, n) => bs.find(b => b.name === n);

test('M1 regression (QA repro): partial STEP density applies only to its own body', async () => {
  const bs = await load('qa-two-body-partial-density-ap242', 7850), shaft = by(bs, 'shaft'), block = by(bs, 'block');
  assert.equal(shaft.src, 'default'); assert.equal(shaft.rho, 7850); assert.equal(shaft.material, null);
  assert.equal(block.src, 'STEP'); assert.equal(block.rho, 2700);
  const total = bs.reduce((a, b) => a + mass(b), 0);
  // shaft r8 h60 steel = 94.700 g, block 20×10×10 Al = 5.4 g (the buggy build gave 32.572 + 5.4 = 37.97 g)
  assert.ok(Math.abs(mass(shaft) - 7.85e-3 * Math.PI * 64 * 60) < 1e-5, `shaft ${mass(shaft)}`);
  assert.ok(Math.abs(total - (7.85e-3 * Math.PI * 64 * 60 + 5.4)) < 1e-5, `total ${total}`);
  // all-default (no STEP density used) gives the 110.4 g steel total
  const steel = bs.reduce((a, b) => a + b.vol.m * 7850 * KGM3, 0); assert.ok(Math.abs(steel - 110.4) < 1e-3, `steel ${steel}`);
});

test('mixed-density fixture: own densities kept, body without one uses the default', async () => {
  const bs = await load('mixed-density', 7200);
  assert.deepEqual(bs.map(b => [b.name, b.src, b.rho]), [['shaft', 'STEP', 7850], ['hub', 'STEP', 2700], ['pin', 'default', 7200]]);
});

test('file-wide density only when no record matches any body', () => {
  const mk = name => ({ name, attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } }, index: { array: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] } });
  const pass = [{ success: true, meshes: [mk('a'), mk('b')] }];
  let bs = buildBodies(pass, [{ product: 'other', density: 2700, material: 'Al' }], 7850);
  assert.deepEqual(bs.map(b => [b.src, b.rho]), [['STEP (file)', 2700], ['STEP (file)', 2700]]);
  bs = buildBodies(pass, [{ product: 'a', density: 2700 }], 7850);
  assert.deepEqual(bs.map(b => [b.src, b.rho]), [['STEP', 2700], ['default', 7850]]);
  bs = buildBodies(pass, [{ product: 'x', density: 2700 }, { product: 'y', density: 7850 }], 1000);
  assert.deepEqual(bs.map(b => b.src), ['default', 'default']);
});
