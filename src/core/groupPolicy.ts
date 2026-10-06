/**
 * Bun-Drive Group Policy & Share Synchronization Service
 * Orchestrates gpupdate /force execution, post-policy network share rediscovery,
 * state change diffing (newly accessible, revoked, offline), and Windows Explorer
 * Shell Namespace synchronization.
 */

import {
  NetworkShare,
  ShareDiscoveryResult,
  GpupdateExecutionResult,
  ShareStateDiff,
  GroupPolicyRefreshResult,
  GroupPolicyStatus,
  ShellSyncResult,
  ShellIntegrationState
} from '../types/drive.js';
import { NativeBridge } from './nativeBridge.js';
import { discoveryService } from './discovery.js';
import { shellIntegrationService } from './shellIntegration.js';
import { identityService } from './identity.js';
import { logger } from './logger.js';

export class GroupPolicyService {
  private isUpdating = false;
  private lastResult: GroupPolicyRefreshResult | null = null;
  private lastRunAt: string | null = null;
  private lastStatus: 'idle' | 'updating' | 'completed' | 'failed' = 'idle';
  private lastError?: string;
  private refreshListeners: Array<(result: GroupPolicyRefreshResult) => void> = [];

  /**
   * Register a listener for Group Policy refresh completion
   */
  public onRefresh(listener: (result: GroupPolicyRefreshResult) => void): () => void {
    this.refreshListeners.push(listener);
    return () => {
      this.refreshListeners = this.refreshListeners.filter(l => l !== listener);
    };
  }

  /**
   * Check if a Group Policy update operation is currently running
   */
  public isOperationInProgress(): boolean {
    return this.isUpdating;
  }

  /**
   * Get current Group Policy service status
   */
  public getStatus(): GroupPolicyStatus {
    return {
      isUpdating: this.isUpdating,
      lastResult: this.lastResult,
      lastRunAt: this.lastRunAt,
      lastStatus: this.lastStatus,
      lastError: this.lastError
    };
  }

  /**
   * Compare old share state vs new share state to identify:
   * - newly accessible shares
   * - shares that became inaccessible
   * - shares that became offline
   * - shares that became available again
   * - unchanged shares
   */
  public compareShareStates(
    oldShares: NetworkShare[],
    newShares: NetworkShare[]
  ): ShareStateDiff {
    const oldMap = new Map<string, NetworkShare>();
    for (const sh of oldShares) {
      oldMap.set(sh.uncPath.toLowerCase(), sh);
    }

    const newMap = new Map<string, NetworkShare>();
    for (const sh of newShares) {
      newMap.set(sh.uncPath.toLowerCase(), sh);
    }

    const newlyAccessible: NetworkShare[] = [];
    const noLongerAccessible: NetworkShare[] = [];
    const becameOffline: NetworkShare[] = [];
    const becameAvailable: NetworkShare[] = [];
    const unchanged: NetworkShare[] = [];

    // Analyze new shares against old shares
    for (const newShare of newShares) {
      const oldShare = oldMap.get(newShare.uncPath.toLowerCase());

      if (!oldShare) {
        // Entirely new share discovered
        if (newShare.isAccessible) {
          newlyAccessible.push(newShare);
        } else if (newShare.status === 'Offline') {
          becameOffline.push(newShare);
        } else {
          unchanged.push(newShare);
        }
        continue;
      }

      // Check offline status transitions
      const wasOffline = oldShare.status === 'Offline' || oldShare.connectionStatus === 'Offline';
      const isNowOffline = newShare.status === 'Offline' || newShare.connectionStatus === 'Offline';

      if (!wasOffline && isNowOffline) {
        becameOffline.push(newShare);
        continue;
      }

      if (wasOffline && !isNowOffline && newShare.isAccessible) {
        becameAvailable.push(newShare);
        continue;
      }

      // Check accessibility transitions
      if (!oldShare.isAccessible && newShare.isAccessible) {
        newlyAccessible.push(newShare);
      } else if (oldShare.isAccessible && !newShare.isAccessible) {
        noLongerAccessible.push(newShare);
      } else if (oldShare.accessLevel !== newShare.accessLevel) {
        // Status or permission changed while remaining accessible
        newlyAccessible.push(newShare);
      } else {
        unchanged.push(newShare);
      }
    }

    // Check for shares in oldShares that are no longer present in newShares
    for (const oldShare of oldShares) {
      const stillExists = newMap.has(oldShare.uncPath.toLowerCase());
      if (!stillExists && oldShare.isAccessible) {
        noLongerAccessible.push({
          ...oldShare,
          isAccessible: false,
          status: 'Inaccessible',
          accessLevel: 'None',
          denialReason: 'Share is no longer published or accessible following Group Policy update'
        });
      }
    }

    return {
      newlyAccessible,
      noLongerAccessible,
      becameOffline,
      becameAvailable,
      unchanged,
      summary: {
        totalBefore: oldShares.length,
        totalAfter: newShares.length,
        newCount: newlyAccessible.length,
        removedCount: noLongerAccessible.length,
        offlineCount: becameOffline.length,
        restoredCount: becameAvailable.length
      }
    };
  }

  /**
   * Execute `gpupdate /force` only, without automatic share rediscovery
   */
  public async executeGpupdateOnly(options: {
    timeoutMs?: number;
    simulateScenario?: 'success' | 'failure' | 'timeout' | 'unavailable';
    simulatedExitCode?: number;
    simulatedStderr?: string;
  } = {}): Promise<GpupdateExecutionResult> {
    if (this.isUpdating) {
      throw new Error('A Group Policy update operation is already in progress.');
    }

    this.isUpdating = true;
    this.lastStatus = 'updating';
    try {
      logger.info('GroupPolicy', 'Starting Group Policy update...');
      const gpResult = await NativeBridge.executeGpupdate(options);
      if (gpResult.success) {
        logger.info('GroupPolicy', 'Group Policy update completed.');
        this.lastStatus = 'completed';
      } else {
        logger.error('GroupPolicy', `Group Policy update failed: ${gpResult.error || gpResult.stderr}`);
        this.lastStatus = 'failed';
        this.lastError = gpResult.error || 'Group Policy update failed';
      }
      return gpResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('GroupPolicy', `Group Policy process error: ${msg}`, err);
      this.lastStatus = 'failed';
      this.lastError = msg;
      throw err;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Refresh Group Policy and Automatically Rediscover Network Shares
   * The complete Phase 4 lifecycle:
   * 1. Capture current share state
   * 2. Execute `gpupdate /force` asynchronously
   * 3. Await Group Policy completion
   * 4. Perform fresh Active Directory share discovery in current user security context
   * 5. Compare old vs new share state
   * 6. Synchronize Windows Explorer Namespace
   * 7. Return comprehensive refresh result
   */
  public async refreshGroupPolicy(options: {
    timeoutMs?: number;
    simulateScenario?: 'success' | 'failure' | 'timeout' | 'unavailable';
    simulatedExitCode?: number;
    simulatedStderr?: string;
  } = {}): Promise<GroupPolicyRefreshResult> {
    if (this.isUpdating) {
      logger.warn('GroupPolicy', 'Group Policy update requested while already running.');
      throw new Error('A Group Policy update operation is already in progress. Please wait for completion.');
    }

    this.isUpdating = true;
    this.lastStatus = 'updating';
    this.lastError = undefined;

    try {
      // 1. Capture old share state before GPUpdate
      const previousResult = await discoveryService.getShares(false);
      const oldShares = [...previousResult.shares];

      // 2. Execute gpupdate /force
      logger.info('GroupPolicy', 'Starting Group Policy update...');
      const gpResult = await NativeBridge.executeGpupdate(options);
      this.lastRunAt = new Date().toISOString();

      // 3. Handle GPUpdate failure
      if (!gpResult.success) {
        this.lastStatus = 'failed';
        this.lastError = gpResult.error || gpResult.stderr || 'Group Policy update failed';
        logger.error('GroupPolicy', `Group Policy update failed. ${this.lastError}`);

        // Construct empty diff
        const failedDiff: ShareStateDiff = {
          newlyAccessible: [],
          noLongerAccessible: [],
          becameOffline: [],
          becameAvailable: [],
          unchanged: oldShares,
          summary: {
            totalBefore: oldShares.length,
            totalAfter: oldShares.length,
            newCount: 0,
            removedCount: 0,
            offlineCount: 0,
            restoredCount: 0
          }
        };

        const shellStatus = await shellIntegrationService.getStatus();
        const emptySync: ShellSyncResult = {
          success: false,
          virtualRootPath: shellStatus.virtualRootPath,
          createdCount: 0,
          updatedCount: 0,
          removedCount: 0,
          activeShortcuts: shellStatus.activeShortcuts,
          durationMs: 0,
          timestamp: new Date().toISOString()
        };

        const failedResult: GroupPolicyRefreshResult = {
          gpupdate: gpResult,
          discovery: previousResult,
          diff: failedDiff,
          shellSync: emptySync,
          shellStatus,
          timestamp: this.lastRunAt,
          success: false,
          message: gpResult.error || 'Group Policy update failed'
        };

        this.lastResult = failedResult;
        return failedResult;
      }

      // Group Policy update succeeded!
      logger.info('GroupPolicy', 'Group Policy update completed.');

      // Invalidate identity cache so newly granted AD groups and token credentials are re-evaluated
      identityService.invalidateCache();

      // 4. Perform a NEW REAL SHARE DISCOVERY using current Windows user's context
      logger.info('GroupPolicy', 'Rediscovering accessible network shares...');
      const newDiscoveryResult = await discoveryService.discoverShares();

      // 5. Compare old vs new share states
      const diff = this.compareShareStates(oldShares, newDiscoveryResult.shares);

      if (diff.summary.newCount > 0) {
        logger.info(
          'GroupPolicy',
          `${diff.summary.newCount} new share${diff.summary.newCount > 1 ? 's' : ''} discovered.`
        );
      }
      if (diff.summary.removedCount > 0) {
        logger.info(
          'GroupPolicy',
          `${diff.summary.removedCount} share${diff.summary.removedCount > 1 ? 's are' : ' is'} no longer accessible.`
        );
      }

      // 6. Synchronize the Windows Explorer Namespace
      logger.info('GroupPolicy', 'Synchronizing Bun-Drive Explorer Namespace...');
      const shellSyncResult = await shellIntegrationService.syncSharesToVirtualFolder(
        newDiscoveryResult.shares
      );
      const shellStatus = await shellIntegrationService.getStatus();

      // Correlate mapped drive letters
      const mappedByUnc = new Map(
        shellStatus.mappedDrives.map((d) => [d.uncPath.toLowerCase(), d.driveLetter])
      );
      for (const share of newDiscoveryResult.shares) {
        share.mappedDrive = mappedByUnc.get(share.uncPath.toLowerCase()) || null;
      }

      logger.info('GroupPolicy', 'Refresh completed.');

      this.lastStatus = 'completed';
      const completeResult: GroupPolicyRefreshResult = {
        gpupdate: gpResult,
        discovery: newDiscoveryResult,
        diff,
        shellSync: shellSyncResult,
        shellStatus,
        timestamp: this.lastRunAt,
        success: true,
        message: 'Group Policy update and share discovery completed successfully.'
      };

      this.lastResult = completeResult;
      for (const listener of this.refreshListeners) {
        try {
          listener(completeResult);
        } catch {
          // ignore
        }
      }
      return completeResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastStatus = 'failed';
      this.lastError = msg;
      logger.error('GroupPolicy', `Group Policy refresh error: ${msg}`, err);
      throw err;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Safe fallback: perform fresh share rediscovery and Explorer sync
   * without executing gpupdate (e.g., if gpupdate is unavailable or failed).
   */
  public async rediscoverWithoutGpupdate(): Promise<{
    discovery: ShareDiscoveryResult;
    diff: ShareStateDiff;
    shellSync: ShellSyncResult;
    shellStatus: ShellIntegrationState;
  }> {
    const previousResult = await discoveryService.getShares(false);
    const oldShares = [...previousResult.shares];

    logger.info('GroupPolicy', 'Performing manual share rediscovery without Group Policy update...');
    identityService.invalidateCache();
    const newDiscovery = await discoveryService.discoverShares();
    const diff = this.compareShareStates(oldShares, newDiscovery.shares);

    logger.info('GroupPolicy', 'Synchronizing Bun-Drive Explorer Namespace...');
    const shellSync = await shellIntegrationService.syncSharesToVirtualFolder(newDiscovery.shares);
    const shellStatus = await shellIntegrationService.getStatus();

    const mappedByUnc = new Map(
      shellStatus.mappedDrives.map((d) => [d.uncPath.toLowerCase(), d.driveLetter])
    );
    for (const share of newDiscovery.shares) {
      share.mappedDrive = mappedByUnc.get(share.uncPath.toLowerCase()) || null;
    }

    logger.info('GroupPolicy', 'Refresh completed.');

    return {
      discovery: newDiscovery,
      diff,
      shellSync,
      shellStatus
    };
  }
}

export const groupPolicyService = new GroupPolicyService();
