import { useState } from 'react';
import { Check, Eye, EyeOff, Loader2, Zap, Brain, Microscope } from 'lucide-react';
import { useHelmStore } from '@/lib/store';
import { PROVIDER_CONFIGS, type ProviderId } from '@/types/providers';
import { createProvider } from '@/providers';
import { toast } from 'sonner';

export function SettingsView() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your AI provider, processing mode, and integrations.</p>
      </div>

      <AIProviderSection />
      <ProcessingModeSection />
    </div>
  );
}

function AIProviderSection() {
  const { activeProvider, providerKeys, setProvider, setProviderKey } = useHelmStore();
  const [editingProvider, setEditingProvider] = useState<ProviderId | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);

  const handleSaveKey = async (providerId: ProviderId) => {
    if (!keyInput.trim()) return;

    setValidating(true);
    try {
      const provider = createProvider(providerId, keyInput.trim());
      const valid = await provider.validateKey(keyInput.trim());

      if (valid) {
        setProviderKey(providerId, keyInput.trim());
        setProvider(providerId);
        toast.success(`${PROVIDER_CONFIGS.find((p) => p.id === providerId)?.name} connected`);
        setEditingProvider(null);
        setKeyInput('');
      } else {
        toast.error('Invalid API key — please check and try again');
      }
    } catch {
      toast.error('Failed to validate key — check your network connection');
    } finally {
      setValidating(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">AI Provider</h2>
      <p className="text-sm text-muted-foreground">
        Choose your AI provider and add your API key. Helm365 never stores your key on our servers — it stays in your browser.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PROVIDER_CONFIGS.map((config) => {
          const hasKey = !!providerKeys[config.id];
          const isActive = activeProvider === config.id;
          const isEditing = editingProvider === config.id;

          return (
            <div
              key={config.id}
              className={`border rounded-lg p-4 space-y-3 transition-colors ${
                isActive ? 'border-helm-500 bg-helm-50 dark:bg-helm-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{config.name}</span>
                    {hasKey && (
                      <span className="flex items-center gap-1 text-[10px] text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                        <Check className="h-2.5 w-2.5" /> Connected
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[10px] text-helm-600 bg-helm-100 dark:bg-helm-900/30 px-1.5 py-0.5 rounded font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={config.requiresKey ? 'Paste your API key...' : 'http://localhost:11434'}
                        className="w-full text-xs bg-background border rounded px-3 py-2 pr-8 focus:outline-none focus:border-helm-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(config.id)}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveKey(config.id)}
                      disabled={validating || !keyInput.trim()}
                      className="text-xs bg-helm-600 text-white px-3 py-1.5 rounded hover:bg-helm-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {validating ? 'Validating...' : 'Save & Connect'}
                    </button>
                    <button
                      onClick={() => { setEditingProvider(null); setKeyInput(''); }}
                      className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingProvider(config.id); setKeyInput(''); }}
                    className="text-xs text-helm-600 hover:text-helm-700 font-medium"
                  >
                    {hasKey ? 'Update Key' : 'Add API Key'}
                  </button>
                  {hasKey && !isActive && (
                    <button
                      onClick={() => setProvider(config.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Set as Active
                    </button>
                  )}
                </div>
              )}

              {/* Model selector (when active) */}
              {isActive && config.models.length > 0 && (
                <div className="pt-2 border-t">
                  <label className="text-xs text-muted-foreground block mb-1">Default Model</label>
                  <select
                    value={useHelmStore.getState().activeModel ?? config.models[0]?.id}
                    onChange={(e) => setProvider(config.id, e.target.value)}
                    className="text-xs bg-background border rounded px-2 py-1.5 w-full focus:outline-none focus:border-helm-500"
                  >
                    {config.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProcessingModeSection() {
  const { processingMode, setProcessingMode } = useHelmStore();

  const modes = [
    {
      id: 'quick' as const,
      label: 'Quick',
      icon: Zap,
      cost: '~$0.01',
      description: 'Fast model, pattern matching. Best for routine tasks and daily fleet scans.',
      color: 'text-green-600',
    },
    {
      id: 'smart' as const,
      label: 'Smart',
      icon: Brain,
      cost: '~$0.10',
      description: 'Balanced model, selective reasoning. Default for most tasks.',
      color: 'text-helm-600',
    },
    {
      id: 'deep' as const,
      label: 'Deep',
      icon: Microscope,
      cost: '~$1.00',
      description: 'Best model, full reasoning. For compliance audits and incident response.',
      color: 'text-purple-600',
    },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Processing Mode</h2>
      <p className="text-sm text-muted-foreground">
        Controls which AI model tier is used. Higher modes cost more but provide deeper analysis.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isActive = processingMode === mode.id;

          return (
            <button
              key={mode.id}
              onClick={() => setProcessingMode(mode.id)}
              className={`border rounded-lg p-4 text-left space-y-2 transition-colors ${
                isActive ? 'border-helm-500 bg-helm-50 dark:bg-helm-950/20' : 'hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${mode.color}`} />
                  <span className="font-medium text-sm">{mode.label}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{mode.cost}</span>
              </div>
              <p className="text-xs text-muted-foreground">{mode.description}</p>
              {isActive && (
                <span className="inline-flex items-center gap-1 text-[10px] text-helm-600 font-medium">
                  <Check className="h-2.5 w-2.5" /> Active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
