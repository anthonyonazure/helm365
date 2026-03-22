import type { AIProvider, ProviderId } from '@/types/providers';

/**
 * Registry of AI provider implementations.
 * Each provider translates our common interface to the provider's native API format.
 */
const providers = new Map<ProviderId, (apiKey: string, baseUrl?: string) => AIProvider>();

export function registerProvider(id: ProviderId, factory: (apiKey: string, baseUrl?: string) => AIProvider) {
  providers.set(id, factory);
}

export function createProvider(id: ProviderId, apiKey: string, baseUrl?: string): AIProvider {
  const factory = providers.get(id);
  if (!factory) {
    throw new Error(`Unknown AI provider: ${id}. Available: ${[...providers.keys()].join(', ')}`);
  }
  return factory(apiKey, baseUrl);
}

export function getAvailableProviders(): ProviderId[] {
  return [...providers.keys()];
}

/**
 * Processing mode determines which model tier to use.
 * Quick = cheapest/fastest, Smart = balanced, Deep = most capable.
 */
export type ProcessingMode = 'quick' | 'smart' | 'deep';

const MODEL_MAP: Record<string, Record<ProcessingMode, string>> = {
  anthropic: {
    quick: 'claude-haiku-4-5-20251001',
    smart: 'claude-sonnet-4-20250514',
    deep: 'claude-opus-4-20250514',
  },
  openai: {
    quick: 'gpt-4o-mini',
    smart: 'gpt-4o',
    deep: 'o1',
  },
  google: {
    quick: 'gemini-2.0-flash',
    smart: 'gemini-2.5-flash',
    deep: 'gemini-2.5-pro',
  },
  mistral: {
    quick: 'mistral-small-latest',
    smart: 'mistral-medium-latest',
    deep: 'mistral-large-latest',
  },
  groq: {
    quick: 'llama-3.1-8b-instant',
    smart: 'llama-3.3-70b-versatile',
    deep: 'llama-3.3-70b-versatile',
  },
  'azure-openai': {
    quick: 'gpt-4o-mini',
    smart: 'gpt-4o',
    deep: 'gpt-4o',
  },
  ollama: {
    quick: 'llama3.2',
    smart: 'llama3.2',
    deep: 'llama3.2',
  },
  perplexity: {
    quick: 'sonar',
    smart: 'sonar-pro',
    deep: 'sonar-pro',
  },
};

export function getModelForMode(providerId: string, mode: ProcessingMode): string | undefined {
  return MODEL_MAP[providerId]?.[mode];
}
