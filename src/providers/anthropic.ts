import type { AIProvider, Message, ToolDefinition, AIResponse, ModelInfo, ToolCall } from '@/types/providers';
import { isRecord, pick, pickArray, pickNumber, pickString } from '@/lib/json';
import { registerProvider } from './adapter';
import { readSseEvents } from './parse';

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

      const data: unknown = await res.json();
      const blocks = pickArray(data, 'content');

      const content = blocks
        .filter((block) => pickString(block, 'type') === 'text')
        .map((block) => pickString(block, 'text') ?? '')
        .join('');

      const toolCalls = blocks
        .filter((block) => pickString(block, 'type') === 'tool_use')
        .flatMap<ToolCall>((block) => {
          const id = pickString(block, 'id');
          const name = pickString(block, 'name');
          if (!id || !name) return [];
          const input = pick(block, 'input');
          return [{ id, name, arguments: isRecord(input) ? input : {} }];
        });

      return {
        content,
        toolCalls,
        usage: {
          inputTokens: pickNumber(data, 'usage', 'input_tokens') ?? 0,
          outputTokens: pickNumber(data, 'usage', 'output_tokens') ?? 0,
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

      for await (const event of readSseEvents(res.body)) {
        const eventType = pickString(event, 'type');
        if (eventType === 'content_block_delta' && pickString(event, 'delta', 'type') === 'text_delta') {
          yield { type: 'text' as const, content: pickString(event, 'delta', 'text') ?? '' };
        }
        if (eventType === 'message_stop') {
          yield { type: 'done' as const };
        }
      }
    },

    listModels() {
      return Promise.resolve([
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000, supportsToolCalling: true },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, supportsToolCalling: true },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsToolCalling: true },
      ] satisfies ModelInfo[]);
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
