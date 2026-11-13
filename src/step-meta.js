// Lightweight STEP text scan for density / material attributes (AP214/AP242 property patterns).
// Returns [{ product, density /* kg/m³ */, material, raw }]. Heuristic: CAD exporters differ.
export function parseEntities(text) {
  const d = text.indexOf('DATA;'), body = d < 0 ? text : text.slice(d + 5), ents = new Map();
  let cur = '', q = false;
  for (const ch of body) {
    if (ch === "'") q = !q;
    if (ch === ';' && !q) { const m = /^\s*#(\d+)\s*=\s*([\s\S]*)$/.exec(cur); if (m) ents.set(+m[1], m[2].trim()); cur = ''; } else cur += ch;
  }
  return ents;
}
const refs = s => [...s.replace(/'[^']*'/g, '').matchAll(/#(\d+)/g)].map(m => +m[1]);
const type = s => (/^\(?\s*([A-Z0-9_]+)/.exec(s) || [])[1];
const str1 = s => (/'((?:[^']|'')*)'/.exec(s) || [])[1]?.replace(/''/g, "'");

function unitFactor(ents, id, seen = new Set()) {
  const s = ents.get(id); if (!s || seen.has(id)) return null; seen.add(id);
  if (/DERIVED_UNIT\s*\(\s*\(/.test(s) && type(s) === 'DERIVED_UNIT') {
    let k = 1, ok = false;
    for (const r of refs(s)) {
      const e = ents.get(r); if (!e) return null;
      const m = /DERIVED_UNIT_ELEMENT\s*\(\s*#(\d+)\s*,\s*([-\d.E+]+)\s*\)/i.exec(e); if (!m) return null;
      const u = ents.get(+m[1]) || '', exp = +m[2];
      const pre = { '.KILO.': 1e3, '.CENTI.': 1e-2, '.MILLI.': 1e-3, '.MICRO.': 1e-6 }[(/SI_UNIT\s*\(\s*(\.[A-Z]+\.)/.exec(u) || [])[1]] ?? 1;
      if (/MASS_UNIT/.test(u)) { k *= (pre / 1e3) ** exp; ok = true; } else if (/LENGTH_UNIT/.test(u)) k *= pre ** exp; else return null;
    }
    return ok ? k : null;
  }
  return null;
}
// Magnitude fallback when the unit is missing or unreadable.
const guess = v => v > 300 ? v : v > 0.3 && v < 30 ? v * 1e3 : v > 3e-7 && v < 3e-5 ? v * 1e9 : v > 3e-4 && v < 3e-2 ? v * 1e6 : null;

function productOf(ents, id, depth = 0) {
  const s = ents.get(id); if (!s || depth > 6) return null;
  if (type(s) === 'PRODUCT') return str1(s);
  for (const r of refs(s)) { const p = productOf(ents, r, depth + 1); if (p != null) return p; }
  return null;
}

export function readDensities(text) {
  const ents = parseEntities(text), out = [], mats = new Map();
  for (const [, s] of ents) if (type(s) === 'MATERIAL_DESIGNATION') for (const r of refs(s)) { const p = productOf(ents, r); if (p != null) mats.set(p, str1(s)); }
  for (const [id, s] of ents) {
    if (type(s) !== 'PROPERTY_DEFINITION_REPRESENTATION') continue;
    const [pdId, repId] = refs(s), pd = ents.get(pdId) || '', rep = ents.get(repId) || '';
    for (const it of refs(rep)) {
      const e = ents.get(it) || '';
      if (!/MEASURE_REPRESENTATION_ITEM/.test(e) || !/density/i.test(e + pd + str1(rep))) continue;
      const m = /\(\s*([-\d.E+]+)\s*\)\s*,\s*#(\d+)/i.exec(e); if (!m) continue;
      const v = +m[1], k = unitFactor(ents, +m[2]), rho = k != null ? v * k : guess(v);
      if (rho > 0) { const product = productOf(ents, refs(pd).at(-1)); out.push({ product, density: rho, material: mats.get(product) ?? null, raw: `#${id}` }); }
    }
  }
  return out;
}
