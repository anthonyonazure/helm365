export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'codex'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'azure-openai'
  | 'ollama'
  | 'perplexity';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIChunk {
  type: 'text' | 'tool_call' | 'done';
  content?: string;
  toolCall?: ToolCall;
}

export interface AIProvider {
  id: ProviderId;
  name: string;
  chat(messages: Message[], tools: ToolDefinition[], model?: string): Promise<AIResponse>;
  stream(messages: Message[], tools: ToolDefinition[], model?: string): AsyncIterable<AIChunk>;
  listModels(): Promise<ModelInfo[]>;
  validateKey(apiKey: string): Promise<boolean>;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsToolCalling: boolean;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
  requiresKey: boolean;
  models: { id: string; name: string }[];
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    description: 'Claude Opus 4, Sonnet 4, Haiku 4.5',
    requiresKey: true,
    models: [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (Deep)' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Smart)' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (Quick)' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o1, GPT-4o-mini',
    requiresKey: true,
    models: [
      { id: 'o1', name: 'o1 (Deep)' },
      { id: 'gpt-4o', name: 'GPT-4o (Smart)' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Quick)' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI (OpenAI)',
    description: 'OpenAI Codex — uses GitHub login, no API key',
    requiresKey: false,
    models: [
      { id: 'codex', name: 'Codex (Default)' },
    ],
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini 2.5 Pro, Flash',
    requiresKey: true,
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Deep)' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Smart)' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Quick)' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral Large, Medium',
    requiresKey: true,
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large (Deep)' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium (Smart)' },
      { id: 'mistral-small-latest', name: 'Mistral Small (Quick)' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Llama, Mixtral (fast inference)',
    requiresKey: true,
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Smart)' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Quick)' },
    ],
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    description: 'Azure-hosted GPT models',
    requiresKey: true,
    models: [], // Configured per-deployment
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally — no API key needed',
    requiresKey: false,
    models: [
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'mistral', name: 'Mistral 7B' },
      { id: 'qwen2.5', name: 'Qwen 2.5' },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI-powered search',
    requiresKey: true,
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro' },
      { id: 'sonar', name: 'Sonar' },
    ],
  },
];
