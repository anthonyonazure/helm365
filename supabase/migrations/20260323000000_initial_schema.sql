-- Helm365 Initial Schema
-- All tables scoped by team_id with RLS for multi-tenant isolation

-- ─── Users & Teams ──────────────────────────────────────────────────

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'solo', 'professional', 'enterprise')),
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'l1' CHECK (role IN ('admin', 'l2', 'l1')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- ─── Tenant Connections ─────────────────────────────────────────────

CREATE TABLE tenant_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  tenant_name text NOT NULL,
  tenant_domain text NOT NULL,
  client_id text NOT NULL,
  client_secret_ref text, -- Reference to Vault secret
  auth_method text NOT NULL DEFAULT 'client_credentials' CHECK (auth_method IN ('client_credentials', 'gdap', 'delegated')),
  gdap_relationship_id text,
  gdap_expires_at timestamptz,
  health_status text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'error', 'unknown')),
  last_health_check timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_group_members (
  tenant_connection_id uuid NOT NULL REFERENCES tenant_connections(id) ON DELETE CASCADE,
  tenant_group_id uuid NOT NULL REFERENCES tenant_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_connection_id, tenant_group_id)
);

-- ─── AI Configuration ───────────────────────────────────────────────

CREATE TABLE ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider text NOT NULL,
  api_key_ref text, -- Reference to Vault secret
  default_model text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Actions & Audit ────────────────────────────────────────────────

CREATE TABLE actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  tenant_connection_id uuid REFERENCES tenant_connections(id),
  agent text NOT NULL,
  action_type text NOT NULL DEFAULT 'read',
  tier text NOT NULL CHECK (tier IN ('green', 'yellow', 'red')),
  intent text NOT NULL,
  tool_calls jsonb NOT NULL DEFAULT '[]',
  preview jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executing', 'executed', 'failed', 'rolled_back')),
  approved_by uuid REFERENCES auth.users(id),
  result jsonb,
  rollback_data jsonb,
  rollback_expires_at timestamptz,
  processing_mode text NOT NULL DEFAULT 'smart',
  ai_provider text,
  ai_model text,
  ai_tokens_used integer DEFAULT 0,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

CREATE INDEX idx_actions_team ON actions(team_id);
CREATE INDEX idx_actions_status ON actions(status) WHERE status = 'pending';
CREATE INDEX idx_actions_tenant ON actions(tenant_connection_id);
CREATE INDEX idx_actions_created ON actions(created_at DESC);

-- ─── Policy Management ──────────────────────────────────────────────

CREATE TABLE policy_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  template_data jsonb NOT NULL,
  compliance_frameworks text[] DEFAULT '{}',
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policy_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  template_id uuid REFERENCES policy_templates(id),
  tenant_connection_id uuid NOT NULL REFERENCES tenant_connections(id),
  mode text NOT NULL DEFAULT 'report-only' CHECK (mode IN ('audit', 'report-only', 'enforce')),
  status text NOT NULL DEFAULT 'pending',
  dry_run boolean NOT NULL DEFAULT false,
  changes jsonb,
  backup_data jsonb,
  deployed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deployed_at timestamptz
);

-- ─── Drift Detection ────────────────────────────────────────────────

CREATE TABLE drift_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tenant_connection_id uuid NOT NULL REFERENCES tenant_connections(id),
  resource_type text NOT NULL,
  baseline_data jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drift_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES drift_baselines(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'clean' CHECK (status IN ('clean', 'drifted')),
  changes jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  remediated_at timestamptz
);

-- ─── Compliance ─────────────────────────────────────────────────────

CREATE TABLE compliance_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tenant_connection_id uuid NOT NULL REFERENCES tenant_connections(id),
  framework text NOT NULL,
  processing_mode text DEFAULT 'smart',
  overall_score numeric,
  passed integer DEFAULT 0,
  failed integer DEFAULT 0,
  warnings integer DEFAULT 0,
  results jsonb,
  recommendations jsonb,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Reports ────────────────────────────────────────────────────────

CREATE TABLE report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tenant_connection_id uuid REFERENCES tenant_connections(id),
  template_id text NOT NULL,
  format text NOT NULL DEFAULT 'pdf',
  status text NOT NULL DEFAULT 'pending',
  output_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Context & Evolution ────────────────────────────────────────────

CREATE TABLE tenant_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tenant_connection_id uuid NOT NULL REFERENCES tenant_connections(id),
  memory_type text NOT NULL CHECK (memory_type IN ('gotcha', 'preference', 'incident', 'pattern')),
  content text NOT NULL,
  source_action_id uuid REFERENCES actions(id),
  score numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_evolution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  agent text NOT NULL,
  action_id uuid REFERENCES actions(id),
  outcome text NOT NULL CHECK (outcome IN ('approved', 'rejected', 'modified')),
  modification_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Integrations ───────────────────────────────────────────────────

CREATE TABLE psa_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider text NOT NULL,
  api_url text,
  api_key_ref text,
  auto_ticket_on_drift boolean NOT NULL DEFAULT false,
  auto_ticket_on_compliance boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Row Level Security ─────────────────────────────────────────────

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_evolution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE psa_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

-- Team isolation: users only see data for teams they belong to
CREATE POLICY team_access ON teams FOR ALL USING (
  id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  OR owner_id = auth.uid()
);

CREATE POLICY team_member_access ON team_members FOR ALL USING (
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

-- Apply team isolation to all team-scoped tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'tenant_connections', 'tenant_groups', 'ai_provider_configs',
    'actions', 'policy_templates', 'policy_deployments',
    'drift_baselines', 'compliance_assessments', 'report_runs',
    'tenant_memories', 'agent_evolution_logs', 'psa_integrations', 'webhook_configs'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY team_isolation ON %I FOR ALL USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))',
      tbl
    );
  END LOOP;
END $$;

-- drift_results accessed via baseline
CREATE POLICY drift_results_access ON drift_results FOR ALL USING (
  baseline_id IN (
    SELECT id FROM drift_baselines WHERE team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  )
);

-- Builtin templates visible to all
CREATE POLICY builtin_templates ON policy_templates FOR SELECT USING (is_builtin = true);
