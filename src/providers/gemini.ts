import type { AIProvider, Message, ToolDefinition, AIResponse, ModelInfo } from '@/types/providers';
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

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const content = parts
        .filter((p: { text?: string }) => p.text)
        .map((p: { text: string }) => p.text)
        .join('');

      const toolCalls = parts
        .filter((p: { functionCall?: unknown }) => p.functionCall)
        .map((p: { functionCall: { name: string; args: Record<string, unknown> } }, i: number) => ({
          id: `call_${i}`,
          name: p.functionCall.name,
          arguments: p.functionCall.args,
        }));

      return {
        content,
        toolCalls,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
      } satisfies AIResponse;
    },

    async *stream(_messages, _tools, _model) {
      // TODO: Implement streaming with Gemini SSE
      throw new Error('Gemini streaming not yet implemented — use chat() instead');
    },

    async listModels() {
      return [
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1000000, supportsToolCalling: true },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, supportsToolCalling: true },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, supportsToolCalling: true },
      ] satisfies ModelInfo[];
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
