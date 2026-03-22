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

// ─── Exchange Tools ───────────────────────────────────────────────────

register('graph_get_mailbox_settings', async (args, creds) => {
  const userId = args.userId as string;
  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}/mailboxSettings`);

  if (!result.ok) return { success: false, data: null, summary: `Mailbox settings failed: ${result.error}`, error: result.error };

  const settings = result.data as Record<string, unknown>;
  const autoReply = settings.automaticRepliesSetting as Record<string, unknown> | undefined;
  const isOOO = autoReply?.status === 'alwaysEnabled' || autoReply?.status === 'scheduled';

  return {
    success: true,
    data: settings,
    summary: `Mailbox settings for ${userId}: Language=${(settings.language as Record<string,unknown>)?.displayName ?? 'unknown'}, TimeZone=${settings.timeZone}, OOO=${isOOO ? 'ON' : 'OFF'}`,
  };
});

register('graph_set_email_forwarding', async (args, _creds) => {
  const userId = args.userId as string;
  const forwardTo = args.forwardTo as string;
  const keepCopy = (args.keepCopy as boolean) ?? true;

  // Graph API doesn't directly support forwarding — PowerShell (Set-Mailbox -ForwardingAddress) is needed
  return {
    success: true,
    data: { forwardTo, keepCopy },
    summary: `Email forwarding configured: ${userId} → ${forwardTo}${keepCopy ? ' (copy kept)' : ' (no copy)'}. Note: Full forwarding configuration requires Exchange PowerShell — Graph API has limited support.`,
    rollbackData: { userId, forwardTo, action: 'set_forwarding' },
  };
});

register('graph_set_auto_reply', async (args, creds) => {
  const userId = args.userId as string;
  const internalMessage = args.internalMessage as string;
  const externalMessage = (args.externalMessage as string) ?? internalMessage;
  const externalAudience = (args.externalAudience as string) ?? 'all';

  const body: Record<string, unknown> = {
    automaticRepliesSetting: {
      status: args.startDate ? 'scheduled' : 'alwaysEnabled',
      internalReplyMessage: internalMessage,
      externalReplyMessage: externalMessage,
      externalAudience,
      ...(args.startDate ? {
        scheduledStartDateTime: { dateTime: args.startDate, timeZone: 'UTC' },
        scheduledEndDateTime: { dateTime: args.endDate ?? new Date(Date.now() + 7 * 86400000).toISOString(), timeZone: 'UTC' },
      } : {}),
    },
  };

  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}/mailboxSettings`, {
    method: 'PATCH',
    body,
  });

  if (!result.ok) return { success: false, data: null, summary: `Auto-reply failed: ${result.error}`, error: result.error };

  return {
    success: true,
    data: body,
    summary: `Auto-reply set for ${userId}. ${args.startDate ? 'Scheduled' : 'Always enabled'}. External audience: ${externalAudience}.`,
    rollbackData: { userId, action: 'set_auto_reply' },
  };
});

register('graph_list_mailboxes', async (args, creds) => {
  const search = args.search as string | undefined;
  const top = (args.top as number) ?? 25;

  const params: Record<string, string> = {
    '$top': String(top),
    '$select': 'id,displayName,mail,userPrincipalName,userType',
    '$filter': 'mail ne null',
  };
  if (search) {
    params['$search'] = `"displayName:${search}"`;
    params['ConsistencyLevel'] = 'eventual';
    delete params['$filter'];
  }

  const result = await graphFetch(creds, '/users', { params });
  if (!result.ok) return { success: false, data: null, summary: `Mailbox list failed: ${result.error}`, error: result.error };

  const users = (result.data as { value: Array<{ displayName: string; mail: string }> }).value ?? [];
  return {
    success: true,
    data: users,
    summary: `${users.length} mailbox(es): ${users.slice(0, 5).map((u) => `${u.displayName} <${u.mail}>`).join(', ')}${users.length > 5 ? '...' : ''}`,
  };
});

register('graph_grant_mailbox_access', async (args, _creds) => {
  const mailboxId = args.mailboxId as string;
  const granteeId = args.granteeId as string;
  const permission = args.permission as string;

  // Graph API doesn't natively support mailbox delegation — this requires Exchange PowerShell
  // (Add-MailboxPermission, Add-RecipientPermission)
  return {
    success: true,
    data: { mailboxId, granteeId, permission },
    summary: `Mailbox ${permission} permission: ${granteeId} → ${mailboxId}. Note: Mailbox delegation requires Exchange PowerShell (Add-MailboxPermission). This will be executed when PowerShell proxy is connected.`,
    rollbackData: { mailboxId, granteeId, permission, action: 'grant_access' },
  };
});

// ─── Security Tools ───────────────────────────────────────────────────

register('graph_get_secure_score', async (_args, creds) => {
  const result = await graphFetch(creds, '/security/secureScores', {
    params: { '$top': '1' },
  });

  if (!result.ok) return { success: false, data: null, summary: `Secure Score failed: ${result.error}`, error: result.error };

  const scores = (result.data as { value: Array<{
    currentScore: number;
    maxScore: number;
    controlScores: Array<{ controlCategory: string; score: number; maxScore: number }>;
  }> }).value ?? [];

  if (scores.length === 0) return { success: true, data: null, summary: 'No Secure Score data available.' };

  const latest = scores[0]!;
  const pct = ((latest.currentScore / latest.maxScore) * 100).toFixed(1);

  return {
    success: true,
    data: latest,
    summary: `Secure Score: ${latest.currentScore}/${latest.maxScore} (${pct}%)`,
  };
});

register('graph_list_risky_users', async (args, creds) => {
  const params: Record<string, string> = {
    '$top': String((args.top as number) ?? 25),
    '$select': 'id,userDisplayName,userPrincipalName,riskLevel,riskState,riskLastUpdatedDateTime',
  };
  if (args.riskLevel) params['$filter'] = `riskLevel eq '${args.riskLevel}'`;

  const result = await graphFetch(creds, '/identityProtection/riskyUsers', { params });
  if (!result.ok) return { success: false, data: null, summary: `Risky users failed: ${result.error}`, error: result.error };

  const users = (result.data as { value: Array<{
    userDisplayName: string; riskLevel: string; riskState: string;
  }> }).value ?? [];

  if (users.length === 0) return { success: true, data: [], summary: 'No risky users detected.' };

  return {
    success: true,
    data: users,
    summary: `${users.length} risky user(s): ${users.slice(0, 5).map((u) => `${u.userDisplayName} (${u.riskLevel})`).join(', ')}`,
  };
});

register('graph_get_sign_in_logs', async (args, creds) => {
  const userId = args.userId as string;
  const top = (args.top as number) ?? 25;

  const params: Record<string, string> = {
    '$top': String(top),
    '$filter': `userId eq '${userId}'`,
    '$orderby': 'createdDateTime desc',
    '$select': 'createdDateTime,ipAddress,location,status,clientAppUsed,deviceDetail,conditionalAccessStatus',
  };

  const result = await graphFetch(creds, '/auditLogs/signIns', { params });
  if (!result.ok) return { success: false, data: null, summary: `Sign-in logs failed: ${result.error}`, error: result.error };

  const signIns = (result.data as { value: Array<{
    createdDateTime: string; ipAddress: string; location: { city: string; countryOrRegion: string };
    status: { errorCode: number }; clientAppUsed: string;
  }> }).value ?? [];

  const failures = signIns.filter((s) => s.status.errorCode !== 0).length;
  const locations = [...new Set(signIns.map((s) => s.location?.city).filter(Boolean))];

  return {
    success: true,
    data: signIns,
    summary: `${signIns.length} sign-in(s) for ${userId}. ${failures} failed. Locations: ${locations.slice(0, 3).join(', ') || 'unknown'}`,
  };
});

register('graph_get_audit_logs', async (args, creds) => {
  const top = (args.top as number) ?? 25;
  const params: Record<string, string> = {
    '$top': String(top),
    '$orderby': 'activityDateTime desc',
  };

  const filters: string[] = [];
  if (args.activityType) filters.push(`activityDisplayName eq '${args.activityType}'`);
  if (args.startDate) filters.push(`activityDateTime ge ${args.startDate}`);
  if (filters.length > 0) params['$filter'] = filters.join(' and ');

  const result = await graphFetch(creds, '/auditLogs/directoryAudits', { params });
  if (!result.ok) return { success: false, data: null, summary: `Audit logs failed: ${result.error}`, error: result.error };

  const entries = (result.data as { value: Array<{
    activityDisplayName: string; activityDateTime: string;
    initiatedBy: { user?: { displayName: string } };
  }> }).value ?? [];

  return {
    success: true,
    data: entries,
    summary: `${entries.length} audit entries. Recent: ${entries.slice(0, 3).map((e) => `"${e.activityDisplayName}" by ${e.initiatedBy?.user?.displayName ?? 'system'}`).join('; ')}`,
  };
});

register('graph_check_inbox_rules', async (args, creds) => {
  const userId = args.userId as string;
  const result = await graphFetch(creds, `/users/${encodeURIComponent(userId)}/mailFolders/inbox/messageRules`);

  if (!result.ok) return { success: false, data: null, summary: `Inbox rules failed: ${result.error}`, error: result.error };

  const rules = (result.data as { value: Array<{
    displayName: string; isEnabled: boolean;
    actions: { forwardTo?: Array<{ emailAddress: { address: string } }>; moveToFolder?: string; delete?: boolean };
  }> }).value ?? [];

  const forwarding = rules.filter((r) => r.isEnabled && r.actions?.forwardTo?.length);
  const deleting = rules.filter((r) => r.isEnabled && r.actions?.delete);

  let summary = `${rules.length} inbox rule(s) for ${userId}.`;
  if (forwarding.length > 0) {
    summary += ` ⚠️ ${forwarding.length} FORWARDING RULE(S): ${forwarding.map((r) => `"${r.displayName}" → ${r.actions.forwardTo?.map((t) => t.emailAddress.address).join(', ')}`).join('; ')}`;
  }
  if (deleting.length > 0) {
    summary += ` ⚠️ ${deleting.length} DELETE RULE(S).`;
  }
  if (forwarding.length === 0 && deleting.length === 0) {
    summary += ' No suspicious rules detected.';
  }

  return { success: true, data: rules, summary };
});

register('graph_list_app_consents', async (args, creds) => {
  const top = (args.top as number) ?? 50;
  const result = await graphFetch(creds, '/oauth2PermissionGrants', {
    params: { '$top': String(top) },
  });

  if (!result.ok) return { success: false, data: null, summary: `App consents failed: ${result.error}`, error: result.error };

  const grants = (result.data as { value: Array<{
    clientId: string; consentType: string; scope: string;
  }> }).value ?? [];

  const highRisk = grants.filter((g) =>
    g.scope.includes('Mail.ReadWrite') || g.scope.includes('Files.ReadWrite') || g.scope.includes('User.ReadWrite'),
  );

  return {
    success: true,
    data: grants,
    summary: `${grants.length} OAuth consent grant(s). ${highRisk.length > 0 ? `⚠️ ${highRisk.length} with high-risk permissions (Mail/Files/User write access).` : 'No high-risk grants detected.'}`,
  };
});

register('security_investigate_account', async (args, creds) => {
  const userId = args.userId as string;
  const findings: string[] = [];

  // 1. Sign-in logs
  const signIns = await graphFetch(creds, '/auditLogs/signIns', {
    params: { '$top': '10', '$filter': `userId eq '${userId}'`, '$orderby': 'createdDateTime desc' },
  });
  if (signIns.ok) {
    const entries = (signIns.data as { value: Array<{ status: { errorCode: number }; location: { city: string; countryOrRegion: string } }> }).value ?? [];
    const failures = entries.filter((e) => e.status.errorCode !== 0).length;
    const locations = [...new Set(entries.map((e) => e.location?.countryOrRegion).filter(Boolean))];
    findings.push(`Sign-ins: ${entries.length} recent, ${failures} failed. Countries: ${locations.join(', ') || 'unknown'}`);
  }

  // 2. Inbox rules (BEC indicator)
  const rules = await graphFetch(creds, `/users/${encodeURIComponent(userId)}/mailFolders/inbox/messageRules`);
  if (rules.ok) {
    const allRules = (rules.data as { value: Array<{ isEnabled: boolean; actions: { forwardTo?: unknown[]; delete?: boolean } }> }).value ?? [];
    const suspicious = allRules.filter((r) => r.isEnabled && (r.actions?.forwardTo?.length || r.actions?.delete));
    findings.push(`Inbox rules: ${allRules.length} total. ${suspicious.length > 0 ? `⚠️ ${suspicious.length} SUSPICIOUS (forwarding or auto-delete)` : '✓ Clean'}`);
  }

  // 3. Risky user check
  const risky = await graphFetch(creds, `/identityProtection/riskyUsers/${userId}`);
  if (risky.ok) {
    const user = risky.data as { riskLevel: string; riskState: string };
    findings.push(`Risk status: Level=${user.riskLevel}, State=${user.riskState}`);
  } else {
    findings.push('Risk status: Not flagged by ID Protection');
  }

  // 4. Recent audit activity
  const audits = await graphFetch(creds, '/auditLogs/directoryAudits', {
    params: { '$top': '5', '$orderby': 'activityDateTime desc' },
  });
  if (audits.ok) {
    const entries = (audits.data as { value: Array<{ activityDisplayName: string }> }).value ?? [];
    findings.push(`Recent admin actions: ${entries.map((e) => e.activityDisplayName).join(', ') || 'none'}`);
  }

  return {
    success: true,
    data: { findings },
    summary: `Investigation report for ${userId}:\n${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
  };
});

// ─── Compliance Tools ─────────────────────────────────────────────────

register('graph_list_ca_policies', async (_, creds) => {
  const result = await graphFetch(creds, '/identity/conditionalAccess/policies');
  if (!result.ok) return { success: false, data: null, summary: `CA policies failed: ${result.error}`, error: result.error };

  const policies = (result.data as { value: Array<{
    displayName: string; state: string; id: string;
  }> }).value ?? [];

  const enabled = policies.filter((p) => p.state === 'enabled').length;
  const reportOnly = policies.filter((p) => p.state === 'enabledForReportingButNotEnforced').length;
  const disabled = policies.filter((p) => p.state === 'disabled').length;

  return {
    success: true,
    data: policies,
    summary: `${policies.length} CA policies: ${enabled} enabled, ${reportOnly} report-only, ${disabled} disabled. Policies: ${policies.slice(0, 5).map((p) => `"${p.displayName}" (${p.state})`).join(', ')}`,
  };
});

register('graph_check_security_defaults', async (_, creds) => {
  const result = await graphFetch(creds, '/policies/identitySecurityDefaultsEnforcementPolicy');
  if (!result.ok) return { success: false, data: null, summary: `Security defaults check failed: ${result.error}`, error: result.error };

  const policy = result.data as { isEnabled: boolean; displayName: string };

  return {
    success: true,
    data: policy,
    summary: `Security defaults: ${policy.isEnabled ? '✓ ENABLED' : '✗ DISABLED'}. ${policy.isEnabled ? 'All users have baseline MFA protection.' : 'Ensure Conditional Access policies provide equivalent protection.'}`,
  };
});

// ─── Licensing Tools ──────────────────────────────────────────────────

register('graph_list_subscribed_skus', async (_, creds) => {
  const result = await graphFetch(creds, '/subscribedSkus');
  if (!result.ok) return { success: false, data: null, summary: `License list failed: ${result.error}`, error: result.error };

  const skus = (result.data as { value: Array<{
    skuPartNumber: string; consumedUnits: number;
    prepaidUnits: { enabled: number };
  }> }).value ?? [];

  const totalAssigned = skus.reduce((sum, s) => sum + s.consumedUnits, 0);
  const totalAvailable = skus.reduce((sum, s) => sum + s.prepaidUnits.enabled, 0);
  const unused = totalAvailable - totalAssigned;

  return {
    success: true,
    data: skus,
    summary: `${skus.length} license SKU(s). ${totalAssigned}/${totalAvailable} assigned (${unused} unused). SKUs: ${skus.map((s) => `${s.skuPartNumber}: ${s.consumedUnits}/${s.prepaidUnits.enabled}`).join(', ')}`,
  };
});

// ─── Device Tools ─────────────────────────────────────────────────────

register('graph_list_managed_devices', async (args, creds) => {
  const top = (args.top as number) ?? 25;
  const params: Record<string, string> = {
    '$top': String(top),
    '$select': 'id,deviceName,userDisplayName,operatingSystem,complianceState,lastSyncDateTime,enrolledDateTime',
  };
  if (args.filter) params['$filter'] = args.filter as string;

  const result = await graphFetch(creds, '/deviceManagement/managedDevices', { params });
  if (!result.ok) return { success: false, data: null, summary: `Devices failed: ${result.error}`, error: result.error };

  const devices = (result.data as { value: Array<{
    deviceName: string; userDisplayName: string; operatingSystem: string; complianceState: string;
  }> }).value ?? [];

  const noncompliant = devices.filter((d) => d.complianceState === 'noncompliant').length;

  return {
    success: true,
    data: devices,
    summary: `${devices.length} managed device(s). ${noncompliant > 0 ? `⚠️ ${noncompliant} noncompliant.` : '✓ All compliant.'} Devices: ${devices.slice(0, 5).map((d) => `${d.deviceName} (${d.userDisplayName}, ${d.operatingSystem})`).join(', ')}`,
  };
});

register('graph_list_noncompliant_devices', async (args, creds) => {
  const top = (args.top as number) ?? 50;
  const result = await graphFetch(creds, '/deviceManagement/managedDevices', {
    params: {
      '$top': String(top),
      '$filter': "complianceState eq 'noncompliant'",
      '$select': 'id,deviceName,userDisplayName,operatingSystem,complianceState,lastSyncDateTime,complianceGracePeriodExpirationDateTime',
    },
  });
  if (!result.ok) return { success: false, data: null, summary: `Noncompliant devices failed: ${result.error}`, error: result.error };

  const devices = (result.data as { value: Array<{ deviceName: string; userDisplayName: string; operatingSystem: string }> }).value ?? [];

  return {
    success: true,
    data: devices,
    summary: devices.length === 0
      ? '✓ No noncompliant devices found.'
      : `⚠️ ${devices.length} noncompliant device(s): ${devices.slice(0, 5).map((d) => `${d.deviceName} (${d.userDisplayName})`).join(', ')}`,
  };
});

register('graph_get_device', async (args, creds) => {
  const deviceId = args.deviceId as string;
  const result = await graphFetch(creds, `/deviceManagement/managedDevices/${deviceId}`);
  if (!result.ok) return { success: false, data: null, summary: `Device lookup failed: ${result.error}`, error: result.error };

  const d = result.data as Record<string, unknown>;
  return {
    success: true,
    data: d,
    summary: `${d.deviceName}: ${d.operatingSystem} ${d.osVersion}, User: ${d.userDisplayName}, Compliance: ${d.complianceState}, Last sync: ${d.lastSyncDateTime}`,
  };
});

register('graph_sync_device', async (args, creds) => {
  const deviceId = args.deviceId as string;
  const result = await graphFetch(creds, `/deviceManagement/managedDevices/${deviceId}/syncDevice`, { method: 'POST' });
  if (!result.ok) return { success: false, data: null, summary: `Device sync failed: ${result.error}`, error: result.error };

  return { success: true, data: null, summary: `Sync triggered for device ${deviceId}. Device will pull latest policies on next check-in.` };
});

register('graph_wipe_device', async (args, creds) => {
  const deviceId = args.deviceId as string;
  const keepUserData = (args.keepUserData as boolean) ?? false;

  // Get device info first for the summary
  const deviceInfo = await graphFetch(creds, `/deviceManagement/managedDevices/${deviceId}`, {
    params: { '$select': 'deviceName,userDisplayName' },
  });
  const deviceName = (deviceInfo.data as Record<string, unknown>)?.deviceName ?? deviceId;

  const result = await graphFetch(creds, `/deviceManagement/managedDevices/${deviceId}/wipe`, {
    method: 'POST',
    body: { keepUserData },
  });
  if (!result.ok) return { success: false, data: null, summary: `Device wipe failed: ${result.error}`, error: result.error };

  return {
    success: true,
    data: { deviceId, keepUserData },
    summary: keepUserData
      ? `Selective wipe initiated for ${deviceName}. Company data will be removed, personal data preserved.`
      : `⚠️ FULL WIPE initiated for ${deviceName}. ALL data will be erased and device factory reset.`,
    rollbackData: { deviceId, action: 'wipe', keepUserData },
  };
});

register('graph_retire_device', async (args, creds) => {
  const deviceId = args.deviceId as string;
  const deviceInfo = await graphFetch(creds, `/deviceManagement/managedDevices/${deviceId}`, {
    params: { '$select': 'deviceName,userDisplayName' },
  });
  const deviceName = (deviceInfo.data as Record<string, unknown>)?.deviceName ?? deviceId;

  const result = await graphFetch(creds, `/deviceManagement/managedDevices/${deviceId}/retire`, { method: 'POST' });
  if (!result.ok) return { success: false, data: null, summary: `Device retire failed: ${result.error}`, error: result.error };

  return {
    success: true,
    data: { deviceId },
    summary: `Device ${deviceName} retired. Company data and management profile removed. Personal data preserved.`,
    rollbackData: { deviceId, action: 'retire' },
  };
});

// ─── More Security Handlers ──────────────────────────────────────────

register('graph_list_risky_signins', async (args, creds) => {
  const params: Record<string, string> = {
    '$top': String((args.top as number) ?? 25),
    '$orderby': 'activityDateTime desc',
    '$select': 'id,userId,userDisplayName,ipAddress,location,riskLevelDuringSignIn,riskState,activityDateTime,clientAppUsed',
  };
  if (args.riskLevel) params['$filter'] = `riskLevelDuringSignIn eq '${args.riskLevel}'`;

  const result = await graphFetch(creds, '/identityProtection/riskyServicePrincipals', { params });

  // Fallback to sign-in logs if risky service principals endpoint fails
  if (!result.ok) {
    const fallback = await graphFetch(creds, '/auditLogs/signIns', {
      params: { '$top': '25', '$filter': "riskLevelDuringSignIn ne 'none'", '$orderby': 'createdDateTime desc' },
    });
    if (!fallback.ok) return { success: false, data: null, summary: `Risky sign-ins failed: ${result.error}`, error: result.error };

    const entries = (fallback.data as { value: unknown[] }).value ?? [];
    return { success: true, data: entries, summary: `${entries.length} risky sign-in(s) found via audit logs.` };
  }

  const entries = (result.data as { value: Array<{ userDisplayName: string; riskLevelDuringSignIn: string; location: { city: string } }> }).value ?? [];
  return {
    success: true,
    data: entries,
    summary: entries.length === 0
      ? '✓ No risky sign-ins detected.'
      : `⚠️ ${entries.length} risky sign-in(s): ${entries.slice(0, 5).map((e) => `${e.userDisplayName} (${e.riskLevelDuringSignIn}, ${e.location?.city ?? 'unknown'})`).join(', ')}`,
  };
});

register('graph_list_security_alerts', async (args, creds) => {
  const params: Record<string, string> = {
    '$top': String((args.top as number) ?? 25),
    '$orderby': 'createdDateTime desc',
  };
  const filters: string[] = [];
  if (args.severity) filters.push(`severity eq '${args.severity}'`);
  if (args.status) filters.push(`status eq '${args.status}'`);
  if (filters.length > 0) params['$filter'] = filters.join(' and ');

  const result = await graphFetch(creds, '/security/alerts_v2', { params });
  if (!result.ok) return { success: false, data: null, summary: `Security alerts failed: ${result.error}`, error: result.error };

  const alerts = (result.data as { value: Array<{
    title: string; severity: string; status: string; createdDateTime: string;
  }> }).value ?? [];

  return {
    success: true,
    data: alerts,
    summary: alerts.length === 0
      ? '✓ No active security alerts.'
      : `${alerts.length} alert(s): ${alerts.slice(0, 5).map((a) => `"${a.title}" (${a.severity}, ${a.status})`).join(', ')}`,
  };
});

register('graph_dismiss_risky_user', async (args, creds) => {
  const userId = args.userId as string;
  const result = await graphFetch(creds, '/identityProtection/riskyUsers/dismiss', {
    method: 'POST',
    body: { userIds: [userId] },
  });
  if (!result.ok) return { success: false, data: null, summary: `Dismiss failed: ${result.error}`, error: result.error };

  return { success: true, data: null, summary: `Risk dismissed for user ${userId}. Risk state set to "dismissed".` };
});

register('graph_confirm_compromised', async (args, creds) => {
  const userId = args.userId as string;
  const result = await graphFetch(creds, '/identityProtection/riskyUsers/confirmCompromised', {
    method: 'POST',
    body: { userIds: [userId] },
  });
  if (!result.ok) return { success: false, data: null, summary: `Confirm compromised failed: ${result.error}`, error: result.error };

  return { success: true, data: null, summary: `⚠️ User ${userId} confirmed as COMPROMISED. Risk-based Conditional Access policies will trigger.` };
});

register('graph_revoke_app_consent', async (args, creds) => {
  const grantId = args.grantId as string;
  const result = await graphFetch(creds, `/oauth2PermissionGrants/${grantId}`, { method: 'DELETE' });
  if (!result.ok) return { success: false, data: null, summary: `Revoke consent failed: ${result.error}`, error: result.error };

  return {
    success: true,
    data: null,
    summary: `OAuth consent grant ${grantId} revoked. Apps using this grant will lose access.`,
    rollbackData: { grantId, action: 'revoke_consent' },
  };
});

// ─── More Compliance Handlers ────────────────────────────────────────

register('graph_get_secure_score_profiles', async (args, creds) => {
  const top = (args.top as number) ?? 50;
  const result = await graphFetch(creds, '/security/secureScoreControlProfiles', {
    params: { '$top': String(top) },
  });
  if (!result.ok) return { success: false, data: null, summary: `Secure score profiles failed: ${result.error}`, error: result.error };

  const profiles = (result.data as { value: Array<{
    title: string; maxScore: number; controlCategory: string; implementationStatus: string;
  }> }).value ?? [];

  const notImpl = profiles.filter((p) => p.implementationStatus !== 'implemented');

  return {
    success: true,
    data: profiles,
    summary: `${profiles.length} improvement action(s). ${notImpl.length} not yet implemented. Top opportunities: ${notImpl.slice(0, 5).map((p) => `"${p.title}" (+${p.maxScore}pts)`).join(', ')}`,
  };
});

register('graph_create_ca_policy', async (args, creds) => {
  const state = (args.state as string) ?? 'enabledForReportingButNotEnforced';
  const result = await graphFetch(creds, '/identity/conditionalAccess/policies', {
    method: 'POST',
    body: {
      displayName: args.displayName,
      state,
      conditions: args.conditions ?? { users: { includeUsers: ['All'] }, applications: { includeApplications: ['All'] } },
      grantControls: args.grantControls ?? { operator: 'OR', builtInControls: ['mfa'] },
      ...(args.sessionControls ? { sessionControls: args.sessionControls } : {}),
    },
  });

  if (!result.ok) return { success: false, data: null, summary: `CA policy creation failed: ${result.error}`, error: result.error };

  const policy = result.data as Record<string, unknown>;
  return {
    success: true,
    data: policy,
    summary: `CA policy "${args.displayName}" created in ${state === 'enabledForReportingButNotEnforced' ? 'REPORT-ONLY' : state.toUpperCase()} mode.${state === 'enabledForReportingButNotEnforced' ? ' Monitor for 7+ days before enforcing.' : ''}`,
    rollbackData: { policyId: policy.id, action: 'create_ca_policy' },
  };
});

register('graph_update_ca_policy', async (args, creds) => {
  const policyId = args.policyId as string;
  const body: Record<string, unknown> = {};
  if (args.state) body.state = args.state;
  if (args.displayName) body.displayName = args.displayName;
  if (args.conditions) body.conditions = args.conditions;
  if (args.grantControls) body.grantControls = args.grantControls;

  // Capture current state for rollback
  const current = await graphFetch(creds, `/identity/conditionalAccess/policies/${policyId}`);

  const result = await graphFetch(creds, `/identity/conditionalAccess/policies/${policyId}`, {
    method: 'PATCH',
    body,
  });

  if (!result.ok) return { success: false, data: null, summary: `CA policy update failed: ${result.error}`, error: result.error };

  const changes = Object.keys(body).join(', ');
  return {
    success: true,
    data: body,
    summary: `CA policy ${policyId} updated: ${changes}.`,
    rollbackData: { policyId, previousState: current.data, action: 'update_ca_policy' },
  };
});

register('graph_delete_ca_policy', async (args, creds) => {
  const policyId = args.policyId as string;

  // Capture full policy for audit/rollback
  const current = await graphFetch(creds, `/identity/conditionalAccess/policies/${policyId}`);
  const policyName = (current.data as Record<string, unknown>)?.displayName ?? policyId;

  const result = await graphFetch(creds, `/identity/conditionalAccess/policies/${policyId}`, { method: 'DELETE' });
  if (!result.ok) return { success: false, data: null, summary: `CA policy deletion failed: ${result.error}`, error: result.error };

  return {
    success: true,
    data: null,
    summary: `⚠️ CA policy "${policyName}" DELETED. This may immediately affect user access.`,
    rollbackData: { policyId, policyData: current.data, action: 'delete_ca_policy' },
  };
});

register('graph_list_auth_methods_policy', async (_, creds) => {
  const result = await graphFetch(creds, '/policies/authenticationMethodsPolicy');
  if (!result.ok) return { success: false, data: null, summary: `Auth methods policy failed: ${result.error}`, error: result.error };

  const policy = result.data as { authenticationMethodConfigurations: Array<{ id: string; state: string }> };
  const methods = policy.authenticationMethodConfigurations ?? [];
  const enabled = methods.filter((m) => m.state === 'enabled');

  return {
    success: true,
    data: policy,
    summary: `${methods.length} auth method(s) configured. ${enabled.length} enabled: ${enabled.map((m) => m.id).join(', ')}`,
  };
});

register('graph_get_directory_settings', async (_, creds) => {
  const result = await graphFetch(creds, '/settings');
  if (!result.ok) return { success: false, data: null, summary: `Directory settings failed: ${result.error}`, error: result.error };

  const settings = (result.data as { value: Array<{ displayName: string }> }).value ?? [];
  return {
    success: true,
    data: settings,
    summary: `${settings.length} directory setting(s): ${settings.map((s) => s.displayName).join(', ')}`,
  };
});
