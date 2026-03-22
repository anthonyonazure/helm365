import type { AIProvider, Message, ToolDefinition, AIResponse, ModelInfo } from '@/types/providers';
import { registerProvider } from './adapter';

function createOpenAIProvider(apiKey: string, baseUrl = 'https://api.openai.com/v1'): AIProvider {
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

  function convertMessages(messages: Message[]) {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool' as const, tool_call_id: m.toolCallId, content: m.content };
      }
      return { role: m.role, content: m.content };
    });
  }

  return {
    id: 'openai',
    name: 'OpenAI',

    async chat(messages, tools, model = 'gpt-4o') {
      const body: Record<string, unknown> = {
        model,
        messages: convertMessages(messages),
      };
      if (tools.length > 0) body.tools = convertTools(tools);

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];

      const toolCalls = choice?.message?.tool_calls?.map(
        (tc: { id: string; function: { name: string; arguments: string } }) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        }),
      ) ?? [];

      return {
        content: choice?.message?.content ?? '',
        toolCalls,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
      } satisfies AIResponse;
    },

    async *stream(messages, tools, model = 'gpt-4o') {
      const body: Record<string, unknown> = {
        model,
        messages: convertMessages(messages),
        stream: true,
      };
      if (tools.length > 0) body.tools = convertTools(tools);

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
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
            const delta = event.choices?.[0]?.delta;
            if (delta?.content) {
              yield { type: 'text' as const, content: delta.content };
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    },

    async listModels() {
      return [
        { id: 'o1', name: 'o1', contextWindow: 200000, supportsToolCalling: true },
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsToolCalling: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsToolCalling: true },
      ] satisfies ModelInfo[];
    },

    async validateKey(key: string) {
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${key}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

registerProvider('openai', createOpenAIProvider);

// Azure OpenAI uses the same format but different URL structure
function createAzureOpenAIProvider(apiKey: string, baseUrl?: string): AIProvider {
  const provider = createOpenAIProvider(apiKey, baseUrl);
  return {
    ...provider,
    id: 'azure-openai',
    name: 'Azure OpenAI',
  };
}

registerProvider('azure-openai', createAzureOpenAIProvider);
