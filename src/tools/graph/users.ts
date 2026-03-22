import type { AgentTool } from '@/agents/types';

/**
 * Microsoft Graph API tools for user management.
 * These are MCP-compatible tool definitions that the Identity Agent can call.
 */

export const USER_TOOLS: AgentTool[] = [
  // --- GREEN TIER (auto-approved) ---

  {
    name: 'graph_search_users',
    description: 'Search for users in the tenant by name, email, or UPN. Returns matching users with their ID, display name, email, and status.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term (name, email, or UPN)' },
        top: { type: 'number', description: 'Max results (default 10)' },
        filter: { type: 'string', description: 'OData filter (e.g., accountEnabled eq true)' },
      },
      required: ['search'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users',
    method: 'GET',
    requiredPermissions: ['User.Read.All'],
  },
  {
    name: 'graph_get_user',
    description: 'Get detailed information about a specific user including their licenses, groups, sign-in activity, and MFA status.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (GUID) or UPN (user@domain.com)' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users/{userId}',
    method: 'GET',
    requiredPermissions: ['User.Read.All'],
  },
  {
    name: 'graph_reset_password',
    description: 'Reset a user\'s password. Generates a temporary password and optionally forces change at next login.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        temporaryPassword: { type: 'string', description: 'Temporary password (auto-generated if omitted)' },
        forceChangeAtLogin: { type: 'boolean', description: 'Require password change at next login (default true)' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users/{userId}',
    method: 'PATCH',
    requiredPermissions: ['UserAuthenticationMethod.ReadWrite.All'],
  },
  {
    name: 'graph_reset_mfa',
    description: 'Remove all MFA authentication methods for a user, forcing them to re-register at next sign-in. Use when a user gets a new phone.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        revokeSessions: { type: 'boolean', description: 'Also revoke active sign-in sessions (default true)' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'identity',
    requiredPermissions: ['UserAuthenticationMethod.ReadWrite.All'],
  },
  {
    name: 'graph_unlock_account',
    description: 'Unblock a user account that has been blocked from sign-in.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users/{userId}',
    method: 'PATCH',
    requiredPermissions: ['User.ReadWrite.All'],
  },
  {
    name: 'graph_list_groups',
    description: 'List groups a user belongs to, or list all groups in the tenant.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID to list memberships for (omit for all groups)' },
        search: { type: 'string', description: 'Search groups by name' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/groups',
    method: 'GET',
    requiredPermissions: ['Group.Read.All'],
  },
  {
    name: 'graph_add_group_member',
    description: 'Add a user to a security group, distribution group, or Microsoft 365 group.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Group ID' },
        userId: { type: 'string', description: 'User ID to add' },
      },
      required: ['groupId', 'userId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/groups/{groupId}/members/$ref',
    method: 'POST',
    requiredPermissions: ['GroupMember.ReadWrite.All'],
  },
  {
    name: 'graph_remove_group_member',
    description: 'Remove a user from a group.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Group ID' },
        userId: { type: 'string', description: 'User ID to remove' },
      },
      required: ['groupId', 'userId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/groups/{groupId}/members/{userId}/$ref',
    method: 'DELETE',
    requiredPermissions: ['GroupMember.ReadWrite.All'],
  },
  {
    name: 'graph_assign_license',
    description: 'Assign an M365 license (e.g., Business Premium, E3, E5) to a user.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        skuId: { type: 'string', description: 'License SKU ID (GUID)' },
        disabledPlans: { type: 'array', items: { type: 'string' }, description: 'Service plan IDs to disable (optional)' },
      },
      required: ['userId', 'skuId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users/{userId}/assignLicense',
    method: 'POST',
    requiredPermissions: ['User.ReadWrite.All'],
  },
  {
    name: 'graph_remove_license',
    description: 'Remove an M365 license from a user.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        skuId: { type: 'string', description: 'License SKU ID to remove' },
      },
      required: ['userId', 'skuId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users/{userId}/assignLicense',
    method: 'POST',
    requiredPermissions: ['User.ReadWrite.All'],
  },

  // --- YELLOW TIER (requires approval) ---

  {
    name: 'graph_create_user',
    description: 'Create a new user in the tenant with the specified properties.',
    parameters: {
      type: 'object',
      properties: {
        displayName: { type: 'string', description: 'Full display name' },
        userPrincipalName: { type: 'string', description: 'UPN (user@domain.com)' },
        mailNickname: { type: 'string', description: 'Mail alias' },
        password: { type: 'string', description: 'Initial password (auto-generated if omitted)' },
        department: { type: 'string' },
        jobTitle: { type: 'string' },
        usageLocation: { type: 'string', description: 'ISO country code (default US)' },
        forceChangePasswordNextSignIn: { type: 'boolean', description: 'Default true' },
      },
      required: ['displayName', 'userPrincipalName', 'mailNickname'],
    },
    tier: 'yellow',
    agent: 'identity',
    graphEndpoint: '/users',
    method: 'POST',
    requiredPermissions: ['User.ReadWrite.All'],
  },
  {
    name: 'graph_disable_user',
    description: 'Disable a user account (block sign-in). Does not delete data or licenses.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        revokeSessions: { type: 'boolean', description: 'Also revoke active sessions (default true)' },
      },
      required: ['userId'],
    },
    tier: 'yellow',
    agent: 'identity',
    graphEndpoint: '/users/{userId}',
    method: 'PATCH',
    requiredPermissions: ['User.ReadWrite.All'],
  },

  // --- RED TIER (requires approval + confirmation) ---

  {
    name: 'graph_delete_user',
    description: 'Delete a user account. This moves the user to the deleted users container (recoverable for 30 days).',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
      },
      required: ['userId'],
    },
    tier: 'red',
    agent: 'identity',
    graphEndpoint: '/users/{userId}',
    method: 'DELETE',
    requiredPermissions: ['User.ReadWrite.All'],
  },
  {
    name: 'graph_bulk_disable_users',
    description: 'Disable multiple user accounts at once. HIGH IMPACT — requires confirmation.',
    parameters: {
      type: 'object',
      properties: {
        userIds: { type: 'array', items: { type: 'string' }, description: 'Array of User IDs or UPNs to disable' },
        revokeSessions: { type: 'boolean', description: 'Also revoke all active sessions (default true)' },
      },
      required: ['userIds'],
    },
    tier: 'red',
    agent: 'identity',
    requiredPermissions: ['User.ReadWrite.All'],
  },
];
