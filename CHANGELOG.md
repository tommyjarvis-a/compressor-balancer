# Changelog

## 0.1.0-alpha — 2026-11-13

- STEP (AP214/AP242) drag-and-drop import via occt-import-js 0.0.23 (WASM, lazy-loaded); three.js 0.187.0 viewer.
- Exact mesh mass properties (signed tetrahedra) with two-pass Richardson extrapolation and per-body uncertainty;
  open-mesh warning; density read from STEP when present, per-body override, material presets.
- Spin axis X/Y/Z or a body's principal axis; static imbalance U (g·mm), couple C (g·mm², ∫xz/∫yz dm), e (µm),
  equivalent two-plane residuals; CoM / axis / imbalance arrows in 3D.
- Parametric tools: annular sector, cylinder/tube, extruded polygon; add or remove material; closed-form mass properties.
- Nelder–Mead optimiser with box bounds (sin transform), deterministic multi-start, mass penalty.
- Export: session JSON, CSV, AP214 STEP of tools (validated by occt-import-js re-import and OpenCascade BRepCheck/BRepGProp).
