import * as React from 'react';

import { cn } from '@/lib/utils';

/* Data transcribed from latex/tables/{odometry,language,datasets,ablation_multiimu_scaling}.tex. */

type Cell = { v: string; best?: boolean; note?: string };
const c = (v: string, best = false, note?: string): Cell => ({ v, best, note });

const ODOMETRY_GROUPS = [
  { name: 'Nymeria', emb: 'Human' },
  { name: 'Natural Motion', emb: 'Human' },
  { name: 'BONES-Seed (Human)', emb: 'Human' },
  { name: 'BONES-Seed (G1)', emb: 'Humanoid' },
  { name: 'Real-Trajectory (G1)', emb: 'Humanoid' },
];

type OdoRow = { method: React.ReactNode; ours?: boolean; cells: Cell[] };
const ODOMETRY_ROWS: { section: string; rows: OdoRow[] }[] = [
  {
    section: 'Pelvis IMU only',
    rows: [
      {
        method: <>TLIO<sup>†</sup></>,
        cells: [
          c('0.122'), c('8.149'), c('17.76', true),
          c('0.189'), c('40.72'), c('81.31'),
          c('0.245'), c('0.717'), c('0.719'),
          c('0.173'), c('0.761'), c('0.762'),
          c('0.371'), c('17.86'), c('17.86'),
        ],
      },
      {
        method: <>AirIMU<sup>†</sup></>,
        cells: [
          c('12.62'), c('–'), c('–'),
          c('109.3'), c('–'), c('–'),
          c('0.212'), c('9.472'), c('505.5'),
          c('0.281'), c('11.83'), c('306.6'),
          c('6.231'), c('731.1'), c('–'),
        ],
      },
      {
        method: <>AirIO<sup>†</sup></>,
        cells: [
          c('0.069'), c('7.481'), c('113.9'),
          c('0.280'), c('158.1'), c('157.9'),
          c('0.140'), c('0.530'), c('1.918'),
          c('0.118'), c('0.720'), c('1.690'),
          c('0.350'), c('16.82'), c('20.48'),
        ],
      },
      {
        method: 'TartanIMU',
        cells: [
          c('0.301'), c('37.74'), c('35.53'),
          c('0.332'), c('155.8'), c('156.3'),
          c('0.328', false, '*'), c('2.970', false, '*'), c('2.964', false, '*'),
          c('0.219', false, '*'), c('2.176', false, '*'), c('2.176', false, '*'),
          c('0.391'), c('18.94'), c('18.96'),
        ],
      },
    ],
  },
  {
    section: 'Pelvis IMU + joint positions and velocities',
    rows: [
      {
        method: <>AirIO w/ joints<sup>†</sup></>,
        cells: [
          c('0.060'), c('6.912'), c('39.64'),
          c('0.080'), c('14.11'), c('209.2'),
          c('0.205'), c('0.907'), c('1.652'),
          c('0.123'), c('0.620'), c('1.565'),
          c('0.190'), c('5.976'), c('22.25'),
        ],
      },
    ],
  },
  {
    section: 'Shared 12-site multi-IMU input',
    rows: [
      {
        method: 'Ours',
        ours: true,
        cells: [
          c('0.026', true), c('2.468', true), c('18.20'),
          c('0.049', true), c('7.456', true), c('50.54', true),
          c('0.031', true), c('0.113', true), c('0.148', true),
          c('0.024', true), c('0.101', true), c('0.127', true),
          c('0.099', true), c('3.153', true), c('11.50', true),
        ],
      },
    ],
  },
];

function CellView({ cell, groupStart = false }: { cell: Cell; groupStart?: boolean }) {
  return (
    <td className={cn(groupStart && 'group-start', cell.best && 'font-bold text-gray-900')}>
      {cell.v}
      {cell.note ? <sup>{cell.note}</sup> : null}
    </td>
  );
}

export function OdometryTable({ className }: { className?: string }) {
  return (
    <div className={cn('scroll-shadow overflow-x-auto', className)}>
      <table className='results-table dense'>
        <thead>
          <tr className='border-t-2 border-gray-800'>
            <th rowSpan={3} className='pt-2 align-bottom'>Method</th>
            <th colSpan={9} className='pt-2 text-center! text-primary-700'>
              <span className='group-head border-gray-400'>Human</span>
            </th>
            <th colSpan={6} className='pt-2 text-center! text-amber-700'>
              <span className='group-head border-gray-400'>Humanoid (G1)</span>
            </th>
          </tr>
          <tr>
            {ODOMETRY_GROUPS.map((g) => (
              <th key={g.name} colSpan={3} className='text-center! font-medium!'>
                <span className='group-head'>{g.name}</span>
              </th>
            ))}
          </tr>
          <tr className='border-b border-gray-800 text-gray-500'>
            {ODOMETRY_GROUPS.map((g) => (
              <React.Fragment key={g.name}>
                <th className='group-start font-normal!'>AVE</th>
                <th className='font-normal!'>ATE<sub>GT</sub></th>
                <th className='font-normal!'>ATE<sub>Pred</sub></th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {ODOMETRY_ROWS.map((sec) => (
            <React.Fragment key={sec.section}>
              <tr className='section-row'>
                <td colSpan={16}>{sec.section}</td>
              </tr>
              {sec.rows.map((row, i) => (
                <tr key={i} className={cn(row.ours ? 'ours-row' : 'hover:bg-gray-50')}>
                  <td>{row.method}</td>
                  {row.cells.map((cell, j) => (
                    <CellView key={j} cell={cell} groupStart={j % 3 === 0} />
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className='border-t-2 border-gray-800' />
    </div>
  );
}

type LangRow = { method: React.ReactNode; ours?: boolean; cells: [Cell, Cell][] };
const LANGUAGE_COLS = ['Nymeria', 'BONES-Seed', 'G1 · seen categories', 'G1 · unseen categories'];
const LANGUAGE_ROWS: LangRow[] = [
  {
    method: 'Collapse',
    cells: [
      [c('4.4'), c('0.1')], [c('19.7'), c('0.2')], [c('21.9'), c('0.8')], [c('9.8'), c('0.1')],
    ],
  },
  {
    method: 'ImageBind',
    cells: [
      [c('8.9'), c('0.1')], [c('7.1'), c('0.4')], [c('11.4'), c('1.6')], [c('4.6'), c('0.1')],
    ],
  },
  {
    method: <>IMU2CLIP<sup>†</sup></>,
    cells: [
      [c('16.2', true), c('0.4')], [c('51.8'), c('5.2')], [c('36.1'), c('11.2')], [c('17.3'), c('0.5')],
    ],
  },
  {
    method: 'Ours',
    ours: true,
    cells: [
      [c('14.9'), c('0.6', true)], [c('60.7', true), c('15.9', true)], [c('63.4', true), c('32.9', true)], [c('53.8', true), c('11.3', true)],
    ],
  },
];

export function LanguageTable({ className }: { className?: string }) {
  return (
    <div className={cn('scroll-shadow overflow-x-auto', className)}>
      <table className='results-table'>
        <thead>
          <tr className='border-t-2 border-gray-800'>
            <th rowSpan={2} className='pt-2 align-bottom'>Method</th>
            <th colSpan={2} className='pt-2 text-center! text-primary-700'>
              <span className='group-head border-gray-400'>Human</span>
            </th>
            <th colSpan={2} className='pt-2 text-center! text-amber-700'>
              <span className='group-head border-gray-400'>Humanoid (G1)</span>
            </th>
          </tr>
          <tr className='border-b border-gray-800'>
            {LANGUAGE_COLS.map((name) => (
              <th key={name} className='text-center! font-medium!'>
                {name}
                <div className='mt-0.5 text-[0.7rem] font-normal text-gray-500'>R@1 / mAP (%)</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LANGUAGE_ROWS.map((row, i) => (
            <tr key={i} className={cn(row.ours ? 'ours-row' : 'hover:bg-gray-50')}>
              <td>{row.method}</td>
              {row.cells.map(([r1, map], j) => (
                <td key={j} className='text-center!'>
                  <span className={cn(r1.best && 'font-bold text-gray-900')}>{r1.v}</span>
                  <span className='px-1 text-gray-300'>/</span>
                  <span className={cn(map.best && 'font-bold text-gray-900')}>{map.v}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className='border-t-2 border-gray-800' />
    </div>
  );
}

const DATASETS = [
  ['Nymeria', 'Human', '240', '300+', 'Train / validate'],
  ['Natural Motion', 'Human', '240', '40.6', 'Train / validate'],
  ['BONES-Seed', 'Human', '120', '144', 'Train / validate'],
  ['BONES-Seed', 'Retargeted G1', '120', '144', 'Train / validate / unseen categories'],
  ['Real-Trajectory', 'Physical G1', '200', '0.7', 'Zero-shot evaluation only'],
];

export function DatasetTable() {
  return (
    <div className='scroll-shadow overflow-x-auto' role='region' aria-label='Training and evaluation datasets' tabIndex={0}>
      <table className='results-table'>
        <thead>
          <tr className='border-t-2 border-b border-gray-800'>
            <th scope='col' className='pt-2'>Dataset</th>
            <th scope='col' className='pt-2 text-left!'>Embodiment</th>
            <th scope='col' className='pt-2'>Rate (Hz)</th>
            <th scope='col' className='pt-2'>Hours</th>
            <th scope='col' className='pt-2 pl-10! text-left!'>Use</th>
          </tr>
        </thead>
        <tbody>
          {DATASETS.map(([name, embodiment, rate, hours, use]) => (
            <tr key={`${name}-${embodiment}`}>
              <th scope='row' className='font-medium text-gray-900'>{name}</th>
              <td className='text-left!'>{embodiment}</td>
              <td>{rate}</td>
              <td>{hours}</td>
              <td className='pl-10! text-left! text-gray-600'>{use}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className='border-t-2 border-gray-800' />
    </div>
  );
}

const ABLATION_ROWS: { section: string; rows: OdoRow[] }[] = [
  {
    section: 'Training embodiment',
    rows: [
      { method: 'Humanoid-only', cells: [c('8.041'), c('17.50'), c('0.162'), c('0.180'), c('5.901'), c('13.15')] },
    ],
  },
  {
    section: 'Input representation',
    rows: [
      { method: 'Single pelvis IMU', cells: [c('3.592'), c('16.66'), c('0.330'), c('0.335'), c('8.114'), c('12.81')] },
      { method: 'Pelvis IMU + joints', cells: [c('2.283', true), c('16.12'), c('0.136'), c('0.164'), c('3.513'), c('18.36')] },
    ],
  },
  {
    section: 'Model design',
    rows: [
      { method: 'Without alternating attention', cells: [c('2.466'), c('14.31', true), c('0.110'), c('0.128'), c('3.530'), c('11.71')] },
      { method: 'Without continuous-time encoding', cells: [c('31.42'), c('31.51'), c('1.189'), c('1.189'), c('17.37'), c('17.67')] },
    ],
  },
  {
    section: 'Data diversity',
    rows: [
      { method: '1/64 of data', cells: [c('4.882'), c('18.40'), c('0.154'), c('0.166'), c('4.369'), c('12.44')] },
      { method: '1/16 of data', cells: [c('3.500'), c('16.93'), c('0.111'), c('0.131'), c('3.792'), c('11.95')] },
      { method: '1/4 of data', cells: [c('2.847'), c('14.64'), c('0.099', true), c('0.121', true), c('3.716'), c('11.98')] },
    ],
  },
  {
    section: 'Full model',
    rows: [
      { method: 'Ours', ours: true, cells: [c('2.468'), c('18.20'), c('0.101'), c('0.127'), c('3.153', true), c('11.50', true)] },
    ],
  },
];

export function AblationTable() {
  const datasets = ['Nymeria (Human)', 'BONES-Seed (G1)', 'Real-Trajectory (G1)'];
  return (
    <div className='scroll-shadow overflow-x-auto' role='region' aria-label='Model and training ablations' tabIndex={0}>
      <table className='results-table'>
        <thead>
          <tr className='border-t-2 border-gray-800'>
            <th rowSpan={2} scope='col' className='pt-2 align-bottom'>Variant</th>
            {datasets.map((name) => (
              <th key={name} colSpan={2} scope='colgroup' className='pt-2 text-center!'>
                <span className='group-head'>{name}</span>
              </th>
            ))}
          </tr>
          <tr className='border-b border-gray-800'>
            {datasets.map((name) => (
              <React.Fragment key={name}>
                <th scope='col' className='group-start font-normal! text-gray-500!'>ATE<sub>GT</sub></th>
                <th scope='col' className='font-normal! text-gray-500!'>ATE<sub>Pred</sub></th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {ABLATION_ROWS.map(({ section, rows }) => (
            <React.Fragment key={section}>
              <tr className='section-row'><td colSpan={7}>{section}</td></tr>
              {rows.map((row, i) => (
                <tr key={i} className={cn(row.ours ? 'ours-row' : 'hover:bg-gray-50')}>
                  <th scope='row' className={cn(row.ours ? 'font-semibold!' : 'font-normal!')}>{row.method}</th>
                  {row.cells.map((cell, j) => <CellView key={j} cell={cell} groupStart={j % 2 === 0} />)}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className='border-t-2 border-gray-800' />
    </div>
  );
}
