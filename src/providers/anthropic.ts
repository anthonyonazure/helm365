import type { AIProvider, Message, ToolDefinition, AIResponse, ModelInfo } from '@/types/providers';
import { registerProvider } from './adapter';

const isDev = typeof window !== 'undefined' && window.location?.hostname === 'localhost';

function proxyUrl(url: string): string {
  return isDev ? `/api/ai-proxy/${encodeURIComponent(url)}` : url;
}

function createAnthropicProvider(apiKey: string): AIProvider {
  const BASE_URL = 'https://api.anthropic.com/v1';

  function convertTools(tools: ToolDefinition[]) {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  function convertMessages(messages: Message[]) {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const system = systemMessages.map((m) => m.content).join('\n\n') || undefined;

    const converted = nonSystemMessages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: m.toolCallId,
              content: m.content,
            },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    return { system, messages: converted };
  }

  return {
    id: 'anthropic',
    name: 'Anthropic',

    async chat(messages, tools, model = 'claude-sonnet-4-20250514') {
      const { system, messages: converted } = convertMessages(messages);

      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: converted,
      };
      if (system) body.system = system;
      if (tools.length > 0) body.tools = convertTools(tools);

      const res = await fetch(proxyUrl(`${BASE_URL}/messages`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${err}`);
      }

      const data = await res.json();

      const content = data.content
        ?.filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('') ?? '';

      const toolCalls = data.content
        ?.filter((c: { type: string }) => c.type === 'tool_use')
        .map((c: { id: string; name: string; input: Record<string, unknown> }) => ({
          id: c.id,
          name: c.name,
          arguments: c.input,
        })) ?? [];

      return {
        content,
        toolCalls,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
      } satisfies AIResponse;
    },

    async *stream(messages, tools, model = 'claude-sonnet-4-20250514') {
      const { system, messages: converted } = convertMessages(messages);

      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: converted,
        stream: true,
      };
      if (system) body.system = system;
      if (tools.length > 0) body.tools = convertTools(tools);

      const res = await fetch(proxyUrl(`${BASE_URL}/messages`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${err}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done' as const };
            return;
          }

          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                yield { type: 'text' as const, content: event.delta.text };
              }
            }
            if (event.type === 'message_stop') {
              yield { type: 'done' as const };
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    },

    async listModels() {
      return [
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000, supportsToolCalling: true },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, supportsToolCalling: true },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsToolCalling: true },
      ] satisfies ModelInfo[];
    },

    async validateKey(key: string) {
      try {
        const res = await fetch(proxyUrl(`${BASE_URL}/messages`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        return res.ok || res.status === 400; // 400 = valid key, bad request
      } catch {
        return false;
      }
    },
  };
}

registerProvider('anthropic', createAnthropicProvider);
