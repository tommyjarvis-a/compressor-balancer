import { loops, rotMat, valid } from './tools.js';
// Minimal AP214 (AUTOMOTIVE_DESIGN) writer: each tool becomes a MANIFOLD_SOLID_BREP made of planar
// and cylindrical ADVANCED_FACEs (an extruded line/arc profile), in its own PRODUCT, units mm.
// Optional density (true, false, or a per-tool predicate) is written as a 'density' MEASURE_REPRESENTATION_ITEM (kg/m³) on the product.
export function toStep(tools, { name = 'compressor-balancer', density = true, unit = 'mm' } = {}) {
  const L = []; let n = 0; const us = unit === 'm' ? 1e-3 : 1; // coordinates written in the file's length unit
  const E = s => (L.push(`#${++n}=${s};`), `#${n}`);
  const f = v => { const s = (Math.abs(v) < 1e-12 ? 0 : v).toPrecision(15).replace(/0+$/, '').replace(/\.$/, '.'); return s.includes('.') || s.includes('e') ? s.replace('e', 'E') : s + '.'; };
  const P = p => E(`CARTESIAN_POINT('',(${p.map(v => f(v * us)).join(',')}))`), Dn = d => E(`DIRECTION('',(${d.map(f).join(',')}))`);
  const ax2 = (o, z, x) => E(`AXIS2_PLACEMENT_3D('',${P(o)},${Dn(z)},${Dn(x)})`);
  const str = s => `'${String(s).replace(/'/g, "''")}'`;
  const appCtx = E(`APPLICATION_CONTEXT('automotive design')`);
  E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const mech = E(`MECHANICAL_CONTEXT('',${appCtx},'mechanical')`), pdc = E(`DESIGN_CONTEXT('',${appCtx},'design')`);
  const lu = E(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(${unit === 'm' ? '$' : '.MILLI.'},.METRE.))`), au = E(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`), su = E(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(${unit === 'm' ? '1.E-10' : '1.E-07'}),${lu},'distance_accuracy_value','')`);
  const ctx = E(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lu},${au},${su}))REPRESENTATION_CONTEXT('',''))`);
  let dens;
  for (const t of tools.filter(valid)) {
    const R = rotMat(t), W = ([x, y], z) => [0, 1, 2].map(i => R[3 * i] * x + R[3 * i + 1] * y + R[3 * i + 2] * z + [t.x, t.y, t.z][i]);
    const V = ([x, y, z]) => [0, 1, 2].map(i => R[3 * i] * x + R[3 * i + 1] * y + R[3 * i + 2] * z);
    const zA = V([0, 0, 1]), faces = [], ls = loops(t);
    const vtx = p => E(`VERTEX_POINT('',${P(p)})`);
    const edge = (a, b, curve, s = '.T.') => E(`EDGE_CURVE('',${a},${b},${curve},${s})`);
    const line = (p, q) => { const d = q.map((v, i) => v - p[i]), l = Math.hypot(...d); return E(`LINE('',${P(p)},${E(`VECTOR('',${Dn(d.map(v => v / l))},${f(l * us)})`)})`); };
    const oe = (e, s) => E(`ORIENTED_EDGE('',*,*,${e},${s ? '.T.' : '.F.'})`);
    const loopEnt = es => E(`EDGE_LOOP('',(${es.join(',')}))`);
    const top = [], bot = [];
    for (const lp of ls) {
      const k = lp.length, vb = lp.map(s => vtx(W(s.p, 0))), vt = lp.map(s => vtx(W(s.p, t.h)));
      const up = lp.map((s, i) => edge(vb[i], vt[i], line(W(s.p, 0), W(s.p, t.h))));
      const he = (s, i, z, vv) => {
        const a = vv[i], b = vv[(i + 1) % k];
        if (s.t === 'L') return edge(a, b, line(W(s.p, z), W(s.q, z)));
        const c = E(`CIRCLE('',${ax2(W([0, 0], z), zA, V([1, 0, 0]))},${f(s.r * us)})`);
        return edge(a, b, c, s.a1 > s.a0 ? '.T.' : '.F.');
      };
      const eb = lp.map((s, i) => he(s, i, 0, vb)), et = lp.map((s, i) => he(s, i, t.h, vt));
      lp.forEach((s, i) => {
        const j = (i + 1) % k, bound = E(`FACE_OUTER_BOUND('',${loopEnt([oe(eb[i], 1), oe(up[j], 1), oe(et[i], 0), oe(up[i], 0)])},.T.)`);
        let surf, sense = '.T.';
        if (s.t === 'L') { const d = [s.q[0] - s.p[0], s.q[1] - s.p[1]]; surf = E(`PLANE('',${ax2(W(s.p, 0), V([d[1], -d[0], 0]).map(v => v / Math.hypot(...d)), V([d[0], d[1], 0]).map(v => v / Math.hypot(...d)))})`); }
        else { surf = E(`CYLINDRICAL_SURFACE('',${ax2(W([0, 0], 0), zA, V([1, 0, 0]))},${f(s.r * us)})`); if (s.a1 < s.a0) sense = '.F.'; }
        faces.push(E(`ADVANCED_FACE('',(${bound}),${surf},${sense})`));
      });
      top.push(loopEnt(et.map(e => oe(e, 1))));
      bot.push(loopEnt(eb.map(e => oe(e, 0)).reverse()));
    }
    const cap = (lps, z, s) => faces.push(E(`ADVANCED_FACE('',(${lps.map((l, i) => E(`${i ? 'FACE_BOUND' : 'FACE_OUTER_BOUND'}('',${l},.T.)`)).join(',')}),${E(`PLANE('',${ax2(W([0, 0], z), zA, V([1, 0, 0]))})`)},${s})`));
    cap(top, t.h, '.T.'); cap(bot, 0, '.F.');
    const nm = (t.sign < 0 ? 'REMOVE_' : '') + t.name;
    const solid = E(`MANIFOLD_SOLID_BREP(${str(nm)},${E(`CLOSED_SHELL('',(${faces.join(',')}))`)})`);
    const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION(${str(nm)},(${solid},${ax2([0, 0, 0], [0, 0, 1], [1, 0, 0])}),${ctx})`);
    const prod = E(`PRODUCT(${str(nm)},${str(nm)},'',(${mech}))`);
    E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
    const pd = E(`PRODUCT_DEFINITION('design','',${E(`PRODUCT_DEFINITION_FORMATION('','',${prod})`)},${pdc})`);
    const pds = E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
    E(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
    if (typeof density === 'function' ? density(t) : density) {
      dens ??= E(`DERIVED_UNIT((${E(`DERIVED_UNIT_ELEMENT(${E(`(MASS_UNIT()NAMED_UNIT(*)SI_UNIT(.KILO.,.GRAM.))`)},1.)`)},${E(`DERIVED_UNIT_ELEMENT(${E(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT($,.METRE.))`)},-3.)`)}))`);
      const pr = E(`PROPERTY_DEFINITION('material property','density',${pd})`);
      const mri = E(`MEASURE_REPRESENTATION_ITEM('density',POSITIVE_RATIO_MEASURE(${f(t.rho)}),${dens})`);
      E(`PROPERTY_DEFINITION_REPRESENTATION(${pr},${E(`REPRESENTATION('density',(${mri}),${ctx})`)})`);
    }
  }
  const ts = new Date().toISOString().slice(0, 19);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('${name} counterweights'),'2;1');\nFILE_NAME('${name}.stp','${ts}',(''),(''),'compressor-balancer','compressor-balancer','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
