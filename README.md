# Helm365

AI-native Microsoft 365 management platform for MSPs and solo admins.

**Say it. Approve it. Done.**

## What is Helm365?

Helm365 replaces 17 Microsoft admin portals with a single voice/text command bar powered by AI. Describe what you need in plain English, review the change preview, approve it, and it's done.

- **Voice-first** — speak commands or type them
- **Multi-provider AI** — bring your own key: Claude, GPT, Gemini, Mistral, Ollama, and more
- **Human-in-the-loop** — AI proposes, you approve. Every action logged, every change reversible.
- **Multi-tenant** — manage 1 or 1,000 tenants from one interface
- **Domain specialist agents** — 8 expert agents (Exchange, Identity, Device, Compliance, Security, Licensing, Reporting, Policy) each trained on Microsoft Learn docs and community knowledge

## Architecture

```
User (voice/text)
    |
[Router Agent] --> picks the right specialist
    |
[Exchange | Identity | Device | Compliance | Security | License | Report | Policy]
    |
[AI Provider Adapter] --> Claude, GPT, Gemini, Mistral, Ollama
    |
[Processing Mode] --> Quick ($0.01) | Smart ($0.10) | Deep ($1.00)
    |
[Knowledge Layer (RAG)] --> MS Learn, Graph API, CIS, NIST, community
    |
[Security Gateway] --> audit, permissions, approval, impact preview
    |
[MCP Tool Layer] --> Graph API, PowerShell, Exchange, Intune
    |
[Evolution Engine] --> learns from interactions, refines agents
    |
[Context Manager] --> session state, tenant memory, handoff
```

## Screens

1. **Command Bar** — voice or text (always present)
2. **Dashboard** — tenant health at a glance
3. **Action Feed** — live stream of what's happening
4. **Operations Center** — review actions, reports, alerts, pending approvals
5. **Tenants** — manage connections, groups, GDAP
6. **Settings** — AI provider, team roles, PSA, billing

## Gateway Tiers

| Tier | Approval | Examples |
|------|----------|---------|
| GREEN | Auto-approved, logged | Password reset, MFA reset, license assign |
| YELLOW | Human approval required | Onboarding, offboarding, CA policy changes |
| RED | Human approval + type confirmation | Bulk disable, tenant-wide policy changes |

## Status

**Pre-alpha** — scaffolding and architecture phase.

## Related

- [Brainstorm Session](../_bmad-output/analysis/brainstorming-session-2026-03-22.md)
- [Agent Reference Sources](../_bmad-output/analysis/m365-agent-reference-sources.md)
- PolicyForge (private) — source of M365 integrations being ported
