'use client';

import { useEffect, useState, useMemo } from 'react';

type ResearchData = {
  query: string;
  results: { title: string; snippet: string; url: string; source: string }[];
  statistics: { label: string; value: string; source: string }[];
  timestamp: string;
};

type QualityScore = {
  sourcesUsed: number;
  wordCount: number;
  sectionsComplete: number;
  readabilityScore: number;
};

type RunResponse = {
  articlePath: string;
  articleTitle: string;
  articleContent: string;
  log: string;
  warnings?: string[];
  research?: ResearchData;
  qualityScore?: QualityScore;
  drive?: { fileId?: string; fileName?: string; webViewLink?: string };
};

type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
};

type Schedule = {
  id: string;
  topic: string;
  plannerModel: string;
  writerModel: string;
  autoUpload: boolean;
  intervalMinutes: number;
  nextRunAt: number;
  lastRunAt?: number;
  lastResult?: {
    articlePath?: string;
    fileId?: string;
    webViewLink?: string;
    error?: string;
    ranAt: number;
  };
};

type Template = {
  id: string;
  name: string;
  description: string;
};

const starterTopic = 'Environmental resilience in lower-income countries: water security, clean energy, and climate adaptation';

// Simple markdown to HTML converter
function renderMarkdown(md: string): string {
  return md
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Bullet lists
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\.\s+(.*$)/gim, '<li>$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    // Code blocks
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Line breaks
    .replace(/\n/g, '<br/>')
    // Wrap lists
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Wrap in paragraph
    .replace(/^(.*)$/, '<p>$1</p>');
}

export default function HomePage() {
  const [topic, setTopic] = useState(starterTopic);
  const [plannerModel, setPlannerModel] = useState('qwen3:4b');
  const [writerModel, setWriterModel] = useState('qwen3:8b');
  const [factCheckerModel, setFactCheckerModel] = useState('bespoke-minicheck:7b');
  const [templateId, setTemplateId] = useState('policy-brief');
  const [researchDepth, setResearchDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [customInstructions, setCustomInstructions] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  
  const [status, setStatus] = useState('Idle');
  const [log, setLog] = useState('');
  const [articleContent, setArticleContent] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [articlePath, setArticlePath] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [qualityScore, setQualityScore] = useState<QualityScore | null>(null);
  const [running, setRunning] = useState(false);
  
  const [viewMode, setViewMode] = useState<'preview' | 'raw' | 'edit'>('preview');
  const [editContent, setEditContent] = useState('');
  const [activeTab, setActiveTab] = useState<'draft' | 'research' | 'log'>('draft');
  
  const [driveConfig, setDriveConfig] = useState<DriveConfig>({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    folderId: ''
  });
  const [autoUploadManual, setAutoUploadManual] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedTopic, setSchedTopic] = useState(starterTopic);
  const [schedIntervalMinutes, setSchedIntervalMinutes] = useState(240);
  const [schedAutoUpload, setSchedAutoUpload] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch templates on load
  useEffect(() => {
    fetch('/api/run')
      .then(res => res.json())
      .then(data => {
        if (data.templates) setTemplates(data.templates);
      })
      .catch(() => {
        // Fallback templates
        setTemplates([
          { id: 'policy-brief', name: 'Policy Brief', description: 'Concise document for policymakers' },
          { id: 'research-summary', name: 'Research Summary', description: 'Academic-style summary' },
          { id: 'grant-proposal', name: 'Grant Proposal', description: 'Framework for funding applications' },
          { id: 'executive-briefing', name: 'Executive Briefing', description: 'Quick-read for leaders' },
          { id: 'situation-report', name: 'Situation Report', description: 'Status update on issues' }
        ]);
      });
  }, []);

  const fetchSchedules = async () => {
    setLoadingSchedules(true);
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      if (res.ok) {
        setSchedules(data.schedules || []);
      }
    } catch {
      // ignore load errors
    } finally {
      setLoadingSchedules(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const runAgents = async () => {
    setRunning(true);
    setStatus('Researching & generating...');
    setWarnings([]);
    setLog('');
    setArticleContent('');
    setArticleTitle('');
    setArticlePath('');
    setUploadStatus('');
    setResearch(null);
    setQualityScore(null);

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          plannerModel,
          writerModel,
          factCheckerModel,
          templateId,
          researchDepth,
          customInstructions,
          autoUpload: autoUploadManual,
          drive: autoUploadManual ? driveConfig : undefined
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Agent run failed');
      }

      const data: RunResponse = await res.json();
      setStatus(autoUploadManual ? 'Draft saved + uploaded' : 'Draft ready');
      setLog(data.log);
      setArticleContent(data.articleContent);
      setEditContent(data.articleContent);
      setArticleTitle(data.articleTitle);
      setArticlePath(data.articlePath);
      setWarnings(data.warnings || []);
      setResearch(data.research || null);
      setQualityScore(data.qualityScore || null);
      if (data.drive?.fileName) {
        setUploadStatus(`Uploaded as ${data.drive.fileName}`);
      }
    } catch (err) {
      setStatus('Failed');
      setLog(`Error: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const uploadToDrive = async () => {
    if (!articlePath) {
      setUploadStatus('No article file to upload yet.');
      return;
    }
    setUploadStatus('Uploading to Drive...');

    try {
      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: articlePath,
          drive: driveConfig
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      setUploadStatus(`Uploaded as ${data.fileName}`);
    } catch (err) {
      setUploadStatus(`Upload failed: ${(err as Error).message}`);
    }
  };

  const handleDriveChange = (key: keyof DriveConfig, value: string) => {
    setDriveConfig((prev) => ({ ...prev, [key]: value }));
  };

  const createSchedule = async () => {
    const minutes = Math.max(15, schedIntervalMinutes);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: schedTopic,
          plannerModel,
          writerModel,
          factCheckerModel,
          intervalMinutes: minutes,
          autoUpload: schedAutoUpload,
          drive: schedAutoUpload ? driveConfig : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create schedule');
      }
      setSchedules((prev) => [...prev, data.schedule]);
    } catch (err) {
      setUploadStatus(`Schedule error: ${(err as Error).message}`);
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  };

  const exportAs = (format: 'md' | 'txt' | 'html') => {
    const content = viewMode === 'edit' ? editContent : articleContent;
    let blob: Blob;
    let filename: string;
    
    if (format === 'html') {
      const html = `<!DOCTYPE html>
<html>
<head><title>${articleTitle}</title>
<style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}h1,h2,h3{color:#1a202c}ul{margin:1em 0}li{margin:0.5em 0}</style>
</head>
<body>${renderMarkdown(content)}</body>
</html>`;
      blob = new Blob([html], { type: 'text/html' });
      filename = `${articleTitle.slice(0, 50)}.html`;
    } else if (format === 'txt') {
      const text = content.replace(/[#*`\[\]]/g, '');
      blob = new Blob([text], { type: 'text/plain' });
      filename = `${articleTitle.slice(0, 50)}.txt`;
    } else {
      blob = new Blob([content], { type: 'text/markdown' });
      filename = `${articleTitle.slice(0, 50)}.md`;
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderedContent = useMemo(() => {
    if (!articleContent) return '';
    return renderMarkdown(articleContent);
  }, [articleContent]);

  return (
    <main>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <div>
            <div className="badge">Research-backed AI Studio</div>
            <h1>Policy & Research Brief Generator</h1>
            <div className="small">
              Five-phase pipeline: Research → Plan → Write → Fact-Check (bespoke-minicheck) → QA Gate. Powered by Qwen3 + Ollama.
            </div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <h2>Topic & Configuration</h2>
          <div className="section">
            <label htmlFor="topic">What should the report cover?</label>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Climate adaptation funding gaps in Southeast Asia"
            />
          </div>

          <div className="section">
            <label>Report Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} - {t.description}</option>
              ))}
            </select>
          </div>

          <div className="section">
            <label>Research Depth</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="depth"
                  value="quick"
                  checked={researchDepth === 'quick'}
                  onChange={() => setResearchDepth('quick')}
                />
                Quick (basic data)
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="depth"
                  value="standard"
                  checked={researchDepth === 'standard'}
                  onChange={() => setResearchDepth('standard')}
                />
                Standard (recommended)
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="depth"
                  value="deep"
                  checked={researchDepth === 'deep'}
                  onChange={() => setResearchDepth('deep')}
                />
                Deep (comprehensive)
              </label>
            </div>
          </div>

          <div className="section">
            <label>Models</label>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div className="small">Planner</div>
                <input
                  value={plannerModel}
                  onChange={(e) => setPlannerModel(e.target.value)}
                  placeholder="qwen3:4b"
                />
              </div>
              <div>
                <div className="small">Writer</div>
                <input
                  value={writerModel}
                  onChange={(e) => setWriterModel(e.target.value)}
                  placeholder="qwen3:8b"
                />
              </div>
              <div>
                <div className="small">Fact-Checker</div>
                <input
                  value={factCheckerModel}
                  onChange={(e) => setFactCheckerModel(e.target.value)}
                  placeholder="bespoke-minicheck:7b"
                />
              </div>
            </div>
          </div>

          <div className="section">
            <button 
              className="toggle-btn"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '▼' : '▶'} Advanced Options
            </button>
            {showAdvanced && (
              <div style={{ marginTop: 12 }}>
                <label>Custom Instructions (optional)</label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g., Focus on Sub-Saharan Africa, include cost-benefit analysis..."
                  style={{ minHeight: 80 }}
                />
              </div>
            )}
          </div>

          <div className="section inline" style={{ marginTop: 18 }}>
            <button onClick={runAgents} disabled={running} className="primary-btn">
              {running ? '⏳ Researching & Writing...' : '🚀 Generate Report'}
            </button>
            <div className="badge">Status: {status}</div>
          </div>
          <div className="section" style={{ marginTop: 6 }}>
            <label>
              <input
                type="checkbox"
                checked={autoUploadManual}
                onChange={(e) => setAutoUploadManual(e.target.checked)}
                style={{ width: 'auto', marginRight: 8 }}
              />
              Auto-upload to Drive
            </label>
          </div>
        </div>

        <div className="panel">
          <h2>Drive Upload</h2>
          <div className="small" style={{ marginBottom: 12 }}>
            Google OAuth credentials for Drive integration.
          </div>

          <label>Client ID</label>
          <input value={driveConfig.clientId} onChange={(e) => handleDriveChange('clientId', e.target.value)} />

          <label style={{ marginTop: 10 }}>Client Secret</label>
          <input value={driveConfig.clientSecret} onChange={(e) => handleDriveChange('clientSecret', e.target.value)} />

          <label style={{ marginTop: 10 }}>Refresh Token</label>
          <input value={driveConfig.refreshToken} onChange={(e) => handleDriveChange('refreshToken', e.target.value)} />

          <label style={{ marginTop: 10 }}>Folder ID (target)</label>
          <input value={driveConfig.folderId} onChange={(e) => handleDriveChange('folderId', e.target.value)} />

          <div className="section inline" style={{ marginTop: 14 }}>
            <button onClick={uploadToDrive} disabled={!articlePath}>
              Upload to Drive
            </button>
            <div className="badge">{uploadStatus || 'Awaiting draft'}</div>
          </div>
        </div>
      </div>

      {/* Quality Score Panel */}
      {qualityScore && (
        <div className="panel quality-panel" style={{ marginTop: 16 }}>
          <h2>📊 Quality Score</h2>
          <div className="quality-grid">
            <div className="quality-item">
              <div className="quality-value">{qualityScore.wordCount}</div>
              <div className="quality-label">Words</div>
            </div>
            <div className="quality-item">
              <div className="quality-value">{qualityScore.sourcesUsed}</div>
              <div className="quality-label">Sources Cited</div>
            </div>
            <div className="quality-item">
              <div className="quality-value">{qualityScore.sectionsComplete}</div>
              <div className="quality-label">Sections</div>
            </div>
            <div className="quality-item">
              <div className={`quality-value ${qualityScore.readabilityScore >= 70 ? 'good' : qualityScore.readabilityScore >= 50 ? 'ok' : 'low'}`}>
                {qualityScore.readabilityScore}
              </div>
              <div className="quality-label">Readability</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs for Draft/Research/Log */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'draft' ? 'active' : ''}`}
            onClick={() => setActiveTab('draft')}
          >
            📄 Draft
          </button>
          <button 
            className={`tab ${activeTab === 'research' ? 'active' : ''}`}
            onClick={() => setActiveTab('research')}
          >
            🔍 Research Data
          </button>
          <button 
            className={`tab ${activeTab === 'log' ? 'active' : ''}`}
            onClick={() => setActiveTab('log')}
          >
            📋 Log
          </button>
        </div>

        {activeTab === 'draft' && (
          <div className="tab-content">
            <div className="card-title">
              <div>
                {articleTitle && <h3 style={{ margin: 0 }}>{articleTitle}</h3>}
                {articlePath && <span className="badge small">Saved: {articlePath}</span>}
              </div>
              {articleContent && (
                <div className="view-controls">
                  <button 
                    className={`view-btn ${viewMode === 'preview' ? 'active' : ''}`}
                    onClick={() => setViewMode('preview')}
                  >
                    Preview
                  </button>
                  <button 
                    className={`view-btn ${viewMode === 'raw' ? 'active' : ''}`}
                    onClick={() => setViewMode('raw')}
                  >
                    Markdown
                  </button>
                  <button 
                    className={`view-btn ${viewMode === 'edit' ? 'active' : ''}`}
                    onClick={() => { setViewMode('edit'); setEditContent(articleContent); }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
            
            {articleContent ? (
              <div className="draft-container">
                {viewMode === 'preview' && (
                  <div 
                    className="markdown-preview"
                    dangerouslySetInnerHTML={{ __html: renderedContent }}
                  />
                )}
                {viewMode === 'raw' && (
                  <pre className="raw-view">{articleContent}</pre>
                )}
                {viewMode === 'edit' && (
                  <textarea
                    className="edit-view"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                )}
                
                <div className="export-controls">
                  <span className="small">Export as:</span>
                  <button onClick={() => exportAs('md')}>Markdown</button>
                  <button onClick={() => exportAs('html')}>HTML</button>
                  <button onClick={() => exportAs('txt')}>Plain Text</button>
                </div>
              </div>
            ) : (
              <div className="small">Generate a report to see the draft here.</div>
            )}

            {warnings.length > 0 && (
              <div className="warnings-panel">
                <div className="badge warning">⚠️ Warnings</div>
                <ul>
                  {warnings.map((w, i) => (
                    <li key={i} className="small">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'research' && (
          <div className="tab-content">
            {research ? (
              <div className="research-panel">
                <h3>📊 Statistics Found</h3>
                {research.statistics.length > 0 ? (
                  <div className="stats-grid">
                    {research.statistics.map((stat, i) => (
                      <div key={i} className="stat-card">
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                        <div className="stat-source">Source: {stat.source}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="small">No statistics retrieved.</div>
                )}

                <h3 style={{ marginTop: 24 }}>📚 Sources Found</h3>
                {research.results.length > 0 ? (
                  <div className="sources-list">
                    {research.results.map((result, i) => (
                      <div key={i} className="source-card">
                        <div className="source-title">{result.title}</div>
                        <div className="source-snippet">{result.snippet.slice(0, 200)}...</div>
                        {result.url && (
                          <a href={result.url} target="_blank" rel="noreferrer" className="source-link">
                            {result.source} →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="small">No sources retrieved.</div>
                )}
              </div>
            ) : (
              <div className="small">Run a report to see research data.</div>
            )}
          </div>
        )}

        {activeTab === 'log' && (
          <div className="tab-content">
            <div className="log">{log || 'No log yet.'}</div>
          </div>
        )}
      </div>

      {/* Scheduling Panel */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>⏰ Scheduling</h2>
        <div className="small" style={{ marginBottom: 10 }}>
          Create recurring runs. Schedules are stored in <code>data/schedules.json</code>.
        </div>
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div>
            <label>Topic</label>
            <textarea value={schedTopic} onChange={(e) => setSchedTopic(e.target.value)} />
          </div>
          <div>
            <label>Every (minutes)</label>
            <input
              type="number"
              min={15}
              value={schedIntervalMinutes}
              onChange={(e) => setSchedIntervalMinutes(Number(e.target.value))}
            />
            <div className="small">Minimum 15 minutes</div>
          </div>
          <div>
            <label>Auto-upload?</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={schedAutoUpload}
                onChange={(e) => setSchedAutoUpload(e.target.checked)}
              />
              Yes, upload each run
            </label>
            <button onClick={createSchedule} style={{ marginTop: 8 }}>Create Schedule</button>
          </div>
        </div>
        
        <div className="section" style={{ marginTop: 12 }}>
          <h3>Existing Schedules</h3>
          {loadingSchedules ? (
            <div className="small">Loading…</div>
          ) : schedules.length === 0 ? (
            <div className="small">No schedules yet.</div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {schedules.map((s) => (
                <div key={s.id} className="schedule-card">
                  <div className="small">Next: {new Date(s.nextRunAt).toLocaleString()}</div>
                  <div className="schedule-topic">{s.topic.slice(0, 100)}</div>
                  <div className="small">Every {s.intervalMinutes} min | Upload: {s.autoUpload ? 'Yes' : 'No'}</div>
                  {s.lastResult?.ranAt && (
                    <div className="small" style={{ marginTop: 6 }}>
                      Last: {new Date(s.lastResult.ranAt).toLocaleString()}
                      {s.lastResult.error && <div className="error-text">Error: {s.lastResult.error}</div>}
                    </div>
                  )}
                  <button onClick={() => deleteSchedule(s.id)} className="delete-btn">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
