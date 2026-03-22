# Helm365 Architecture

**Version:** 1.0
**Date:** 2026-03-22
**Status:** Draft

## Overview

Helm365 is an AI-native M365 management platform. The user interacts via voice or text. A router agent dispatches to domain specialist agents. Each agent calls tools through a security gateway that enforces permissions, logs everything, and requires human approval for write operations.

## Layer Stack

```
┌─────────────────────────────────────────────────────┐
│  UI Layer (6 screens)                               │
│  Command Bar | Dashboard | Action Feed |            │
│  Operations Center | Tenants | Settings             │
├─────────────────────────────────────────────────────┤
│  Router Agent                                       │
│  Analyzes intent → dispatches to specialist         │
├─────────────────────────────────────────────────────┤
│  Domain Specialist Agents (8)                       │
│  Exchange | Identity | Device | Compliance |        │
│  Security | Licensing | Reporting | Policy          │
├─────────────────────────────────────────────────────┤
│  AI Provider Adapter                                │
│  Claude | GPT | Gemini | Mistral | Ollama | Groq    │
├─────────────────────────────────────────────────────┤
│  Processing Mode                                    │
│  Quick ($0.01) | Smart ($0.10) | Deep ($1.00)       │
├─────────────────────────────────────────────────────┤
│  Knowledge Layer (RAG)                              │
│  MS Learn | Graph API | CIS | NIST | Community      │
├─────────────────────────────────────────────────────┤
│  Security Gateway                                   │
│  Audit | Permissions | Approval | Impact Preview    │
├─────────────────────────────────────────────────────┤
│  MCP Tool Layer                                     │
│  Graph API | PowerShell | Exchange | Intune | etc.  │
├─────────────────────────────────────────────────────┤
│  Evolution Engine                                   │
│  Interaction logging | Pattern extraction |         │
│  Prompt refinement | Calibration scoring            │
├─────────────────────────────────────────────────────┤
│  Context Manager                                    │
│  Session state | Tenant memory | Handoff | Wrap-up  │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack Decisions

### Frontend
- **React 19** + **Vite 6** + **TypeScript**
- **shadcn/ui** (Radix primitives) + **Tailwind CSS** — consistent with PolicyForge, fast to build
- **React Query** (TanStack) — server state management
- **Zustand** — client state (action feed, pending approvals, tenant context)
- **ReactFlow** — visual impact/dependency graphs for change previews
- **Recharts** — dashboard charts (tenant health, secure score trends, license utilization)
- **Framer Motion** — command bar animations, approval transitions
- **Web Speech API** — browser-native speech-to-text (free, no API key). Upgrade path to Whisper for accuracy.
- **lucide-react** — icons

### Backend
- **Supabase** — auth (user accounts + team management), PostgreSQL database, Edge Functions (Deno), Realtime (action feed SSE), Storage (policy backups, report PDFs)
- **Why Supabase over Fastify:** PolicyForge is already Supabase-based. Auth + DB + edge functions + realtime + storage in one platform. Faster to ship. Row Level Security for multi-tenant isolation. Edge Functions for Graph API proxy (avoids CORS).
- **Why not Azure Functions:** Supabase is cloud-agnostic. Azure Functions would tie deployment to Azure and add cold start latency.

### M365 Integration
- **MSAL.js v3** (@azure/msal-browser) — OAuth2 for tenant connections (client credentials flow for app-only, auth code flow for delegated)
- **Microsoft Graph API** — primary M365 data layer (REST, not SDK — simpler, fewer deps)
- **Exchange Online PowerShell** — for tasks Graph doesn't support (calendar permissions, transport rules). Executed via Supabase Edge Function calling Azure Automation or a lightweight PowerShell runner.

### AI Layer
- **Multi-provider adapter** — ported from PolicyForge `aiApi.ts`. Unified interface:
  ```typescript
  interface AIProvider {
    chat(messages: Message[], tools: ToolDef[]): Promise<AIResponse>
    stream(messages: Message[], tools: ToolDef[]): AsyncIterable<AIChunk>
  }
  ```
- **Tool calling** — all providers support function/tool calling. Adapter normalizes to common ToolCall format.
- Provider implementations: `claude.ts`, `openai.ts`, `gemini.ts`, `mistral.ts`, `groq.ts`, `azure-openai.ts`, `ollama.ts`
- API keys stored in Supabase Vault (encrypted column, per-user)

### Deployment
- **Vercel** — frontend hosting (Edge Network, preview deploys, analytics)
- **Supabase Cloud** — backend (managed Postgres, Edge Functions, Auth, Realtime)
- **Why not Azure:** Faster iteration. Vercel + Supabase = zero ops. Azure would add complexity for minimal benefit at this stage. Can migrate to Azure later if enterprise clients require it.

---

## Data Model

### Core Tables

```sql
-- Users & Teams
users (
  id uuid PK,
  email text UNIQUE,
  name text,
  avatar_url text,
  created_at timestamptz
)

teams (
  id uuid PK,
  name text,
  owner_id uuid FK users,
  plan text, -- 'free', 'solo', 'professional', 'enterprise'
  stripe_customer_id text,
  created_at timestamptz
)

team_members (
  id uuid PK,
  team_id uuid FK teams,
  user_id uuid FK users,
  role text, -- 'admin', 'l2', 'l1'
  created_at timestamptz
)

-- Tenant Connections
tenant_connections (
  id uuid PK,
  team_id uuid FK teams,
  tenant_id text, -- M365 tenant GUID
  tenant_name text,
  tenant_domain text, -- contoso.onmicrosoft.com
  client_id text, -- App registration client ID
  client_secret_ref text, -- Reference to Supabase Vault
  auth_method text, -- 'client_credentials', 'gdap', 'delegated'
  gdap_relationship_id text,
  health_status text, -- 'healthy', 'degraded', 'error', 'unknown'
  last_health_check timestamptz,
  created_at timestamptz
)

tenant_groups (
  id uuid PK,
  team_id uuid FK teams,
  name text, -- 'Healthcare Clients', 'E5 Tenants'
  created_at timestamptz
)

tenant_group_members (
  tenant_connection_id uuid FK tenant_connections,
  tenant_group_id uuid FK tenant_groups
)

-- AI Configuration
ai_provider_configs (
  id uuid PK,
  team_id uuid FK teams,
  provider text, -- 'anthropic', 'openai', 'google', etc.
  api_key_ref text, -- Reference to Supabase Vault
  default_model text,
  is_default boolean,
  is_active boolean,
  created_at timestamptz
)

-- Gateway & Audit
actions (
  id uuid PK,
  team_id uuid FK teams,
  user_id uuid FK users,
  tenant_connection_id uuid FK tenant_connections,
  agent text, -- 'exchange', 'identity', 'compliance', etc.
  action_type text, -- 'read', 'write', 'destructive'
  tier text, -- 'green', 'yellow', 'red'
  intent text, -- Original user command
  tool_calls jsonb, -- What Graph API / PS calls were made
  preview jsonb, -- Change preview shown to user
  status text, -- 'pending', 'approved', 'rejected', 'executed', 'rolled_back', 'failed'
  approved_by uuid FK users, -- Who approved (null for green tier)
  result jsonb, -- Execution result
  rollback_data jsonb, -- State snapshot for undo
  rollback_expires_at timestamptz,
  processing_mode text, -- 'quick', 'smart', 'deep'
  ai_provider text,
  ai_model text,
  ai_tokens_used integer,
  created_at timestamptz,
  executed_at timestamptz
)

-- Policy Management
policy_templates (
  id uuid PK,
  team_id uuid FK teams,
  name text,
  description text,
  category text, -- 'conditional-access', 'intune-compliance', 'email-security', etc.
  template_data jsonb, -- The policy definition
  compliance_frameworks text[], -- ['cmmc-l1', 'nist-800-171', 'cis-m365']
  is_builtin boolean,
  created_at timestamptz
)

policy_deployments (
  id uuid PK,
  team_id uuid FK teams,
  template_id uuid FK policy_templates,
  tenant_connection_id uuid FK tenant_connections,
  mode text, -- 'audit', 'enforce', 'report-only'
  status text, -- 'pending', 'deploying', 'deployed', 'failed', 'rolled_back'
  dry_run boolean,
  changes jsonb, -- Diff of what changed
  backup_data jsonb, -- Pre-deployment snapshot
  deployed_by uuid FK users,
  created_at timestamptz,
  deployed_at timestamptz
)

-- Drift Detection
drift_baselines (
  id uuid PK,
  team_id uuid FK teams,
  tenant_connection_id uuid FK tenant_connections,
  resource_type text,
  baseline_data jsonb,
  captured_at timestamptz
)

drift_results (
  id uuid PK,
  baseline_id uuid FK drift_baselines,
  status text, -- 'clean', 'drifted'
  changes jsonb, -- Array of {field, baseline_value, current_value}
  detected_at timestamptz,
  remediated_at timestamptz
)

-- Compliance
compliance_assessments (
  id uuid PK,
  team_id uuid FK teams,
  tenant_connection_id uuid FK tenant_connections,
  framework text, -- 'cmmc-l1', 'nist-800-171', 'cis-m365', 'hipaa'
  processing_mode text,
  overall_score numeric,
  passed integer,
  failed integer,
  warnings integer,
  results jsonb, -- Per-control results
  recommendations jsonb,
  assessed_at timestamptz
)

-- Reports
report_runs (
  id uuid PK,
  team_id uuid FK teams,
  tenant_connection_id uuid FK tenant_connections,
  template_id text, -- Report template identifier
  format text, -- 'pdf', 'json', 'csv'
  status text,
  output_url text, -- Supabase Storage URL
  created_at timestamptz
)

-- Context & Evolution
tenant_memories (
  id uuid PK,
  team_id uuid FK teams,
  tenant_connection_id uuid FK tenant_connections,
  memory_type text, -- 'gotcha', 'preference', 'incident', 'pattern'
  content text,
  source_action_id uuid FK actions, -- What action triggered this memory
  score numeric, -- Relevance score (decays over time)
  created_at timestamptz
)

agent_evolution_logs (
  id uuid PK,
  team_id uuid FK teams,
  agent text,
  action_id uuid FK actions,
  outcome text, -- 'approved', 'rejected', 'modified'
  modification_details text, -- What the user changed
  created_at timestamptz
)

-- PSA Integration
psa_integrations (
  id uuid PK,
  team_id uuid FK teams,
  provider text, -- 'connectwise', 'autotask', 'halo'
  api_url text,
  api_key_ref text, -- Supabase Vault
  auto_ticket_on_drift boolean,
  auto_ticket_on_compliance boolean,
  is_active boolean,
  created_at timestamptz
)

-- Webhooks
webhook_configs (
  id uuid PK,
  team_id uuid FK teams,
  url text,
  events text[], -- ['drift.detected', 'compliance.failed', 'action.executed']
  is_active boolean,
  created_at timestamptz
)
```

### Row Level Security

All tables scoped by `team_id`. Users only see data for teams they belong to.

```sql
-- Example RLS policy
CREATE POLICY team_isolation ON actions
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));
```

Role-based access within teams:
- `admin` — full access, can manage team members, billing, all tenants
- `l2` — can approve YELLOW tier, view all tenants, manage configurations
- `l1` — can execute GREEN tier only, limited to assigned tenant groups, actions reviewed by L2/admin

---

## Agent Architecture

### Router Agent

```typescript
interface RouterResult {
  agent: 'exchange' | 'identity' | 'device' | 'compliance' | 'security' | 'licensing' | 'reporting' | 'policy';
  confidence: number; // 0-1
  intent: string; // Parsed intent description
  entities: {
    tenant?: string;
    user?: string;
    resource?: string;
    action?: string;
  };
}
```

The router uses a lightweight classification prompt (always Quick mode — minimal cost):
1. Parse user intent from voice/text input
2. Extract entities (tenant name, user name, resource type, action verb)
3. Select specialist agent based on domain
4. If ambiguous (confidence < 0.7), ask clarifying question
5. Pass parsed intent + entities to specialist

### Specialist Agent Flow

```
User: "Reset MFA for Sarah at Contoso — she got a new phone"
  │
  ├── Router: agent=identity, tenant=Contoso, user=Sarah, action=reset_mfa
  │
  ├── Identity Agent:
  │   ├── 1. Resolve tenant: "Contoso" → tenant_connection_id (fuzzy match)
  │   ├── 2. Resolve user: "Sarah" → search Graph API for matching user
  │   ├── 3. Determine tier: reset_mfa = GREEN
  │   ├── 4. Build tool calls:
  │   │   ├── DELETE /users/{id}/authentication/methods/{methodId} (each method)
  │   │   ├── POST /users/{id}/revokeSignInSessions
  │   │   └── (User will be prompted to re-register MFA at next sign-in)
  │   ├── 5. Gateway check: GREEN tier → auto-approve, log
  │   ├── 6. Execute tool calls via Graph API
  │   └── 7. Return result: "MFA reset for Sarah Jones (sarah@contoso.com). She'll be prompted to register new MFA methods at next sign-in."
  │
  └── Action logged: {agent: 'identity', tier: 'green', status: 'executed', tool_calls: [...]}
```

### Specialist Agent System Prompts

Each agent gets a domain-specific system prompt. Example for Exchange Agent:

```
You are the Exchange Agent for Helm365. You are an expert in Exchange Online administration.

YOUR DOMAIN:
- Mailbox management (create, configure, permissions, delegation)
- Email forwarding and routing
- Shared mailboxes and resource mailboxes
- Quarantine management (review, release, block)
- Spam filter configuration (block/allow lists, transport rules)
- Message trace and mail flow troubleshooting
- Email security (anti-spam, anti-phishing, Safe Links, Safe Attachments)
- Email authentication (SPF, DKIM, DMARC)

YOUR TOOLS:
[Exchange-specific tool definitions only]

YOU DO NOT HANDLE:
- User creation/deletion (Identity Agent)
- Device management (Device Agent)
- Conditional Access policies (Identity Agent / Policy Agent)
- Compliance/DLP policies (Compliance Agent)
- License management (Licensing Agent)

If asked about something outside your domain, respond:
"That's outside my area — let me route you to the [X] Agent."

TIER CLASSIFICATION:
- GREEN: Release quarantined email, add to block/allow list, set forwarding, grant mailbox permissions, run message trace
- YELLOW: Create transport rules, modify anti-spam policies, configure Safe Links/Attachments, create shared mailbox
- RED: Delete mailboxes, purge quarantine in bulk, disable email security features
```

---

## Security Gateway Implementation

### Request Flow

```
Agent builds tool call
  │
  ├── 1. Classify tier (GREEN / YELLOW / RED)
  │
  ├── 2. Check user permissions
  │   ├── L1 can only execute GREEN
  │   ├── L2 can execute GREEN + approve YELLOW
  │   └── Admin can execute all tiers
  │
  ├── 3. Tenant confirmation
  │   └── "Executing at Contoso Ltd (contoso.onmicrosoft.com) — correct?"
  │
  ├── 4. Impact analysis (YELLOW + RED)
  │   ├── Query current state via Graph API
  │   ├── Calculate blast radius (users/resources affected)
  │   └── Generate change preview diff
  │
  ├── 5. Approval gate
  │   ├── GREEN: auto-approve, proceed
  │   ├── YELLOW: queue for human approval with change preview
  │   └── RED: queue for human approval + typed confirmation
  │
  ├── 6. Create rollback snapshot
  │   └── Capture current state of affected resources
  │
  ├── 7. Execute tool calls
  │   ├── Call Graph API / PowerShell
  │   ├── Retry with backoff on throttling (429)
  │   └── Capture results
  │
  ├── 8. Log action
  │   └── Write to actions table (full audit trail)
  │
  ├── 9. Notify
  │   ├── Update action feed (Realtime/SSE)
  │   ├── Trigger webhooks if configured
  │   ├── Create PSA ticket if configured
  │   └── Send notification if configured
  │
  └── 10. Return result to user
```

### Audit Log Format

```jsonl
{
  "id": "act_abc123",
  "timestamp": "2026-03-22T14:30:00Z",
  "team_id": "team_xyz",
  "user_id": "usr_jake",
  "user_email": "jake@msp.com",
  "tenant": "contoso.onmicrosoft.com",
  "tenant_name": "Contoso Ltd",
  "agent": "identity",
  "intent": "Reset MFA for Sarah — she got a new phone",
  "tier": "green",
  "status": "executed",
  "tool_calls": [
    {"method": "DELETE", "url": "/users/usr_sarah/authentication/methods/phone_123"},
    {"method": "DELETE", "url": "/users/usr_sarah/authentication/methods/app_456"},
    {"method": "POST", "url": "/users/usr_sarah/revokeSignInSessions"}
  ],
  "result": "MFA reset for Sarah Jones. 2 auth methods removed, sessions revoked.",
  "rollback_available": true,
  "rollback_expires": "2026-03-22T14:45:00Z",
  "processing_mode": "quick",
  "ai_provider": "anthropic",
  "ai_model": "claude-3-5-haiku",
  "ai_tokens": 847,
  "duration_ms": 2340
}
```

---

## AI Provider Adapter

### Common Interface

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  tier: 'green' | 'yellow' | 'red'; // Gateway classification
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface AIResponse {
  content: string;
  tool_calls: ToolCall[];
  usage: { input_tokens: number; output_tokens: number };
}

interface AIProvider {
  id: string;
  name: string;
  chat(messages: Message[], tools: ToolDefinition[], model?: string): Promise<AIResponse>;
  stream(messages: Message[], tools: ToolDefinition[], model?: string): AsyncIterable<AIChunk>;
  listModels(): Promise<ModelInfo[]>;
  validateKey(apiKey: string): Promise<boolean>;
}
```

### Provider Translation

Each provider translates the common format to its native format:

| Feature | Anthropic | OpenAI | Google | Mistral |
|---------|-----------|--------|--------|---------|
| Tool calling format | `tools[]` param | `tools[]` param | `function_declarations[]` | `tools[]` param |
| Tool result format | `tool_result` role | `tool` role | `function_response` | `tool` role |
| Streaming | SSE | SSE | SSE | SSE |
| System prompt | `system` param | `system` role message | `system_instruction` | `system` role message |

### Processing Mode → Model Selection

```typescript
const MODEL_MAP: Record<string, Record<ProcessingMode, string>> = {
  anthropic: {
    quick: 'claude-3-5-haiku-20241022',
    smart: 'claude-sonnet-4-20250514',
    deep: 'claude-opus-4-20250514',
  },
  openai: {
    quick: 'gpt-4o-mini',
    smart: 'gpt-4o',
    deep: 'o1',
  },
  google: {
    quick: 'gemini-2.0-flash',
    smart: 'gemini-2.5-flash',
    deep: 'gemini-2.5-pro',
  },
  // ...
};
```

---

## MCP Tool Layer

Tools are defined as MCP-compatible servers. Each tool has:

```typescript
interface MCPTool {
  name: string;                    // e.g. 'graph_reset_mfa'
  description: string;             // Human-readable description for AI
  inputSchema: JSONSchema;         // Parameters the AI must provide
  tier: 'green' | 'yellow' | 'red'; // Gateway classification
  agent: string;                   // Which agent owns this tool
  graphEndpoint?: string;          // Graph API endpoint template
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  requiredPermissions?: string[];  // Graph API permission scopes needed
}
```

### Example Tool Definitions

```typescript
// Identity Agent tools
const IDENTITY_TOOLS: MCPTool[] = [
  {
    name: 'graph_list_users',
    description: 'List users in the tenant, optionally filtered by name, department, or status',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'OData filter expression' },
        search: { type: 'string', description: 'Search by displayName or mail' },
        top: { type: 'number', description: 'Max results (default 25)' },
      },
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users',
    method: 'GET',
    requiredPermissions: ['User.Read.All'],
  },
  {
    name: 'graph_reset_password',
    description: 'Reset a user password and optionally require change at next login',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        temporaryPassword: { type: 'string', description: 'Temporary password (auto-generated if omitted)' },
        forceChangeAtLogin: { type: 'boolean', default: true },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'identity',
    graphEndpoint: '/users/{userId}/authentication/passwordMethods/{id}/resetPassword',
    method: 'POST',
    requiredPermissions: ['UserAuthenticationMethod.ReadWrite.All'],
  },
  {
    name: 'graph_reset_mfa',
    description: 'Remove all MFA authentication methods for a user, forcing re-registration',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID or UPN' },
        revokeSession: { type: 'boolean', default: true, description: 'Also revoke active sessions' },
      },
      required: ['userId'],
    },
    tier: 'green',
    agent: 'identity',
    requiredPermissions: ['UserAuthenticationMethod.ReadWrite.All'],
  },
  {
    name: 'graph_create_user',
    description: 'Create a new user in the tenant',
    inputSchema: {
      type: 'object',
      properties: {
        displayName: { type: 'string' },
        userPrincipalName: { type: 'string' },
        mailNickname: { type: 'string' },
        password: { type: 'string' },
        department: { type: 'string' },
        jobTitle: { type: 'string' },
        usageLocation: { type: 'string', default: 'US' },
      },
      required: ['displayName', 'userPrincipalName', 'mailNickname'],
    },
    tier: 'yellow',
    agent: 'identity',
    graphEndpoint: '/users',
    method: 'POST',
    requiredPermissions: ['User.ReadWrite.All'],
  },
  // ... more tools
];
```

### Graph API Executor

```typescript
async function executeGraphCall(
  tenantConnection: TenantConnection,
  tool: MCPTool,
  args: Record<string, unknown>
): Promise<GraphResult> {
  // 1. Get access token for tenant
  const token = await getAccessToken(tenantConnection);

  // 2. Build URL from endpoint template + args
  const url = buildGraphUrl(tool.graphEndpoint, args);

  // 3. Execute with retry on throttle
  const response = await fetchWithRetry(`https://graph.microsoft.com/v1.0${url}`, {
    method: tool.method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: tool.method !== 'GET' ? JSON.stringify(args) : undefined,
  });

  return response;
}
```

---

## Context Manager

### Session State (HANDOFF Pattern)

On every significant action, update the session state:

```typescript
interface SessionState {
  userId: string;
  teamId: string;
  startedAt: string;
  currentTenant?: string; // Last-used tenant for context
  actionsThisSession: number;
  pendingApprovals: string[]; // Action IDs awaiting approval
  investigationContext?: { // For multi-step investigations
    type: string; // 'incident', 'compliance', 'drift'
    findings: any[];
    nextSteps: string[];
  };
}
```

### Login Awareness

On login, query and present:

```sql
-- Pending approvals
SELECT * FROM actions WHERE team_id = $1 AND status = 'pending' ORDER BY created_at DESC;

-- Stale drift alerts (unresolved, >24h old)
SELECT * FROM drift_results WHERE team_id = $1 AND status = 'drifted' AND remediated_at IS NULL AND detected_at < NOW() - INTERVAL '24 hours';

-- Expiring GDAP relationships (within 7 days)
SELECT * FROM tenant_connections WHERE team_id = $1 AND auth_method = 'gdap' AND gdap_expires_at < NOW() + INTERVAL '7 days';

-- Upcoming scheduled deployments (next 48h)
SELECT * FROM scheduled_deployments WHERE team_id = $1 AND is_active = true AND next_run_at < NOW() + INTERVAL '48 hours';
```

### Tenant Memory

```typescript
interface TenantMemory {
  id: string;
  tenantId: string;
  type: 'gotcha' | 'preference' | 'incident' | 'pattern';
  content: string; // "Last CA change broke VPN for remote users"
  sourceActionId: string; // What triggered this memory
  score: number; // Decays over time, boosted when referenced
  createdAt: string;
}

// Before executing an action, check for relevant memories:
async function checkTenantMemories(tenantId: string, intent: string): Promise<TenantMemory[]> {
  // Vector similarity search against intent
  // Returns memories with score > threshold
  // Agent includes these in context: "Note: previous experience with this tenant..."
}
```

---

## Directory Structure (Final)

```
helm365/
  docs/
    ARCHITECTURE.md        # This file
    PRD.md                 # Product requirements
  src/
    agents/                # Router + 8 domain specialists
      router.ts            # Intent analysis, entity extraction, dispatch
      types.ts             # Shared agent types
      exchange.ts          # Exchange Online specialist
      identity.ts          # Entra ID specialist
      device.ts            # Intune specialist
      compliance.ts        # CMMC/NIST/CIS specialist
      security.ts          # Incident response specialist
      licensing.ts         # License optimization specialist
      reporting.ts         # Report generation specialist
      policy.ts            # Policy deployment specialist
      prompts/             # System prompts per agent
        exchange.md
        identity.md
        device.md
        compliance.md
        security.md
        licensing.md
        reporting.md
        policy.md
    gateway/               # Security gateway
      gateway.ts           # Core request pipeline
      audit.ts             # Audit log writer (JSONL + DB)
      permissions.ts       # Tier classification + role checks
      approval.ts          # Approval queue + notification
      impact.ts            # Impact analysis + change preview
      rollback.ts          # Snapshot + restore
    tools/                 # MCP-compatible tool definitions
      graph/               # Microsoft Graph API tools
        users.ts           # User CRUD, password, MFA
        groups.ts          # Group membership
        mail.ts            # Mailbox, forwarding, delegation
        calendar.ts        # Calendar permissions
        ca-policies.ts     # Conditional Access
        intune.ts          # Device management
        reports.ts         # Usage reports
        secure-score.ts    # Secure Score
        audit-logs.ts      # Audit log queries
      exchange/            # Exchange Online PowerShell tools
        quarantine.ts      # Quarantine management
        transport-rules.ts # Mail flow rules
        spam-filter.ts     # Block/allow lists
        message-trace.ts   # Message trace
      compliance/          # Compliance scanning
        frameworks.ts      # CMMC, NIST, CIS, HIPAA rule definitions
        scanner.ts         # Run assessment against framework
        remediation.ts     # Generate remediation steps
      hawk/                # Incident response (Hawk-inspired)
        investigation.ts   # Guided investigation workflow
        playbooks.ts       # Response playbooks by scenario
      executor.ts          # Graph API call executor (auth, retry, throttle)
    providers/             # AI provider adapters
      adapter.ts           # Common AIProvider interface
      claude.ts
      openai.ts
      gemini.ts
      mistral.ts
      groq.ts
      azure-openai.ts
      ollama.ts
      models.ts            # Processing mode → model mapping
    ui/
      components/
        CommandBar.tsx      # Voice + text input (primary interface)
        ActionFeed.tsx      # Real-time event stream
        ChangePreview.tsx   # Vercel-style diff + impact analysis
        ImpactGraph.tsx     # ReactFlow dependency visualization
        TenantSelector.tsx  # Tenant context switcher
        ApprovalCard.tsx    # Pending approval with approve/reject
        HealthScore.tsx     # Tenant health gauge
        SecureScoreCard.tsx
        ComplianceBadge.tsx
        ProcessingMode.tsx  # Quick/Smart/Deep selector
      views/
        DashboardView.tsx
        ActionFeedView.tsx
        OperationsCenterView.tsx
        TenantsView.tsx
        SettingsView.tsx
      layout/
        AppLayout.tsx       # Shell with persistent CommandBar
        Sidebar.tsx         # Minimal nav (6 items only)
    lib/
      auth.ts              # MSAL tenant authentication
      context.ts           # Session state, handoff, wrap-up
      evolution.ts         # Agent evolution engine
      knowledge.ts         # RAG / vector search
      supabase.ts          # Supabase client
      graph-client.ts      # Graph API HTTP client
      voice.ts             # Web Speech API integration
    types/
      actions.ts           # Action, ToolCall, AuditEntry
      agents.ts            # AgentType, RouterResult
      tenants.ts           # TenantConnection, TenantGroup
      gateway.ts           # Tier, ApprovalStatus, ChangePreview
      providers.ts         # AIProvider, ProcessingMode, Message
    knowledge/             # RAG source documents
      exchange/
      identity/
      compliance/
      security/
  supabase/
    migrations/            # Database migrations
    functions/             # Edge Functions
      graph-proxy/         # Proxy Graph API calls (handles auth + CORS)
      webhook-sender/      # Outbound webhook delivery
      psa-ticket/          # PSA ticket creation
      scheduled-drift/     # Cron: drift detection
      scheduled-reports/   # Cron: auto-generate reports
  public/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
```

---

## Key Design Decisions (Expanded)

### 1. AI Provider Agnostic
Users bring their own API keys. The product never pays for AI inference. Provider adapter translates tool calls to/from each provider's format. All major providers support function/tool calling.

### 2. MCP-Compatible Tool Layer
Tools are defined as MCP servers. This means they work with Claude Code, Copilot CLI, or any MCP-aware client. Future-proofs against AI platform shifts. Third-party developers can build extensions.

### 3. Three-Tier Gateway
- GREEN: Read operations + low-risk writes (password reset, MFA reset). Auto-approved, logged.
- YELLOW: Medium-risk writes (onboarding, CA policies). Human approval required with change preview.
- RED: High-risk/destructive (bulk disable, policy deletion). Human approval + typed confirmation + blast radius warning.

### 4. Domain Specialist Agents
Instead of one monolithic prompt, 8 specialist agents each have:
- Domain-specific system prompt with deep M365 knowledge
- Restricted tool access (principle of least privilege at AI layer)
- Ingested reference materials via RAG
- Independent evolution tracking

### 5. Per-Tenant Pricing
Not per-user. MSPs with 180 tenants x 50 avg users = 9,000 users. Per-user pricing kills adoption. Per-tenant is predictable and MSP-friendly.

### 6. Context Management
Modeled on BMAD session awareness patterns:
- Session state recovery (HANDOFF pattern)
- Per-tenant memory (learned gotchas)
- Wrap-up protocol (auto-summarize changes)
- Login awareness (pending items surfaced on entry)

### 7. Agent Evolution
Modeled on BMAD persona-evolution OODA system:
- Every interaction logged
- Nightly review extracts patterns
- Prompts refined based on approval/rejection rates
- Cross-agent learning shares discoveries

### 8. Supabase as Backend
- Auth (user accounts, team management, magic links)
- PostgreSQL (all data tables with RLS for multi-tenant isolation)
- Edge Functions (Graph API proxy, webhook delivery, PSA tickets)
- Realtime (live action feed via SSE)
- Storage (policy backups, report PDFs)
- Vault (encrypted API key storage)

### 9. Graph API Direct (No SDK)
Using raw `fetch` against Graph REST endpoints rather than the @microsoft/microsoft-graph-client SDK. Reasons:
- Fewer dependencies
- Full control over retry/throttle behavior
- Edge Function compatible (no Node.js-only deps)
- Easier to map MCP tool definitions to REST calls
- SDK adds abstraction we don't need when AI is building the calls
