import type { Action, ActionStatus, ChangePreview } from '@/types/gateway';
import type { GatewayTier, AgentType, ProcessingMode } from '@/types/agents';
import type { AgentTool } from '@/agents/types';
import { canExecuteTier, requiresApproval, shouldWarnBlastRadius, getPermissionDeniedMessage, type TeamRole } from './permissions';
import { logAction } from './audit';

/**
 * Security Gateway — the central enforcement point for all M365 operations.
 *
 * Every tool call flows through here:
 * 1. Classify tier (GREEN / YELLOW / RED)
 * 2. Check user permissions
 * 3. Generate change preview (YELLOW/RED)
 * 4. Queue for approval or auto-approve
 * 5. Execute (when approved)
 * 6. Log everything
 */

let actionCounter = 0;

function generateActionId(): string {
  actionCounter++;
  return `act_${Date.now()}_${actionCounter}`;
}

export interface GatewayRequest {
  intent: string;
  agent: AgentType;
  tool: AgentTool;
  arguments: Record<string, unknown>;
  tenantConnectionId: string;
  tenantName: string;
  tenantDomain: string;
  userId: string;
  userEmail: string;
  userRole: TeamRole;
  teamId: string;
  processingMode: ProcessingMode;
  aiProvider: string;
  aiModel: string;
  aiTokensUsed: number;
}

export interface GatewayResult {
  action: Action;
  allowed: boolean;
  requiresApproval: boolean;
  denialReason?: string;
}

/**
 * Process a tool call through the security gateway.
 */
export function processRequest(request: GatewayRequest): GatewayResult {
  const tier = request.tool.tier;
  const now = new Date().toISOString();

  // 1. Check permissions
  if (!canExecuteTier(request.userRole, tier)) {
    const action = createAction(request, tier, 'rejected', now);
    action.result = getPermissionDeniedMessage(request.userRole, tier);
    logAction(action);

    return {
      action,
      allowed: false,
      requiresApproval: false,
      denialReason: action.result,
    };
  }

  // 2. Determine if approval is needed
  const needsApproval = requiresApproval(tier);

  // 3. Create the action record
  const status: ActionStatus = needsApproval ? 'pending' : 'approved';
  const action = createAction(request, tier, status, now);

  // 4. Add blast radius warning if applicable
  // (In a real implementation, we'd query Graph API for affected resources)
  if (tier !== 'green') {
    action.preview = generatePreview(request);
  }

  // 5. Set rollback expiry for write operations
  if (tier !== 'green') {
    const rollbackWindow = tier === 'red' ? 60 : 15; // minutes
    const expiresAt = new Date(Date.now() + rollbackWindow * 60_000);
    action.rollbackExpiresAt = expiresAt.toISOString();
  }

  // 6. Log it
  logAction(action);

  return {
    action,
    allowed: true,
    requiresApproval: needsApproval,
  };
}

/**
 * Approve a pending action.
 */
export function approveAction(action: Action, approvedBy: string): Action {
  action.status = 'approved';
  action.approvedBy = approvedBy;
  logAction(action);
  return action;
}

/**
 * Reject a pending action.
 */
export function rejectAction(action: Action, rejectedBy: string, reason?: string): Action {
  action.status = 'rejected';
  action.approvedBy = rejectedBy;
  action.result = reason ?? 'Rejected by approver';
  logAction(action);
  return action;
}

/**
 * Mark an action as executed (after Graph API calls complete).
 */
export function markExecuted(action: Action, result: string, rollbackData?: Record<string, unknown>): Action {
  action.status = 'executed';
  action.executedAt = new Date().toISOString();
  action.result = result;
  action.durationMs = Date.now() - new Date(action.createdAt).getTime();
  if (rollbackData) {
    action.rollbackData = rollbackData;
  }
  logAction(action);
  return action;
}

/**
 * Mark an action as failed.
 */
export function markFailed(action: Action, error: string): Action {
  action.status = 'failed';
  action.executedAt = new Date().toISOString();
  action.result = `Error: ${error}`;
  action.durationMs = Date.now() - new Date(action.createdAt).getTime();
  logAction(action);
  return action;
}

// --- Internal helpers ---

function createAction(
  request: GatewayRequest,
  tier: GatewayTier,
  status: ActionStatus,
  timestamp: string,
): Action {
  return {
    id: generateActionId(),
    teamId: request.teamId,
    userId: request.userId,
    userEmail: request.userEmail,
    tenantConnectionId: request.tenantConnectionId,
    tenantName: request.tenantName,
    tenantDomain: request.tenantDomain,
    agent: request.agent,
    tier,
    intent: request.intent,
    toolCalls: [{
      id: `tc_${Date.now()}`,
      name: request.tool.name,
      method: request.tool.method ?? 'POST',
      url: request.tool.graphEndpoint ?? '',
      arguments: request.arguments,
      result: null,
      status: 'success',
    }],
    preview: null,
    status,
    approvedBy: null,
    result: null,
    rollbackData: null,
    rollbackExpiresAt: null,
    processingMode: request.processingMode,
    aiProvider: request.aiProvider,
    aiModel: request.aiModel,
    aiTokensUsed: request.aiTokensUsed,
    durationMs: null,
    createdAt: timestamp,
    executedAt: null,
  };
}

function generatePreview(request: GatewayRequest): ChangePreview {
  // Placeholder — in production, this queries current state via Graph API
  // and generates a real diff. For now, describe the intent.
  return {
    summary: `${request.tool.name}: ${request.intent}`,
    changes: [{
      resource: request.tool.agent,
      resourceName: request.tool.name,
      field: 'action',
      currentValue: '(current state)',
      newValue: JSON.stringify(request.arguments),
      action: 'update',
    }],
    blastRadius: {
      usersAffected: 1,
      resourcesAffected: 1,
      details: [],
    },
    warnings: shouldWarnBlastRadius(1) ? ['This operation affects many resources.'] : [],
  };
}
