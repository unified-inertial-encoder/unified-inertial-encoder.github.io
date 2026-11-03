'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/*
 * Two tokenizers on the same motion, re-sampled at different rates / timing patterns.
 *
 * Discrete  = Conv1DTokenizer (paper ablation "w/o continuous enc."): two non-overlapping
 *             5-tap convs fold 25 *samples* into one token, ignoring timestamps.
 * Continuous = ContinuousKernel_Conv1DTokenizer (flagship): ContinuousEncoder with
 *             window_span_ms = 125, micro_split = 4, num_taps = 4. Each level bins samples into
 *             fixed-*time* windows (origin = first sample of the level), pools them with a
 *             triangular basis over the in-window time u in [0, 1) into weight-normalised tap
 *             means (an empty tap pools to 0), then mixes the taps linearly; empty windows drop.
 *
 * Learned weights are replaced by fixed smoothing taps so a single channel can be plotted.
 */

const DURATION = 2.0; // s
const REF_RATE = 240;
const RATES = [100, 120, 200, 240] as const;
const MODES = [
  { key: 'uniform', label: 'Uniform' },
  { key: 'missing', label: 'Missing samples' },
] as const;
type Mode = (typeof MODES)[number]['key'];

const DISC_PATCH = 5; // 5 x 5 = 25 samples / token
const DISC_W = [1, 2, 3, 2, 1].map((v) => v / 9);
const CONT_SPAN = 0.125; // s per token
const CONT_SPLIT = 4; // micro-windows per token
const CONT_W = [1, 2, 2, 1].map((v) => v / 6); // 4 taps

const INK = '#1f2937';
const GOLD = '#c79a35';
const AXIS = '#9e9583';
/** Hover highlight per tokenizer, shared by the input strip and the token plot. */
const HL = { disc: 'rgba(31,41,55,0.16)', cont: 'rgba(199,154,53,0.32)' } as const;
/** Highlighted token per tokenizer; hovering the raw signal sets both at once. */
type Hover = { disc?: number; cont?: number } | null;

const tokenAt = (tok: Tokens, t: number) => {
  const k = tok.t0.findIndex((a, i) => t >= a && t < tok.t1[i]);
  return k < 0 ? undefined : k;
};
const LABEL = 'shrink-0 text-[0.62rem] font-medium tracking-wider text-gray-500 uppercase sm:text-[0.7rem]';

/* ------------------------------------------------------------------ signal + sampling */

function motion(t: number) {
  const w = 2 * Math.PI, f = 1.8; // gait-like: stride fundamental + harmonics
  return (
    Math.sin(w * f * t) +
    0.45 * Math.sin(w * 2 * f * t + 0.8) +
    0.25 * Math.sin(w * 3.5 * f * t + 1.7) +
    0.12 * Math.sin(w * 9.3 * t)
  );
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sampleTimes(rate: number, mode: Mode): number[] {
  const r = rng(rate * 7 + mode.length);
  let t: number[] = [];
  for (let k = 0; k < DURATION * rate - 1e-9; k++) t.push(k / rate);
  if (mode === 'missing') {
    const keep = t.map(() => true);
    const gap = Math.round(rate * 0.06); // four ~60 ms dropouts
    for (let g = 0; g < 4; g++) {
      const s = Math.floor(r() * t.length);
      for (let k = s; k < Math.min(t.length, s + gap); k++) keep[k] = false;
    }
    t = t.filter((_, k) => keep[k]);
  }
  return t;
}

/* ------------------------------------------------------------------ tokenizers */

type Tokens = { y: number[]; t0: number[]; t1: number[] };

/** One ContinuousConv1D level over irregular samples (mirrors _segment_windows + forward). */
function continuousLevel(x: number[], t: number[], span: number, W: number[]) {
  const m = W.length, width = 1 / (m - 1), origin = t[0];
  const out: number[] = [], tm: number[] = [], lo: number[] = [], hi: number[] = [];
  let i = 0;
  while (i < t.length) {
    const bin = Math.floor((t[i] - origin) / span);
    const num = new Array(m).fill(0), den = new Array(m).fill(0);
    let sumT = 0, n = 0;
    while (i < t.length && Math.floor((t[i] - origin) / span) === bin) {
      const ui = ((t[i] - origin) / span - bin) / width;
      const k0 = Math.min(m - 2, Math.max(0, Math.floor(ui)));
      const fr = ui - k0;
      num[k0] += (1 - fr) * x[i]; den[k0] += 1 - fr;
      num[k0 + 1] += fr * x[i]; den[k0 + 1] += fr;
      sumT += t[i]; n++; i++;
    }
    let y = 0;
    for (let k = 0; k < m; k++) y += W[k] * (num[k] / Math.max(den[k], 1e-6));
    out.push(y);
    tm.push(sumT / n);
    lo.push(origin + bin * span);
    hi.push(origin + (bin + 1) * span);
  }
  return { out, tm, lo, hi };
}

function continuousTokens(t: number[]): Tokens {
  const x = t.map(motion);
  const l1 = continuousLevel(x, t, CONT_SPAN / CONT_SPLIT, CONT_W);
  const l2 = continuousLevel(l1.out, l1.tm, CONT_SPAN, CONT_W);
  return { y: l2.out, t0: l2.lo, t1: l2.hi };
}

/** Conv1DTokenizer: kernel == stride == 5, twice; zero-pads the tail to whole patches. */
function discreteTokens(t: number[]): Tokens {
  const n = Math.ceil(t.length / 25) * 25;
  const x = Array.from({ length: n }, (_, k) => (k < t.length ? motion(t[k]) : 0));
  const fold = (v: number[]) => {
    const o: number[] = [];
    for (let k = 0; k < v.length; k += DISC_PATCH) {
      let s = 0;
      for (let j = 0; j < DISC_PATCH; j++) s += DISC_W[j] * (v[k + j] ?? 0);
      o.push(s);
    }
    return o;
  };
  const y = fold(fold(x));
  const last = t[t.length - 1];
  return {
    y,
    t0: y.map((_, k) => t[k * 25] ?? last),
    t1: y.map((_, k) => t[Math.min(t.length - 1, k * 25 + 24)] ?? last),
  };
}

/** Mean |a-b| / mean |ref| over the token indices both sequences share. */
function deviation(cur: number[], ref: number[]) {
  const n = Math.min(cur.length, ref.length);
  let e = 0, s = 0;
  for (let k = 0; k < n; k++) e += Math.abs(cur[k] - ref[k]);
  for (const v of ref) s += Math.abs(v);
  return n ? (e / n) / (s / ref.length || 1) : 0;
}

/* ------------------------------------------------------------------ plots */

const W = 600;
/** Fixed precision so server- and client-rendered SVG attributes match exactly. */
const q = (v: number) => Math.round(v * 100) / 100;

function InputPlot({
  samples,
  disc,
  cont,
  hover,
  onHover,
}: {
  samples: number[];
  disc: Tokens;
  cont: Tokens;
  hover: Hover;
  onHover: (h: Hover) => void;
}) {
  const H = 150, X = (t: number) => (t / DURATION) * W, Y = (v: number) => H / 2 - v * (H / 4.4);
  const curve = Array.from({ length: 401 }, (_, i) => {
    const t = (i / 400) * DURATION;
    return `${X(t).toFixed(1)},${Y(motion(t)).toFixed(1)}`;
  }).join(' ');
  const strip = (tok: Tokens, kind: 'disc' | 'cont', y: number) =>
    tok.t0.map((a, k) => {
      const on = hover?.[kind] === k;
      return (
        <rect
          key={k}
          x={q(X(a))}
          y={y}
          width={q(Math.max(1, X(tok.t1[k]) - X(a)))}
          height={12}
          fill={on ? HL[kind] : 'transparent'}
          stroke={AXIS}
          strokeWidth={0.6}
          vectorEffect='non-scaling-stroke'
          className='cursor-pointer'
          onMouseEnter={() => onHover({ [kind]: k })}
          onClick={() => onHover({ [kind]: k })}
        />
      );
    });
  const band = (tok: Tokens, kind: 'disc' | 'cont') => {
    const k = hover?.[kind];
    if (k === undefined || k >= tok.t0.length) return null;
    return <rect x={q(X(tok.t0[k]))} y={0} width={q(Math.max(1, X(tok.t1[k]) - X(tok.t0[k])))} height={H} fill={HL[kind]} />;
  };
  // pointer over the raw signal -> the token of each tokenizer containing that instant
  const onRaw = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const t = ((e.clientX - box.left) / box.width) * DURATION;
    onHover({ disc: tokenAt(disc, t), cont: tokenAt(cont, t) });
  };
  return (
    <svg viewBox={`0 0 ${W} ${H + 44}`} className='block w-full' preserveAspectRatio='none' style={{ height: 'auto' }} onMouseLeave={() => onHover(null)}>
      {band(disc, 'disc')}
      {band(cont, 'cont')}
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke={AXIS} />
      <line x1={0.5} x2={0.5} y1={0} y2={H} stroke={AXIS} />
      <polyline points={curve} fill='none' stroke='#b9b2a3' strokeWidth={1.5} />
      {samples.map((t, k) => (
        <circle key={k} cx={q(X(t))} cy={q(Y(motion(t)))} r={1.9} fill={INK} />
      ))}
      <rect x={0} y={0} width={W} height={H} fill='transparent' className='cursor-crosshair' onMouseMove={onRaw} onClick={onRaw} />
      {strip(disc, 'disc', H + 8)}
      {strip(cont, 'cont', H + 28)}
    </svg>
  );
}

function TokenPlot({
  cur,
  base,
  color,
  range,
  maxTokens,
  kind,
  active,
  onHover,
}: {
  cur: Tokens;
  base: Tokens;
  color: string;
  range: number;
  maxTokens: number;
  kind: 'disc' | 'cont';
  active: number | null;
  onHover: (k: number | null) => void;
}) {
  const H = 110, step = W / maxTokens, Y = (v: number) => H / 2 - (v / range) * (H / 2 - 6);
  const stairs = (y: number[]) =>
    y.map((v, k) => `${(k * step).toFixed(1)},${Y(v).toFixed(1)} ${((k + 1) * step).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className='block w-full' style={{ height: 'auto' }} onMouseLeave={() => onHover(null)}>
      {active !== null && active < cur.y.length && (
        <rect x={q(active * step)} y={0} width={q(step)} height={H} fill={HL[kind]} />
      )}
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke={AXIS} />
      <line x1={0.5} x2={0.5} y1={0} y2={H} stroke={AXIS} />
      <polyline points={stairs(base.y)} fill='none' stroke='#8c857a' strokeWidth={1.5} strokeDasharray='5 4' />
      <polyline points={stairs(cur.y)} fill='none' stroke={color} strokeWidth={2.2} />
      {cur.y.map((_, k) => (
        <rect key={k} x={q(k * step)} y={0} width={q(step)} height={H} fill='transparent' onMouseEnter={() => onHover(k)} onClick={() => onHover(k)} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ component */

export default function ContinuousTimeDemo() {
  const [rate, setRate] = React.useState<number>(120);
  const [mode, setMode] = React.useState<Mode>('uniform');
  const [hover, setHover] = React.useState<Hover>(null);

  const data = React.useMemo(() => {
    const refT = sampleTimes(REF_RATE, 'uniform');
    const t = sampleTimes(rate, mode);
    const refD = discreteTokens(refT), refC = continuousTokens(refT);
    const d = discreteTokens(t), c = continuousTokens(t);
    const range = Math.max(...[...refD.y, ...d.y, ...refC.y, ...c.y].map(Math.abs)) * 1.1 || 1;
    return {
      t, d, c, refD, refC, range,
      maxTokens: Math.max(refD.y.length, d.y.length, refC.y.length, c.y.length),
      devD: deviation(d.y, refD.y), devC: deviation(c.y, refC.y),
    };
  }, [rate, mode]);

  const seg = (on: boolean) =>
    cn('px-2.5 py-1 whitespace-nowrap transition-colors sm:px-3 sm:py-1.5', on ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900');

  const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

  const header = (name: string, sub: string, n: number, dev: number, color: string) => (
    <div className='mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[0.8rem] md:text-[0.9rem]'>
      <div>
        <span className='inline-flex items-center gap-2 font-semibold whitespace-nowrap text-gray-900'>
          <span className='h-2.5 w-2.5 shrink-0' style={{ background: color }} />
          {name}
        </span>
        <span className='ml-2 text-gray-500 italic'>{sub}</span>
      </div>
      <div className='text-gray-600 tabular-nums'>
        {n} tokens · <span className={cn(dev > 0.3 ? 'text-red-700' : 'text-gray-900', 'font-semibold')}>{pct(dev)}</span>{' '}
        <span className='text-gray-500'>off reference</span>
      </div>
    </div>
  );

  return (
    <div className='bg-paper p-3 font-serif md:p-6'>
      {/* toolbar: stacked on narrow screens, one row on wide ones */}
      <div className='mb-4 flex flex-col gap-2 text-[0.75rem] sm:text-[0.8rem] lg:flex-row lg:items-center lg:gap-10'>
        <div className='flex min-w-0 items-center gap-2 sm:gap-3'>
          <span className={cn(LABEL, 'w-[3.9rem] sm:w-[5.5rem] lg:w-auto')}>Rate</span>
          <div className='flex border border-gray-300 bg-white' role='tablist' aria-label='Sample rate'>
            {RATES.map((r) => (
              <button key={r} type='button' role='tab' aria-selected={r === rate} onClick={() => setRate(r)} className={seg(r === rate)}>
                {r} Hz
              </button>
            ))}
          </div>
        </div>
        <div className='flex min-w-0 items-center gap-2 sm:gap-3'>
          <span className={cn(LABEL, 'w-[3.9rem] sm:w-[5.5rem] lg:w-auto')}>Timing</span>
          <div className='flex border border-gray-300 bg-white' role='tablist' aria-label='Sample timing'>
            {MODES.map((m) => (
              <button key={m.key} type='button' role='tab' aria-selected={m.key === mode} onClick={() => setMode(m.key)} className={seg(m.key === mode)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        {/* input */}
        <div>
          <div className='mb-1.5 text-[0.8rem] md:text-[0.9rem]'>
            <span className='font-semibold text-gray-900'>Same motion, {data.t.length} samples</span>
            <span className='ml-2 text-gray-500 italic'>
              {rate} Hz · {MODES.find((m) => m.key === mode)!.label.toLowerCase()}
            </span>
          </div>
          <InputPlot samples={data.t} disc={data.d} cont={data.c} hover={hover} onHover={setHover} />
          <div className='mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.75rem] text-gray-600'>
            <span className='inline-flex items-center gap-1.5'>
              <span className='inline-block h-2 w-3 bg-gray-800/60' /> Discrete
            </span>
            <span className='text-gray-500'>25 samples per token: span changes with the rate</span>
            <span className='inline-flex items-center gap-1.5'>
              <span className='inline-block h-2 w-3' style={{ background: GOLD }} /> Continuous
            </span>
            <span className='text-gray-500'>125 ms per token, placed by timestamp</span>
          </div>
        </div>

        {/* outputs */}
        <div className='flex flex-col gap-4'>
          <div>
            {header('Discrete CNN', 'fixed sample count', data.d.y.length, data.devD, INK)}
            <TokenPlot
              cur={data.d}
              base={data.refD}
              color={INK}
              range={data.range}
              maxTokens={data.maxTokens}
              kind='disc'
              active={hover?.disc ?? null}
              onHover={(k) => setHover(k === null ? null : { disc: k })}
            />
          </div>
          <div>
            {header('Continuous encoder', 'fixed time span', data.c.y.length, data.devC, GOLD)}
            <TokenPlot
              cur={data.c}
              base={data.refC}
              color={GOLD}
              range={data.range}
              maxTokens={data.maxTokens}
              kind='cont'
              active={hover?.cont ?? null}
              onHover={(k) => setHover(k === null ? null : { cont: k })}
            />
          </div>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-gray-500'>
            <span>Token output by index</span>
            <span className='inline-flex items-center gap-1.5'>
              <svg width='18' height='4' aria-hidden='true'><line x1='0' x2='18' y1='2' y2='2' stroke='#8c857a' strokeWidth='1.5' strokeDasharray='5 4' /></svg>
              reference · 240 Hz uniform
            </span>
            <span><span className='hidden sm:inline'>hover</span><span className='sm:hidden'>tap</span> the signal or a token to link input and output</span>
          </div>
        </div>
      </div>
    </div>
  );
}
