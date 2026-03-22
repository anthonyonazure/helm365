import type { AgentTool } from '@/agents/types';

/**
 * Exchange Online tools for the Exchange Agent.
 * Note: Some Exchange tasks require PowerShell (EXO module) rather than Graph API.
 * For Graph-supported tasks, we use Graph directly.
 * For PowerShell-only tasks, we'll need an Azure Automation or proxy layer.
 */

export const EXCHANGE_TOOLS: AgentTool[] = [
  // --- GREEN TIER ---

  {
    name: 'graph_list_mailboxes',
    description: 'List mailboxes in the tenant, optionally filtered by type (user, shared, resource).',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by display name or email' },
        type: { type: 'string', enum: ['user', 'shared', 'room', 'equipment'], description: 'Mailbox type filter' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green',
    agent: 'exchange',
    graphEndpoint: '/users',
    method: 'GET',
    requiredPermissions: ['Mail.Read'],
  },
  {
    name: 'graph_get_mailbox_settings',
    description: 'Get mailbox settings for a user including auto-reply, forwarding, and language.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'exchange',
    graphEndpoint: '/users/{userId}/mailboxSettings',
    method: 'GET',
    requiredPermissions: ['MailboxSettings.Read'],
  },
  {
    name: 'graph_get_mail_tips',
    description: 'Get mail tips for recipients including out-of-office status, delivery restrictions, and mailbox full status.',
    parameters: {
      type: 'object',
      properties: {
        emailAddresses: { type: 'array', items: { type: 'string' }, description: 'Email addresses to check' },
      },
      required: ['emailAddresses'],
    },
    tier: 'green',
    agent: 'exchange',
    graphEndpoint: '/users/{userId}/getMailTips',
    method: 'POST',
    requiredPermissions: ['Mail.Read'],
  },
  {
    name: 'graph_message_trace',
    description: 'Search for email messages sent or received by a user. Shows delivery status, sender, recipient, subject, and date.',
    parameters: {
      type: 'object',
      properties: {
        senderAddress: { type: 'string', description: 'Sender email address' },
        recipientAddress: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Subject line search (partial match)' },
        startDate: { type: 'string', description: 'Start date (ISO format, default last 48h)' },
        endDate: { type: 'string', description: 'End date (ISO format, default now)' },
        top: { type: 'number', description: 'Max results (default 50)' },
      },
    },
    tier: 'green',
    agent: 'exchange',
    // Message trace uses the Office 365 Reporting API, not standard Graph
    graphEndpoint: '/reports/getEmailActivityUserDetail',
    method: 'GET',
    requiredPermissions: ['Reports.Read.All'],
  },
  {
    name: 'graph_list_quarantine',
    description: 'List quarantined messages. Shows sender, subject, reason, and received date.',
    parameters: {
      type: 'object',
      properties: {
        recipientAddress: { type: 'string', description: 'Filter by recipient email' },
        senderAddress: { type: 'string', description: 'Filter by sender email' },
        type: { type: 'string', enum: ['spam', 'phish', 'malware', 'bulk'], description: 'Quarantine reason' },
        top: { type: 'number', description: 'Max results (default 50)' },
      },
    },
    tier: 'green',
    agent: 'exchange',
    // Quarantine management uses Security & Compliance API
    graphEndpoint: '/security/threatSubmission/emailThreats',
    method: 'GET',
    requiredPermissions: ['ThreatSubmission.Read.All'],
  },

  // --- YELLOW TIER ---

  {
    name: 'graph_set_email_forwarding',
    description: 'Set up email forwarding for a user. Optionally keep a copy in the original mailbox.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN to forward FROM' },
        forwardTo: { type: 'string', description: 'Email address to forward TO' },
        keepCopy: { type: 'boolean', description: 'Keep a copy in original mailbox (default true)' },
      },
      required: ['userId', 'forwardTo'],
    },
    tier: 'yellow',
    agent: 'exchange',
    graphEndpoint: '/users/{userId}/mailboxSettings',
    method: 'PATCH',
    requiredPermissions: ['MailboxSettings.ReadWrite'],
  },
  {
    name: 'graph_set_auto_reply',
    description: 'Set an automatic reply (out-of-office) message for a user.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        internalMessage: { type: 'string', description: 'Message for internal senders' },
        externalMessage: { type: 'string', description: 'Message for external senders' },
        startDate: { type: 'string', description: 'Start date (ISO format)' },
        endDate: { type: 'string', description: 'End date (ISO format)' },
        externalAudience: { type: 'string', enum: ['all', 'contactsOnly', 'none'], description: 'Who sees external reply (default all)' },
      },
      required: ['userId', 'internalMessage'],
    },
    tier: 'yellow',
    agent: 'exchange',
    graphEndpoint: '/users/{userId}/mailboxSettings',
    method: 'PATCH',
    requiredPermissions: ['MailboxSettings.ReadWrite'],
  },
  {
    name: 'graph_create_shared_mailbox',
    description: 'Create a shared mailbox and grant access to specified users.',
    parameters: {
      type: 'object',
      properties: {
        displayName: { type: 'string', description: 'Shared mailbox display name (e.g., "Sales Team")' },
        emailAddress: { type: 'string', description: 'Email address for the shared mailbox (e.g., sales@contoso.com)' },
        members: { type: 'array', items: { type: 'string' }, description: 'User IDs or UPNs to grant full access' },
        sendAs: { type: 'array', items: { type: 'string' }, description: 'User IDs or UPNs to grant send-as permission' },
      },
      required: ['displayName', 'emailAddress'],
    },
    tier: 'yellow',
    agent: 'exchange',
    requiredPermissions: ['User.ReadWrite.All', 'Mail.ReadWrite'],
  },
  {
    name: 'graph_release_quarantine',
    description: 'Release one or more messages from quarantine to the recipient inbox.',
    parameters: {
      type: 'object',
      properties: {
        messageIds: { type: 'array', items: { type: 'string' }, description: 'Quarantine message IDs to release' },
        reportFalsePositive: { type: 'boolean', description: 'Report as false positive to Microsoft (default false)' },
      },
      required: ['messageIds'],
    },
    tier: 'yellow',
    agent: 'exchange',
    requiredPermissions: ['ThreatSubmission.ReadWrite.All'],
  },
  {
    name: 'exchange_block_sender',
    description: 'Add a sender email or domain to the tenant-wide block list (spam filter).',
    parameters: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Email address or domain to block (e.g., scam@evil.com or evil.com)' },
        notes: { type: 'string', description: 'Reason for blocking' },
      },
      required: ['entry'],
    },
    tier: 'yellow',
    agent: 'exchange',
    // This requires Exchange Online PowerShell (New-TenantAllowBlockListItems)
    // Will be proxied through Azure Automation or edge function
    requiredPermissions: ['ThreatPolicy.ReadWrite.All'],
  },
  {
    name: 'exchange_allow_sender',
    description: 'Add a sender email or domain to the tenant-wide allow list (whitelist).',
    parameters: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Email address or domain to allow' },
        notes: { type: 'string', description: 'Reason for allowing' },
      },
      required: ['entry'],
    },
    tier: 'yellow',
    agent: 'exchange',
    requiredPermissions: ['ThreatPolicy.ReadWrite.All'],
  },
  {
    name: 'graph_grant_mailbox_access',
    description: 'Grant a user full access, send-as, or send-on-behalf permission to another mailbox.',
    parameters: {
      type: 'object',
      properties: {
        mailboxId: { type: 'string', description: 'Mailbox owner User ID or UPN' },
        granteeId: { type: 'string', description: 'User ID or UPN to grant access to' },
        permission: { type: 'string', enum: ['fullAccess', 'sendAs', 'sendOnBehalf'], description: 'Permission type' },
      },
      required: ['mailboxId', 'granteeId', 'permission'],
    },
    tier: 'yellow',
    agent: 'exchange',
    requiredPermissions: ['Mail.ReadWrite', 'User.ReadWrite.All'],
  },

  // --- RED TIER ---

  {
    name: 'exchange_purge_quarantine',
    description: 'Delete all quarantined messages matching criteria. DESTRUCTIVE — messages cannot be recovered.',
    parameters: {
      type: 'object',
      properties: {
        senderAddress: { type: 'string', description: 'Purge messages from this sender' },
        olderThanDays: { type: 'number', description: 'Purge messages older than N days' },
      },
    },
    tier: 'red',
    agent: 'exchange',
    requiredPermissions: ['ThreatSubmission.ReadWrite.All'],
  },
];
