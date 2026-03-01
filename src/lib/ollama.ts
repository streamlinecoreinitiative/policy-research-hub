export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// 5 minutes default timeout for LLM generation (large articles can take a while)
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export async function callOllamaChat(params: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  timeoutMs?: number;
}) {
  const { model, messages, temperature = 0.3, topP = 0.9, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

  if (!model) {
    throw new Error('Model is required for Ollama chat.');
  }

  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const url = `${host}/api/chat`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature,
          top_p: topP
        }
      })
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Ollama timed out after ${Math.round(timeoutMs / 1000)}s for model ${model}. The model may be overloaded or the prompt too large.`);
    }
    throw new Error(`Ollama connection failed (${model}): ${(err as Error).message}. Is Ollama running?`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new Error(`Ollama error (${res.status}) for ${model}: ${text}`);
  }

  const data = await res.json();
  const content = data?.message?.content || data?.response;

  if (!content || (typeof content === 'string' && content.trim().length === 0)) {
    throw new Error(`Empty response from Ollama (${model}). The model may not have generated any output.`);
  }

  return content as string;
}
