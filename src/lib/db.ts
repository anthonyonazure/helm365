/**
 * Database layer — reads/writes to Supabase instead of localStorage.
 * All functions are team-scoped via RLS (the anon key + auth token handle this).
 */

import { supabase } from './supabase';

// ─── Tenant Connections ──────────────────────────────────────────────

export async function dbGetTenantConnections(teamId: string) {
  const { data, error } = await supabase
    .from('tenant_connections')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) console.error('Failed to load tenants:', error);
  return data ?? [];
}

export async function dbAddTenantConnection(teamId: string, conn: {
  tenantId: string;
  tenantName: string;
  tenantDomain: string;
  clientId: string;
  clientSecret: string;
  authMethod?: string;
}) {
  const { data, error } = await supabase
    .from('tenant_connections')
    .insert({
      team_id: teamId,
      tenant_id: conn.tenantId,
      tenant_name: conn.tenantName,
      tenant_domain: conn.tenantDomain,
      client_id: conn.clientId,
      client_secret_ref: conn.clientSecret, // TODO: move to Vault
      auth_method: conn.authMethod ?? 'client_credentials',
      health_status: 'healthy',
      last_health_check: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) console.error('Failed to add tenant:', error);
  return data;
}

export async function dbRemoveTenantConnection(id: string) {
  const { error } = await supabase
    .from('tenant_connections')
    .delete()
    .eq('id', id);

  if (error) console.error('Failed to remove tenant:', error);
}

export async function dbUpdateTenantHealth(id: string, status: string) {
  const { error } = await supabase
    .from('tenant_connections')
    .update({ health_status: status, last_health_check: new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('Failed to update health:', error);
}

// ─── AI Provider Configs ─────────────────────────────────────────────

export async function dbGetProviderConfigs(teamId: string) {
  const { data, error } = await supabase
    .from('ai_provider_configs')
    .select('*')
    .eq('team_id', teamId);

  if (error) console.error('Failed to load providers:', error);
  return data ?? [];
}

export async function dbSaveProviderConfig(teamId: string, config: {
  provider: string;
  apiKey: string;
  defaultModel?: string;
  isDefault?: boolean;
}) {
  // Upsert — update if provider exists, insert if not
  const { data: existing } = await supabase
    .from('ai_provider_configs')
    .select('id')
    .eq('team_id', teamId)
    .eq('provider', config.provider)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('ai_provider_configs')
      .update({
        api_key_ref: config.apiKey,
        default_model: config.defaultModel,
        is_default: config.isDefault ?? false,
        is_active: true,
      })
      .eq('id', existing.id);

    if (error) console.error('Failed to update provider:', error);
  } else {
    const { error } = await supabase
      .from('ai_provider_configs')
      .insert({
        team_id: teamId,
        provider: config.provider,
        api_key_ref: config.apiKey,
        default_model: config.defaultModel,
        is_default: config.isDefault ?? false,
        is_active: true,
      });

    if (error) console.error('Failed to save provider:', error);
  }

  // If setting as default, clear other defaults
  if (config.isDefault) {
    await supabase
      .from('ai_provider_configs')
      .update({ is_default: false })
      .eq('team_id', teamId)
      .neq('provider', config.provider);
  }
}

export async function dbGetActiveProvider(teamId: string) {
  const { data } = await supabase
    .from('ai_provider_configs')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_default', true)
    .single();

  return data;
}

// ─── Actions ─────────────────────────────────────────────────────────

export async function dbLogAction(teamId: string, action: {
  userId: string;
  tenantConnectionId?: string;
  agent: string;
  tier: string;
  intent: string;
  toolCalls: unknown;
  status: string;
  processingMode: string;
  aiProvider?: string;
  aiModel?: string;
}) {
  const { data, error } = await supabase
    .from('actions')
    .insert({
      team_id: teamId,
      user_id: action.userId,
      tenant_connection_id: action.tenantConnectionId,
      agent: action.agent,
      tier: action.tier,
      intent: action.intent,
      tool_calls: action.toolCalls,
      status: action.status,
      processing_mode: action.processingMode,
      ai_provider: action.aiProvider,
      ai_model: action.aiModel,
    })
    .select()
    .single();

  if (error) console.error('Failed to log action:', error);
  return data;
}

export async function dbGetRecentActions(teamId: string, limit = 50) {
  const { data, error } = await supabase
    .from('actions')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) console.error('Failed to load actions:', error);
  return data ?? [];
}

// ─── Tenant Credentials (for Graph API calls) ────────────────────────

export async function dbGetTenantCredentials(tenantConnectionId: string) {
  const { data } = await supabase
    .from('tenant_connections')
    .select('tenant_id, client_id, client_secret_ref')
    .eq('id', tenantConnectionId)
    .single();

  if (!data) return null;

  return {
    tenantId: data.tenant_id,
    clientId: data.client_id,
    clientSecret: data.client_secret_ref,
  };
}
