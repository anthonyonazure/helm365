import { useHelmStore } from '@/lib/store';
import { CheckCircle, XCircle, Clock, Shield, Undo2 } from 'lucide-react';
import type { Action } from '@/types/gateway';
import type { GatewayTier } from '@/types/agents';

const TIER_STYLES: Record<GatewayTier, { bg: string; text: string; label: string }> = {
  green: { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400', label: 'AUTO' },
  yellow: { bg: 'bg-amber-100 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', label: 'REVIEW' },
  red: { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', label: 'CRITICAL' },
};

const STATUS_ICONS = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  executing: Clock,
  executed: CheckCircle,
  failed: XCircle,
  rolled_back: Undo2,
};

export function ActionFeedView() {
  const actions = useHelmStore((s) => s.actions);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Action Feed</h1>
          <p className="text-muted-foreground">Real-time stream of all operations across your tenants.</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {actions.length} action{actions.length !== 1 ? 's' : ''}
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="border rounded-lg p-8 text-center space-y-2">
          <Shield className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No actions yet. Use the command bar to get started.</p>
          <p className="text-xs text-muted-foreground">
            Try: "Reset MFA for Sarah at Contoso" or "Check compliance for all tenants"
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  const tier = TIER_STYLES[action.tier];
  const StatusIcon = STATUS_ICONS[action.status] ?? Clock;

  const statusColors: Record<string, string> = {
    pending: 'text-amber-500',
    approved: 'text-blue-500',
    rejected: 'text-red-500',
    executing: 'text-blue-500',
    executed: 'text-green-500',
    failed: 'text-red-500',
    rolled_back: 'text-gray-500',
  };

  return (
    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <StatusIcon className={`h-4 w-4 mt-0.5 shrink-0 ${statusColors[action.status] ?? 'text-muted-foreground'}`} />

        <div className="flex-1 min-w-0 space-y-1">
          {/* Intent */}
          <p className="text-sm font-medium">{action.intent}</p>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* Tier badge */}
            <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${tier.bg} ${tier.text}`}>
              {tier.label}
            </span>

            {/* Agent */}
            <span className="px-1.5 py-0.5 rounded bg-muted">{action.agent}</span>

            {/* Tenant */}
            <span>{action.tenantName}</span>

            {/* Status */}
            <span className={statusColors[action.status]}>{action.status}</span>

            {/* Time */}
            <span>{new Date(action.createdAt).toLocaleTimeString()}</span>

            {/* Duration */}
            {action.durationMs != null && (
              <span>{action.durationMs}ms</span>
            )}

            {/* Provider */}
            <span className="font-mono text-[10px]">{action.aiProvider}/{action.aiModel}</span>
          </div>

          {/* Result */}
          {action.result && (
            <p className="text-xs text-muted-foreground mt-1">{action.result}</p>
          )}

          {/* Pending approval actions */}
          {action.status === 'pending' && (
            <div className="flex gap-2 mt-2">
              <button className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">
                Approve
              </button>
              <button className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
                Reject
              </button>
              <button className="text-xs text-muted-foreground hover:text-foreground px-3 py-1">
                View Preview
              </button>
            </div>
          )}

          {/* Rollback button */}
          {action.status === 'executed' && action.rollbackData && (
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1">
              <Undo2 className="h-3 w-3" /> Undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
