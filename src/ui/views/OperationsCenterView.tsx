import { useState } from 'react';
import { useHelmStore } from '@/lib/store';
import { approveAction, rejectAction } from '@/gateway/gateway';
import { CheckCircle, XCircle, Clock, FileText, Bell, Filter } from 'lucide-react';
import type { Action, ActionStatus } from '@/types/gateway';
import { toast } from 'sonner';

type Tab = 'pending' | 'actions' | 'alerts' | 'reports';

export function OperationsCenterView() {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const actions = useHelmStore((s) => s.actions);

  const pendingActions = actions.filter((a) => a.status === 'pending');
  const completedActions = actions.filter((a) => a.status !== 'pending');

  const tabs: { id: Tab; label: string; icon: typeof Clock; count?: number }[] = [
    { id: 'pending', label: 'Pending Approval', icon: Clock, count: pendingActions.length },
    { id: 'actions', label: 'Completed Actions', icon: CheckCircle, count: completedActions.length },
    { id: 'alerts', label: 'Alerts', icon: Bell, count: 0 },
    { id: 'reports', label: 'Reports', icon: FileText, count: 0 },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operations Center</h1>
        <p className="text-muted-foreground">Review actions, approve changes, and monitor alerts.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-helm-500 text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  tab.id === 'pending'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'pending' && <PendingTab actions={pendingActions} />}
      {activeTab === 'actions' && <ActionsTab actions={completedActions} />}
      {activeTab === 'alerts' && <EmptyTab icon={Bell} message="No alerts. Your tenants are looking good." />}
      {activeTab === 'reports' && <EmptyTab icon={FileText} message="No reports generated yet. Try: 'Generate monthly report for Contoso'" />}
    </div>
  );
}

function PendingTab({ actions }: { actions: Action[] }) {
  const updateAction = useHelmStore((s) => s.updateAction);

  const handleApprove = (action: Action) => {
    approveAction(action, 'current-user');
    updateAction(action.id, { status: 'approved', approvedBy: 'current-user' });
    toast.success(`Approved: ${action.intent}`);
  };

  const handleReject = (action: Action) => {
    rejectAction(action, 'current-user', 'Manually rejected');
    updateAction(action.id, { status: 'rejected', result: 'Manually rejected' });
    toast.info(`Rejected: ${action.intent}`);
  };

  if (actions.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center space-y-2">
        <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
        <p className="font-medium">No pending approvals</p>
        <p className="text-sm text-muted-foreground">
          YELLOW and RED tier actions will appear here for review before execution.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <div key={action.id} className="border border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/10 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="font-medium">{action.intent}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                  action.tier === 'yellow'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                  {action.tier === 'yellow' ? 'REVIEW' : 'CRITICAL'}
                </span>
                <span>{action.agent}</span>
                <span>{action.tenantName}</span>
                <span>{new Date(action.createdAt).toLocaleString()}</span>
                <span>by {action.userEmail}</span>
              </div>
            </div>
          </div>

          {/* Change preview */}
          {action.preview && (
            <div className="bg-background rounded p-3 border text-xs space-y-1">
              <p className="font-medium text-foreground">Change Preview:</p>
              <p className="text-muted-foreground">{action.preview.summary}</p>
              {action.preview.blastRadius.usersAffected > 0 && (
                <p className="text-muted-foreground">
                  Impact: {action.preview.blastRadius.usersAffected} user(s),
                  {action.preview.blastRadius.resourcesAffected} resource(s)
                </p>
              )}
              {action.preview.warnings.length > 0 && (
                <div className="text-amber-600 dark:text-amber-400">
                  {action.preview.warnings.map((w, i) => (
                    <p key={i}>Warning: {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => handleApprove(action)}
              className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700"
            >
              <CheckCircle className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              onClick={() => handleReject(action)}
              className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-1.5 rounded text-sm hover:bg-red-700"
            >
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionsTab({ actions }: { actions: Action[] }) {
  const [filter, setFilter] = useState<ActionStatus | 'all'>('all');

  const filtered = filter === 'all'
    ? actions
    : actions.filter((a) => a.status === filter);

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(['all', 'executed', 'rejected', 'failed', 'rolled_back'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              filter === f ? 'bg-helm-100 text-helm-700 dark:bg-helm-900/30 dark:text-helm-300 font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No actions matching this filter.</p>
      ) : (
        filtered.map((action) => (
          <div key={action.id} className="border rounded-lg p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{action.intent}</span>
              <span className={`text-xs ${
                action.status === 'executed' ? 'text-green-600' :
                action.status === 'failed' ? 'text-red-600' :
                action.status === 'rejected' ? 'text-red-500' : 'text-muted-foreground'
              }`}>
                {action.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{action.agent}</span>
              <span>{action.tenantName}</span>
              <span>{new Date(action.createdAt).toLocaleString()}</span>
              {action.durationMs != null && <span>{action.durationMs}ms</span>}
            </div>
            {action.result && (
              <p className="text-xs text-muted-foreground">{action.result}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function EmptyTab({ icon: Icon, message }: { icon: typeof Clock; message: string }) {
  return (
    <div className="border rounded-lg p-8 text-center space-y-2">
      <Icon className="h-8 w-8 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
