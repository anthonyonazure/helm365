import type { AgentType } from '@/types/agents';
import type { AgentConfig } from './types';
import { USER_TOOLS } from '@/tools/graph/users';
import { EXCHANGE_TOOLS } from '@/tools/graph/exchange';
import { SECURITY_TOOLS } from '@/tools/graph/security';
import { COMPLIANCE_TOOLS } from '@/tools/graph/compliance';
import { LICENSING_TOOLS } from '@/tools/graph/licensing';
import { DEVICE_TOOLS } from '@/tools/graph/devices';
import { POLICY_TOOLS } from '@/tools/graph/policy';
import { REPORTING_TOOLS } from '@/tools/graph/reporting';
import { IDENTITY_SYSTEM_PROMPT } from './prompts/identity';
import { EXCHANGE_SYSTEM_PROMPT } from './prompts/exchange';
import { SECURITY_SYSTEM_PROMPT } from './prompts/security';
import { COMPLIANCE_SYSTEM_PROMPT } from './prompts/compliance';
import { DEVICE_SYSTEM_PROMPT } from './prompts/device';
import { LICENSING_SYSTEM_PROMPT } from './prompts/licensing';
import { POLICY_SYSTEM_PROMPT } from './prompts/policy';
import { REPORTING_SYSTEM_PROMPT } from './prompts/reporting';

/**
 * Agent Registry — maps each agent type to its configuration.
 * Each agent has: system prompt, tools, description, and keywords for routing.
 */

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  identity: {
    id: 'identity',
    name: 'Identity Agent',
    description: 'User management, MFA, passwords, groups, conditional access, GDAP',
    systemPrompt: IDENTITY_SYSTEM_PROMPT,
    tools: USER_TOOLS,
    keywords: ['user', 'password', 'mfa', 'group', 'guest', 'unlock', 'onboard', 'offboard', 'disable', 'enable', 'gdap', 'calendar', 'license', 'conditional access'],
  },
  exchange: {
    id: 'exchange',
    name: 'Exchange Agent',
    description: 'Email, mailboxes, forwarding, quarantine, spam filter, message trace',
    systemPrompt: EXCHANGE_SYSTEM_PROMPT,
    tools: EXCHANGE_TOOLS,
    keywords: ['mailbox', 'email', 'forwarding', 'quarantine', 'spam', 'phishing', 'safe links', 'transport', 'message trace', 'dkim', 'dmarc', 'shared mailbox', 'send as'],
  },
  security: {
    id: 'security',
    name: 'Security Agent',
    description: 'Secure score, risky sign-ins, incident response, threat hunting, audit logs',
    systemPrompt: SECURITY_SYSTEM_PROMPT,
    tools: SECURITY_TOOLS,
    keywords: ['secure score', 'risky', 'compromised', 'incident', 'breach', 'investigate', 'threat', 'suspicious', 'audit log', 'inbox rule', 'app consent'],
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance Agent',
    description: 'CMMC, NIST, CIS, HIPAA, SOC2 assessments, conditional access policies',
    systemPrompt: COMPLIANCE_SYSTEM_PROMPT,
    tools: COMPLIANCE_TOOLS,
    keywords: ['cmmc', 'nist', 'cis', 'hipaa', 'soc2', 'iso', 'compliance', 'dlp', 'retention', 'conditional access', 'security default'],
  },
  device: {
    id: 'device',
    name: 'Device Agent',
    description: 'Intune, device compliance, apps, remediation, Autopilot, wipe/retire',
    systemPrompt: DEVICE_SYSTEM_PROMPT,
    tools: DEVICE_TOOLS,
    keywords: ['intune', 'device', 'autopilot', 'compliance policy', 'remediation', 'wipe', 'retire', 'app deploy', 'endpoint', 'bitlocker', 'update ring'],
  },
  licensing: {
    id: 'licensing',
    name: 'Licensing Agent',
    description: 'License audit, optimization, cost savings, Copilot readiness',
    systemPrompt: LICENSING_SYSTEM_PROMPT,
    tools: LICENSING_TOOLS,
    keywords: ['license', 'licensing', 'unused', 'waste', 'optimize', 'copilot', 'sku', 'cost', 'reclaim'],
  },
  reporting: {
    id: 'reporting',
    name: 'Reporting Agent',
    description: 'Tenant health, executive summaries, compliance reports, cross-tenant analytics',
    systemPrompt: REPORTING_SYSTEM_PROMPT,
    tools: REPORTING_TOOLS,
    keywords: ['report', 'export', 'summary', 'dashboard', 'health', 'usage', 'monthly report', 'executive'],
  },
  policy: {
    id: 'policy',
    name: 'Policy Agent',
    description: 'Policy templates, deployment, backup, rollback, drift detection',
    systemPrompt: POLICY_SYSTEM_PROMPT,
    tools: POLICY_TOOLS,
    keywords: ['policy', 'baseline', 'drift', 'deploy', 'rollback', 'backup', 'template', 'enforce', 'audit mode'],
  },
};

export function getAgentConfig(agentType: AgentType): AgentConfig {
  return AGENT_CONFIGS[agentType];
}

export function getAllAgentConfigs(): AgentConfig[] {
  return Object.values(AGENT_CONFIGS);
}

export function getAgentTools(agentType: AgentType) {
  return AGENT_CONFIGS[agentType].tools;
}

export function getAgentPrompt(agentType: AgentType): string {
  return AGENT_CONFIGS[agentType].systemPrompt;
}

/**
 * Get total tool count across all agents.
 */
export function getToolCount(): { total: number; green: number; yellow: number; red: number } {
  const allTools = Object.values(AGENT_CONFIGS).flatMap((c) => c.tools);
  return {
    total: allTools.length,
    green: allTools.filter((t) => t.tier === 'green').length,
    yellow: allTools.filter((t) => t.tier === 'yellow').length,
    red: allTools.filter((t) => t.tier === 'red').length,
  };
}
