'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Full-bleed, horizontally scrollable row of cards that snap to centre and open on the middle card.
 * `stackBelow` stacks the cards vertically on narrow screens instead of scrolling sideways.
 */
export default function CardRow({
  children,
  label,
  fade = 'from-paper',
  stackBelow,
}: {
  children: React.ReactNode;
  label: string;
  /** Tailwind gradient-start class matching the section background */
  fade?: string;
  stackBelow?: 'md' | 'lg';
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const centre = () => {
      const mid = row.children[Math.floor(row.children.length / 2)] as HTMLElement | undefined;
      if (!mid || row.scrollWidth <= row.clientWidth) return;
      row.scrollLeft = mid.offsetLeft - (row.clientWidth - mid.clientWidth) / 2;
    };
    centre();
  }, []);

  const scroll =
    'flex overflow-x-auto snap-x snap-mandatory scroll-smooth gap-3 px-6 md:px-48 pb-3 scrollbar-light';
  const stacked = {
    md: 'layout flex flex-col gap-4 md:w-auto md:max-w-none md:flex-row md:gap-3 md:px-48 md:pb-3 md:overflow-x-auto md:snap-x md:snap-mandatory md:scroll-smooth scrollbar-light',
    lg: 'layout flex flex-col gap-4 lg:w-auto lg:max-w-none lg:flex-row lg:gap-3 lg:px-48 lg:pb-3 lg:overflow-x-auto lg:snap-x lg:snap-mandatory lg:scroll-smooth scrollbar-light',
  };
  const fadeVis = stackBelow ? (stackBelow === 'md' ? 'hidden md:block' : 'hidden lg:block') : '';

  return (
    <div className='relative'>
      <div ref={ref} className={stackBelow ? stacked[stackBelow] : scroll} aria-label={label}>
        {children}
      </div>
      <div className={cn('pointer-events-none absolute inset-y-0 left-0 w-10 bg-linear-to-r to-transparent', fade, fadeVis)} />
      <div className={cn('pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l to-transparent', fade, fadeVis)} />
    </div>
  );
}

/** Card shell shared by the rows: same width steps and padding as the video cards. */
export function RowCard({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <article className={cn('w-[85%] flex-none snap-center bg-white p-2.5 md:w-[70%] md:p-3 lg:w-[55%]', className)}>
      <h3 className='mb-2 px-1 text-[1.4rem] md:text-[1.7rem]'>{title}</h3>
      {children}
    </article>
  );
}
