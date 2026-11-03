'use client';

import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { decode, loadG1, type Kin } from '@/components/tsne/MotionPreview';
import type { TsneIndex } from '@/components/tsne/types';
import { asset, cn } from '@/lib/utils';

/* ------------------------------------------------------------------ config */

const BASE = '/tsne';
const RATE = 40; // Hz after upsampling the 8-Hz windows
const G = new THREE.Vector3(0, 0, -9.81); // data frame is z-up

const MOTIONS = [
  { key: 'walk', label: 'Walk', id: 1884 },
  { key: 'jog', label: 'Jog', id: 1773 },
  { key: 'crouch', label: 'Crouch walk', id: 1754 },
  { key: 'exercise', label: 'Exercise', id: 1981 },
  { key: 'jump', label: 'Jump', id: 2003 },
] as const;

type Site = { key: string; label: string; link: string };
const PELVIS: Site = { key: 'pelvis', label: 'Pelvis', link: 'pelvis' };
const SITES: Site[] = [
  { key: 'head', label: 'Head', link: 'head_link' },
  { key: 'l_uarm', label: 'L upper arm', link: 'left_shoulder_yaw_link' },
  { key: 'r_uarm', label: 'R upper arm', link: 'right_shoulder_yaw_link' },
  { key: 'l_farm', label: 'L forearm', link: 'left_elbow_link' },
  { key: 'r_farm', label: 'R forearm', link: 'right_elbow_link' },
  { key: 'l_uleg', label: 'L upper leg', link: 'left_hip_yaw_link' },
  { key: 'r_uleg', label: 'R upper leg', link: 'right_hip_yaw_link' },
  { key: 'l_lleg', label: 'L lower leg', link: 'left_knee_link' },
  { key: 'r_lleg', label: 'R lower leg', link: 'right_knee_link' },
  { key: 'l_foot', label: 'L foot', link: 'left_ankle_roll_link' },
  { key: 'r_foot', label: 'R foot', link: 'right_ankle_roll_link' },
];

const PARTS = [
  { key: 'head', label: 'Head' },
  { key: 'uarm', label: 'Upper arm' },
  { key: 'farm', label: 'Forearm' },
  { key: 'uleg', label: 'Upper leg' },
  { key: 'lleg', label: 'Lower leg' },
  { key: 'foot', label: 'Foot' },
];
const LABEL = 'shrink-0 text-[0.62rem] font-medium tracking-wider text-gray-500 uppercase sm:text-[0.7rem]';
const siteKeyOf = (side: 'l' | 'r', part: string) => (part === 'head' ? 'head' : `${side}_${part}`);

const GOLD = '#c79a35';
const BLUE = '#4f78a8';
const AXIS = ['#b8902f', '#4f78a8', '#8c8c8c']; // x, y, z

/* ------------------------------------------------------------------ kinematics */

type Rig = {
  root: THREE.Object3D;
  links: Map<string, THREE.Object3D>;
  /** rotating child frame per actuated joint (index = actuated order) */
  jointRot: { obj: THREE.Object3D; axis: THREE.Vector3; name: string }[];
  /** joint frames keyed by child link, for walking the chain */
  jointOf: Map<string, { name: string; parent: string; obj: THREE.Object3D }>;
  pose: (f: Float32Array, pinXY?: boolean) => void;
};

function buildRig(kin: Kin, gltf: THREE.Group | null, material?: THREE.Material): Rig {
  const links = new Map<string, THREE.Object3D>();
  const link = (n: string) => {
    let o = links.get(n);
    if (!o) {
      o = new THREE.Group();
      o.name = n;
      links.set(n, o);
    }
    return o;
  };
  const root = link(kin.base);
  const jointRot: Rig['jointRot'] = new Array(kin.actuated.length);
  const jointOf: Rig['jointOf'] = new Map();
  for (const j of kin.joints) {
    const frame = new THREE.Object3D();
    frame.matrix.copy(new THREE.Matrix4().fromArray(j.origin).transpose());
    frame.matrixAutoUpdate = false;
    const rot = new THREE.Object3D();
    frame.add(rot);
    rot.add(link(j.child));
    link(j.parent).add(frame);
    jointOf.set(j.child, { name: j.name, parent: j.parent, obj: rot });
    const k = kin.actuated.indexOf(j.name);
    if (k >= 0) jointRot[k] = { obj: rot, axis: new THREE.Vector3().fromArray(j.axis).normalize(), name: j.name };
  }
  if (gltf && material) {
    gltf.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const target = links.get(o.name) ?? links.get(o.parent?.name ?? '');
      if (target) target.add(new THREE.Mesh(mesh.geometry, material));
    });
  }
  const pose = (f: Float32Array, pinXY = false) => {
    root.position.set(pinXY ? 0 : f[0], pinXY ? 0 : f[1], f[2]);
    root.quaternion.set(f[3], f[4], f[5], f[6]);
    for (let k = 0; k < jointRot.length; k++) {
      const jr = jointRot[k];
      if (jr) jr.obj.quaternion.setFromAxisAngle(jr.axis, f[7 + k]);
    }
  };
  return { root, links, jointRot, jointOf, pose };
}

/** Actuated joints (and their frames) from the pelvis down to `linkName`. */
function chainTo(rig: Rig, linkName: string) {
  const out: { name: string; obj: THREE.Object3D }[] = [];
  let cur = linkName;
  while (cur !== 'pelvis') {
    const j = rig.jointOf.get(cur);
    if (!j) break;
    out.unshift({ name: j.name, obj: j.obj });
    cur = j.parent;
  }
  return out;
}

/** Geometry centre of a link in its own frame (where we mount the IMU). */
function siteOffsets(kin: Kin, gltf: THREE.Group) {
  const off = new Map<string, THREE.Vector3>();
  const boxes = new Map<string, THREE.Box3>();
  gltf.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = o.name || o.parent?.name || '';
    mesh.geometry.computeBoundingBox();
    const b = boxes.get(name) ?? new THREE.Box3();
    b.union(mesh.geometry.boundingBox!);
    boxes.set(name, b);
  });
  for (const s of [PELVIS, ...SITES]) {
    const b = boxes.get(s.link);
    off.set(s.link, b ? b.getCenter(new THREE.Vector3()) : new THREE.Vector3());
  }
  // the pelvis IMU has a real mount point in the URDF
  const imu = kin.joints.find((j) => j.name === 'imu_in_pelvis_joint');
  if (imu) off.set('pelvis', new THREE.Vector3(imu.origin[3], imu.origin[7], imu.origin[11]));
  return off;
}

/* ------------------------------------------------------------------ signals */

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** 8-Hz windows -> RATE Hz with Catmull-Rom (quaternions sign-aligned, renormalised). */
function upsample(frames: Float32Array[], fps: number): Float32Array[] {
  const fr = frames.map((f) => Float32Array.from(f));
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i];
    if (a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6] < 0) for (let k = 3; k < 7; k++) b[k] = -b[k];
  }
  const n = fr.length, dim = fr[0].length, step = fps / RATE;
  const out: Float32Array[] = [];
  for (let u = 0; u <= (n - 1) / step + 1e-6; u++) {
    const x = u * step, i = Math.min(n - 2, Math.floor(x)), t = x - i;
    const p0 = fr[Math.max(0, i - 1)], p1 = fr[i], p2 = fr[i + 1], p3 = fr[Math.min(n - 1, i + 2)];
    const row = new Float32Array(dim);
    for (let k = 0; k < dim; k++) row[k] = catmull(p0[k], p1[k], p2[k], p3[k], t);
    const q = Math.hypot(row[3], row[4], row[5], row[6]) || 1;
    for (let k = 3; k < 7; k++) row[k] /= q;
    out.push(row);
  }
  return out;
}

function smooth(xs: number[][], w = 2) {
  return xs.map((_, i) => {
    const acc = [0, 0, 0];
    let c = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(xs.length - 1, i + w); k++) {
      for (let d = 0; d < 3; d++) acc[d] += xs[k][d];
      c++;
    }
    return acc.map((v) => v / c);
  });
}

type Signals = {
  T: number;
  gyro: Map<string, number[][]>; // rad/s, sensor frame
  acc: Map<string, number[][]>; // m/s^2 specific force, sensor frame
};

function computeSignals(rig: Rig, frames: Float32Array[], off: Map<string, THREE.Vector3>): Signals {
  const T = frames.length, dt = 1 / RATE;
  const all = [PELVIS, ...SITES];
  const P = new Map(all.map((s) => [s.link, [] as THREE.Vector3[]]));
  const Q = new Map(all.map((s) => [s.link, [] as THREE.Quaternion[]]));
  for (const f of frames) {
    rig.pose(f);
    rig.root.updateMatrixWorld(true);
    for (const s of all) {
      const l = rig.links.get(s.link)!;
      P.get(s.link)!.push(off.get(s.link)!.clone().applyMatrix4(l.matrixWorld));
      Q.get(s.link)!.push(l.getWorldQuaternion(new THREE.Quaternion()));
    }
  }
  const gyro = new Map<string, number[][]>(), acc = new Map<string, number[][]>();
  const qa = new THREE.Quaternion(), v = new THREE.Vector3();
  for (const s of all) {
    const p = P.get(s.link)!, q = Q.get(s.link)!;
    const g: number[][] = [], a: number[][] = [];
    for (let t = 0; t < T; t++) {
      const i0 = Math.max(0, t - 1), i1 = Math.min(T - 1, t + 1), span = (i1 - i0) * dt;
      // body-frame angular velocity: log(R_{t-1}^T R_{t+1}) / 2dt
      qa.copy(q[i0]).invert().multiply(q[i1]);
      if (qa.w < 0) qa.set(-qa.x, -qa.y, -qa.z, -qa.w);
      const sn = Math.hypot(qa.x, qa.y, qa.z), ang = 2 * Math.atan2(sn, qa.w);
      const k = sn > 1e-9 ? ang / sn / span : 2 / span;
      g.push([qa.x * k, qa.y * k, qa.z * k]);
      // specific force in sensor frame: R^T (p'' - g)
      const c = Math.min(T - 2, Math.max(1, t));
      v.copy(p[c + 1]).add(p[c - 1]).addScaledVector(p[c], -2).multiplyScalar(1 / (dt * dt)).sub(G);
      v.applyQuaternion(q[t].clone().invert());
      a.push([v.x, v.y, v.z]);
    }
    gyro.set(s.link, smooth(g));
    acc.set(s.link, smooth(a, 3));
  }
  return { T, gyro, acc };
}

/* ------------------------------------------------------------------ plots */

type Series = { color: string; ys: number[] }[];

/** Symmetric range [-m, m] shared by every series passed in. */
function rangeOf(...groups: Series[]): [number, number] {
  let m = 0;
  for (const g of groups) for (const s of g) for (const y of s.ys) m = Math.max(m, Math.abs(y));
  m = m * 1.08 || 1;
  return [-m, m];
}

const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));

function Plot({ series, T, range }: { series: Series; T: number; range: [number, number] }) {
  const W = 400, H = 120;
  const [lo, hi] = range;
  const X = (i: number) => (i / Math.max(1, T - 1)) * W;
  const Y = (y: number) => H - ((y - lo) / (hi - lo)) * H;
  return (
    <div className='relative border-l border-[#9e9583]'>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio='none' className='block h-[78px] w-full lg:h-[132px]'>
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke='#9e9583' strokeWidth={1} vectorEffect='non-scaling-stroke' />
        {series.map((s, k) => (
          <polyline
            key={k}
            fill='none'
            stroke={s.color}
            strokeWidth={1.5}
            vectorEffect='non-scaling-stroke'
            points={s.ys.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
      <span className='absolute top-1 left-2 font-serif text-[0.62rem] text-gray-400 tabular-nums'>{fmt(hi)}</span>
      <span className='absolute bottom-1 left-2 font-serif text-[0.62rem] text-gray-400 tabular-nums'>{fmt(lo)}</span>
      <div data-playhead className='pointer-events-none absolute inset-y-0 left-0 w-0 border-l border-dashed border-gray-900/70' />
    </div>
  );
}

/* ------------------------------------------------------------------ component */

type Loaded = { meta: TsneIndex; kin: Kin; gltf: THREE.Group };

export default function ImuInterfaceDemo({ height = 460 }: { height?: number }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState(false);
  const [motion, setMotion] = React.useState<(typeof MOTIONS)[number]['key']>('walk');
  const [side, setSide] = React.useState<'l' | 'r'>('l');
  const [part, setPart] = React.useState('farm');
  const siteKey = siteKeyOf(side, part);
  const setSiteKey = React.useCallback((k: string) => {
    if (k === 'head') { setPart('head'); return; }
    setSide(k[0] as 'l' | 'r');
    setPart(k.slice(2));
  }, []);
  const [clip, setClip] = React.useState<{ frames: Float32Array[]; sig: Signals } | null>(null);
  const [playing, setPlaying] = React.useState(true);

  const site = SITES.find((s) => s.key === siteKey)!;
  const plotsRef = React.useRef<HTMLDivElement | null>(null);
  const playingRef = React.useRef(playing);
  React.useEffect(() => { playingRef.current = playing; }, [playing]);

  // static assets
  React.useEffect(() => {
    let alive = true;
    Promise.all([fetch(asset(`${BASE}/index.json`)).then((r) => r.json() as Promise<TsneIndex>), loadG1(asset(BASE))])
      .then(([meta, g]) => alive && setLoaded({ meta, kin: g.kin, gltf: g.gltf }))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  // motion clip + signals
  React.useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const id = MOTIONS.find((m) => m.key === motion)!.id;
    fetch(asset(`${BASE}/w/${id}.bin`))
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (!alive) return;
        const raw = decode(buf, 1, loaded.meta.frames[id], loaded.meta.joints.length);
        const edge = Math.round(RATE / loaded.meta.fps); // drop one source frame at each end
        const frames = upsample(raw, loaded.meta.fps).slice(edge, -edge);
        const rig = buildRig(loaded.kin, null);
        const sig = computeSignals(rig, frames, siteOffsets(loaded.kin, loaded.gltf));
        setClip({ frames, sig });
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [loaded, motion]);

  // the 3-D scene
  const selectRef = React.useRef(siteKey);
  React.useEffect(() => { selectRef.current = siteKey; }, [siteKey]);

  React.useEffect(() => {
    const host = canvasRef.current;
    if (!host || !loaded || !clip) return;
    let alive = true, raf = 0;
    let width = host.clientWidth;
    let viewH = host.clientHeight || height;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, viewH);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfcfcf', 1.5));
    const sun = new THREE.DirectionalLight('#ffffff', 1.2);
    sun.position.set(2, 3, 2);
    scene.add(sun);
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2; // data is z-up
    scene.add(world);
    scene.fog = new THREE.Fog('#f8f7f4', 3.2, 6.5); // grid fades into the paper bg

    const camera = new THREE.PerspectiveCamera(28, width / viewH, 0.05, 50);
    // view direction (three coords = (x, z, -y) of data); distance fitted to the robot
    const viewDir = new THREE.Vector3(2.6, 0.73, -1.9).normalize();
    const fitCamera = () => {
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const halfH = 0.8, halfW = 0.62; // G1 standing envelope around the target, metres
      const d = Math.max(halfH / t, halfW / (t * camera.aspect)) * 1.03;
      const cur = camera.position.clone().sub(new THREE.Vector3(0, 0.62, 0));
      const dir = cur.lengthSq() > 1e-6 ? cur.normalize() : viewDir;
      camera.position.copy(dir.multiplyScalar(d)).add(new THREE.Vector3(0, 0.62, 0));
    };
    camera.position.copy(viewDir).add(new THREE.Vector3(0, 0.62, 0));
    fitCamera();
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.62, 0);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.62;
    controls.update();

    // floor grid that scrolls with the pelvis (treadmill view)
    const cell = 0.25, nCell = 10;
    const gp: number[] = [];
    for (let i = -nCell; i <= nCell; i++) {
      gp.push(-nCell * cell, i * cell, 0, nCell * cell, i * cell, 0, i * cell, -nCell * cell, 0, i * cell, nCell * cell, 0);
    }
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)),
      new THREE.LineBasicMaterial({ color: '#c9c0ae' }),
    );
    world.add(grid);

    // robot
    const rig = buildRig(loaded.kin, loaded.gltf, new THREE.MeshLambertMaterial({ color: '#d2d2d2' }));
    world.add(rig.root);
    const off = siteOffsets(loaded.kin, loaded.gltf);

    // IMU markers (drawn on top so they read through the shell)
    const mkMat = (c: string) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.95 });
    const markers = new Map<string, THREE.Mesh>();
    const addMarker = (s: Site, color: string, size: [number, number, number]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mkMat(color));
      m.renderOrder = 10;
      m.position.copy(off.get(s.link)!);
      m.userData.site = s.key;
      rig.links.get(s.link)!.add(m);
      markers.set(s.key, m);
    };
    addMarker(PELVIS, GOLD, [0.06, 0.06, 0.03]);
    for (const s of SITES) addMarker(s, BLUE, [0.04, 0.04, 0.022]);

    // sensor axes on the selected IMU
    const axes = new THREE.Group();
    AXIS.forEach((c, i) => {
      const d = [0, 0, 0];
      d[i] = 0.11;
      const l = new THREE.Line(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, ...d], 3)),
        new THREE.LineBasicMaterial({ color: c, depthTest: false }),
      );
      l.renderOrder = 11;
      axes.add(l);
    });

    // kinematic chain pelvis IMU -> joints -> site
    const chainGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 16), 3));
    const chainLine = new THREE.Line(chainGeom, new THREE.LineDashedMaterial({ color: '#1f2937', dashSize: 0.025, gapSize: 0.018, depthTest: false }));
    chainLine.renderOrder = 9;
    scene.add(chainLine);
    const dotGeom = new THREE.SphereGeometry(0.014, 12, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: '#1f2937', depthTest: false });
    const dots: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(dotGeom, dotMat);
      d.renderOrder = 12;
      d.visible = false;
      scene.add(d);
      dots.push(d);
    }

    // labels
    const mkLabel = (text: string, color: string) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;font:500 13px var(--font-serif-src), Cambria, serif;color:${color};background:rgba(248,247,244,.85);padding:1px 6px;`;
      host.appendChild(el);
      return el;
    };
    const pelvisLabel = mkLabel('Pelvis IMU · measured', GOLD);
    const siteLabel = mkLabel('', BLUE);

    // click an IMU to select it
    const ray = new THREE.Raycaster();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...markers.values()].filter((m) => m.userData.site !== 'pelvis'), false)[0];
      if (hit) setSiteKey(hit.object.userData.site as string);
    };
    const ro = new ResizeObserver(() => {
      width = host.clientWidth;
      viewH = host.clientHeight || height;
      renderer.setSize(width, viewH);
      camera.aspect = width / viewH;
      fitCamera();
      camera.updateProjectionMatrix();
    });
    ro.observe(host);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const { frames } = clip;
    const T = frames.length;
    const cur = new Float32Array(frames[0].length);
    const v = new THREE.Vector3();
    const project = (p: THREE.Vector3, el: HTMLDivElement, dx: number, dy: number) => {
      const s = p.clone().project(camera);
      el.style.transform = `translate(${((s.x + 1) / 2) * width + dx}px, ${((1 - s.y) / 2) * viewH + dy}px)`;
    };

    let clock = 0, last = performance.now();
    const tick = (now: number) => {
      if (!alive) return;
      if (playingRef.current) clock += Math.max(0, now - last) / 1000;
      last = Math.max(last, now);
      const ft = Math.max(0, (clock * RATE) % (T - 1));
      const i = Math.floor(ft), a = ft - i;
      const f0 = frames[i], f1 = frames[Math.min(T - 1, i + 1)];
      for (let k = 0; k < cur.length; k++) cur[k] = f0[k] + (f1[k] - f0[k]) * a;
      rig.pose(cur, true);
      grid.position.set(-(((cur[0] % cell) + cell) % cell), -(((cur[1] % cell) + cell) % cell), 0);
      world.updateMatrixWorld(true);

      // selection state
      const sel = SITES.find((s) => s.key === selectRef.current)!;
      for (const [k, m] of markers) {
        const on = k === sel.key;
        m.scale.setScalar(on ? 1.5 : k === 'pelvis' ? 1 : 0.85);
        (m.material as THREE.MeshBasicMaterial).opacity = on || k === 'pelvis' ? 1 : 0.55;
      }
      const selMarker = markers.get(sel.key)!;
      if (axes.parent !== selMarker) selMarker.add(axes);

      // chain polyline in scene coordinates
      const chain = chainTo(rig, sel.link);
      const pts: THREE.Vector3[] = [markers.get('pelvis')!.getWorldPosition(new THREE.Vector3())];
      chain.forEach((c) => pts.push(c.obj.getWorldPosition(new THREE.Vector3())));
      pts.push(selMarker.getWorldPosition(new THREE.Vector3()));
      const arr = chainGeom.attributes.position.array as Float32Array;
      pts.forEach((p, k) => { if (k < 16) { arr[3 * k] = p.x; arr[3 * k + 1] = p.y; arr[3 * k + 2] = p.z; } });
      chainGeom.setDrawRange(0, Math.min(16, pts.length));
      chainGeom.attributes.position.needsUpdate = true;
      chainLine.computeLineDistances();
      dots.forEach((d, k) => {
        const on = k < chain.length;
        d.visible = on;
        if (on) d.position.copy(pts[k + 1]);
      });

      project(markers.get('pelvis')!.getWorldPosition(v), pelvisLabel, 14, -8);
      siteLabel.textContent = `${sel.label} · synthesized`;
      project(selMarker.getWorldPosition(v), siteLabel, 14, -8);

      plotsRef.current?.querySelectorAll<HTMLDivElement>('[data-playhead]').forEach((h) => {
        h.style.left = `${(ft / (T - 1)) * 100}%`;
      });
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      renderer.dispose();
      host.innerHTML = '';
    };
  }, [loaded, clip, height, setSiteKey]);

  // plot series for the current selection
  const plots = React.useMemo(() => {
    if (!clip) return null;
    const { sig } = clip;
    const xyz = (m: number[][]): Series => [0, 1, 2].map((d) => ({ color: AXIS[d], ys: m.map((r) => r[d]) }));
    const pg = xyz(sig.gyro.get('pelvis')!), sg = xyz(sig.gyro.get(site.link)!);
    const pa = xyz(sig.acc.get('pelvis')!), sa = xyz(sig.acc.get(site.link)!);
    return { T: sig.T, pg, sg, pa, sa, gr: rangeOf(pg, sg), ar: rangeOf(pa, sa) };
  }, [clip, site.link]);

  const seg = (on: boolean) =>
    cn('px-2.5 py-1 whitespace-nowrap transition-colors sm:px-3 sm:py-1.5', on ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900');

  return (
    <div className='bg-paper p-3 md:p-6'>
      {/* ---------------- toolbar */}
      <div className='mb-3 grid grid-cols-[3.9rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 font-serif text-[0.75rem] sm:mb-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-x-3 sm:text-[0.8rem]'>
        <span className={LABEL}>Motion</span>
        <div className='flex items-center gap-2 sm:gap-3'>
          <div className='no-scrollbar flex min-w-0 overflow-x-auto border border-gray-300 bg-white sm:flex-wrap' role='tablist' aria-label='Motion'>
            {MOTIONS.map((m) => (
              <button key={m.key} type='button' role='tab' aria-selected={m.key === motion} onClick={() => setMotion(m.key)} className={seg(m.key === motion)}>
                {m.label}
              </button>
            ))}
          </div>
          <button
            type='button'
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
            className='ml-auto flex h-8 w-8 shrink-0 items-center justify-center border border-gray-300 bg-white text-gray-700 transition-colors hover:border-gray-900 hover:bg-gray-900 hover:text-white'
          >
            <svg viewBox='0 0 24 24' className='h-4 w-4' fill='currentColor' aria-hidden='true'>
              {playing ? <path d='M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' /> : <path d='M8 5.5v13l10.5-6.5z' />}
            </svg>
          </button>
        </div>
        <span className={LABEL}>IMU site</span>
        <div className='no-scrollbar flex min-w-0 items-center gap-x-3 gap-y-2 overflow-x-auto sm:flex-wrap sm:gap-x-5'>
          <div className='flex shrink-0 border border-gray-300 bg-white sm:flex-wrap' role='tablist' aria-label='Synthesized IMU site'>
            {PARTS.map((p) => (
              <button key={p.key} type='button' role='tab' aria-selected={p.key === part} onClick={() => setPart(p.key)} className={seg(p.key === part)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <span className={LABEL}>Side</span>
            <div className='flex border border-gray-300 bg-white' role='tablist' aria-label='Body side'>
              {(['l', 'r'] as const).map((sd) => (
                <button
                  key={sd}
                  type='button'
                  role='tab'
                  aria-selected={side === sd && part !== 'head'}
                  disabled={part === 'head'}
                  onClick={() => setSide(sd)}
                  className={cn(seg(side === sd && part !== 'head'), 'disabled:cursor-default disabled:opacity-40')}
                >
                  {sd === 'l' ? 'Left' : 'Right'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className='grid gap-3 lg:grid-cols-[1fr_1.1fr] lg:gap-6'>
        {/* ---------------- left: robot */}
        <div ref={hostRef} className='relative h-[var(--h-sm)] w-full cursor-grab overflow-hidden active:cursor-grabbing lg:h-[var(--h)]' style={{ '--h': `${height}px`, '--h-sm': '260px' } as React.CSSProperties}>
          <div ref={canvasRef} className='absolute inset-0' />
          {(!clip || !loaded) && (
            <div className='absolute inset-0 flex items-center justify-center text-sm text-gray-400'>
              {error ? 'Preview unavailable' : 'Loading G1…'}
            </div>
          )}
          <div className='pointer-events-none absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2 py-1 font-serif text-[0.85rem] text-gray-600 italic'>
            <svg viewBox='0 0 24 24' className='h-4 w-4' fill='none' stroke='currentColor' strokeWidth='1.7' aria-hidden='true'>
              <path d='M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6' strokeLinecap='round' />
              <path d='M18 3v3.6h-3.6M6 21v-3.6h3.6' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
            Drag to rotate
          </div>
        </div>

        {/* ---------------- right: IMU comparison (same height as the viewer) */}
        <div className='flex flex-col'>
          <div ref={plotsRef} className='flex flex-col justify-between gap-2.5 lg:h-[var(--h)] lg:gap-0' style={{ '--h': `${height}px` } as React.CSSProperties}>
            {plots ? (
              <>
                <div className='grid grid-cols-2 gap-x-3'>
                  <div className='text-[0.8rem] leading-snug md:text-[0.95rem]'>
                    <span className='inline-flex items-center gap-2 font-semibold whitespace-nowrap text-gray-900'>
                      <span className='h-2.5 w-2.5 shrink-0' style={{ background: GOLD }} />
                      Pelvis IMU
                    </span>
                    <span className='block pl-[1.125rem] text-gray-500 italic sm:ml-2 sm:inline sm:pl-0'>measured</span>
                  </div>
                  <div className='text-[0.8rem] leading-snug md:text-[0.95rem]'>
                    <span className='inline-flex items-center gap-2 font-semibold whitespace-nowrap text-gray-900'>
                      <span className='h-2.5 w-2.5 shrink-0' style={{ background: BLUE }} />
                      {site.label} IMU
                    </span>
                    <span className='block pl-[1.125rem] text-gray-500 italic sm:ml-2 sm:inline sm:pl-0'>synthesized</span>
                  </div>
                </div>

                {[
                  { label: 'Angular velocity', unit: 'rad/s', a: plots.pg, b: plots.sg, r: plots.gr },
                  { label: 'Specific force', unit: 'm/s²', a: plots.pa, b: plots.sa, r: plots.ar },
                ].map((row) => (
                  <div key={row.label}>
                    <div className='mb-1 text-[0.8rem] text-gray-600 lg:mb-1.5 lg:text-[0.85rem]'>
                      {row.label} <span className='text-gray-400'>({row.unit})</span>
                    </div>
                    <div className='grid grid-cols-2 gap-x-3'>
                      <Plot series={row.a} T={plots.T} range={row.r} />
                      <Plot series={row.b} T={plots.T} range={row.r} />
                    </div>
                  </div>
                ))}

                <div className='flex items-center gap-4 font-serif text-[0.7rem] text-gray-500'>
                  <span>Sensor axes</span>
                  {['x', 'y', 'z'].map((ax, d) => (
                    <span key={ax} className='inline-flex items-center gap-1.5'>
                      <span className='inline-block h-[2px] w-4' style={{ background: AXIS[d] }} />
                      {ax}
                    </span>
                  ))}
                  
                </div>
              </>
            ) : (
              <div className='flex flex-1 items-center justify-center text-sm text-gray-400'>Computing signals…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

}
