import type { AIProvider, Message, ToolDefinition, AIResponse, ModelInfo, ToolCall } from '@/types/providers';
import { isRecord, parseJson, pick, pickArray, pickBoolean, pickNumber, pickString } from '@/lib/json';
import { registerProvider } from './adapter';

function createOllamaProvider(_apiKey: string, baseUrl = 'http://localhost:11434'): AIProvider {
  // Ollama uses OpenAI-compatible API format
  function convertMessages(messages: Message[]) {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  function convertTools(tools: ToolDefinition[]) {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  return {
    id: 'ollama',
    name: 'Ollama (Local)',

    async chat(messages, tools, model = 'llama3.2') {
      const body: Record<string, unknown> = {
        model,
        messages: convertMessages(messages),
        stream: false,
      };
      if (tools.length > 0) body.tools = convertTools(tools);

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Ollama error ${res.status}: ${err}`);
      }

      const data: unknown = await res.json();

      const toolCalls = pickArray(data, 'message', 'tool_calls').flatMap<ToolCall>((tc, i) => {
        const name = pickString(tc, 'function', 'name');
        if (!name) return [];
        const args = pick(tc, 'function', 'arguments');
        // Ollama omits call ids, so the index is the only stable handle.
        return [{ id: `call_${i}`, name, arguments: isRecord(args) ? args : {} }];
      });

      return {
        content: pickString(data, 'message', 'content') ?? '',
        toolCalls,
        usage: {
          inputTokens: pickNumber(data, 'prompt_eval_count') ?? 0,
          outputTokens: pickNumber(data, 'eval_count') ?? 0,
        },
      } satisfies AIResponse;
    },

    async *stream(messages, _tools, model = 'llama3.2') {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: convertMessages(messages),
          stream: true,
        }),
      });

      if (!res.ok) throw new Error(`Ollama error: ${res.status}`);

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
          if (!line.trim()) continue;
          let frame: unknown;
          try {
            frame = parseJson(line);
          } catch {
            // A partially flushed line is normal mid-stream; wait for the rest.
            continue;
          }
          if (pickBoolean(frame, 'done')) {
            yield { type: 'done' as const };
            return;
          }
          const content = pickString(frame, 'message', 'content');
          if (content) yield { type: 'text' as const, content };
        }
      }
    },

    async listModels() {
      try {
        const res = await fetch(`${baseUrl}/api/tags`);
        if (!res.ok) return [];
        const data: unknown = await res.json();
        return pickArray(data, 'models').flatMap<ModelInfo>((m) => {
          const name = pickString(m, 'name');
          if (!name) return [];
          return [{ id: name, name, contextWindow: 8192, supportsToolCalling: true }];
        });
      } catch {
        return [];
      }
    },

    async validateKey() {
      try {
        const res = await fetch(`${baseUrl}/api/tags`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

registerProvider('ollama', createOllamaProvider);
