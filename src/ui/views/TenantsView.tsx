import { useState } from 'react';
import { Plus, Trash2, RefreshCw, Loader2, CheckCircle, XCircle, HardDrive } from 'lucide-react';
import { useTenantsStore } from '@/lib/tenants-store';
import { useHelmStore } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { testConnection, clearTokenCache } from '@/lib/graph-client';
import type { TenantConnection, HealthStatus } from '@/types/tenants';
import { toast } from 'sonner';

export function TenantsView() {
  const { connections, removeConnection } = useTenantsStore();
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-muted-foreground">
            {connections.length} tenant{connections.length !== 1 ? 's' : ''} connected
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 bg-helm-600 text-white px-4 py-2 rounded-lg hover:bg-helm-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Connect Tenant
        </button>
      </div>

      {/* Setup guide for first tenant */}
      {connections.length === 0 && !showWizard && (
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="font-semibold">Connect your first M365 tenant</h2>
          <div className="text-sm text-muted-foreground space-y-3">
            <p>Before connecting, you'll need an Azure AD app registration:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Go to <strong>Entra ID &gt; App registrations &gt; New registration</strong></li>
              <li>Name it "Helm365" — set to <strong>Single tenant</strong> (or Multitenant for MSP/GDAP)</li>
              <li>Add the <strong>API permissions</strong> below (all <strong>Application</strong> type, not Delegated)</li>
              <li>Click <strong>Grant admin consent</strong></li>
              <li>Go to <strong>Certificates &amp; Secrets</strong> → create a <strong>client secret</strong></li>
              <li>Copy: <strong>Application (client) ID</strong>, <strong>Directory (tenant) ID</strong>, and <strong>client secret value</strong></li>
            </ol>
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-foreground">Required API Permissions (30)</summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5 text-xs font-mono">
                <div className="font-sans font-medium text-foreground mt-2 col-span-full">Identity &amp; Directory</div>
                <span>User.Read.All</span>
                <span>User.ReadWrite.All</span>
                <span>UserAuthenticationMethod.ReadWrite.All</span>
                <span>Group.Read.All</span>
                <span>GroupMember.ReadWrite.All</span>
                <span>Directory.Read.All</span>
                <span>Organization.Read.All</span>

                <div className="font-sans font-medium text-foreground mt-2 col-span-full">Mail &amp; Exchange</div>
                <span>Mail.Read</span>
                <span>Mail.ReadWrite</span>
                <span>MailboxSettings.Read</span>
                <span>MailboxSettings.ReadWrite</span>

                <div className="font-sans font-medium text-foreground mt-2 col-span-full">Security &amp; Compliance</div>
                <span>Policy.Read.All</span>
                <span>Policy.ReadWrite.ConditionalAccess</span>
                <span>SecurityEvents.Read.All</span>
                <span>SecurityAlert.Read.All</span>
                <span>AuditLog.Read.All</span>
                <span>IdentityRiskyUser.Read.All</span>
                <span>IdentityRiskyUser.ReadWrite.All</span>
                <span>DelegatedPermissionGrant.ReadWrite.All</span>
                <span>Reports.Read.All</span>

                <div className="font-sans font-medium text-foreground mt-2 col-span-full">Email Security</div>
                <span>ThreatSubmission.Read.All</span>
                <span>ThreatSubmission.ReadWrite.All</span>
                <span>ThreatPolicy.ReadWrite.All</span>

                <div className="font-sans font-medium text-foreground mt-2 col-span-full">Device Management (Intune)</div>
                <span>DeviceManagementManagedDevices.Read.All</span>
                <span>DeviceManagementManagedDevices.ReadWrite.All</span>
                <span>DeviceManagementManagedDevices.PrivilegedOperations.All</span>
                <span>DeviceManagementConfiguration.Read.All</span>
                <span>DeviceManagementConfiguration.ReadWrite.All</span>
                <span>DeviceManagementApps.Read.All</span>
                <span>DeviceManagementApps.ReadWrite.All</span>
              </div>
            </details>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowWizard(true)}
              className="bg-helm-600 text-white px-4 py-2 rounded-lg hover:bg-helm-700 text-sm font-medium"
            >
              I have my credentials — Connect now
            </button>
            <details className="text-xs">
              <summary className="cursor-pointer text-helm-600 hover:text-helm-700 font-medium py-2">
                Automate with Azure CLI
              </summary>
              <div className="mt-2 bg-muted rounded-lg p-3 font-mono text-[11px] space-y-1">
                <p className="font-sans text-muted-foreground">Run this in your terminal (requires <code>az login</code> first):</p>
                <pre className="overflow-x-auto whitespace-pre">
{`# Single tenant:
./scripts/register-app.sh

# MSP / Multi-tenant:
./scripts/register-app.sh --multi-tenant`}
                </pre>
                <p className="font-sans text-muted-foreground">Creates app registration with all 30 permissions, grants admin consent, and outputs the credentials.</p>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Connection wizard */}
      {showWizard && (
        <ConnectionWizard onClose={() => setShowWizard(false)} />
      )}

      {/* Tenant list */}
      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <TenantCard key={conn.id} connection={conn} onRemove={() => void removeConnection(conn.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionWizard({ onClose }: { onClose: () => void }) {
  const { addConnection } = useTenantsStore();
  const { setActiveTenant } = useHelmStore();
  const { teamId } = useAuth();
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    tenantName?: string;
    tenantDomain?: string;
    error?: string;
  } | null>(null);

  const handleTest = async () => {
    if (!tenantId || !clientId || !clientSecret) {
      toast.error('All three fields are required');
      return;
    }

    setTesting(true);
    setTestResult(null);

    // Clear any cached token so we get a fresh one with current permissions
    clearTokenCache(tenantId, clientId);

    const result = await testConnection({ tenantId, clientId, clientSecret });
    setTestResult(result);
    setTesting(false);

    if (result.success) {
      toast.success(`Connected to ${result.tenantName}`);
    } else {
      toast.error(`Connection failed: ${result.error}`);
    }
  };

  const handleSave = async () => {
    if (!testResult?.success || !teamId) return;

    // Save to Supabase
    const connection = await addConnection(teamId, {
      tenantId,
      tenantName: testResult.tenantName ?? 'Unknown',
      tenantDomain: testResult.tenantDomain ?? `${tenantId}.onmicrosoft.com`,
      clientId,
      clientSecret,
    });

    if (connection) {
      setActiveTenant(connection.id, connection.tenantName);
      toast.success(`${connection.tenantName} saved and set as active tenant`);
    } else {
      toast.error('Failed to save tenant connection');
    }
    onClose();
  };

  return (
    <div className="border rounded-lg p-6 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Connect M365 Tenant</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Tenant ID (Directory ID)</label>
          <input
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-helm-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Application (Client) ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-helm-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Paste your client secret value"
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-helm-500"
          />
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
          testResult.success
            ? 'bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-300'
            : 'bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-300'
        }`}>
          {testResult.success ? (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div>
            {testResult.success ? (
              <>
                <p className="font-medium">Connected to {testResult.tenantName}</p>
                <p className="text-xs opacity-80">{testResult.tenantDomain}</p>
              </>
            ) : (
              <p>{testResult.error}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void handleTest()}
          disabled={testing || !tenantId || !clientId || !clientSecret}
          className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-lg hover:bg-muted/80 text-sm disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        {testResult?.success && (
          <button
            onClick={() => void handleSave()}
            className="flex items-center gap-2 bg-helm-600 text-white px-4 py-2 rounded-lg hover:bg-helm-700 text-sm font-medium"
          >
            <CheckCircle className="h-4 w-4" /> Save & Activate
          </button>
        )}
      </div>
    </div>
  );
}

function TenantCard({ connection, onRemove }: { connection: TenantConnection; onRemove: () => void }) {
  const { activeTenantId, setActiveTenant } = useHelmStore();
  const isActive = activeTenantId === connection.id;

  const healthStyles: Record<HealthStatus, { bg: string; text: string; label: string }> = {
    healthy: { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400', label: 'Healthy' },
    degraded: { bg: 'bg-amber-100 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', label: 'Degraded' },
    error: { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', label: 'Error' },
    unknown: { bg: 'bg-gray-100 dark:bg-gray-900/20', text: 'text-gray-700 dark:text-gray-400', label: 'Unknown' },
  };

  const health = healthStyles[connection.healthStatus];

  return (
    <div className={`border rounded-lg p-4 transition-colors ${isActive ? 'border-helm-500 bg-helm-50/50 dark:bg-helm-950/10' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{connection.tenantName}</span>
              {isActive && (
                <span className="text-[10px] bg-helm-100 text-helm-700 dark:bg-helm-900/30 dark:text-helm-300 px-1.5 py-0.5 rounded font-medium">
                  Active
                </span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${health.bg} ${health.text}`}>
                {health.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{connection.tenantDomain}</span>
              <span className="opacity-50">|</span>
              <span>{connection.authMethod}</span>
              {connection.lastHealthCheck && (
                <>
                  <span className="opacity-50">|</span>
                  <span>Checked {new Date(connection.lastHealthCheck).toLocaleString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isActive && (
            <button
              onClick={() => setActiveTenant(connection.id, connection.tenantName)}
              className="text-xs text-helm-600 hover:text-helm-700 font-medium px-3 py-1.5 rounded hover:bg-helm-50"
            >
              Set Active
            </button>
          )}
          <button
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20"
            title="Remove tenant"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
