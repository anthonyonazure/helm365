import type { AgentTool } from '@/agents/types';

/**
 * Compliance tools for the Compliance Agent.
 * Covers: Secure Score improvement actions, compliance assessments,
 * conditional access policy listing, and security defaults check.
 */

export const COMPLIANCE_TOOLS: AgentTool[] = [
  // --- GREEN TIER ---

  {
    name: 'graph_get_secure_score_profiles',
    description: 'Get security improvement actions (Secure Score recommendations) with current status and impact scores.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category (Identity, Data, Device, App, Infrastructure)' },
        top: { type: 'number', description: 'Max results (default 50)' },
      },
    },
    tier: 'green',
    agent: 'compliance',
    graphEndpoint: '/security/secureScoreControlProfiles',
    method: 'GET',
    requiredPermissions: ['SecurityEvents.Read.All'],
  },
  {
    name: 'graph_list_ca_policies',
    description: 'List all Conditional Access policies with their state (enabled, disabled, report-only), conditions, and grant controls.',
    parameters: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['enabled', 'disabled', 'enabledForReportingButNotEnforced'], description: 'Filter by policy state' },
      },
    },
    tier: 'green',
    agent: 'compliance',
    graphEndpoint: '/identity/conditionalAccess/policies',
    method: 'GET',
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    name: 'graph_check_security_defaults',
    description: 'Check if security defaults are enabled for the tenant. Returns the current state and policy details.',
    parameters: {
      type: 'object',
      properties: {},
    },
    tier: 'green',
    agent: 'compliance',
    graphEndpoint: '/policies/identitySecurityDefaultsEnforcementPolicy',
    method: 'GET',
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    name: 'graph_list_auth_methods_policy',
    description: 'Get the authentication methods policy — which MFA methods are allowed tenant-wide.',
    parameters: {
      type: 'object',
      properties: {},
    },
    tier: 'green',
    agent: 'compliance',
    graphEndpoint: '/policies/authenticationMethodsPolicy',
    method: 'GET',
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    name: 'graph_get_directory_settings',
    description: 'Get tenant-wide directory settings including guest access, group creation, and consent policies.',
    parameters: {
      type: 'object',
      properties: {},
    },
    tier: 'green',
    agent: 'compliance',
    graphEndpoint: '/settings',
    method: 'GET',
    requiredPermissions: ['Directory.Read.All'],
  },
  {
    name: 'compliance_run_assessment',
    description: 'Run a compliance assessment against a framework (CMMC Level 1, NIST 800-171, CIS M365, HIPAA). Scans tenant configuration and returns pass/fail/warning for each control.',
    parameters: {
      type: 'object',
      properties: {
        framework: {
          type: 'string',
          enum: ['cmmc-l1', 'cmmc-l2', 'nist-800-171', 'cis-m365', 'hipaa', 'soc2', 'iso-27001', 'zero-trust'],
          description: 'Compliance framework to assess against',
        },
        processingMode: { type: 'string', enum: ['quick', 'smart', 'deep'], description: 'Assessment depth (default: smart)' },
      },
      required: ['framework'],
    },
    tier: 'green',
    agent: 'compliance',
    requiredPermissions: ['Policy.Read.All', 'SecurityEvents.Read.All', 'Directory.Read.All'],
  },

  // --- YELLOW TIER ---

  {
    name: 'graph_create_ca_policy',
    description: 'Create a new Conditional Access policy. Can be created in report-only mode for safe testing.',
    parameters: {
      type: 'object',
      properties: {
        displayName: { type: 'string', description: 'Policy name' },
        state: { type: 'string', enum: ['enabled', 'disabled', 'enabledForReportingButNotEnforced'], description: 'Initial state (default: report-only)' },
        conditions: { type: 'object', description: 'Policy conditions (users, apps, locations, platforms, risk levels)' },
        grantControls: { type: 'object', description: 'Grant controls (MFA, compliant device, approved app, etc.)' },
        sessionControls: { type: 'object', description: 'Session controls (sign-in frequency, persistent browser, etc.)' },
      },
      required: ['displayName', 'conditions', 'grantControls'],
    },
    tier: 'yellow',
    agent: 'compliance',
    graphEndpoint: '/identity/conditionalAccess/policies',
    method: 'POST',
    requiredPermissions: ['Policy.ReadWrite.ConditionalAccess'],
  },
  {
    name: 'graph_update_ca_policy',
    description: 'Update an existing Conditional Access policy. Use to change state (e.g., report-only → enabled), modify conditions, or adjust controls.',
    parameters: {
      type: 'object',
      properties: {
        policyId: { type: 'string', description: 'CA Policy ID' },
        state: { type: 'string', enum: ['enabled', 'disabled', 'enabledForReportingButNotEnforced'] },
        displayName: { type: 'string' },
        conditions: { type: 'object' },
        grantControls: { type: 'object' },
      },
      required: ['policyId'],
    },
    tier: 'yellow',
    agent: 'compliance',
    graphEndpoint: '/identity/conditionalAccess/policies/{policyId}',
    method: 'PATCH',
    requiredPermissions: ['Policy.ReadWrite.ConditionalAccess'],
  },

  // --- RED TIER ---

  {
    name: 'graph_delete_ca_policy',
    description: 'Delete a Conditional Access policy. DESTRUCTIVE — may affect user access immediately.',
    parameters: {
      type: 'object',
      properties: {
        policyId: { type: 'string', description: 'CA Policy ID to delete' },
      },
      required: ['policyId'],
    },
    tier: 'red',
    agent: 'compliance',
    graphEndpoint: '/identity/conditionalAccess/policies/{policyId}',
    method: 'DELETE',
    requiredPermissions: ['Policy.ReadWrite.ConditionalAccess'],
  },
];
