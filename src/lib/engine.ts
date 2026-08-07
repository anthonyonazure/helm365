import { route } from '@/agents/router';
import { getAgentConfig } from '@/agents/registry';
import { processRequest, markExecuted, markFailed, type GatewayRequest, type GatewayResult } from '@/gateway/gateway';
import { createProvider, getModelForMode } from '@/providers';
import { executeTool } from '@/tools/executor';
import { useHelmStore } from './store';
import { useTenantsStore } from './tenants-store';
import type { Action } from '@/types/gateway';
import type { AIProvider, Message, ToolDefinition } from '@/types/providers';
import type { AgentTool } from '@/agents/types';
import type { GraphCredentials } from './graph-client';

export interface CommandResult {
  success: boolean;
  message: string;
  action?: Action;
  requiresApproval?: boolean;
  agent?: string;
  error?: string;
}

/**
 * Get Graph API credentials for the active tenant from Supabase.
 */
async function getTenantCredentials(tenantConnectionId: string): Promise<GraphCredentials | null> {
  const { dbGetTenantCredentials } = await import('./db');
  return dbGetTenantCredentials(tenantConnectionId);
}

/**
 * Convert AgentTools to the AI provider's ToolDefinition format.
 */
function toToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Invoke the specialist agent with AI — sends the system prompt + user message
 * + available tools to the AI provider. The AI decides which tool to call and
 * with what arguments.
 */
async function invokeAgent(
  agentType: string,
  userMessage: string,
  aiProvider: AIProvider,
  model: string,
  tenantContext?: string,
): Promise<{ content: string; toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> }> {
  const config = getAgentConfig(agentType as Parameters<typeof getAgentConfig>[0]);

  const systemPrompt = tenantContext
    ? `${config.systemPrompt}\n\nCURRENT CONTEXT:\n- Active tenant: ${tenantContext}\n- Processing mode: ${useHelmStore.getState().processingMode}`
    : config.systemPrompt;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const tools = toToolDefinitions(config.tools);
  const response = await aiProvider.chat(messages, tools, model);

  return {
    content: response.content,
    toolCalls: response.toolCalls.map((tc) => ({
      name: tc.name,
      arguments: tc.arguments,
    })),
  };
}

export async function executeCommand(input: string): Promise<CommandResult> {
  const store = useHelmStore.getState();
  const tenantsStore = useTenantsStore.getState();

  // Create AI provider if configured
  let aiProvider: AIProvider | null = null;
  let model: string | undefined;

  if (store.activeProvider) {
    const apiKey = store.providerKeys[store.activeProvider];
    if (apiKey || store.activeProvider === 'ollama') {
      try {
        aiProvider = createProvider(store.activeProvider, apiKey ?? '');
        model = store.activeModel ?? getModelForMode(store.activeProvider, store.processingMode);
      } catch {
        // Fall through to keyword routing
      }
    }
  }

  try {
    // 1. Route to specialist agent
    const parsed = await route(input, aiProvider, model);

    // 2. Resolve tenant context
    const activeTenant = store.activeTenantId
      ? tenantsStore.getConnection(store.activeTenantId)
      : null;
    const tenantName = parsed.entities.tenant ?? activeTenant?.tenantName ?? 'No tenant';
    const tenantDomain = activeTenant?.tenantDomain ?? 'demo.onmicrosoft.com';
    const credentials = store.activeTenantId ? await getTenantCredentials(store.activeTenantId) : null;

    // 3. Get agent config
    const agentConfig = getAgentConfig(parsed.agent);

    // 4. If AI provider is available, let the agent decide which tool to call
    let selectedTool: AgentTool | undefined;
    let toolArgs: Record<string, unknown> = {};
    let agentResponse = '';

    if (aiProvider && model) {
      try {
        const result = await invokeAgent(
          parsed.agent,
          input,
          aiProvider,
          model,
          activeTenant ? `${activeTenant.tenantName} (${activeTenant.tenantDomain})` : undefined,
        );

        agentResponse = result.content;

        // AI chose a tool
        if (result.toolCalls.length > 0) {
          const firstCall = result.toolCalls[0]!;
          selectedTool = agentConfig.tools.find((t) => t.name === firstCall.name);
          toolArgs = firstCall.arguments;
        }
      } catch (err) {
        // AI invocation failed — fall back to keyword matching
        console.warn('[Engine] Agent invocation failed, falling back to keyword matching:', err);
      }
    }

    // Fall back to keyword matching if AI didn't select a tool
    if (!selectedTool) {
      selectedTool = matchToolByKeyword(input, parsed.agent, parsed.entities.action);
      // Build tool arguments from parsed entities + raw input
      toolArgs = buildToolArgs(input, selectedTool?.name, parsed.entities);
    }

    // 5. Build gateway request
    const gatewayRequest: GatewayRequest = {
      intent: input,
      agent: parsed.agent,
      tool: selectedTool ?? {
        name: `${parsed.agent}_query`,
        description: parsed.intent,
        parameters: { type: 'object', properties: {} },
        tier: 'green',
        agent: parsed.agent,
      },
      arguments: toolArgs,
      tenantConnectionId: store.activeTenantId ?? 'demo',
      tenantName,
      tenantDomain,
      userId: 'current-user',
      userEmail: 'admin@helm365.io',
      userRole: 'admin',
      teamId: 'default-team',
      processingMode: store.processingMode,
      aiProvider: store.activeProvider ?? 'keyword-routing',
      aiModel: model ?? 'keyword',
      aiTokensUsed: 0,
    };

    // 6. Process through gateway
    const gatewayResult: GatewayResult = processRequest(gatewayRequest);
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
      const message = agentResponse
        ? `${agentResponse}\n\nPending approval — check Operations Center.`
        : `Pending approval: ${parsed.intent}. Check the Operations Center to approve.`;

      return {
        success: true,
        message,
        action: gatewayResult.action,
        requiresApproval: true,
        agent: parsed.agent,
      };
    }

    // 7. GREEN tier — execute
    if (credentials && selectedTool) {
      const execResult = await executeTool({
        toolName: selectedTool.name,
        arguments: toolArgs,
        credentials,
      });

      const summary = agentResponse
        ? `${agentResponse}\n\n${execResult.summary}`
        : execResult.summary;

      if (execResult.success) {
        markExecuted(gatewayResult.action, summary, execResult.rollbackData);
        store.updateAction(gatewayResult.action.id, {
          status: 'executed',
          result: summary,
          rollbackData: execResult.rollbackData ?? null,
        });
        return { success: true, message: summary, action: gatewayResult.action, agent: parsed.agent };
      } else {
        markFailed(gatewayResult.action, execResult.error ?? 'Unknown error');
        store.updateAction(gatewayResult.action.id, { status: 'failed', result: summary });
        return { success: false, message: summary, action: gatewayResult.action, agent: parsed.agent, error: execResult.error };
      }
    }

    // Demo mode — no tenant connected
    const demoMsg = agentResponse
      ? `${agentResponse}\n\n[Demo] Tool: ${selectedTool?.name ?? 'unknown'}. Connect a tenant to execute.`
      : `[Demo] ${parsed.agent} agent → ${selectedTool?.name ?? 'unknown'} (${(parsed.confidence * 100).toFixed(0)}% confidence). Connect a tenant to execute.`;

    markExecuted(gatewayResult.action, demoMsg);
    store.updateAction(gatewayResult.action.id, { status: 'executed', result: demoMsg });
    return { success: true, message: demoMsg, action: gatewayResult.action, agent: parsed.agent };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message: `Failed: ${message}`, error: message };
  }
}

/**
 * Build proper tool arguments from the user's natural language input.
 * Maps user intent to the specific parameters each tool expects.
 */
function buildToolArgs(
  input: string,
  toolName: string | undefined,
  entities: { tenant?: string; users?: string[]; action?: string; extras?: Record<string, string> },
): Record<string, unknown> {
  const lower = input.toLowerCase();

  switch (toolName) {
    case 'graph_search_users': {
      // Extract the search term — what comes after "search/find/show" and before "at/in/for"
      const searchMatch = input.match(/(?:search|find|show|look up|list)\s+(?:me\s+)?(?:users?\s+)?(?:named?\s+)?(.+?)(?:\s+(?:at|in|for|from)\s+|$)/i);
      const search = searchMatch?.[1]?.trim() ?? entities.users?.[0] ?? '';
      return search ? { search, top: 25 } : { search: '*', top: 25 };
    }
    case 'graph_reset_mfa':
    case 'graph_reset_password':
    case 'graph_unlock_account':
    case 'graph_disable_user':
    case 'graph_get_user':
    case 'graph_get_sign_in_logs': {
      const userId = entities.users?.[0] ?? extractUserFromInput(input);
      return userId ? { userId } : {};
    }
    case 'graph_check_inbox_rules': {
      const userId = entities.users?.[0] ?? extractUserFromInput(input);
      return userId ? { userId } : {};
    }
    case 'security_investigate_account': {
      const userId = entities.users?.[0] ?? extractUserFromInput(input);
      return { userId: userId ?? 'unknown', reason: input };
    }
    case 'exchange_block_sender':
    case 'exchange_allow_sender': {
      // Extract email or domain
      const emailMatch = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const domainMatch = input.match(/(?:domain\s+)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      return { entry: emailMatch?.[1] ?? domainMatch?.[1] ?? '', notes: input };
    }
    case 'graph_message_trace': {
      const emailMatch = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      return emailMatch ? { senderAddress: emailMatch[1] } : {};
    }
    case 'graph_set_email_forwarding': {
      const emails = [...input.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)].map((m) => m[1]);
      return { userId: emails[0] ?? '', forwardTo: emails[1] ?? '' };
    }
    case 'compliance_run_assessment': {
      let framework = 'cis-m365';
      if (lower.includes('cmmc') && lower.includes('2')) framework = 'cmmc-l2';
      else if (lower.includes('cmmc')) framework = 'cmmc-l1';
      else if (lower.includes('nist')) framework = 'nist-800-171';
      else if (lower.includes('hipaa')) framework = 'hipaa';
      else if (lower.includes('soc')) framework = 'soc2';
      return { framework };
    }
    case 'graph_list_risky_users':
    case 'graph_list_risky_signins':
    case 'graph_list_security_alerts':
    case 'graph_get_secure_score':
    case 'graph_list_ca_policies':
    case 'graph_check_security_defaults':
    case 'graph_list_subscribed_skus':
    case 'graph_list_managed_devices':
    case 'graph_list_noncompliant_devices':
    case 'graph_list_compliance_policies':
    case 'graph_list_config_profiles':
    case 'graph_list_apps':
    case 'graph_list_mailboxes':
    case 'graph_list_app_consents':
    case 'graph_get_secure_score_profiles':
    case 'graph_list_auth_methods_policy':
    case 'graph_get_directory_settings':
    case 'licensing_run_audit':
    case 'graph_copilot_readiness':
    case 'report_tenant_health':
    case 'report_executive_summary':
    case 'report_security_posture':
    case 'report_user_activity':
    case 'report_license_usage':
    case 'policy_list_templates':
    case 'policy_get_drift_status':
    case 'policy_list_backups':
      // These tools don't need user-specific arguments
      return {};
    default:
      // Pass through whatever entities we have, filtering out undefined
      return Object.fromEntries(
        Object.entries(entities).filter(([, v]) => v !== undefined && v !== null),
      );
  }
}

/**
 * Extract a user name or email from raw input text.
 */
function extractUserFromInput(input: string): string | undefined {
  // Try email first
  const emailMatch = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) return emailMatch[1];

  // Try "for <Name>" pattern
  const forMatch = input.match(/(?:for|user)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (forMatch) return forMatch[1];

  // Try "<Name>'s" pattern
  const possessiveMatch = input.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s/);
  if (possessiveMatch) return possessiveMatch[1];

  return undefined;
}

// ─── Keyword fallback (no AI) ────────────────────────────────────────

function matchToolByKeyword(intent: string, agent: string, action?: string): AgentTool | undefined {
  const allTools = getAgentConfig(agent as Parameters<typeof getAgentConfig>[0]).tools;
  const lower = intent.toLowerCase();

  // Direct action map
  const map: Record<string, string> = {
    reset_password: 'graph_reset_password', reset_mfa: 'graph_reset_mfa',
    unlock: 'graph_unlock_account', unblock: 'graph_unlock_account',
    create_user: 'graph_create_user', disable: 'graph_disable_user',
    delete_user: 'graph_delete_user', assign_license: 'graph_assign_license',
  };
  if (action && map[action]) {
    const t = allTools.find((t) => t.name === map[action]);
    if (t) return t;
  }

  // Keyword patterns — identity
  if (lower.includes('reset') && lower.includes('mfa')) return allTools.find((t) => t.name === 'graph_reset_mfa');
  if (lower.includes('reset') && lower.includes('password')) return allTools.find((t) => t.name === 'graph_reset_password');
  if (lower.includes('unlock') || lower.includes('unblock')) return allTools.find((t) => t.name === 'graph_unlock_account');
  if (lower.includes('onboard') || lower.includes('new hire')) return allTools.find((t) => t.name === 'graph_create_user');
  if (lower.includes('offboard') || lower.includes('disable')) return allTools.find((t) => t.name === 'graph_disable_user');

  // Exchange
  if (lower.includes('block') && lower.includes('sender')) return allTools.find((t) => t.name === 'exchange_block_sender');
  if (lower.includes('quarantine') && lower.includes('release')) return allTools.find((t) => t.name === 'graph_release_quarantine');
  if (lower.includes('quarantine')) return allTools.find((t) => t.name === 'graph_list_quarantine');
  if (lower.includes('message trace')) return allTools.find((t) => t.name === 'graph_message_trace');
  if (lower.includes('forward') && lower.includes('email')) return allTools.find((t) => t.name === 'graph_set_email_forwarding');
  if (lower.includes('shared mailbox')) return allTools.find((t) => t.name === 'graph_create_shared_mailbox');
  if (lower.includes('spam')) return allTools.find((t) => t.name === 'exchange_block_sender');

  // Security
  if (lower.includes('without mfa') || lower.includes('no mfa') || lower.includes('mfa status') || lower.includes('mfa coverage')) return allTools.find((t) => t.name === 'report_security_posture');
  if (lower.includes('secure score')) return allTools.find((t) => t.name === 'graph_get_secure_score');
  if (lower.includes('investigate') || lower.includes('compromised')) return allTools.find((t) => t.name === 'security_investigate_account');
  if (lower.includes('risky')) return allTools.find((t) => t.name === 'graph_list_risky_users');
  if (lower.includes('audit log')) return allTools.find((t) => t.name === 'graph_get_audit_logs');

  // Compliance
  if (lower.includes('cmmc') || lower.includes('nist') || lower.includes('hipaa') || lower.includes('cis') || lower.includes('soc2')) return allTools.find((t) => t.name === 'compliance_run_assessment');
  if (lower.includes('conditional access')) return allTools.find((t) => t.name === 'graph_list_ca_policies');

  // Device
  if (lower.includes('noncompliant') || lower.includes('non-compliant')) return allTools.find((t) => t.name === 'graph_list_noncompliant_devices');
  if (lower.includes('wipe')) return allTools.find((t) => t.name === 'graph_wipe_device');
  if (lower.includes('device') || lower.includes('intune')) return allTools.find((t) => t.name === 'graph_list_managed_devices');

  // Licensing
  if (lower.includes('license') && (lower.includes('audit') || lower.includes('waste'))) return allTools.find((t) => t.name === 'licensing_run_audit');
  if (lower.includes('license')) return allTools.find((t) => t.name === 'graph_list_subscribed_skus');
  if (lower.includes('copilot')) return allTools.find((t) => t.name === 'graph_copilot_readiness');

  // Policy
  if (lower.includes('drift')) return allTools.find((t) => t.name === 'policy_get_drift_status');
  if (lower.includes('rollback')) return allTools.find((t) => t.name === 'policy_rollback');
  if (lower.includes('deploy') && lower.includes('baseline')) return allTools.find((t) => t.name === 'policy_deploy_template');

  // Reporting
  if (lower.includes('report') && lower.includes('executive')) return allTools.find((t) => t.name === 'report_executive_summary');
  if (lower.includes('report')) return allTools.find((t) => t.name === 'report_tenant_health');

  // Search fallback
  if (lower.includes('search') || lower.includes('find') || lower.includes('show')) return allTools.find((t) => t.name === 'graph_search_users');

  return allTools.find((t) => t.tier === 'green') ?? allTools[0];
}
