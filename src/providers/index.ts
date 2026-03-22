/**
 * Provider registry — import this file to register all providers.
 * Each provider self-registers via registerProvider() on import.
 */
import './anthropic';
import './openai'; // Also registers azure-openai
import './gemini';
import './ollama';

export { createProvider, getAvailableProviders, getModelForMode } from './adapter';
export type { ProcessingMode } from './adapter';
