import type { GatewayTier, AgentType, ProcessingMode } from './agents';

export type ActionStatus =
  | 'pending'      // Awaiting approval (YELLOW/RED)
  | 'approved'     // Approved, not yet executed
  | 'rejected'     // Rejected by approver
  | 'executing'    // Currently running
  | 'executed'     // Successfully completed
  | 'failed'       // Execution failed
  | 'rolled_back'; // Rolled back after execution

export interface Action {
  id: string;
  teamId: string;
  userId: string;
  userEmail: string;
  tenantConnectionId: string;
  tenantName: string;
  tenantDomain: string;
  agent: AgentType;
  tier: GatewayTier;
  intent: string;
  toolCalls: ToolCallRecord[];
  preview: ChangePreview | null;
  status: ActionStatus;
  approvedBy: string | null;
  result: string | null;
  rollbackData: Record<string, unknown> | null;
  rollbackExpiresAt: string | null;
  processingMode: ProcessingMode;
  aiProvider: string;
  aiModel: string;
  aiTokensUsed: number;
  durationMs: number | null;
  createdAt: string;
  executedAt: string | null;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  method: string;
  url: string;
  arguments: Record<string, unknown>;
  result: unknown;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface ChangePreview {
  summary: string;
  changes: ChangeItem[];
  blastRadius: BlastRadius;
  warnings: string[];
}

export interface ChangeItem {
  resource: string;
  resourceName: string;
  field: string;
  currentValue: unknown;
  newValue: unknown;
  action: 'create' | 'update' | 'delete';
}

export interface BlastRadius {
  usersAffected: number;
  resourcesAffected: number;
  details: string[];
}

export interface RollbackResult {
  success: boolean;
  actionId: string;
  restoredResources: number;
  errors: string[];
}
