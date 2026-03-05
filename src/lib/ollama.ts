export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// Keep calls bounded so one wedged generation doesn't block the scheduler.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1200;
const MODEL_CACHE_TTL_MS = 60_000;

let _cachedModels: { names: string[]; expiresAt: number } | null = null;

function normalizeModelName(name: string) {
  return name.trim().toLowerCase();
}

function parseModelSizeB(name: string): number | null {
  const m = normalizeModelName(name).match(/:(\d+(?:\.\d+)?)b\b/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function findCandidateMatch(installed: string[], candidate: string): string | undefined {
  const target = normalizeModelName(candidate);
  return installed.find((name) => {
    const normalized = normalizeModelName(name);
    return normalized === target || normalized.startsWith(`${target}-`);
  });
}

function pickClosestByRole(installed: string[], role: 'planner' | 'writer'): string | undefined {
  if (installed.length === 0) return undefined;
  const targetSize = role === 'planner' ? 4 : 9;

  return [...installed]
    .map((model) => ({
      model,
      size: parseModelSizeB(model),
    }))
    .sort((a, b) => {
      const aScore = a.size == null ? Number.POSITIVE_INFINITY : Math.abs(a.size - targetSize);
      const bScore = b.size == null ? Number.POSITIVE_INFINITY : Math.abs(b.size - targetSize);
      if (aScore !== bScore) return aScore - bScore;
      const aSize = a.size == null ? Number.POSITIVE_INFINITY : a.size;
      const bSize = b.size == null ? Number.POSITIVE_INFINITY : b.size;
      if (role === 'writer' && aSize !== bSize) return bSize - aSize;
      if (role === 'planner' && aSize !== bSize) return aSize - bSize;
      return a.model.localeCompare(b.model);
    })[0]?.model;
}

function isTransientOllamaError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes('terminated') ||
    m.includes('econnreset') ||
    m.includes('socket hang up') ||
    m.includes('fetch failed') ||
    m.includes('networkerror') ||
    m.includes('other side closed') ||
    m.includes('operation was aborted') ||
    m.includes('aborterror') ||
    m.includes('stream interrupted')
  );
}

function getOllamaHost() {
  return process.env.OLLAMA_HOST || 'http://localhost:11434';
}

export async function listInstalledOllamaModels(forceRefresh = false): Promise<string[]> {
  const now = Date.now();
  if (!forceRefresh && _cachedModels && _cachedModels.expiresAt > now) {
    return _cachedModels.names;
  }

  try {
    const res = await fetch(`${getOllamaHost()}/api/tags`, { method: 'GET' });
    if (!res.ok) return _cachedModels?.names || [];
    const data = await res.json().catch(() => ({} as any));
    const raw = Array.isArray(data?.models) ? data.models : [];
    const names: string[] = Array.from(new Set<string>(raw
      .map((m: any) => String(m?.name || m?.model || '').trim())
      .filter(Boolean)));
    _cachedModels = { names, expiresAt: now + MODEL_CACHE_TTL_MS };
    return names;
  } catch {
    return _cachedModels?.names || [];
  }
}

export async function resolveQwenModel(
  preferredModel: string,
  role: 'planner' | 'writer'
): Promise<string> {
  if (!preferredModel || !preferredModel.toLowerCase().includes('qwen3')) {
    return preferredModel;
  }

  const installed = await listInstalledOllamaModels();
  if (installed.length === 0) return preferredModel;

  const preferredExact = findCandidateMatch(installed, preferredModel);
  if (preferredExact) return preferredExact;

  const plannerCandidates = ['qwen3.5:4b', 'qwen3:4b'];
  const writerCandidates = ['qwen3.5:9b', 'qwen3:8b', 'qwen3:4b'];
  const candidates = role === 'planner' ? plannerCandidates : writerCandidates;

  for (const model of candidates) {
    const matched = findCandidateMatch(installed, model);
    if (matched) return matched;
  }

  const qwen35Installed = installed.filter((name) => /^qwen3\.5(?::|$)/i.test(name));
  const qwen3Installed = installed.filter(
    (name) => /^qwen3(?::|$)/i.test(name) && !/^qwen3\.5(?::|$)/i.test(name)
  );

  const qwen35Fallback = pickClosestByRole(qwen35Installed, role);
  if (qwen35Fallback) return qwen35Fallback;

  const qwen3Fallback = pickClosestByRole(qwen3Installed, role);
  if (qwen3Fallback) return qwen3Fallback;

  return preferredModel;
}

export async function resolveFactCheckerModel(
  preferredFactChecker: string,
  writerModel: string
): Promise<string> {
  const installed = new Set(await listInstalledOllamaModels());
  if (installed.size === 0) return preferredFactChecker;
  if (preferredFactChecker && installed.has(preferredFactChecker)) return preferredFactChecker;
  if (writerModel && installed.has(writerModel)) return writerModel;
  return preferredFactChecker || writerModel;
}

export async function callOllamaChat(params: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  timeoutMs?: number;
  keepAlive?: number | string;
  maxTokens?: number;
}) {
  const {
    model,
    messages,
    temperature = 0.3,
    topP = 0.9,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    keepAlive = 0,
    maxTokens = 1800
  } = params;

  if (!model) {
    throw new Error('Model is required for Ollama chat.');
  }

  const url = `${getOllamaHost()}/api/chat`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Use streaming mode to prevent Node.js undici 300s idle-connection timeout.
      // With stream:false, Ollama sends nothing until done, causing undici to kill
      // the TCP connection after its default headersTimeout (300s). With stream:true,
      // tokens flow continuously so the connection stays alive.
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          think: false,
          keep_alive: keepAlive,
          options: {
            temperature,
            top_p: topP,
            num_predict: maxTokens
          }
        })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'unknown error');
        throw new Error(`Ollama error (${res.status}) for ${model}: ${text}`);
      }

      // Accumulate streamed response chunks into full content
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error(`No response body from Ollama (${model}).`);
      }

      const decoder = new TextDecoder();
      let content = '';
      let buffered = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Stream chunks can cut JSON lines in the middle; keep a carry-over buffer.
          buffered += decoder.decode(value, { stream: true });
          const lines = buffered.split('\n');
          buffered = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const obj = JSON.parse(trimmed);
              if (obj.message?.content) {
                content += obj.message.content;
              }
              // obj.done === true on the last chunk
            } catch {
              // Skip malformed lines.
            }
          }
        }

        const trailing = buffered.trim();
        if (trailing) {
          try {
            const obj = JSON.parse(trailing);
            if (obj.message?.content) content += obj.message.content;
          } catch {
            // Ignore trailing parse failures.
          }
        }
      } catch (err) {
        throw new Error(`Ollama stream interrupted (${model}): ${(err as Error).message}`);
      } finally {
        reader.releaseLock();
      }

      if (!content || content.trim().length === 0) {
        throw new Error(`Empty response from Ollama (${model}). The model may not have generated any output.`);
      }

      clearTimeout(timeout);
      return content;
    } catch (err) {
      clearTimeout(timeout);

      // If our timeout controller aborted the request while reading the stream,
      // undici can surface a generic "This operation was aborted" error.
      if (controller.signal.aborted) {
        throw new Error(`Ollama timed out after ${Math.round(timeoutMs / 1000)}s for model ${model}. The model may be overloaded or the prompt too large.`);
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Ollama timed out after ${Math.round(timeoutMs / 1000)}s for model ${model}. The model may be overloaded or the prompt too large.`);
      }

      const msg = (err as Error).message || String(err);
      lastError = new Error(msg);

      if (attempt <= MAX_RETRIES && isTransientOllamaError(msg)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }

      throw new Error(`Ollama connection failed (${model}): ${msg}. Is Ollama running?`);
    }
  }

  throw new Error(`Ollama request failed (${model}): ${lastError?.message || 'unknown error'}`);
}
