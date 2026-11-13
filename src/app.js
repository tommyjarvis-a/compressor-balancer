import { KGM3, add, scale, derive, eig3, zero, MESH } from './mass.js';
import { frame, imbalance, twoPlane, axisNames } from './imbalance.js';
import { makeTool, toolMoments, valid, PARAMS, COMMON_PARAMS } from './tools.js';
import { optimize } from './optimize.js';
import { toStep } from './step-export.js';
import { readDensities } from './step-meta.js';
import { buildBodies } from './bodies.js';
import { createView } from './view.js';

const VERSION = '0.1.0-alpha', $ = s => document.querySelector(s), view = createView($('#view'));
const st = { bodies: [], tools: [], last: null, undo: null };
const fmt = (v, d = 3) => Math.abs(v) >= 1e5 || (v && Math.abs(v) < 1e-3) ? v.toExponential(d - 1) : (+v.toFixed(d)).toString();
const status = s => $('#status').textContent = s;

// ---------- STEP import (occt-import-js, loaded on first use) ----------
let occtP;
const occt = () => occtP ??= new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = 'vendor/occt-import-js/occt-import-js.js';
  s.onload = () => globalThis.occtimportjs({ locateFile: f => 'vendor/occt-import-js/' + f }).then(res, rej); s.onerror = rej; document.head.append(s);
});

async function loadFiles(files) {
  for (const f of files) {
    if (/\.json$/i.test(f.name)) { loadSession(JSON.parse(await f.text())); continue; }
    status(`Loading OpenCascade… (${f.name})`);
    const o = await occt(), buf = new Uint8Array(await f.arrayBuffer());
    status(`Reading ${f.name}…`); await new Promise(r => setTimeout(r, 20));
    const passes = MESH[$('#quality').value].map(p => o.ReadStepFile(buf, { linearUnit: 'millimeter', ...p })), res = passes.at(-1);
    if (!passes.every(r => r.success)) { status(`Could not read ${f.name} (not a valid STEP?)`); continue; }
    let dens = []; try { dens = readDensities(new TextDecoder('latin1').decode(buf)); } catch { }
    st.bodies.push(...buildBodies(passes, dens, +$('#defrho').value, f.name));
    status(`${f.name}: ${res.meshes.length} bodies`);
  }
  view.setBodies(st.bodies); view.fit(); renderBodies(); renderAxis(); update();
}

// ---------- state → numbers ----------
const bodyMom = b => scale(b.vol, b.rho * KGM3);
const baseMom = () => st.bodies.filter(b => b.on).reduce((a, b) => add(a, bodyMom(b)), zero());
const toolsMom = () => st.tools.filter(valid).reduce((a, t) => add(a, toolMoments(t)), zero());
function axisFrame() {
  const v = $('#axis').value, o = ['#ox', '#oy', '#oz'].map(s => +$(s).value || 0);
  if (v.startsWith('P')) {
    const b = st.bodies[+v.slice(1)], d = derive(bodyMom(b)), e = eig3(d.I), g = e.val;
    const k = [0, 1, 2].reduce((best, i) => { const s = Math.min(...[0, 1, 2].filter(j => j !== i).map(j => Math.abs(g[i] - g[j]))); return s > best[1] ? [i, s] : best; }, [0, -1])[0];
    let a = e.vec[k]; if (a[2] < 0 || (a[2] === 0 && a[0] + a[1] < 0)) a = a.map(x => -x);
    return frame(d.c, a);
  }
  return frame(o, { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[v]);
}
function span(fr) {
  let lo = 1 / 0, hi = -1 / 0;
  for (const b of st.bodies) if (b.on) for (let i = 0; i < b.pos.length; i += 3) {
    const z = fr.R[6] * (b.pos[i] - fr.o[0]) + fr.R[7] * (b.pos[i + 1] - fr.o[1]) + fr.R[8] * (b.pos[i + 2] - fr.o[2]); if (z < lo) lo = z; if (z > hi) hi = z;
  }
  return lo <= hi ? [lo, hi] : [0, 50];
}

function update() {
  const fr = axisFrame(), base = baseMom(), tot = add(base, toolsMom()), r0 = imbalance(base, fr), r1 = imbalance(tot, fr), sp = span(fr);
  const an = axisNames(fr), vec = a => `(${a.map(v => fmt(v, 3)).join(', ')})`;
  const tp = r1.m ? twoPlane(r1, sp[0], sp[1]) : null, good = v => Math.abs(v) < 0.5 ? 'ok' : '';
  const row = (l, a, b, u, cls = '') => `<span>${l}</span><b class="${cls}">${a}</b><b class="${cls}">${b}</b><span>${u}</span>`;
  $('#resid').innerHTML = `<span></span><b>parts</b><b>+ tools</b><span></span>` +
    row(`Static U<sub>${an.n[0]}</sub>`, fmt(r0.U[0]), `<i class="${good(r1.U[0])}">${fmt(r1.U[0])}</i>`, 'g·mm', 'big') + row(`Static U<sub>${an.n[1]}</sub>`, fmt(r0.U[1]), `<i class="${good(r1.U[1])}">${fmt(r1.U[1])}</i>`, 'g·mm', 'big') +
    row('|U|', fmt(r0.Umag), fmt(r1.Umag), 'g·mm') + row('e = |U|/m', fmt(r0.e * 1000), fmt(r1.e * 1000), 'µm') +
    row(`Couple C<sub>${an.n[0]}</sub>`, fmt(r0.C[0]), fmt(r1.C[0]), 'g·mm²') + row(`Couple C<sub>${an.n[1]}</sub>`, fmt(r0.C[1]), fmt(r1.C[1]), 'g·mm²') + row('|C|', fmt(r0.Cmag), fmt(r1.Cmag), 'g·mm²') +
    row('Mass', fmt(r0.m), fmt(r1.m), 'g') +
    (tp ? row(`Plane A ${an.n[0] === 'u' ? 'w' : 'z'}=${fmt(sp[0], 1)}`, '', fmt(Math.hypot(...tp.U1)), 'g·mm') + row(`Plane B ${an.n[0] === 'u' ? 'w' : 'z'}=${fmt(sp[1], 1)}`, '', fmt(Math.hypot(...tp.U2)), 'g·mm') : '');
  if (an.n[0] === 'u') $('#resid').innerHTML += `<span class="note">u/v/w in world: u ${vec(an.u)} · v ${vec(an.v)} · w (axis) ${vec(an.w)}</span>`;
  view.setTools(st.tools.filter(valid));
  const com = tot.m ? tot.M1.map(v => v / tot.m) : [0, 0, 0];
  view.setMarks(r1, fr, com, sp);
  return { fr, base, r0, r1, sp };
}

// ---------- UI ----------
const srcText = b => `${b.src}${b.material ? ' · ' + esc(b.material) : ''} · V ${fmt(b.vol.m)} mm³${b.unc ? ` · ±${fmt(b.unc.dc * 1000, 2)} µm CoM` : ''}`;
function renderBodies() {
  $('#bodies tbody').innerHTML = st.bodies.map((b, i) => `<tr><td><input type="checkbox" data-on="${i}" ${b.on ? 'checked' : ''}></td>
    <td>${esc(b.name)}${b.open ? ` <span title="${b.open} open/non-manifold edges: mesh not closed, mass properties unreliable">⚠</span>` : ''}<div class="src" data-src="${i}">${srcText(b)}</div></td>
    <td><input type="number" step="any" data-rho="${i}" value="${b.rho}"></td><td data-mass="${i}">${fmt(b.vol.m * b.rho * KGM3)}</td></tr>`).join('');
}
function renderAxis() {
  const cur = $('#axis').value || 'Z';
  $('#axis').innerHTML = ['X', 'Y', 'Z'].map(a => `<option>${a}</option>`).join('') + st.bodies.map((b, i) => `<option value="P${i}">${esc(b.name)} principal axis</option>`).join('');
  $('#axis').value = [...$('#axis').options].some(o => o.value === cur) ? cur : 'Z';
}
const LABEL = { h: 'h', x: 'x', y: 'y', z: 'z', rx: 'rx°', ry: 'ry°', rz: 'rz°', rho: 'ρ', r: 'r', ri: 'ri', ro: 'ro', a0: 'a0°', sweep: 'sw°', sc: 'scale' };
function renderTools() {
  $('#tools').innerHTML = st.tools.map((t, i) => `<div class="tool" data-i="${i}">
    <div class="row"><input data-k="name" value="${esc(t.name)}" size="10"> <b>${t.kind}</b>
      <select data-k="role"><option ${t.role === 'counterweight' ? 'selected' : ''}>counterweight</option><option ${t.role === 'swinglink' ? 'selected' : ''}>swinglink</option></select>
      <select data-k="sign"><option value="1" ${t.sign > 0 ? 'selected' : ''}>add</option><option value="-1" ${t.sign < 0 ? 'selected' : ''}>remove</option></select>
      <button data-del="${i}" title="Remove tool">✕</button>${valid(t) ? '' : ' <span class="bad">invalid</span>'}</div>
    <div class="grid">${[...PARAMS[t.kind], ...COMMON_PARAMS].map(k => `<label class="${t.free?.[k] ? 'f' : ''}"><span>${LABEL[k]}</span><input type="number" step="any" data-k="${k}" value="${+(+t[k]).toPrecision(8)}">
      <input type="checkbox" title="free for optimiser" data-free="${k}" ${t.free?.[k] ? 'checked' : ''}>${t.free?.[k] ? `<span class="free"><input type="number" step="any" data-lo="${k}" value="${t.free[k][0]}"><input type="number" step="any" data-hi="${k}" value="${t.free[k][1]}"></span>` : ''}</label>`).join('')}</div>
    ${t.kind === 'prism' ? `<textarea data-k="pts" title="x,y; x,y; … (mm, local)">${t.pts.map(p => p.join(',')).join('; ')}</textarea>` : ''}
    <div class="src">mass ${valid(t) ? fmt(toolMoments(t).m) : '—'} g</div></div>`).join('');
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const defBounds = (k, v) => /^(a0|rx|ry|rz)$/.test(k) ? [-180, 180] : k === 'sweep' ? [5, 360] : [Math.max(/^(x|y|z)$/.test(k) ? -1e9 : 0, +(v - Math.max(Math.abs(v), 10)).toFixed(3)), +(v + Math.max(Math.abs(v), 10)).toFixed(3)];

$('#panel').addEventListener('input', e => {
  const el = e.target, card = el.closest('.tool');
  if (el.dataset.rho) { const b = st.bodies[+el.dataset.rho]; b.rho = +el.value; b.src = 'user'; $(`[data-mass="${el.dataset.rho}"]`).textContent = fmt(b.vol.m * b.rho * KGM3); $(`[data-src="${el.dataset.rho}"]`).innerHTML = srcText(b); return update(); }
  if (!card) return;
  const t = st.tools[+card.dataset.i], k = el.dataset.k;
  if (k === 'pts') { const p = el.value.split(';').map(s => s.split(',').map(Number)).filter(p => p.length === 2 && p.every(isFinite)); if (p.length >= 3) t.pts = p; }
  else if (k === 'name' || k === 'role') t[k] = el.value; else if (k) t[k] = +el.value;
  if (el.dataset.lo) t.free[el.dataset.lo][0] = +el.value; if (el.dataset.hi) t.free[el.dataset.hi][1] = +el.value;
  card.querySelector('.src').textContent = `mass ${valid(t) ? fmt(toolMoments(t).m) : '—'} g`; update();
});
$('#panel').addEventListener('change', e => {
  const el = e.target, card = el.closest('.tool');
  if (el.dataset.on) { const i = +el.dataset.on; st.bodies[i].on = el.checked; view.showBody(i, el.checked); return update(); }
  if (el.id === 'axis' || /^o[xyz]$/.test(el.id)) return update();
  if (el.id === 'defrho') { st.bodies.forEach(b => { if (b.src === 'default') b.rho = +el.value; }); renderBodies(); return update(); }
  if (card && el.dataset.free) { const t = st.tools[+card.dataset.i], k = el.dataset.free; t.free ??= {}; if (el.checked) t.free[k] = defBounds(k, t[k]); else delete t.free[k]; renderTools(); }
  if (card && (el.dataset.k === 'sign' || el.dataset.k === 'role')) { renderTools(); update(); }
});
$('#panel').addEventListener('click', e => {
  const el = e.target;
  if (el.dataset.add) {
    const { sp } = update(), z = st.tools.length % 2 ? sp[0] - 5 : sp[1], t = makeTool(el.dataset.add, { z });
    t.free = el.dataset.add === 'sector' ? { a0: [-180, 180], sweep: [5, 180], h: [0.2, 20] } : el.dataset.add === 'cylinder' ? { x: [-60, 60], y: [-60, 60] } : { rz: [-180, 180], h: [0.2, 20] };
    if (el.dataset.add === 'cylinder') Object.assign(t, { x: 30, r: 5 });
    st.tools.push(t); renderTools(); update(); if (!st.bodies.length) view.fit();
  }
  if (el.dataset.del) { st.tools.splice(+el.dataset.del, 1); renderTools(); update(); }
  if (el.dataset.exp) exportAs(el.dataset.exp);
  if (el.id === 'undo' && st.undo) { st.tools = st.undo; st.undo = null; el.disabled = true; renderTools(); update(); $('#optout').textContent = 'Reverted.'; }
  if (el.id === 'run') runOpt();
});

function runOpt() {
  const { fr, base, sp } = update();
  const free = st.tools.flatMap(t => Object.entries(t.free || {}).map(([key, [lo, hi]]) => ({ id: t.id, key, lo, hi, name: t.name, from: t[key] })));
  if (!free.length) return $('#optout').innerHTML = '<p class="bad">Free at least one tool value (tick its ☐).</p>';
  if (free.some(p => !(p.hi > p.lo))) return $('#optout').innerHTML = '<p class="bad">Each free value needs hi &gt; lo.</p>';
  const L = +$('#lref').value || Math.max(sp[1] - sp[0], 1), t0 = performance.now();
  const res = optimize(base, st.tools, free, fr, { L, w: +$('#wc').value, lam: +$('#lam').value });
  if (!res.after.r) return $('#optout').innerHTML = '<p class="bad">No valid solution inside the bounds.</p>';
  st.undo = st.tools; st.tools = res.tools; $('#undo').disabled = false;
  const dm = res.after.dm, b = res.before.r, a = res.after.r;
  st.last = { L, w: +$('#wc').value, lam: +$('#lam').value, evals: res.evals, ms: performance.now() - t0, params: res.params.map(({ name, key, lo, hi, from, value }) => ({ tool: name, param: key, lo, hi, from, value })),
    before: b && { U: b.U, C: b.C }, after: { U: a.U, C: a.C }, addedMass: dm };
  $('#optout').innerHTML = `<table><tr><th>Tool.param</th><th>from</th><th>→ suggested</th></tr>${st.last.params.map(p => `<tr><td>${esc(p.tool)}.${p.param}</td><td>${fmt(p.from)}</td><td><b>${fmt(p.value, 4)}</b></td></tr>`).join('')}</table>
    <p>|U| ${b ? fmt(b.Umag) : '—'} → <b>${fmt(a.Umag)}</b> g·mm · |C| ${b ? fmt(b.Cmag) : '—'} → <b>${fmt(a.Cmag)}</b> g·mm² · tools mass ${fmt(dm)} g · ${res.evals} evals, ${fmt(st.last.ms, 0)} ms</p>`;
  renderTools(); update();
}

// ---------- export / session ----------
function save(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e4); }
const resRows = (r, an) => [[`residual`, `U${an.n[0]} g.mm`, r.U[0]], ['residual', `U${an.n[1]} g.mm`, r.U[1]], ['residual', `C${an.n[0]} g.mm2`, r.C[0]], ['residual', `C${an.n[1]} g.mm2`, r.C[1]],
  ...(an.n[0] === 'u' ? ['u', 'v', 'w'].map(k => ['basis', `${k} (world)`, an[k].join(' ')]) : [])];
const resJson = (r, an) => ({ components: an.n, basis: { u: an.u, v: an.v, w: an.w }, U: r.U, C: r.C, mass: r.m,
  note: an.n[0] === 'u' ? 'U and C are components along u, v (world vectors in basis); w is the spin axis' : 'U and C are world x, y components (spin axis +Z)' });
function exportAs(kind) {
  const { fr, r1 } = update();
  if (kind === 'step') return st.tools.some(t => valid(t) && t.sign > 0) || st.tools.some(valid) ? save('counterweights.stp', toStep(st.tools), 'application/step') : status('No valid tools to export');
  if (kind === 'csv') return save('counterweights.csv', 'tool,kind,role,sign,param,value\n' + st.tools.flatMap(t => [...PARAMS[t.kind], ...COMMON_PARAMS].map(k => [t.name, t.kind, t.role, t.sign, k, t[k]].join(','))).join('\n') +
    `\n\n${resRows(r1, axisNames(fr)).map(r => r.join(',')).join('\n')}\n`, 'text/csv');
  save('balance-session.json', JSON.stringify({ app: 'compressor-balancer', version: VERSION, units: { length: 'mm', mass: 'g', density: 'kg/m3' },
    axis: { origin: fr.o, R: fr.R, choice: $('#axis').value }, bodies: st.bodies.map(b => ({ name: b.name, on: b.on, rho: b.rho, src: b.src, mass: b.vol.m * b.rho * KGM3 })),
    tools: st.tools, residual: resJson(r1, axisNames(fr)), optimisation: st.last }, null, 1), 'application/json');
}
function loadSession(j) {
  if (!Array.isArray(j.tools)) return status('JSON has no tools[]');
  st.tools = j.tools.map(({ id, ...t }) => makeTool(t.kind, t));
  for (const b of j.bodies || []) { const m = st.bodies.find(x => x.name === b.name); if (m) Object.assign(m, { rho: b.rho, src: b.src, on: b.on }); }
  renderBodies(); renderTools(); update(); status('Session loaded');
}

const drop = $('#drop');
['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
document.addEventListener('drop', e => loadFiles([...e.dataTransfer.files]).catch(err => status('Error: ' + err.message)));
$('#file').addEventListener('change', e => loadFiles([...e.target.files]).catch(err => status('Error: ' + err.message)));
renderAxis(); update();
