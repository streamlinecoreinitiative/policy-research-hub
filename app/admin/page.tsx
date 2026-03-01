'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────

type SocialPost = {
  id: string;
  articleSlug: string;
  articleTitle: string;
  platform: 'twitter' | 'linkedin' | 'bluesky';
  content: string;
  hashtags: string[];
  url: string;
  status: 'pending' | 'posted' | 'skipped';
  createdAt: string;
  postedAt?: string;
};

type NewsletterDraft = {
  id: string;
  subject: string;
  introText: string;
  articles: { title: string; summary: string; url: string; tags: string[] }[];
  htmlContent: string;
  createdAt: string;
  status: 'draft' | 'sent';
};

type LogEntry = {
  id: string;
  timestamp: string;
  type: string;
  status: string;
  title: string;
  details?: string;
};

type AgentInfo = {
  name: string;
  status: 'active' | 'idle';
  model: string;
  role: string;
  lastActivity: string | null;
  lastTitle: string | null;
  pendingPosts?: number;
};

type SocialCredentialsMasked = {
  twitter: { enabled: boolean; apiKey: string; hasSecret: boolean; hasAccessToken: boolean; lastPosted?: string } | null;
  linkedin: { enabled: boolean; hasAccessToken: boolean; organizationId: string | null; lastPosted?: string } | null;
  bluesky: { enabled: boolean; handle: string; hasAppPassword: boolean; lastPosted?: string } | null;
  updatedAt: string;
};

type Schedule = {
  id: string;
  topic: string;
  plannerModel: string;
  writerModel: string;
  factCheckerModel?: string;
  autoUpload: boolean;
  intervalMinutes: number;
  nextRunAt: number;
  lastRunAt?: number;
  lastResult?: {
    articlePath?: string;
    error?: string;
    ranAt: number;
  };
};

type AdminData = {
  isLocal: boolean;
  agents: {
    writer: AgentInfo;
    reviewer: AgentInfo;
    social: AgentInfo;
  };
  socialCredentials: SocialCredentialsMasked | null;
  system: {
    ollamaRunning: boolean;
    ollamaModels: string[];
    lastAutoPublish: string | null;
    autoPublishLog: string[];
  };
  articles: {
    total: number;
    recent: { title: string; slug: string; publishedAt: string; status: string; wordCount: number }[];
  };
  social: {
    total: number;
    pending: number;
    posted: number;
    skipped: number;
    posts: SocialPost[];
  };
  newsletters: {
    total: number;
    drafts: number;
    sent: number;
    list: NewsletterDraft[];
  };
  subscribers: { count: number };
  schedules: { active: number; list: Schedule[] };
  logs: {
    stats: {
      total: number;
      last24h: number;
      last7d: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      lastActivity: string | null;
    };
    recent: LogEntry[];
  };
};

type Tab = 'overview' | 'social' | 'newsletters' | 'schedules' | 'logs' | 'generate' | 'accounts';

// ─── Helpers ───────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function platformIcon(p: string) {
  if (p === 'twitter') return '𝕏';
  if (p === 'linkedin') return 'in';
  if (p === 'bluesky') return '🦋';
  return '•';
}

function statusColor(s: string) {
  if (s === 'success' || s === 'posted' || s === 'published') return '#059669';
  if (s === 'warning' || s === 'pending' || s === 'draft') return '#d97706';
  if (s === 'error' || s === 'skipped') return '#dc2626';
  return '#6b7280';
}

// ─── Component ─────────────────────────────────────────────────

export default function AdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [actionStatus, setActionStatus] = useState('');

  // Generate page state
  const [genTopic, setGenTopic] = useState('Environmental resilience in lower-income countries: water security, clean energy, and climate adaptation');
  const [genTemplate, setGenTemplate] = useState('policy-brief');
  const [genDepth, setGenDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [genPlannerModel, setGenPlannerModel] = useState('qwen3:4b');
  const [genWriterModel, setGenWriterModel] = useState('qwen3:8b');
  const [genFactModel, setGenFactModel] = useState('bespoke-minicheck:7b');
  const [genRunning, setGenRunning] = useState(false);
  const [genResult, setGenResult] = useState<{ title?: string; status?: string; log?: string; warnings?: string[] } | null>(null);

  // Newsletter preview
  const [previewHtml, setPreviewHtml] = useState('');

  // Credentials form state
  const [credsPlatform, setCredsPlatform] = useState<'twitter' | 'linkedin' | 'bluesky'>('twitter');
  const [credsForm, setCredsForm] = useState<Record<string, string>>({});
  const [credsEnabled, setCredsEnabled] = useState(true);
  const [credsSaving, setCredsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status');
      if (!res.ok) throw new Error('Failed to load admin data');
      const json = await res.json();
      setData(json);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ─── Actions ──────────────────────────────────────────────────

  const saveCredentials = async () => {
    setCredsSaving(true);
    setActionStatus(`Saving ${credsPlatform} credentials...`);
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: credsPlatform,
          credentials: credsForm,
          enabled: credsEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setActionStatus(`${credsPlatform} credentials saved!`);
      setCredsForm({});
      await fetchData();
    } catch (err) {
      setActionStatus(`Failed: ${(err as Error).message}`);
    } finally {
      setCredsSaving(false);
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  const updateSocialPost = async (postId: string, status: 'posted' | 'skipped') => {
    setActionStatus('Updating post...');
    try {
      await fetch('/api/social', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, status }),
      });
      await fetchData();
      setActionStatus(`Post marked as ${status}`);
    } catch {
      setActionStatus('Failed to update post');
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  const doGenerateNewsletter = async () => {
    setActionStatus('Generating newsletter draft...');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen3:4b', daysBack: 7 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setActionStatus(`Newsletter drafted: "${json.newsletter.subject}"`);
      await fetchData();
    } catch (err) {
      setActionStatus(`Newsletter failed: ${(err as Error).message}`);
    }
    setTimeout(() => setActionStatus(''), 5000);
  };

  const fixSchedules = async () => {
    setActionStatus('Fixing schedule models...');
    try {
      const res = await fetch('/api/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fix-schedule' }),
      });
      const json = await res.json();
      setActionStatus(`Fixed ${json.fixed} model references`);
      await fetchData();
    } catch {
      setActionStatus('Failed to fix schedules');
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  const deleteSchedule = async (id: string) => {
    try {
      await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      await fetchData();
      setActionStatus('Schedule deleted');
    } catch {
      setActionStatus('Failed to delete schedule');
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  const runGenerate = async () => {
    setGenRunning(true);
    setGenResult(null);
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: genTopic,
          plannerModel: genPlannerModel,
          writerModel: genWriterModel,
          factCheckerModel: genFactModel,
          templateId: genTemplate,
          researchDepth: genDepth,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setGenResult({
        title: json.articleTitle,
        status: json.status,
        log: json.log,
        warnings: json.warnings,
      });
      await fetchData();
    } catch (err) {
      setGenResult({ title: 'Error', status: 'error', log: (err as Error).message });
    } finally {
      setGenRunning(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="admin-dash">
        <div className="admin-loading">
          <div className="spinner" />
          <p>Loading Command Center...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="admin-dash">
        <div className="admin-error">
          <h2>Connection Error</h2>
          <p>{error}</p>
          <button onClick={fetchData} className="admin-btn primary">Retry</button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="admin-dash">
      {/* Header with Agent Avatars */}
      <div className="admin-header">
        <div>
          <h1>Command Center</h1>
          <p className="admin-subtitle">
            {data.isLocal ? '🟢 Running locally' : '🌐 Remote access'} • Last refresh: {new Date().toLocaleTimeString()}
          </p>
        </div>
        <div className="admin-header-actions">
          {actionStatus && <span className="admin-toast">{actionStatus}</span>}
          <button onClick={fetchData} className="admin-btn secondary">↻ Refresh</button>
        </div>
      </div>

      {/* Agent Avatars */}
      <div className="agent-avatars">
        {([
          { key: 'writer', icon: '✍️', data: data.agents.writer },
          { key: 'reviewer', icon: '🔍', data: data.agents.reviewer },
          { key: 'social', icon: '📢', data: data.agents.social },
        ] as const).map(agent => (
          <div
            key={agent.key}
            className={`agent-avatar ${agent.data.status}`}
            title={`${agent.data.name}: ${agent.data.role}\nModel: ${agent.data.model}${agent.data.lastActivity ? '\nLast activity: ' + timeAgo(agent.data.lastActivity) : ''}`}
          >
            <div className="agent-avatar-icon">
              <span className="agent-emoji">{agent.icon}</span>
              <span className={`agent-status-dot ${agent.data.status}`} />
            </div>
            <div className="agent-avatar-info">
              <span className="agent-name">{agent.data.name}</span>
              <span className={`agent-status-label ${agent.data.status}`}>
                {agent.data.status === 'active' ? '● Working' : '○ Resting'}
              </span>
            </div>
            {agent.data.lastActivity && (
              <span className="agent-last-active">{timeAgo(agent.data.lastActivity)}</span>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <nav className="admin-tabs">
        {([
          ['overview', '📊 Overview'],
          ['generate', '🚀 Generate'],
          ['social', '📱 Social Queue'],
          ['accounts', '🔑 Accounts'],
          ['newsletters', '📧 Newsletters'],
          ['schedules', '⏰ Schedules'],
          ['logs', '📋 Activity Log'],
        ] as [Tab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
            {tab === 'social' && data.social.pending > 0 && (
              <span className="admin-badge">{data.social.pending}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="admin-content">

        {/* ═══════ OVERVIEW ═══════ */}
        {activeTab === 'overview' && (
          <div className="admin-overview">
            <div className="admin-stat-grid">
              <div className="admin-stat-card">
                <div className="stat-number">{data.articles.total}</div>
                <div className="stat-label">Published Articles</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-number">{data.subscribers.count}</div>
                <div className="stat-label">Subscribers</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-number" style={{ color: data.social.pending > 0 ? '#d97706' : '#059669' }}>
                  {data.social.pending}
                </div>
                <div className="stat-label">Pending Social Posts</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-number">{data.newsletters.drafts}</div>
                <div className="stat-label">Newsletter Drafts</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-number">{data.logs.stats.last24h}</div>
                <div className="stat-label">Activity (24h)</div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-number" style={{ color: data.system.ollamaRunning ? '#059669' : '#dc2626' }}>
                  {data.system.ollamaRunning ? '●' : '○'}
                </div>
                <div className="stat-label">Ollama {data.system.ollamaRunning ? 'Online' : 'Offline'}</div>
              </div>
            </div>

            <div className="admin-section-grid">
              <div className="admin-panel">
                <h3>System Status</h3>
                <div className="admin-info-list">
                  <div className="info-row">
                    <span className="info-label">Ollama</span>
                    <span className={`info-value ${data.system.ollamaRunning ? 'good' : 'bad'}`}>
                      {data.system.ollamaRunning ? '● Running' : '○ Not running'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Models Installed</span>
                    <span className="info-value">{data.system.ollamaModels.length}</span>
                  </div>
                  {data.system.ollamaModels.map(m => (
                    <div key={m} className="info-row sub">
                      <span className="info-label">  └ {m}</span>
                    </div>
                  ))}
                  <div className="info-row">
                    <span className="info-label">Auto-Publish</span>
                    <span className="info-value">
                      {data.system.lastAutoPublish || 'No activity recorded'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Active Schedules</span>
                    <span className="info-value">{data.schedules.active}</span>
                  </div>
                </div>
              </div>

              <div className="admin-panel">
                <h3>Recent Articles</h3>
                {data.articles.recent.length === 0 ? (
                  <p className="admin-empty">No recent articles</p>
                ) : (
                  <div className="admin-article-list">
                    {data.articles.recent.map(a => (
                      <div key={a.slug} className="admin-article-item">
                        <div className="admin-article-title">{a.title}</div>
                        <div className="admin-article-meta">
                          <span className="admin-pill" style={{ background: a.status === 'published' ? '#d1fae5' : '#fef3c7', color: a.status === 'published' ? '#065f46' : '#92400e' }}>
                            {a.status}
                          </span>
                          <span>{a.wordCount} words</span>
                          <span>{timeAgo(a.publishedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-panel">
              <h3>Quick Actions</h3>
              <div className="admin-actions-row">
                <button className="admin-btn primary" onClick={() => setActiveTab('generate')}>
                  🚀 Generate New Article
                </button>
                <button className="admin-btn secondary" onClick={doGenerateNewsletter}>
                  📧 Generate Newsletter
                </button>
                <button className="admin-btn secondary" onClick={() => setActiveTab('social')}>
                  📱 Review Social Posts ({data.social.pending} pending)
                </button>
                {data.schedules.list.some(s => s.lastResult?.error) && (
                  <button className="admin-btn warning" onClick={fixSchedules}>
                    ⚠️ Fix Broken Schedules
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ GENERATE ═══════ */}
        {activeTab === 'generate' && (
          <div className="admin-generate">
            <div className="admin-panel">
              <h3>Generate New Article</h3>
              <div className="admin-form">
                <div className="form-group">
                  <label>Topic</label>
                  <textarea
                    value={genTopic}
                    onChange={e => setGenTopic(e.target.value)}
                    placeholder="What should the report cover?"
                    rows={3}
                  />
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label>Template</label>
                    <select value={genTemplate} onChange={e => setGenTemplate(e.target.value)}>
                      <option value="policy-brief">Policy Brief</option>
                      <option value="research-summary">Research Summary</option>
                      <option value="grant-proposal">Grant Proposal</option>
                      <option value="executive-briefing">Executive Briefing</option>
                      <option value="situation-report">Situation Report</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Research Depth</label>
                    <select value={genDepth} onChange={e => setGenDepth(e.target.value as 'quick' | 'standard' | 'deep')}>
                      <option value="quick">Quick</option>
                      <option value="standard">Standard</option>
                      <option value="deep">Deep</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fact-Checker</label>
                    <input value={genFactModel} onChange={e => setGenFactModel(e.target.value)} />
                  </div>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Planner Model</label>
                    <input value={genPlannerModel} onChange={e => setGenPlannerModel(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Writer Model</label>
                    <input value={genWriterModel} onChange={e => setGenWriterModel(e.target.value)} />
                  </div>
                </div>
                <button
                  className="admin-btn primary large"
                  onClick={runGenerate}
                  disabled={genRunning || !genTopic.trim()}
                >
                  {genRunning ? '⏳ Generating...' : '🚀 Generate Report'}
                </button>
              </div>
            </div>

            {genResult && (
              <div className="admin-panel" style={{ marginTop: 16 }}>
                <h3>
                  Result: <span style={{ color: statusColor(genResult.status || '') }}>{genResult.status}</span>
                </h3>
                {genResult.title && <p style={{ fontSize: 18, fontWeight: 600 }}>{genResult.title}</p>}
                {genResult.warnings && genResult.warnings.length > 0 && (
                  <div className="admin-warnings">
                    {genResult.warnings.map((w, i) => (
                      <div key={i} className="warning-item">⚠️ {w}</div>
                    ))}
                  </div>
                )}
                {genResult.log && (
                  <details>
                    <summary className="admin-details-toggle">View Full Pipeline Log</summary>
                    <pre className="admin-log-block">{genResult.log}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════ SOCIAL QUEUE ═══════ */}
        {activeTab === 'social' && (
          <div className="admin-social">
            <div className="admin-section-header">
              <h3>Social Media Queue</h3>
              <div className="admin-filter-pills">
                <span className="admin-pill">All ({data.social.total})</span>
                <span className="admin-pill" style={{ color: '#d97706' }}>Pending ({data.social.pending})</span>
                <span className="admin-pill" style={{ color: '#059669' }}>Posted ({data.social.posted})</span>
                <span className="admin-pill" style={{ color: '#dc2626' }}>Skipped ({data.social.skipped})</span>
              </div>
            </div>

            <div className="admin-info-box">
              <strong>How it works:</strong> Social posts are auto-generated when articles pass QA and get published.
              Posts go into this queue for your review. Copy the content to your social media accounts,
              then mark as &quot;Posted&quot;. Skip posts you don&apos;t want to use.
            </div>

            {data.social.posts.length === 0 ? (
              <div className="admin-empty-state">
                <p>No social posts yet. They&apos;ll appear here after articles are published.</p>
              </div>
            ) : (
              <div className="admin-social-grid">
                {data.social.posts.map(post => (
                  <div key={post.id} className={`admin-social-card ${post.status}`}>
                    <div className="social-card-header">
                      <span className="platform-badge" data-platform={post.platform}>
                        {platformIcon(post.platform)} {post.platform}
                      </span>
                      <span className="admin-pill" style={{ background: statusColor(post.status) + '20', color: statusColor(post.status) }}>
                        {post.status}
                      </span>
                    </div>
                    <div className="social-card-article">{post.articleTitle}</div>
                    <div className="social-card-content">{post.content}</div>
                    <div className="social-card-hashtags">
                      {post.hashtags.map(h => (
                        <span key={h} className="hashtag">#{h}</span>
                      ))}
                    </div>
                    <div className="social-card-footer">
                      <span className="social-card-time">{timeAgo(post.createdAt)}</span>
                      <a href={post.url} target="_blank" rel="noreferrer" className="social-card-link">View article →</a>
                    </div>
                    {post.status === 'pending' && (
                      <div className="social-card-actions">
                        <button
                          className="admin-btn small copy"
                          onClick={() => {
                            const text = `${post.content}\n\n${post.hashtags.map(h => '#' + h).join(' ')}\n\n${post.url}`;
                            navigator.clipboard.writeText(text);
                            setActionStatus('Copied to clipboard!');
                            setTimeout(() => setActionStatus(''), 2000);
                          }}
                        >
                          📋 Copy
                        </button>
                        <button
                          className="admin-btn small success"
                          onClick={() => updateSocialPost(post.id, 'posted')}
                        >
                          ✓ Posted
                        </button>
                        <button
                          className="admin-btn small danger"
                          onClick={() => updateSocialPost(post.id, 'skipped')}
                        >
                          ✕ Skip
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ ACCOUNTS ═══════ */}
        {activeTab === 'accounts' && (
          <div className="admin-accounts">
            <div className="admin-section-header">
              <h3>Social Media Accounts</h3>
            </div>

            <div className="admin-info-box">
              <strong>Connect your accounts:</strong> Add API credentials for each platform to enable auto-posting
              in the future. Credentials are stored locally only and never sent to Vercel.
              {!data.isLocal && (
                <span style={{ color: '#dc2626', display: 'block', marginTop: 8 }}>
                  ⚠️ Credentials can only be configured when running locally.
                </span>
              )}
            </div>

            {/* Current connection status */}
            <div className="admin-accounts-grid">
              {/* Twitter/X */}
              <div className={`admin-account-card ${data.socialCredentials?.twitter?.enabled ? 'connected' : 'disconnected'}`}>
                <div className="account-card-header">
                  <span className="account-icon">𝕏</span>
                  <span className="account-name">Twitter / X</span>
                  <span className={`account-status-dot ${data.socialCredentials?.twitter?.enabled ? 'on' : 'off'}`} />
                </div>
                <div className="account-status-text">
                  {data.socialCredentials?.twitter?.enabled
                    ? `Connected • Key: ${data.socialCredentials.twitter.apiKey}`
                    : 'Not connected'}
                </div>
                {data.socialCredentials?.twitter?.lastPosted && (
                  <div className="account-last-post">Last posted: {timeAgo(data.socialCredentials.twitter.lastPosted)}</div>
                )}
              </div>

              {/* LinkedIn */}
              <div className={`admin-account-card ${data.socialCredentials?.linkedin?.enabled ? 'connected' : 'disconnected'}`}>
                <div className="account-card-header">
                  <span className="account-icon">in</span>
                  <span className="account-name">LinkedIn</span>
                  <span className={`account-status-dot ${data.socialCredentials?.linkedin?.enabled ? 'on' : 'off'}`} />
                </div>
                <div className="account-status-text">
                  {data.socialCredentials?.linkedin?.enabled
                    ? `Connected • Token: ✓`
                    : 'Not connected'}
                </div>
                {data.socialCredentials?.linkedin?.lastPosted && (
                  <div className="account-last-post">Last posted: {timeAgo(data.socialCredentials.linkedin.lastPosted)}</div>
                )}
              </div>

              {/* Bluesky */}
              <div className={`admin-account-card ${data.socialCredentials?.bluesky?.enabled ? 'connected' : 'disconnected'}`}>
                <div className="account-card-header">
                  <span className="account-icon">🦋</span>
                  <span className="account-name">Bluesky</span>
                  <span className={`account-status-dot ${data.socialCredentials?.bluesky?.enabled ? 'on' : 'off'}`} />
                </div>
                <div className="account-status-text">
                  {data.socialCredentials?.bluesky?.enabled
                    ? `Connected • ${data.socialCredentials.bluesky.handle}`
                    : 'Not connected'}
                </div>
                {data.socialCredentials?.bluesky?.lastPosted && (
                  <div className="account-last-post">Last posted: {timeAgo(data.socialCredentials.bluesky.lastPosted)}</div>
                )}
              </div>
            </div>

            {/* Credentials form (local only) */}
            {data.isLocal && (
              <div className="admin-panel" style={{ marginTop: 20 }}>
                <h3>Configure Platform</h3>
                <div className="admin-form">
                  <div className="form-group">
                    <label>Platform</label>
                    <select
                      value={credsPlatform}
                      onChange={e => {
                        setCredsPlatform(e.target.value as 'twitter' | 'linkedin' | 'bluesky');
                        setCredsForm({});
                      }}
                    >
                      <option value="twitter">Twitter / X</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="bluesky">Bluesky</option>
                    </select>
                  </div>

                  {credsPlatform === 'twitter' && (
                    <>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>API Key</label>
                          <input
                            type="text"
                            placeholder="Your Twitter API key"
                            value={credsForm.apiKey || ''}
                            onChange={e => setCredsForm({ ...credsForm, apiKey: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>API Secret</label>
                          <input
                            type="password"
                            placeholder="Your Twitter API secret"
                            value={credsForm.apiSecret || ''}
                            onChange={e => setCredsForm({ ...credsForm, apiSecret: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>Access Token</label>
                          <input
                            type="text"
                            placeholder="OAuth access token"
                            value={credsForm.accessToken || ''}
                            onChange={e => setCredsForm({ ...credsForm, accessToken: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Access Token Secret</label>
                          <input
                            type="password"
                            placeholder="OAuth access token secret"
                            value={credsForm.accessTokenSecret || ''}
                            onChange={e => setCredsForm({ ...credsForm, accessTokenSecret: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="admin-info-box" style={{ marginTop: 8 }}>
                        Get these from <a href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noreferrer">X Developer Portal</a> → Your app → Keys and tokens
                      </div>
                    </>
                  )}

                  {credsPlatform === 'linkedin' && (
                    <>
                      <div className="form-group">
                        <label>Access Token</label>
                        <input
                          type="password"
                          placeholder="LinkedIn OAuth2 access token"
                          value={credsForm.accessToken || ''}
                          onChange={e => setCredsForm({ ...credsForm, accessToken: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Organization ID (optional, for company pages)</label>
                        <input
                          type="text"
                          placeholder="e.g. 12345678"
                          value={credsForm.organizationId || ''}
                          onChange={e => setCredsForm({ ...credsForm, organizationId: e.target.value })}
                        />
                      </div>
                      <div className="admin-info-box" style={{ marginTop: 8 }}>
                        Get token from <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer">LinkedIn Developers</a> → Your app → Auth → Generate token
                      </div>
                    </>
                  )}

                  {credsPlatform === 'bluesky' && (
                    <>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label>Handle</label>
                          <input
                            type="text"
                            placeholder="yourname.bsky.social"
                            value={credsForm.handle || ''}
                            onChange={e => setCredsForm({ ...credsForm, handle: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>App Password</label>
                          <input
                            type="password"
                            placeholder="App-specific password"
                            value={credsForm.appPassword || ''}
                            onChange={e => setCredsForm({ ...credsForm, appPassword: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="admin-info-box" style={{ marginTop: 8 }}>
                        Go to <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noreferrer">Bluesky Settings</a> → App Passwords → Add App Password
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={credsEnabled}
                        onChange={e => setCredsEnabled(e.target.checked)}
                      />
                      Enable auto-posting for {credsPlatform}
                    </label>
                  </div>

                  <button
                    className="admin-btn primary"
                    onClick={saveCredentials}
                    disabled={credsSaving}
                    style={{ marginTop: 12 }}
                  >
                    {credsSaving ? '⏳ Saving...' : '💾 Save Credentials'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ NEWSLETTERS ═══════ */}
        {activeTab === 'newsletters' && (
          <div className="admin-newsletters">
            <div className="admin-section-header">
              <h3>Newsletter Management</h3>
              <div>
                <span style={{ marginRight: 12 }}>📬 {data.subscribers.count} subscribers</span>
                <button className="admin-btn primary" onClick={doGenerateNewsletter}>
                  Generate New Digest
                </button>
              </div>
            </div>

            <div className="admin-info-box">
              <strong>How it works:</strong> The Newsletter Agent compiles recent articles into a weekly digest
              with an AI-written intro. Click &quot;Generate New Digest&quot; to create a draft. Preview the HTML,
              copy it, and paste into your email sender (Mailchimp, Buttondown, etc).
            </div>

            {data.newsletters.list.length === 0 ? (
              <div className="admin-empty-state">
                <p>No newsletters yet. Generate your first digest above.</p>
              </div>
            ) : (
              <div className="admin-newsletter-list">
                {data.newsletters.list.map(nl => (
                  <div key={nl.id} className="admin-newsletter-card">
                    <div className="newsletter-card-header">
                      <h4>{nl.subject}</h4>
                      <span className="admin-pill" style={{ background: nl.status === 'draft' ? '#fef3c7' : '#d1fae5', color: nl.status === 'draft' ? '#92400e' : '#065f46' }}>
                        {nl.status}
                      </span>
                    </div>
                    <p className="newsletter-intro">{nl.introText.slice(0, 200)}...</p>
                    <div className="newsletter-meta">
                      <span>{nl.articles.length} articles</span>
                      <span>{timeAgo(nl.createdAt)}</span>
                    </div>
                    <div className="newsletter-actions">
                      <button
                        className="admin-btn small secondary"
                        onClick={() => setPreviewHtml(previewHtml === nl.id ? '' : nl.id)}
                      >
                        {previewHtml === nl.id ? 'Hide Preview' : '👁 Preview'}
                      </button>
                      <button
                        className="admin-btn small copy"
                        onClick={() => {
                          navigator.clipboard.writeText(nl.htmlContent);
                          setActionStatus('HTML copied to clipboard!');
                          setTimeout(() => setActionStatus(''), 2000);
                        }}
                      >
                        📋 Copy HTML
                      </button>
                    </div>
                    {previewHtml === nl.id && (
                      <div className="newsletter-preview">
                        <iframe
                          srcDoc={nl.htmlContent}
                          title="Newsletter Preview"
                          style={{ width: '100%', height: 500, border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 12 }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ SCHEDULES ═══════ */}
        {activeTab === 'schedules' && (
          <div className="admin-schedules">
            <div className="admin-section-header">
              <h3>Automated Schedules</h3>
              {data.schedules.list.some(s => s.lastResult?.error) && (
                <button className="admin-btn warning" onClick={fixSchedules}>
                  ⚠️ Fix Broken Models
                </button>
              )}
            </div>

            <div className="admin-info-box">
              <strong>How scheduling works:</strong> Schedules run articles on an interval while the dev server is running.
              The auto-publish script (<code>scripts/auto-publish.sh</code>) commits and pushes to GitHub,
              triggering Vercel deploys.
            </div>

            <div className="admin-panel" style={{ marginBottom: 16 }}>
              <h4>Auto-Publish Status</h4>
              <div className="admin-info-list">
                <div className="info-row">
                  <span className="info-label">Script</span>
                  <span className="info-value">scripts/auto-publish.sh</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Last Activity</span>
                  <span className="info-value">{data.system.lastAutoPublish || 'No activity recorded'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Status</span>
                  <span className="info-value" style={{ color: '#d97706' }}>
                    ⚠️ Needs launchd plist — see setup below
                  </span>
                </div>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary className="admin-details-toggle">Setup Instructions (macOS launchd)</summary>
                <div className="admin-code-block">
                  <p>To set up daily auto-publish at 6 AM, run these commands in Terminal:</p>
                  <pre>{`# 1. Create the launchd plist
cat > ~/Library/LaunchAgents/com.policyresearchhub.autopublish.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.policyresearchhub.autopublish</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/anon/Downloads/agents workign/scripts/auto-publish.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>6</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/autopublish.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/autopublish.stderr.log</string>
</dict>
</plist>
EOF

# 2. Load it
launchctl load ~/Library/LaunchAgents/com.policyresearchhub.autopublish.plist

# 3. Verify
launchctl list | grep policyresearchhub`}</pre>
                </div>
              </details>

              {data.system.autoPublishLog.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary className="admin-details-toggle">Auto-Publish Log ({data.system.autoPublishLog.length} entries)</summary>
                  <pre className="admin-log-block">{data.system.autoPublishLog.join('\n')}</pre>
                </details>
              )}
            </div>

            {data.schedules.list.length === 0 ? (
              <div className="admin-empty-state">
                <p>No active schedules.</p>
              </div>
            ) : (
              <div className="admin-schedule-list">
                {data.schedules.list.map(s => (
                  <div key={s.id} className={`admin-schedule-card ${s.lastResult?.error ? 'error' : ''}`}>
                    <div className="schedule-card-header">
                      <span className="schedule-interval">Every {s.intervalMinutes} min</span>
                      {s.lastResult?.error && <span className="admin-pill" style={{ background: '#fee2e2', color: '#991b1b' }}>Error</span>}
                    </div>
                    <div className="schedule-topic">{s.topic.slice(0, 120)}</div>
                    <div className="schedule-meta">
                      <div>Planner: <code>{s.plannerModel}</code></div>
                      <div>Writer: <code>{s.writerModel}</code></div>
                      {s.factCheckerModel && <div>Fact-checker: <code>{s.factCheckerModel}</code></div>}
                      <div>Next run: {new Date(s.nextRunAt).toLocaleString()}</div>
                      {s.lastRunAt && <div>Last run: {new Date(s.lastRunAt).toLocaleString()}</div>}
                    </div>
                    {s.lastResult?.error && (
                      <div className="schedule-error">{s.lastResult.error}</div>
                    )}
                    <div className="schedule-actions">
                      <button className="admin-btn small danger" onClick={() => deleteSchedule(s.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ ACTIVITY LOG ═══════ */}
        {activeTab === 'logs' && (
          <div className="admin-logs">
            <div className="admin-section-header">
              <h3>Activity Log</h3>
              <div className="admin-log-stats">
                <span>Total: {data.logs.stats.total}</span>
                <span>24h: {data.logs.stats.last24h}</span>
                <span>7d: {data.logs.stats.last7d}</span>
              </div>
            </div>

            {data.logs.stats.total > 0 && (
              <div className="admin-log-type-pills">
                {Object.entries(data.logs.stats.byType).map(([type, count]) => (
                  <span key={type} className="admin-pill">{type}: {count}</span>
                ))}
              </div>
            )}

            {data.logs.recent.length === 0 ? (
              <div className="admin-empty-state">
                <p>No activity logged yet. Logs will appear here as agents run.</p>
              </div>
            ) : (
              <div className="admin-log-list">
                {data.logs.recent.map(entry => (
                  <div key={entry.id} className={`admin-log-entry ${entry.status}`}>
                    <div className="log-entry-header">
                      <span className="log-dot" style={{ background: statusColor(entry.status) }} />
                      <span className="log-type">{entry.type}</span>
                      <span className="log-time">{timeAgo(entry.timestamp)}</span>
                    </div>
                    <div className="log-title">{entry.title}</div>
                    {entry.details && <div className="log-details">{entry.details}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
