'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';

import { asset } from '@/lib/utils';

import type { TsneIndex } from './types';

const MotionPreview = dynamic(() => import('./MotionPreview'), { ssr: false });

const FILL: Record<string, string> = { Human: '#94b6d2', Humanoid: '#d8b35c' };
const HEADER_INK: Record<string, string> = { Human: '#4f759a', Humanoid: '#96762e' };
const HOVER_DELAY_MS = 1000;
const HIT_RADIUS_PX = 8;
const POPUP_W = 400;
const POPUP_H = 300;

function markerPath(marker: string, cx: number, cy: number, s: number): string {
  switch (marker) {
    case 's':
      return `M${cx - s},${cy - s}h${2 * s}v${2 * s}h${-2 * s}Z`;
    case '^':
      return `M${cx},${cy - 1.25 * s}L${cx + 1.2 * s},${cy + 0.9 * s}L${cx - 1.2 * s},${cy + 0.9 * s}Z`;
    case 'v':
      return `M${cx},${cy + 1.25 * s}L${cx + 1.2 * s},${cy - 0.9 * s}L${cx - 1.2 * s},${cy - 0.9 * s}Z`;
    case 'D':
      return `M${cx},${cy - 1.3 * s}L${cx + 1.05 * s},${cy}L${cx},${cy + 1.3 * s}L${cx - 1.05 * s},${cy}Z`;
    default:
      return `M${cx - s},${cy}a${s},${s} 0 1,0 ${2 * s},0a${s},${s} 0 1,0 ${-2 * s},0`;
  }
}

type Popup = { idx: number; x: number; y: number };

export default function TsneExplorer({ base = '/tsne' }: { base?: string }) {
  const [data, setData] = React.useState<TsneIndex | null>(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [popup, setPopup] = React.useState<Popup | null>(null);
  const [layoutKey, setLayoutKey] = React.useState<string | null>(null);
  const [anim, setAnim] = React.useState<{ from: string; to: string; t: number } | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const timer = React.useRef<number | null>(null);
  const last = React.useRef<{ x: number; y: number; idx: number | null }>({ x: 0, y: 0, idx: null });

  React.useEffect(() => {
    fetch(asset(`${base}/index.json`))
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [base]);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const height = Math.max(240, Math.round(width / 2.1));
  const current = layoutKey ?? data?.layouts.find((item) => item.key === 'cls')?.key ?? data?.layouts[0].key ?? '';
  // one pixel mapping per layout (each has its own extent), plus the interpolated point positions
  const maps = React.useMemo(() => {
    if (!data || !width) return null;
    const out: Record<string, { sx: (x: number) => number; sy: (y: number) => number; px: [number, number][] }> = {};
    for (const L of data.layouts) {
      const xs = L.xy.map((p) => p[0]), ys = L.xy.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const mx = 0.02 * (x1 - x0), my = 0.05 * (y1 - y0);
      const sx = (x: number) => ((x - x0 + mx) / (x1 - x0 + 2 * mx)) * width;
      const sy = (y: number) => height - ((y - y0 + my) / (y1 - y0 + 2 * my)) * height;
      out[L.key] = { sx, sy, px: L.xy.map((p) => [sx(p[0]), sy(p[1])] as [number, number]) };
    }
    return out;
  }, [data, width, height]);
  const layout = React.useMemo(() => {
    if (!maps || !current) return null;
    const cur = maps[current];
    if (!cur) return null;
    if (!anim) return cur;
    const a = maps[anim.from], b = maps[anim.to];
    const e = anim.t < 0.5 ? 4 * anim.t ** 3 : 1 - (-2 * anim.t + 2) ** 3 / 2; // ease in-out cubic
    return { ...cur, px: a.px.map(([x, y], i) => [x + (b.px[i][0] - x) * e, y + (b.px[i][1] - y) * e] as [number, number]) };
  }, [maps, current, anim]);

  const [pending, setPending] = React.useState<{ from: string; to: string } | null>(null);
  const switchLayout = (key: string) => {
    if (!data || key === current || anim || pending) return;
    clearTimer();
    setPopup(null);
    setHover(null);
    // seed the animation here (event handler) rather than inside the effect,
    // so the effect only schedules frames and never calls setState synchronously
    setAnim({ from: current, to: key, t: 0 });
    setPending({ from: current, to: key });
    setLayoutKey(key);
  };
  React.useEffect(() => {
    if (!pending) return;
    const { from, to } = pending;
    const start = performance.now(), dur = 1100;
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      setAnim(t < 1 ? { from, to, t } : null);
      if (t < 1) raf = requestAnimationFrame(step);
      else setPending(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pending]);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const nearest = (x: number, y: number): number | null => {
    if (!layout) return null;
    let best = -1, bd = HIT_RADIUS_PX * HIT_RADIUS_PX;
    for (let i = 0; i < layout.px.length; i++) {
      const dx = layout.px[i][0] - x, dy = layout.px[i][1] - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best >= 0 ? best : null;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (anim) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const idx = nearest(x, y);
    const moved = Math.hypot(x - last.current.x, y - last.current.y) > 2;
    if (idx !== hover) setHover(idx);
    if (popup && idx === popup.idx) {
      clearTimer();
      return; // still resting on the open point
    }
    if (moved || idx !== last.current.idx) {
      clearTimer();
      last.current = { x, y, idx };
      if (idx !== null) {
        timer.current = window.setTimeout(() => setPopup({ idx, x, y }), HOVER_DELAY_MS);
      } else if (popup) {
        // left the point: close after a short grace period so jitter does not flicker it
        timer.current = window.setTimeout(() => setPopup(null), 250);
      }
    }
  };
  const onLeave = () => {
    clearTimer();
    setHover(null);
    setPopup(null);
  };
  const onClick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const idx = nearest(x, y);
    clearTimer();
    setPopup(idx === null ? null : { idx, x, y });
  };

  const popupStyle = React.useMemo(() => {
    if (!popup) return undefined;
    const left = popup.x + 18 + POPUP_W > width ? popup.x - 18 - POPUP_W : popup.x + 18;
    const top = Math.min(Math.max(popup.y - POPUP_H / 2, 0), Math.max(height - POPUP_H, 0));
    return { left: Math.max(0, left), top, width: POPUP_W } as React.CSSProperties;
  }, [popup, width, height]);

  return (
    <div ref={wrapRef} className='relative w-full select-none'>
      {data && (
        <div className='mb-3 flex items-center gap-2 text-sm' role='tablist' aria-label='Embedding layout'>
          {data.layouts.map((L) => (
            <button
              key={L.key}
              type='button'
              role='tab'
              aria-selected={L.key === current}
              onClick={() => switchLayout(L.key)}
              className={
                L.key === current
                  ? ' border border-gray-900 bg-gray-900 px-3.5 py-1 text-white'
                  : ' border border-gray-300 bg-white px-3.5 py-1 text-gray-600 transition hover:border-gray-500'
              }
            >
              {L.label}
            </button>
          ))}
          <span className='ml-2 text-xs text-gray-500'>
            {current === 'lang' ? 't-SNE of the language-head output (CLIP space)' : 't-SNE of the trunk [CLS] feature'}
          </span>
        </div>
      )}
      {!data || !layout ? (
        <div style={{ height }} className='flex items-center justify-center text-sm text-gray-400'>
          Loading embedding…
        </div>
      ) : (
        <svg
          width={width}
          height={height}
          className='block touch-none'
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          onPointerDown={onClick}
          role='img'
          aria-label='t-SNE of human and humanoid CLS embeddings'
        >
          {data.layouts.map((L) => {
            const mp = maps?.[L.key];
            const op = !anim ? (L.key === current ? 1 : 0) : L.key === anim.to ? anim.t : L.key === anim.from ? 1 - anim.t : 0;
            if (!mp || op <= 0) return null;
            return (
              <g key={`r-${L.key}`} opacity={op}>
                {L.regions.map((r, i) => (
                  <path
                    key={i}
                    d={r.poly.map(([x, y], j) => `${j ? 'L' : 'M'}${mp.sx(x).toFixed(1)},${mp.sy(y).toFixed(1)}`).join('') + 'Z'}
                    fill='rgba(0,0,0,0.05)'
                    stroke='#6e6e6e'
                    strokeWidth={0.9}
                    strokeDasharray='4 2.6'
                  />
                ))}
              </g>
            );
          })}
          {data.points.map((p, i) => {
            const ds = data.datasets[p[2]];
            const [cx, cy] = layout.px[i];
            const active = i === hover || i === popup?.idx;
            return (
              <path
                key={i}
                d={markerPath(ds.marker, cx, cy, active ? 5 : 3.4)}
                fill={FILL[ds.embodiment]}
                fillOpacity={active ? 1 : 0.85}
                stroke={active ? '#444444' : 'none'}
                strokeWidth={1}
              />
            );
          })}
          {data.layouts.map((L) => {
            const mp = maps?.[L.key];
            const op = !anim ? (L.key === current ? 1 : 0) : L.key === anim.to ? anim.t : L.key === anim.from ? 1 - anim.t : 0;
            if (!mp || op <= 0) return null;
            return (
              <g key={`t-${L.key}`} opacity={op}>
                {L.regions.map((r, i) => (
                  <g key={i}>
                    <rect x={mp.sx(r.cx) - r.label.length * 3.7 - 5} y={mp.sy(r.cy) - 10} width={r.label.length * 7.4 + 10} height={20} fill='white' fillOpacity={0.8} />
                    <text x={mp.sx(r.cx)} y={mp.sy(r.cy)} textAnchor='middle' dominantBaseline='middle' fontSize={13} fontStyle='italic' fill='#444444'>
                      {r.label}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      )}

      {data && (
        <div className='mt-3 flex flex-wrap justify-between gap-x-8 gap-y-2 text-sm text-gray-600'>
          {(['Human', 'Humanoid'] as const).map((emb) => (
            <div key={emb} className='flex flex-wrap items-center gap-x-5 gap-y-1'>
              <span className='font-medium' style={{ color: HEADER_INK[emb], fontVariant: 'small-caps' }}>
                {emb === 'Human' ? 'Human' : 'Humanoid (G1)'}
              </span>
              {data.datasets
                .filter((d) => d.embodiment === emb)
                .map((d) => (
                  <span key={`${emb}-${d.label}`} className='inline-flex items-center gap-1.5'>
                    <svg width={12} height={12} aria-hidden='true'>
                      <path d={markerPath(d.marker, 6, 6, 4)} fill={FILL[d.embodiment]} />
                    </svg>
                    {d.label}
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}

      {data && popup && (
        <div className='pointer-events-none absolute z-20 overflow-hidden border border-gray-200 bg-white shadow-lg' style={popupStyle}>
          <MotionPreview
            key={popup.idx}
            url={asset(`${base}/w/${popup.idx}.bin`)}
            g1Base={asset(base)}
            kind={data.kind[popup.idx]}
            nFrames={data.frames[popup.idx]}
            meta={data}
            width={POPUP_W - 2}
            height={POPUP_H - 42}
          />
          <div className='flex items-baseline justify-between gap-3 px-3 py-2 text-xs text-gray-500'>
            <span className='font-medium text-gray-700'>{data.datasets[data.points[popup.idx][2]].label}</span>
            <span className='truncate font-mono text-[0.65rem]'>{data.stems[popup.idx]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
