/**
 * Bun-Drive Phase 2: Windows Explorer Shell Integration & Virtual Folder Mount Service
 * Manages live registration of Bun-Drive into the Windows File Explorer Left Navigation Pane,
 * real-time synchronization of authorized AD shares into the Virtual Namespace Root folder,
 * and SMB Drive Letter Mapping (net use / Get-SmbMapping).
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  NetworkShare,
  ShellIntegrationState,
  ShellShortcutEntry,
  ShellSyncResult,
  MappedDriveLetter,
  DriveMappingConflict,
  AvailableDriveLetter
} from '../types/drive.js';
import {
  BUN_DRIVE_CLSID,
  BUN_DRIVE_PROGID
} from './shellExtensionRegistry.js';
import { NativeBridge } from './nativeBridge.js';
import { discoveryService } from './discovery.js';
import { logger } from './logger.js';

export class ShellIntegrationService {
  private isRegistered = false;
  private isPinned = false;
  private autoSyncEnabled = true;
  private syncIntervalSeconds = 60;
  private lastSyncedAt: string | null = null;
  private activeShortcuts: ShellShortcutEntry[] = [];
  private mappedDrives: MappedDriveLetter[] = [];
  private virtualRootPath: string;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (NativeBridge.isWindowsHost()) {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      this.virtualRootPath = path.join(localAppData, 'Bun-Drive', 'NamespaceRoot');
    } else {
      // Cross-platform virtual root directory for testing and container execution
      this.virtualRootPath = path.join(os.tmpdir(), 'Bun-Drive', 'NamespaceRoot');
    }
  }

  /**
   * Initialize background auto-sync and default shell state
   */
  public async initialize(): Promise<ShellIntegrationState> {
    try {
      await this.ensureVirtualRootDirectory();
      const discovery = await discoveryService.getShares(false);
      await this.registerInExplorer(discovery.shares);
      this.startAutoSync(this.syncIntervalSeconds);
    } catch (err) {
      logger.warn('ShellIntegration', 'Initial shell registration check encountered a warning', err);
    }
    return this.getStatus();
  }

  /**
   * Ensure the physical Virtual Namespace Root folder and desktop.ini exist
   */
  public async ensureVirtualRootDirectory(): Promise<void> {
    await fs.promises.mkdir(this.virtualRootPath, { recursive: true });
    const desktopIniPath = path.join(this.virtualRootPath, 'desktop.ini');
    const iniContent = [
      '[.ShellClassInfo]',
      'IconResource=%SystemRoot%\\system32\\imageres.dll,-1043',
      'InfoTip=Bun-Drive Active Directory Network Shares',
      'LocalizedResourceName=Bun-Drive',
      ''
    ].join('\r\n');
    await fs.promises.writeFile(desktopIniPath, iniContent, 'utf8');
  }

  /**
   * Query current Windows Explorer integration state, shortcuts, and mapped drives
   */
  public async getStatus(): Promise<ShellIntegrationState> {
    if (NativeBridge.isWindowsHost()) {
      try {
        const scriptPath = NativeBridge.getScriptPath('bun-drive-shell-mount.ps1');
        const raw = await NativeBridge.runPowerShell(`& '${scriptPath}' -Action Status`, 10000);
        const parsed = JSON.parse(raw);
        this.isRegistered = Boolean(parsed.isRegisteredInExplorer);
        this.isPinned = Boolean(parsed.isPinnedToNavigationPane);
        if (parsed.virtualRootPath) this.virtualRootPath = parsed.virtualRootPath;
        if (Array.isArray(parsed.activeShortcuts)) this.activeShortcuts = parsed.activeShortcuts;
        if (Array.isArray(parsed.mappedDrives)) this.mappedDrives = parsed.mappedDrives;
      } catch (err) {
        logger.error('ShellIntegration', 'Failed to query native Windows shell status', err);
      }
    }

    const healthStatus = !this.isRegistered
      ? 'Unregistered'
      : this.activeShortcuts.length > 0
      ? 'Healthy'
      : 'NeedsSync';

    return {
      isRegisteredInExplorer: this.isRegistered,
      isPinnedToNavigationPane: this.isPinned,
      virtualRootPath: this.virtualRootPath,
      clsid: BUN_DRIVE_CLSID,
      progId: BUN_DRIVE_PROGID,
      autoSyncEnabled: this.autoSyncEnabled,
      syncIntervalSeconds: this.syncIntervalSeconds,
      lastSyncedAt: this.lastSyncedAt,
      activeShortcuts: this.activeShortcuts,
      mappedDrives: this.mappedDrives,
      explorerIntegrationMode: 'ShellFolderInstance',
      healthStatus
    };
  }

  /**
   * Register Bun-Drive in the Windows File Explorer Navigation Pane (HKCU)
   * and immediately synchronize accessible AD shares.
   */
  public async registerInExplorer(shares?: NetworkShare[]): Promise<ShellIntegrationState> {
    logger.info('ShellIntegration', `Registering Bun-Drive (${BUN_DRIVE_CLSID}) in Windows Explorer Navigation Pane...`);

    const targetShares = shares || (await discoveryService.getShares(false)).shares;

    if (NativeBridge.isWindowsHost()) {
      try {
        const scriptPath = NativeBridge.getScriptPath('bun-drive-shell-mount.ps1');
        const jsonPayload = JSON.stringify(targetShares).replace(/'/g, "''");
        const raw = await NativeBridge.runPowerShell(
          `& '${scriptPath}' -Action Register -SharesJson '${jsonPayload}'`,
          15000
        );
        const parsed = JSON.parse(raw);
        this.isRegistered = Boolean(parsed.isRegisteredInExplorer);
        this.isPinned = Boolean(parsed.isPinnedToNavigationPane);
        this.activeShortcuts = parsed.activeShortcuts || [];
        this.mappedDrives = parsed.mappedDrives || [];
        this.lastSyncedAt = new Date().toISOString();
        logger.info('ShellIntegration', `Registered Bun-Drive in HKCU Explorer Namespace with ${this.activeShortcuts.length} share shortcuts.`);
        return this.getStatus();
      } catch (err) {
        logger.error('ShellIntegration', 'Failed to execute native PowerShell registration', err);
      }
    }

    // Cross-platform / container execution: materialize virtual root & shortcut descriptors
    await this.ensureVirtualRootDirectory();
    this.isRegistered = true;
    this.isPinned = true;
    await this.syncSharesToVirtualFolder(targetShares);

    logger.info(
      'ShellIntegration',
      `Bun-Drive Explorer Namespace mounted at ${this.virtualRootPath} (${this.activeShortcuts.length} shortcuts synced)`
    );

    return this.getStatus();
  }

  /**
   * Unregister Bun-Drive from Windows File Explorer Navigation Pane and clean up virtual shortcuts
   */
  public async unregisterFromExplorer(): Promise<ShellIntegrationState> {
    logger.info('ShellIntegration', `Unregistering Bun-Drive (${BUN_DRIVE_CLSID}) from Windows Explorer...`);

    if (NativeBridge.isWindowsHost()) {
      try {
        const scriptPath = NativeBridge.getScriptPath('bun-drive-shell-mount.ps1');
        await NativeBridge.runPowerShell(`& '${scriptPath}' -Action Unregister`, 10000);
      } catch (err) {
        logger.error('ShellIntegration', 'Failed to unregister via PowerShell', err);
      }
    }

    // Clean up shortcut descriptors in virtual root
    try {
      if (fs.existsSync(this.virtualRootPath)) {
        const files = await fs.promises.readdir(this.virtualRootPath);
        for (const f of files) {
          if (f.endsWith('.lnk') || f.endsWith('.url')) {
            await fs.promises.unlink(path.join(this.virtualRootPath, f));
          }
        }
      }
    } catch (err) {
      logger.warn('ShellIntegration', 'Error cleaning virtual root shortcuts', err);
    }

    this.isRegistered = false;
    this.isPinned = false;
    this.activeShortcuts = [];
    logger.info('ShellIntegration', 'Bun-Drive unregistered from Windows Explorer.');

    return this.getStatus();
  }

  /**
   * Synchronize discovered accessible AD network shares into the Virtual Root folder
   * Strictly enforces security filtering: only accessible shares are materialized.
   */
  public async syncSharesToVirtualFolder(shares?: NetworkShare[]): Promise<ShellSyncResult> {
    const startTime = Date.now();
    const resolvedShares = shares || (await discoveryService.getShares(false)).shares;

    // Security enforcement: never create shortcuts for inaccessible shares
    const authorizedShares = resolvedShares.filter(s => s.isAccessible && !s.name.endsWith('$'));

    await this.ensureVirtualRootDirectory();

    let createdCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    if (NativeBridge.isWindowsHost()) {
      try {
        const scriptPath = NativeBridge.getScriptPath('bun-drive-shell-mount.ps1');
        const jsonPayload = JSON.stringify(authorizedShares).replace(/'/g, "''");
        const raw = await NativeBridge.runPowerShell(
          `& '${scriptPath}' -Action Sync -SharesJson '${jsonPayload}'`,
          15000
        );
        const parsed = JSON.parse(raw);
        this.activeShortcuts = parsed.activeShortcuts || [];
        this.lastSyncedAt = new Date().toISOString();
        return {
          success: true,
          virtualRootPath: this.virtualRootPath,
          createdCount: this.activeShortcuts.length,
          updatedCount: 0,
          removedCount: 0,
          activeShortcuts: this.activeShortcuts,
          durationMs: Date.now() - startTime,
          timestamp: this.lastSyncedAt
        };
      } catch (err) {
        logger.error('ShellIntegration', 'Failed to sync shares via PowerShell', err);
      }
    }

    // Materialize shortcut files inside Virtual Root
    const existingNames = new Set(this.activeShortcuts.map(s => s.name));
    const newShortcuts: ShellShortcutEntry[] = [];
    const expectedFilenames = new Set<string>();

    for (const share of authorizedShares) {
      const shortServer = share.server.split('.')[0] || share.server;
      const entryName = `${share.name} (${shortServer})`;
      const fileName = `${entryName}.lnk`;
      expectedFilenames.add(fileName);

      const fullShortcutPath = path.join(this.virtualRootPath, fileName);
      const shortcutMetadata = JSON.stringify(
        {
          targetUncPath: share.uncPath,
          server: share.server,
          shareName: share.name,
          accessLevel: share.accessLevel,
          description: share.description || '',
          clsid: BUN_DRIVE_CLSID
        },
        null,
        2
      );

      await fs.promises.writeFile(fullShortcutPath, shortcutMetadata, 'utf8');

      if (existingNames.has(entryName)) {
        updatedCount++;
      } else {
        createdCount++;
      }

      newShortcuts.push({
        name: entryName,
        shareId: share.id,
        uncPath: share.uncPath,
        shortcutPath: fullShortcutPath,
        accessLevel: share.accessLevel,
        server: share.server,
        synchronizedAt: new Date().toISOString(),
        status: 'Active'
      });
    }

    // Remove orphaned shortcut files from virtual root
    try {
      const existingFiles = await fs.promises.readdir(this.virtualRootPath);
      for (const file of existingFiles) {
        if (file.endsWith('.lnk') && !expectedFilenames.has(file)) {
          await fs.promises.unlink(path.join(this.virtualRootPath, file));
          removedCount++;
        }
      }
    } catch (err) {
      logger.warn('ShellIntegration', 'Failed to prune stale virtual shortcuts', err);
    }

    this.activeShortcuts = newShortcuts;
    this.lastSyncedAt = new Date().toISOString();

    logger.info(
      'ShellIntegration',
      `Synchronized Virtual Root (${createdCount} created, ${updatedCount} updated, ${removedCount} removed)`
    );

    return {
      success: true,
      virtualRootPath: this.virtualRootPath,
      createdCount,
      updatedCount,
      removedCount,
      activeShortcuts: this.activeShortcuts,
      durationMs: Date.now() - startTime,
      timestamp: this.lastSyncedAt
    };
  }

  /**
   * Check if a drive letter is already in use by a mapped network share
   */
  public checkDriveConflict(driveLetter: string): DriveMappingConflict {
    const cleanLetter = driveLetter.trim().toUpperCase().replace(/:$/, '') + ':';
    const existing = this.mappedDrives.find(d => d.driveLetter === cleanLetter);
    if (existing) {
      return {
        hasConflict: true,
        driveLetter: cleanLetter,
        existingTarget: existing.uncPath,
        existingMapping: existing,
        message: `Drive letter ${cleanLetter} is already mapped to ${existing.uncPath} (${existing.shareName})`
      };
    }
    return {
      hasConflict: false,
      driveLetter: cleanLetter
    };
  }

  /**
   * List all drive letters D: through Z: with their availability and current mappings
   */
  public getAvailableDriveLetters(): AvailableDriveLetter[] {
    const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const mappedMap = new Map(this.mappedDrives.map(d => [d.driveLetter, d.uncPath]));

    return letters.map(char => {
      const letter = `${char}:`;
      const currentTarget = mappedMap.get(letter);
      return {
        letter,
        isMapped: Boolean(currentTarget),
        currentTarget
      };
    });
  }

  /**
   * Map an authorized network share or subfolder to a Windows drive letter (e.g., Z:)
   * Phase 3: detects conflicts and safely replaces existing mapping if replaceExisting is true.
   */
  public async mapDriveLetter(
    driveLetter: string,
    uncPath: string,
    persistent = true,
    replaceExisting = false
  ): Promise<MappedDriveLetter> {
    const cleanLetter = driveLetter.trim().toUpperCase().replace(/:$/, '') + ':';
    if (!/^[D-Z]:$/.test(cleanLetter)) {
      throw new Error(`Invalid drive letter "${driveLetter}". Choose a letter between D: and Z:.`);
    }
    if (!uncPath.startsWith('\\\\')) {
      throw new Error(`Invalid UNC path "${uncPath}". Must start with \\\\Server\\Share.`);
    }
    if (/[<>"|`*;\r\n]/.test(uncPath)) {
      throw new Error(`Invalid characters in UNC path: "${uncPath}".`);
    }

    // Check conflict with existing mapping
    const conflict = this.checkDriveConflict(cleanLetter);
    if (conflict.hasConflict && !replaceExisting) {
      const err = new Error(conflict.message || `Drive letter ${cleanLetter} is already in use.`);
      (err as unknown as { isConflict: boolean; conflictData: DriveMappingConflict }).isConflict = true;
      (err as unknown as { isConflict: boolean; conflictData: DriveMappingConflict }).conflictData = conflict;
      throw err;
    }

    if (conflict.hasConflict && replaceExisting) {
      logger.info('ShellIntegration', `Replacing existing mapping on ${cleanLetter} (was ${conflict.existingTarget})`);
      await this.unmapDriveLetter(cleanLetter);
    }

    logger.info('ShellIntegration', `Mapping network drive ${cleanLetter} -> ${uncPath} (Persistent: ${persistent})`);

    if (NativeBridge.isWindowsHost()) {
      const scriptPath = NativeBridge.getScriptPath('bun-drive-shell-mount.ps1');
      const escapedUnc = uncPath.replace(/'/g, "''");
      await NativeBridge.runPowerShell(
        `& '${scriptPath}' -Action MapDrive -DriveLetter '${cleanLetter}' -UncPath '${escapedUnc}' -Persistent $${persistent} -ReplaceExisting $${replaceExisting}`,
        10000
      );
    }

    const clean = uncPath.replace(/^[\\\/]+/, '');
    const parts = clean.split(/[\\\/]+/);
    const server = parts[0] || 'Server';
    const shareName = parts[1] || 'Share';

    const mapped: MappedDriveLetter = {
      driveLetter: cleanLetter,
      uncPath,
      shareName,
      server,
      persistent,
      status: 'Connected',
      mappedAt: new Date().toISOString()
    };

    // Update mapped drives list
    this.mappedDrives = [
      ...this.mappedDrives.filter(d => d.driveLetter !== cleanLetter),
      mapped
    ].sort((a, b) => a.driveLetter.localeCompare(b.driveLetter));

    return mapped;
  }

  /**
   * Unmap an existing Windows network drive letter
   */
  public async unmapDriveLetter(driveLetter: string): Promise<boolean> {
    const cleanLetter = driveLetter.trim().toUpperCase().replace(/:$/, '') + ':';
    if (!/^[D-Z]:$/.test(cleanLetter)) {
      throw new Error(`Invalid drive letter "${driveLetter}". Choose a letter between D: and Z:.`);
    }
    logger.info('ShellIntegration', `Unmapping network drive ${cleanLetter}`);

    if (NativeBridge.isWindowsHost()) {
      const scriptPath = NativeBridge.getScriptPath('bun-drive-shell-mount.ps1');
      await NativeBridge.runPowerShell(
        `& '${scriptPath}' -Action UnmapDrive -DriveLetter '${cleanLetter}'`,
        10000
      );
    }

    const beforeLen = this.mappedDrives.length;
    this.mappedDrives = this.mappedDrives.filter(d => d.driveLetter !== cleanLetter);
    return this.mappedDrives.length < beforeLen || true;
  }

  /**
   * Reconcile drive mapping statuses without deleting mapped drives
   * Marks mapped letters as 'Connected' or 'Unavailable' based on current accessibility.
   */
  public reconcileDriveMappingStatuses(accessibleUncPaths: Set<string>, offlineServers: Set<string>): void {
    for (const drive of this.mappedDrives) {
      const normalizedTarget = drive.uncPath.toLowerCase().replace(/\\+$/, '');
      const server = drive.server.toLowerCase();
      if (offlineServers.has(server)) {
        drive.status = 'Unavailable';
      } else if (accessibleUncPaths.has(normalizedTarget)) {
        drive.status = 'Connected';
      } else {
        drive.status = 'Unavailable';
      }
    }
  }

  /**
   * Get direct reference to currently mapped drives
   */
  public getMappedDrives(): MappedDriveLetter[] {
    return [...this.mappedDrives];
  }

  /**
   * Configure automatic background synchronization interval
   */
  public setAutoSync(enabled: boolean, intervalSeconds = 60): ShellIntegrationState {
    this.autoSyncEnabled = enabled;
    this.syncIntervalSeconds = Math.max(15, intervalSeconds);

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (enabled) {
      this.startAutoSync(this.syncIntervalSeconds);
    }

    logger.info(
      'ShellIntegration',
      `Auto-sync ${enabled ? `enabled (every ${this.syncIntervalSeconds}s)` : 'disabled'}`
    );

    return {
      isRegisteredInExplorer: this.isRegistered,
      isPinnedToNavigationPane: this.isPinned,
      virtualRootPath: this.virtualRootPath,
      clsid: BUN_DRIVE_CLSID,
      progId: BUN_DRIVE_PROGID,
      autoSyncEnabled: this.autoSyncEnabled,
      syncIntervalSeconds: this.syncIntervalSeconds,
      lastSyncedAt: this.lastSyncedAt,
      activeShortcuts: this.activeShortcuts,
      mappedDrives: this.mappedDrives,
      explorerIntegrationMode: 'ShellFolderInstance',
      healthStatus: this.isRegistered ? 'Healthy' : 'Unregistered'
    };
  }

  private startAutoSync(intervalSeconds: number): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(async () => {
      if (!this.autoSyncEnabled || !this.isRegistered) return;
      try {
        const result = await discoveryService.getShares(false);
        await this.syncSharesToVirtualFolder(result.shares);
      } catch (err) {
        logger.warn('ShellIntegration', 'Background auto-sync tick failed', err);
      }
    }, intervalSeconds * 1000);
    if (this.syncTimer.unref) {
      this.syncTimer.unref();
    }
  }
}

export const shellIntegrationService = new ShellIntegrationService();
