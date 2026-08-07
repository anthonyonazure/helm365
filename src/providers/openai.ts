import type { AIProvider, Message, ToolDefinition, AIResponse, ModelInfo } from '@/types/providers';
import { registerProvider } from './adapter';
import { parseOpenAIResponse, parseOpenAIStreamDelta, readSseEvents } from './parse';

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

      const data: unknown = await res.json();
      return parseOpenAIResponse(data) satisfies AIResponse;
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

      for await (const event of readSseEvents(res.body)) {
        const content = parseOpenAIStreamDelta(event);
        if (content) yield { type: 'text' as const, content };
      }
      yield { type: 'done' as const };
    },

    listModels() {
      return Promise.resolve([
        { id: 'o1', name: 'o1', contextWindow: 200000, supportsToolCalling: true },
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsToolCalling: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsToolCalling: true },
      ] satisfies ModelInfo[]);
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
