import type { GatewayTier } from '@/types/agents';

export type TeamRole = 'admin' | 'l2' | 'l1';

/**
 * Check if a user role can execute a given gateway tier.
 *
 * L1: GREEN only (auto-approved read + low-risk writes)
 * L2: GREEN + YELLOW (can approve medium-risk writes)
 * Admin: GREEN + YELLOW + RED (full access)
 */
export function canExecuteTier(role: TeamRole, tier: GatewayTier): boolean {
  switch (role) {
    case 'admin':
      return true;
    case 'l2':
      return tier === 'green' || tier === 'yellow';
    case 'l1':
      return tier === 'green';
    default:
      return false;
  }
}

/**
 * Check if a tier requires human approval before execution.
 *
 * GREEN: auto-approved (just log it)
 * YELLOW: requires approval click + change preview
 * RED: requires approval click + typed confirmation + blast radius warning
 */
export function requiresApproval(tier: GatewayTier): boolean {
  return tier === 'yellow' || tier === 'red';
}

/**
 * Check if a tier requires typed confirmation (extra safety for destructive ops).
 */
export function requiresTypedConfirmation(tier: GatewayTier): boolean {
  return tier === 'red';
}

/**
 * Generate the confirmation prompt for RED tier operations.
 */
export function getConfirmationPrompt(action: string, affectedCount: number): string {
  return `Type "${action.toUpperCase()}" to confirm this operation affecting ${affectedCount} resources.`;
}

/**
 * Check if a blast radius warning should be shown.
 * Triggered when an operation affects more than the threshold.
 */
export function shouldWarnBlastRadius(affectedCount: number, threshold = 10): boolean {
  return affectedCount > threshold;
}

/**
 * Get the human-readable permission denial message.
 */
export function getPermissionDeniedMessage(role: TeamRole, tier: GatewayTier): string {
  const tierLabels: Record<GatewayTier, string> = {
    green: 'low-risk',
    yellow: 'medium-risk',
    red: 'high-risk/destructive',
  };

  const roleLabels: Record<TeamRole, string> = {
    l1: 'L1 Technician',
    l2: 'L2 Technician',
    admin: 'Administrator',
  };

  return `Your role (${roleLabels[role]}) does not have permission to execute ${tierLabels[tier]} operations. Contact your team administrator.`;
}
