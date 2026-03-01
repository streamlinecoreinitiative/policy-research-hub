import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'How our AI research pipeline works — from web research to fact-checked policy briefs on climate adaptation and global development.',
};

export default function AboutPage() {
  return (
    <main className="pub about-page">
      <nav className="breadcrumb">
        <Link href="/">Home</Link> <span>/</span> <span>About</span>
      </nav>

      <div className="about-hero">
        <p className="section-eyebrow">About Us</p>
        <h1>About Baseflow Institute</h1>
        <p className="about-lead">
          We believe that evidence-based research on climate adaptation, water security, and sustainable
          development should be freely available to everyone&mdash;not locked behind paywalls or buried
          in academic jargon.
        </p>
      </div>

      <div className="about-grid">
        <div className="about-section">
          <h2>The Problem</h2>
          <p>
            Communities facing climate change, water insecurity, and energy poverty often lack access to
            the research they need. Meanwhile, valuable data from organizations like the World Bank, UN agencies,
            and peer-reviewed journals exists but is scattered, hard to synthesize, and difficult to act on.
          </p>
        </div>

        <div className="about-section">
          <h2>Our Approach</h2>
          <p>
            Instead of using AI to generate low-quality content, this platform uses a rigorous multi-stage
            pipeline that prioritizes accuracy and transparency:
          </p>
          <ul>
            <li><strong>Phase 1: Web Research</strong> — AI agents search DuckDuckGo, Wikipedia,
              World Bank APIs, and other public data sources to gather real, verifiable information.</li>
            <li><strong>Phase 2: Planning</strong> — A planning agent creates a unique angle for the report,
              identifies the most relevant evidence, and structures the argument.</li>
            <li><strong>Phase 3: Writing</strong> — A writer agent produces the full report following
              professional templates (policy briefs, research summaries, situation reports) with inline citations.</li>
            <li><strong>Phase 4: Fact-Checking</strong> — A verification pass checks all statistics against
              the research data and flags anything that can&apos;t be confirmed as [VERIFY] or [NEEDS SOURCE].</li>
          </ul>
        </div>

        <div className="about-section">
          <h2>Transparency &amp; Limitations</h2>
          <p>
            Every report on this platform is AI-generated. We are transparent about this because:
          </p>
          <ul>
            <li>AI can make mistakes. We flag uncertain claims and encourage independent verification.</li>
            <li>Research is only as good as its sources. We cite everything and link to originals.</li>
            <li>This is a research <em>aid</em>, not a replacement for expert analysis or peer review.</li>
            <li>Quality scores are published with every report so readers can assess reliability.</li>
          </ul>
        </div>

        <div className="about-section">
          <h2>Technology</h2>
          <p>
            The platform runs on open-source technology:
          </p>
          <ul>
            <li><strong>AI Models:</strong> Local models via <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>
              &mdash; no data leaves your machine during generation.</li>
            <li><strong>Web Framework:</strong> Next.js for fast, SEO-friendly pages.</li>
            <li><strong>Research:</strong> DuckDuckGo API, Wikipedia REST API, World Bank Open Data.</li>
            <li><strong>Distribution:</strong> RSS feed, JSON API, social sharing, newsletter.</li>
          </ul>
        </div>

        <div className="about-section about-audiences">
          <h2>How to Use This Research</h2>
          <div className="audience-grid">
            <div className="audience-card">
              <strong>Policymakers</strong>
              <p>Use briefs as starting points for understanding issues and identifying potential interventions.</p>
            </div>
            <div className="audience-card">
              <strong>Researchers</strong>
              <p>Find synthesized overviews and follow cited sources for deeper investigation.</p>
            </div>
            <div className="audience-card">
              <strong>Students</strong>
              <p>Learn about global development challenges with cited, structured summaries.</p>
            </div>
            <div className="audience-card">
              <strong>NGOs</strong>
              <p>Adapt briefs for donor communication, grant proposals, or community education.</p>
            </div>
            <div className="audience-card">
              <strong>Journalists</strong>
              <p>Use as background research with traceable data points.</p>
            </div>
          </div>
        </div>

        <div className="about-section">
          <h2>Open Access</h2>
          <p>
            All research published here is freely available. You may read, share, cite, and build upon it.
            We ask only that you verify critical claims with primary sources before making decisions.
          </p>
          <div className="about-actions">
            <a href="/feed.xml" className="btn-outline">Subscribe via RSS</a>
            <a href="/api/articles" className="btn-outline" target="_blank" rel="noreferrer">Explore API</a>
          </div>
        </div>
      </div>

      <div className="back-bar">
        <Link href="/" className="btn-ghost">&larr; Home</Link>
        <Link href="/library" className="btn-primary">Browse Library &rarr;</Link>
      </div>
    </main>
  );
}
