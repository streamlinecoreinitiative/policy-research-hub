import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Open Policy Research Hub — AI-Powered Research for Global Development',
    template: '%s — Open Policy Research Hub',
  },
  description: 'Free, evidence-based policy briefs and research on climate adaptation, water security, clean energy, and sustainable development. AI-generated, openly accessible.',
  keywords: ['climate adaptation', 'water security', 'clean energy', 'policy briefs', 'global development', 'resilience', 'open access research', 'AI research'],
  authors: [{ name: 'Open Policy Research Hub' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Open Policy Research Hub',
    title: 'Open Policy Research Hub',
    description: 'AI-powered, evidence-based research on climate adaptation and global development — free and open access.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Open Policy Research Hub',
    description: 'AI-powered, evidence-based research on climate adaptation and global development.',
  },
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="alternate" type="application/rss+xml" title="Open Policy Research Hub RSS" href="/feed.xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
