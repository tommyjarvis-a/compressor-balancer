import { Scene, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Group, Mesh, MeshStandardMaterial, BufferGeometry, BufferAttribute, SphereGeometry,
  MeshBasicMaterial, Vector3, Box3, Color, AxesHelper, OrbitControls } from '../vendor/three/three.lite.min.js';
// Thin Three.js layer: bodies and CoM marker.
export function createView(el) {
  const scene = new Scene(); scene.background = new Color(0xeef0f3);
  const cam = new PerspectiveCamera(40, 1, 0.1, 1e6); cam.up.set(0, 0, 1); cam.position.set(200, -260, 180);
  const ren = new WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(ren.domElement);
  const ctl = new OrbitControls(cam, ren.domElement);
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 2.2)); const sun = new DirectionalLight(0xffffff, 1.6); sun.position.set(1, -1, 2); scene.add(sun);
  const bodies = new Group(), marks = new Group(); scene.add(bodies, marks, new AxesHelper(20));
  const resize = () => { const w = el.clientWidth, h = el.clientHeight; ren.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(el); resize();
  ren.setAnimationLoop(() => { ctl.update(); ren.render(scene, cam); });
  const clear = g => { for (const c of [...g.children]) { g.remove(c); c.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); } };
  let size = 100;
  return {
    setBodies(list) {
      clear(bodies);
      for (const b of list) {
        const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
        if (b.nrm) g.setAttribute('normal', new BufferAttribute(new Float32Array(b.nrm), 3)); else g.computeVertexNormals();
        g.setIndex(new BufferAttribute(new Uint32Array(b.idx), 1));
        const m = new Mesh(g, new MeshStandardMaterial({ color: b.color || 0x9aa4b2, metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.85 }));
        m.visible = b.on; bodies.add(m);
      }
    },
    fit() {
      const bb = new Box3().setFromObject(bodies); if (bb.isEmpty()) return;
      const c = bb.getCenter(new Vector3()); size = bb.getSize(new Vector3()).length() || 100;
      ctl.target.copy(c); cam.position.copy(c).add(new Vector3(0.8, -1, 0.7).multiplyScalar(size)); cam.near = size / 1000; cam.far = size * 100; cam.updateProjectionMatrix();
    },
    setMarks(com) {
      clear(marks); if (!com) return;
      const ball = new Mesh(new SphereGeometry(size * 0.012, 16, 12), new MeshBasicMaterial({ color: 0xd0343c, depthTest: false })); ball.position.set(...com); ball.renderOrder = 9; marks.add(ball);
    },
    showBody(i, on) { if (bodies.children[i]) bodies.children[i].visible = on; },
  };
}
