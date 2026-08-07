/**
 * Typed shape of the Supabase schema, mirroring
 * `supabase/migrations/20260323000000_initial_schema.sql`.
 *
 * `createClient()` without this generic types every column as `any`, which then
 * leaks out of every `db*` helper and infects the stores and views downstream.
 * Handing the schema to the client is what makes those call sites genuinely
 * type-checked rather than merely silenced.
 *
 * Keep in sync with the migrations; `supabase gen types typescript` regenerates
 * an equivalent file when the schema changes.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Columns with a database DEFAULT are optional on insert. */
type Defaulted<Row, K extends keyof Row> = Omit<Row, K> & Partial<Pick<Row, K>>;

export type TeamRow = {
  id: string;
  name: string;
  owner_id: string;
  plan: 'free' | 'solo' | 'professional' | 'enterprise';
  stripe_customer_id: string | null;
  created_at: string;
};

export type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: 'admin' | 'l2' | 'l1';
  created_at: string;
};

export type TenantConnectionRow = {
  id: string;
  team_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_domain: string;
  client_id: string;
  client_secret_ref: string | null;
  auth_method: 'client_credentials' | 'gdap' | 'delegated';
  gdap_relationship_id: string | null;
  gdap_expires_at: string | null;
  health_status: 'healthy' | 'degraded' | 'error' | 'unknown';
  last_health_check: string | null;
  created_at: string;
};

export type TenantGroupRow = {
  id: string;
  team_id: string;
  name: string;
  created_at: string;
};

export type TenantGroupMemberRow = {
  tenant_connection_id: string;
  tenant_group_id: string;
};

export type AiProviderConfigRow = {
  id: string;
  team_id: string;
  provider: string;
  api_key_ref: string | null;
  default_model: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
};

export type ActionRow = {
  id: string;
  team_id: string;
  user_id: string;
  tenant_connection_id: string | null;
  agent: string;
  action_type: string;
  tier: 'green' | 'yellow' | 'red';
  intent: string;
  tool_calls: Json;
  preview: Json | null;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed' | 'rolled_back';
  approved_by: string | null;
  result: Json | null;
  rollback_data: Json | null;
  rollback_expires_at: string | null;
  processing_mode: string;
  ai_provider: string | null;
  ai_model: string | null;
  ai_tokens_used: number | null;
  duration_ms: number | null;
  created_at: string;
  executed_at: string | null;
};

export type PolicyTemplateRow = {
  id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  category: string;
  template_data: Json;
  compliance_frameworks: string[] | null;
  is_builtin: boolean;
  created_at: string;
};

export type PolicyDeploymentRow = {
  id: string;
  team_id: string;
  template_id: string | null;
  tenant_connection_id: string;
  mode: 'audit' | 'report-only' | 'enforce';
  status: string;
  dry_run: boolean;
  changes: Json | null;
  backup_data: Json | null;
  deployed_by: string | null;
  created_at: string;
  deployed_at: string | null;
};

export type DriftBaselineRow = {
  id: string;
  team_id: string;
  tenant_connection_id: string;
  resource_type: string;
  baseline_data: Json;
  captured_at: string;
};

export type DriftResultRow = {
  id: string;
  baseline_id: string;
  status: 'clean' | 'drifted';
  changes: Json | null;
  detected_at: string;
  remediated_at: string | null;
};

export type ComplianceAssessmentRow = {
  id: string;
  team_id: string;
  tenant_connection_id: string;
  framework: string;
  processing_mode: string | null;
  overall_score: number | null;
  passed: number | null;
  failed: number | null;
  warnings: number | null;
  results: Json | null;
  recommendations: Json | null;
  assessed_at: string;
};

export type ReportRunRow = {
  id: string;
  team_id: string;
  tenant_connection_id: string | null;
  template_id: string;
  format: string;
  status: string;
  output_url: string | null;
  created_at: string;
};

export type TenantMemoryRow = {
  id: string;
  team_id: string;
  tenant_connection_id: string;
  memory_type: 'gotcha' | 'preference' | 'incident' | 'pattern';
  content: string;
  source_action_id: string | null;
  score: number;
  created_at: string;
};

export type AgentEvolutionLogRow = {
  id: string;
  team_id: string;
  agent: string;
  action_id: string | null;
  outcome: 'approved' | 'rejected' | 'modified';
  modification_details: string | null;
  created_at: string;
};

export type PsaIntegrationRow = {
  id: string;
  team_id: string;
  provider: string;
  api_url: string | null;
  api_key_ref: string | null;
  auto_ticket_on_drift: boolean;
  auto_ticket_on_compliance: boolean;
  is_active: boolean;
  created_at: string;
};

export type WebhookConfigRow = {
  id: string;
  team_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
};

type Table<Row, DefaultedKeys extends keyof Row> = {
  Row: Row;
  Insert: Defaulted<Row, DefaultedKeys>;
  Update: Partial<Row>;
  Relationships: [];
};

/**
 * Note the exact shape below: the empty maps must be written `{ [_ in never]: never }`
 * rather than `Record<string, never>`. postgrest-js resolves `select('*')` by walking
 * the schema's key set, and an open-ended index signature makes every relation name
 * look present, which collapses the inferred row type to `{}`.
 */
export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      teams: Table<TeamRow, 'id' | 'plan' | 'stripe_customer_id' | 'created_at'>;
      team_members: Table<TeamMemberRow, 'id' | 'role' | 'created_at'>;
      tenant_connections: Table<
        TenantConnectionRow,
        | 'id'
        | 'client_secret_ref'
        | 'auth_method'
        | 'gdap_relationship_id'
        | 'gdap_expires_at'
        | 'health_status'
        | 'last_health_check'
        | 'created_at'
      >;
      tenant_groups: Table<TenantGroupRow, 'id' | 'created_at'>;
      tenant_group_members: Table<TenantGroupMemberRow, never>;
      ai_provider_configs: Table<
        AiProviderConfigRow,
        'id' | 'api_key_ref' | 'default_model' | 'is_default' | 'is_active' | 'created_at'
      >;
      actions: Table<
        ActionRow,
        | 'id'
        | 'tenant_connection_id'
        | 'action_type'
        | 'tool_calls'
        | 'preview'
        | 'status'
        | 'approved_by'
        | 'result'
        | 'rollback_data'
        | 'rollback_expires_at'
        | 'processing_mode'
        | 'ai_provider'
        | 'ai_model'
        | 'ai_tokens_used'
        | 'duration_ms'
        | 'created_at'
        | 'executed_at'
      >;
      policy_templates: Table<
        PolicyTemplateRow,
        'id' | 'team_id' | 'description' | 'compliance_frameworks' | 'is_builtin' | 'created_at'
      >;
      policy_deployments: Table<
        PolicyDeploymentRow,
        | 'id'
        | 'template_id'
        | 'mode'
        | 'status'
        | 'dry_run'
        | 'changes'
        | 'backup_data'
        | 'deployed_by'
        | 'created_at'
        | 'deployed_at'
      >;
      drift_baselines: Table<DriftBaselineRow, 'id' | 'captured_at'>;
      drift_results: Table<DriftResultRow, 'id' | 'status' | 'changes' | 'detected_at' | 'remediated_at'>;
      compliance_assessments: Table<
        ComplianceAssessmentRow,
        | 'id'
        | 'processing_mode'
        | 'overall_score'
        | 'passed'
        | 'failed'
        | 'warnings'
        | 'results'
        | 'recommendations'
        | 'assessed_at'
      >;
      report_runs: Table<
        ReportRunRow,
        'id' | 'tenant_connection_id' | 'format' | 'status' | 'output_url' | 'created_at'
      >;
      tenant_memories: Table<TenantMemoryRow, 'id' | 'source_action_id' | 'score' | 'created_at'>;
      agent_evolution_logs: Table<
        AgentEvolutionLogRow,
        'id' | 'action_id' | 'modification_details' | 'created_at'
      >;
      psa_integrations: Table<
        PsaIntegrationRow,
        | 'id'
        | 'api_url'
        | 'api_key_ref'
        | 'auto_ticket_on_drift'
        | 'auto_ticket_on_compliance'
        | 'is_active'
        | 'created_at'
      >;
      webhook_configs: Table<WebhookConfigRow, 'id' | 'events' | 'is_active' | 'created_at'>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
