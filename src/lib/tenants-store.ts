import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TenantConnection, TenantGroup } from '@/types/tenants';

interface TenantsState {
  connections: TenantConnection[];
  groups: TenantGroup[];

  addConnection: (conn: TenantConnection) => void;
  updateConnection: (id: string, updates: Partial<TenantConnection>) => void;
  removeConnection: (id: string) => void;
  getConnection: (id: string) => TenantConnection | undefined;

  addGroup: (group: TenantGroup) => void;
  removeGroup: (id: string) => void;
}

export const useTenantsStore = create<TenantsState>()(
  persist(
    (set, get) => ({
      connections: [],
      groups: [],

      addConnection: (conn) =>
        set((state) => ({
          connections: [...state.connections, conn],
        })),

      updateConnection: (id, updates) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
        })),

      getConnection: (id) => get().connections.find((c) => c.id === id),

      addGroup: (group) =>
        set((state) => ({ groups: [...state.groups, group] })),

      removeGroup: (id) =>
        set((state) => ({ groups: state.groups.filter((g) => g.id !== id) })),
    }),
    {
      name: 'helm365-tenants',
    },
  ),
);
