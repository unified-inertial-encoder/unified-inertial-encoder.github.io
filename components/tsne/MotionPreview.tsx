'use client';

import * as React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { POS_SCALE, QUAT_SCALE, RAD_SCALE, type TsneIndex } from './types';

const BODY = '#c9c9c9';
const PATH = '#8c8c8c';
const GRID = '#e4e4e4';
const INK = '#444444';

export type Joint = { name: string; type: string; parent: string; child: string; origin: number[]; axis: number[] };
export type Kin = { base: string; actuated: string[]; joints: Joint[] };

let g1Cache: Promise<{ gltf: THREE.Group; kin: Kin }> | null = null;
export function loadG1(base: string) {
  if (!g1Cache) {
    g1Cache = Promise.all([
      new GLTFLoader().loadAsync(`${base}/g1.glb`),
      fetch(`${base}/g1_kinematics.json`).then((r) => r.json() as Promise<Kin>),
    ]).then(([g, kin]) => ({ gltf: g.scene, kin }));
  }
  return g1Cache;
}

/* ------------------------------------------------------------------ bodies */

type Body = { root: THREE.Object3D; pose: (frame: Float32Array) => void };

/** Capsule mannequin from mannequin keypoints (positions only). */
function makeMannequin(points: string[], material: THREE.Material): Body {
  const P = (n: string) => points.indexOf(n);
  const bones: [number, number, number][] = [
    [P('pelvis'), P('t8'), 0.085], [P('t8'), P('neck'), 0.07], [P('neck'), P('head_top'), 0.045],
    [P('neck'), P('l_sho'), 0.038], [P('neck'), P('r_sho'), 0.038],
    [P('l_sho'), P('l_elb'), 0.045], [P('l_elb'), P('l_wri'), 0.035], [P('l_wri'), P('l_tip'), 0.026],
    [P('r_sho'), P('r_elb'), 0.045], [P('r_elb'), P('r_wri'), 0.035], [P('r_wri'), P('r_tip'), 0.026],
    [P('pelvis'), P('l_hip'), 0.06], [P('pelvis'), P('r_hip'), 0.06],
    [P('l_hip'), P('l_knee'), 0.07], [P('l_knee'), P('l_ank'), 0.05], [P('l_ank'), P('l_toe'), 0.034],
    [P('r_hip'), P('r_knee'), 0.07], [P('r_knee'), P('r_ank'), 0.05], [P('r_ank'), P('r_toe'), 0.034],
  ];
  const root = new THREE.Group();
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  const sph = new THREE.SphereGeometry(1, 14, 10);
  const segs = bones.map(([a, b, r]) => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(cyl, material);
    const s0 = new THREE.Mesh(sph, material);
    const s1 = new THREE.Mesh(sph, material);
    s0.scale.setScalar(r); s1.scale.setScalar(r);
    g.add(c, s0, s1);
    root.add(g);
    return { a, b, r, g, c, s1 };
  });
  const head = new THREE.Mesh(sph, material);
  head.scale.setScalar(0.105);
  root.add(head);
  const up = new THREE.Vector3(0, 1, 0), va = new THREE.Vector3(), vb = new THREE.Vector3(), d = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const pose = (f: Float32Array) => {
    for (const s of segs) {
      va.set(f[3 * s.a], f[3 * s.a + 1], f[3 * s.a + 2]);
      vb.set(f[3 * s.b], f[3 * s.b + 1], f[3 * s.b + 2]);
      d.subVectors(vb, va);
      const len = Math.max(d.length(), 1e-4);
      q.setFromUnitVectors(up, d.normalize());
      s.g.position.copy(va); s.g.quaternion.copy(q);
      s.c.scale.set(s.r, len, s.r); s.c.position.set(0, len / 2, 0);
      s.s1.position.set(0, len, 0);
    }
    const n = P('neck'), h = P('head_top');
    head.position.set((f[3 * n] + f[3 * h]) / 2, (f[3 * n + 1] + f[3 * h + 1]) / 2, (f[3 * n + 2] + f[3 * h + 2]) / 2);
  };
  return { root, pose };
}

/** G1 from the URDF kinematics: root pose + actuated joint angles. */
function makeG1(gltf: THREE.Group, kin: Kin, material: THREE.Material): Body {
  const links = new Map<string, THREE.Object3D>();
  const link = (n: string) => {
    let o = links.get(n);
    if (!o) { o = new THREE.Group(); o.name = n; links.set(n, o); }
    return o;
  };
  const root = link(kin.base);
  const jointRot: { obj: THREE.Object3D; axis: THREE.Vector3 }[] = new Array(kin.actuated.length);
  for (const j of kin.joints) {
    const frame = new THREE.Object3D();
    const m = new THREE.Matrix4().fromArray(j.origin).transpose(); // row-major -> column-major
    frame.matrix.copy(m); frame.matrixAutoUpdate = false;
    const rot = new THREE.Object3D();
    frame.add(rot);
    rot.add(link(j.child));
    link(j.parent).add(frame);
    const k = kin.actuated.indexOf(j.name);
    if (k >= 0) jointRot[k] = { obj: rot, axis: new THREE.Vector3().fromArray(j.axis).normalize() };
  }
  gltf.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const target = links.get(o.name) ?? links.get(o.parent?.name ?? '');
      if (target) {
        const copy = new THREE.Mesh(mesh.geometry, material);
        target.add(copy);
      }
    }
  });
  const pose = (f: Float32Array) => {
    root.position.set(f[0], f[1], f[2]);
    root.quaternion.set(f[3], f[4], f[5], f[6]);
    for (let k = 0; k < jointRot.length; k++) {
      const jr = jointRot[k];
      if (jr) jr.obj.quaternion.setFromAxisAngle(jr.axis, f[7 + k]);
    }
  };
  return { root, pose };
}

/* ------------------------------------------------------------------ data */

export function decode(buf: ArrayBuffer, kind: number, frames: number, nPoints: number): Float32Array[] {
  const raw = new Int16Array(buf);
  const per = kind === 0 ? nPoints * 3 : 7 + nPoints;
  const out: Float32Array[] = [];
  for (let f = 0; f < frames; f++) {
    const row = new Float32Array(per);
    for (let i = 0; i < per; i++) {
      const v = raw[f * per + i];
      row[i] = kind === 0 ? v / POS_SCALE : i < 3 ? v / POS_SCALE : i < 7 ? v / QUAT_SCALE : v / RAD_SCALE;
    }
    out.push(row);
  }
  return out;
}

function lerpFrame(a: Float32Array, b: Float32Array, t: number, kind: number, out: Float32Array) {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  if (kind === 1) {
    // renormalise the interpolated root quaternion (short arc)
    const dot = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6];
    if (dot < 0) for (let i = 3; i < 7; i++) out[i] = a[i] - (b[i] + a[i]) * t;
    const n = Math.hypot(out[3], out[4], out[5], out[6]) || 1;
    for (let i = 3; i < 7; i++) out[i] /= n;
  }
}

function pelvisOf(f: Float32Array, kind: number, points: string[]): [number, number, number] {
  if (kind === 1) return [f[0], f[1], f[2]];
  const p = points.indexOf('pelvis');
  return [f[3 * p], f[3 * p + 1], f[3 * p + 2]];
}

/* ------------------------------------------------------------------ component */

export default function MotionPreview({
  url, kind, meta, nFrames, g1Base, width, height,
}: { url: string; kind: number; meta: TsneIndex; nFrames: number; g1Base: string; width: number; height: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');

  React.useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let alive = true;
    let raf = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2; // data is z-up
    scene.add(world);
    scene.add(new THREE.HemisphereLight('#ffffff', '#d0d0d0', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 1.1);
    sun.position.set(0.3, 1.0, 0.6);
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);

    const bodyMat = new THREE.MeshLambertMaterial({ color: BODY });

    (async () => {
      try {
        const nPts = kind === 0 ? meta.human_points.length : meta.joints.length;
        const [buf, g1] = await Promise.all([
          fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); }),
          kind === 1 ? loadG1(g1Base) : Promise.resolve(null),
        ]);
        if (!alive) return;
        const frames = decode(buf, kind, nFrames, nPts);
        const dur = (frames.length - 1) / meta.fps;
        const make = (m: THREE.Material) => (kind === 0 ? makeMannequin(meta.human_points, m) : makeG1(g1!.gltf, g1!.kin, m));

        // floor-projected pelvis path
        const path = frames.map((f) => pelvisOf(f, kind, meta.human_points));
        const xs = path.map((p) => p[0]), ys = path.map((p) => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        const half = Math.max(1.1, ext / 2 + 0.8);
        const cell = half > 3 ? 1 : 0.5;
        const n = Math.ceil(half / cell);
        const gridPts: number[] = [];
        for (let i = -n; i <= n; i++) {
          gridPts.push(cx - n * cell, cy + i * cell, 0, cx + n * cell, cy + i * cell, 0);
          gridPts.push(cx + i * cell, cy - n * cell, 0, cx + i * cell, cy + n * cell, 0);
        }
        const grid = new THREE.LineSegments(
          new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3)),
          new THREE.LineBasicMaterial({ color: GRID }),
        );
        world.add(grid);
        const pathLine = new THREE.Line(
          new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(path.flatMap((p) => [p[0], p[1], 0.002]), 3)),
          new THREE.LineBasicMaterial({ color: PATH }),
        );
        world.add(pathLine);
        // scale bar: one cell along the near-left floor edge
        const bar = new THREE.Line(
          new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([cx - n * cell, cy - n * cell, 0.003, cx - n * cell + cell, cy - n * cell, 0.003], 3)),
          new THREE.LineBasicMaterial({ color: INK }),
        );
        world.add(bar);
        const barLabel = document.createElement('div');
        barLabel.textContent = `${cell} m`;
        barLabel.style.cssText = 'position:absolute;font-size:11px;color:#444;pointer-events:none;';
        host.appendChild(barLabel);

        // the live body along the ground-truth path (no time-lapse)
        const live = make(bodyMat);
        world.add(live.root);

        // camera: side-on to the path's main direction, elevation 14 deg, orthographic
        let dirx = 1, diry = 0;
        if (ext > 0.3) {
          const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
          let sxx = 0, sxy = 0, syy = 0;
          for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
          const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
          dirx = Math.cos(ang); diry = Math.sin(ang);
        }
        const az = Math.atan2(diry, dirx) - Math.PI / 2 + THREE.MathUtils.degToRad(28); // slight swing toward travel
        const el = THREE.MathUtils.degToRad(16);
        const dist = 20;
        const target = new THREE.Vector3(cx, 0.85, -cy); // world (y-up) coords: (x, z, -y)
        camera.position.set(target.x + dist * Math.cos(el) * Math.cos(az), target.y + dist * Math.sin(el), target.z - dist * Math.cos(el) * Math.sin(az));
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
        const aspect = width / height;
        const viewH = Math.max(2.1, 2 * half * 0.55 + 0.8);
        camera.top = viewH / 2; camera.bottom = -viewH / 2;
        camera.left = -viewH * aspect / 2; camera.right = viewH * aspect / 2;
        camera.updateProjectionMatrix();

        const place = (p: THREE.Vector3) => {
          const v = p.clone().project(camera);
          return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
        };
        const [bx, by] = place(new THREE.Vector3(cx - n * cell + cell / 2, 0, -(cy - n * cell)));
        barLabel.style.left = `${bx - 10}px`; barLabel.style.top = `${by - 16}px`;

        setStatus('ready');
        const t0 = performance.now();
        const cur = new Float32Array(frames[0].length);
        const tick = () => {
          if (!alive) return;
          const t = ((performance.now() - t0) / 1000) % (dur + 0.6); // short hold at the end
          const ft = Math.min(t, dur) * meta.fps;
          const i = Math.min(frames.length - 2, Math.floor(ft));
          lerpFrame(frames[i], frames[i + 1], ft - i, kind, cur);
          live.pose(cur);
          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        console.error(e);
        if (alive) setStatus('error');
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      renderer.dispose();
      host.innerHTML = '';
    };
  }, [url, kind, meta, nFrames, g1Base, width, height]);

  return (
    <div className='relative' style={{ width, height }}>
      <div ref={ref} className='absolute inset-0' />
      {status !== 'ready' && (
        <div className='absolute inset-0 flex items-center justify-center text-xs text-gray-400'>
          {status === 'loading' ? 'Loading motion…' : 'Preview unavailable'}
        </div>
      )}
    </div>
  );
}
