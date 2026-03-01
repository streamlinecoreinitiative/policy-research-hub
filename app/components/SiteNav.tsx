'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Hide nav on admin pages
  if (pathname.startsWith('/admin')) return null;

  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand" onClick={() => setOpen(false)}>
          <span className="nav-mark">B</span>
          <span className="nav-wordmark">Baseflow Institute</span>
        </Link>
        <div className={`nav-links ${open ? 'open' : ''}`}>
          <Link href="/library" className={pathname === '/library' ? 'active' : ''} onClick={() => setOpen(false)}>Library</Link>
          <Link href="/about" className={pathname === '/about' ? 'active' : ''} onClick={() => setOpen(false)}>About</Link>
          <a href="/feed.xml" onClick={() => setOpen(false)}>RSS</a>
          <Link href="/library" className="nav-cta" onClick={() => setOpen(false)}>Browse Research</Link>
        </div>
        <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
}
