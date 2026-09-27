import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In local development, serve the /api/*.js handlers the same way Vercel does in production.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url.match(/^\/api\/([a-z-]+)(\?|$)/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          await mod.default(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'ERROR', error: String(e.message || e) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
});
