import type { AgentTool } from '@/agents/types';

/**
 * Licensing tools for the Licensing Agent.
 * Covers: license inventory, usage, optimization, and Copilot readiness.
 */

export const LICENSING_TOOLS: AgentTool[] = [
  {
    name: 'graph_list_subscribed_skus',
    description: 'List all license SKUs in the tenant with total, assigned, and available counts.',
    parameters: {
      type: 'object',
      properties: {},
    },
    tier: 'green',
    agent: 'licensing',
    graphEndpoint: '/subscribedSkus',
    method: 'GET',
    requiredPermissions: ['Organization.Read.All'],
  },
  {
    name: 'graph_get_license_usage',
    description: 'Get license utilization details — which users have which licenses and their activity level.',
    parameters: {
      type: 'object',
      properties: {
        skuId: { type: 'string', description: 'Filter by specific SKU ID' },
        includeInactive: { type: 'boolean', description: 'Include users who havent signed in for 30+ days (default true)' },
      },
    },
    tier: 'green',
    agent: 'licensing',
    graphEndpoint: '/reports/getOffice365ActiveUserDetail(period=\'D30\')',
    method: 'GET',
    requiredPermissions: ['Reports.Read.All'],
  },
  {
    name: 'licensing_run_audit',
    description: 'Run a full license audit: identify unused licenses, underutilized SKUs, potential downgrades, and calculate cost savings.',
    parameters: {
      type: 'object',
      properties: {
        includeRecommendations: { type: 'boolean', description: 'Include optimization recommendations (default true)' },
      },
    },
    tier: 'green',
    agent: 'licensing',
    requiredPermissions: ['Organization.Read.All', 'Reports.Read.All', 'User.Read.All'],
  },
  {
    name: 'graph_copilot_readiness',
    description: 'Assess tenant readiness for Microsoft 365 Copilot: licensing prerequisites, identity requirements, data governance, and SharePoint/OneDrive configuration.',
    parameters: {
      type: 'object',
      properties: {},
    },
    tier: 'green',
    agent: 'licensing',
    requiredPermissions: ['Organization.Read.All', 'Policy.Read.All', 'Reports.Read.All'],
  },
];
