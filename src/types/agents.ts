export type AgentType =
  | 'exchange'
  | 'identity'
  | 'device'
  | 'compliance'
  | 'security'
  | 'licensing'
  | 'reporting'
  | 'policy';

export interface RouterResult {
  agent: AgentType;
  confidence: number;
  intent: string;
  entities: {
    tenant?: string;
    user?: string;
    resource?: string;
    action?: string;
    extras?: Record<string, string>;
  };
}

export interface AgentResponse {
  agent: AgentType;
  content: string;
  toolCalls: ToolCallRequest[];
  tier: GatewayTier;
  processingMode: ProcessingMode;
  tokensUsed: number;
}

export type ProcessingMode = 'quick' | 'smart' | 'deep';

export type GatewayTier = 'green' | 'yellow' | 'red';

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  tier: GatewayTier;
}
