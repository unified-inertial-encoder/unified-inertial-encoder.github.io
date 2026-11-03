'use client';

import * as React from 'react';

import { asset, cn } from '@/lib/utils';

type VideoCardProps = {
  src: string;
  poster: string;
  title: string;
  className?: string;
};

/** Poster with a play button; swaps to a playing <video> on click. */
export default function VideoCard({ src, poster, title, className }: VideoCardProps) {
  const [playing, setPlaying] = React.useState(false);

  if (playing) {
    return (
      <video autoPlay controls playsInline className={cn('w-full bg-black', className)}>
        <source src={asset(src)} type='video/mp4' />
        Your browser does not support the video tag.
      </video>
    );
  }

  return (
    <button
      type='button'
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      className={cn(
        'group relative block w-full overflow-hidden bg-white ring-1 ring-gray-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        className
      )}
    >
      <img src={asset(poster)} alt='' className='block w-full h-auto' loading='lazy' />
      <span className='absolute inset-0 flex items-center justify-center'>
        <span className='flex h-16 w-16 items-center justify-center bg-white/95 text-gray-900 shadow-lg ring-1 ring-black/5 backdrop-blur group-hover:bg-gold'>
          <svg viewBox='0 0 24 24' className='h-9 w-9' fill='currentColor' aria-hidden='true'>
            <path d='M8 5v14l11-7z' />
          </svg>
        </span>
      </span>
    </button>
  );
}
