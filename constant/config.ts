export const siteConfig = {
  title: 'A Unified Inertial Encoder for Human and Humanoid Motion',
  shortTitle: 'Unified Inertial Encoder',
  description:
    'Transferring human motion knowledge to humanoid inertial odometry and motion-description retrieval through a shared inertial interface. Zero-shot on a physical Unitree G1, with 0.099 m/s velocity error and 1.78 ms TensorRT inference on an NVIDIA L40S.',
  url: 'https://unified-inertial-encoder.github.io/',
  github: 'https://github.com/unified-inertial-encoder',
  code: 'https://github.com/amazon-far/Unified-Inertial-Encoder',
};

/** `url` is optional: authors without a verified homepage render as plain text. */
export const authors: { name: string; affiliations: string; url?: string }[] = [
  { name: 'Yutian Chen', affiliations: '1', url: 'https://www.yutianchen.blog/' },
  { name: 'Shibo Zhao', affiliations: '1' },
  { name: 'Rocky Duan', affiliations: '1' },
  { name: 'Karen Liu', affiliations: '1,3', url: 'https://profiles.stanford.edu/c-karen-liu' },
  { name: 'Carmelo Sferrazza', affiliations: '1', url: 'https://sferrazza.cc/' },
  { name: 'Guanya Shi', affiliations: '1,4', url: 'https://www.gshi.me/' },
  { name: 'Yuheng Qiu', affiliations: '1', url: 'https://haleqiu.github.io/' },
  { name: 'Koushil Sreenath', affiliations: '1,2', url: 'https://hybrid-robotics.berkeley.edu/koushil' },
];
