import type { AgentTool } from '@/agents/types';

export const REPORTING_TOOLS: AgentTool[] = [
  {
    name: 'report_tenant_health',
    description: 'Generate a tenant health summary: secure score, license utilization, MFA coverage, compliance status, recent alerts.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string', description: 'Tenant (default: active)' },
        format: { type: 'string', enum: ['summary', 'detailed', 'pdf'], description: 'Report format' },
      },
    },
    tier: 'green', agent: 'reporting',
  },
  {
    name: 'report_executive_summary',
    description: 'Generate an executive summary report suitable for client delivery. Covers security posture, compliance, actions taken, and recommendations.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string' },
        period: { type: 'string', enum: ['weekly', 'monthly', 'quarterly'], description: 'Reporting period' },
        format: { type: 'string', enum: ['summary', 'pdf'], description: 'Output format' },
      },
    },
    tier: 'green', agent: 'reporting',
  },
  {
    name: 'report_license_usage',
    description: 'Generate license utilization report showing assigned vs active vs wasted licenses with cost analysis.',
    parameters: {
      type: 'object',
      properties: { tenantConnectionId: { type: 'string' } },
    },
    tier: 'green', agent: 'reporting',
  },
  {
    name: 'report_security_posture',
    description: 'Generate security posture report: secure score breakdown, MFA adoption, CA policy coverage, risky users, recent incidents.',
    parameters: {
      type: 'object',
      properties: { tenantConnectionId: { type: 'string' } },
    },
    tier: 'green', agent: 'reporting',
  },
  {
    name: 'report_compliance_status',
    description: 'Generate compliance status report for a specific framework showing pass/fail/warning per control.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string' },
        framework: { type: 'string', enum: ['cmmc-l1', 'cmmc-l2', 'nist-800-171', 'cis-m365', 'hipaa', 'soc2'], description: 'Framework' },
      },
    },
    tier: 'green', agent: 'reporting',
  },
  {
    name: 'report_user_activity',
    description: 'Generate user activity report: active vs inactive users, last sign-in dates, license usage per user.',
    parameters: {
      type: 'object',
      properties: {
        tenantConnectionId: { type: 'string' },
        inactiveDays: { type: 'number', description: 'Flag users inactive for N+ days (default 30)' },
      },
    },
    tier: 'green', agent: 'reporting',
  },
  {
    name: 'report_cross_tenant',
    description: 'Generate a cross-tenant comparison report across all connected tenants. Shows fleet-wide metrics, outliers, and benchmarks.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['secure-score', 'mfa-coverage', 'license-utilization', 'compliance', 'all'], description: 'Metric to compare (default: all)' },
      },
    },
    tier: 'green', agent: 'reporting',
  },
  {
    name: 'report_actions_summary',
    description: 'Generate summary of all Helm365 actions taken in a period: who did what, across which tenants, approval rates.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Time period (default: week)' },
        userId: { type: 'string', description: 'Filter by specific team member' },
      },
    },
    tier: 'green', agent: 'reporting',
  },
];
