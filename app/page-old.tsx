'use client';

import { useEffect, useState } from 'react';

type RunResponse = {
  articlePath: string;
  articleTitle: string;
  articleContent: string;
  log: string;
  warnings?: string[];
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

const starterTopic = 'Environmental resilience in lower-income countries: water security, clean energy, and climate adaptation';

export default function HomePage() {
  const [topic, setTopic] = useState(starterTopic);
  const [plannerModel, setPlannerModel] = useState('qwen2.5:3b');
  const [writerModel, setWriterModel] = useState('llama3.1:8b');
  const [status, setStatus] = useState('Idle');
  const [log, setLog] = useState('');
  const [articleContent, setArticleContent] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [articlePath, setArticlePath] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
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

  const fetchSchedules = async () => {
    setLoadingSchedules(true);
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      if (res.ok) {
        setSchedules(data.schedules || []);
      }
    } catch {
      // ignore load errors in UI
    } finally {
      setLoadingSchedules(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const runAgents = async () => {
    setRunning(true);
    setStatus('Running two-agent pass...');
    setWarnings([]);
    setLog('');
    setArticleContent('');
    setArticleTitle('');
    setArticlePath('');
    setUploadStatus('');

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          plannerModel,
          writerModel,
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
      setArticleTitle(data.articleTitle);
      setArticlePath(data.articlePath);
      setWarnings(data.warnings || []);
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
      // ignore in UI
    }
  };

  return (
    <main>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <div>
            <div className="badge">Two-agent studio</div>
            <h1>Environmental briefs for emerging economies</h1>
            <div className="small">
              Planner (fast) + Writer (quality) running locally against Ollama. Trigger runs manually or schedule recurring passes, then auto-upload drafts to Drive.
            </div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <h2>Topic</h2>
          <div className="section">
            <label htmlFor="topic">What should they cover?</label>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Climate adaptation funding gaps in Southeast Asia"
            />
          </div>

          <div className="section">
            <label>Models</label>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div className="small">Planner (fast/light)</div>
                <input
                  value={plannerModel}
                  onChange={(e) => setPlannerModel(e.target.value)}
                  placeholder="qwen2.5:3b"
                />
              </div>
              <div>
                <div className="small">Writer (quality)</div>
                <input
                  value={writerModel}
                  onChange={(e) => setWriterModel(e.target.value)}
                  placeholder="llama3.1:8b"
                />
              </div>
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              Make sure these tags are pulled in Ollama. If not, try fallback like llama3:8b.
            </div>
          </div>

          <div className="section inline" style={{ marginTop: 18 }}>
            <button onClick={runAgents} disabled={running}>
              {running ? 'Running...' : 'Run two-agent pass'}
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
              Auto-upload this run to Drive
            </label>
          </div>
        </div>

        <div className="panel">
          <h2>Drive upload</h2>
          <div className="small" style={{ marginBottom: 12 }}>
            Add your Google OAuth client, secret, refresh token, and target folder id. These stay in-memory for this session unless you create schedules with auto-upload (which writes them to disk in schedules.json).
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
              Upload latest draft to Drive
            </button>
            <div className="badge">{uploadStatus || 'Awaiting draft'}</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Scheduling</h2>
        <div className="small" style={{ marginBottom: 10 }}>
          Create a recurring run (minimum 15 minutes). Scheduler runs while the Next.js server is running; schedules are stored in <code>data/schedules.json</code>.
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
            <label>Auto-upload to Drive?</label>
            <div className="section">
              <label>
                <input
                  type="checkbox"
                  checked={schedAutoUpload}
                  onChange={(e) => setSchedAutoUpload(e.target.checked)}
                  style={{ width: 'auto', marginRight: 8 }}
                />
                Yes, upload each run
              </label>
            </div>
            <button onClick={createSchedule}>Create schedule</button>
          </div>
        </div>
        <div className="section" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Existing schedules</h3>
          {loadingSchedules ? (
            <div className="small">Loading…</div>
          ) : schedules.length === 0 ? (
            <div className="small">No schedules yet.</div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {schedules.map((s) => (
                <div key={s.id} className="panel" style={{ padding: 12 }}>
                  <div className="small" style={{ marginBottom: 6 }}>
                    Next run: {new Date(s.nextRunAt).toLocaleString()}
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.topic.slice(0, 120)}</div>
                  <div className="small">Planner: {s.plannerModel}</div>
                  <div className="small">Writer: {s.writerModel}</div>
                  <div className="small">Interval: {s.intervalMinutes} min</div>
                  <div className="small">Auto-upload: {s.autoUpload ? 'Yes' : 'No'}</div>
                  {s.lastResult?.ranAt && (
                    <div className="small" style={{ marginTop: 6 }}>
                      Last: {new Date(s.lastResult.ranAt).toLocaleString()}
                      {s.lastResult.error && <div style={{ color: '#b91c1c' }}>Error: {s.lastResult.error}</div>}
                      {s.lastResult.webViewLink && (
                        <div>
                          <a href={s.lastResult.webViewLink} target="_blank" rel="noreferrer">
                            View in Drive
                          </a>
                        </div>
                      )}
                      {s.lastResult.articlePath && <div>File: {s.lastResult.articlePath}</div>}
                    </div>
                  )}
                  <div className="section inline" style={{ marginTop: 8 }}>
                    <button onClick={() => deleteSchedule(s.id)} style={{ background: '#b91c1c' }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="card-title">
            <h2>Draft</h2>
            {articlePath && <span className="badge">Saved at {articlePath}</span>}
          </div>
          {articleTitle && <h3 style={{ marginTop: 0 }}>{articleTitle}</h3>}
          {articleContent ? (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{articleContent}</div>
          ) : (
            <div className="small">Run the agents to produce a draft.</div>
          )}
        </div>

        <div className="panel">
          <div className="card-title">
            <h2>Conversation log</h2>
          </div>
          <div className="log">{log || 'No log yet.'}</div>
          {warnings.length > 0 && (
            <div className="section">
              <div className="badge">Warnings</div>
              <ul>
                {warnings.map((w) => (
                  <li key={w} className="small">{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
