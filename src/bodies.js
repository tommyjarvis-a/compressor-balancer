import { meshMoments, richardson, derive, scale, meshCheck } from './mass.js';
// Turn occt-import-js results (one per tessellation pass, finest last) into body records.
// Density: a STEP record whose product name matches the body wins (src 'STEP'). A file-wide value is
// used only when no record matches any body and the file holds a single distinct density
// (src 'STEP (file)'); otherwise the body gets the default (src 'default').
// Solids named REMOVE_* (removal tools written by this app's STEP export) get sign −1: negative mass.
// Uncertainty: two passes → |fine − Richardson|; one pass with a coarse probe → error ∝ 1/triangles, so
// |base − probe| / (N_base/N_probe − 1) (rough, used for fast mode and the L5 accuracy note).
export function buildBodies(passes, dens, defRho, fileName = '', probe = null) {
  const res = passes.at(-1), two = passes.length === 2 && passes[0].meshes.length === res.meshes.length;
  const one = !two && probe?.meshes.length === res.meshes.length;
  const names = new Set(res.meshes.map(m => m.name)), matched = dens.some(d => names.has(d.product));
  const file1 = !matched && dens.length && new Set(dens.map(d => d.density)).size === 1 ? dens[0] : null;
  return res.meshes.map((m, i) => {
    const pos = m.attributes.position.array, idx = m.index.array, fine = meshMoments(pos, idx);
    let vol = fine, unc = null;
    if (two) { // extrapolate and keep |fine − extrapolated| as the tessellation uncertainty estimate
      const c = passes[0].meshes[i]; vol = richardson(meshMoments(c.attributes.position.array, c.index.array), fine);
      const a = derive(vol), b = derive(fine); unc = { dV: Math.abs(b.m - a.m) / Math.abs(a.m), dc: Math.hypot(...b.c.map((v, k) => v - a.c[k])) };
    } else if (one) {
      const c = probe.meshes[i], k = Math.max(1, idx.length / c.index.array.length - 1), a = derive(fine), b = derive(meshMoments(c.attributes.position.array, c.index.array));
      unc = { dV: Math.abs(b.m - a.m) / Math.abs(a.m) / k, dc: Math.hypot(...b.c.map((v, j) => v - a.c[j])) / k, rough: true };
    }
    if (vol.m < 0) vol = scale(vol, -1);
    const own = dens.find(x => x.product === m.name), d = own || file1;
    return { name: m.name || fileName, file: fileName, sign: /^REMOVE_/.test(m.name || '') ? -1 : 1, vol, unc, rho: d ? Math.round(d.density * 1000) / 1000 : defRho, src: own ? 'STEP' : d ? 'STEP (file)' : 'default',
      material: d?.material ?? null, on: true, pos, idx, nrm: m.attributes.normal?.array, faces: (m.brep_faces || []).flatMap(f => [f.first, f.last]), ...meshCheck(pos, idx, fine.m),
      color: m.color && (m.color[0] * 255 << 16 | m.color[1] * 255 << 8 | m.color[2] * 255) };
  });
}
