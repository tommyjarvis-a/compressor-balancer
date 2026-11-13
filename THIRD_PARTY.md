# Third-party components

All are vendored unmodified (except the tree-shaken three.js bundle, see below) with pinned versions so
the app works as static files (GitHub Pages) with no CDN or build step.

| Component | Version | Files | Size (raw / gzip) | License |
|---|---|---|---|---|
| [occt-import-js](https://github.com/kovacsv/occt-import-js) (Open CASCADE Technology compiled to WASM by emscripten) | 0.0.23 (npm) | `vendor/occt-import-js/occt-import-js.js`, `occt-import-js.wasm` | 96.9 KB / 26.7 KB JS; 7.60 MB / 3.10 MB WASM | LGPL-2.1 (`license.occt-import-js.txt`, `license.occt.txt`) |
| [three.js](https://github.com/mrdoob/three.js) + OrbitControls | 0.187.0 (npm) | `vendor/three/three.lite.min.js` | 598 KB / 150 KB | MIT (`vendor/three/LICENSE`) |

## occt-import-js / OpenCascade (LGPL-2.1)

- occt-import-js is LGPL-2.1; it embeds Open CASCADE Technology, which is LGPL-2.1 with the
  [Open CASCADE exception](https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt).
- The WASM binary and its JS loader are shipped **unmodified** from the npm package and loaded **dynamically at
  run time** (separate files, fetched only when the first STEP file is dropped). The application code does not
  link or copy OCCT code; it only calls the library's public `ReadStepFile` interface. Users can replace
  `vendor/occt-import-js/*` with their own build of the same interface (LGPL §6 relinking requirement).
- Corresponding source: https://github.com/kovacsv/occt-import-js (tag v0.0.23) and
  https://github.com/Open-Cascade-SAS/OCCT. The license texts are kept next to the binary.
- If you distribute a modified WASM build you must publish its source changes under LGPL-2.1.
- This is a summary for engineering use, not legal advice.

## three.js (MIT)

`three.lite.min.js` is three@0.187.0 tree-shaken and minified by esbuild 0.28.2 to the classes `src/view.js`
imports (see `tools/vendor-three.mjs`, which records the exact command). MIT notice retained.
