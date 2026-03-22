import type { AgentTool } from '@/agents/types';

/**
 * Security tools for the Security Agent.
 * Covers: Secure Score, risky sign-ins, risky users, security alerts, incident response.
 */

export const SECURITY_TOOLS: AgentTool[] = [
  // --- GREEN TIER ---

  {
    name: 'graph_get_secure_score',
    description: 'Get the current Microsoft Secure Score for the tenant, including breakdown by category and improvement actions.',
    parameters: {
      type: 'object',
      properties: {
        top: { type: 'number', description: 'Number of score entries (default 1 = latest)' },
      },
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/security/secureScores',
    method: 'GET',
    requiredPermissions: ['SecurityEvents.Read.All'],
  },
  {
    name: 'graph_list_risky_users',
    description: 'List users flagged as risky by Entra ID Protection. Shows risk level, risk state, and last detection.',
    parameters: {
      type: 'object',
      properties: {
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by risk level' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/identityProtection/riskyUsers',
    method: 'GET',
    requiredPermissions: ['IdentityRiskyUser.Read.All'],
  },
  {
    name: 'graph_list_risky_signins',
    description: 'List risky sign-in events detected by Entra ID Protection. Shows location, IP, device, and risk details.',
    parameters: {
      type: 'object',
      properties: {
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by risk level' },
        userId: { type: 'string', description: 'Filter by specific user' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/identityProtection/riskyServicePrincipals',
    method: 'GET',
    requiredPermissions: ['IdentityRiskyUser.Read.All'],
  },
  {
    name: 'graph_list_security_alerts',
    description: 'List active security alerts from Microsoft Defender. Shows alert type, severity, status, and affected entities.',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'informational'], description: 'Filter by severity' },
        status: { type: 'string', enum: ['new', 'inProgress', 'resolved'], description: 'Filter by status' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/security/alerts_v2',
    method: 'GET',
    requiredPermissions: ['SecurityAlert.Read.All'],
  },
  {
    name: 'graph_get_sign_in_logs',
    description: 'Get sign-in activity logs for a specific user. Shows location, IP, device, app, status, and conditional access results.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        top: { type: 'number', description: 'Max results (default 25)' },
        status: { type: 'string', enum: ['success', 'failure'], description: 'Filter by sign-in result' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/auditLogs/signIns',
    method: 'GET',
    requiredPermissions: ['AuditLog.Read.All'],
  },
  {
    name: 'graph_get_audit_logs',
    description: 'Search the unified audit log for tenant activity. Useful for investigating who changed what and when.',
    parameters: {
      type: 'object',
      properties: {
        activityType: { type: 'string', description: 'Activity display name to filter (e.g., "Update user", "Add member to group")' },
        userId: { type: 'string', description: 'Filter by user who performed the action' },
        startDate: { type: 'string', description: 'Start date (ISO format)' },
        endDate: { type: 'string', description: 'End date (ISO format)' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/auditLogs/directoryAudits',
    method: 'GET',
    requiredPermissions: ['AuditLog.Read.All'],
  },
  {
    name: 'graph_check_inbox_rules',
    description: 'List mail inbox rules for a user. Critical for detecting BEC — attackers often create forwarding rules.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN to check' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/users/{userId}/mailFolders/inbox/messageRules',
    method: 'GET',
    requiredPermissions: ['MailboxSettings.Read'],
  },
  {
    name: 'graph_list_app_consents',
    description: 'List OAuth app consents granted by or to a user. Detects illicit consent grants (common attack vector).',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN (omit for tenant-wide)' },
        top: { type: 'number', description: 'Max results (default 50)' },
      },
    },
    tier: 'green',
    agent: 'security',
    graphEndpoint: '/oauth2PermissionGrants',
    method: 'GET',
    requiredPermissions: ['DelegatedPermissionGrant.ReadWrite.All'],
  },

  // --- YELLOW TIER ---

  {
    name: 'graph_dismiss_risky_user',
    description: 'Dismiss a user risk flag (marks as safe after investigation).',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Risky user ID' },
      },
      required: ['userId'],
    },
    tier: 'yellow',
    agent: 'security',
    graphEndpoint: '/identityProtection/riskyUsers/{userId}/dismiss',
    method: 'POST',
    requiredPermissions: ['IdentityRiskyUser.ReadWrite.All'],
  },
  {
    name: 'graph_confirm_compromised',
    description: 'Confirm a user as compromised. Triggers risk-based conditional access policies.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID to confirm as compromised' },
      },
      required: ['userId'],
    },
    tier: 'yellow',
    agent: 'security',
    graphEndpoint: '/identityProtection/riskyUsers/{userId}/confirmCompromised',
    method: 'POST',
    requiredPermissions: ['IdentityRiskyUser.ReadWrite.All'],
  },
  {
    name: 'security_investigate_account',
    description: 'Run a full compromise investigation on a user account: check sign-in logs, inbox rules, app consents, MFA methods, and recent audit activity. Returns a consolidated investigation report.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN to investigate' },
        reason: { type: 'string', description: 'Reason for investigation' },
      },
      required: ['userId'],
    },
    tier: 'yellow',
    agent: 'security',
    requiredPermissions: ['AuditLog.Read.All', 'IdentityRiskyUser.Read.All', 'MailboxSettings.Read'],
  },

  // --- RED TIER ---

  {
    name: 'graph_revoke_app_consent',
    description: 'Revoke an OAuth app consent grant. May break integrations that depend on it.',
    parameters: {
      type: 'object',
      properties: {
        grantId: { type: 'string', description: 'OAuth permission grant ID to revoke' },
      },
      required: ['grantId'],
    },
    tier: 'red',
    agent: 'security',
    graphEndpoint: '/oauth2PermissionGrants/{grantId}',
    method: 'DELETE',
    requiredPermissions: ['DelegatedPermissionGrant.ReadWrite.All'],
  },
];
