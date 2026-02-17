export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function callOllamaChat(params: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
}) {
  const { model, messages, temperature = 0.3, topP = 0.9 } = params;

  if (!model) {
    throw new Error('Model is required for Ollama chat.');
  }

  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const url = `${host}/api/chat`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content = data?.message?.content || data?.response;

  if (!content) {
    throw new Error('Empty response from Ollama.');
  }

  return content as string;
}
