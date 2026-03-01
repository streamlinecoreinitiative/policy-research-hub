import type { Metadata } from 'next';
import './globals.css';
import SiteNav from './components/SiteNav';
import SiteFooter from './components/SiteFooter';

export const metadata: Metadata = {
  title: {
    default: 'Baseflow Institute — Sustained Research for Global Resilience',
    template: '%s — Baseflow Institute',
  },
  description: 'Free, evidence-based policy briefs and research on climate adaptation, water security, clean energy, and sustainable development. AI-generated, openly accessible.',
  keywords: ['Baseflow Institute', 'climate adaptation', 'water security', 'clean energy', 'policy briefs', 'global development', 'resilience', 'open access research', 'AI research'],
  authors: [{ name: 'Baseflow Institute' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Baseflow Institute',
    title: 'Baseflow Institute',
    description: 'Sustained, evidence-based research on climate adaptation and global development — free and open access.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Baseflow Institute',
    description: 'Sustained, evidence-based research on climate adaptation and global development.',
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
        <link rel="alternate" type="application/rss+xml" title="Baseflow Institute RSS" href="/feed.xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
