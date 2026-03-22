import type { AgentTool } from '@/agents/types';

export const POLICY_TOOLS: AgentTool[] = [
  // --- GREEN ---
  {
    name: 'policy_list_templates',
    description: 'List available policy templates including security baselines, CIS benchmarks, and custom templates.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category (conditional-access, intune, email-security, etc.)' },
      },
    },
    tier: 'green', agent: 'policy',
  },
  {
    name: 'policy_get_drift_status',
    description: 'Check if tenant configuration has drifted from the baseline. Shows what changed, when, and by whom.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string', description: 'Tenant to check (default: active tenant)' },
        resourceType: { type: 'string', description: 'Check specific resource type only' },
      },
    },
    tier: 'green', agent: 'policy',
  },
  {
    name: 'policy_list_backups',
    description: 'List policy backups for a tenant with timestamps and resource counts.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string', description: 'Tenant (default: active)' },
        top: { type: 'number', description: 'Max results (default 10)' },
      },
    },
    tier: 'green', agent: 'policy',
  },
  {
    name: 'policy_compare_tenants',
    description: 'Compare configuration between two tenants. Shows differences in policies, settings, and baselines.',
    parameters: {
      type: 'object',
      properties: {
        tenantA: { type: 'string', description: 'First tenant name or ID' },
        tenantB: { type: 'string', description: 'Second tenant name or ID' },
        resourceType: { type: 'string', description: 'Compare specific resource type only' },
      },
      required: ['tenantA', 'tenantB'],
    },
    tier: 'green', agent: 'policy',
  },

  // --- YELLOW ---
  {
    name: 'policy_deploy_template',
    description: 'Deploy a policy template to a tenant. Default mode is audit/report-only for safe testing.',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Template ID to deploy' },
        tenantConnectionId: { type: 'string', description: 'Target tenant' },
        mode: { type: 'string', enum: ['audit', 'report-only', 'enforce'], description: 'Deployment mode (default: report-only)' },
        dryRun: { type: 'boolean', description: 'Preview changes without applying (default: false)' },
      },
      required: ['templateId'],
    },
    tier: 'yellow', agent: 'policy',
  },
  {
    name: 'policy_create_backup',
    description: 'Create a backup of all or selected policies for a tenant.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string', description: 'Tenant to backup' },
        resourceTypes: { type: 'array', items: { type: 'string' }, description: 'Specific resource types (default: all)' },
        name: { type: 'string', description: 'Backup name' },
      },
    },
    tier: 'yellow', agent: 'policy',
  },
  {
    name: 'policy_remediate_drift',
    description: 'Restore drifted configuration back to the baseline. Reviews each change and applies the fix.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string' },
        driftIds: { type: 'array', items: { type: 'string' }, description: 'Specific drift items to fix (default: all)' },
      },
    },
    tier: 'yellow', agent: 'policy',
  },
  {
    name: 'policy_switch_mode',
    description: 'Switch a deployed policy between audit, report-only, and enforce modes.',
    parameters: {
      type: 'object',
      properties: {
        policyId: { type: 'string', description: 'Policy ID' },
        newMode: { type: 'string', enum: ['audit', 'report-only', 'enforce'], description: 'New mode' },
      },
      required: ['policyId', 'newMode'],
    },
    tier: 'yellow', agent: 'policy',
  },

  // --- RED ---
  {
    name: 'policy_rollback',
    description: 'Rollback tenant configuration to a previous backup. DESTRUCTIVE — overwrites current policies.',
    parameters: {
      type: 'object',
      properties: {
        backupId: { type: 'string', description: 'Backup ID to restore' },
        tenantConnectionId: { type: 'string' },
        resourceTypes: { type: 'array', items: { type: 'string' }, description: 'Restore specific types only (default: all)' },
      },
      required: ['backupId'],
    },
    tier: 'red', agent: 'policy',
  },
];
