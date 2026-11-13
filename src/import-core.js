import { readDensities } from './step-meta.js';
import { buildBodies } from './bodies.js';
import { PROBE, plan, refineOk, diagonal, triCounts, fmtK } from './mesh-plan.js';
// STEP → bodies with mass properties under a triangle budget. Runs in the import worker and in Node tests.
// 1) coarse probe (cheap): bbox diagonal D and triangle counts to extrapolate from;
// 2) base pass at clamp(ratio·D), coarsened when the prediction exceeds the budget;
// 3) accurate mode: refined pass (≈4× triangles) if the actual base count allows it, then Richardson.
export function importStep(occt, buf, { mode = 'accurate', defRho = 7850, name = '', progress = () => { } } = {}) {
  const t0 = Date.now(), stats = { passes: [] };
  const read = (p, label) => {
    progress(label); const r = occt.ReadStepFile(buf, { linearUnit: 'millimeter', ...p });
    if (!r.success) throw new Error('Could not read the file (not a valid STEP?)');
    stats.passes.push({ ...p, tris: triCounts(r.meshes).reduce((a, b) => a + b, 0), ms: Date.now() - t0 }); return r;
  };
  const probe = read(PROBE, 'Reading STEP (coarse probe)');
  if (!probe.meshes.length) throw new Error('No solid bodies found in the file');
  const D = diagonal(probe.meshes), pl = plan(triCounts(probe.meshes), D, mode), warn = [...pl.warn];
  const base = read(pl.base, 'Meshing (pass 1' + (pl.refine ? ' of 2)' : ')')), passes = [base];
  if (pl.refine) {
    if (refineOk(triCounts(base.meshes))) passes.push(read(pl.fine, 'Meshing (pass 2 of 2, refined)'));
    else warn.push(`accurate mode would exceed the triangle budget (≈${fmtK(4 * triCounts(base.meshes).reduce((a, b) => a + b, 0))}); fell back to fast (single-pass) mass properties`);
  }
  progress('Mass properties');
  let dens = []; try { dens = readDensities(new TextDecoder('latin1').decode(buf)); } catch { }
  const bodies = buildBodies(passes, dens, defRho, name);
  Object.assign(stats, { ms: Date.now() - t0, D, scale: pl.scale, mode: passes.length === 2 ? 'accurate' : 'fast', tris: triCounts(passes.at(-1).meshes).reduce((a, b) => a + b, 0) });
  return { bodies, warn, stats };
}
