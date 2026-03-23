import { create } from 'zustand';
import type { TenantConnection, TenantGroup } from '@/types/tenants';
import { dbGetTenantConnections, dbAddTenantConnection, dbRemoveTenantConnection, dbGetTenantCredentials } from './db';

interface TenantsState {
  connections: TenantConnection[];
  groups: TenantGroup[];
  loaded: boolean;

  loadFromDb: (teamId: string) => Promise<void>;
  addConnection: (teamId: string, conn: {
    tenantId: string;
    tenantName: string;
    tenantDomain: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<TenantConnection | null>;
  removeConnection: (id: string) => Promise<void>;
  getConnection: (id: string) => TenantConnection | undefined;
  getCredentials: (id: string) => Promise<{ tenantId: string; clientId: string; clientSecret: string } | null>;
}

export const useTenantsStore = create<TenantsState>((set, get) => ({
  connections: [],
  groups: [],
  loaded: false,

  loadFromDb: async (teamId) => {
    const rows = await dbGetTenantConnections(teamId);
    const connections: TenantConnection[] = rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      teamId: r.team_id as string,
      tenantId: r.tenant_id as string,
      tenantName: r.tenant_name as string,
      tenantDomain: r.tenant_domain as string,
      clientId: r.client_id as string,
      authMethod: (r.auth_method as TenantConnection['authMethod']) ?? 'client_credentials',
      healthStatus: (r.health_status as TenantConnection['healthStatus']) ?? 'unknown',
      lastHealthCheck: r.last_health_check as string | null,
      createdAt: r.created_at as string,
    }));
    set({ connections, loaded: true });
  },

  addConnection: async (teamId, conn) => {
    const row = await dbAddTenantConnection(teamId, conn);
    if (!row) return null;

    const connection: TenantConnection = {
      id: row.id,
      teamId: row.team_id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantDomain: row.tenant_domain,
      clientId: row.client_id,
      authMethod: row.auth_method ?? 'client_credentials',
      healthStatus: row.health_status ?? 'healthy',
      lastHealthCheck: row.last_health_check,
      createdAt: row.created_at,
    };

    set((state) => ({ connections: [...state.connections, connection] }));
    return connection;
  },

  removeConnection: async (id) => {
    await dbRemoveTenantConnection(id);
    set((state) => ({ connections: state.connections.filter((c) => c.id !== id) }));
  },

  getConnection: (id) => get().connections.find((c) => c.id === id),

  getCredentials: async (id) => {
    return dbGetTenantCredentials(id);
  },
}));
