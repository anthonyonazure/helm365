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
      server.middlewares.use('/api/ms-token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST only' }));
          return;
        }

        let body = '';
        for await (const chunk of req) body += chunk;

        try {
          const params = JSON.parse(body);
          const tokenUrl = `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/token`;

          const tokenBody = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: params.clientId,
            client_secret: params.clientSecret,
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
        } catch (err: any) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // Proxy Graph API requests
      server.middlewares.use('/api/graph', async (req, res) => {
        const graphPath = req.url?.replace(/^\/api\/graph/, '') ?? '/';
        const graphUrl = `https://graph.microsoft.com/v1.0${graphPath}`;

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          // Forward auth header
          if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization as string;
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
        } catch (err: any) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
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
