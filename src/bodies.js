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
  const list = res.meshes.map((m, i) => {
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
  // L7: suffix duplicate display names (e.g. test.stp #1…#n). Density matching above used the STEP product name.
  return uniqueNames(list);
}

// L7: give duplicate display names a stable suffix (#1, #2, …), including the first copy.
// Unique names are left as they are, unless they collide with a name already in `existing`.
export function uniqueNames(incoming, existing = []) {
  const taken = new Set(existing.map(b => b.name)), nIn = new Map();
  for (const b of incoming) nIn.set(b.name, (nIn.get(b.name) || 0) + 1);
  const seq = new Map();
  for (const b of incoming) {
    const base = b.name, need = (nIn.get(base) || 0) > 1 || taken.has(base);
    if (!need) { taken.add(base); continue; }
    let k = seq.get(base) || 0, name;
    do { k += 1; name = `${base} #${k}`; } while (taken.has(name));
    seq.set(base, k); b.name = name; taken.add(name);
  }
  return incoming;
}

// Session identity: volume + axis-aligned bbox (mm). Name is only a hint when fingerprints collide.
export const FINGERPRINT = { vol: 1e-3, bbox: 1e-3 }; // relative tolerances (vol; bbox as a fraction of the diagonal)
export function bodyBBox(b) {
  if (Array.isArray(b.bbox) && b.bbox.length === 6 && b.bbox.every(Number.isFinite)) return b.bbox;
  const p = b.pos, lo = [1 / 0, 1 / 0, 1 / 0], hi = [-1 / 0, -1 / 0, -1 / 0];
  if (!p || !p.length) return [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < p.length; i++) { const k = i % 3; if (p[i] < lo[k]) lo[k] = p[i]; if (p[i] > hi[k]) hi[k] = p[i]; }
  return [...lo, ...hi];
}
export function bodyRef(b, i) {
  return { index: i, name: b.name, file: b.file || '', vol: b.vol?.m ?? b.vol, bbox: bodyBBox(b), sign: b.sign };
}
// Accept a legacy session entry (plain name string, or a body record without vol/bbox).
export function asSaved(entry, i = 0) {
  if (entry == null) return { index: i };
  if (typeof entry === 'string') return { name: entry, index: i };
  return { index: entry.index ?? i, name: entry.name, file: entry.file, vol: entry.vol?.m ?? entry.vol, bbox: entry.bbox, sign: entry.sign };
}
export function fingerprintMatch(saved, body) {
  const v0 = saved?.vol, v1 = body.vol?.m ?? body.vol;
  if (!(Number.isFinite(v0) && Number.isFinite(v1))) return false;
  if (Math.abs(v1 - v0) > FINGERPRINT.vol * Math.max(Math.abs(v0), Math.abs(v1), 1)) return false;
  const a = saved.bbox, b = bodyBBox(body);
  if (!Array.isArray(a) || a.length !== 6 || !b) return false;
  const diag = Math.hypot(a[3] - a[0], a[4] - a[1], a[5] - a[2]) || Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) || 1;
  return a.every((v, i) => Math.abs(v - b[i]) <= FINGERPRINT.bbox * diag);
}
// Map each saved record onto a current body: same index if the fingerprint matches, otherwise a unique
// fingerprint among the unused bodies (the name is used only to break a tie). Unmatched / ambiguous
// entries stay at -1 and the result is marked stale with a notice. Legacy records without a fingerprint
// fall back to a unique name.
export function matchBodies(saved, current) {
  const used = new Set(), map = Array(saved.length).fill(-1), reasons = [];
  const hitsOf = s => current.map((_, i) => i).filter(i => !used.has(i) && fingerprintMatch(s, current[i]));
  for (let si = 0; si < saved.length; si++) {
    const s = asSaved(saved[si], si), prefer = s.index;
    if (Number.isInteger(prefer) && prefer >= 0 && prefer < current.length && !used.has(prefer) && fingerprintMatch(s, current[prefer])) {
      map[si] = prefer; used.add(prefer); continue;
    }
    let hits = hitsOf(s);
    if (hits.length > 1 && s.name) {
      const named = hits.filter(i => current[i].name === s.name);
      if (named.length === 1) hits = named;
    }
    if (hits.length === 1) { map[si] = hits[0]; used.add(hits[0]); continue; }
    if (hits.length > 1) { reasons.push(`ambiguous fingerprint for ${s.name || 'body'}[${s.index}]`); continue; }
    // no fingerprint: unique-name fallback for 0.1.x sessions
    if (!Number.isFinite(s.vol) && s.name) {
      const named = current.map((_, i) => i).filter(i => !used.has(i) && current[i].name === s.name);
      if (named.length === 1) { map[si] = named[0]; used.add(named[0]); continue; }
      reasons.push(named.length ? `ambiguous name "${s.name}"` : `no body named "${s.name}"`);
      continue;
    }
    reasons.push(`no fingerprint match for ${s.name || 'body'}[${s.index}]`);
  }
  const unmatched = map.map((v, i) => v < 0 ? i : -1).filter(i => i >= 0);
  return { map, unmatched, stale: unmatched.length > 0, notice: reasons.join('; ') };
}
