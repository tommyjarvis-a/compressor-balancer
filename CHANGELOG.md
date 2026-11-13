# Changelog

## 0.1.2-alpha — 2026-11-13

- **Renamed** to **Rotating Assembly Balancer** (repo `rotating-assembly-balancer`; the old
  `compressor-balancer` Pages URL no longer serves the app). Description is generic, e-compressors are one example.
- **Fix (High): importing a STEP file froze the page and the tab crashed** on real-world parts (Edge/Chrome, also
  reproduced in WebKit). Root cause: accurate mode meshed every file twice, synchronously on the main thread, with
  fixed fine tessellation settings (bbox ratio 1e-4 / 2.5e-5, 0.02 / 0.01 rad). Filleted parts produced 1.5M–12M
  triangles and needed 100–600+ s and up to 2.6 GB (a 135 KB, 40-face shaft: 1.49M triangles / 106 s for pass 1).
  The 0.1.x fixtures have ≤ 20 simple faces, so tests and headless smoke runs never hit it.
  - Import, tessellation, density and mass properties now run in a module Web Worker (one per file, terminated
    afterwards to free the WASM heap; WASM compiled once). Progress, Cancel, 180 s timeout with an error card.
  - Tessellation budget: deflection relative to the bbox diagonal (clamped), triangle prediction from a probe pass,
    1.2M total / 600k per body; coarsens or falls back to fast mode with a warning card.
  - Faster closed-mesh check (numeric edge keys).
- Tests: clamp/budget/prediction, fast fallback, import-pipeline accuracy (21 Node tests + optional OCP);
  `tools/browser-smoke.cjs` Playwright responsiveness check for Chromium and WebKit.

## 0.1.1-alpha — 2026-11-13

Fixes from the 0.1.0-alpha release gate (QA GATE-69afba1).

- **M1:** a STEP density now applies only to the body whose product it belongs to. Previously, when a file
  carried density for some products only, every other body took that density (tagged *STEP*), giving wrong mass
  and residuals (QA repro: shaft 32.57 g instead of 94.70 g). A file-wide density is used only if no record
  matches any body and the file has a single value (tag *STEP (file)*); otherwise the default applies.
- **L1:** for spin axis X, Y or a principal axis, residuals are labelled u/v (frame components) with the world
  basis shown; JSON/CSV exports carry the component names and basis. Axis +Z keeps x/y.
- **L2:** editing a body's density updates its source tag to *user* immediately.
- **L3:** removal tools are flagged (`removal` in JSON/CSV) and `REMOVE_*` solids re-imported from STEP count as
  negative mass.
- Tests: QA partial-density repro, mixed-density fixture, frame labels, removal STEP round trip (17 + 1 optional).

## 0.1.0-alpha — 2026-11-13

- STEP (AP214/AP242) drag-and-drop import via occt-import-js 0.0.23 (WASM, lazy-loaded); three.js 0.187.0 viewer.
- Exact mesh mass properties (signed tetrahedra) with two-pass Richardson extrapolation and per-body uncertainty;
  open-mesh warning; density read from STEP when present, per-body override, material presets.
- Spin axis X/Y/Z or a body's principal axis; static imbalance U (g·mm), couple C (g·mm², ∫xz/∫yz dm), e (µm),
  equivalent two-plane residuals; CoM / axis / imbalance arrows in 3D.
- Parametric tools: annular sector, cylinder/tube, extruded polygon; add or remove material; closed-form mass properties.
- Nelder–Mead optimiser with box bounds (sin transform), deterministic multi-start, mass penalty.
- Export: session JSON, CSV, AP214 STEP of tools (validated by occt-import-js re-import and OpenCascade BRepCheck/BRepGProp).
