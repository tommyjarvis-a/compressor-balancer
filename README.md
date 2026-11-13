# Rotating Assembly Balancer

Client-side (no backend) web app for mass properties and **two-plane balancing** of rotating assemblies —
rotors, shafts, crank/eccentric parts, counterweights, swing links. Electric automotive AC-compressor rotating
assemblies (rotor, shaft, scroll/swash parts) are one example.
Drop STEP solids in, pick the spin axis, add parametric counterweights, let the optimiser drive the residual
static and couple imbalance to ~0, and export the suggested geometry as STEP or a parameter list.

Plain ES modules, no framework, no build step. Files never leave the browser.

## Usage

1. Open the page (GitHub Pages, or any static server: `python3 -m http.server` in the repo root — opening
   `index.html` via `file://` does not work because browsers block module/WASM loads there).
2. **Import**: drop one or more `.stp/.step` files (or click *browse*). Each solid body becomes a row.
   - Density is taken from the STEP file when a density record belongs to that body's product (tag *STEP*). A
     file-wide value is used only if no record matches any body and the file has a single density (tag
     *STEP (file)*). Otherwise the *Default* preset
     (steel 7850, aluminium 2700, cast iron 7200, copper 8900 kg/m³). Edit any body's ρ directly (tag *user*).
   - *Mass props*: **accurate (2-pass)** (default) tessellates twice and extrapolates (see accuracy below) and
     shows a per-body CoM uncertainty estimate; **fast** is a single pass.
   - Import runs in a Web Worker (the page stays responsive) with a progress line, **Cancel**, and a 180 s timeout.
     Tessellation is budgeted: deflection is relative to the bounding-box diagonal (clamped 1e-4…1 mm), a cheap
     probe pass predicts the triangle count, and the mesh is coarsened to stay within 1.2M triangles in total and
     600k per body. If the refined accurate pass would not fit, the import falls back to fast mode. Either case is a
     yellow warning card only if the estimated error matters — relative volume error > 1e-4 or CoM uncertainty
     > 1 µm for any body (1 µm of CoM is 1 g·mm of static imbalance per kg; G2.5 at 10 000 rpm allows e ≈ 2.4 µm);
     otherwise a quiet grey info card with the estimate.
   - ⚠ next to a body means its mesh does not close: the signed volume depends on the origin by more than 1e-4
     (relative, for a half-diagonal shift: `|ΣA|·(D/2)/(3|V|)`, ΣA = vector area of the mesh) or more than 5 % of its
     edges are open/non-manifold (sheet body / bad export) — mass properties unreliable. A few bad edges that do
     not change the volume (T-junctions, duplicated seam nodes, slivers) only get a quiet ⓘ.
   - Click a row (or the body in the 3-D view) to select and highlight it; **Ctrl/⌘-click** adds or removes a body,
     **Shift-click** selects a range; Esc or a click on empty space deselects. Orbit drags are not clicks
     (> 5 px pointer travel).
   - Untick a body to exclude it from residuals and the 3-D view (e.g. housings that do not rotate).
   - **Calculate CG** computes the mass-weighted combined centre of gravity of the *selected* bodies (not the
     visibility ticks), using each body's density and mass. `REMOVE_*` solids count as negative mass, the same
     way as the residual mass properties. The readout is X, Y, Z in mm from the WCS origin (0, 0, 0), plus total
     mass (g) and the number of bodies. A gold sphere and crosshair with a constant-size "CG" label (drawn through
     geometry, stays the same size when you zoom or orbit) marks the point; it is distinct from the red residual
     CoM ball of the enabled bodies + tools. The numbers still appear if the 3-D view is unavailable.
     An inline message is shown if nothing is selected or the net mass is zero or negative. The result is **not**
     recalculated automatically: if the selection, a density, or the body set changes, the readout and marker are
     marked *stale* until you click *Calculate CG* again. The result is included in the JSON and CSV exports and
     in a saved session.
3. **Spin axis** = a **point + direction** (world mm). Set it by
   - a preset: world X/Y/Z through the point (default Z through 0,0,0), or a body's principal axis (the
     eigenvector whose principal moment is most distinct, i.e. the symmetry axis of a shaft/rotor, through its CoM);
   - typing point and direction (normalised internally; the boxes keep the values as typed; a zero or non-numeric vector is rejected and the last valid axis is kept);
   - picking in the 3-D view: **cylinder** (click a cylindrical face: its facet normals' null space gives the axis,
     a circle fit the radius and position; the axis point is the foot of the clicked point), **circle edge** (click a
     face next to a circular edge — hole, boss, planar circular face, end of a torus fillet: the face's boundary loop
     nearest the click is fitted with a plane + circle; centre = axis point), or **2 points**. Poor fits are rejected
     with a message (RMS > 1 % of r, non-planar loop, loop with a gap > 60°, flat/conical/freeform faces).
   The axis is drawn as a black line with an arrow head (+w) and a dot at the axis point. Static/couple residuals,
   the two-plane readout and the optimiser all use it; axial positions (plane A/B, new tools) are measured along w
   from the axis point. New tools are placed on the axis (local z = w). For world Z the residuals are labelled x/y
   (world X/Y). Otherwise they are labelled **u/v**: components along u, v (⊥ w, u × v = w), derived
   deterministically from the direction, shown under the table and written with the point and direction to the
   JSON/CSV exports and the session (e.g. axis X: u = −Z, v = +Y). Picked and principal directions use a fixed sign
   (largest component positive). The triad in the lower-left corner shows the world X/Y/Z axes.
   - **Static U = m·e** (g·mm): first mass moment perpendicular to the axis. Goal ≈ (0, 0).
   - **Couple C** (g·mm²): products of inertia ∫x·z dm, ∫y·z dm (i.e. −I<sub>xz</sub>, −I<sub>yz</sub>) about the axial
     plane through the CoM. Goal ≈ (0, 0). With U = 0 the axis is a principal axis (dynamically balanced).
   - e = |U|/m (µm) for comparison with ISO 21940-11 (ex-1940) grades, and the equivalent two-plane residuals at
     the axial ends of the parts (plane A / B, g·mm).
   - 3D view: red ball = residual CoM of the enabled bodies + tools, black line = spin axis, red arrow = static
     imbalance direction, blue arrows = couple (as an opposed pair at two planes). Arrow length is log-scaled;
     arrows disappear when the residual is ~0. A small RGB (X/Y/Z) triad with an "Origin 0,0,0" label sits at the
     model-space origin, constant size on screen and drawn through geometry; it is separate from the lower-left
     WCS inset triad and from the gold assembly-CG marker. A dashed line runs from the origin to the assembly CG
     while one is shown.
4. **Correction tools**: *Sector* (annular sector: ri, ro, start angle a0, sweep), *Cylinder* (r, optional bore ri),
   *Profile* (extruded polygon, local `x,y; x,y; …` in mm, with a scale). All are extruded along their local +Z by h,
   rotated by rx→ry→rz (R = Rz·Ry·Rx, degrees) and placed at x, y, z. Each tool has its own ρ, a role
   (counterweight / swinglink, colour only) and add / **remove** (material removal, e.g. drilling — negative mass).
   Tool mass properties are **closed-form exact** (Green's theorem on the profile × extrusion).
5. **Optimise**: tick ☐ next to any tool value to free it and set its bounds (new tools come with sensible
   defaults, e.g. sector a0/sweep/h). *Run optimiser* minimises
   `J = |U|² + (w·|C|/L)² + λ·(Δm)²` (L defaults to the axial span, converting g·mm² to g·mm; λ trades residual for
   added mass). Results: suggested values, residuals before → after, added tool mass. *Undo* restores the tools.
   For full static + couple balance use at least two tools in two axial planes (4 free values: e.g. a0 and h of each).
6. **Export**: *Parameters JSON* (session: axis, bodies + densities, tools, residuals, assembly CG, last optimisation; drop it
   back in to reload the tools and the last CG), *CSV* (tool, param, value + residuals + assembly CG), *Counterweights STEP* (AP214, one solid
   per tool, mm). Removal tools are written as solids named `REMOVE_<name>` with the removed material's
   density, and carry `"removal": true` (JSON) / a `removal` column (CSV).
   - **Re-importing a `REMOVE_` solid** (e.g. the counterweights STEP dropped back in with the parts) counts it as
     **material removal: negative mass** (tag *removal (−m)*, status message says so), so parts + exported tools
     reproduce the tool-side residuals. Untick the row to ignore it.

## NX export notes

- Export **solid bodies** (not sheets/facets) as STEP **AP214** or **AP242** (File ▸ Export ▸ STEP). Sheet bodies or
  open shells give ⚠ and wrong mass.
- Units: any STEP length unit is converted to mm by OpenCascade on import (verified with a metre-unit fixture).
- Density: assign NX materials; whether density is written depends on the STEP export settings/AP (AP242 with
  validation/material properties). This app reads `PROPERTY_DEFINITION`/`MEASURE_REPRESENTATION_ITEM` entries named
  *density* (unit from `DERIVED_UNIT` mass·length⁻³, else guessed from magnitude) and links them to bodies by product
  name. If nothing is found, set ρ per body in the table. Always sanity-check total mass against NX *Measure Bodies*.
- Export the rotating assembly in its assembled position; one STEP with all parts is easiest. Keep real parts out
  of this repository (`private/` is git-ignored).

## Mass-property method and accuracy

occt-import-js gives a triangulated mesh per solid (not exact B-rep integrals). Volume, first and second moments are
computed **exactly for that closed mesh** with the signed-tetrahedron (divergence-theorem) method, about the bbox
centre for numerical precision. Remaining error is purely tessellation (chord) error on curved faces, which scales
~θ² with the angular deflection θ. *Accurate* mode meshes at θ = 0.02 and 0.01 rad (linear deflection 5.8e-5 and
1.45e-5 × bbox diagonal) and Richardson-extrapolates `M ≈ (4·M(θ/2) − M(θ))/3`; *fast* uses θ = 0.05. Planar faces
are exact in both modes. These are the settings whenever they fit the triangle budget (all fixtures do; the table
below is unchanged). Larger or heavily filleted parts are coarsened to fit the budget, with a warning: e.g. a
135 KB filleted shaft (40 faces) is meshed at ×20 coarser settings to 349k triangles in ~8 s — the 0.1.1 fixed
settings needed 1.49M triangles and 106 s for the first pass alone and froze the browser.

Measured against closed-form values (`npm run accuracy`, `npm test`):

| Part | Mode | rel. volume error | CoM error | rel. inertia error |
|---|---|---|---|---|
| box (planar) | any | 1e-16 | 0 | 0 |
| cylinder r15×30 | fast (θ 0.05) | 1.0e-4 | 0 (symmetric) | 1.7e-4 |
| cylinder | single θ 0.01 | 4.2e-6 | 0 | 6.7e-6 |
| cylinder | accurate (extrapolated) | 1.8e-8 | 0 | 2.8e-8 |
| offset, tilted Al sector | fast (θ 0.05) | 4.1e-5 | 0.81 µm | 1.1e-4 |
| offset sector | single θ 0.01 | 4.2e-6 | 0.049 µm | 8.3e-6 |
| offset sector | accurate (extrapolated) | 2.1e-11 | 7e-7 µm | 2.1e-10 |

The analytic tool formulas and the exported STEP were cross-checked against OpenCascade's exact `BRepGProp`
(cadquery-ocp, optional test `CB_OCP_PY=/path/to/python npm test`): agreement to ~1e-15 relative, all solids pass
`BRepCheck`. A custom OpenCascade.js build with `BRepGProp` was therefore **not** needed: it would add a second
multi-MB WASM for accuracy that extrapolation already provides for these geometry types. Caveat: extrapolation assumes
the two tessellations refine consistently (true for OCCT's per-edge angular subdivision); exotic surfaces
(B-splines, tori) are less regular — the UI shows the fine-vs-extrapolated difference as a CoM uncertainty (µm).

## Tests

`npm test` (Node ≥ 20, no dependencies): exact mesh moments, analytic region integrals vs an 8000-gon, transforms
and principal axes, static/couple/two-plane math on point-like masses, optimiser convergence on a synthetic
unbalanced rotor (fixture `rotor-unbalanced.stp`: |U| 85 g·mm, |C| 4557 g·mm² → ~1e-12, deterministic, ~30 ms),
bound handling when balance is infeasible, STEP export → occt-import-js round trip (volume/CoM/inertia, mm & metre
units, closed meshes), density read-back, tessellation convergence and extrapolation, tessellation clamps,
triangle-budget prediction and fast fallback, import-pipeline accuracy. Fixtures are generated by
`npm run fixtures` (synthetic only).

Also: mesh closure check (T-junction / sliver / missing face), error-gated coarsening notes, residuals about a tilted
axis vs the geometry rotated onto Z, cylinder and edge-loop fits on a tilted fixture (plus rejection cases),
optimiser about a tilted axis, M2 field-by-field direction entry (boxes not rewritten, |U| ≈ 108), assembly CG of a
multi-body fixture including a `REMOVE_*` solid and a subset selection (vs closed form and optional OpenCascade
`BRepGProp`). Synthetic fixture `cg-assembly.stp`.

Browser responsiveness: `tools/browser-smoke.cjs` imports the fixtures (or given files) in Chromium and WebKit via
Playwright and fails if any animation frame gap exceeds 1.5 s or the import takes longer than 60 s.
UI: `HEADED=1 node tools/ui-smoke.cjs [url]` checks the triad (pixels, follows orbit, resize), the model-space
origin marker, selection (view ⇄ list, drag ≠ click, Esc, empty space, Ctrl-click multi-select), Calculate CG
(no-selection message, marker, stale on selection/density change, dashed line from the origin), typed axis
(fields kept as typed, M2 field-by-field unit vector, zero / non-numeric rejection, unit readout), picking
(cylinder, circle edge, 2 points), the optimiser about a tilted axis and JSON/CSV export + session reload
(including assembly CG), on `test/fixtures/tilted-rotor.stp`.
Both accept `BROWSERS=chromium,webkit,msedge` (msedge = installed Microsoft Edge).

## Size, dependencies, token/code efficiency

| Asset | Raw | gzip | When loaded |
|---|---|---|---|
| App code (`src/*.js`, html, css; ~1260 lines) | 96 KB | 35 KB | page load (worker modules on first STEP drop) |
| three.js 0.187.0 tree-shaken (`vendor/three/three.lite.min.js`) | 607 KB | 152 KB | page load |
| occt-import-js 0.0.23 JS | 97 KB | 27 KB | first STEP drop |
| occt-import-js 0.0.23 WASM | 7.60 MB | 3.10 MB | first STEP drop |

- Two dependencies, vendored and pinned; nothing fetched from CDNs; no bundler for the app (three.js is pre-shaken
  once with `tools/vendor-three.mjs`).
- All mass properties are kept as additive raw moments (m, ∫r dm, ∫rrᵀ dm), so assemblies, tools, removal and
  axis changes are sums and one frame transform — the optimiser evaluates thousands of candidates per second
  without remeshing. Tool meshes are only for display.
- One small module per concern (`mass`, `imbalance`, `tools`, `nm`, `optimize`, `step-export`, `step-meta`, `fit`, `view`,
  `app`) to keep future edits and reviews cheap.

## Limitations (0.1.5-alpha)

- Very large assemblies are meshed coarser to fit the triangle budget (warning shown); a single OCCT call cannot be
  interrupted except by Cancel/timeout, which discards that file.
- Axis picking works on the tessellated mesh: cylinder and circle fits are exact for the mesh nodes (which lie on
  the true surface), so accuracy is ~1e-6 mm on clean faces, but coarse meshes give few points on small radii and
  the fit may be rejected. Only cylindrical faces (not cones, tori, freeform) give an axis by *cylinder*; a half
  cylinder exported as two faces works (each face is fitted), but a face whose boundary mixes arcs and lines is not a
  circle for *circle edge*. Two-point picks are only as exact as the clicked surface points.
- Without WebGL (hardware acceleration off and no software fallback) the 3-D view is unavailable; everything else
  still works.
- Density detection is heuristic (exporter-specific); parts without density use the default.
- Optimiser is local (Nelder–Mead with deterministic multi-start), not a global guarantee; check bounds.
- Exported STEP covers the three parametric tool types (planar + cylindrical faces), not fillets/chamfers.
- No interference check between tools and parts; bodies are treated as rigid at nominal geometry.
- The "remove" tool assumes the removed volume is fully inside material of its density.

## License

App code: MIT (`LICENSE`). Third-party: see `THIRD_PARTY.md` (occt-import-js/OCCT LGPL-2.1, three.js MIT).
