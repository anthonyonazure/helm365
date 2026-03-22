# Helm365 — Project Instructions

## Product Overview
Helm365 is an AI-native Microsoft 365 management platform for MSPs and solo admins. Voice/text command bar replaces 17 admin portals. "Say it, approve it, done."

**Domain:** helm365.io (not yet registered)
**Repo:** github.com/anthonyonazure/helm365 (private)

## Tech Stack

### Frontend
- **React 19** + TypeScript + Vite 8
- **UI**: shadcn-style (Radix + Tailwind v4 via @tailwindcss/postcss)
- **State**: Zustand (persisted to localStorage) + React Query (TanStack)
- **Icons**: lucide-react
- **Charts**: Recharts (planned)
- **Graphs**: ReactFlow (planned, for change impact visualization)
- **Voice**: Web Speech API (browser-native STT)
- **Routing**: react-router-dom v7

### Backend (planned)
- **Supabase** — auth, PostgreSQL, Edge Functions, Realtime, Storage, Vault
- **Not yet set up** — currently using localStorage for state persistence

### M365 Integration
- **MSAL.js v3** (@azure/msal-browser) — tenant auth (client credentials flow)
- **Microsoft Graph API** — direct REST (no SDK), token caching, retry on 429
- **Exchange Online PowerShell** — planned for tasks Graph doesn't support

### AI
- **Multi-provider adapter** — unified AIProvider interface
- **Implemented**: Anthropic (Claude), OpenAI (GPT) + Azure OpenAI, Google (Gemini), Ollama (local)
- **Planned**: Mistral, Groq, Perplexity
- **BYOK** — users bring their own API keys, stored in browser (Supabase Vault later)
- **Processing modes**: Quick ($0.01) / Smart ($0.10) / Deep ($1.00) — maps to model tiers per provider

## Architecture

### 6-Screen UI
1. **Command Bar** — voice + text, always present in header, Cmd+K shortcut
2. **Dashboard** — tenant stats, setup checklist, recent actions, pending alerts
3. **Action Feed** — real-time stream of all operations with tier badges
4. **Operations Center** — 4 tabs: Pending Approval, Completed, Alerts, Reports
5. **Tenants** — connection wizard, tenant cards, health status
6. **Settings** — AI provider BYOK, model selector, Quick/Smart/Deep modes

### 8 Domain Specialist Agents
Router analyzes intent → dispatches to specialist:
- **Exchange**: mailbox, forwarding, quarantine, spam filter, message trace, email security
- **Identity**: users, groups, MFA, passwords, CA policies, GDAP, guests
- **Device**: Intune compliance, config, apps, remediation, Autopilot, wipe/retire
- **Compliance**: CMMC, NIST, CIS, HIPAA, SOC2, ISO assessments
- **Security**: Hawk forensics, risky sign-ins, audit logs, incident response
- **Licensing**: license audit, optimization, cost prediction, Copilot readiness
- **Reporting**: tenant health, executive summary, compliance, cross-tenant
- **Policy**: templates, deployment (3 modes), backup, rollback, drift detection

### Three-Tier Security Gateway
- **GREEN**: Auto-approved, logged. Password reset, MFA reset, license assign, searches.
- **YELLOW**: Human approval required + change preview. Onboarding, CA policies, spam filter blocks.
- **RED**: Human approval + typed confirmation + blast radius warning. Bulk disable, wipe device, delete policies.

### Command Flow
```
Voice/Text → Router (keyword + AI) → Tool Matching → Gateway (tier check)
  → GREEN: auto-execute → Graph API → audit log → action feed
  → YELLOW: queue for approval → change preview → approve/reject → execute
  → RED: queue → change preview + blast radius + typed confirm → execute
```

## Project Structure
```
src/
  agents/           # Router + agent types
    router.ts       # Keyword + AI intent classification (70+ keywords, 8 agents)
    types.ts        # AgentConfig, AgentTool, ParsedIntent
  gateway/          # Security gateway
    gateway.ts      # Core pipeline: classify → permissions → preview → approve → execute → log
    audit.ts        # JSONL audit logging (in-memory until Supabase)
    permissions.ts  # Role-based (L1/L2/Admin) × tier (GREEN/YELLOW/RED) matrix
  tools/            # MCP-compatible tool definitions
    executor.ts     # 12 real Graph API handlers (search, password, MFA, groups, etc.)
    graph/
      users.ts      # 14 identity tools
      exchange.ts   # 14 exchange tools
      security.ts   # 12 security tools
      compliance.ts # 8 compliance tools
      licensing.ts  # 4 licensing tools
      devices.ts    # 11 device tools
      policy.ts     # 9 policy tools
      reporting.ts  # 8 reporting tools
  providers/        # AI provider adapters
    adapter.ts      # Registry + processing mode → model mapping
    anthropic.ts    # Claude (chat + streaming)
    openai.ts       # GPT + Azure OpenAI (chat + streaming)
    gemini.ts       # Gemini (chat, streaming TODO)
    ollama.ts       # Local models (chat + streaming)
    index.ts        # Auto-registers all providers on import
  ui/
    components/
      CommandBar.tsx     # Voice + text + inline results + processing mode indicator
      ChangePreview.tsx  # Vercel-style diff + blast radius + approve/reject
    views/
      DashboardView.tsx       # Stats, setup checklist, recent actions
      ActionFeedView.tsx      # Real-time action cards with tier badges
      OperationsCenterView.tsx # Pending approvals, completed, alerts, reports
      TenantsView.tsx         # Connection wizard + tenant management
      SettingsView.tsx        # AI provider BYOK + processing modes
    layout/
      AppLayout.tsx    # Sidebar nav + header + command bar + dark mode
  lib/
    store.ts           # Zustand: provider config, actions, tenant context
    tenants-store.ts   # Zustand: tenant connections and groups
    engine.ts          # Orchestrator: command → route → match tool → gateway → execute
    graph-client.ts    # Graph API client: token cache, retry on 429, connection test
  types/
    agents.ts          # AgentType, GatewayTier, ProcessingMode, RouterResult
    providers.ts       # AIProvider interface, ProviderConfig, PROVIDER_CONFIGS
    gateway.ts         # Action, ActionStatus, ChangePreview, BlastRadius
    tenants.ts         # TenantConnection, TenantGroup, TenantMemory
docs/
  ARCHITECTURE.md    # Full architecture with data model, agent system, gateway design
  PRD.md             # Product requirements from brainstorm session
```

## Key Files
- **Engine**: `src/lib/engine.ts` — main orchestrator, routes commands end-to-end
- **Router**: `src/agents/router.ts` — 70+ keyword patterns + AI classification
- **Gateway**: `src/gateway/gateway.ts` — three-tier enforcement pipeline
- **Tool executor**: `src/tools/executor.ts` — 12 handlers calling real Graph API
- **Graph client**: `src/lib/graph-client.ts` — token caching, retry, connection test
- **Provider adapter**: `src/providers/adapter.ts` — multi-provider registry

## Coding Conventions
- ESM (`"type": "module"`)
- Path alias `@/` → `src/`
- Tailwind v4 (uses `@import "tailwindcss"` not `@tailwind` directives)
- PostCSS: `@tailwindcss/postcss` (not `tailwindcss` directly)
- Dark mode: class-based (`dark` on `<html>`)
- Toast notifications: `sonner`
- Dev server: port 5365

## Related Resources
- **PolicyForge** (anthonyonazure/policyforge) — existing M365 code being ported (Graph API, compliance frameworks, 100+ report templates, policy deployment)
- **Brainstorm session**: `~/_bmad-output/analysis/brainstorming-session-2026-03-22.md`
- **Agent reference sources**: `~/_bmad-output/analysis/m365-agent-reference-sources.md` (100+ MS Learn URLs per agent)
- **SYSAdmin-CoPilot** (ivproduced/SYSAdmin-CoPilot) — reference for gateway pattern
- **ivproduced full analysis** — patterns: 3 processing modes (D.A.V.E), specialist agent routing (B.O.B.B.I.E), voice-first compliance (COMPASS), MCP server architecture

## Tool Count: 75 tools across 8 agents
- Identity: 14 (10 GREEN, 2 YELLOW, 2 RED)
- Exchange: 14 (5 GREEN, 7 YELLOW, 1 RED)
- Security: 12 (8 GREEN, 3 YELLOW, 1 RED)
- Device: 11 (6 GREEN, 3 YELLOW, 2 RED)
- Policy: 9 (4 GREEN, 4 YELLOW, 1 RED)
- Compliance: 8 (5 GREEN, 2 YELLOW, 1 RED)
- Reporting: 8 (8 GREEN, 0 YELLOW, 0 RED)
- Licensing: 4 (4 GREEN, 0 YELLOW, 0 RED)
