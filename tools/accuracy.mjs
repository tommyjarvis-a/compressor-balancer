// Mesh mass-property accuracy vs. tessellation (occt-import-js) against closed-form values.
import { derive, scale } from '../src/mass.js';
import { toolMoments } from '../src/tools.js';
import { FIX } from '../test/fixtures.mjs';
import { readStep } from '../test/occt.mjs';
const vol = t => toolMoments({ ...t, rho: 1e6 });
const rows = [];
for (const k of ['box', 'cylinder', 'sector-offset']) for (const [ld, ad] of [[0.002, 0.5], [0.001, 0.1], [0.0005, 0.05], [0.0001, 0.05]]) {
  const ms = await readStep(new URL(`../test/fixtures/${k}.stp`, import.meta.url).pathname, { linearDeflectionType: 'bounding_box_ratio', linearDeflection: ld, angularDeflection: ad });
  const a = derive(vol(FIX[k][0])), b = derive(ms[0].vol), L = Math.cbrt(a.m), In = Math.hypot(...a.I);
  rows.push({ part: k, defl: `${ld}/${ad}`, tris: ms[0].tris, dV: (b.m - a.m) / a.m, dCoM_mm: Math.hypot(...b.c.map((v, i) => v - a.c[i])), dI: Math.hypot(...b.I.map((v, i) => v - a.I[i])) / In });
}
console.table(rows.map(r => ({ ...r, dV: r.dV.toExponential(2), dCoM_mm: r.dCoM_mm.toExponential(2), dI: r.dI.toExponential(2) })));
