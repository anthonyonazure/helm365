import { Ship, Shield, HardDrive, AlertTriangle, CheckCircle, Activity, Zap, Clock, ArrowRight } from 'lucide-react';
import { useHelmStore } from '@/lib/store';
import { useTenantsStore } from '@/lib/tenants-store';
import { NavLink } from 'react-router-dom';

export function DashboardView() {
  const actions = useHelmStore((s) => s.actions);
  const pendingCount = useHelmStore((s) => s.pendingCount);
  const activeProvider = useHelmStore((s) => s.activeProvider);
  const connections = useTenantsStore((s) => s.connections);

  const executedToday = actions.filter((a) => {
    const today = new Date().toDateString();
    return new Date(a.createdAt).toDateString() === today && a.status === 'executed';
  }).length;

  const recentActions = actions.slice(0, 5);
  const hasSetup = connections.length > 0 && !!activeProvider;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">
          {hasSetup
            ? `Managing ${connections.length} tenant${connections.length !== 1 ? 's' : ''}. Here's what needs your attention.`
            : "Let's get you set up with Helm365."
          }
        </p>
      </div>

      {/* Session awareness alerts */}
      {pendingCount > 0 && (
        <NavLink to="/operations" className="block">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors">
            <Clock className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{pendingCount} action{pendingCount !== 1 ? 's' : ''} pending approval</p>
              <p className="text-xs text-muted-foreground">Review and approve in the Operations Center</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </NavLink>
      )}

      {!hasSetup && (
        <div className="bg-helm-50 dark:bg-helm-950/20 border border-helm-200 dark:border-helm-800 rounded-lg p-4 flex items-start gap-3">
          <Ship className="h-5 w-5 text-helm-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Get started with Helm365</p>
            <p className="text-sm text-muted-foreground">
              Connect a tenant and configure your AI provider to start managing M365 with voice commands.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={HardDrive}
          label="Tenants"
          value={String(connections.length)}
          subtext="connected"
          link="/tenants"
        />
        <StatCard
          icon={Shield}
          label="Pending"
          value={String(pendingCount)}
          subtext="approvals"
          link="/operations"
          alert={pendingCount > 0}
        />
        <StatCard
          icon={Activity}
          label="Actions Today"
          value={String(executedToday)}
          subtext="executed"
          link="/feed"
        />
        <StatCard
          icon={Zap}
          label="Total Actions"
          value={String(actions.length)}
          subtext="all time"
          link="/feed"
        />
      </div>

      {/* Two columns: Setup / Recent actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Setup checklist */}
        <div className="border rounded-lg p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Ship className="h-4 w-4 text-helm-500" />
            Setup
          </h2>
          <div className="space-y-3">
            <StepCard
              step={1}
              title="Connect a Tenant"
              description="Add your M365 tenant with app registration or GDAP."
              done={connections.length > 0}
              link="/tenants"
            />
            <StepCard
              step={2}
              title="Configure AI Provider"
              description="Choose Claude, GPT, Gemini, or another provider."
              done={!!activeProvider}
              link="/settings"
            />
            <StepCard
              step={3}
              title="Run Your First Command"
              description={`Try: "Show me users without MFA"`}
              done={actions.length > 0}
            />
          </div>
        </div>

        {/* Recent actions */}
        <div className="border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Actions
            </h2>
            {actions.length > 0 && (
              <NavLink to="/feed" className="text-xs text-helm-600 hover:text-helm-700 font-medium">
                View all
              </NavLink>
            )}
          </div>

          {recentActions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No actions yet. Use the command bar above to get started.</p>
          ) : (
            <div className="space-y-2">
              {recentActions.map((action) => (
                <div key={action.id} className="flex items-center gap-2 py-1.5 text-sm">
                  {action.status === 'executed' ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : action.status === 'pending' ? (
                    <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="truncate flex-1">{action.intent}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(action.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, link, alert }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
  link?: string;
  alert?: boolean;
}) {
  const content = (
    <div className={`border rounded-lg p-4 space-y-2 transition-colors ${link ? 'hover:bg-muted/50 cursor-pointer' : ''} ${alert ? 'border-amber-300 dark:border-amber-700' : ''}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div>
        <span className={`text-2xl font-bold ${alert ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</span>
        <span className="text-sm text-muted-foreground ml-2">{subtext}</span>
      </div>
    </div>
  );

  return link ? <NavLink to={link}>{content}</NavLink> : content;
}

function StepCard({ step, title, description, done, link }: {
  step: number;
  title: string;
  description: string;
  done: boolean;
  link?: string;
}) {
  const content = (
    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${done ? 'opacity-70' : ''} ${link && !done ? 'hover:bg-muted/50 cursor-pointer' : ''}`}>
      <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 ${
        done
          ? 'bg-green-500 text-white'
          : 'bg-helm-100 text-helm-700 dark:bg-helm-900 dark:text-helm-300'
      }`}>
        {done ? '✓' : step}
      </span>
      <div>
        <p className={`text-sm font-medium ${done ? 'line-through' : ''}`}>{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );

  return link && !done ? <NavLink to={link}>{content}</NavLink> : content;
}
