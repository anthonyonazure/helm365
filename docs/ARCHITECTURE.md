# Helm365 Architecture

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

## Directory Structure

```
src/
  agents/           # Router + 8 domain specialist agents
    router.ts       # Intent analysis, specialist dispatch
    exchange.ts     # Exchange Online specialist
    identity.ts     # Entra ID / user management specialist
    device.ts       # Intune / device management specialist
    compliance.ts   # CMMC/NIST/CIS compliance specialist
    security.ts     # Incident response / threat specialist
    licensing.ts    # License optimization specialist
    reporting.ts    # Report generation specialist
    policy.ts       # Policy deployment / drift specialist
  gateway/          # Security gateway (audit, approval, permissions)
    gateway.ts      # Core gateway logic
    audit.ts        # Audit logging (JSONL)
    permissions.ts  # Three-tier permission model (GREEN/YELLOW/RED)
    approval.ts     # Human-in-the-loop approval workflow
    impact.ts       # Change impact analysis + preview
    rollback.ts     # Rollback/undo operations
  tools/            # MCP-compatible tool definitions
    graph/          # Microsoft Graph API tools
    exchange/       # Exchange Online tools
    intune/         # Intune tools
    compliance/     # Compliance scanning tools
    hawk/           # Hawk forensic tools
    misp/           # MISP threat intel enrichment
  providers/        # AI provider adapters
    adapter.ts      # Common interface
    claude.ts       # Anthropic
    openai.ts       # OpenAI (GPT + Codex)
    gemini.ts       # Google
    mistral.ts      # Mistral
    ollama.ts       # Local models
    groq.ts         # Groq
    azure-openai.ts # Azure OpenAI
  ui/
    components/     # Reusable UI components
    views/          # 6 screen views
  lib/              # Shared utilities
    auth.ts         # MSAL / tenant auth
    context.ts      # Context manager (handoff, memory, wrap-up)
    evolution.ts    # Agent evolution engine
    knowledge.ts    # RAG / knowledge ingestion
  types/            # TypeScript type definitions
  knowledge/        # RAG source documents (ingested MS Learn, etc.)
docs/
  ARCHITECTURE.md   # This file
  PRD.md            # Product requirements (generated from brainstorm)
```

## Key Design Decisions

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
- Domain-specific system prompt
- Restricted tool access (principle of least privilege at AI layer)
- Ingested reference materials via RAG
- Independent evolution tracking

### 5. Per-Tenant Pricing
Not per-user. MSPs with 180 tenants × 50 avg users = 9,000 users. Per-user pricing kills adoption. Per-tenant is predictable and MSP-friendly.

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
```

## Tech Stack (TBD — to be decided in PRD)

Candidates:
- **Frontend**: React 18/19 + Vite + shadcn/ui + Tailwind (consistent with PolicyForge)
- **Backend**: Supabase (auth, DB, edge functions) OR Fastify + PostgreSQL
- **AI**: Multi-provider adapter (port from PolicyForge aiApi.ts)
- **Auth**: MSAL for M365 tenant connections (port from PolicyForge msalAuth.ts)
- **Voice**: Web Speech API or Whisper for STT
- **Deployment**: Vercel or Azure Static Web Apps + Azure Functions
