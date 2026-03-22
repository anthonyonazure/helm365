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
import type { TeamRole } from '@/gateway/permissions';
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
 * Get Graph API credentials for the active tenant.
 */
function getTenantCredentials(tenantConnectionId: string): GraphCredentials | null {
  const creds = JSON.parse(localStorage.getItem('helm365-creds') ?? '{}');
  return creds[tenantConnectionId] ?? null;
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
    const credentials = store.activeTenantId ? getTenantCredentials(store.activeTenantId) : null;

    // 3. Get agent config
    const agentConfig = getAgentConfig(parsed.agent);

    // 4. If AI provider is available, let the agent decide which tool to call
    let selectedTool: AgentTool | undefined;
    let toolArgs: Record<string, unknown> = parsed.entities as Record<string, unknown>;
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
      userRole: 'admin' as TeamRole,
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
