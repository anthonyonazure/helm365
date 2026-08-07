/**
 * Narrowing helpers for values that genuinely arrive untyped at runtime:
 * `JSON.parse()`, `Response.json()`, and streamed SSE frames.
 *
 * These deliberately return `undefined`/`[]` instead of throwing. A remote API
 * that changes shape should degrade to "field missing", not crash the caller,
 * and asserting `as SomeInterface` over an unvalidated payload only hides the
 * problem from the type checker while leaving the runtime just as exposed.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walk a property path, yielding `undefined` the moment the shape stops matching. */
export function pick(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function pickString(value: unknown, ...path: string[]): string | undefined {
  const found = pick(value, ...path);
  return typeof found === 'string' ? found : undefined;
}

export function pickNumber(value: unknown, ...path: string[]): number | undefined {
  const found = pick(value, ...path);
  return typeof found === 'number' ? found : undefined;
}

export function pickBoolean(value: unknown, ...path: string[]): boolean | undefined {
  const found = pick(value, ...path);
  return typeof found === 'boolean' ? found : undefined;
}

/** Always an array, so callers can map/filter without a null guard. */
export function pickArray(value: unknown, ...path: string[]): unknown[] {
  const found = pick(value, ...path);
  return Array.isArray(found) ? found : [];
}

/** `JSON.parse` returns `any`; this keeps the untrusted value at `unknown`. */
export function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}
