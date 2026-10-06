/**
 * Bun-Drive Server Application Factory
 * Configures all Express API routes for Windows Identity, Active Directory discovery,
 * file system browsing, Explorer Shell integration, Group Policy refresh, and monitoring.
 */

import express, { Express, Request, Response } from 'express';
import { identityService } from './identity.js';
import { discoveryService } from './discovery.js';
import { fileSystemService } from './fileSystem.js';
import { ShellExtensionRegistry } from './shellExtensionRegistry.js';
import { shellIntegrationService } from './shellIntegration.js';
import { groupPolicyService } from './groupPolicy.js';
import { shareChangeMonitor } from './shareChangeMonitor.js';
import { logger } from './logger.js';

export function createBunDriveApp(): Express {
  const app = express();
  app.use(express.json());

  // Request logger
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      logger.info('API', `${req.method} ${req.path}`);
    }
    next();
  });

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      application: 'Bun-Drive',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Local-only Graceful Shutdown Endpoint (used during upgrade/uninstall)
  app.post('/api/shutdown', (req: Request, res: Response) => {
    const remoteIp = req.socket.remoteAddress || '';
    const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1' || remoteIp === 'localhost';
    if (!isLocal) {
      res.status(403).json({ error: 'Shutdown endpoint is restricted to localhost.' });
      return;
    }
    res.json({ message: 'Bun-Drive shutting down gracefully...' });
    logger.info('Server', 'Shutdown signal received from local caller');
    setTimeout(() => {
      process.exit(0);
    }, 500);
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
      const shellStatus = await shellIntegrationService.getStatus();
      const mappedByUnc = new Map(shellStatus.mappedDrives.map(d => [d.uncPath.toLowerCase(), d.driveLetter]));
      for (const share of result.shares) {
        share.mappedDrive = mappedByUnc.get(share.uncPath.toLowerCase()) || null;
      }
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
      await shellIntegrationService.syncSharesToVirtualFolder(result.shares);
      const shellStatus = await shellIntegrationService.getStatus();
      const mappedByUnc = new Map(shellStatus.mappedDrives.map(d => [d.uncPath.toLowerCase(), d.driveLetter]));
      for (const share of result.shares) {
        share.mappedDrive = mappedByUnc.get(share.uncPath.toLowerCase()) || null;
      }
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Shares', 'Error refreshing shares', err);
      res.status(500).json({ error: message });
    }
  });

  // 3b. Group Policy Refresh & Share Synchronization Endpoints (Phase 4)
  app.post('/api/group-policy/refresh', async (req: Request, res: Response) => {
    try {
      logger.info('API:GroupPolicy', 'Group Policy update requested by user');
      const options = req.body || {};
      const result = await groupPolicyService.refreshGroupPolicy(options);
      if (!result.success) {
        res.status(502).json({
          ...result,
          error: result.message,
          canFallbackRediscover: true
        });
        return;
      }
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:GroupPolicy', 'Error executing Group Policy refresh', err);
      res.status(409).json({ error: message, isUpdating: groupPolicyService.isOperationInProgress() });
    }
  });

  app.get('/api/group-policy/status', (req: Request, res: Response) => {
    try {
      const status = groupPolicyService.getStatus();
      res.json(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/group-policy/gpupdate-only', async (req: Request, res: Response) => {
    try {
      const result = await groupPolicyService.executeGpupdateOnly(req.body || {});
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/group-policy/fallback-rediscover', async (req: Request, res: Response) => {
    try {
      const result = await groupPolicyService.rediscoverWithoutGpupdate();
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // 3c. Phase 5 Automatic Share Change Monitor Endpoints
  app.get('/api/monitor/status', (req: Request, res: Response) => {
    try {
      res.json(shareChangeMonitor.getStatus());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/monitor/config', (req: Request, res: Response) => {
    try {
      const updated = shareChangeMonitor.setConfig(req.body);
      res.json({ config: updated, status: shareChangeMonitor.getStatus() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/monitor/check-now', async (req: Request, res: Response) => {
    try {
      const result = await shareChangeMonitor.checkNow('manual');
      res.json({ ...result, status: shareChangeMonitor.getStatus() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // 4. Browse UNC Path or Share Subfolder
  app.get('/api/browse', async (req: Request, res: Response) => {
    try {
      const targetPath = req.query.path as string;
      if (!targetPath || typeof targetPath !== 'string') {
        res.status(400).json({ error: 'Missing path query parameter' });
        return;
      }
      if (/[<>"|`*;\r\n]/.test(targetPath)) {
        res.status(400).json({ error: 'Path contains invalid or forbidden characters' });
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

  // 4b. Retrieve Real Windows Properties for UNC Path / Share / Folder / File
  app.get('/api/properties', async (req: Request, res: Response) => {
    try {
      const targetPath = req.query.path as string;
      if (!targetPath || typeof targetPath !== 'string') {
        res.status(400).json({ error: 'Missing path query parameter' });
        return;
      }
      if (/[<>"|`*;\r\n]/.test(targetPath)) {
        res.status(400).json({ error: 'Path contains invalid or forbidden characters' });
        return;
      }
      const shellStatus = await shellIntegrationService.getStatus();
      const mapped = shellStatus.mappedDrives.find(d => d.uncPath.toLowerCase() === targetPath.toLowerCase());
      const properties = await fileSystemService.getProperties(targetPath, mapped?.driveLetter);
      res.json(properties);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Properties', 'Error retrieving properties', err);
      res.status(500).json({ error: message });
    }
  });

  // 5. Open in Native Windows File Explorer
  app.post('/api/open-in-explorer', async (req: Request, res: Response) => {
    try {
      const { path: targetPath } = req.body;
      if (!targetPath || typeof targetPath !== 'string') {
        res.status(400).json({ error: 'Missing path in request body' });
        return;
      }
      if (/[<>"|`*;\r\n]/.test(targetPath)) {
        res.status(400).json({ error: 'Path contains invalid or forbidden characters' });
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

  // 6. Windows Shell Namespace Extension Blueprint & Phase 2 Live Integration Endpoints
  app.get('/api/shell/blueprint', (req: Request, res: Response) => {
    try {
      const blueprint = ShellExtensionRegistry.getBlueprint();
      const regFile = ShellExtensionRegistry.generateRegistryFile();
      const unregisterRegFile = ShellExtensionRegistry.generateUnregisterRegistryFile();
      res.json({ blueprint, regFile, unregisterRegFile });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/shell/status', async (req: Request, res: Response) => {
    try {
      const status = await shellIntegrationService.getStatus();
      res.json(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shell/register', async (req: Request, res: Response) => {
    try {
      const discovery = await discoveryService.getShares(false);
      const status = await shellIntegrationService.registerInExplorer(discovery.shares);
      res.json(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Shell', 'Failed to register shell extension', err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shell/unregister', async (req: Request, res: Response) => {
    try {
      const status = await shellIntegrationService.unregisterFromExplorer();
      res.json(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Shell', 'Failed to unregister shell extension', err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shell/sync', async (req: Request, res: Response) => {
    try {
      const discovery = await discoveryService.getShares(false);
      const syncResult = await shellIntegrationService.syncSharesToVirtualFolder(discovery.shares);
      const status = await shellIntegrationService.getStatus();
      res.json({ syncResult, status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Shell', 'Failed to sync virtual folder', err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shell/autosync', (req: Request, res: Response) => {
    try {
      const { enabled, intervalSeconds } = req.body;
      const status = shellIntegrationService.setAutoSync(Boolean(enabled), Number(intervalSeconds) || 60);
      res.json(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shell/map-drive', async (req: Request, res: Response) => {
    try {
      const { driveLetter, uncPath, persistent = true, replaceExisting = false } = req.body;
      if (!driveLetter || !uncPath) {
        res.status(400).json({ error: 'driveLetter and uncPath are required' });
        return;
      }
      const mapped = await shellIntegrationService.mapDriveLetter(
        driveLetter,
        uncPath,
        Boolean(persistent),
        Boolean(replaceExisting)
      );
      const status = await shellIntegrationService.getStatus();
      res.json({ mapped, status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const conflictData = (err as unknown as { isConflict?: boolean; conflictData?: unknown }).conflictData;
      if (conflictData) {
        logger.warn('API:Shell', `Drive mapping conflict detected on ${req.body.driveLetter}`);
        res.status(409).json({ error: message, isConflict: true, conflict: conflictData });
        return;
      }
      logger.error('API:Shell', 'Failed to map network drive', err);
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/shell/drive-letters', async (req: Request, res: Response) => {
    try {
      const letters = shellIntegrationService.getAvailableDriveLetters();
      res.json({ letters });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shell/unmap-drive', async (req: Request, res: Response) => {
    try {
      const { driveLetter } = req.body;
      if (!driveLetter) {
        res.status(400).json({ error: 'driveLetter is required' });
        return;
      }
      await shellIntegrationService.unmapDriveLetter(driveLetter);
      const status = await shellIntegrationService.getStatus();
      res.json({ status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('API:Shell', 'Failed to unmap network drive', err);
      res.status(400).json({ error: message });
    }
  });

  // 7. Probe Specific Server
  app.post('/api/test-server', async (req: Request, res: Response) => {
    try {
      const { server } = req.body;
      if (!server || typeof server !== 'string' || !/^[a-zA-Z0-9.\-_]+$/.test(server)) {
        res.status(400).json({ error: 'Valid server name required (alphanumeric, dot, dash, underscore)' });
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

  return app;
}
