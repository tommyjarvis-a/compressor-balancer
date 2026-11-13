import { KGM3, add, scale, meshMoments, derive, eig3, openEdges, zero, richardson, MESH } from './mass.js';
import { readDensities } from './step-meta.js';
import { createView } from './view.js';

const VERSION = '0.1.0-alpha', $ = s => document.querySelector(s), view = createView($('#view'));
const st = { bodies: [] };
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
  view.setBodies(st.bodies); view.fit(); renderBodies(); update();
}

// ---------- state → numbers ----------
const bodyMom = b => scale(b.vol, b.rho * KGM3);
const baseMom = () => st.bodies.filter(b => b.on).reduce((a, b) => add(a, bodyMom(b)), zero());
function update() {
  const m = baseMom(), row = (l, v, u) => `<span>${l}</span><b>${v}</b><span></span><span>${u}</span>`;
  if (!m.m) { $('#resid').innerHTML = ''; view.setMarks(null); return; }
  const d = derive(m), e = eig3(d.I).val.slice().sort((x, y) => x - y);
  $('#resid').innerHTML = row('Mass', fmt(d.m), 'g') + row('CoM x / y / z', d.c.map(v => fmt(v)).join(' / '), 'mm') +
    row('I<sub>xx</sub> I<sub>yy</sub> I<sub>zz</sub>', [0, 4, 8].map(k => fmt(d.I[k])).join(' '), 'g·mm²') + row('I<sub>xy</sub> I<sub>xz</sub> I<sub>yz</sub>', [1, 2, 5].map(k => fmt(d.I[k])).join(' '), 'g·mm²') +
    row('Principal', e.map(v => fmt(v)).join(' '), 'g·mm²');
  view.setMarks(d.c);
}

// ---------- UI ----------
function renderBodies() {
  $('#bodies tbody').innerHTML = st.bodies.map((b, i) => `<tr><td><input type="checkbox" data-on="${i}" ${b.on ? 'checked' : ''}></td>
    <td>${esc(b.name)}${b.open ? ` <span title="${b.open} open/non-manifold edges: mesh not closed, mass properties unreliable">⚠</span>` : ''}<div class="src">${b.src}${b.material ? ' · ' + esc(b.material) : ''} · V ${fmt(b.vol.m)} mm³${b.unc ? ` · ±${fmt(b.unc.dc * 1000, 2)} µm CoM` : ''}</div></td>
    <td><input type="number" step="any" data-rho="${i}" value="${b.rho}"></td><td data-mass="${i}">${fmt(b.vol.m * b.rho * KGM3)}</td></tr>`).join('');
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

$('#panel').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.rho) { const b = st.bodies[+el.dataset.rho]; b.rho = +el.value; b.src = 'user'; $(`[data-mass="${el.dataset.rho}"]`).textContent = fmt(b.vol.m * b.rho * KGM3); update(); }
});
$('#panel').addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.on) { const i = +el.dataset.on; st.bodies[i].on = el.checked; view.showBody(i, el.checked); update(); }
  if (el.id === 'defrho') { st.bodies.forEach(b => { if (b.src === 'default') b.rho = +el.value; }); renderBodies(); update(); }
});

const drop = $('#drop');
['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
document.addEventListener('drop', e => loadFiles([...e.dataTransfer.files]).catch(err => status('Error: ' + err.message)));
$('#file').addEventListener('change', e => loadFiles([...e.target.files]).catch(err => status('Error: ' + err.message)));
update();
