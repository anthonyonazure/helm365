import type { AgentType } from '@/types/agents';
import type { AIProvider, Message } from '@/types/providers';
import type { ParsedIntent } from './types';

/**
 * Router Agent — analyzes user intent and dispatches to the correct specialist.
 * Uses lightweight AI classification (always Quick mode) to minimize cost.
 * Falls back to keyword matching if no AI provider is configured.
 */

const ROUTER_SYSTEM_PROMPT = `You are the Helm365 Router Agent. Your job is to analyze the user's M365 admin command and determine which specialist agent should handle it.

AGENTS:
- exchange: Mailbox, email forwarding, delegation, quarantine, spam filter, transport rules, message trace, Safe Links, Safe Attachments, SPF/DKIM/DMARC
- identity: Users, groups, MFA, passwords, conditional access, GDAP, guest users, account lock/unlock, sign-in logs
- device: Intune, device compliance, config profiles, apps, remediation scripts, Autopilot, update rings, endpoint security
- compliance: CMMC, NIST 800-171, CIS M365, HIPAA, SOC2, ISO, compliance assessments, gap analysis, DLP
- security: Incident response, compromised accounts, Hawk forensics, threat hunting, secure score, risk scoring, MISP
- licensing: License audit, optimization, reclamation, cost prediction, Copilot readiness, unused licenses
- reporting: Reports, exports, PDF generation, tenant health summaries, executive reports, scheduled exports
- policy: Policy templates, deployment (audit/enforce/report-only), backup, rollback, drift detection, security baselines

Respond with ONLY a JSON object:
{
  "agent": "<agent_name>",
  "confidence": <0.0-1.0>,
  "intent": "<short description of what user wants>",
  "entities": {
    "tenant": "<tenant name if mentioned>",
    "users": ["<user names if mentioned>"],
    "resource": "<resource type if mentioned>",
    "action": "<action verb>"
  }
}`;

// Keyword-based fallback routing (no AI needed)
const KEYWORD_MAP: Record<string, AgentType> = {
  // Exchange
  mailbox: 'exchange', email: 'exchange', forwarding: 'exchange', forward: 'exchange',
  quarantine: 'exchange', spam: 'exchange', phishing: 'exchange', 'safe links': 'exchange',
  'safe attachments': 'exchange', transport: 'exchange', 'mail flow': 'exchange',
  'message trace': 'exchange', dkim: 'exchange', dmarc: 'exchange', spf: 'exchange',
  'shared mailbox': 'exchange', delegation: 'exchange', 'send as': 'exchange',
  'send on behalf': 'exchange', 'full access': 'exchange', 'block sender': 'exchange',

  // Identity
  user: 'identity', password: 'identity', mfa: 'identity', 'multi-factor': 'identity',
  'conditional access': 'identity', group: 'identity', guest: 'identity',
  unlock: 'identity', 'sign-in': 'identity', signin: 'identity', login: 'identity',
  onboard: 'identity', offboard: 'identity', 'new hire': 'identity',
  disable: 'identity', enable: 'identity', 'reset password': 'identity',
  'reset mfa': 'identity', gdap: 'identity', calendar: 'identity',

  // Device
  intune: 'device', device: 'device', autopilot: 'device', 'update ring': 'device',
  'compliance policy': 'device', remediation: 'device', 'app deploy': 'device',
  endpoint: 'device', bitlocker: 'device', wipe: 'device', retire: 'device',

  // Compliance
  cmmc: 'compliance', nist: 'compliance', cis: 'compliance', hipaa: 'compliance',
  soc2: 'compliance', 'soc 2': 'compliance', iso: 'compliance', compliance: 'compliance',
  dlp: 'compliance', retention: 'compliance', ediscovery: 'compliance',
  'data loss': 'compliance', 'sensitivity label': 'compliance',

  // Security
  compromised: 'security', incident: 'security', breach: 'security', hawk: 'security',
  'secure score': 'security', 'risky sign': 'security', 'risky user': 'security',
  threat: 'security', investigate: 'security', forensic: 'security',
  'suspicious': 'security', attack: 'security',

  // Licensing
  license: 'licensing', licensing: 'licensing', 'unused license': 'licensing',
  'license audit': 'licensing', copilot: 'licensing', sku: 'licensing',
  'reclaim': 'licensing', 'cost': 'licensing', 'waste': 'licensing',
  'optimize license': 'licensing',

  // Reporting
  report: 'reporting', export: 'reporting', pdf: 'reporting',
  'usage report': 'reporting', summary: 'reporting', dashboard: 'reporting',
  'health report': 'reporting', 'monthly report': 'reporting',

  // Policy
  policy: 'policy', baseline: 'policy', drift: 'policy', deploy: 'policy',
  rollback: 'policy', backup: 'policy', template: 'policy',
  'security baseline': 'policy', 'audit mode': 'policy', enforce: 'policy',
};

/**
 * Route using keyword matching (no AI cost, instant).
 */
export function routeByKeywords(input: string): ParsedIntent {
  const lower = input.toLowerCase();

  // Check multi-word keywords first (longer = more specific)
  const sortedKeywords = Object.keys(KEYWORD_MAP).sort((a, b) => b.length - a.length);

  for (const keyword of sortedKeywords) {
    if (lower.includes(keyword)) {
      return {
        agent: KEYWORD_MAP[keyword]!,
        confidence: 0.7,
        intent: input,
        entities: extractEntities(input),
        rawInput: input,
      };
    }
  }

  // Default to identity (most common admin tasks)
  return {
    agent: 'identity',
    confidence: 0.3,
    intent: input,
    entities: extractEntities(input),
    rawInput: input,
  };
}

/**
 * Route using AI classification (costs ~$0.001 per call with Quick mode).
 */
export async function routeByAI(input: string, provider: AIProvider, model?: string): Promise<ParsedIntent> {
  const messages: Message[] = [
    { role: 'system', content: ROUTER_SYSTEM_PROMPT },
    { role: 'user', content: input },
  ];

  try {
    const response = await provider.chat(messages, [], model);
    const parsed = JSON.parse(response.content);

    return {
      agent: parsed.agent as AgentType,
      confidence: parsed.confidence ?? 0.8,
      intent: parsed.intent ?? input,
      entities: {
        tenant: parsed.entities?.tenant,
        users: parsed.entities?.users,
        resource: parsed.entities?.resource,
        action: parsed.entities?.action,
      },
      rawInput: input,
    };
  } catch {
    // Fall back to keyword routing if AI fails
    return routeByKeywords(input);
  }
}

/**
 * Main router — uses AI if available, falls back to keywords.
 */
export async function route(
  input: string,
  provider?: AIProvider | null,
  model?: string,
): Promise<ParsedIntent> {
  if (provider) {
    return routeByAI(input, provider, model);
  }
  return routeByKeywords(input);
}

/**
 * Extract entities from raw text using simple pattern matching.
 * AI routing does this better, but this provides a baseline.
 */
function extractEntities(input: string): ParsedIntent['entities'] {
  const entities: ParsedIntent['entities'] = {};

  // Tenant: "at Contoso" or "for Contoso" or "in Contoso"
  const tenantMatch = input.match(/(?:at|for|in|@)\s+([A-Z][a-zA-Z0-9\s]+?)(?:\s+[-—]|\s*$|\s+(?:and|then|also|,))/i);
  if (tenantMatch) {
    entities.tenant = tenantMatch[1]?.trim();
  }

  // Users: names after "for" or before "'s" or common patterns
  const userMatch = input.match(/(?:for|user)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (userMatch) {
    entities.users = [userMatch[1]!];
  }

  // Action verbs
  const actionVerbs = ['reset', 'create', 'delete', 'disable', 'enable', 'add', 'remove',
    'block', 'unblock', 'assign', 'revoke', 'deploy', 'rollback', 'check', 'scan',
    'audit', 'investigate', 'onboard', 'offboard', 'forward', 'release', 'run'];
  const lower = input.toLowerCase();
  for (const verb of actionVerbs) {
    if (lower.startsWith(verb) || lower.includes(` ${verb} `)) {
      entities.action = verb;
      break;
    }
  }

  return entities;
}
