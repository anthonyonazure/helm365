/**
 * Shared parsing for provider responses.
 *
 * Every provider here talks to a remote HTTP API, so its payloads are untyped
 * at runtime no matter what we assert about them. These helpers read the fields
 * we actually use out of `unknown` and drop anything malformed, which keeps a
 * provider changing its response shape from turning into a crash mid-conversation.
 */

import { isRecord, parseJson, pickArray, pickNumber, pickString } from '@/lib/json';
import type { AIResponse, ToolCall } from '@/types/providers';

/** Tool arguments arrive as a JSON string; anything unparseable means "no arguments". */
export function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = parseJson(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** OpenAI-shaped `choices[0].message.tool_calls`. Entries missing an id or name are skipped. */
export function parseOpenAIToolCalls(choice: unknown): ToolCall[] {
  return pickArray(choice, 'message', 'tool_calls').flatMap<ToolCall>((entry) => {
    const id = pickString(entry, 'id');
    const name = pickString(entry, 'function', 'name');
    if (!id || !name) return [];
    return [{ id, name, arguments: parseToolArguments(pickString(entry, 'function', 'arguments')) }];
  });
}

/** Full OpenAI-compatible chat completion body (OpenAI, Azure OpenAI, Codex). */
export function parseOpenAIResponse(data: unknown): AIResponse {
  const choice = pickArray(data, 'choices')[0];
  return {
    content: pickString(choice, 'message', 'content') ?? '',
    toolCalls: parseOpenAIToolCalls(choice),
    usage: {
      inputTokens: pickNumber(data, 'usage', 'prompt_tokens') ?? 0,
      outputTokens: pickNumber(data, 'usage', 'completion_tokens') ?? 0,
    },
  };
}

/** Text delta from an OpenAI-compatible SSE frame, or undefined for frames we ignore. */
export function parseOpenAIStreamDelta(event: unknown): string | undefined {
  return pickString(pickArray(event, 'choices')[0], 'delta', 'content');
}

/**
 * Iterate the `data:` frames of an SSE body, stopping at `[DONE]`.
 * Malformed frames are skipped: a partially flushed chunk is normal mid-stream
 * and must not abort a response that is otherwise fine.
 */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<unknown> {
  const reader = body?.getReader();
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
      const payload = line.slice(6);
      if (payload === '[DONE]') return;
      try {
        yield parseJson(payload);
      } catch {
        // Skip malformed frames.
      }
    }
  }
}
