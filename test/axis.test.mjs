import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { meshMoments, add, zero, rotate, translate, mul, scale, KGM3, MESH as ACC } from '../src/mass.js';
import { readDensities } from '../src/step-meta.js';
import { buildBodies } from '../src/bodies.js';
import { frame, imbalance, twoPlane, axisNames } from '../src/imbalance.js';
import { makeTool, toolMoments, rotMat } from '../src/tools.js';
import { optimize } from '../src/optimize.js';
import { fitCylinder, fitLoop, faceOf, makeAxis, canon } from '../src/fit.js';
import { readPasses } from './occt.mjs';
import { FIX } from './fixtures.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const fix = n => new URL(`./fixtures/${n}.stp`, import.meta.url).pathname;
const MESH = { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 2e-4, angularDeflection: 0.05 };
// rotation about unit axis k by angle a (row-major)
const rot = (k, a) => { const [x, y, z] = k.map(v => v / Math.hypot(...k)), c = Math.cos(a), s = Math.sin(a), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C]; };
const Q = rot([0.3, -0.8, 0.5], 0.9), T = [12.5, -7.25, 31];
const apply = (R, t, p) => { const o = new Array(p.length); for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) o[i + k] = R[3 * k] * p[i] + R[3 * k + 1] * p[i + 1] + R[3 * k + 2] * p[i + 2] + t[k]; return o; };
const ez = [Q[2], Q[5], Q[8]]; // Q·(0,0,1)

test('tilted axis: residuals equal those of the geometry rotated so the axis lies on Z', async () => {
  const [r] = await readPasses(fix('rotor-unbalanced'), [MESH]);
  // geometry placed with an arbitrary rigid motion; spin axis (T, Q·ez) is tilted in world
  const tilted = r.meshes.map(m => apply(Q, T, m.attributes.position.array));
  const mom = ps => r.meshes.reduce((a, m, i) => add(a, meshMoments(ps[i], m.index.array), 7.85e-3), zero());
  const fr = frame(T, ez), ra = imbalance(mom(tilted), fr), tpa = twoPlane(ra, -10, 60);
  // re-mesh-integrate after rotating the vertices into the axis frame (r' = R(r − p)): axis on world Z
  const Tm = fr.R.map((_, n) => -(fr.R[3 * (n / 3 | 0)] * T[0] + fr.R[3 * (n / 3 | 0) + 1] * T[1] + fr.R[3 * (n / 3 | 0) + 2] * T[2])).filter((_, n) => n % 3 === 0);
  const onZ = tilted.map(p => apply(fr.R, Tm, p)), rb = imbalance(mom(onZ), frame([0, 0, 0], [0, 0, 1])), tpb = twoPlane(rb, -10, 60);
  const U = Math.max(ra.Umag, 1), C = Math.max(ra.Cmag, 1);
  [0, 1].forEach(k => { close(ra.U[k], rb.U[k], 1e-9 * U, 'U' + k); close(ra.C[k], rb.C[k], 1e-9 * C, 'C' + k); close(tpa.U1[k], tpb.U1[k], 1e-9 * U, 'A' + k); close(tpa.U2[k], tpb.U2[k], 1e-9 * U, 'B' + k); });
  close(ra.zc, rb.zc, 1e-9, 'zc along w'); close(ra.m, rb.m, 1e-9 * ra.m, 'm');
  assert.ok(ra.Umag > 50 && ra.Cmag > 1000, 'still unbalanced about the tilted axis');
  // and the same as the untransformed fixture about +Z, as magnitudes (basis u, v differs from Q·x, Q·y)
  const r0 = imbalance(mom(r.meshes.map(m => m.attributes.position.array)), frame([0, 0, 0], [0, 0, 1]));
  close(ra.Umag, r0.Umag, 1e-9 * U, '|U|'); close(ra.Cmag, r0.Cmag, 1e-9 * C, '|C|');
  // deterministic right-handed basis with w = the axis
  const an = axisNames(fr); [0, 1, 2].forEach(k => close(an.w[k], ez[k], 1e-15, 'w'));
  assert.deepEqual(frame(T, ez).R, fr.R);
});

test('cylinder fit recovers the axis of a tilted fixture cylinder; loop fit finds its end circle', async () => {
  const [r] = await readPasses(fix('cylinder'), [MESH]), m = r.meshes[0], idx = m.index.array;
  const pos = apply(Q, T, m.attributes.position.array), faces = m.brep_faces.flatMap(f => [f.first, f.last]);
  const fits = m.brep_faces.map(f => fitCylinder(pos, idx, f.first, f.last)), cyl = fits.filter(f => !f.error);
  assert.equal(cyl.length, 2, 'two half-cylinder faces (as exported); planar caps rejected'); assert.equal(fits.filter(f => /flat/.test(f.error)).length, 2);
  for (const f of cyl) {
  const par = Math.abs(f.d[0] * ez[0] + f.d[1] * ez[1] + f.d[2] * ez[2]);
  close(par, 1, 1e-10, 'axis direction ∥ Q·z'); close(f.r, 15, 1e-6, 'radius');
  const off = [0, 1, 2].map(k => f.p[k] - T[k]), along = off[0] * ez[0] + off[1] * ez[1] + off[2] * ez[2];
  close(Math.hypot(...off.map((v, k) => v - along * ez[k])), 0, 1e-6, 'axis passes through the true axis');
  assert.deepEqual(f.d, canon(f.d), 'canonical sign'); assert.ok(f.rms < 1e-9, 'rms ' + f.rms);
  }
  // end cap at local z = 30: pick a point near its rim
  const top = apply(Q, T, [15, 0, 30]), cap = m.brep_faces.find(g => fitCylinder(pos, idx, g.first, g.last).error && Math.abs(pos[3 * idx[3 * g.first]] - top[0]) + 0 < 1e9 &&
    [0, 1, 2].every(j => { const p = pos.slice(3 * idx[3 * g.first + j], 3 * idx[3 * g.first + j] + 3), c = apply(Q, T, [0, 0, 30]); return Math.abs((p[0] - c[0]) * ez[0] + (p[1] - c[1]) * ez[1] + (p[2] - c[2]) * ez[2]) < 1e-6; }));
  assert.ok(cap, 'top cap face');
  const l = fitLoop(pos, idx, cap.first, cap.last, top), c = apply(Q, T, [0, 0, 30]);
  assert.ok(!l.error, l.error); close(l.r, 15, 1e-6, 'loop radius'); [0, 1, 2].forEach(k => close(l.p[k], c[k], 1e-6, 'loop centre'));
  close(Math.abs(l.d[0] * ez[0] + l.d[1] * ez[1] + l.d[2] * ez[2]), 1, 1e-10, 'loop normal');
  // a half-cylinder face's boundary is one loop of two arcs + two seam lines: not a circle
  const fc = m.brep_faces[fits.findIndex(x => !x.error)], l2 = fitLoop(pos, idx, fc.first, fc.last, top);
  assert.match(l2.error, /not on a circle|not planar/);
  assert.deepEqual(faceOf(faces, fc.first), [fc.first, fc.last]); assert.equal(faceOf(faces, 1e9), null);
});

test('fits reject non-circular data; typed axes are normalised and zero vectors rejected', async () => {
  const [r] = await readPasses(fix('box'), [MESH]), m = r.meshes[0], f = m.brep_faces[0];
  assert.match(fitCylinder(m.attributes.position.array, m.index.array, f.first, f.last).error, /flat/);
  const l = fitLoop(m.attributes.position.array, m.index.array, f.first, f.last, [0, 0, 0]); assert.ok(l.error, 'rectangle is not a circle');
  const [s] = await readPasses(fix('sector-offset'), [MESH]), sm = s.meshes[0];
  const sf = sm.brep_faces.map(g => fitLoop(sm.attributes.position.array, sm.index.array, g.first, g.last, [0, 0, 0]));
  assert.ok(sf.every(x => x.error), 'sector boundary loops (arcs + lines) are not circles');
  // points exactly on a circle but only in two short opposite arcs (a narrow fillet face's boundary) → rejected
  const ang = [-15, -5, 5, 15, 165, 175, 185, 195].map(a => a * Math.PI / 180), P = [0, 0, 0, ...ang.flatMap(a => [10 * Math.cos(a), 10 * Math.sin(a), 0])];
  const I = ang.flatMap((_, i) => [0, 1 + i, 1 + (i + 1) % ang.length]);
  assert.match(fitLoop(P, I, 0, ang.length - 1, [10, 0, 0]).error, /not a full circle/);
  const full = [...Array(12).keys()].map(i => i * Math.PI / 6), P2 = [0, 0, 0, ...full.flatMap(a => [10 * Math.cos(a), 10 * Math.sin(a), 0])];
  close(fitLoop(P2, full.flatMap((_, i) => [0, 1 + i, 1 + (i + 1) % 12]), 0, 11, [10, 0, 0]).r, 10, 1e-12, 'full 12-gon');
  assert.deepEqual(makeAxis([1, 2, 3], [0, 0, 2]), { p: [1, 2, 3], d: [0, 0, 1] });
  assert.match(makeAxis([0, 0, 0], [0, 0, 0]).error, /non-zero/); assert.match(makeAxis([0, NaN, 0], [1, 0, 0]).error, /numbers/);
  const d = makeAxis([0, 0, 0], [1, 1, 1]).d; close(Math.hypot(...d), 1, 1e-15, '|d|');
});

// a tool placed in the frame (Q, T): rotation Q·rotMat(t) as Rz·Ry·Rx angles, position Q·x + T
function place(t, R, o) {
  const M = mul(R, rotMat(t)), D = 180 / Math.PI, p = apply(R, o, [t.x, t.y, t.z]);
  return { ...t, rx: Math.atan2(M[7], M[8]) * D, ry: -Math.asin(M[6]) * D, rz: Math.atan2(M[3], M[0]) * D, x: p[0], y: p[1], z: p[2] };
}
test('optimiser balances about a tilted axis', () => {
  const base0 = FIX['rotor-unbalanced'].reduce((a, t) => add(a, toolMoments(t)), zero()), base = translate(rotate(base0, Q), T), fr = frame(T, ez);
  const r0 = imbalance(base, fr); assert.ok(r0.Umag > 50 && r0.Cmag > 1000);
  const tools = [makeTool('sector', { name: 'cwA', ri: 31, ro: 40, a0: 0, sweep: 60, h: 3, z: 56 }), makeTool('sector', { name: 'cwB', ri: 31, ro: 40, a0: 0, sweep: 60, h: 3, z: -10 })].map(t => place(t, Q, T));
  const tm = toolMoments(tools[0]), t0 = toolMoments(makeTool('sector', { ri: 31, ro: 40, a0: 0, sweep: 60, h: 3, z: 56 }));
  close(imbalance(tm, fr).Umag, imbalance(t0, frame([0, 0, 0], [0, 0, 1])).Umag, 1e-9, 'placed tool');
  const free = tools.flatMap(t => [{ id: t.id, key: 'a0', lo: -180, hi: 180 }, { id: t.id, key: 'h', lo: 0.5, hi: 20 }]);
  const res = optimize(base, tools, free, fr, { L: 66 });
  console.log(`  tilted: |U| ${r0.Umag.toFixed(1)} → ${res.after.r.Umag.toExponential(2)} g·mm, |C| ${r0.Cmag.toFixed(0)} → ${res.after.r.Cmag.toExponential(2)} g·mm², ${res.evals} evals`);
  assert.ok(res.after.r.Umag < 1e-2 && res.after.r.Cmag < 1, 'balanced about the tilted axis');
  // the same physical solution as balancing the untilted rotor about Z (residual magnitudes are basis-free)
  const resZ = optimize(base0, [makeTool('sector', { name: 'cwA', ri: 31, ro: 40, a0: 0, sweep: 60, h: 3, z: 56 }), makeTool('sector', { name: 'cwB', ri: 31, ro: 40, a0: 0, sweep: 60, h: 3, z: -10 })].map((t, i) => ({ ...t, id: tools[i].id })), free, frame([0, 0, 0], [0, 0, 1]), { L: 66 });
  res.params.forEach((p, i) => close(p.value, resZ.params[i].value, 1e-3 * (p.hi - p.lo), p.key));
});

// M2 (QA GATE-69afba1): each change used to normalise the direction and write all three boxes back,
// so typing a unit vector field by field (starting from the default 0,0,1) produced a different axis.
test('M2: typing the axis direction field by field keeps the raw values and the intended residual', async () => {
  const raw = [0.40558, -0.40558, 0.81915], p = [12, -7, 20];
  // QA tilted two-body motion: 35° about (1,1,0)/√2, then translate to p. The unrotated residual is |U| = 108, |C| = 1532.6075394.
  const k = [1 / Math.SQRT2, 1 / Math.SQRT2, 0], ang = 35 * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang), C = 1 - c, [x, y, z] = k;
  const R = [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  const boxes = [0, 0, 1]; let last;
  for (let i = 0; i < 3; i++) {
    boxes[i] = raw[i];
    last = makeAxis(p, boxes);
    assert.ok(!last.error, last.error);
    assert.deepEqual(boxes, raw.map((v, k) => k <= i ? v : (k === 2 ? 1 : 0)), 'inputs are not rewritten after a change');
  }
  assert.deepEqual(boxes, raw);
  assert.deepEqual(last.d, makeAxis(p, raw).d);
  close(Math.hypot(...last.d), 1, 1e-15, '|d|');
  // previous behaviour: rewrite the boxes with the unit vector after each change → 4.3° off after dy, |U| = 274.6 instead of 108
  const bug = [0, 0, 1];
  for (let i = 0; i < 3; i++) { bug[i] = raw[i]; const a = makeAxis(p, bug); bug[0] = a.d[0]; bug[1] = a.d[1]; bug[2] = a.d[2]; }
  close(bug[0], 0.36047, 5e-5, 'buggy dx'); close(bug[1], -0.38899, 5e-5, 'buggy dy'); close(bug[2], 0.84779, 5e-5, 'buggy dz');
  const stp = fix('qa-two-body-partial-density-ap242');
  const bs = buildBodies(await readPasses(stp, ACC.accurate), readDensities(readFileSync(stp, 'latin1')), 7850, 'qa');
  const mom = translate(rotate(bs.reduce((a, b) => add(a, scale(b.vol, b.sign * b.rho * KGM3)), zero()), R), p);
  const good = imbalance(mom, frame(last.p, last.d)), bad = imbalance(mom, frame(p, bug));
  close(good.Umag, 108, 0.01, '|U|'); close(good.Cmag, 1532.6, 0.1, '|C|');
  close(bad.Umag, 274.6, 0.1, 'buggy |U|'); close(bad.Cmag, 2914, 1, 'buggy |C|');
});
