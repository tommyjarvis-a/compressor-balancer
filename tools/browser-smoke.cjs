// Browser regression: import STEP files and check the page stays responsive (rAF heartbeat, no frame gap
// above MAX_GAP ms while importing) and finishes within TIME_LIMIT s. Needs Playwright (not a dependency):
//   npm i --no-save playwright && npx playwright install chromium webkit
//   python3 -m http.server 8765 &   node tools/browser-smoke.cjs [url] [file.stp ...]
// Env: BROWSERS=chromium,webkit (or msedge: installed Microsoft Edge)  HEADED=1  MAX_GAP=1500  TIME_LIMIT=60  PLAYWRIGHT=/path/to/playwright
const pw = require(process.env.PLAYWRIGHT || 'playwright'), path = require('path'), fs = require('fs');
const [url = 'http://localhost:8765/', ...files0] = process.argv.slice(2);
const dir = path.join(__dirname, '../test/fixtures'), files = files0.length ? files0 : fs.readdirSync(dir).filter(f => f.endsWith('.stp')).map(f => path.join(dir, f));
const MAX_GAP = +(process.env.MAX_GAP || 1500), LIMIT = +(process.env.TIME_LIMIT || 60) * 1000;
(async () => {
  let fail = 0;
  for (const name of (process.env.BROWSERS || 'chromium,webkit').split(',')) {
    const b = await (name === 'msedge' ? pw.chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }) : pw[name].launch({ headless: !process.env.HEADED }));
    for (const f of files) {
      const p = await b.newPage(), errs = [];
      p.on('pageerror', e => errs.push(e.message)); p.on('crash', () => errs.push('page crashed'));
      await p.addInitScript(() => { window.__hb = { gap: 0, last: 0, on: false }; const t = n => { if (__hb.on && __hb.last) __hb.gap = Math.max(__hb.gap, n - __hb.last); __hb.last = n; requestAnimationFrame(t); }; requestAnimationFrame(t); });
      await p.goto(url); await p.waitForTimeout(800);
      await p.evaluate(() => { __hb.on = true; __hb.gap = 0; __hb.last = 0; });
      const t0 = Date.now(); await p.setInputFiles('#file', f);
      let ok = true;
      try { await p.waitForFunction(() => / bodies ·|import failed|cancelled/.test(document.querySelector('#status').textContent), null, { timeout: LIMIT, polling: 200 }); } catch { ok = false; }
      const r = await Promise.race([p.evaluate(() => ({ gap: Math.round(__hb.gap), status: document.querySelector('#status').textContent, err: [...document.querySelectorAll('.card.err')].map(e => e.textContent) })),
        new Promise((_, no) => setTimeout(() => no(new Error('no response in 10 s')), 10000))]).catch(e => ({ gap: -1, status: 'page unresponsive: ' + e.message, err: [] }));
      const pass = ok && r.gap >= 0 && r.gap <= MAX_GAP && !r.err.length && !errs.length && / bodies ·/.test(r.status);
      if (!pass) fail++;
      console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${path.basename(f)} ${Date.now() - t0} ms, max frame gap ${r.gap} ms — ${r.status}${r.err.length ? ' ERR ' + r.err.join(' ') : ''}${errs.length ? ' PAGEERR ' + errs.join(' ') : ''}`);
      await Promise.race([p.close(), new Promise(r => setTimeout(r, 5000))]);
    }
    await Promise.race([b.close(), new Promise(r => setTimeout(r, 5000))]);
  }
  process.exit(fail ? 1 : 0);
})();
