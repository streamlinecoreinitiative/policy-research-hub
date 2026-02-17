/**
 * HTML Report Generator
 * Converts markdown reports to beautifully styled HTML
 */

export type ReportMetadata = {
  title: string;
  template: string;
  generatedAt: string;
  wordCount: number;
  sourcesUsed: number;
  readabilityScore: number;
};

export type StatisticItem = {
  label: string;
  value: string;
  source: string;
};

export type SourceItem = {
  title: string;
  snippet: string;
  url?: string;
  source: string;
};

export function generateHTMLReport(params: {
  content: string;
  metadata: ReportMetadata;
  statistics?: StatisticItem[];
  sources?: SourceItem[];
}): string {
  const { content, metadata, statistics = [], sources = [] } = params;
  
  // Convert markdown to HTML
  const htmlContent = markdownToHTML(content);
  
  // Generate statistics section
  const statsHTML = statistics.length > 0 ? `
    <section class="stats-section">
      <h2>📊 Key Statistics</h2>
      <div class="stats-grid">
        ${statistics.map(stat => `
          <div class="stat-card">
            <div class="stat-value">${escapeHTML(stat.value)}</div>
            <div class="stat-label">${escapeHTML(stat.label)}</div>
            <div class="stat-source">Source: ${escapeHTML(stat.source)}</div>
          </div>
        `).join('')}
      </div>
    </section>
  ` : '';
  
  // Generate sources section
  const sourcesHTML = sources.length > 0 ? `
    <section class="sources-section">
      <h2>📚 Sources & References</h2>
      <div class="sources-list">
        ${sources.map((src, i) => `
          <div class="source-item">
            <span class="source-num">[${i + 1}]</span>
            <div class="source-content">
              <strong>${escapeHTML(src.title)}</strong>
              <p>${escapeHTML(src.snippet.slice(0, 200))}${src.snippet.length > 200 ? '...' : ''}</p>
              ${(() => {
                const safeUrl = sanitizeURL(src.url);
                return safeUrl
                  ? `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(src.source)} →</a>`
                  : '';
              })()}
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(metadata.title)}</title>
  <style>
    :root {
      --primary: #174ea6;
      --primary-dark: #0f3c8a;
      --success: #059669;
      --warning: #d97706;
      --text: #1c2433;
      --muted: #4b5563;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.7;
      color: var(--text);
      background: var(--bg);
      padding: 0;
    }
    
    .report-container {
      max-width: 900px;
      margin: 0 auto;
      background: var(--card-bg);
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    
    /* Header */
    .report-header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      padding: 48px 40px;
    }
    
    .report-header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      line-height: 1.3;
    }
    
    .report-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 13px;
      opacity: 0.9;
    }
    
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .meta-badge {
      background: rgba(255,255,255,0.2);
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 600;
    }
    
    /* Quality Score Bar */
    .quality-bar {
      display: flex;
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
      overflow: hidden;
      margin-top: 20px;
    }
    
    .quality-item {
      flex: 1;
      padding: 12px 16px;
      text-align: center;
      border-right: 1px solid rgba(255,255,255,0.1);
    }
    
    .quality-item:last-child {
      border-right: none;
    }
    
    .quality-value {
      font-size: 20px;
      font-weight: 700;
    }
    
    .quality-label {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 2px;
    }
    
    /* Main Content */
    .report-content {
      padding: 40px;
    }
    
    .report-content h1 {
      display: none; /* Hide duplicate title */
    }
    
    .report-content h2 {
      font-size: 20px;
      color: var(--primary-dark);
      margin: 32px 0 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--border);
    }
    
    .report-content h2:first-child {
      margin-top: 0;
    }
    
    .report-content h3 {
      font-size: 16px;
      color: var(--text);
      margin: 24px 0 12px;
    }
    
    .report-content p {
      margin-bottom: 16px;
      text-align: justify;
    }
    
    .report-content ul, .report-content ol {
      margin: 16px 0;
      padding-left: 24px;
    }
    
    .report-content li {
      margin: 8px 0;
    }
    
    .report-content strong {
      color: var(--primary-dark);
    }
    
    .report-content code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      font-family: 'SF Mono', Consolas, monospace;
    }
    
    .report-content blockquote {
      border-left: 4px solid var(--primary);
      padding-left: 16px;
      margin: 20px 0;
      color: var(--muted);
      font-style: italic;
    }
    
    .report-content a {
      color: var(--primary);
      text-decoration: none;
    }
    
    .report-content a:hover {
      text-decoration: underline;
    }
    
    /* Verification flags */
    .verify-flag {
      background: #fef3c7;
      color: var(--warning);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    
    /* Statistics Section */
    .stats-section {
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%);
      padding: 32px 40px;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    
    .stats-section h2 {
      font-size: 18px;
      margin-bottom: 20px;
      color: var(--text);
      border: none;
      padding: 0;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }
    
    .stat-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 4px;
    }
    
    .stat-label {
      font-size: 13px;
      color: var(--text);
      margin-bottom: 8px;
    }
    
    .stat-source {
      font-size: 11px;
      color: var(--muted);
    }
    
    /* Sources Section */
    .sources-section {
      padding: 32px 40px;
      background: #f8fafc;
    }
    
    .sources-section h2 {
      font-size: 18px;
      margin-bottom: 20px;
      color: var(--text);
      border: none;
      padding: 0;
    }
    
    .sources-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .source-item {
      display: flex;
      gap: 12px;
      background: white;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    
    .source-num {
      font-weight: 700;
      color: var(--primary);
      font-size: 13px;
    }
    
    .source-content {
      flex: 1;
    }
    
    .source-content strong {
      display: block;
      margin-bottom: 4px;
    }
    
    .source-content p {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 8px;
    }
    
    .source-content a {
      font-size: 12px;
      color: var(--primary);
    }
    
    /* Footer */
    .report-footer {
      padding: 24px 40px;
      background: #f1f5f9;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }
    
    .report-footer a {
      color: var(--primary);
    }
    
    /* Print Styles */
    @media print {
      body {
        background: white;
      }
      
      .report-container {
        box-shadow: none;
      }
      
      .report-header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      
      .stats-section {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .report-header {
        padding: 32px 24px;
      }
      
      .report-header h1 {
        font-size: 22px;
      }
      
      .report-content {
        padding: 24px;
      }
      
      .stats-section,
      .sources-section {
        padding: 24px;
      }
      
      .quality-bar {
        flex-wrap: wrap;
      }
      
      .quality-item {
        flex: 1 1 50%;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <header class="report-header">
      <h1>${escapeHTML(metadata.title)}</h1>
      <div class="report-meta">
        <span class="meta-item">
          <span class="meta-badge">${escapeHTML(metadata.template)}</span>
        </span>
        <span class="meta-item">📅 ${escapeHTML(metadata.generatedAt)}</span>
      </div>
      <div class="quality-bar">
        <div class="quality-item">
          <div class="quality-value">${metadata.wordCount}</div>
          <div class="quality-label">Words</div>
        </div>
        <div class="quality-item">
          <div class="quality-value">${metadata.sourcesUsed}</div>
          <div class="quality-label">Sources</div>
        </div>
        <div class="quality-item">
          <div class="quality-value">${metadata.readabilityScore}/100</div>
          <div class="quality-label">Readability</div>
        </div>
      </div>
    </header>
    
    ${statsHTML}
    
    <main class="report-content">
      ${htmlContent}
    </main>
    
    ${sourcesHTML}
    
    <footer class="report-footer">
      Generated by <strong>Ollama Agents Studio</strong> • 
      ${escapeHTML(metadata.generatedAt)} • 
      <a href="https://github.com/ollama/ollama" target="_blank" rel="noopener noreferrer">Powered by Ollama</a>
    </footer>
  </div>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeURL(input?: string): string | null {
  if (!input) return null;

  const url = input.trim();
  if (!url) return null;

  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      return parsed.href;
    }
  } catch {
    return null;
  }

  return null;
}

function markdownToHTML(markdown: string): string {
  let html = markdown
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    
    // Headers (process in order from h3 to h1)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) => {
      const safeUrl = sanitizeURL(url);
      if (!safeUrl) return text;
      return `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    })
    
    // Verification flags
    .replace(/\[VERIFY\]/gi, '<span class="verify-flag">⚠️ VERIFY</span>')
    .replace(/\[needs verification\]/gi, '<span class="verify-flag">⚠️ VERIFY</span>')
    
    // Blockquotes
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    
    // Horizontal rules
    .replace(/^---$/gim, '<hr>')
    
    // Line breaks (before list processing)
    .replace(/\n\n/g, '</p><p>')
    
    // Bullet lists
    .replace(/^\* (.*$)/gim, '<li data-list="ul">$1</li>')
    .replace(/^- (.*$)/gim, '<li data-list="ul">$1</li>')
    
    // Numbered lists
    .replace(/^\d+\. (.*$)/gim, '<li data-list="ol">$1</li>');
  
  // Wrap consecutive list items by list type.
  html = html.replace(/(<li data-list="ol">.*<\/li>\n?)+/g, (match) => `<ol>${match.replace(/ data-list="ol"/g, '')}</ol>`);
  html = html.replace(/(<li data-list="ul">.*<\/li>\n?)+/g, (match) => `<ul>${match.replace(/ data-list="ul"/g, '')}</ul>`);
  
  // Wrap in paragraphs
  html = `<p>${html}</p>`;
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ol>)/g, '$1');
  html = html.replace(/(<\/ol>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
  
  return html;
}
