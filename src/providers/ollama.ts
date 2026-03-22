import type { AIProvider, Message, ToolDefinition, AIResponse, ModelInfo } from '@/types/providers';
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

      const data = await res.json();

      const toolCalls = data.message?.tool_calls?.map(
        (tc: { function: { name: string; arguments: Record<string, unknown> } }, i: number) => ({
          id: `call_${i}`,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }),
      ) ?? [];

      return {
        content: data.message?.content ?? '',
        toolCalls,
        usage: {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
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
          try {
            const data = JSON.parse(line);
            if (data.done) {
              yield { type: 'done' as const };
              return;
            }
            if (data.message?.content) {
              yield { type: 'text' as const, content: data.message.content };
            }
          } catch {
            // Skip malformed
          }
        }
      }
    },

    async listModels() {
      try {
        const res = await fetch(`${baseUrl}/api/tags`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.models ?? []).map((m: { name: string; details?: { parameter_size?: string } }) => ({
          id: m.name,
          name: m.name,
          contextWindow: 8192,
          supportsToolCalling: true,
        })) satisfies ModelInfo[];
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
