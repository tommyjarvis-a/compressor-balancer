import { KGM3, add, scale, meshMoments, derive, eig3, openEdges, zero, richardson, MESH } from './mass.js';
import { frame, imbalance, twoPlane } from './imbalance.js';
import { makeTool, toolMoments, valid, PARAMS, COMMON_PARAMS } from './tools.js';
import { readDensities } from './step-meta.js';
import { createView } from './view.js';

const VERSION = '0.1.0-alpha', $ = s => document.querySelector(s), view = createView($('#view'));
const st = { bodies: [], tools: [] };
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
    status(`Loading OpenCascade… (${f.name})`);
    const o = await occt(), buf = new Uint8Array(await f.arrayBuffer());
    status(`Reading ${f.name}…`); await new Promise(r => setTimeout(r, 20));
    const passes = MESH[$('#quality').value].map(p => o.ReadStepFile(buf, { linearUnit: 'millimeter', ...p })), res = passes.at(-1);
    if (!passes.every(r => r.success)) { status(`Could not read ${f.name} (not a valid STEP?)`); continue; }
    const two = passes.length === 2 && passes[0].meshes.length === res.meshes.length;
    let dens = []; try { dens = readDensities(new TextDecoder('latin1').decode(buf)); } catch { }
    const one = dens.length && new Set(dens.map(d => d.density)).size === 1 ? dens[0] : null;
    res.meshes.forEach((m, i) => {
      const pos = m.attributes.position.array, idx = m.index.array, fine = meshMoments(pos, idx);
      let vol = fine, unc = null;
      if (two) { // extrapolate and keep |fine − extrapolated| as the tessellation uncertainty estimate
        const c = passes[0].meshes[i]; vol = richardson(meshMoments(c.attributes.position.array, c.index.array), fine);
        const a = derive(vol), b = derive(fine); unc = { dV: Math.abs(b.m - a.m) / Math.abs(a.m), dc: Math.hypot(...b.c.map((v, k) => v - a.c[k])) };
      }
      if (vol.m < 0) vol = scale(vol, -1);
      const d = dens.find(x => x.product === m.name) || one;
      st.bodies.push({ name: m.name || f.name, vol, unc, rho: d ? Math.round(d.density * 1000) / 1000 : +$('#defrho').value, src: d ? 'STEP' : 'default', material: d?.material, on: true, pos, idx, nrm: m.attributes.normal?.array, open: openEdges(pos, idx), color: m.color && (m.color[0] * 255 << 16 | m.color[1] * 255 << 8 | m.color[2] * 255) });
    });
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
  const tp = r1.m ? twoPlane(r1, sp[0], sp[1]) : null, good = v => Math.abs(v) < 0.5 ? 'ok' : '';
  const row = (l, a, b, u, cls = '') => `<span>${l}</span><b class="${cls}">${a}</b><b class="${cls}">${b}</b><span>${u}</span>`;
  $('#resid').innerHTML = `<span></span><b>parts</b><b>+ tools</b><span></span>` +
    row('Static U<sub>x</sub>', fmt(r0.U[0]), `<i class="${good(r1.U[0])}">${fmt(r1.U[0])}</i>`, 'g·mm', 'big') + row('Static U<sub>y</sub>', fmt(r0.U[1]), `<i class="${good(r1.U[1])}">${fmt(r1.U[1])}</i>`, 'g·mm', 'big') +
    row('|U|', fmt(r0.Umag), fmt(r1.Umag), 'g·mm') + row('e = |U|/m', fmt(r0.e * 1000), fmt(r1.e * 1000), 'µm') +
    row('Couple C<sub>x</sub>', fmt(r0.C[0]), fmt(r1.C[0]), 'g·mm²') + row('Couple C<sub>y</sub>', fmt(r0.C[1]), fmt(r1.C[1]), 'g·mm²') + row('|C|', fmt(r0.Cmag), fmt(r1.Cmag), 'g·mm²') +
    row('Mass', fmt(r0.m), fmt(r1.m), 'g') +
    (tp ? row(`Plane A z=${fmt(sp[0], 1)}`, '', fmt(Math.hypot(...tp.U1)), 'g·mm') + row(`Plane B z=${fmt(sp[1], 1)}`, '', fmt(Math.hypot(...tp.U2)), 'g·mm') : '');
  view.setTools(st.tools.filter(valid));
  const com = tot.m ? tot.M1.map(v => v / tot.m) : [0, 0, 0];
  view.setMarks(r1, fr, com, sp);
  return { fr, base, r0, r1, sp };
}

// ---------- UI ----------
function renderBodies() {
  $('#bodies tbody').innerHTML = st.bodies.map((b, i) => `<tr><td><input type="checkbox" data-on="${i}" ${b.on ? 'checked' : ''}></td>
    <td>${esc(b.name)}${b.open ? ` <span title="${b.open} open/non-manifold edges: mesh not closed, mass properties unreliable">⚠</span>` : ''}<div class="src">${b.src}${b.material ? ' · ' + esc(b.material) : ''} · V ${fmt(b.vol.m)} mm³${b.unc ? ` · ±${fmt(b.unc.dc * 1000, 2)} µm CoM` : ''}</div></td>
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
    <div class="grid">${[...PARAMS[t.kind], ...COMMON_PARAMS].map(k => `<label><span>${LABEL[k]}</span><input type="number" step="any" data-k="${k}" value="${+(+t[k]).toPrecision(8)}"></label>`).join('')}</div>
    ${t.kind === 'prism' ? `<textarea data-k="pts" title="x,y; x,y; … (mm, local)">${t.pts.map(p => p.join(',')).join('; ')}</textarea>` : ''}
    <div class="src">mass ${valid(t) ? fmt(toolMoments(t).m) : '—'} g</div></div>`).join('');
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);


$('#panel').addEventListener('input', e => {
  const el = e.target, card = el.closest('.tool');
  if (el.dataset.rho) { const b = st.bodies[+el.dataset.rho]; b.rho = +el.value; b.src = 'user'; $(`[data-mass="${el.dataset.rho}"]`).textContent = fmt(b.vol.m * b.rho * KGM3); return update(); }
  if (!card) return;
  const t = st.tools[+card.dataset.i], k = el.dataset.k;
  if (k === 'pts') { const p = el.value.split(';').map(s => s.split(',').map(Number)).filter(p => p.length === 2 && p.every(isFinite)); if (p.length >= 3) t.pts = p; }
  else if (k === 'name' || k === 'role') t[k] = el.value; else if (k) t[k] = +el.value;
  card.querySelector('.src').textContent = `mass ${valid(t) ? fmt(toolMoments(t).m) : '—'} g`; update();
});
$('#panel').addEventListener('change', e => {
  const el = e.target, card = el.closest('.tool');
  if (el.dataset.on) { const i = +el.dataset.on; st.bodies[i].on = el.checked; view.showBody(i, el.checked); return update(); }
  if (el.id === 'axis' || /^o[xyz]$/.test(el.id)) return update();
  if (el.id === 'defrho') { st.bodies.forEach(b => { if (b.src === 'default') b.rho = +el.value; }); renderBodies(); return update(); }
  if (card && (el.dataset.k === 'sign' || el.dataset.k === 'role')) { renderTools(); update(); }
});
$('#panel').addEventListener('click', e => {
  const el = e.target;
  if (el.dataset.add) {
    const { sp } = update(), z = st.tools.length % 2 ? sp[0] - 5 : sp[1], t = makeTool(el.dataset.add, { z });
    if (el.dataset.add === 'cylinder') Object.assign(t, { x: 30, r: 5 });
    st.tools.push(t); renderTools(); update(); if (!st.bodies.length) view.fit();
  }
  if (el.dataset.del) { st.tools.splice(+el.dataset.del, 1); renderTools(); update(); }
});



const drop = $('#drop');
['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
document.addEventListener('drop', e => loadFiles([...e.dataTransfer.files]).catch(err => status('Error: ' + err.message)));
$('#file').addEventListener('change', e => loadFiles([...e.target.files]).catch(err => status('Error: ' + err.message)));
renderAxis(); update();
