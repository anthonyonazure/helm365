import { Ship, Shield, Users, HardDrive, AlertTriangle, CheckCircle } from 'lucide-react';

export function DashboardView() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Welcome / Session Awareness */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">
          Here's what needs your attention across your tenants.
        </p>
      </div>

      {/* Alerts Banner */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">No tenants connected yet</p>
          <p className="text-sm text-muted-foreground">
            Connect your first M365 tenant to start managing it with voice commands.
          </p>
          <a href="/tenants" className="text-sm text-helm-600 hover:text-helm-700 font-medium">
            Connect a tenant →
          </a>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={HardDrive}
          label="Tenants"
          value="0"
          subtext="connected"
        />
        <StatCard
          icon={Shield}
          label="Avg Secure Score"
          value="—"
          subtext="across tenants"
        />
        <StatCard
          icon={Users}
          label="Total Users"
          value="0"
          subtext="managed"
        />
        <StatCard
          icon={CheckCircle}
          label="Actions Today"
          value="0"
          subtext="executed"
        />
      </div>

      {/* Getting Started */}
      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Ship className="h-5 w-5 text-helm-500" />
          <h2 className="text-lg font-semibold">Get Started with Helm365</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StepCard
            step={1}
            title="Connect a Tenant"
            description="Add your M365 tenant with app registration or GDAP credentials."
            done={false}
          />
          <StepCard
            step={2}
            title="Configure AI Provider"
            description="Choose your AI provider (Claude, GPT, Gemini, etc.) and add your API key."
            done={false}
          />
          <StepCard
            step={3}
            title="Try a Command"
            description='Say or type: "Show me users without MFA" to see Helm365 in action.'
            done={false}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div>
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-sm text-muted-foreground ml-2">{subtext}</span>
      </div>
    </div>
  );
}

function StepCard({ step, title, description, done }: {
  step: number;
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <div className={`border rounded-lg p-4 space-y-2 ${done ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
          done
            ? 'bg-green-500 text-white'
            : 'bg-helm-100 text-helm-700 dark:bg-helm-900 dark:text-helm-300'
        }`}>
          {done ? '✓' : step}
        </span>
        <h3 className="font-medium text-sm">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
