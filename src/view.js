import { Scene, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Group, Mesh, MeshStandardMaterial, BufferGeometry, BufferAttribute, SphereGeometry,
  MeshBasicMaterial, Line, LineBasicMaterial, ArrowHelper, Vector3, Box3, Shape, Path, ExtrudeGeometry, Color, AxesHelper, OrbitControls } from '../vendor/three/three.lite.min.js';
import { loops } from './tools.js';
// Thin Three.js layer: bodies, correction tools, CoM marker, spin axis and imbalance arrows.
export function createView(el) {
  const scene = new Scene(); scene.background = new Color(0xeef0f3);
  const cam = new PerspectiveCamera(40, 1, 0.1, 1e6); cam.up.set(0, 0, 1); cam.position.set(200, -260, 180);
  const ren = new WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(ren.domElement);
  const ctl = new OrbitControls(cam, ren.domElement);
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 2.2)); const sun = new DirectionalLight(0xffffff, 1.6); sun.position.set(1, -1, 2); scene.add(sun);
  const bodies = new Group(), tools = new Group(), marks = new Group(); scene.add(bodies, tools, marks, new AxesHelper(20));
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
      const bb = new Box3().setFromObject(bodies.children.length ? bodies : tools); if (bb.isEmpty()) return;
      const c = bb.getCenter(new Vector3()); size = bb.getSize(new Vector3()).length() || 100;
      ctl.target.copy(c); cam.position.copy(c).add(new Vector3(0.8, -1, 0.7).multiplyScalar(size)); cam.near = size / 1000; cam.far = size * 100; cam.updateProjectionMatrix();
    },
    setTools(list) {
      clear(tools);
      for (const t of list) {
        const ls = loops(t), sh = new Shape(); trace(sh, ls[0]);
        for (const h of ls.slice(1)) { const p = new Path(); trace(p, h); sh.holes.push(p); }
        const m = new Mesh(new ExtrudeGeometry(sh, { depth: t.h, bevelEnabled: false, curveSegments: 64 }),
          new MeshStandardMaterial({ color: t.sign < 0 ? 0xd0343c : t.role === 'swinglink' ? 0x2b9a66 : 0xe8902a, transparent: t.sign < 0, opacity: t.sign < 0 ? 0.55 : 1 }));
        m.rotation.order = 'ZYX'; m.rotation.set(t.rx * Math.PI / 180, t.ry * Math.PI / 180, t.rz * Math.PI / 180); m.position.set(t.x, t.y, t.z); tools.add(m);
      }
    },
    // r: imbalance result, fr: axis frame, com: world CoM.
    setMarks(r, fr, com, span) {
      clear(marks); if (!r || !r.m) return;
      const s = size, Rt = v => new Vector3(fr.R[0] * v[0] + fr.R[3] * v[1] + fr.R[6] * v[2], fr.R[1] * v[0] + fr.R[4] * v[1] + fr.R[7] * v[2], fr.R[2] * v[0] + fr.R[5] * v[1] + fr.R[8] * v[2]);
      const at = z => Rt([0, 0, z]).add(new Vector3(...fr.o));
      const ball = new Mesh(new SphereGeometry(s * 0.012, 16, 12), new MeshBasicMaterial({ color: 0xd0343c, depthTest: false })); ball.position.set(...com); ball.renderOrder = 9; marks.add(ball);
      const [z0, z1] = span; marks.add(new Line(new BufferGeometry().setFromPoints([at(z0 - s * 0.15), at(z1 + s * 0.15)]), new LineBasicMaterial({ color: 0x1d2330 })));
      const arrow = (v, z, col, mag, ref) => { if (!(mag > ref)) return; const d = Rt([v[0], v[1], 0]).normalize(), a = new ArrowHelper(d, at(z), s * (0.12 + 0.18 * Math.min(1, Math.log10(1 + mag / ref) / 4)), col, s * 0.03, s * 0.015); a.traverse(o => { if (o.material) o.material.depthTest = false; o.renderOrder = 10; }); marks.add(a); };
      const tiny = 1e-6 * r.m * s;
      arrow(r.U, r.zc, 0xd0343c, r.Umag, tiny);
      const half = (z1 - z0) / 2 || s / 4; arrow(r.C, r.zc + half, 0x2a62c9, r.Cmag, tiny * half); arrow(r.C.map(v => -v), r.zc - half, 0x2a62c9, r.Cmag, tiny * half);
    },
    showBody(i, on) { if (bodies.children[i]) bodies.children[i].visible = on; },
  };
}
function trace(p, segs) {
  p.moveTo(...segs[0].p);
  for (const s of segs) s.t === 'L' ? p.lineTo(...s.q) : p.absarc(0, 0, s.r, s.a0, s.a1, s.a1 < s.a0);
}
