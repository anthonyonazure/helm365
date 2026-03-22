import { route } from '@/agents/router';
import { processRequest, markExecuted, markFailed, type GatewayRequest, type GatewayResult } from '@/gateway/gateway';
import { createProvider, getModelForMode } from '@/providers';
import { executeTool } from '@/tools/executor';
import { useHelmStore } from './store';
import { useTenantsStore } from './tenants-store';
import type { Action } from '@/types/gateway';
// GatewayTier comes from tool definitions, passed through to gateway
import type { TeamRole } from '@/gateway/permissions';
import type { GraphCredentials } from './graph-client';
import { USER_TOOLS } from '@/tools/graph/users';
import { EXCHANGE_TOOLS } from '@/tools/graph/exchange';
import { SECURITY_TOOLS } from '@/tools/graph/security';
import { COMPLIANCE_TOOLS } from '@/tools/graph/compliance';
import { LICENSING_TOOLS } from '@/tools/graph/licensing';

/**
 * Helm365 Engine — orchestrates the full command flow:
 *
 * 1. User speaks/types command
 * 2. Router classifies intent → picks agent
 * 3. Match to a registered tool
 * 4. Gateway checks permissions + generates preview
 * 5. Green: auto-execute. Yellow/Red: queue for approval.
 * 6. Execute tool calls against Graph API
 * 7. Log everything, return result
 */

export interface CommandResult {
  success: boolean;
  message: string;
  action?: Action;
  requiresApproval?: boolean;
  agent?: string;
  error?: string;
}

// Tool registry — all tools across all agents
const ALL_TOOLS = [...USER_TOOLS, ...EXCHANGE_TOOLS, ...SECURITY_TOOLS, ...COMPLIANCE_TOOLS, ...LICENSING_TOOLS];

/**
 * Match parsed intent to a specific tool from the registry.
 */
function matchTool(intent: string, agent: string, action?: string) {
  const agentTools = ALL_TOOLS.filter((t) => t.agent === agent);

  // Direct action mapping
  const actionToolMap: Record<string, string> = {
    reset_password: 'graph_reset_password',
    reset_mfa: 'graph_reset_mfa',
    unlock: 'graph_unlock_account',
    unblock: 'graph_unlock_account',
    create_user: 'graph_create_user',
    disable: 'graph_disable_user',
    delete_user: 'graph_delete_user',
    assign_license: 'graph_assign_license',
    remove_license: 'graph_remove_license',
    add_group: 'graph_add_group_member',
    remove_group: 'graph_remove_group_member',
  };

  if (action && actionToolMap[action]) {
    const tool = agentTools.find((t) => t.name === actionToolMap[action]);
    if (tool) return tool;
  }

  // Keyword matching in intent
  const lower = intent.toLowerCase();

  // Identity tools
  if (lower.includes('reset') && lower.includes('mfa')) return agentTools.find((t) => t.name === 'graph_reset_mfa');
  if (lower.includes('reset') && lower.includes('password')) return agentTools.find((t) => t.name === 'graph_reset_password');
  if (lower.includes('unlock') || lower.includes('unblock')) return agentTools.find((t) => t.name === 'graph_unlock_account');
  if (lower.includes('onboard') || lower.includes('create user') || lower.includes('new user') || lower.includes('new hire')) return agentTools.find((t) => t.name === 'graph_create_user');
  if (lower.includes('offboard') || lower.includes('disable')) return agentTools.find((t) => t.name === 'graph_disable_user');
  if (lower.includes('delete user') || lower.includes('remove user')) return agentTools.find((t) => t.name === 'graph_delete_user');
  if (lower.includes('license') && lower.includes('assign')) return agentTools.find((t) => t.name === 'graph_assign_license');
  if (lower.includes('group') && lower.includes('add')) return agentTools.find((t) => t.name === 'graph_add_group_member');
  if (lower.includes('group') && lower.includes('remove')) return agentTools.find((t) => t.name === 'graph_remove_group_member');

  // Exchange tools
  if (lower.includes('block') && (lower.includes('sender') || lower.includes('spam'))) return agentTools.find((t) => t.name === 'exchange_block_sender');
  if (lower.includes('allow') && (lower.includes('sender') || lower.includes('whitelist'))) return agentTools.find((t) => t.name === 'exchange_allow_sender');
  if (lower.includes('quarantine') && lower.includes('release')) return agentTools.find((t) => t.name === 'graph_release_quarantine');
  if (lower.includes('quarantine')) return agentTools.find((t) => t.name === 'graph_list_quarantine');
  if (lower.includes('message trace') || lower.includes('trace')) return agentTools.find((t) => t.name === 'graph_message_trace');
  if (lower.includes('forward') && lower.includes('email')) return agentTools.find((t) => t.name === 'graph_set_email_forwarding');
  if (lower.includes('auto reply') || lower.includes('out of office') || lower.includes('ooo')) return agentTools.find((t) => t.name === 'graph_set_auto_reply');
  if (lower.includes('shared mailbox')) return agentTools.find((t) => t.name === 'graph_create_shared_mailbox');
  if (lower.includes('send as') || lower.includes('full access') || lower.includes('send on behalf') || lower.includes('mailbox') && lower.includes('access')) return agentTools.find((t) => t.name === 'graph_grant_mailbox_access');
  if (lower.includes('mailbox')) return agentTools.find((t) => t.name === 'graph_list_mailboxes');

  // Security tools
  if (lower.includes('secure score')) return agentTools.find((t) => t.name === 'graph_get_secure_score');
  if (lower.includes('risky user')) return agentTools.find((t) => t.name === 'graph_list_risky_users');
  if (lower.includes('risky sign') || lower.includes('suspicious sign')) return agentTools.find((t) => t.name === 'graph_list_risky_signins');
  if (lower.includes('security alert')) return agentTools.find((t) => t.name === 'graph_list_security_alerts');
  if (lower.includes('sign-in log') || lower.includes('signin log') || lower.includes('login history')) return agentTools.find((t) => t.name === 'graph_get_sign_in_logs');
  if (lower.includes('audit log') || lower.includes('who changed') || lower.includes('what happened')) return agentTools.find((t) => t.name === 'graph_get_audit_logs');
  if (lower.includes('inbox rule')) return agentTools.find((t) => t.name === 'graph_check_inbox_rules');
  if (lower.includes('app consent') || lower.includes('oauth')) return agentTools.find((t) => t.name === 'graph_list_app_consents');
  if (lower.includes('investigate') || lower.includes('compromised')) return agentTools.find((t) => t.name === 'security_investigate_account');

  // Compliance tools
  if (lower.includes('cmmc') || lower.includes('nist') || lower.includes('cis') || lower.includes('hipaa') || lower.includes('soc2') || lower.includes('iso') || lower.includes('compliance') && lower.includes('assess')) return agentTools.find((t) => t.name === 'compliance_run_assessment');
  if (lower.includes('conditional access') && lower.includes('list')) return agentTools.find((t) => t.name === 'graph_list_ca_policies');
  if (lower.includes('conditional access') && (lower.includes('create') || lower.includes('add'))) return agentTools.find((t) => t.name === 'graph_create_ca_policy');
  if (lower.includes('security default')) return agentTools.find((t) => t.name === 'graph_check_security_defaults');

  // Licensing tools
  if (lower.includes('license') && (lower.includes('audit') || lower.includes('waste') || lower.includes('unused') || lower.includes('optimize'))) return agentTools.find((t) => t.name === 'licensing_run_audit');
  if (lower.includes('license') && (lower.includes('list') || lower.includes('inventory') || lower.includes('sku'))) return agentTools.find((t) => t.name === 'graph_list_subscribed_skus');
  if (lower.includes('copilot') && lower.includes('readiness')) return agentTools.find((t) => t.name === 'graph_copilot_readiness');

  // Search fallback
  if (lower.includes('search') || lower.includes('find') || lower.includes('look up') || lower.includes('show me')) return agentTools.find((t) => t.name === 'graph_search_users');

  // Default: first green tool for the agent
  return agentTools.find((t) => t.tier === 'green') ?? agentTools[0];
}

/**
 * Get Graph API credentials for the active tenant.
 */
function getTenantCredentials(tenantConnectionId: string): GraphCredentials | null {
  const creds = JSON.parse(localStorage.getItem('helm365-creds') ?? '{}');
  return creds[tenantConnectionId] ?? null;
}

export async function executeCommand(input: string): Promise<CommandResult> {
  const store = useHelmStore.getState();
  const tenantsStore = useTenantsStore.getState();

  // Create AI provider if configured (keyword routing works without one)
  let provider = null;
  let model: string | undefined;

  if (store.activeProvider) {
    const apiKey = store.providerKeys[store.activeProvider];
    if (apiKey || store.activeProvider === 'ollama') {
      try {
        provider = createProvider(store.activeProvider, apiKey ?? '');
        model = store.activeModel ?? getModelForMode(store.activeProvider, store.processingMode);
      } catch {
        // Fall through to keyword routing
      }
    }
  }

  try {
    // 1. Route — uses AI if available, keyword fallback otherwise
    const parsed = await route(input, provider, model);

    // 2. Match to a specific tool
    const tool = matchTool(input, parsed.agent, parsed.entities.action);
    // Tool tier is used by the gateway request through tool.tier

    // 3. Resolve tenant
    const activeTenant = store.activeTenantId
      ? tenantsStore.getConnection(store.activeTenantId)
      : null;

    const tenantName = parsed.entities.tenant ?? activeTenant?.tenantName ?? 'No tenant';
    const tenantDomain = activeTenant?.tenantDomain ?? 'demo.onmicrosoft.com';

    // 4. Build gateway request
    const gatewayRequest: GatewayRequest = {
      intent: input,
      agent: parsed.agent,
      tool: tool ?? {
        name: `${parsed.agent}_query`,
        description: parsed.intent,
        parameters: { type: 'object', properties: {} },
        tier: 'green',
        agent: parsed.agent,
      },
      arguments: parsed.entities as Record<string, unknown>,
      tenantConnectionId: store.activeTenantId ?? 'demo',
      tenantName,
      tenantDomain,
      userId: 'current-user',
      userEmail: 'admin@helm365.io',
      userRole: 'admin' as TeamRole,
      teamId: 'default-team',
      processingMode: store.processingMode,
      aiProvider: store.activeProvider ?? 'keyword-routing',
      aiModel: model ?? 'keyword',
      aiTokensUsed: 0,
    };

    // 5. Process through gateway
    const gatewayResult: GatewayResult = processRequest(gatewayRequest);

    // 6. Add to store
    store.addAction(gatewayResult.action);

    if (!gatewayResult.allowed) {
      return {
        success: false,
        message: gatewayResult.denialReason ?? 'Permission denied',
        action: gatewayResult.action,
        agent: parsed.agent,
      };
    }

    if (gatewayResult.requiresApproval) {
      return {
        success: true,
        message: `Pending approval: ${parsed.intent}. Check the Operations Center to approve.`,
        action: gatewayResult.action,
        requiresApproval: true,
        agent: parsed.agent,
      };
    }

    // 7. Auto-approved (GREEN tier) — execute for real if tenant is connected
    const credentials = store.activeTenantId ? getTenantCredentials(store.activeTenantId) : null;

    if (credentials && tool) {
      // Real execution against Graph API
      const execResult = await executeTool({
        toolName: tool.name,
        arguments: parsed.entities as Record<string, unknown>,
        credentials,
      });

      if (execResult.success) {
        markExecuted(gatewayResult.action, execResult.summary, execResult.rollbackData);
        store.updateAction(gatewayResult.action.id, {
          status: 'executed',
          result: execResult.summary,
          rollbackData: execResult.rollbackData ?? null,
        });

        return {
          success: true,
          message: execResult.summary,
          action: gatewayResult.action,
          agent: parsed.agent,
        };
      } else {
        markFailed(gatewayResult.action, execResult.error ?? 'Unknown error');
        store.updateAction(gatewayResult.action.id, {
          status: 'failed',
          result: execResult.summary,
        });

        return {
          success: false,
          message: execResult.summary,
          action: gatewayResult.action,
          agent: parsed.agent,
          error: execResult.error,
        };
      }
    }

    // No tenant connected — simulate
    const result = `[Demo] Routed to ${parsed.agent} agent → ${tool?.name ?? 'unknown tool'} (confidence: ${(parsed.confidence * 100).toFixed(0)}%). Connect a tenant to execute for real.`;
    markExecuted(gatewayResult.action, result);
    store.updateAction(gatewayResult.action.id, { status: 'executed', result });

    return {
      success: true,
      message: result,
      action: gatewayResult.action,
      agent: parsed.agent,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to process command: ${message}`,
      error: message,
    };
  }
}
