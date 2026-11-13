// One-off vendoring step (not needed to run the app): tree-shakes three@0.187.0 down to what
// src/view.js uses. Re-run after changing view.js imports:
//   npm i --no-save three@0.187.0 && npx esbuild@0.28.2 tools/vendor-three.mjs --bundle --minify --format=esm --outfile=vendor/three/three.lite.min.js
export { Scene, PerspectiveCamera, OrthographicCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Group, Mesh, MeshStandardMaterial, BufferGeometry, BufferAttribute, SphereGeometry,
  CylinderGeometry, ConeGeometry, MeshBasicMaterial, Line, LineBasicMaterial, ArrowHelper, Vector2, Vector3, Box3, Shape, Path, ExtrudeGeometry, Color, AxesHelper, Raycaster,
  Sprite, SpriteMaterial, CanvasTexture } from 'three';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
