# Helm365 — Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-22
**Author:** Anthony
**Status:** Draft
**Source:** Brainstorming session 2026-03-22

---

## 1. Product Overview

### 1.1 Vision
Helm365 is an AI-native Microsoft 365 management platform that replaces 17 admin portals with a single voice/text command bar. Admins describe what they need in plain English, review a change preview, approve it, and it's done.

**Tagline:** "Say it. Approve it. Done."

### 1.2 Problem Statement
M365 administration requires navigating 17+ admin portals (Entra ID, Exchange, SharePoint, Teams, Intune, Defender, Purview, Partner Center, etc.). A single user onboarding touches 4-5 portals and takes 30-60 minutes. MSP technicians repeat these tasks across dozens or hundreds of tenants daily. The tasks themselves are not hard — the portal hopping and context switching is what kills productivity.

No existing tool combines:
- AI-powered natural language administration
- Multi-tenant awareness for MSPs
- Human-in-the-loop approval with change preview
- Multi-provider AI (bring your own key)

### 1.3 Target Market
**Primary:** Managed Service Providers (MSPs) managing 10-500+ M365 client tenants
**Secondary:** Solo IT admins managing a single M365 tenant (200-5,000 users)

### 1.4 Domain
helm365.io (available, not yet registered)

---

## 2. User Personas

### P1: Mike — Solo IT Admin
- **Context:** 200-person company, 8 years experience, also handles network/help desk/security
- **Pain:** 20+ interruptions/day (MFA resets, permission changes, spam filter updates). Each takes 3-5 minutes of portal clicking. ~2 hours/day on tasks he could do in his sleep.
- **Needs:** Raw speed. Bark commands while doing something else. No hand-holding.
- **Dealbreakers:** Slower than doing it himself. Too many approval clicks. >$50/mo. 2-hour setup. Tries to be "smart" when he needs fast.

### P2: Jake — MSP L1 Technician
- **Context:** 6 months on the job, 40 client tenants, previously did break-fix PC repair
- **Pain:** Doesn't know WHERE to do things. Is calendar permissions in Exchange or Entra? Constantly Googling. Afraid of breaking client tenants. Bad ticket resolution times.
- **Needs:** Intent-based commands (describe outcome, not portal). Guardrails. Learning from what AI does.
- **Dealbreakers:** Lets him do dangerous things. Uses jargon he doesn't understand. No undo. Manager can't see what he did.

### P3: Rachel — MSP Owner
- **Context:** 15 technicians, 180 client tenants
- **Pain:** Labor is biggest cost. Half her techs' day is repetitive admin. No process consistency — Jake and senior tech do offboarding completely differently. Needs audit trail for cyber insurance and client MSAs.
- **Needs:** Cut ticket resolution time (= more clients per tech or fewer techs). Enforced SOPs via templates. Full audit trail. Per-tenant pricing. PSA integration.
- **Dealbreakers:** Per-user pricing (9,000 users = dead). No PSA integration. Slower than CIPP. No white-label. No GDAP support.

### P4: David — Client CTO
- **Context:** 500-person company, pays MSP $8K/mo, has no idea what they do in his tenant
- **Pain:** No transparency. Last quarter MSP "adjusted conditional access" and half the sales team couldn't log in for 2 days. Nobody told him in advance.
- **Needs:** See what MSP is doing in plain English. Approve high-impact changes in advance. Ask basic questions ("why can't Sarah access X?").
- **Dealbreakers:** Another login. 50 notifications/day. IT jargon. MSP uses it for MORE billable work.

---

## 3. Competitive Landscape

| Competitor | Focus | AI | Price | Gap |
|-----------|-------|----|----|-----|
| **CIPP** | MSP multi-tenant M365 | None | Free (open source) | Zero AI. Rough UI. Speed benchmark to beat. |
| **Rewst** | MSP workflow automation | RoboRewsty (workflow help only) | ~$1-2/endpoint/mo | Not an admin tool. Steep learning curve. |
| **CoreView** | Enterprise M365 management | "Corey" (beta/vaporware) | $3-6/user/mo | Enterprise-priced. Not MSP-focused. |
| **Security Copilot** | Security analysis | Yes (best-in-class) | E5 required | Security-only. Single-tenant. No admin tasks. |
| **Augmentt** | MSP SaaS security | None | Custom | Security-only. No admin tasks. No AI. |
| **Octiga** | MSP M365 security | None | Custom | Security-only. No admin tasks. No AI. |

**Market gap:** The MSP-focused + AI-native quadrant is completely empty. Microsoft has invested in AI for security (Security Copilot) and productivity (M365 Copilot) but has NOT built AI for M365 administration.

---

## 4. Core Architecture

### 4.1 Six-Screen UI

| Screen | Purpose |
|--------|---------|
| **Command Bar** | Voice or text input. Always present (Linear Cmd+K style). Primary interface. |
| **Dashboard** | Tenant health at a glance. Filterable by tenant/group/tag (Datadog-style). |
| **Action Feed** | Live stream of everything happening (Stripe-style event log). |
| **Operations Center** | Review: completed actions, reports, alerts, incidents, compliance results, pending approvals. |
| **Tenants** | Manage connections, tenant groups, GDAP relationships, health status. |
| **Settings** | AI provider + model selection, team roles/permissions, PSA/webhook config, billing, governance thresholds. |

### 4.2 Eight Domain Specialist Agents

A router agent analyzes user intent and dispatches to the appropriate specialist:

| Agent | Domain | Tool Access |
|-------|--------|-------------|
| **Exchange** | Mailbox, forwarding, delegation, quarantine, spam filter, transport rules, message trace, email security (SPF/DKIM/DMARC, Safe Links, Safe Attachments) | Exchange Online tools only |
| **Identity** | Users, groups, MFA, conditional access, GDAP, guest management, DUDE sync, sign-in logs | Entra ID tools only |
| **Device** | Intune compliance, config profiles, apps, remediation scripts, Autopilot, update rings, endpoint security | Intune tools only |
| **Compliance** | CMMC L1/L2, NIST 800-171/800-53, CIS M365, HIPAA, SOC2, ISO, gap analysis, remediation | Compliance scanning tools |
| **Security** | Hawk forensics, incident response, MISP enrichment, risk scoring, secure score, advanced hunting | Security tools only |
| **Licensing** | Audit, optimize, reclaim unused, cost prediction, Copilot readiness, Copilot usage analytics | Licensing tools only |
| **Reporting** | 100+ report templates (12 categories), PDF generation, scheduled exports, executive summaries | Reporting tools only |
| **Policy** | Policy templates, deployment (audit/enforce/report-only), backup, rollback, drift detection, security baselines | Policy tools only |

Each agent has:
- Domain-specific system prompt with deep M365 knowledge
- Restricted tool access (principle of least privilege at AI layer)
- Ingested reference materials via RAG (MS Learn, Graph API docs, CIS/NIST, PowerShell references)
- Independent evolution tracking (accuracy scoring, prompt refinement)

### 4.3 Three-Tier Security Gateway

| Tier | Approval | Audit | Examples |
|------|----------|-------|---------|
| **GREEN** | Auto-approved | Logged | Password reset, MFA reset, license assign, group membership, email forwarding, calendar permissions |
| **YELLOW** | Human approval required + change preview | Logged + preview snapshot | Onboarding, offboarding, CA policy changes, security alert triage, mail flow rules |
| **RED** | Human approval + typed confirmation + blast radius warning | Logged + preview + rollback snapshot | Bulk user disable, tenant-wide policy deletion, data purge |

**Change Preview (Vercel-style):**
Every YELLOW/RED operation shows exactly what will change before execution:
- Current state vs. proposed state
- Impact analysis (how many users/resources affected, WHO specifically)
- Visual dependency graph (ReactFlow) for complex changes
- Options: Approve, Modify, Cancel, Schedule for after-hours

**Rollback:**
Every write operation creates a rollback snapshot. "Undo the last change at Contoso" works within 15 minutes for bulk operations, indefinitely for policy changes.

### 4.4 Multi-Provider AI

Users bring their own API keys. Product never pays for AI inference.

| Provider | Models | Requires Key |
|----------|--------|-------------|
| OpenAI | GPT-4o, GPT-4o-mini, o1 | Yes |
| Anthropic | Claude Sonnet, Claude Opus, Claude Haiku | Yes |
| Google | Gemini 2.5 Pro, Gemini 2.5 Flash | Yes |
| Mistral | Mistral Large, Medium | Yes |
| Azure OpenAI | Azure-hosted GPT models | Yes |
| Groq | Llama, Mixtral (fast inference) | Yes |
| Perplexity | AI-powered search | Yes |
| Ollama | Any local model (Llama, Mistral, etc.) | No (local) |

**Three Processing Modes (cost control):**
- **Quick** (~$0.01/task) — Fast model, pattern matching only. Daily fleet scans.
- **Smart** (~$0.10/task) — Mid-tier model, selective reasoning on flagged items. Default for most tasks.
- **Deep** (~$1.00/task) — Best model, full reasoning on every item. Monthly deep audits, incident response.

### 4.5 Knowledge Layer (RAG)

Each agent is fed authoritative reference materials:
- **Microsoft Learn articles** — per-domain (Exchange docs for Exchange agent, etc.)
- **Microsoft Graph API reference** — endpoint docs, permission scopes, throttling limits
- **PowerShell module docs** — ExchangeOnlineManagement, Microsoft.Graph, Az modules
- **Compliance frameworks** — CIS M365 Benchmark, NIST 800-53/800-171, CMMC, HIPAA
- **Community knowledge** — curated MSP best practices, common gotchas

Full reference source list: `_bmad-output/analysis/m365-agent-reference-sources.md` (100+ verified URLs)

### 4.6 Agent Evolution System

Agents improve over time (modeled on BMAD persona-evolution OODA):
- **Interaction logging** — every invocation: what was asked, tools called, outcome, approved/rejected/modified
- **Pattern extraction** — periodic review: common corrections, frequently rejected suggestions, tasks needing modification
- **Prompt refinement** — agent prompts updated based on learned patterns
- **Calibration scoring** — accuracy per task type (% approved without modification)
- **Blind spot detection** — categories where agent consistently needs correction
- **Cross-agent learning** — Security Agent learns about CA policies → shares with Identity Agent

### 4.7 Context Management

Session intelligence (modeled on BMAD session awareness):
- **Session awareness** — on login: pending approvals, stale drift alerts, expiring GDAP, upcoming scheduled deployments
- **Handoff protocol** — running state document of in-progress work. Context recovered automatically on return.
- **Per-tenant memory** — learned gotchas persist. "Last time we changed CA at Contoso, VPN broke for remote users."
- **Wrap-up protocol** — session end auto-summarizes: what changed, what's pending, what needs follow-up. Generates handoff for next tech.
- **Knowledge base** — structured learnings from past incidents/fixes. Searchable, scored, deduped.

---

## 5. Feature Requirements

### 5.1 MVP (V1)

**P0 — Must Ship:**

| Feature | Description |
|---------|-------------|
| Command bar | Voice + text input. Always-present. Primary interface. |
| 6-screen UI | Command Bar, Dashboard, Action Feed, Operations Center, Tenants, Settings |
| Router + 4 specialist agents | Exchange, Identity, Compliance, Security (minimum for V1) |
| Three-tier gateway | GREEN/YELLOW/RED with change preview and audit logging |
| Rollback/undo | Every write operation reversible |
| Green-light tasks | Password reset, MFA reset, license assign/remove, group membership, email forwarding, calendar permissions, shared mailbox, account unlock |
| Yellow-light tasks | User onboarding (template-based), user offboarding (with data preservation), CA policy changes |
| Policy templates + deployment | 3 modes (audit/enforce/report-only), preflight checks |
| Policy backup + rollback | Snapshot before every deployment, restore on demand |
| Compliance frameworks | CMMC L1/L2, NIST 800-171, CIS M365, HIPAA — gap analysis + remediation recommendations |
| Drift detection | Baseline comparison, scheduled scans, AI-powered drift explainer |
| Email security management | Anti-spam/phishing, Safe Links/Attachments, SPF/DKIM/DMARC, quarantine, spam filter blocks |
| License optimizer | Identify unused/underutilized licenses, recommend downgrades, calculate savings |
| Secure Score | Dashboard, improvement actions, trend tracking |
| Reports | Top 20 templates, PDF generation, on-demand + scheduled |
| Multi-provider AI | 8 providers, BYOK, per-provider model selection |
| 3 processing modes | Quick/Smart/Deep with cost indication |
| Multi-tenant | Tenant connections, tenant groups, tenant health checks |
| Team roles | L1/L2/Admin permission tiers |
| PSA integration | ConnectWise/Autotask — auto-create tickets on drift/compliance failure |
| Webhooks | Notify on: drift detected, compliance failed, export completed, scheduled job run |
| Full audit trail | Every action logged (JSONL), timestamped, attributed, searchable |
| Per-tenant pricing | Billing model: per-tenant/month, not per-user |
| Session awareness | On login: surface pending approvals, stale alerts, upcoming scheduled work |
| Wrap-up protocol | Auto-summarize session changes, generate handoff notes |
| Blast radius warnings | Threshold triggers for bulk operations (>10 users = explicit confirmation) |
| Tenant confirmation | Voice commands always show text preview + confirm tenant before write operations |

**P1 — Should Ship (V1 if time allows):**

| Feature | Description |
|---------|-------------|
| Message trace | "Run a message trace for john@contoso.com last 48 hours" |
| Quarantine management | "Release all quarantined emails from vendor-domain.com and whitelist" |
| Bulk user updates | "Update all Seattle users — change department to Product Engineering" |
| Guest user audit | "Show guest users who haven't signed in for 90 days" |
| Dry-run mode | Preview exactly what Graph API calls would be made without touching tenant |
| Scheduled drift scans | Cron-based drift detection across tenant groups |

### 5.2 V2

| Feature | Description |
|---------|-------------|
| Full 8-agent roster | Add Device, Licensing, Reporting, Policy specialists |
| Client portal | Plain-English change log for David (CTO). Approval routing for high-impact changes. "Ask a question" interface. MSP charges $200-500/mo extra. |
| Cross-tenant intelligence | "3 of your tenants have the same misconfig that caused an incident at Tenant X" |
| GDAP auto-discovery | Connect partner credentials, auto-discover all tenants. Intelligent role recommendations. |
| Intune full stack | Devices, compliance, config, apps, remediation scripts, Autopilot, update rings, endpoint security |
| Hawk incident response | Guided investigation workflow: disable → revoke → check mail rules → audit → Hawk analysis → report |
| MISP enrichment | Threat intel context during incident response |
| Copilot readiness | Assessment + usage analytics + licensing |
| Governance monitoring | Scheduled checks: secure score thresholds, MFA coverage, license utilization, risky users/sign-ins |
| Scheduled deployments | Cron-based policy deployment across tenant groups |
| White-label reports | Brandable client-facing reports |
| Learning mode | After AI executes, show "Here's the PowerShell that did this" for junior tech education |
| Trust ladder | New user starts read-only → green-light after 10 approvals → batch ops after 50 |
| Ollama/local models | Privacy-conscious admins run models locally |
| Contextual notifications | Slack-style: one-click undo, client-facing plain English, daily digest |
| Out-of-band drift detection | Detect changes made outside Helm365 (catches portal-hopping techs) |
| Knowledge ingestion pipeline | RAG: ingest MS Learn, Graph API docs, CIS/NIST, community knowledge per agent |
| Agent evolution | Interaction logging, pattern extraction, prompt refinement, calibration scoring |
| Per-tenant memory | Learned gotchas and patterns persist across sessions |
| Knowledge base | Structured learnings from past incidents, searchable and scored |
| Visual impact graph | ReactFlow dependency visualization for complex change previews |
| MCP server architecture | Tool layer as MCP-compatible servers for extensibility |

### 5.3 V3

| Feature | Description |
|---------|-------------|
| Terraform/Bicep/PowerShell export | "Export Contoso config as Terraform" |
| Azure resource management | ARM-level resource management beyond M365 |
| Complex DLP policy management | AI-assisted DLP with false positive tuning |
| Migration planner | Tenant-to-tenant migration planning and execution |
| Third-party tool extensions | Marketplace for community-built MCP tools |
| Proactive recommendations | "3 users at Contoso haven't logged in for 60 days — disable and reclaim licenses?" |
| Auto-remediation | Green-light drift items auto-fix without human intervention |

---

## 6. Business Model

### 6.1 Pricing

| Tier | Price | Target | Includes |
|------|-------|--------|----------|
| **Free** | $0 | Lead gen | Read-only + 1 tenant. Health scan shows problems. "Upgrade to fix." |
| **Solo** | $29/mo | Mike (solo admin) | 1 tenant, all features, 1 user |
| **Professional** | $5/tenant/mo | Rachel (small MSP, 10-50 tenants) | Multi-tenant, team roles (up to 5 users), PSA integration |
| **Enterprise** | $3/tenant/mo | Large MSP (100+ tenants) | Volume discount, unlimited users, white-label, priority support, SLA |
| **Client Portal** | +$2/tenant/mo add-on | David (client CTO) | Plain-English change log, approval routing, ask-a-question |

**Users provide their own AI API keys.** Helm365 never pays for AI inference. This is a key cost advantage over competitors who would need to absorb AI costs.

### 6.2 Revenue Examples

| Scenario | Monthly Revenue |
|----------|----------------|
| Solo admin, 1 tenant | $29 |
| Small MSP, 30 tenants (Professional) | $150 |
| Mid MSP, 100 tenants (Professional) | $500 |
| Large MSP, 200 tenants (Enterprise) + 50 client portals | $700 |
| Large MSP, 500 tenants (Enterprise) + 200 client portals | $1,900 |

### 6.3 Free Tier Strategy
Free tier is the sales demo, not the product:
- Run tenant health scan (shows problems — secure score gaps, license waste, compliance failures)
- See how fast voice commands work (read-only)
- Cannot execute write operations
- Cannot manage multiple tenants
- Hook: "Your tenant has 12 security issues and $4,200/year in wasted licenses. Upgrade to fix them."

---

## 7. Technical Constraints

### 7.1 Security
- Never store client secrets in database — use Azure Key Vault or equivalent
- GDAP tokens are time-bound and least-privileged by design
- SOC2 compliance architecture from day one
- Encryption at rest + in transit
- Per-tenant data isolation in data layer
- Compromise of one tenant cannot leak to others

### 7.2 Performance
- Voice command → result must feel faster than portal clicking
- Speed benchmark: every common task must be measurably faster than CIPP
- Graph API throttling: respect per-tenant limits, implement retry with backoff
- RAG queries must add <500ms latency

### 7.3 Compliance
- Product itself must be SOC2-ready architecture
- Must support GDAP (Granular Delegated Admin Privileges) — not legacy DAP
- Audit logs must be append-only, tamper-evident
- Data residency considerations for MSPs with international clients

---

## 8. Success Metrics

### 8.1 Product Metrics
- **Time to complete task** vs. portal/CIPP baseline (target: 5x faster for green-light, 3x faster for yellow-light)
- **Approval rate** — % of AI-proposed actions approved without modification (target: >85% after 30 days)
- **Tasks per session** — how many admin tasks completed per login session
- **Tenant coverage** — % of connected tenants with active monitoring

### 8.2 Business Metrics
- **Tenant count** — total tenants under management
- **MSP count** — number of MSP organizations
- **MRR** — monthly recurring revenue
- **Free → paid conversion** — % of free tier users who upgrade
- **Churn** — monthly tenant churn rate (target: <3%)
- **NPS** — net promoter score (target: >50)

### 8.3 Milestones
| Milestone | Target |
|-----------|--------|
| Alpha (own tenants) | Week 5 |
| Beta (3-5 MSPs) | Week 8 |
| Public launch | Week 12 |
| 100 tenants under management | Month 4 |
| 500 tenants | Month 6 |
| 1,000 tenants | Month 9 |

---

## 9. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI nukes a tenant (misunderstood scope) | Critical | Blast radius warnings, threshold triggers, 15-min undo window, RED tier typed confirmation |
| Voice misheard tenant name | High | Tenant confirmation on every write, fuzzy match warning, text preview |
| L1 tech bypasses tool (changes in portal directly) | Medium | Out-of-band drift detection catches changes made outside Helm365 |
| Free tier too generous | Business-critical | Read-only + 1 tenant. Free = demo, not product |
| CIPP is free and good enough | High | Speed benchmark (must be faster), AI moat, cross-tenant intelligence, client portal, enforced SOPs |
| Credential breach (Graph API keys) | Existential | Key Vault, GDAP time-bound tokens, SOC2, per-tenant isolation |
| Microsoft builds this themselves | Medium | Microsoft never builds MSP-first tooling. Move fast, get 500+ MSPs, switching costs protect |
| Nobody trusts AI to touch production | High | Trust ladder (start read-only → earn auto-approve), change preview, rollback everything, transparency |

---

## 10. UX Principles

Stolen from best-in-class products:

| Source | Pattern | Application |
|--------|---------|-------------|
| **Vercel** | Deploy preview + rollback + scheduled deploy | Change preview with impact analysis, one-click rollback, schedule for after-hours |
| **Stripe** | Sandbox + live event log | Dry-run mode, real-time action feed as core UI |
| **Linear** | Single command bar, opinionated workflow | Voice/text command bar IS the interface. Product decides routing. |
| **Datadog** | Tags + filters across fleet | Multi-tenant dashboard filterable by tenant/group/tag |
| **Slack** | Contextual notifications, digests | One-click undo notifications, daily digest for MSP owner |

---

## 11. Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| PolicyForge codebase | Code to port (Graph API, compliance rules, report templates, policy deployment, AI providers) | Available (private repo anthonyonazure/policyforge) |
| Microsoft Graph API | Core integration | Available, well-documented |
| MSAL.js | M365 authentication | Available, used in PolicyForge |
| AI provider APIs | Multi-provider support | All available, tested in PolicyForge |
| Supabase or equivalent | Backend (auth, DB, edge functions) | Available |
| Hawk PowerShell module | Incident response | Open source (GitHub T0pCyber/hawk) |
| CIS/NIST/CMMC frameworks | Compliance content | Available (PolicyForge has implementations) |

---

## 12. Open Questions

1. **Tech stack final decision** — Supabase (like PolicyForge) vs. Fastify + PostgreSQL (like Helmpoint)?
2. **Voice implementation** — Web Speech API (free, browser-native) vs. Whisper API (better accuracy, cost)?
3. **Deployment target** — Vercel vs. Azure Static Web Apps + Azure Functions?
4. **Domain registration** — Register helm365.io now?
5. **Product Hunt launch** — Target for public launch?
6. **SOC2 timeline** — Start the process at beta or post-launch?
