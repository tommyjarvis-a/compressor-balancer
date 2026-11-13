// Module worker: OpenCascade (occt-import-js WASM) import, tessellation and mass properties off the main
// thread. One worker per file: terminating it frees the whole WASM heap. The compiled WebAssembly.Module
// is passed in so the 7.6 MB binary is compiled only once per page.
import { importStep } from './import-core.js';
const OCCT = new URL('../vendor/occt-import-js/occt-import-js.js', import.meta.url);
self.onmessage = async ({ data: { buf, name, mode, defRho, wasm } }) => {
  const post = (type, x = {}) => self.postMessage({ type, ...x });
  try {
    post('progress', { stage: 'Loading OpenCascade' });
    const src = await (await fetch(OCCT)).text();
    const factory = (0, eval)(src + '\n;occtimportjs'); // classic UMD script; importScripts is unavailable in module workers
    const occt = await factory({
      locateFile: f => new URL('../vendor/occt-import-js/' + f, import.meta.url).href,
      ...(wasm && { instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasm, imports).then(i => ok(i)); return {}; } }),
    });
    const r = importStep(occt, new Uint8Array(buf), { mode, defRho, name, progress: stage => post('progress', { stage }) });
    // typed arrays (transferable) instead of the plain JS arrays occt-import-js returns
    const transfer = [];
    for (const b of r.bodies) {
      b.pos = Float32Array.from(b.pos); b.idx = Uint32Array.from(b.idx); b.nrm = b.nrm && Float32Array.from(b.nrm); b.faces = Int32Array.from(b.faces);
      transfer.push(b.pos.buffer, b.idx.buffer, b.faces.buffer); if (b.nrm) transfer.push(b.nrm.buffer);
    }
    self.postMessage({ type: 'done', bodies: r.bodies, warn: r.warn, info: r.info, stats: r.stats }, transfer);
  } catch (e) { post('error', { message: e?.message || String(e) }); }
};
