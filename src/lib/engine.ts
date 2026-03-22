import { route } from '@/agents/router';
import { processRequest, markExecuted, type GatewayRequest, type GatewayResult } from '@/gateway/gateway';
import { createProvider, getModelForMode } from '@/providers';
import { useHelmStore } from './store';
import type { Action } from '@/types/gateway';
import type { TeamRole } from '@/gateway/permissions';

/**
 * Helm365 Engine — orchestrates the full command flow:
 *
 * 1. User speaks/types command
 * 2. Router classifies intent → picks agent
 * 3. Agent determines tool calls
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

export async function executeCommand(input: string): Promise<CommandResult> {
  const store = useHelmStore.getState();

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

    // 3. For now, create a simulated gateway request
    //    (Full implementation will have agents select specific tools)
    const gatewayRequest: GatewayRequest = {
      intent: input,
      agent: parsed.agent,
      tool: {
        name: `${parsed.agent}_${parsed.entities.action ?? 'query'}`,
        description: parsed.intent,
        parameters: { type: 'object', properties: {} },
        tier: 'green', // Router doesn't know tier yet — agent will classify
        agent: parsed.agent,
      },
      arguments: parsed.entities as Record<string, unknown>,
      tenantConnectionId: store.activeTenantId ?? 'demo',
      tenantName: parsed.entities.tenant ?? store.activeTenantName ?? 'No tenant',
      tenantDomain: parsed.entities.tenant ? `${parsed.entities.tenant.toLowerCase().replace(/\s+/g, '')}.onmicrosoft.com` : 'demo.onmicrosoft.com',
      userId: 'current-user',
      userEmail: 'admin@helm365.io',
      userRole: 'admin' as TeamRole,
      teamId: 'default-team',
      processingMode: store.processingMode,
      aiProvider: store.activeProvider ?? 'keyword-routing',
      aiModel: model ?? 'keyword',
      aiTokensUsed: 0,
    };

    // 4. Process through gateway
    const gatewayResult: GatewayResult = processRequest(gatewayRequest);

    // 5. Add to store
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

    // 6. Auto-approved (GREEN tier) — execute
    //    (In production, this calls Graph API. For now, simulate.)
    const result = `Routed to ${parsed.agent} agent (confidence: ${(parsed.confidence * 100).toFixed(0)}%). Intent: ${parsed.intent}`;
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
