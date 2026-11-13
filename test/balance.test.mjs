import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, add, zero, scale, eig3 } from '../src/mass.js';
import { frame, imbalance, twoPlane } from '../src/imbalance.js';
import { makeTool, toolMoments, region, rotMat } from '../src/tools.js';

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const vol = t => scale(toolMoments({ ...t, rho: 1e6 }), 1); // rho 1e6 kg/m³ = 1 g/mm³ → volume moments

test('analytic region integrals: sector matches a fine polygon, rotation/translation consistent', () => {
  const s = makeTool('sector', { ri: 12, ro: 30, a0: -40, sweep: 130 }), n = 4000, a = -40 * Math.PI / 180, b = 90 * Math.PI / 180, pts = [];
  for (let i = 0; i <= n; i++) pts.push([30 * Math.cos(a + (b - a) * i / n), 30 * Math.sin(a + (b - a) * i / n)]);
  for (let i = n; i >= 0; i--) pts.push([12 * Math.cos(a + (b - a) * i / n), 12 * Math.sin(a + (b - a) * i / n)]);
  const r1 = region(s), r2 = region(makeTool('prism', { pts }));
  r1.forEach((v, k) => assert.ok(rel(r2[k], v) < 1e-5, `region[${k}] ${r2[k]} vs ${v}`));
  const t = makeTool('cylinder', { r: 5, h: 10, x: 3, y: 4, z: 5, rx: 30, ry: -20, rz: 70 }), d = derive(vol(t)), R = rotMat(t);
  [0, 1, 2].forEach(k => close(d.c[k], [3, 4, 5][k] + 5 * R[3 * k + 2], 1e-9, 'c'));
  close(d.m, Math.PI * 250, 1e-9, 'V');
  const e = eig3(d.I).val.sort((x, y) => x - y); close(e[0], d.m * 25 / 2, 1e-6, 'Izz'); close(e[1], d.m * (3 * 25 + 100) / 12, 1e-6, 'Ixx');
});

test('static and couple imbalance of point-like masses', () => {
  const lump = (x, y, z) => makeTool('cylinder', { r: 0.5, h: 1, x, y, z: z - 0.5, rho: 7850 });
  const m = toolMoments(lump(0, 0, 0)).m;
  let r = imbalance(toolMoments(lump(10, 0, 0)), frame([0, 0, 0], [0, 0, 1]));
  close(r.U[0], 10 * m, 1e-9, 'Ux'); close(r.U[1], 0, 1e-12, 'Uy'); close(r.Cmag, 0, 1e-9, 'C');
  const pair = add(toolMoments(lump(0, 10, 20)), toolMoments(lump(0, -10, -20))); r = imbalance(pair, frame([0, 0, 0], [0, 0, 1]));
  close(r.Umag, 0, 1e-9, 'U'); close(r.C[1], 2 * m * 10 * 20, 1e-6, 'Cy = Σ m·y·z'); close(r.C[0], 0, 1e-9, 'Cx');
  const tp = twoPlane(r, -20, 20); close(tp.U2[1], 10 * m, 1e-9, 'plane B'); close(tp.U1[1], -10 * m, 1e-9, 'plane A');
  // Same assembly about the X axis: frame axis is now x, couple from ∫x'z' with x'⊥.
  const rx = imbalance(pair, frame([0, 0, 0], [1, 0, 0])); close(rx.Umag, 0, 1e-9, 'U about X');
});
