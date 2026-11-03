'use client';

import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { asset } from '@/lib/utils';

type Fit = { A: number; B: number; E: number; alpha: number; beta: number };
type Pt = { run: string; label: string; N: number; D: number; step: number; epoch: number; C: number; loss: number; pred: number };
type Data = { fit: Fit; points: Pt[] };

const law = (f: Fit, n: number, d: number) => f.E + f.A / Math.pow(n, f.alpha) + f.B / Math.pow(d, f.beta);
const fmtSI = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v.toFixed(0));
const fmtC = (c: number) => { const e = Math.floor(Math.log10(c)); const sup = String(e).split('').map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]).join(''); return `${(c / 10 ** e).toFixed(2)} × 10${sup}`; };

// paper panel (b): log10 axes, tokens reversed, z = error in [0.025, 0.078]
const N_RANGE = [2.8e6, 300e6], D_RANGE = [0.3e9, 30e9], Z_RANGE = [0.025, 0.078];
const LX = [Math.log10(N_RANGE[0] / 1e6), Math.log10(N_RANGE[1] / 1e6)];
const LY = [-Math.log10(D_RANGE[1] / 1e9), -Math.log10(D_RANGE[0] / 1e9)];
const Z_ASPECT = 0.62;
const CMAP = ['#b5cddd', '#edf2f5', '#faf7ee', '#ead5a5'].map((c) => new THREE.Color(c));
const GOLD = '#d8b35c', INK = '#444444', POINT_INK = '#648197', ISO_INK = '#737b82', PANE = '#e1e5e8', GRID = '#e4e8eb';
const ISO_FLOPS = [1e17, 1e18, 1e19];

const toBox = (n: number, d: number, loss: number) => new THREE.Vector3(
  (Math.log10(n / 1e6) - LX[0]) / (LX[1] - LX[0]),
  (-Math.log10(d / 1e9) - LY[0]) / (LY[1] - LY[0]),
  ((loss - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0])) * Z_ASPECT,
);
const fromBox = (bx: number, by: number) => ({
  n: 10 ** (LX[0] + bx * (LX[1] - LX[0])) * 1e6,
  d: 10 ** (-(LY[0] + by * (LY[1] - LY[0]))) * 1e9,
});
function cmap(loss: number): THREE.Color {
  const t = THREE.MathUtils.clamp((loss - 0.025) / 0.05, 0, 1) * (CMAP.length - 1);
  const i = Math.min(CMAP.length - 2, Math.floor(t));
  return CMAP[i].clone().lerp(CMAP[i + 1], t - i);
}

type Hover = { n: number; d: number; pred: number; pt: Pt | null; x: number; y: number };

export default function ScalingSurface({ height = 400 }: { height?: number }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [data, setData] = React.useState<Data | null>(null);
  const [hover, setHover] = React.useState<Hover | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    fetch(asset('/scaling/points.json')).then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);
  React.useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !data || !width) return;
    let alive = true;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);
    const labels: { el: HTMLDivElement; p: THREE.Vector3; dx: number; dy: number }[] = [];
    const addLabel = (text: string, p: THREE.Vector3, dx = 0, dy = 0, cls = '') => {
      const el = document.createElement('div');
      el.textContent = text;
      el.className = cls;
      el.style.cssText = 'position:absolute;pointer-events:none;white-space:nowrap;font-size:11px;color:#444;transform:translate(-50%,-50%)';
      host.appendChild(el);
      labels.push({ el, p, dx, dy });
    };

    const scene = new THREE.Scene();
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2; // box z (error) up
    scene.add(world);
    const f = data.fit;

    // --- panes + grid (far walls relative to the paper's camera at +x, -y)
    const xt = [3, 30, 300].map((v) => (Math.log10(v) - LX[0]) / (LX[1] - LX[0]));
    const yt = [0.3, 3, 30].map((v) => (-Math.log10(v) - LY[0]) / (LY[1] - LY[0]));
    const zt = [0.03, 0.05, 0.07].map((v) => ((v - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0])) * Z_ASPECT);
    const g: number[] = [];
    const seg = (a: number[], b: number[]) => g.push(...a, ...b);
    for (const x of xt) { seg([x, 0, 0], [x, 1, 0]); seg([x, 1, 0], [x, 1, Z_ASPECT]); }
    for (const y of yt) { seg([0, y, 0], [1, y, 0]); seg([0, y, 0], [0, y, Z_ASPECT]); }
    for (const z of zt) { seg([0, 0, z], [0, 1, z]); seg([0, 1, z], [1, 1, z]); }
    world.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(g, 3)), new THREE.LineBasicMaterial({ color: GRID })));
    const e: number[] = [];
    const E = (a: number[], b: number[]) => e.push(...a, ...b);
    E([0, 0, 0], [1, 0, 0]); E([0, 0, 0], [0, 1, 0]); E([1, 0, 0], [1, 1, 0]); E([0, 1, 0], [1, 1, 0]);
    E([0, 0, 0], [0, 0, Z_ASPECT]); E([0, 1, 0], [0, 1, Z_ASPECT]); E([1, 1, 0], [1, 1, Z_ASPECT]);
    E([0, 0, Z_ASPECT], [0, 1, Z_ASPECT]); E([0, 1, Z_ASPECT], [1, 1, Z_ASPECT]);
    world.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(e, 3)), new THREE.LineBasicMaterial({ color: PANE })));
    [3, 30, 300].forEach((v, i) => addLabel(String(v), new THREE.Vector3(xt[i], -0.09, 0)));
    [0.3, 3, 30].forEach((v, i) => addLabel(String(v), new THREE.Vector3(1.1, yt[i], 0), 4, 4));
    [0.03, 0.05, 0.07].forEach((v, i) => addLabel(v.toFixed(2), new THREE.Vector3(-0.06, 1, zt[i])));
    addLabel('Parameters (M)', new THREE.Vector3(0.45, -0.24, 0));
    addLabel('Tokens D (B)', new THREE.Vector3(1.28, 0.55, 0));
    addLabel('Error (m/s)', new THREE.Vector3(-0.2, 1, Z_ASPECT / 2));

    // --- surface
    const S = 64;
    const geo = new THREE.PlaneGeometry(1, 1, S, S);
    geo.translate(0.5, 0.5, 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const { n, d } = fromBox(pos.getX(i), pos.getY(i));
      const l = law(f, n, d);
      pos.setZ(i, ((l - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0])) * Z_ASPECT);
      const c = cmap(l);
      colors[3 * i] = c.r; colors[3 * i + 1] = c.g; colors[3 * i + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const surface = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }));
    world.add(surface);
    const wire: number[] = [];
    for (let k = 0; k <= S; k += 8) {
      for (let j = 0; j < S; j++) {
        const a = k * (S + 1) + j, b = a + 1, c2 = j * (S + 1) + k, d2 = c2 + S + 1;
        wire.push(pos.getX(a), pos.getY(a), pos.getZ(a) + 0.001, pos.getX(b), pos.getY(b), pos.getZ(b) + 0.001);
        wire.push(pos.getX(c2), pos.getY(c2), pos.getZ(c2) + 0.001, pos.getX(d2), pos.getY(d2), pos.getZ(d2) + 0.001);
      }
    }
    world.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)), new THREE.LineBasicMaterial({ color: '#d4dde4' })));

    // --- data points
    const sph = new THREE.SphereGeometry(0.007, 10, 8);
    const inst = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ color: POINT_INK }), data.points.length);
    const m4 = new THREE.Matrix4();
    const boxPts = data.points.map((p) => toBox(p.N, p.D, p.loss));
    boxPts.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
    world.add(inst);

    // --- iso-FLOP contours (dashed) and the compute-optimal path (gold)
    const isoLabelAt: THREE.Vector3[] = [];
    for (const c of ISO_FLOPS) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 120; k++) {
        const n = N_RANGE[0] * Math.pow(N_RANGE[1] / N_RANGE[0], k / 120), d = c / (6 * n);
        if (d < D_RANGE[0] || d > D_RANGE[1]) continue;
        const v = toBox(n, d, law(f, n, d)); v.z += 0.004; pts.push(v);
      }
      if (pts.length < 2) continue;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: ISO_INK, dashSize: 0.02, gapSize: 0.012 }));
      line.computeLineDistances();
      world.add(line);
      isoLabelAt.push(pts[0]);
    }
    const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    ISO_FLOPS.forEach((c, i) => { if (isoLabelAt[i]) addLabel(`10${String(Math.round(Math.log10(c))).split('').map((ch) => SUP[+ch]).join('')}`, isoLabelAt[i].clone(), -18, -8); });
    const ex = f.beta / (f.alpha + f.beta), fac = Math.pow((f.alpha * f.A) / (f.beta * f.B), 1 / (f.alpha + f.beta));
    const nOpt = (c: number) => fac * Math.pow(c / 6, ex);
    const path: THREE.Vector3[] = [];
    for (let k = 0; k <= 200; k++) {
      const c = 1e15 * Math.pow(1e6, k / 200), n = nOpt(c), d = c / (6 * n);
      if (n < N_RANGE[0] || n > N_RANGE[1] || d < D_RANGE[0] || d > D_RANGE[1]) continue;
      const v = toBox(n, d, law(f, n, d)); v.z += 0.005; path.push(v);
    }
    if (path.length > 2) world.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 120, 0.005, 6, false), new THREE.MeshBasicMaterial({ color: GOLD })));
    for (const c of ISO_FLOPS) {
      const n = nOpt(c), d = c / (6 * n);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), new THREE.MeshBasicMaterial({ color: GOLD }));
      const v = toBox(n, d, law(f, n, d)); s.position.set(v.x, v.y, v.z + 0.005);
      world.add(s);
    }

    // --- hover marker
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), new THREE.MeshBasicMaterial({ color: INK }));
    marker.visible = false;
    world.add(marker);
    const dropGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const drop = new THREE.Line(dropGeo, new THREE.LineBasicMaterial({ color: '#b8bfc4' }));
    drop.visible = false;
    world.add(drop);

    // --- camera (paper: elev 27, azim -55; camera sits at +x, -y, above), orthographic
    const el = THREE.MathUtils.degToRad(27), az = THREE.MathUtils.degToRad(-55);
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)); // box frame
    const target = new THREE.Vector3(0.5, 0.5, Z_ASPECT / 2);
    const camPosBox = target.clone().add(dir.multiplyScalar(6));
    const toWorld = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.z, -v.y);
    const aspect = width / height;
    // Leave room for the projected axis labels on narrow screens.
    const viewH = Math.max(1.28, 1.85 / aspect);
    const camera = new THREE.OrthographicCamera(-viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 0.1, 50);
    camera.position.copy(toWorld(camPosBox));
    camera.up.set(0, 1, 0);
    camera.lookAt(toWorld(target));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(toWorld(target));
    controls.enableZoom = false; controls.enablePan = false; controls.rotateSpeed = 0.6;
    controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.45;
    controls.update();

    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointer: { x: number; y: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const onLeave = () => { pointer = null; setHover(null); marker.visible = false; drop.visible = false; };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    let lastKey = '';
    const tick = () => {
      if (!alive) return;
      controls.update();
      // hover: raycast the surface, snap to a nearby checkpoint
      if (pointer) {
        mouse.set((pointer.x / width) * 2 - 1, -(pointer.y / height) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObject(surface)[0];
        if (hit) {
          const lp = world.worldToLocal(hit.point.clone());
          let best = -1, bd = 0.045 * 0.045;
          boxPts.forEach((p, i) => { const dd = (p.x - lp.x) ** 2 + (p.y - lp.y) ** 2; if (dd < bd) { bd = dd; best = i; } });
          const pt = best >= 0 ? data.points[best] : null;
          const at = pt ? boxPts[best] : lp;
          const { n, d } = pt ? { n: pt.N, d: pt.D } : fromBox(lp.x, lp.y);
          marker.position.set(at.x, at.y, at.z + 0.004); marker.visible = true;
          (dropGeo.attributes.position as THREE.BufferAttribute).setXYZ(0, at.x, at.y, 0);
          (dropGeo.attributes.position as THREE.BufferAttribute).setXYZ(1, at.x, at.y, at.z);
          dropGeo.attributes.position.needsUpdate = true; drop.visible = true;
          const key = `${best}:${n.toFixed(0)}:${d.toFixed(0)}`;
          if (key !== lastKey) { lastKey = key; setHover({ n, d, pred: law(f, n, d), pt, x: pointer.x, y: pointer.y }); }
        } else if (lastKey !== '') { lastKey = ''; setHover(null); marker.visible = false; drop.visible = false; }
      }
      renderer.render(scene, camera);
      for (const l of labels) {
        const v = toWorld(l.p).project(camera);
        l.el.style.left = `${((v.x + 1) / 2) * width + l.dx}px`;
        l.el.style.top = `${((1 - v.y) / 2) * height + l.dy}px`;
      }
      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      alive = false;
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose(); renderer.dispose();
      host.innerHTML = '';
    };
  }, [data, width, height]);

  const tip = hover ? (() => {
    const W = 250, H = hover.pt ? 128 : 72;
    return { left: hover.x + 14 + W > width ? hover.x - 14 - W : hover.x + 14, top: Math.min(Math.max(hover.y - H / 2, 0), height - H), width: W };
  })() : null;

  return (
    <div className='relative w-full select-none' style={{ height }}>
      <div ref={hostRef} className='absolute inset-0 overflow-hidden' style={{ cursor: 'crosshair' }} />
      {!data && <div className='absolute inset-0 flex items-center justify-center text-sm text-gray-400'>Loading scaling data…</div>}
      {hover && tip && (
        <div className='pointer-events-none absolute z-20 border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs text-gray-600' style={tip}>
          {hover.pt ? (
            <>
              <div className='font-medium text-gray-800'>{hover.pt.label}</div>
              <div className='text-[0.68rem] text-gray-500'>step {hover.pt.step.toLocaleString()} · epoch {hover.pt.epoch + 1}</div>
            </>
          ) : (
            <div className='font-medium text-gray-800'>Fitted surface</div>
          )}
          <div className='text-[0.68rem] text-gray-500'>N {fmtSI(hover.n)} · D {fmtSI(hover.d)} tokens · {fmtC(6 * hover.n * hover.d)} FLOPs</div>
          <table className='mt-1 tabular-nums'>
            <tbody>
              <tr><td className='pr-3'>Predicted error</td><td className='text-right font-medium text-gray-800'>{hover.pred.toFixed(4)} m/s</td></tr>
              {hover.pt && (
                <>
                  <tr><td className='pr-3'>Measured error</td><td className='text-right font-medium text-gray-800'>{hover.pt.loss.toFixed(4)} m/s</td></tr>
                  <tr><td className='pr-3'>Residual</td><td className='text-right'>{((hover.pt.loss / hover.pred - 1) * 100).toFixed(1)} %</td></tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
