import type { Metadata } from 'next';
import localFont from 'next/font/local';
import * as React from 'react';

import './globals.css';

import { authors, siteConfig } from '@/constant/config';

const inter = localFont({
  src: './fonts/inter-var-latin.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

const serif = localFont({
  src: [
    { path: './fonts/source-serif-4-latin-wght-normal.woff2', style: 'normal' },
    { path: './fonts/source-serif-4-latin-wght-italic.woff2', style: 'italic' },
  ],
  variable: '--font-serif-src',
  weight: '200 900',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.shortTitle}`,
  },
  description: siteConfig.description,
  authors: authors.map(({ name }) => ({ name })),
  robots: { index: true, follow: true },
  openGraph: {
    url: siteConfig.url,
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.shortTitle,
    images: ['images/og.jpg'],
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    images: ['images/og.jpg'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' className={`${inter.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
