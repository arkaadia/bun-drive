/**
 * Bun-Drive Desktop Server
 * Hosts backend services for Windows Identity, Active Directory discovery,
 * file system browsing, and serves the UI over port 3000.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createBunDriveApp } from './src/core/serverApp.js';
import { shellIntegrationService } from './src/core/shellIntegration.js';
import { shareChangeMonitor } from './src/core/shareChangeMonitor.js';
import { logger } from './src/core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createBunDriveApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Initialize Phase 2 Shell Namespace Integration & Virtual Mounts
  shellIntegrationService.initialize().catch((err) => {
    logger.warn('Server', 'Background shell integration init warning', err);
  });

  // Initialize Phase 5 Automatic Share Change Monitor
  shareChangeMonitor.start();

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
