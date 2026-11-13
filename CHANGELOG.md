# Changelog

## 0.1.7-alpha — 2026-11-13

- **Fix (High, H2):** finishing a file load no longer clears a stale assembly-CG flag. `touchCG()` can only *set*
  stale (via `holdStale`); only a successful *Calculate CG* clears it. A session restore keeps the saved CG
  numbers only on an exact full match of every saved body (and the same body count). Anything else drops the
  values and the marker, leaves the result stale, keeps any partial selection, and shows a notice — so a CG
  saved from a different file cannot appear as current.
- **Fix (Medium, M6):** session matching treats `REMOVE_*` status (the mass sign) as a hard key, so a body is
  never paired with its removal counterpart even when the volume and bbox are identical. The base name (without
  a ` #n` suffix) is also a hard key when it is unique on both sides; the volume + bbox fingerprint only decides
  among same-name, same-sign candidates. A changed body count leaves unmatched bodies untouched and the CG
  dropped/stale, with a notice.
- Tests: mismatched restore + load completion stays stale; a cross-file session drops the CG; a `REMOVE_` twin
  is not matched; add/remove a body leaves the CG stale; a unique base name blocks a fingerprint match to a
  different name (45 Node tests incl. the optional OCP check).


## 0.1.6-alpha — 2026-11-13

- **Fix (Medium, M3):** the gold assembly-CG marker, the RGB origin arrows and the dashed origin-to-CG line
  were hidden by the (transparent) body meshes; only the DOM labels showed through. They now render in an
  overlay pass after a depth clear (`depthTest`/`depthWrite` off, `transparent`, high `renderOrder`), so they
  stay a constant size on screen and draw on top of the parts.
- **Fix (Medium, M4):** session restore no longer matches bodies by name alone. Densities, on/off flags and the
  saved assembly-CG selection are keyed by body index plus a volume + bbox fingerprint (relative tolerance
  1e-3); the name is only a hint when fingerprints collide. If a body is ambiguous or does not match, it is
  left untouched, the CG is marked stale, and a notice is shown. 0.1.x sessions with unique names still load.
- **L7:** duplicate display names (e.g. a single-product NX file whose solids all inherit the file name) are
  numbered `name #1`…`#n`. Unique names are unchanged. The same names are used in the list, exports and session.
- Tests: unique-name suffixes; fingerprint match with duplicate names, a reordered set, a mismatch, identical
  twins and a legacy name-only session (40 Node tests incl. the optional OCP check); `tools/ui-smoke.cjs`
  checks the overlay material flags and that gold / RGB marker pixels are visible.


## 0.1.5-alpha — 2026-11-13

- **Assembly CG**: *Calculate CG* next to the body list computes the mass-weighted combined centre of gravity of
  the bodies currently selected on the left (each body's density and mass; `REMOVE_*` bodies count as negative
  mass). Multi-select: Ctrl/⌘-click to add or remove a body, Shift-click a range (click still selects one;
  Esc / empty space clears). The readout shows X, Y, Z in mm from the WCS origin (0, 0, 0), the total mass (g)
  and how many bodies were included. A gold sphere + crosshair with a constant-size "CG" label (drawn through
  geometry) marks the point in the 3-D view, distinct from the red residual CoM ball. The readout still works
  when WebGL is unavailable.
  - No bodies selected, or net mass zero/negative: an inline message, no marker.
  - **Stale handling:** the result and marker stay visible after a calculation. If the selection, a density, or
    the body set then changes, both are marked stale until *Calculate CG* is clicked again (they are not
    recalculated automatically).
  - The result is written to the JSON (`assemblyCG`) and CSV exports and restored from a session (selection is
    recovered by body name; the result is marked stale if the current bodies do not match).
- **Model-space origin** at (0, 0, 0): small X/Y/Z axes in red/green/blue with a constant-size "Origin 0,0,0"
  label, drawn through geometry. Separate from the lower-left WCS triad and from the gold assembly-CG marker.
  A dashed line is drawn from the origin to the CG while a CG result is shown.
- Tests: combined CoM vs closed form and OpenCascade `BRepGProp` on fixture `cg-assembly.stp` (includes a
  `REMOVE_*` body and a subset selection) (33 Node tests incl. the optional OCP check); `tools/ui-smoke.cjs`
  covers Calculate CG, the marker, the no-selection message, stale handling, the origin marker, and JSON/CSV/session.


## 0.1.4-alpha — 2026-11-13

- **Fix (Medium, M2):** typing the spin-axis direction one field at a time no longer changes the axis.
  Previously every change on the direction boxes normalised the (still incomplete) vector and wrote all three
  fields back, so a unit vector entered as 0.40558, −0.40558, 0.81915 became (0.36047, −0.38899, 0.84779),
  4.3° off, and residuals were wrong (|U| 274.6 instead of 108 on the QA tilted two-body case). The boxes now
  keep the values as typed; the direction is normalised only internally (on change, blur or Enter, and before
  computing). A zero or non-numeric entry shows an inline error and keeps the last valid axis. Presets, picks
  and session restore still fill the boxes. A read-only unit-vector readout is shown next to the fields.
  JSON/CSV axis output and session reload are unchanged.
- Tests: field-by-field QA repro (raw values kept, |U| ≈ 108 vs the previous 274.6) (29 Node tests incl. the
  optional OCP check); `tools/ui-smoke.cjs` covers the same path, the unit readout, and a non-numeric rejection.

## 0.1.3-alpha — 2026-11-13

- **User-defined spin axis**: point + direction, typed (normalised, zero rejected) or picked in the 3-D view from a
  cylindrical face (least-squares cylinder: normals' null space + circle fit), a circular edge loop (plane + circle
  fit) or two points; poor fits are rejected with a message. Presets (X/Y/Z, principal axis) set the same axis
  object. Residuals, two-plane readout and optimiser use it; u/v/w is derived deterministically; axial positions are
  measured along w from the axis point; new tools are placed on the axis. Drawn as line + arrow through the point.
  Point, direction, source and u/v/w are in the JSON/CSV export and the session (0.1.x sessions still load).
  Principal-axis directions now use the fixed sign rule (largest component positive), so u/v may flip vs 0.1.2.
- **WCS triad** (X/Y/Z red/green/blue, labelled) in a lower-left inset that follows the camera; crisp on HiDPI and
  after resize / zoom.
- **Body selection** synced between the list and the 3-D view (raycast), highlight, scroll-into-view, Esc / empty
  click deselects; orbit drags (> 5 px) are not clicks.
- **L5**: "mesh coarsened" / fast-fallback is a warning only if the estimated error matters (relative volume
  > 1e-4 or CoM > 1 µm for any body), otherwise a quiet info card. Fast mode gets a rough probe-based uncertainty.
- **L6**: ⚠ "unreliable" only when the mesh does not close — volume closure `|ΣA|·(D/2)/(3|V|)` > 1e-4 — or > 5 % of
  edges are open/non-manifold; isolated bad edges get a quiet ⓘ.
- Without WebGL the app keeps working (error card; no 3-D view) instead of failing to start.
- Tests: tilted-axis invariance, cylinder/loop fits and rejections, optimiser about a tilted axis, closure check,
  error-gated notes (28 Node tests incl. the optional OCP check); `tools/ui-smoke.cjs` headed UI smoke; both browser scripts
  can run installed Microsoft Edge (`BROWSERS=msedge`). Synthetic fixture `tilted-rotor.stp`.

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
