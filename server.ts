/**
 * Bun-Drive Desktop Server
 * Hosts backend services for Windows Identity, Active Directory discovery,
 * file system browsing, and serves the UI over port 3000.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { identityService } from './src/core/identity.js';
import { discoveryService } from './src/core/discovery.js';
import { fileSystemService } from './src/core/fileSystem.js';
import { ShellExtensionRegistry } from './src/core/shellExtensionRegistry.js';
import { logger } from './src/core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Log requests
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      logger.info('API', `${req.method} ${req.path}`);
    }
    next();
  });

  // 1. Windows Identity Endpoint
  app.get('/api/identity', async (req: Request, res: Response) => {
    try {
      const force = req.query.force === 'true';
      if (force) {
        identityService.invalidateCache();
      }
      const identity = await identityService.getCurrentIdentity(force);
      res.json(identity);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Identity', 'Error getting identity', err);
      res.status(500).json({ error: message });
    }
  });

  // 2. Discover Network Shares Endpoint
  app.get('/api/shares', async (req: Request, res: Response) => {
    try {
      const result = await discoveryService.getShares(false);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Shares', 'Error retrieving shares', err);
      res.status(500).json({ error: message });
    }
  });

  // 3. Force Active Refresh of Shares Endpoint
  app.post('/api/shares/refresh', async (req: Request, res: Response) => {
    try {
      logger.info('API:Shares', 'Manual refresh triggered');
      identityService.invalidateCache();
      const result = await discoveryService.discoverShares();
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Shares', 'Error refreshing shares', err);
      res.status(500).json({ error: message });
    }
  });

  // 4. Browse UNC Path or Share Subfolder
  app.get('/api/browse', async (req: Request, res: Response) => {
    try {
      const targetPath = req.query.path as string;
      if (!targetPath) {
        res.status(400).json({ error: 'Missing path query parameter' });
        return;
      }
      const browseResult = await fileSystemService.browsePath(targetPath);
      res.json(browseResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Browse', 'Error browsing path', err);
      res.status(500).json({ error: message });
    }
  });

  // 5. Open in Native Windows File Explorer
  app.post('/api/open-in-explorer', async (req: Request, res: Response) => {
    try {
      const { path: targetPath } = req.body;
      if (!targetPath) {
        res.status(400).json({ error: 'Missing path in request body' });
        return;
      }
      const success = await fileSystemService.openInExplorer(targetPath);
      res.json({ success, path: targetPath });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Explorer', 'Failed to open explorer', err);
      res.status(500).json({ error: message });
    }
  });

  // 6. Windows Shell Namespace Extension Blueprint
  app.get('/api/shell/blueprint', (req: Request, res: Response) => {
    try {
      const blueprint = ShellExtensionRegistry.getBlueprint();
      const regFile = ShellExtensionRegistry.generateRegistryFile();
      res.json({ blueprint, regFile });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // 7. Probe Specific Server
  app.post('/api/test-server', async (req: Request, res: Response) => {
    try {
      const { server } = req.body;
      if (!server) {
        res.status(400).json({ error: 'Server name required' });
        return;
      }
      const shares = await discoveryService.probeServer(server);
      res.json({ server, shares });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // 8. Diagnostics and Audit Logs
  app.get('/api/logs', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    res.json({ logs: logger.getLogs(limit) });
  });

  // Static/Vite Setup
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info('Server', `Bun-Drive Service running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting Bun-Drive server:', err);
  process.exit(1);
});
