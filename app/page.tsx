'use client';

import clsx from 'clsx';
import React, { useState } from 'react';

import KatexSpan from '@/components/KaTeX';
import Figure from '@/components/Figure';
import ContinuousTimeDemo from '@/components/ContinuousTimeDemo';
import ImuInterfaceDemo from '@/components/ImuInterfaceDemo';
import { AblationTable, LanguageTable, OdometryTable } from '@/components/ResultsTables';
import CardRow, { RowCard } from '@/components/CardRow';
import VideoCard from '@/components/VideoCard';
import VideoCarousel from '@/components/VideoCarousel';
import ScalingExplorer from '@/components/ScalingExplorer';
import ScalingSurface from '@/components/ScalingSurface';
import TsneExplorer from '@/components/tsne/TsneExplorer';
import { authors, siteConfig } from '@/constant/config';
import { asset, cn } from '@/lib/utils';

const PAPER_PDF = '/paper/unified-inertial-encoder.pdf';

export default function HomePage() {
  const sliderItems: { title: string; src: string; poster: string }[] = [
    { title: 'Motivation', src: '/video/segment1-motivation.mp4', poster: '/images/posters/motivation.jpg' },
    { title: 'Method', src: '/video/segment2-method.mp4', poster: '/images/posters/method.jpg' },
    { title: 'Results', src: '/video/segment3-results.mp4', poster: '/images/posters/results.jpg' },
  ];


  return (
    <main>
      {/* ---------------------------------------------------------------- Hero */}
      <section id='top' className='relative flex min-h-svh items-center justify-center overflow-hidden'>
        <video autoPlay loop muted playsInline className='absolute inset-0 z-0 h-full w-full object-cover object-center'>
          <source src={asset('/video/hero.mp4')} type='video/mp4' />
        </video>
        <div
          className='absolute inset-0 z-10'
          aria-hidden='true'
          style={{
            background:
              'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 70%, rgba(255,255,255,0.1) 100%)',
          }}
        />

        <div className='layout relative z-20 flex min-h-svh flex-col items-center justify-center px-4 py-24 text-center'>
          <h1 className='max-w-5xl text-[2.3rem] leading-[1.1] font-semibold tracking-[-0.015em] text-gray-900 md:text-[3.9rem]'>
            A{' '}
            <span
              className='bg-clip-text text-transparent'
              style={{ backgroundImage: 'linear-gradient(90deg, #4f78a8 0%, #7f8ea0 50%, #b8902f 100%)' }}
            >
              Unified Inertial Encoder
            </span>{' '}
            for Human and Humanoid Motion
          </h1>
          <div className='mt-8 flex max-w-4xl flex-wrap justify-center gap-x-5 gap-y-1.5 text-[1.05rem] text-gray-900 md:text-[1.25rem]'>
            {authors.map((author) => (
              <span key={author.name}>
                {author.url ? (
                  <a
                    href={author.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='underline decoration-gray-400/70 decoration-1 underline-offset-[5px] transition-colors hover:text-primary-700 hover:decoration-primary-700'
                  >
                    {author.name}
                  </a>
                ) : (
                  author.name
                )}
                <sup className='ml-0.5 text-[0.6em] text-gray-600'>{author.affiliations}</sup>
              </span>
            ))}
          </div>
          <div className='mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[0.95rem] text-gray-700 italic md:text-base'>
            <span><sup>1</sup> Amazon FAR</span>
            <span><sup>2</sup> UC Berkeley</span>
            <span><sup>3</sup> Stanford University</span>
            <span><sup>4</sup> Carnegie Mellon University</span>
          </div>
          <div className='mt-10 flex flex-wrap items-center justify-center gap-3'>
            <HeroButton href={asset(PAPER_PDF)} external icon={<PaperIcon />}>
              Paper
            </HeroButton>
            <HeroButton href={siteConfig.code} external icon={<GitHubIcon />}>
              Code
            </HeroButton>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Abstract */}
      <section id='abstract' className='bg-white'>
        <div className='layout py-20 md:py-32'>
          <h2 className='mb-6'>Abstract</h2>
          <p className='prose-col text-gray-700'>
            Learning humanoid state estimation and language-grounded motion understanding from robot recordings ties
            training coverage to the robot&apos;s motion repertoire. Human motion datasets offer broader coverage, yet
            transferring this knowledge requires overcoming differences in body geometry, sensing, and physical
            disturbances. To enable this transfer, we propose a unified inertial encoder whose shared inertial interface
            uses kinematic IMU synthesis to represent human and humanoid motion at corresponding body sites. Within this
            common input space, joint training on human and kinematically retargeted humanoid motion combines velocity
            estimation and motion–text alignment with continuous-time encoding and sensor and motion randomization.
            The resulting model transfers zero-shot to a physical Unitree G1{' '}
            <b className='font-semibold text-gray-900'>without physics simulation, real-robot training trajectories, or fine-tuning</b>, achieving the lowest
            velocity error among evaluated methods across five datasets, including <b className='font-semibold text-gray-900'>0.099 m/s on real G1</b>.
            Its motion-description retrieval also extends to retargeted G1 motion categories observed only in human
            training, demonstrating how human motion knowledge can support the generalization of humanoid inertial
            odometry and language-grounded motion understanding.
          </p>
          <Figure
            className='mt-12'
            img_src='/images/teaser.png'
            alt='Human and humanoid motion share an inertial representation for odometry and motion-description retrieval.'
            caption='Human motion knowledge transfers to a physical humanoid through a shared inertial interface.'
          />
        </div>
      </section>

      {/* --------------------------------------------------------------- Video */}
      <section id='video' className='bg-paper py-14 md:py-20'>
        <CardRow label='Video segments'>
          {sliderItems.map((item) => (
            <RowCard key={item.title} title={item.title}>
              <VideoCard src={item.src} poster={item.poster} title={item.title} />
            </RowCard>
          ))}
        </CardRow>
      </section>

      {/* ------------------------------------------------------------- Method */}
      <section id='method' className='bg-white'>
        <div className='layout py-20 md:py-32'>
          <h2 className='mb-6'>A Shared Inertial Interface</h2>
          <p className='prose-col'>
            Twelve corresponding body sites connect human and humanoid motion: pelvis, head, and bilateral upper arms,
            forearms, upper legs, lower legs, and feet. On G1, kinematic transport combines the pelvis IMU, measured
            joint positions and velocities, and link kinematics to synthesize these streams. It requires no world pose
            or root velocity as input.
          </p>
          <figure className='mt-10'>
            <ImuInterfaceDemo />
            <figcaption className='mt-4 text-center text-[0.95rem] leading-relaxed text-pretty text-gray-500'>
              Kinematic IMU synthesis on G1. The measured pelvis IMU (gold) and the joint angles along each chain
              (dashed) determine every synthesized IMU (blue). Pick a motion, or click an IMU on the robot.
            </figcaption>
          </figure>

          <h3 className='mt-24 mb-5 md:mt-32'>Continuous-time Tokenization</h3>
          <p className='prose-col mb-12'>
            Timestamp-aware encoding accommodates different sampling rates, irregular timing, and missing samples
            without resampling to a fixed grid. Each token covers a fixed 125 ms of motion rather than a fixed number of
            samples, so the same motion yields the same tokens whatever the sensor rate.
          </p>
          <figure>
            <ContinuousTimeDemo />
            <figcaption className='mt-4 text-center text-[0.95rem] leading-relaxed text-pretty text-gray-500'>
              The same motion re-sampled and tokenized by a discrete CNN (25 samples per token) and by the continuous
              encoder (125 ms per token, two levels of 4-tap triangular pooling). Illustrative fixed weights; the
              binning and pooling follow the tokenizer implementation.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------------- Real G1 demos */}
      <section id='real-g1' className='bg-paper py-20 md:py-32'>
        <div className='layout'>
          <h2 className='mb-6'>Zero-shot on a Real Unitree G1</h2>
          <p className='prose-col mb-12'>
            Without real-robot training or fine-tuning, the model estimates motion on hardware from the pelvis IMU
            and joint encoders through the shared 12-site representation. Each pair shows the recording and our
            estimate, with the robot posed from the measured joints along the predicted trajectory (gold).
          </p>
        </div>
        <CardRow label='Real G1 results' stackBelow='lg'>
          <RowCard title='Climbing stairs' className='w-full md:w-full lg:w-[55%]'>
            <StairPair photo='/images/stairs_up_photo.jpg' ours='/images/stairs_up_ours.png' what='climbing' />
            <p className={CARD_NOTE}>
              Zero-shot estimate while the G1 climbs: the robot is posed from its measured joints along the predicted
              pelvis path (gold), with no real-robot training.
            </p>
          </RowCard>
          <RowCard title='Runtime and Language Retrieval' className='w-full md:w-full lg:w-[55%]'>
            <img
              src={asset('/images/real-g1-runtime.png')}
              alt='Inference runtime on an NVIDIA L40S and a physical G1 descending stairs, with retrieved descriptions changing from Walking to Standing.'
              loading='lazy'
              className='block w-full'
            />
            <p className={CARD_NOTE}>
              1.78 ms per 4-s, 12-IMU window (TensorRT, NVIDIA L40S), under the 5-ms sampling interval. On the real
              G1, retrieval switches from “Walking” to “Standing” as it stops.
            </p>
          </RowCard>
          <RowCard title='Descending stairs' className='w-full md:w-full lg:w-[55%]'>
            <StairPair photo='/images/stairs_down_photo.jpg' ours='/images/stairs_down_ours.png' what='descending' />
            <p className={CARD_NOTE}>
              The same checkpoint on the way down, where foot impacts and pitch changes stress inertial odometry
              most.
            </p>
          </RowCard>
        </CardRow>
      </section>

      {/* ------------------------------------------------------------- Results */}
      <section id='results' className='bg-white'>
        <div className='layout py-20 md:py-32'>
          <h2 className='mb-6'>Inertial Odometry</h2>
          <p className='prose-col mb-12'>
            One checkpoint achieves the lowest AVE and ATE<sub>GT</sub> on all five datasets, and the lowest
            ATE<sub>Pred</sub> on four; TLIO leads ATE<sub>Pred</sub> on Nymeria. AVE is in m/s, ATE in m;
            ATE<sub>GT</sub> uses ground-truth attitude and ATE<sub>Pred</sub> uses gyro-integrated attitude.
            Both start from the ground-truth initial pose, with no filter updates or trajectory alignment.
            Lower is better; bold marks column minima. <sup>†</sup> trained separately per dataset,{' '}
            <sup>*</sup> sequences longer than 10 s only.
          </p>
          <OdometryTable />
          <figure className='mt-14'>
            <VideoCarousel
              items={[
                { src: '/video/qual_traj_3d.mp4', label: 'Recordings shown in the paper' },
                { src: '/video/qual_traj_3d_set1.mp4', label: 'Held-out set 1' },
                { src: '/video/qual_traj_3d_set2.mp4', label: 'Held-out set 2' },
                { src: '/video/qual_traj_3d_set3.mp4', label: 'Held-out set 3' },
                { src: '/video/qual_traj_3d_set4.mp4', label: 'Held-out set 4' },
                { src: '/video/qual_traj_3d_set5.mp4', label: 'Held-out set 5' },
              ]}
            />
            <figcaption className='prose-col mt-4 text-center text-[0.95rem] text-gray-500'>
              One held-out recording per dataset: ours (gold) and AirIO (blue) against ground truth (gray). Use the
              arrows for five more sets.
            </figcaption>
          </figure>

          <SubHeading>Motion Caption Retrieval</SubHeading>
          <p className='prose-col mb-12'>
            Motion-to-text recall at 1 (R@1) uses 19 random distractors, averaged over eight draws. Text-to-motion
            mean average precision (mAP) ranks all annotated windows. Both are percentages; higher is better.
            On retargeted G1 categories observed only in human training, our model reaches 53.8% R@1 and 11.3% mAP,
            compared with 17.3% and 0.5% for IMU2CLIP.
          </p>
          <LanguageTable />
          <p className='prose-col mt-4 text-[0.92rem] text-gray-500'>
            Collapse assigns every motion window the same mean text embedding, measuring retrieval without
            motion-specific information. IMU2CLIP leads R@1 on Nymeria (16.2% versus 14.9%); our model leads mAP
            there and both metrics on BONES-Seed human motion and both G1 splits. <sup>†</sup> Trained separately per dataset.
          </p>
          <Figure
            className='mt-14 mx-auto max-w-3xl'
            img_src='/images/qual_lang_g1_col.png'
            alt='Sampled G1 poses with annotated motion categories and descriptions retrieved by our model and ImageBind.'
            caption='Retrieval on a retargeted G1 sequence (ours: 2-s windows, ImageBind: 10-s). Hatching marks incomplete windows.'
          />

          <SubHeading>What Enables Transfer?</SubHeading>
          <p className='prose-col mb-12'>
            Joint human–humanoid training reduces real-G1 ATE<sub>GT</sub> from 5.901 m to 3.153 m compared with
            humanoid-only training. The shared multi-IMU input improves both G1 trajectory metrics over direct joint
            inputs, and continuous-time encoding improves results across all three ablation datasets.
          </p>
          <AblationTable />
          <p className='prose-col mt-4 text-[0.92rem] text-gray-500'>
            ATE in meters; lower is better. Bold marks column minima. More diverse training data improves Nymeria
            and real-G1 ATE<sub>GT</sub>, while quarter-data training performs best on retargeted G1.
          </p>

          <SubHeading>Learned Representation</SubHeading>
          <p className='prose-col mb-12'>
            The paper visualizes the trunk <code>[CLS]</code> features of human (blue) and humanoid (gold) motion.
            Corresponding categories overlap across embodiments. Switch to the language-head output to explore
            the aligned text space; dashed regions enclose 60% of the windows of each labeled motion category. Rest
            the pointer on a point for a second (or tap it) to see the 4-s motion it encodes.
          </p>
          <div className='mx-auto w-full md:w-4/5'>
            <TsneExplorer />
          </div>
          <SubHeading>Compute-Optimal Scaling</SubHeading>
          <p className='prose-col mb-12'>
            Seven model sizes (2.8–274 M parameters), 235 EMA checkpoints. A Chinchilla-style fit{' '}
            <KatexSpan text='L(N,D)=E+A/N^{\alpha}+B/D^{\beta}' /> gives{' '}
            <KatexSpan text='N_{\mathrm{opt}}\propto C^{0.52}' /> and <KatexSpan text='D_{\mathrm{opt}}\propto C^{0.48}' />.
            {' '}Here, <KatexSpan text='N' /> counts parameters, <KatexSpan text='D' /> counts processed tokens including
            repeated windows, and <KatexSpan text='C=6ND' /> is training compute in FLOPs. Increasing model capacity and training exposure together uses additional compute effectively.
            The fit extrapolates and optimizes validation error, which need not give the best hardware transfer.
          </p>
          <div className='grid grid-cols-1 items-start gap-4 md:grid-cols-2'>
            <div className='border border-gray-200 bg-white p-4'>
              <div className='mb-2 text-center text-[0.95rem] font-semibold text-gray-800'>(a) Measured scaling</div>
              <ScalingExplorer height={400} />
              <p className='mt-2 text-center text-[0.85rem] text-gray-500'>Solid: measured · dotted: fitted law · dashed: optimal frontier. Hover a dot.</p>
            </div>
            <div className='border border-gray-200 bg-white p-4'>
              <div className='mb-2 text-center text-[0.95rem] font-semibold text-gray-800'>(b) Fitted loss surface</div>
              <ScalingSurface height={400} />
              <p className='mt-2 text-center text-[0.85rem] text-gray-500'>Dashed: constant compute · gold: fitted minima. Hover or drag to rotate.</p>
            </div>
          </div>
        </div>
      </section>

      <section id='citation' className='bg-paper'>
        <div className='layout py-20 md:py-32'>
          <h2 className='mb-6'>Citation</h2>
          <CitationBlock text={BIBTEX} />
        </div>
      </section>

      <footer className='bg-gray-950 text-xs text-gray-400'>
        <div className='layout flex flex-col items-start justify-between gap-2 py-8 sm:flex-row sm:items-center'>
          <span className='font-medium text-gray-300'>{siteConfig.shortTitle}</span>
          <span>
            Page template adapted from{' '}
            <a
              href='https://co-me-tokens.github.io/'
              target='_blank'
              rel='noopener noreferrer'
              className='text-gray-300 underline decoration-gray-600 underline-offset-4 transition-colors hover:text-white hover:decoration-gold'
            >
              Co-Me
            </a>
            .
          </span>
        </div>
      </footer>
    </main>
  );
}

const BIBTEX = `@misc{chen2026unifiedinertial,
  title={${siteConfig.title}},
  author={Chen, Yutian and Zhao, Shibo and Duan, Rocky and Liu, Karen and
          Sferrazza, Carmelo and Shi, Guanya and Qiu, Yuheng and Sreenath, Koushil},
  year={2026},
  url={${siteConfig.url}}
}`;

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h2 className='mt-28 mb-6 md:mt-40'>{children}</h2>;
}

function HeroButton({
  href,
  children,
  icon,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={clsx(
        'inline-flex items-center justify-center gap-2.5 bg-gray-900 px-6 py-3 font-serif text-[1.05rem] text-white transition-colors',
        'hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2'
      )}
    >
      {icon}
      {children}
    </a>
  );
}

function PaperIcon() {
  return (
    <svg viewBox='0 0 24 24' className='h-4 w-4' fill='none' stroke='currentColor' strokeWidth='1.8' aria-hidden='true'>
      <path d='M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z' strokeLinejoin='round' />
      <path d='M14 3v5h5M9 13h6M9 17h4' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox='0 0 24 24' className='h-[1.05em] w-[1.05em]' fill='currentColor' aria-hidden='true'>
      <path d='M12 .5a11.5 11.5 0 00-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 015.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0012 .5z' />
    </svg>
  );
}

function CitationBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className='relative overflow-hidden bg-gray-900 ring-1 ring-gray-800'>
      <button
        type='button'
        onClick={copy}
        className='absolute top-3 right-3 border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-300 transition hover:border-white/40 hover:text-white'
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <pre className='scrollbar-dark overflow-x-auto p-6 pr-20 text-xs leading-relaxed text-gray-200 md:text-sm'>
        <code>{text}</code>
      </pre>
    </div>
  );
}

const CARD_NOTE = 'mt-2 px-1 text-[0.85rem] leading-snug text-gray-500 text-pretty md:text-[0.9rem]';

function StairPair({ photo, ours, what }: { photo: string; ours: string; what: string }) {
  const label = 'pointer-events-none absolute top-2 left-2 px-2 py-0.5 text-[0.75rem]';
  return (
    <div className='grid grid-cols-2 gap-2'>
      <div className='relative aspect-[4/3] overflow-hidden bg-gray-100'>
        <img src={asset(photo)} alt={`G1 ${what} stairs (recording)`} loading='lazy' className='absolute inset-0 h-full w-full object-cover' />
        <span className={cn(label, 'bg-gray-900/75 text-white')}>Recording</span>
      </div>
      <div className='relative aspect-[4/3] overflow-hidden bg-white'>
        <img src={asset(ours)} alt={`Our estimated trajectory while ${what}`} loading='lazy' className='absolute inset-0 h-full w-full object-contain' />
        <span className={cn(label, 'bg-gold/90 text-gray-900')}>Ours</span>
      </div>
    </div>
  );
}
