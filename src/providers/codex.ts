import type { AIProvider, AIResponse, ModelInfo } from '@/types/providers';
import { registerProvider } from './adapter';
import { parseOpenAIResponse, parseOpenAIStreamDelta, readSseEvents } from './parse';

/**
 * Codex CLI provider — uses OpenAI API format.
 * Codex authenticates via GitHub login (no API key needed).
 * For the web app, users can paste their OpenAI API key as a fallback.
 */
function createCodexProvider(apiKey: string): AIProvider {
  // Codex uses the same API as OpenAI
  const BASE_URL = 'https://api.openai.com/v1';

  return {
    id: 'codex',
    name: 'Codex CLI',

    async chat(messages, tools, model = 'gpt-4o') {
      const body: Record<string, unknown> = {
        model,
        messages: messages.map((m) => {
          if (m.role === 'tool') {
            return { role: 'tool' as const, tool_call_id: m.toolCallId, content: m.content };
          }
          return { role: m.role, content: m.content };
        }),
      };
      if (tools.length > 0) {
        body.tools = tools.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Codex API error ${res.status}: ${err}`);
      }

      const data: unknown = await res.json();
      return parseOpenAIResponse(data) satisfies AIResponse;
    },

    async *stream(messages, _tools, model = 'gpt-4o') {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!res.ok) throw new Error(`Codex error: ${res.status}`);

      for await (const event of readSseEvents(res.body)) {
        const content = parseOpenAIStreamDelta(event);
        if (content) yield { type: 'text' as const, content };
      }
      yield { type: 'done' as const };
    },

    listModels() {
      return Promise.resolve([
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsToolCalling: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsToolCalling: true },
      ] satisfies ModelInfo[]);
    },

    async validateKey(key: string) {
      if (!key) return true; // Codex can work without key (GitHub auth)
      try {
        const res = await fetch(`${BASE_URL}/models`, {
          headers: { 'Authorization': `Bearer ${key}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

registerProvider('codex', createCodexProvider);
