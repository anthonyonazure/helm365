export type HealthStatus = 'healthy' | 'degraded' | 'error' | 'unknown';
export type AuthMethod = 'client_credentials' | 'gdap' | 'delegated';

export interface TenantConnection {
  id: string;
  teamId: string;
  tenantId: string;
  tenantName: string;
  tenantDomain: string;
  clientId: string;
  authMethod: AuthMethod;
  gdapRelationshipId?: string;
  gdapExpiresAt?: string;
  healthStatus: HealthStatus;
  lastHealthCheck: string | null;
  createdAt: string;
}

export interface TenantGroup {
  id: string;
  teamId: string;
  name: string;
  tenantIds: string[];
  createdAt: string;
}

export interface TenantHealthCheck {
  tenantConnectionId: string;
  tenantName: string;
  healthStatus: HealthStatus;
  responseTimeMs: number;
  tokenValid: boolean;
  graphApiReachable: boolean;
  licenseCount?: number;
  userCount?: number;
  secureScore?: number;
  secureScoreMax?: number;
  checkedAt: string;
}

export interface TenantMemory {
  id: string;
  tenantConnectionId: string;
  type: 'gotcha' | 'preference' | 'incident' | 'pattern';
  content: string;
  sourceActionId: string;
  score: number;
  createdAt: string;
}
