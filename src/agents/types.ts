import type { AgentType, GatewayTier } from '@/types/agents';
import type { ToolDefinition } from '@/types/providers';

export interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  systemPrompt: string;
  tools: AgentTool[];
  keywords: string[]; // Router uses these for intent matching
}

export interface AgentTool extends ToolDefinition {
  tier: GatewayTier;
  agent: AgentType;
  graphEndpoint?: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  requiredPermissions?: string[];
}

export interface ParsedIntent {
  agent: AgentType;
  confidence: number;
  intent: string;
  entities: {
    tenant?: string;
    users?: string[];
    resource?: string;
    action?: string;
    extras?: Record<string, string>;
  };
  rawInput: string;
}
