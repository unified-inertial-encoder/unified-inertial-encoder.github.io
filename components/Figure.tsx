import * as React from 'react';

import { asset, cn } from '@/lib/utils';

type FigureProp = {
  img_src: string;
  alt?: string;
  caption: React.ReactNode;
  isDark?: boolean;
  idx?: number;
  className?: string;
  imgClassName?: string;
};

const Figure = ({ img_src, alt = '', caption, isDark = false, idx, className, imgClassName }: FigureProp) => {
  const caption_clr = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <figure className={cn('flex flex-col items-center justify-center', className)}>
      <img
        src={asset(img_src)}
        alt={alt}
        loading='lazy'
        className={cn('w-full h-auto', imgClassName)}
      />
      <figcaption className={cn(caption_clr, 'mt-4 w-full text-center text-[0.95rem] leading-relaxed text-pretty')}>
        {idx !== undefined ? <span className='font-medium'>Figure {idx}. </span> : null}
        {caption}
      </figcaption>
    </figure>
  );
};

export default Figure;
