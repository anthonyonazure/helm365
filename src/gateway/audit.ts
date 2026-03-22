import type { Action } from '@/types/gateway';

export interface AuditEntry {
  id: string;
  timestamp: string;
  teamId: string;
  userId: string;
  userEmail: string;
  tenant: string;
  tenantName: string;
  agent: string;
  intent: string;
  tier: string;
  status: string;
  toolCalls: Array<{ method: string; url: string; name: string }>;
  result: string | null;
  rollbackAvailable: boolean;
  processingMode: string;
  aiProvider: string;
  aiModel: string;
  aiTokens: number;
  durationMs: number | null;
}

// In-memory audit log (until Supabase is wired up)
const auditLog: AuditEntry[] = [];

export function logAction(action: Action): AuditEntry {
  const entry: AuditEntry = {
    id: action.id,
    timestamp: action.createdAt,
    teamId: action.teamId,
    userId: action.userId,
    userEmail: action.userEmail,
    tenant: action.tenantDomain,
    tenantName: action.tenantName,
    agent: action.agent,
    intent: action.intent,
    tier: action.tier,
    status: action.status,
    toolCalls: action.toolCalls.map((tc) => ({
      method: tc.method,
      url: tc.url,
      name: tc.name,
    })),
    result: action.result,
    rollbackAvailable: !!action.rollbackData,
    processingMode: action.processingMode,
    aiProvider: action.aiProvider,
    aiModel: action.aiModel,
    aiTokens: action.aiTokensUsed,
    durationMs: action.durationMs,
  };

  auditLog.unshift(entry);

  // Keep last 1000 entries in memory
  if (auditLog.length > 1000) {
    auditLog.length = 1000;
  }

  // Console log for dev visibility
  console.log(
    `[AUDIT] ${entry.tier.toUpperCase()} | ${entry.agent} | ${entry.status} | ${entry.intent}`,
  );

  return entry;
}

export function getAuditLog(limit = 50): AuditEntry[] {
  return auditLog.slice(0, limit);
}

export function getAuditEntry(id: string): AuditEntry | undefined {
  return auditLog.find((e) => e.id === id);
}
