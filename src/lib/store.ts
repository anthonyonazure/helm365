import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderId } from '@/types/providers';
import type { ProcessingMode } from '@/providers/adapter';
import type { Action } from '@/types/gateway';

interface HelmState {
  // AI Provider config
  activeProvider: ProviderId | null;
  activeModel: string | null;
  processingMode: ProcessingMode;
  providerKeys: Partial<Record<ProviderId, string>>; // Stored locally until Supabase Vault is set up

  // Tenant context
  activeTenantId: string | null;
  activeTenantName: string | null;

  // Action feed
  actions: Action[];
  pendingCount: number;

  // Command bar
  isCommandBarFocused: boolean;
  isProcessing: boolean;
  lastCommand: string | null;
  lastResponse: string | null;

  // Actions
  setProvider: (provider: ProviderId, model?: string) => void;
  setProviderKey: (provider: ProviderId, key: string) => void;
  setProcessingMode: (mode: ProcessingMode) => void;
  setActiveTenant: (id: string | null, name: string | null) => void;
  addAction: (action: Action) => void;
  updateAction: (id: string, updates: Partial<Action>) => void;
  setCommandBarFocused: (focused: boolean) => void;
  setProcessing: (processing: boolean) => void;
  setLastCommand: (command: string, response: string) => void;
}

export const useHelmStore = create<HelmState>()(
  persist(
    (set) => ({
      // Defaults
      activeProvider: null,
      activeModel: null,
      processingMode: 'smart',
      providerKeys: {},
      activeTenantId: null,
      activeTenantName: null,
      actions: [],
      pendingCount: 0,
      isCommandBarFocused: false,
      isProcessing: false,
      lastCommand: null,
      lastResponse: null,

      setProvider: (provider, model) =>
        set({ activeProvider: provider, activeModel: model ?? null }),

      setProviderKey: (provider, key) =>
        set((state) => ({
          providerKeys: { ...state.providerKeys, [provider]: key },
        })),

      setProcessingMode: (mode) => set({ processingMode: mode }),

      setActiveTenant: (id, name) =>
        set({ activeTenantId: id, activeTenantName: name }),

      addAction: (action) =>
        set((state) => ({
          actions: [action, ...state.actions].slice(0, 500),
          pendingCount:
            action.status === 'pending'
              ? state.pendingCount + 1
              : state.pendingCount,
        })),

      updateAction: (id, updates) =>
        set((state) => ({
          actions: state.actions.map((a) =>
            a.id === id ? { ...a, ...updates } : a,
          ),
          pendingCount:
            updates.status && updates.status !== 'pending'
              ? Math.max(0, state.pendingCount - 1)
              : state.pendingCount,
        })),

      setCommandBarFocused: (focused) => set({ isCommandBarFocused: focused }),
      setProcessing: (processing) => set({ isProcessing: processing }),
      setLastCommand: (command, response) =>
        set({ lastCommand: command, lastResponse: response }),
    }),
    {
      name: 'helm365-store',
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        activeModel: state.activeModel,
        processingMode: state.processingMode,
        providerKeys: state.providerKeys,
        activeTenantId: state.activeTenantId,
        activeTenantName: state.activeTenantName,
      }),
    },
  ),
);
