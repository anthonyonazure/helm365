/**
 * Microsoft Graph API client.
 * Handles token acquisition, request building, retry with backoff on throttle (429).
 * No SDK dependency — raw fetch against REST endpoints.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token';

export interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface GraphToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp
}

// Token cache per tenant
const tokenCache = new Map<string, GraphToken>();

/**
 * Get an access token for a tenant using client credentials flow.
 * Caches tokens and refreshes 5 minutes before expiry.
 */
export async function getAccessToken(creds: GraphCredentials): Promise<string> {
  const cacheKey = `${creds.tenantId}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid (with 5-min buffer)
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) {
    return cached.accessToken;
  }

  const tokenUrl = TOKEN_URL.replace('{tenantId}', creds.tenantId);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token acquisition failed (${res.status}): ${err}`);
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

  const fetchOptions: RequestInit = { method, headers };
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  // Retry up to 3 times on throttle (429)
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

    // 204 No Content (e.g., DELETE responses)
    if (res.status === 204) {
      return { ok: true, status: 204, data: null };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  }

  return { ok: false, status: 429, data: null, error: 'Throttled after 3 retries' };
}

/**
 * Test connection to a tenant — verifies credentials work.
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

/**
 * Clear cached token for a tenant (e.g., when credentials change).
 */
export function clearTokenCache(tenantId: string, clientId: string) {
  tokenCache.delete(`${tenantId}:${clientId}`);
}
