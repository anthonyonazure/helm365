import type { AIProvider, Message, ToolDefinition, AIResponse, AIChunk, ModelInfo, ToolCall } from '@/types/providers';
import { isRecord, pick, pickArray, pickNumber, pickString } from '@/lib/json';
import { registerProvider } from './adapter';

function createGeminiProvider(apiKey: string): AIProvider {
  const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

  function convertTools(tools: ToolDefinition[]) {
    return [{
      function_declarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }];
  }

  function convertMessages(messages: Message[]) {
    const systemInstruction = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    return { systemInstruction, contents };
  }

  return {
    id: 'google',
    name: 'Google AI',

    async chat(messages, tools, model = 'gemini-2.5-flash') {
      const { systemInstruction, contents } = convertMessages(messages);

      const body: Record<string, unknown> = { contents };
      if (systemInstruction) {
        body.system_instruction = { parts: [{ text: systemInstruction }] };
      }
      if (tools.length > 0) body.tools = convertTools(tools);

      const res = await fetch(
        `${BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }

      const data: unknown = await res.json();
      const parts = pickArray(pickArray(data, 'candidates')[0], 'content', 'parts');

      const content = parts.map((part) => pickString(part, 'text') ?? '').join('');

      const toolCalls = parts.flatMap<ToolCall>((part, i) => {
        const name = pickString(part, 'functionCall', 'name');
        if (!name) return [];
        const args = pick(part, 'functionCall', 'args');
        // Gemini does not issue call ids, so the index is the only stable handle
        // for matching a tool result back to its request.
        return [{ id: `call_${i}`, name, arguments: isRecord(args) ? args : {} }];
      });

      return {
        content,
        toolCalls,
        usage: {
          inputTokens: pickNumber(data, 'usageMetadata', 'promptTokenCount') ?? 0,
          outputTokens: pickNumber(data, 'usageMetadata', 'candidatesTokenCount') ?? 0,
        },
      } satisfies AIResponse;
    },

    // Not an async generator: Gemini SSE is unimplemented, so this only ever
    // rejects. Declaring it async* would promise chunks it can never yield.
    stream(): AsyncIterable<AIChunk> {
      // TODO: Implement streaming with Gemini SSE
      throw new Error('Gemini streaming not yet implemented — use chat() instead');
    },

    listModels() {
      return Promise.resolve([
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1000000, supportsToolCalling: true },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, supportsToolCalling: true },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, supportsToolCalling: true },
      ] satisfies ModelInfo[]);
    },

    async validateKey(key: string) {
      try {
        const res = await fetch(`${BASE_URL}/models?key=${key}`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

registerProvider('google', createGeminiProvider);
