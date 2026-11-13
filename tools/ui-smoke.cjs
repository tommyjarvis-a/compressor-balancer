// Headed UI smoke: triad, model-space origin at 0,0,0, body selection (list ⇄ view, drag ≠ click, Esc, Ctrl-click multi-select),
// Calculate CG (marker, no-selection message, stale on selection/density change, dashed line from origin), typed axis, axis picking
// (cylinder, circular edge, 2 points), optimiser about a tilted axis, JSON/CSV export and session reload.
// Uses test/fixtures/tilted-rotor.stp (shaft + ring rotor + lump on a tilted axis). Needs Playwright:
//   python3 -m http.server 8765 &   HEADED=1 node tools/ui-smoke.cjs [url]
// Env: BROWSERS=chromium,webkit (or msedge: installed Microsoft Edge)  HEADED=1  PLAYWRIGHT=/path/to/playwright
const pw = require(process.env.PLAYWRIGHT || 'playwright'), path = require('path'), fs = require('fs');
const url = process.argv[2] || 'http://localhost:8765/', FIX = path.join(__dirname, '../test/fixtures/tilted-rotor.stp');
const TILT = { rx: 25, ry: -10, rz: 15 }, O = [5, -3, 8];
(async () => {
  const { rotMat } = await import('../src/tools.js'), R = rotMat(TILT), W = [R[2], R[5], R[8]];
  const world = ([x, y, z]) => [0, 1, 2].map(k => O[k] + R[3 * k] * x + R[3 * k + 1] * y + R[3 * k + 2] * z);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => a.map((v, k) => v - b[k]);
  let fail = 0;
  for (const name of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
    const b = await (name === 'msedge' ? pw.chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }) : pw[name].launch({ headless: !process.env.HEADED })), ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
    const p = await ctx.newPage(), errs = [], res = [];
    p.on('pageerror', e => errs.push(e.message));
    const check = (label, ok, info = '') => { res.push(`${ok ? 'ok ' : 'FAIL'} ${label}${info ? ' — ' + info : ''}`); if (!ok) fail++; };
    const st = () => p.evaluate(() => JSON.parse(JSON.stringify({ sel: rab.st.sel, axis: rab.st.axis, msg: document.querySelector('#axmsg').textContent, last: rab.st.last, names: rab.st.bodies.map(b => b.name) })));
    // first screen point (of a list of local fixture points) where the 3-D view hits the expected body near that point
    const find = (body, pts) => p.evaluate(([body, pts]) => { for (const q of pts) { const [x, y] = rab.view.project(q), h = rab.view.pick(x, y);
      // robust spot: the same body also within ±4 px (clicks may land on rounded pixel coordinates)
      const near = [[-4, -4], [4, -4], [-4, 4], [4, 4]].every(([dx, dy]) => { const g = rab.view.pick(x + dx, y + dy); return g && g.body === h?.body; });
      if (h && near && rab.st.bodies[h.body].name === body && Math.hypot(...h.point.map((v, k) => v - q[k])) < 1) return { x: Math.round(x), y: Math.round(y) }; } return null; }, [body, pts])
      .then(r => r && p.evaluate(([x, y]) => ({ x, y, point: rab.view.pick(x, y).point }), [r.x, r.y]));
    const ring = (r, z, from = 0, to = 360) => { const o = []; for (let a = from; a < to; a += 10) o.push(world([r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180), z])); return o; };
    try {
      await p.goto(url); await p.setInputFiles('#file', FIX);
      await p.waitForFunction(() => / bodies ·/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
      const names = (await st()).names, iRotor = names.indexOf('rotor'), iShaft = names.indexOf('shaft');
      const view = await p.locator('#view canvas').boundingBox();
      const origin = await p.evaluate(() => ({ has: rab.view.hasOrigin(), text: document.querySelector('#originmark')?.textContent, hidden: !!document.querySelector('#originmark')?.hidden, line: rab.view.hasOriginToCG(), ov: rab.view.markerOverlay() }));
      check('model-space origin marker at 0,0,0 (label, not the inset triad)', origin.has && /Origin 0,0,0/.test(origin.text || '') && !origin.line, JSON.stringify({ has: origin.has, text: origin.text, hidden: origin.hidden }));
      check('origin/CG overlay pass draws on top (depthTest/depthWrite off)', origin.ov.pass === 'overlay' && origin.ov.mats.length > 0 && origin.ov.mats.every(m => m.depthTest === false && m.depthWrite === false), JSON.stringify(origin.ov));
      // --- triad: red/green/blue pixels in the lower-left inset, follows the camera, survives resize
      const colours = async () => { const box = await p.locator('#view canvas').boundingBox(), px = await p.evaluate(() => rab.view.triadPx);
        const png = await p.screenshot({ clip: { x: box.x, y: box.y + box.height - px, width: px, height: px } });
        return p.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, n = [0, 0, 0];
          for (let i = 0; i < d.length; i += 4) { const [r, gg, bb] = [d[i], d[i + 1], d[i + 2]]; if (r > 170 && gg < 90 && bb < 90) n[0]++; else if (gg > 120 && r < 90 && bb < 110) n[1]++; else if (bb > 160 && r < 90 && gg < 140) n[2]++; }
          return n; }, png.toString('base64')); };
      const c0 = await colours(); check('triad drawn (red/green/blue px)', c0.every(n => n > 50), c0.join('/'));
      const t0 = await p.evaluate(() => rab.view.triadScreen());
      const tgt = await find('rotor', ring(30, 20)); if (!tgt) throw new Error('rotor not under any probe point');
      await p.mouse.move(tgt.x - 160, tgt.y - 30); await p.mouse.down(); await p.mouse.move(tgt.x - 60, tgt.y, { steps: 8 }); await p.mouse.move(tgt.x, tgt.y, { steps: 8 }); await p.mouse.up();
      await p.waitForTimeout(400);
      const t1 = await p.evaluate(() => rab.view.triadScreen()), moved = Math.hypot(t1[0][0] - t0[0][0], t1[0][1] - t0[0][1]);
      check('triad follows an orbit drag', moved > 0.05, `X ${JSON.stringify(t0[0])} → ${JSON.stringify(t1[0])}`);
      check('drag ending on a body does not select it', (await st()).sel === -1);
      // triad X direction matches the main view's projected world X
      await p.setViewportSize({ width: 1000, height: 700 }); await p.waitForTimeout(500);
      const c1 = await colours(); check('triad after resize', c1.every(n => n > 50), c1.join('/'));
      await p.setViewportSize({ width: 1400, height: 900 }); await p.waitForTimeout(500);
      // --- selection: view → list, list → view, Esc, empty space
      let h = await find('rotor', ring(30, 20)); await p.mouse.click(h.x, h.y); let s = await st();
      const rowSel = await p.evaluate(() => [...document.querySelectorAll('#bodies tr.sel')].map(r => +r.dataset.row));
      check('click body in view selects it + list row', s.sel === iRotor && rowSel.join() === String(iRotor), `sel ${s.sel} rows ${rowSel}`);
      await p.click(`#bodies tr[data-row="${iShaft}"] td:nth-child(2)`); s = await st();
      const hl = await p.evaluate(() => rab.view.highlighted());
      check('click list row selects body + highlights it in the view', s.sel === iShaft && hl.every((v, i) => v === (i === iShaft)), `sel ${s.sel} highlight ${hl}`);
      if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '-select.png' });
      await p.keyboard.press('Escape'); check('Esc deselects', (await st()).sel === -1);
      await p.mouse.click(h.x, h.y); await p.mouse.click(view.x + view.width - 30, view.y + 30); check('click empty space deselects', (await st()).sel === -1);
      // --- assembly CG: no selection, multi-select, marker, stale
      await p.click('#calcg');
      const cgNone = await p.textContent('#cgout');
      check('Calculate CG with no selection shows a message', /No bodies selected/.test(cgNone) && !(await p.evaluate(() => rab.view.hasAssemblyCG())), cgNone);
      await p.click(`#bodies tr[data-row="${iShaft}"] td:nth-child(2)`);
      await p.click(`#bodies tr[data-row="${iRotor}"] td:nth-child(2)`, { modifiers: ['ControlOrMeta'] });
      const sels = await p.evaluate(() => rab.st.sels.slice().sort((a, b) => a - b));
      check('Ctrl-click adds a second body to the selection', sels.join() === [iRotor, iShaft].sort((a, b) => a - b).join(), `sels ${sels}`);
      await p.click('#calcg');
      const cg = await p.evaluate(() => ({ text: document.querySelector('#cgout').textContent, x: document.querySelector('#cgx')?.textContent, y: document.querySelector('#cgy')?.textContent, z: document.querySelector('#cgz')?.textContent, m: document.querySelector('#cgm')?.textContent, n: document.querySelector('#cgn')?.textContent, mark: !!document.querySelector('#cgmark') && !document.querySelector('#cgmark').hidden, has: rab.view.hasAssemblyCG(), stale: document.querySelector('#cgout').classList.contains('stale'), c: rab.st.cg && rab.st.cg.c, mass: rab.st.cg && rab.st.cg.m }));
      const nums = [cg.x, cg.y, cg.z, cg.m].every(v => v && isFinite(Number(v)));
      check('Calculate CG readout: X/Y/Z mm, mass g, body count, not stale', nums && cg.n === '2' && /Assembly CG/.test(cg.text) && /WCS origin/.test(cg.text) && !cg.stale, JSON.stringify({ x: cg.x, y: cg.y, z: cg.z, m: cg.m, n: cg.n, stale: cg.stale }));
      check('assembly CG marker is visible (3-D + on-screen label)', cg.mark && cg.has, JSON.stringify({ mark: cg.mark, has: cg.has }));
      const cgLine = await p.evaluate(() => ({ line: rab.view.hasOriginToCG(), origin: rab.view.hasOrigin(), originText: document.querySelector('#originmark')?.textContent }));
      check('dashed line from origin to CG; origin marker still present', cgLine.line && cgLine.origin && /Origin 0,0,0/.test(cgLine.originText || ''), JSON.stringify(cgLine));
      const ov2 = await p.evaluate(() => rab.view.markerOverlay());
      check('CG marker is also on the overlay pass', ov2.pass === 'overlay' && ov2.mats.length > origin.ov.mats.length && ov2.mats.every(m => m.depthTest === false && m.depthWrite === false), `mats ${ov2.count}`);
      // M3: gold / RGB pixels must be visible at the projected CG and origin (not covered by the bodies)
      const countColours = async world => {
        const loc = await p.evaluate(q => { const [x, y] = rab.view.project(q), box = document.querySelector('#view canvas').getBoundingClientRect(); return { x, y, bx: box.x, by: box.y }; }, world);
        const rpx = 22, clip = { x: loc.x - rpx, y: loc.y - rpx, width: rpx * 2, height: rpx * 2 };
        const png = await p.screenshot({ clip });
        return p.evaluate(async b64 => {
          const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, n = { gold: 0, red: 0, green: 0, blue: 0 };
          for (let i = 0; i < d.length; i += 4) {
            const [r, gg, bb] = [d[i], d[i + 1], d[i + 2]];
            if (r > 200 && gg > 160 && bb < 80) n.gold++;
            else if (r > 170 && gg < 90 && bb < 90) n.red++;
            else if (gg > 120 && r < 90 && bb < 110) n.green++;
            else if (bb > 160 && r < 90 && gg < 140) n.blue++;
          }
          return n;
        }, png.toString('base64'));
      };
      const cgPos = cg.c || await p.evaluate(() => rab.st.cg.c), gold = await countColours(cgPos), rgb = await countColours([0, 0, 0]);
      check('gold CG marker pixels visible through / on top of the parts', gold.gold > 20, JSON.stringify(gold));
      check('RGB origin arrows visible through / on top of the parts', rgb.red > 10 && rgb.green > 10 && rgb.blue > 10, JSON.stringify(rgb));
      if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '-cg.png' });
      // change selection → stale; numbers kept
      await p.click(`#bodies tr[data-row="${names.indexOf('lump')}"] td:nth-child(2)`);
      const staleSel = await p.evaluate(() => ({ stale: document.querySelector('#cgout').classList.contains('stale'), tag: document.querySelector('#cgout .tag')?.textContent, x: document.querySelector('#cgx')?.textContent, label: document.querySelector('#cgmark')?.textContent }));
      check('selection change marks the CG result stale (values kept)', staleSel.stale && staleSel.tag === 'stale' && staleSel.x === cg.x && /stale/.test(staleSel.label || ''), JSON.stringify(staleSel));
      // recalculate, then change a density → stale
      await p.click(`#bodies tr[data-row="${iShaft}"] td:nth-child(2)`);
      await p.click(`#bodies tr[data-row="${iRotor}"] td:nth-child(2)`, { modifiers: ['ControlOrMeta'] });
      await p.click('#calcg');
      const prevRho = await p.inputValue(`#bodies input[data-rho="${iRotor}"]`);
      await p.fill(`#bodies input[data-rho="${iRotor}"]`, '8000');
      await p.dispatchEvent(`#bodies input[data-rho="${iRotor}"]`, 'input');
      const staleRho = await p.evaluate(() => document.querySelector('#cgout').classList.contains('stale'));
      check('density change marks the CG result stale', staleRho);
      await p.fill(`#bodies input[data-rho="${iRotor}"]`, prevRho);
      await p.dispatchEvent(`#bodies input[data-rho="${iRotor}"]`, 'input');
      await p.click('#calcg');
      await p.keyboard.press('Escape'); // deselect so later pick tests still see sel === -1
      // --- typed axis
      const typeAxis = async (o, d) => { for (const [k, v] of [['ox', o[0]], ['oy', o[1]], ['oz', o[2]], ['dx', d[0]], ['dy', d[1]], ['dz', d[2]]]) { await p.fill('#' + k, String(v)); await p.dispatchEvent('#' + k, 'change'); } };
      const fields = async ids => Object.fromEntries(await Promise.all(ids.map(async id => [id, await p.inputValue('#' + id)])));
      await typeAxis([0, 0, 0], [0, 0, 0]); s = await st();
      let inp = await fields(['dx', 'dy', 'dz']);
      check('zero direction rejected', /non-zero/.test(s.msg) && s.axis.d.join() === '0,0,1' && inp.dx === '0' && inp.dy === '0' && inp.dz === '0', `${s.msg} boxes ${JSON.stringify(inp)}`);
      await typeAxis([1, 2, 3], [1, 0, 2]); s = await st(); inp = await fields(['dx', 'dy', 'dz']);
      check('typed axis normalised internally', Math.abs(s.axis.d[0] - 1 / Math.sqrt(5)) < 1e-9 && Math.abs(s.axis.d[2] - 2 / Math.sqrt(5)) < 1e-9 && s.axis.src === 'C' && (await p.inputValue('#axis')) === 'C', JSON.stringify(s.axis));
      check('typed direction boxes kept as typed', inp.dx === '1' && inp.dy === '0' && inp.dz === '2', JSON.stringify(inp));
      // M2: Tester's field-by-field unit vector (GATE-69afba1). Previously each change rewrote all three boxes, leaving d 4.3° off.
      const raw = [0.40558, -0.40558, 0.81915], nraw = Math.hypot(...raw), prec = v => +(+v).toPrecision(10);
      await typeAxis([12, -7, 20], raw); s = await st(); inp = await fields(['ox', 'oy', 'oz', 'dx', 'dy', 'dz']);
      const kept = [inp.ox, inp.oy, inp.oz].map(Number).every((v, i) => v === [12, -7, 20][i]) && [inp.dx, inp.dy, inp.dz].map(Number).every((v, i) => v === raw[i]);
      const want = raw.map(v => prec(v / nraw)), onRaw = want.every((v, i) => s.axis.d[i] === v);
      check('M2 field-by-field direction not rewritten, axis is the unit of the typed values', kept && onRaw && s.axis.src === 'C', JSON.stringify({ inp, d: s.axis.d }));
      check('unit direction readout', /û/.test(await p.textContent('#dhat')));
      const keptD = s.axis.d.slice();
      await p.evaluate(() => { const el = document.getElementById('dx'); el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); });
      s = await st(); inp = await fields(['dx', 'dy', 'dz']);
      check('non-numeric direction rejected, last axis kept', /numbers/.test(s.msg) && s.axis.d.every((v, i) => v === keptD[i]) && inp.dx === '', `${s.msg} ${JSON.stringify({ inp, d: s.axis.d })}`);
      // --- picking: cylinder face (rotor outer surface)
      await p.click('[data-pick="cyl"]'); h = await find('rotor', ring(30, 20)); await p.mouse.click(h.x, h.y); s = await st();
      const off = sub(s.axis.p, O), perp = Math.hypot(...sub(off, W.map(v => v * dot(off, W))));
      check('pick cylinder → tilted axis', Math.abs(Math.abs(dot(s.axis.d, W)) - 1) < 1e-6 && perp < 1e-3 && /cylinder of rotor: r = 30/.test(s.msg), `|d·w| ${Math.abs(dot(s.axis.d, W))} off ${perp.toExponential(1)} mm; ${s.msg}`);
      check('pick ended, selection untouched', (await st()).sel === -1 && !(await p.evaluate(() => rab.st.pick)));
      // circular edge: rotor top face (local z = 40) near its outer rim, away from the lump (a0 30°..70°)
      await p.click('[data-pick="loop"]'); h = await find('rotor', ring(26, 40, 100, 360)); await p.mouse.click(h.x, h.y); s = await st();
      const ctr = world([0, 0, 40]);
      check('pick circular edge → centre + normal', Math.hypot(...sub(s.axis.p, ctr)) < 1e-3 && Math.abs(Math.abs(dot(s.axis.d, W)) - 1) < 1e-6 && /circular edge of rotor: r = 30/.test(s.msg), `${Math.hypot(...sub(s.axis.p, ctr)).toExponential(1)} mm; ${s.msg}`);
      // two points
      await p.click('[data-pick="pts"]'); const a = await find('rotor', ring(30, 10)), bb = await find('rotor', ring(26, 40, 100, 360));
      await p.mouse.click(a.x, a.y); const mid = await st(); await p.mouse.click(bb.x, bb.y); s = await st();
      const e = sub(bb.point, a.point), en = Math.hypot(...e);
      check('pick 2 points → axis through them', /second point/.test(mid.msg) && Math.abs(Math.abs(dot(s.axis.d, e)) / en - 1) < 1e-5 && /2 picked points/.test(s.msg), s.msg);
      // Esc cancels a pending pick
      await p.click('[data-pick="cyl"]'); await p.keyboard.press('Escape'); check('Esc cancels pick', !(await p.evaluate(() => rab.st.pick)) && /cancelled/.test((await st()).msg));
      // --- optimiser about the tilted axis (typed exactly), two sectors placed on the axis
      await typeAxis(O, W.map(v => +v.toPrecision(12))); await p.click('[data-add="sector"]'); await p.click('[data-add="sector"]');
      await p.click('#run'); await p.waitForFunction(() => rab.st.last, null, { timeout: 30000 }); s = await st();
      const U = Math.hypot(...s.last.after.U), C = Math.hypot(...s.last.after.C), U0 = Math.hypot(...s.last.before.U);
      if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '-axis.png' });
      check('optimiser balances about the tilted axis', U < 0.05 && C < 5 && U0 > 100, `|U| ${U0.toFixed(1)} → ${U.toExponential(2)} g·mm, |C| → ${C.toExponential(2)} g·mm²`);
      // Recalculate on shaft+rotor immediately before export so the session is current.
      // Esc after the earlier calc, and later picks, would otherwise leave the CG stale (H3).
      const namesNow = await p.evaluate(() => rab.st.bodies.map(b => b.name));
      const iS = namesNow.indexOf('shaft'), iR = namesNow.indexOf('rotor');
      await p.click(`#bodies tr[data-row="${iS}"] td:nth-child(2)`);
      await p.click(`#bodies tr[data-row="${iR}"] td:nth-child(2)`, { modifiers: ['ControlOrMeta'] });
      await p.click('#calcg');
      // --- export + session reload (current, stale-after-density, legacy, other-file)
      const dl = async k => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(`[data-exp="${k}"]`)]); return fs.readFileSync(await d.path(), 'utf8'); };
      const readCG = () => p.evaluate(() => ({ c: rab.st.cg && rab.st.cg.c, mass: rab.st.cg && rab.st.cg.m, stale: document.querySelector('#cgout')?.classList.contains('stale'), text: document.querySelector('#cgout')?.textContent, dropped: !!(rab.st.cg && rab.st.cg.dropped), notice: (rab.st.cg && rab.st.cg.notice) || '', has: rab.view.hasAssemblyCG(), mark: !!document.querySelector('#cgmark') && !document.querySelector('#cgmark').hidden, sels: rab.st.sels.slice(), rho: Object.fromEntries(rab.st.bodies.map(b => [b.name, b.rho])) }));
      const loadFileThenSession = async (step, sessionFile) => {
        await p.reload(); await p.setInputFiles('#file', step); await p.waitForFunction(() => / bodies ·/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
        await p.setInputFiles('#file', sessionFile); await p.waitForFunction(() => /Session loaded/.test(document.querySelector('#status').textContent), null, { timeout: 10000 });
      };
      const j = JSON.parse(await dl('json')), csv = await dl('csv'), ax = j.axis;
      check('JSON axis point/direction/basis', ax.point.join() === s.axis.p.join() && ax.direction.join() === s.axis.d.join() && ax.basis.w.every((v, k) => Math.abs(v - s.axis.d[k]) < 1e-9) && Math.abs(dot(ax.basis.u, ax.basis.w)) < 1e-12, JSON.stringify(ax.basis.u));
      check('CSV axis + basis rows', /axis,direction \(world\),/.test(csv) && /basis,w \(world\),/.test(csv) && /basis,u \(world\),/.test(csv));
      const cgJ = j.assemblyCG;
      const cgBodies = (cgJ && cgJ.bodies) || [];
      const refs = cgBodies.every(b => b && Number.isFinite(b.index) && Number.isFinite(b.vol) && Array.isArray(b.bbox) && b.bbox.length === 6);
      check('JSON includes assembly CG (c, mass, body fingerprints)', !!(cgJ && Array.isArray(cgJ.c) && cgJ.c.length === 3 && typeof cgJ.mass === 'number' && cgBodies.length >= 1 && refs), JSON.stringify(cgJ));
      check('export after Calculate CG writes stale false', !!(cgJ && cgJ.stale === false), JSON.stringify(cgJ && { stale: cgJ.stale }));
      check('CSV includes assembly CG rows', /assembly CG,X mm,/.test(csv) && /assembly CG,Y mm,/.test(csv) && /assembly CG,Z mm,/.test(csv) && /assembly CG,mass g,/.test(csv) && /assembly CG,stale,false/.test(csv));
      const resid0 = await p.textContent('#resid'), tmp = require('os').tmpdir(), jf = path.join(tmp, 'rab-session.json'); fs.writeFileSync(jf, JSON.stringify(j));
      await loadFileThenSession(FIX, jf); s = await st();
      check('session reload restores axis + residuals', s.axis.p.join() === ax.point.join() && s.axis.d.join() === ax.direction.join() && (await p.textContent('#resid')) === resid0);
      const cg2 = await readCG();
      check('session reload restores a current assembly CG', !!(cg2.c && cgJ && cg2.c.every((v, i) => v === cgJ.c[i]) && cg2.mass === cgJ.mass && /Assembly CG/.test(cg2.text || '') && !cg2.stale && !cg2.dropped && cg2.has), JSON.stringify(cg2));
      const j2 = JSON.parse(await dl('json'));
      check('re-export after current restore keeps stale false', !!(j2.assemblyCG && j2.assemblyCG.stale === false && j2.assemblyCG.mass === cgJ.mass), JSON.stringify(j2.assemblyCG && { stale: j2.assemblyCG.stale, mass: j2.assemblyCG.mass }));
      // H3: density edit, export, same-file restore stays stale with numbers, density and selection kept
      await p.fill(`#bodies input[data-rho="${iS}"]`, '2700');
      await p.dispatchEvent(`#bodies input[data-rho="${iS}"]`, 'input');
      check('density edit before export marks the CG stale', await p.evaluate(() => document.querySelector('#cgout').classList.contains('stale')));
      const jStale = JSON.parse(await dl('json')), csvStale = await dl('csv');
      const shaftRec = (jStale.bodies || []).find(b => b.name === 'shaft');
      check('export after density edit writes stale true', !!(jStale.assemblyCG && jStale.assemblyCG.stale === true && shaftRec && shaftRec.rho === 2700 && jStale.assemblyCG.mass === cgJ.mass), JSON.stringify(jStale.assemblyCG));
      check('CSV after density edit writes stale true', /assembly CG,stale,true/.test(csvStale));
      const jfS = path.join(tmp, 'rab-session-stale.json'); fs.writeFileSync(jfS, JSON.stringify(jStale));
      await loadFileThenSession(FIX, jfS);
      const cgS = await readCG();
      check('H3 same-file stale restore keeps numbers, stale flag, density, selection and marker', !!(cgS.stale && !cgS.dropped && cgS.c && jStale.assemblyCG.c.every((v, i) => v === cgS.c[i]) && cgS.mass === jStale.assemblyCG.mass && cgS.rho.shaft === 2700 && cgS.has && /stale/.test(cgS.text || '') && cgS.sels.includes(iS) && cgS.sels.includes(iR)), JSON.stringify(cgS));
      const jS2 = JSON.parse(await dl('json'));
      check('re-export after stale restore keeps stale true', !!(jS2.assemblyCG && jS2.assemblyCG.stale === true), JSON.stringify(jS2.assemblyCG && { stale: jS2.assemblyCG.stale }));
      // legacy session (no stale flag) on the same file: numbers kept, treated as stale
      const jLeg = JSON.parse(JSON.stringify(j)); delete jLeg.assemblyCG.stale;
      const jfL = path.join(tmp, 'rab-session-legacy.json'); fs.writeFileSync(jfL, JSON.stringify(jLeg));
      await loadFileThenSession(FIX, jfL);
      const cgL = await readCG();
      check('legacy session with no stale flag restores as stale', !!(cgL.stale && !cgL.dropped && cgL.c && cgJ.c.every((v, i) => v === cgL.c[i]) && /did not record|stale/.test(cgL.text + ' ' + cgL.notice) && cgL.has), JSON.stringify(cgL));
      // other file: tilted-rotor current session onto cg-assembly.stp
      const FIX2 = path.join(__dirname, '../test/fixtures/cg-assembly.stp');
      await loadFileThenSession(FIX2, jf);
      const cgO = await readCG();
      check('other-file restore drops the CG (stale, no numbers, no marker, notice)', !!(cgO.dropped && cgO.stale && !cgO.c && !cgO.has && /not restored/.test(cgO.text || '')), JSON.stringify(cgO));
    } catch (e) { check('run', false, e.message); }
    check('no page errors', !errs.length, errs.join(' | '));
    console.log(`${name}:\n  ` + res.join('\n  '));
    await Promise.race([b.close(), new Promise(r => setTimeout(r, 5000))]);
  }
  console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
