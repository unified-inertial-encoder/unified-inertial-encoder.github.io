'use client';

import * as React from 'react';

import { asset } from '@/lib/utils';

type Fit = { A: number; B: number; E: number; alpha: number; beta: number };
type Pt = { run: string; label: string; N: number; D: number; step: number; epoch: number; C: number; loss: number; pred: number };
type Data = { fit: Fit; series: { N: number; color: string; label: string }[]; points: Pt[] };

const INK = '#444444';
const FIT_INK = '#7e858b';
const law = (f: Fit, n: number, d: number) => f.E + f.A / Math.pow(n, f.alpha) + f.B / Math.pow(d, f.beta);
const fmtSI = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v.toFixed(0));
const fmtC = (c: number) => { const e = Math.floor(Math.log10(c)); const sup = String(e).split('').map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]).join(''); return `${(c / 10 ** e).toFixed(2)} × 10${sup}`; };

export default function ScalingExplorer({ height: fixedHeight }: { height?: number } = {}) {
  const [data, setData] = React.useState<Data | null>(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    fetch(asset('/scaling/points.json')).then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const height = fixedHeight ?? Math.max(300, Math.round(Math.min(width, 900) * 0.58));
  const m = React.useMemo(() => ({ l: 54, r: 46, t: 16, b: 44 }), []);
  const geo = React.useMemo(() => {
    if (!data || !width) return null;
    const cs = data.points.map((p) => p.C), ls = data.points.map((p) => p.loss);
    const cx0 = Math.log10(Math.min(...cs)) - 0.15, cx1 = Math.log10(Math.max(...cs)) + 0.15;
    const ly0 = Math.log10(Math.min(...ls)) - 0.04, ly1 = Math.log10(Math.max(...ls)) + 0.04;
    const sx = (c: number) => m.l + ((Math.log10(c) - cx0) / (cx1 - cx0)) * (width - m.l - m.r);
    const sy = (l: number) => m.t + (1 - (Math.log10(l) - ly0) / (ly1 - ly0)) * (height - m.t - m.b);
    // seed-averaged curve per model size (as in the paper), keyed by D
    const curves = data.series.map((s) => {
      const byD = new Map<number, number[]>();
      data.points.filter((p) => p.N === s.N).forEach((p) => byD.set(p.D, [...(byD.get(p.D) ?? []), p.loss]));
      const pts = [...byD.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [6 * s.N * d, v.reduce((a, b) => a + b, 0) / v.length] as [number, number]);
      const dMin = Math.min(...[...byD.keys()]), dMax = Math.max(...[...byD.keys()]);
      const pred: [number, number][] = [];
      for (let k = 0; k <= 40; k++) { const d = dMin * Math.pow(dMax / dMin, k / 40); pred.push([6 * s.N * d, law(data.fit, s.N, d)]); }
      return { ...s, pts, pred, first: pts[0] };
    });
    // fitted compute-optimal frontier
    const f = data.fit, ex = f.beta / (f.alpha + f.beta), fac = Math.pow((f.alpha * f.A) / (f.beta * f.B), 1 / (f.alpha + f.beta));
    const frontier: [number, number][] = [];
    for (let k = 0; k <= 60; k++) {
      const c = Math.pow(10, cx0 + ((cx1 - cx0) * k) / 60), n = fac * Math.pow(c / 6, ex);
      frontier.push([c, law(f, n, c / (6 * n))]);
    }
    const xt: number[] = []; for (let e = Math.ceil(cx0); e <= Math.floor(cx1); e++) xt.push(10 ** e);
    const yt = [0.03, 0.04, 0.05, 0.07, 0.1].filter((v) => Math.log10(v) > ly0 && Math.log10(v) < ly1);
    return { sx, sy, curves, frontier, xt, yt, cx0, cx1 };
  }, [data, width, height, m]);

  const nearest = (x: number, y: number) => {
    if (!data || !geo) return null;
    let best = -1, bd = 100;
    data.points.forEach((p, i) => { const dx = geo.sx(p.C) - x, dy = geo.sy(p.loss) - y; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
    return best >= 0 ? best : null;
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(nearest(e.clientX - r.left, e.clientY - r.top));
  };

  const hp = hover !== null && data ? data.points[hover] : null;
  const tip = hp && geo ? (() => {
    const x = geo.sx(hp.C), y = geo.sy(hp.loss), W = 250, H = 118;
    const left = x + 14 + W > width ? x - 14 - W : x + 14;
    const top = Math.min(Math.max(y - H / 2, 0), height - H);
    return { left, top, width: W };
  })() : null;

  return (
    <div ref={wrapRef} className='relative w-full select-none'>
      {!data || !geo ? (
        <div style={{ height }} className='flex items-center justify-center text-sm text-gray-400'>Loading scaling data…</div>
      ) : (
        <svg width={width} height={height} className='block' onPointerMove={onMove} onPointerLeave={() => setHover(null)} role='img' aria-label='Velocity error versus compute for seven model sizes'>
          {/* axes + grid */}
          {geo.xt.map((v) => (
            <g key={`x${v}`}>
              <line x1={geo.sx(v)} x2={geo.sx(v)} y1={m.t} y2={height - m.b} stroke='#ececec' />
              <text x={geo.sx(v)} y={height - m.b + 16} textAnchor='middle' fontSize={11} fill={INK}>10<tspan baselineShift='super' fontSize={8}>{Math.round(Math.log10(v))}</tspan></text>
            </g>
          ))}
          {geo.yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={m.l} x2={width - m.r} y1={geo.sy(v)} y2={geo.sy(v)} stroke='#ececec' />
              <text x={m.l - 8} y={geo.sy(v) + 4} textAnchor='end' fontSize={11} fill={INK}>{v.toFixed(2)}</text>
            </g>
          ))}
          <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke='#b8bfc4' />
          <line x1={m.l} x2={m.l} y1={m.t} y2={height - m.b} stroke='#b8bfc4' />
          <text x={(m.l + width - m.r) / 2} y={height - 8} textAnchor='middle' fontSize={12} fill={INK}>Training compute (FLOPs)</text>
          <text transform={`translate(14,${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor='middle' fontSize={12} fill={INK}>Velocity error (m/s)</text>

          {/* fitted compute-optimal frontier */}
          <path d={geo.frontier.map(([c, l], i) => `${i ? 'L' : 'M'}${geo.sx(c).toFixed(1)},${geo.sy(l).toFixed(1)}`).join('')} fill='none' stroke={FIT_INK} strokeWidth={1} strokeDasharray='5 4' />
          <text x={geo.sx(geo.frontier[14][0])} y={geo.sy(geo.frontier[14][1]) + 26} fontSize={11} fill={FIT_INK}>Fitted minimum</text>

          {/* per-size: law prediction (dotted), seed-averaged measurement (solid), checkpoints (dots) */}
          {geo.curves.map((s) => (
            <g key={s.N}>
              <path d={s.pred.map(([c, l], i) => `${i ? 'L' : 'M'}${geo.sx(c).toFixed(1)},${geo.sy(l).toFixed(1)}`).join('')} fill='none' stroke={s.color} strokeWidth={1} strokeDasharray='1.5 3' opacity={0.9} />
              <path d={s.pts.map(([c, l], i) => `${i ? 'L' : 'M'}${geo.sx(c).toFixed(1)},${geo.sy(l).toFixed(1)}`).join('')} fill='none' stroke={s.color} strokeWidth={1.8} />
              <text x={geo.sx(s.first[0]) + 5} y={geo.sy(s.first[1]) - 9} fontSize={11} fill={s.color} style={{ filter: 'brightness(0.7)' }}>{s.label}</text>
            </g>
          ))}
          {data.points.map((p, i) => {
            const s = data.series.find((q) => q.N === p.N)!;
            const active = i === hover;
            return <circle key={i} cx={geo.sx(p.C)} cy={geo.sy(p.loss)} r={active ? 5 : 2.6} fill={s.color} stroke={active ? INK : 'white'} strokeWidth={active ? 1.2 : 0.6} />;
          })}
          {hp && geo && <circle cx={geo.sx(hp.C)} cy={geo.sy(hp.pred)} r={4} fill='none' stroke={INK} strokeWidth={1} strokeDasharray='2 2' />}
        </svg>
      )}
      {hp && tip && (
        <div className='pointer-events-none absolute z-20 border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs text-gray-600' style={tip}>
          <div className='font-medium text-gray-800'>{hp.label}</div>
          <div className='text-[0.68rem] text-gray-500'>step {hp.step.toLocaleString()} · epoch {hp.epoch + 1} · N {fmtSI(hp.N)} · D {fmtSI(hp.D)} tokens · {fmtC(hp.C)} FLOPs</div>
          <table className='mt-1 tabular-nums'>
            <tbody>
              <tr><td className='pr-3'>Measured error</td><td className='text-right font-medium text-gray-800'>{hp.loss.toFixed(4)} m/s</td></tr>
              <tr><td className='pr-3'>Scaling-law prediction</td><td className='text-right'>{hp.pred.toFixed(4)} m/s</td></tr>
              <tr><td className='pr-3'>Residual</td><td className='text-right'>{((hp.loss / hp.pred - 1) * 100).toFixed(1)} %</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
