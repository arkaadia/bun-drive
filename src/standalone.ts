/**
 * Bun-Drive Standalone Executable Entry Point
 * Designed for compiled standalone execution on Windows (Bun-Drive.exe).
 * Provides CLI actions (--install-shell, --uninstall-shell, --status, --background)
 * and hosts the full application without requiring Node.js, npm, or dev tools.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { exec } from 'child_process';
import { createBunDriveApp } from './core/serverApp.js';
import { shellIntegrationService } from './core/shellIntegration.js';
import { shareChangeMonitor } from './core/shareChangeMonitor.js';
import { discoveryService } from './core/discovery.js';
import { logger } from './core/logger.js';

export const APPLICATION_VERSION = '1.0.0';

/**
 * Open the user's default web browser to the application URL
 */
export function openBrowser(url: string): void {
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`, { windowsHide: true }, (err) => {
      if (err) logger.warn('Browser', `Failed to open browser: ${err.message}`);
    });
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`, () => {});
  } else {
    exec(`xdg-open "${url}"`, () => {});
  }
}

/**
 * Check whether an instance of Bun-Drive is already running on the given port
 */
export async function isAlreadyRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.application === 'Bun-Drive');
        } catch {
          resolve(res.statusCode === 200);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Locate the application installation directory containing dist/ and scripts/
 */
export function resolveApplicationDir(): string {
  const execDir = path.dirname(process.execPath || process.argv[1]);
  if (fs.existsSync(path.join(execDir, 'dist')) || fs.existsSync(path.join(execDir, 'scripts'))) {
    return execDir;
  }
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'dist')) || fs.existsSync(path.join(cwd, 'scripts'))) {
    return cwd;
  }
  return execDir;
}

export async function runStandalone(argv = process.argv.slice(2)): Promise<void> {
  const appDir = resolveApplicationDir();
  try {
    process.chdir(appDir);
  } catch {
    // Ignore chdir errors
  }

  // CLI Arguments Parsing
  const isHelp = argv.includes('--help') || argv.includes('-h');
  const isVersion = argv.includes('--version') || argv.includes('-v');
  const isInstallShell = argv.includes('--install-shell');
  const isUninstallShell = argv.includes('--uninstall-shell');
  const isSyncShell = argv.includes('--sync-shell');
  const isStatus = argv.includes('--status');
  const isBackground = argv.includes('--background') || argv.includes('--silent') || argv.includes('/background');
  
  const portArgIndex = argv.findIndex(a => a === '--port' || a === '-p');
  const PORT = portArgIndex !== -1 && argv[portArgIndex + 1] ? parseInt(argv[portArgIndex + 1], 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  if (isHelp) {
    console.log(`Bun-Drive v${APPLICATION_VERSION}`);
    console.log(`Windows File Explorer Active Directory Network Share Discovery Engine\n`);
    console.log(`Usage: Bun-Drive.exe [options]\n`);
    console.log(`Options:`);
    console.log(`  --background, --silent   Run in background mode without opening the browser`);
    console.log(`  --port, -p <port>        Set HTTP listen port (default: 3000)`);
    console.log(`  --install-shell          Register Bun-Drive in Windows Explorer Navigation Pane`);
    console.log(`  --uninstall-shell        Unregister Bun-Drive from Windows Explorer Navigation Pane`);
    console.log(`  --sync-shell             Synchronize authorized shares to Virtual Root shortcuts`);
    console.log(`  --status                 Output current Explorer integration status as JSON`);
    console.log(`  --version, -v            Output version number`);
    console.log(`  --help, -h               Show this help message`);
    process.exit(0);
  }

  if (isVersion) {
    console.log(`Bun-Drive version ${APPLICATION_VERSION}`);
    process.exit(0);
  }

  if (isInstallShell) {
    console.log('[Bun-Drive] Registering Explorer Navigation Pane shell namespace...');
    const discovery = await discoveryService.getShares(false);
    const result = await shellIntegrationService.registerInExplorer(discovery.shares);
    console.log(`[Bun-Drive] Shell registered successfully: pinned=${result.isPinnedToNavigationPane}, shortcuts=${result.activeShortcuts.length}`);
    process.exit(0);
  }

  if (isUninstallShell) {
    console.log('[Bun-Drive] Unregistering Explorer Navigation Pane shell namespace...');
    const result = await shellIntegrationService.unregisterFromExplorer();
    console.log(`[Bun-Drive] Shell unregistered: isRegistered=${result.isRegisteredInExplorer}`);
    process.exit(0);
  }

  if (isSyncShell) {
    console.log('[Bun-Drive] Synchronizing network shares to Virtual Root...');
    const discovery = await discoveryService.getShares(false);
    const result = await shellIntegrationService.syncSharesToVirtualFolder(discovery.shares);
    console.log(`[Bun-Drive] Sync complete: created=${result.createdCount}, updated=${result.updatedCount}, removed=${result.removedCount}`);
    process.exit(0);
  }

  if (isStatus) {
    const status = await shellIntegrationService.getStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  // Check if already running on this port
  const running = await isAlreadyRunning(PORT);
  if (running) {
    logger.info('Standalone', `Bun-Drive is already running on port ${PORT}.`);
    if (!isBackground) {
      logger.info('Standalone', `Opening active instance in default browser: http://localhost:${PORT}`);
      openBrowser(`http://localhost:${PORT}`);
    }
    process.exit(0);
  }

  // Create Express App
  const app = createBunDriveApp();

  // Initialize Shell Integration & Share Change Monitor
  try {
    await shellIntegrationService.initialize();
  } catch (err) {
    logger.warn('Standalone', 'Initial shell integration warning', err);
  }
  shareChangeMonitor.start();

  // Serve static UI assets from dist/
  const distCandidatePaths = [
    path.resolve(appDir, 'dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(path.dirname(process.execPath || ''), 'dist')
  ];

  let distPath = distCandidatePaths.find(p => fs.existsSync(p));
  if (distPath) {
    logger.info('Standalone', `Serving production UI assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath!, 'index.html'));
    });
  } else {
    logger.warn('Standalone', 'No dist directory found. Serving API only.');
    app.get('/', (req: Request, res: Response) => {
      res.send(`<h1>Bun-Drive v${APPLICATION_VERSION}</h1><p>Background service active.</p>`);
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('Standalone', `Bun-Drive v${APPLICATION_VERSION} started on http://127.0.0.1:${PORT}`);
    if (!isBackground) {
      openBrowser(`http://localhost:${PORT}`);
    }
  });

  // Handle termination signals cleanly
  const shutdown = () => {
    logger.info('Standalone', 'Shutting down Bun-Drive server...');
    shareChangeMonitor.stop();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Auto-run if executed as main
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('Bun-Drive.exe')) {
  runStandalone().catch((err) => {
    console.error('Fatal error starting Bun-Drive standalone:', err);
    process.exit(1);
  });
}
