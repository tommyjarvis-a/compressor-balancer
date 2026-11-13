# Compressor Balancer

Client-side (no backend) web app for mass properties and **two-plane balancing** of electric automotive
AC-compressor rotating assemblies (rotor, shaft, scroll/swash parts, counterweights, swing links).
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
   - ⚠ next to a body means its mesh is not closed (sheet body / bad export) — its mass properties are unreliable.
   - Untick a body to exclude it (e.g. housings that do not rotate).
3. **Spin axis**: world X/Y/Z through the given origin (default Z through 0,0,0), or any body's principal
   axis (the eigenvector whose principal moment is most distinct, i.e. the symmetry axis of a shaft/rotor,
   through that body's CoM). Residuals are reported in that frame. For world Z they are labelled x/y (world X/Y).
   For X, Y or a principal axis they are labelled **u/v**: components along the frame vectors u, v (⊥ the spin axis w,
   u × v = w), whose world directions are shown under the table and written to the JSON/CSV exports
   (e.g. axis X: u = −Z, v = +Y).
   - **Static U = m·e** (g·mm): first mass moment perpendicular to the axis. Goal ≈ (0, 0).
   - **Couple C** (g·mm²): products of inertia ∫x·z dm, ∫y·z dm (i.e. −I<sub>xz</sub>, −I<sub>yz</sub>) about the axial
     plane through the CoM. Goal ≈ (0, 0). With U = 0 the axis is a principal axis (dynamically balanced).
   - e = |U|/m (µm) for comparison with ISO 21940-11 (ex-1940) grades, and the equivalent two-plane residuals at
     the axial ends of the parts (plane A / B, g·mm).
   - 3D view: red ball = CoM, black line = spin axis, red arrow = static imbalance direction, blue arrows = couple
     (as an opposed pair at two planes). Arrow length is log-scaled; arrows disappear when the residual is ~0.
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
6. **Export**: *Parameters JSON* (session: axis, bodies + densities, tools, residuals, last optimisation; drop it
   back in to reload the tools), *CSV* (tool, param, value + residuals), *Counterweights STEP* (AP214, one solid
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
~θ² with the angular deflection θ. *Accurate* mode meshes at θ = 0.02 and 0.01 rad and Richardson-extrapolates
`M ≈ (4·M(θ/2) − M(θ))/3`. Planar faces are exact in both modes.

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
units, closed meshes), density read-back, tessellation convergence and extrapolation. Fixtures are generated by
`npm run fixtures` (synthetic only).

## Size, dependencies, token/code efficiency

| Asset | Raw | gzip | When loaded |
|---|---|---|---|
| App code (`src/*.js`, html, css; ~690 lines) | 50 KB | 19 KB | page load |
| three.js 0.187.0 tree-shaken (`vendor/three/three.lite.min.js`) | 598 KB | 150 KB | page load |
| occt-import-js 0.0.23 JS | 97 KB | 27 KB | first STEP drop |
| occt-import-js 0.0.23 WASM | 7.60 MB | 3.10 MB | first STEP drop |

- Two dependencies, vendored and pinned; nothing fetched from CDNs; no bundler for the app (three.js is pre-shaken
  once with `tools/vendor-three.mjs`).
- All mass properties are kept as additive raw moments (m, ∫r dm, ∫rrᵀ dm), so assemblies, tools, removal and
  axis changes are sums and one frame transform — the optimiser evaluates thousands of candidates per second
  without remeshing. Tool meshes are only for display.
- One small module per concern (`mass`, `imbalance`, `tools`, `nm`, `optimize`, `step-export`, `step-meta`, `view`,
  `app`) to keep future edits and reviews cheap.

## Limitations (0.1.1-alpha)

- STEP import runs on the main thread (large assemblies freeze the UI while meshing); no worker yet.
- Density detection is heuristic (exporter-specific); parts without density use the default.
- Optimiser is local (Nelder–Mead with deterministic multi-start), not a global guarantee; check bounds.
- Exported STEP covers the three parametric tool types (planar + cylindrical faces), not fillets/chamfers.
- No interference check between tools and parts; bodies are treated as rigid at nominal geometry.
- The "remove" tool assumes the removed volume is fully inside material of its density.

## License

App code: MIT (`LICENSE`). Third-party: see `THIRD_PARTY.md` (occt-import-js/OCCT LGPL-2.1, three.js MIT).
