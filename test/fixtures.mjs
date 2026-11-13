// Synthetic fixture definitions (closed-form references for the tests; no real customer parts).
import { makeTool } from '../src/tools.js';
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
};
