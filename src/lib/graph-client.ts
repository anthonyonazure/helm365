/**
 * Microsoft Graph API client.
 * In dev, routes through Vite proxy (/api/ms-token and /api/graph) to avoid CORS.
 * In production, routes through Supabase Edge Functions.
 */

const isDev = typeof window !== 'undefined' && window.location?.hostname === 'localhost';

// In dev: proxy through Vite. In prod: direct (via Edge Function).
const GRAPH_BASE = isDev ? '/api/graph' : 'https://graph.microsoft.com/v1.0';
const TOKEN_ENDPOINT = isDev ? '/api/ms-token' : null; // Prod uses Edge Function

export interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface GraphToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, GraphToken>();

/**
 * Get an access token via the dev proxy (avoids CORS on login.microsoftonline.com).
 */
export async function getAccessToken(creds: GraphCredentials): Promise<string> {
  const cacheKey = `${creds.tenantId}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) {
    return cached.accessToken;
  }

  if (!TOKEN_ENDPOINT) {
    throw new Error('Token acquisition not available in this environment');
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: creds.tenantId,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    let errorMessage = `Token acquisition failed (${res.status})`;
    try {
      const errorJson = JSON.parse(err);
      errorMessage = errorJson.error_description ?? errorJson.error ?? errorMessage;
    } catch {
      errorMessage = err || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const data = await res.json();

  const token: GraphToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  tokenCache.set(cacheKey, token);
  return token.accessToken;
}

/**
 * Make a Graph API request with automatic retry on throttle.
 * In dev, requests go through /api/graph Vite proxy.
 */
export async function graphFetch(
  creds: GraphCredentials,
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {},
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const { method = 'GET', body, params } = options;

  const token = await getAccessToken(creds);

  let url = `${GRAPH_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Forward ConsistencyLevel if present in params
  if (params?.['ConsistencyLevel']) {
    headers['ConsistencyLevel'] = params['ConsistencyLevel'];
  }

  const fetchOptions: RequestInit = { method, headers };
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, fetchOptions);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '10', 10);
      console.warn(`[Graph] Throttled on ${endpoint}, retrying in ${retryAfter}s (attempt ${attempt + 1}/3)`);
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = `Graph API error ${res.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message ?? errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      return { ok: false, status: res.status, data: null, error: errorMessage };
    }

    if (res.status === 204) {
      return { ok: true, status: 204, data: null };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  }

  return { ok: false, status: 429, data: null, error: 'Throttled after 3 retries' };
}

/**
 * Test connection to a tenant.
 */
export async function testConnection(creds: GraphCredentials): Promise<{
  success: boolean;
  tenantName?: string;
  tenantDomain?: string;
  error?: string;
}> {
  try {
    const result = await graphFetch(creds, '/organization', {
      params: { '$select': 'displayName,verifiedDomains' },
    });

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    const org = (result.data as { value: Array<{
      displayName: string;
      verifiedDomains: Array<{ name: string; isDefault: boolean }>;
    }> }).value?.[0];

    const defaultDomain = org?.verifiedDomains?.find((d) => d.isDefault)?.name;

    return {
      success: true,
      tenantName: org?.displayName,
      tenantDomain: defaultDomain,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clearTokenCache(tenantId: string, clientId: string) {
  tokenCache.delete(`${tenantId}:${clientId}`);
}
