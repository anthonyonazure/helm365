/**
 * Tool Executor — translates agent tool calls into real Graph API requests.
 * Sits between the gateway (which approved the action) and the Graph API client.
 */

import { graphFetch, type GraphCredentials } from '@/lib/graph-client';

export interface ToolExecRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  credentials: GraphCredentials;
}

export interface ToolExecResult {
  success: boolean;
  data: unknown;
  summary: string; // Human-readable result for display
  rollbackData?: Record<string, unknown>; // State snapshot for undo
  error?: string;
}

type ToolHandler = (args: Record<string, unknown>, creds: GraphCredentials) => Promise<ToolExecResult>;

const handlers = new Map<string, ToolHandler>();

function register(name: string, handler: ToolHandler) {
  handlers.set(name, handler);
}

export async function executeTool(request: ToolExecRequest): Promise<ToolExecResult> {
  const handler = handlers.get(request.toolName);
  if (!handler) {
    return {
      success: false,
      data: null,
      summary: `Unknown tool: ${request.toolName}`,
      error: `No handler registered for tool "${request.toolName}"`,
    };
  }

  try {
    return await handler(request.arguments, request.credentials);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      data: null,
      summary: `Tool execution failed: ${message}`,
      error: message,
    };
  }
}

// ─── Identity Tools ───────────────────────────────────────────────────

register('graph_search_users', async (args, creds) => {
  const search = args.search as string;
  const top = (args.top as number) ?? 10;

  const result = await graphFetch(creds, '/users', {
    params: {
      '$search': `"displayName:${search}" OR "mail:${search}" OR "userPrincipalName:${search}"`,
      '$top': String(top),
      '$select': 'id,displayName,mail,userPrincipalName,accountEnabled,department,jobTitle',
      '$orderby': 'displayName',
      'ConsistencyLevel': 'eventual',
      '$count': 'true',
    },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `Search failed: ${result.error}`, error: result.error };
  }

  const users = (result.data as { value: Array<{
    displayName: string;
    mail: string;
    userPrincipalName: string;
    accountEnabled: boolean;
    department: string;
    jobTitle: string;
  }> }).value ?? [];

  const summary = users.length === 0
    ? `No users found matching "${search}"`
    : `Found ${users.length} user(s): ${users.map((u) => `${u.displayName} (${u.userPrincipalName})`).join(', ')}`;

  return { success: true, data: users, summary };
});

register('graph_get_user', async (args, creds) => {
  const userId = args.userId as string;

  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    params: {
      '$select': 'id,displayName,mail,userPrincipalName,accountEnabled,department,jobTitle,mobilePhone,officeLocation,createdDateTime,lastPasswordChangeDateTime',
    },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `User lookup failed: ${result.error}`, error: result.error };
  }

  const user = result.data as Record<string, unknown>;
  return {
    success: true,
    data: user,
    summary: `${user.displayName} (${user.userPrincipalName}) — ${user.accountEnabled ? 'Active' : 'Disabled'}, ${user.department ?? 'No department'}`,
  };
});

register('graph_reset_password', async (args, creds) => {
  const userId = args.userId as string;
  const tempPassword = (args.temporaryPassword as string) ?? generateTempPassword();
  const forceChange = (args.forceChangeAtLogin as boolean) ?? true;

  // Capture current state for rollback
  const currentUser = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    params: { '$select': 'id,displayName,userPrincipalName' },
  });

  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: {
      passwordProfile: {
        password: tempPassword,
        forceChangePasswordNextSignIn: forceChange,
      },
    },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `Password reset failed: ${result.error}`, error: result.error };
  }

  const userName = (currentUser.data as Record<string, unknown>)?.displayName ?? userId;

  return {
    success: true,
    data: { temporaryPassword: tempPassword, forceChange },
    summary: `Password reset for ${userName}. Temp password: ${tempPassword}${forceChange ? ' (must change at next login)' : ''}`,
    rollbackData: { userId, action: 'password_reset' }, // Can't undo password reset, but log it
  };
});

register('graph_reset_mfa', async (args, creds) => {
  const userId = args.userId as string;
  const revokeSessions = (args.revokeSessions as boolean) ?? true;

  // Get current auth methods
  const methodsResult = await graphFetch(creds, `/users/${encodeURIComponent(userId)}/authentication/methods`);

  if (!methodsResult.ok) {
    return { success: false, data: null, summary: `Failed to get auth methods: ${methodsResult.error}`, error: methodsResult.error };
  }

  const methods = (methodsResult.data as { value: Array<{ id: string; '@odata.type': string }> }).value ?? [];

  // Delete each non-password auth method
  let deleted = 0;
  const deletable = methods.filter((m) =>
    !m['@odata.type']?.includes('passwordAuthenticationMethod'),
  );

  for (const method of deletable) {
    const methodType = getMethodEndpoint(method['@odata.type'] ?? '');
    if (methodType) {
      const delResult = await graphFetch(creds, `/users/${encodeURIComponent(userId)}/authentication/${methodType}/${method.id}`, {
        method: 'DELETE',
      });
      if (delResult.ok || delResult.status === 204) deleted++;
    }
  }

  // Revoke sessions if requested
  if (revokeSessions) {
    await graphFetch(creds, `/users/${encodeURIComponent(userId)}/revokeSignInSessions`, {
      method: 'POST',
    });
  }

  // Get user name for summary
  const userResult = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    params: { '$select': 'displayName' },
  });
  const userName = (userResult.data as Record<string, unknown>)?.displayName ?? userId;

  return {
    success: true,
    data: { methodsRemoved: deleted, sessionsRevoked: revokeSessions },
    summary: `MFA reset for ${userName}. ${deleted} auth method(s) removed${revokeSessions ? ', sessions revoked' : ''}. User will be prompted to re-register MFA at next sign-in.`,
    rollbackData: { userId, methodsRemoved: deleted },
  };
});

register('graph_unlock_account', async (args, creds) => {
  const userId = args.userId as string;

  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { accountEnabled: true },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `Unlock failed: ${result.error}`, error: result.error };
  }

  return {
    success: true,
    data: { accountEnabled: true },
    summary: `Account unlocked for ${userId}. Sign-in is now enabled.`,
    rollbackData: { userId, previousState: { accountEnabled: false } },
  };
});

register('graph_assign_license', async (args, creds) => {
  const userId = args.userId as string;
  const skuId = args.skuId as string;
  const disabledPlans = (args.disabledPlans as string[]) ?? [];

  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}/assignLicense`, {
    method: 'POST',
    body: {
      addLicenses: [{
        skuId,
        disabledPlans,
      }],
      removeLicenses: [],
    },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `License assignment failed: ${result.error}`, error: result.error };
  }

  return {
    success: true,
    data: result.data,
    summary: `License ${skuId} assigned to ${userId}.`,
    rollbackData: { userId, skuId, action: 'assign' },
  };
});

register('graph_add_group_member', async (args, creds) => {
  const groupId = args.groupId as string;
  const userId = args.userId as string;

  const result = await graphFetch(creds, `/groups/${groupId}/members/$ref`, {
    method: 'POST',
    body: {
      '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `Add to group failed: ${result.error}`, error: result.error };
  }

  return {
    success: true,
    data: null,
    summary: `User ${userId} added to group ${groupId}.`,
    rollbackData: { groupId, userId, action: 'add' },
  };
});

register('graph_remove_group_member', async (args, creds) => {
  const groupId = args.groupId as string;
  const userId = args.userId as string;

  const result = await graphFetch(creds, `/groups/${groupId}/members/${userId}/$ref`, {
    method: 'DELETE',
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `Remove from group failed: ${result.error}`, error: result.error };
  }

  return {
    success: true,
    data: null,
    summary: `User ${userId} removed from group ${groupId}.`,
    rollbackData: { groupId, userId, action: 'remove' },
  };
});

register('graph_create_user', async (args, creds) => {
  const password = (args.password as string) ?? generateTempPassword();

  const result = await graphFetch(creds, '/users', {
    method: 'POST',
    body: {
      displayName: args.displayName,
      userPrincipalName: args.userPrincipalName,
      mailNickname: args.mailNickname,
      accountEnabled: true,
      usageLocation: (args.usageLocation as string) ?? 'US',
      department: args.department,
      jobTitle: args.jobTitle,
      passwordProfile: {
        password,
        forceChangePasswordNextSignIn: (args.forceChangePasswordNextSignIn as boolean) ?? true,
      },
    },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `User creation failed: ${result.error}`, error: result.error };
  }

  const user = result.data as Record<string, unknown>;

  return {
    success: true,
    data: { ...user, temporaryPassword: password },
    summary: `User ${args.displayName} (${args.userPrincipalName}) created. Temp password: ${password}`,
    rollbackData: { userId: user.id, action: 'create' },
  };
});

register('graph_disable_user', async (args, creds) => {
  const userId = args.userId as string;
  const revokeSessions = (args.revokeSessions as boolean) ?? true;

  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { accountEnabled: false },
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `Disable failed: ${result.error}`, error: result.error };
  }

  if (revokeSessions) {
    await graphFetch(creds, `/users/${encodeURIComponent(userId)}/revokeSignInSessions`, {
      method: 'POST',
    });
  }

  return {
    success: true,
    data: { accountEnabled: false, sessionsRevoked: revokeSessions },
    summary: `Account disabled for ${userId}.${revokeSessions ? ' Sessions revoked.' : ''}`,
    rollbackData: { userId, previousState: { accountEnabled: true } },
  };
});

register('graph_delete_user', async (args, creds) => {
  const userId = args.userId as string;

  // Capture full user state for rollback info (can't actually restore, but for audit)
  const userResult = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    params: { '$select': 'id,displayName,userPrincipalName,mail,department' },
  });

  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });

  if (!result.ok) {
    return { success: false, data: null, summary: `Delete failed: ${result.error}`, error: result.error };
  }

  const userName = (userResult.data as Record<string, unknown>)?.displayName ?? userId;

  return {
    success: true,
    data: null,
    summary: `User ${userName} deleted. Recoverable from deleted users for 30 days.`,
    rollbackData: { userId, userData: userResult.data, action: 'delete' },
  };
});

register('graph_list_groups', async (args, creds) => {
  const userId = args.userId as string | undefined;
  const search = args.search as string | undefined;
  const top = (args.top as number) ?? 25;

  let endpoint = '/groups';
  const params: Record<string, string> = {
    '$top': String(top),
    '$select': 'id,displayName,description,groupTypes,mailEnabled,securityEnabled',
  };

  if (userId) {
    endpoint = `/users/${encodeURIComponent(userId)}/memberOf`;
    params['$select'] = 'id,displayName';
  }

  if (search) {
    params['$search'] = `"displayName:${search}"`;
    params['ConsistencyLevel'] = 'eventual';
  }

  const result = await graphFetch(creds, endpoint, { params });

  if (!result.ok) {
    return { success: false, data: null, summary: `Group lookup failed: ${result.error}`, error: result.error };
  }

  const groups = (result.data as { value: Array<{ displayName: string; id: string }> }).value ?? [];

  return {
    success: true,
    data: groups,
    summary: userId
      ? `${groups.length} group(s) for user: ${groups.map((g) => g.displayName).join(', ')}`
      : `${groups.length} group(s) found: ${groups.slice(0, 5).map((g) => g.displayName).join(', ')}${groups.length > 5 ? '...' : ''}`,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$%&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure at least one special char
  password += special.charAt(Math.floor(Math.random() * special.length));
  return password;
}

function getMethodEndpoint(odataType: string): string | null {
  if (odataType.includes('phone')) return 'phoneMethods';
  if (odataType.includes('fido2')) return 'fido2Methods';
  if (odataType.includes('microsoftAuthenticator')) return 'microsoftAuthenticatorMethods';
  if (odataType.includes('windowsHelloForBusiness')) return 'windowsHelloForBusinessMethods';
  if (odataType.includes('email')) return 'emailMethods';
  if (odataType.includes('temporaryAccessPass')) return 'temporaryAccessPassMethods';
  if (odataType.includes('softwareOath')) return 'softwareOathMethods';
  return null;
}
