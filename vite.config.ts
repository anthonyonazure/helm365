import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

/**
 * Dev proxy for Microsoft identity + Graph API calls.
 * Client credentials flow can't run in the browser (CORS + secret exposure).
 * This proxies requests through the Vite dev server.
 */
function msAuthProxy(): Plugin {
  return {
    name: 'ms-auth-proxy',
    configureServer(server) {
      // Proxy token requests
      server.middlewares.use('/api/ms-token', (req, res) => void (async () => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST only' }));
          return;
        }

        let body = '';
        for await (const chunk of req) body += chunk;

        try {
          const params: unknown = JSON.parse(body);
          const field = (key: string): string => {
            const value =
              typeof params === 'object' && params !== null
                ? (params as Record<string, unknown>)[key]
                : undefined;
            if (typeof value !== 'string') throw new Error('Missing ' + key + ' in token request');
            return value;
          };

          const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(field('tenantId'))}/oauth2/v2.0/token`;

          const tokenBody = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: field('clientId'),
            client_secret: field('clientSecret'),
            scope: 'https://graph.microsoft.com/.default',
          });

          const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody.toString(),
          });

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = response.status;
          res.end(await response.text());
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      })());

      // Proxy Graph API requests
      server.middlewares.use('/api/graph', (req, res) => void (async () => {
        const graphPath = req.url?.replace(/^\/api\/graph/, '') ?? '/';
        const graphUrl = `https://graph.microsoft.com/v1.0${graphPath}`;

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          // Forward auth header
          if (req.headers.authorization) {
            headers['Authorization'] = String(req.headers.authorization);
          }
          // Forward ConsistencyLevel
          if (req.headers['consistencylevel']) {
            headers['ConsistencyLevel'] = req.headers['consistencylevel'] as string;
          }

          let body: string | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            body = '';
            for await (const chunk of req) body += chunk;
          }

          const response = await fetch(graphUrl, {
            method: req.method ?? 'GET',
            headers,
            body: body || undefined,
          });

          res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json');
          if (response.headers.get('retry-after')) {
            res.setHeader('Retry-After', response.headers.get('retry-after')!);
          }
          res.statusCode = response.status;
          res.end(await response.text());
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      })());
      // Generic AI provider proxy — forwards requests to any AI API
      server.middlewares.use('/api/ai-proxy', (req, res) => void (async () => {
        const targetUrl = decodeURIComponent(req.url?.slice(1) ?? '');
        if (!targetUrl || !targetUrl.startsWith('http')) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing target URL' }));
          return;
        }

        try {
          // Collect request body
          let body = '';
          if (req.method !== 'GET') {
            for await (const chunk of req) body += chunk;
          }

          // Forward all headers except host/origin (those would confuse the target)
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (key === 'host' || key === 'origin' || key === 'referer' || key === 'connection') continue;
            if (typeof value === 'string') headers[key] = value;
          }

          const response = await fetch(targetUrl, {
            method: req.method ?? 'POST',
            headers,
            body: body || undefined,
          });

          // Forward response headers
          res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json');
          res.statusCode = response.status;

          // Stream the response for SSE support
          if (response.headers.get('content-type')?.includes('text/event-stream')) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const reader = response.body?.getReader();
            if (reader) {
              const pump = async () => {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { res.end(); break; }
                  res.write(value);
                }
              };
              pump().catch(() => res.end());
            } else {
              res.end(await response.text());
            }
          } else {
            res.end(await response.text());
          }
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      })());
    },
  };
}

export default defineConfig({
  plugins: [react(), msAuthProxy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5365,
  },
});
