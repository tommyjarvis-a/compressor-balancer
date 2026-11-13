// Node helper: load the vendored occt-import-js and return per-mesh volume moments for a STEP file.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { meshMoments, openEdges } from '../src/mass.js';
const occtP = createRequire(import.meta.url)('../vendor/occt-import-js/occt-import-js.js')();
export async function readStep(path, p = { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.0005, angularDeflection: 0.05 }) {
  const o = await occtP, r = o.ReadStepFile(new Uint8Array(readFileSync(path)), { linearUnit: 'millimeter', ...p });
  if (!r.success) throw new Error('occt read failed: ' + path);
  return r.meshes.map(m => ({ name: m.name, tris: m.index.array.length / 3, vol: meshMoments(m.attributes.position.array, m.index.array), open: openEdges(m.attributes.position.array, m.index.array) }));
}
// Raw occt-import-js results for each tessellation pass (as the app gets them).
export async function readPasses(path, passes) {
  const o = await occtP, buf = new Uint8Array(readFileSync(path));
  return passes.map(p => o.ReadStepFile(buf, { linearUnit: 'millimeter', ...p }));
}
