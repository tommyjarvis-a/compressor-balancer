// Synthetic fixture definitions (closed-form references for the tests; no real customer parts).
import { makeTool, rotMat } from '../src/tools.js';
import { toStep } from '../src/step-export.js';
export const FIX = {
  box: [makeTool('prism', { name: 'box', pts: [[0, 0], [40, 0], [40, 20], [0, 20]], h: 10, x: 5, y: -3, z: 2 })],
  cylinder: [makeTool('cylinder', { name: 'cylinder', r: 15, h: 30 })],
  'sector-offset': [makeTool('sector', { name: 'sector', ri: 18, ro: 35, a0: 20, sweep: 110, h: 6, x: 2, y: 1, z: 12, rx: 7, rz: 15, rho: 2700 })],
  'box-metre': [makeTool('prism', { name: 'box', pts: [[0, 0], [40, 0], [40, 20], [0, 20]], h: 10, x: 5, y: -3, z: 2 })],
  'rotor-unbalanced': [
    makeTool('cylinder', { name: 'shaft', r: 6, h: 120, z: -20 }),
    makeTool('cylinder', { name: 'rotor', r: 30, ri: 6, h: 50, rho: 7650 }),
    makeTool('sector', { name: 'lump_top', ri: 20, ro: 30, a0: 10, sweep: 30, h: 4, z: 50, rho: 7850 }),
    makeTool('sector', { name: 'lump_bot', ri: 20, ro: 30, a0: 140, sweep: 25, h: 4, z: -4, rho: 7850 }),
  ],
  // Mixed: shaft and hub carry their own STEP density, pin has none (must fall back to the default).
  'mixed-density': [
    makeTool('cylinder', { name: 'shaft', r: 8, h: 60, rho: 7850 }),
    makeTool('cylinder', { name: 'hub', r: 25, ri: 8, h: 12, z: 20, rho: 2700 }),
    makeTool('cylinder', { name: 'pin', r: 2, h: 10, x: 15, z: 40, rho: 8900 }),
  ],
  // rotor-unbalanced-like assembly on a tilted axis (through O along w = rotMat(TILT)·z), for axis picking
  'tilted-rotor': tilted([['shaft', 'cylinder', { r: 6, h: 100 }, -25], ['rotor', 'cylinder', { r: 30, ri: 6, h: 40 }, 0], ['lump', 'sector', { ri: 20, ro: 30, a0: 30, sweep: 40, h: 4 }, 40]]),
};
function tilted(parts) {
  const TILT = { rx: 25, ry: -10, rz: 15 }, O = [5, -3, 8], R = rotMat(TILT);
  return parts.map(([name, kind, o, z]) => makeTool(kind, { name, ...o, ...TILT, x: O[0] + z * R[2], y: O[1] + z * R[5], z: O[2] + z * R[8] }));
}
const NODENS = { 'mixed-density': ['pin'] };
// The exact STEP text written for fixture k (timestamp pinned so files are reproducible).
export const fixtureStep = k => toStep(FIX[k], { name: k, unit: k.endsWith('metre') ? 'm' : 'mm', density: t => !(NODENS[k] || []).includes(t.name) })
  .replace(/'\d{4}-\d\d-\d\dT[\d:]+'/, "'2026-01-01T00:00:00'");

