/**
 * Bun-Drive Phase 5: Automatic Detection of New Shares & Permission Changes
 * Smart Share Change Monitor & Orchestration Engine
 * 
 * Responsibilities:
 * - Periodically monitors Active Directory / SMB shares for access and publication changes
 * - Stable UNC path identity normalization and deduplication
 * - Detects state transitions: Newly Accessible, Access Revoked, Restored, Offline
 * - Prevents tight loops and aggressive network traffic via configurable interval
 * - Synchronizes Windows Explorer Namespace ONLY when effective share set changes
 * - Concurrency protection with generation IDs (protects against stale results)
 * - Integrates with Phase 4 GPUpdate without duplicate discoveries
 * - Preserves user drive mappings when shares transition to inaccessible/offline
 * - Resilient error handling: transient network failures preserve known-good state
 */

import {
  NetworkShare,
  ShareDiscoveryResult,
  ShareStateDiff,
  ShareChangeNotification,
  ShareChangeType,
  MonitorConfig,
  MonitorStatus,
  ShellSyncResult
} from '../types/drive.js';
import { discoveryService } from './discovery.js';
import { shellIntegrationService } from './shellIntegration.js';
import { groupPolicyService } from './groupPolicy.js';
import { logger } from './logger.js';

/**
 * Normalizes UNC paths for stable comparison across Windows formats:
 * - Replaces forward slashes with backslashes
 * - Strips trailing slashes / backslashes
 * - Collapses redundant backslashes
 * - E.g.: "\\SERVER\\Finance\\" -> "\\SERVER\Finance"
 */
export function normalizeUncPath(unc: string): string {
  if (!unc) return '';
  let cleaned = unc.trim().replace(/\//g, '\\');
  if (cleaned.startsWith('\\\\')) {
    const afterRoot = cleaned.slice(2).replace(/\\+/g, '\\');
    cleaned = '\\\\' + afterRoot;
  }
  while (cleaned.length > 2 && cleaned.endsWith('\\')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Generates normalized, lowercase comparison key for a network share or UNC path
 */
export function getNormalizedShareKey(shareOrUnc: NetworkShare | string): string {
  const unc = typeof shareOrUnc === 'string' ? shareOrUnc : shareOrUnc.uncPath;
  return normalizeUncPath(unc).toLowerCase();
}

/**
 * Deduplicates network shares based on normalized UNC path key
 * Preserves the most authorized entry if duplicates exist.
 */
export function deduplicateShares(shares: NetworkShare[]): NetworkShare[] {
  const seen = new Map<string, NetworkShare>();
  for (const share of shares) {
    const key = getNormalizedShareKey(share);
    if (!seen.has(key)) {
      seen.set(key, share);
    } else {
      const existing = seen.get(key)!;
      // If one is accessible and other isn't, prefer accessible
      if (!existing.isAccessible && share.isAccessible) {
        seen.set(key, share);
      }
    }
  }
  return Array.from(seen.values());
}

export class ShareChangeMonitor {
  private config: MonitorConfig = {
    enabled: true,
    intervalSeconds: 180, // Default 3 minutes suitable for enterprise AD workstations
    minIntervalSeconds: 30,
    maxIntervalSeconds: 3600
  };

  private timer: NodeJS.Timeout | null = null;
  private isRefreshing = false;
  private generationId = 0;
  private currentCycle = 0;

  // Known state
  private knownShares: NetworkShare[] = [];
  private lastRefreshTime: string | null = null;
  private lastSuccessfulDiscoveryTime: string | null = null;
  private nextScheduledRefreshTime: string | null = null;
  private totalChangesDetected = 0;
  private lastChangeSummary: string | null = null;
  private lastNotification: ShareChangeNotification | null = null;
  private lastError: string | null = null;
  private lastDurationMs = 0;
  private namespaceSyncCount = 0;

  private listeners: Array<(notif: ShareChangeNotification) => void> = [];

  constructor() {
    // Listen for authoritative GPUpdate completions from Phase 4
    groupPolicyService.onRefresh((gpResult) => {
      if (gpResult.success) {
        this.notifyAuthoritativeDiscovery(
          gpResult.discovery.shares,
          gpResult.diff,
          'gpupdate'
        );
      }
    });
  }

  /**
   * Start the automatic share monitor
   */
  public start(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (!this.config.enabled) {
      this.nextScheduledRefreshTime = null;
      return;
    }

    this.scheduleNext();
    logger.info(
      'ShareChangeMonitor',
      `Automatic share monitoring started (interval: ${this.config.intervalSeconds}s)`
    );
  }

  /**
   * Stop the automatic share monitor
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextScheduledRefreshTime = null;
    logger.info('ShareChangeMonitor', 'Automatic share monitoring stopped');
  }

  /**
   * Update monitor configuration
   */
  public setConfig(partial: Partial<MonitorConfig>): MonitorConfig {
    if (typeof partial.enabled === 'boolean') {
      this.config.enabled = partial.enabled;
    }

    if (typeof partial.intervalSeconds === 'number') {
      const clamped = Math.min(
        this.config.maxIntervalSeconds,
        Math.max(this.config.minIntervalSeconds, partial.intervalSeconds)
      );
      this.config.intervalSeconds = clamped;
    }

    if (!this.config.enabled) {
      this.stop();
    } else {
      this.start();
    }

    return { ...this.config };
  }

  /**
   * Get current monitor configuration
   */
  public getConfig(): MonitorConfig {
    return { ...this.config };
  }

  /**
   * Get current monitor status and metrics
   */
  public getStatus(): MonitorStatus {
    return {
      enabled: this.config.enabled,
      intervalSeconds: this.config.intervalSeconds,
      isRefreshing: this.isRefreshing,
      lastRefreshTime: this.lastRefreshTime,
      lastSuccessfulDiscoveryTime: this.lastSuccessfulDiscoveryTime,
      nextScheduledRefreshTime: this.nextScheduledRefreshTime,
      currentCycle: this.currentCycle,
      totalChangesDetected: this.totalChangesDetected,
      lastChangeSummary: this.lastChangeSummary,
      lastNotification: this.lastNotification,
      lastError: this.lastError,
      lastDurationMs: this.lastDurationMs,
      knownSharesCount: this.knownShares.length,
      namespaceSyncCount: this.namespaceSyncCount
    };
  }

  /**
   * Get currently tracked shares
   */
  public getKnownShares(): NetworkShare[] {
    return [...this.knownShares];
  }

  /**
   * Set known shares directly (used for initialization and testing)
   */
  public setKnownShares(shares: NetworkShare[]): void {
    this.knownShares = deduplicateShares(shares);
  }

  /**
   * Add a listener for share change notifications
   */
  public addListener(listener: (notif: ShareChangeNotification) => void): () => void {
    this.listeners.push(listener);
    return () => this.removeListener(listener);
  }

  /**
   * Remove a registered change listener
   */
  public removeListener(listener: (notif: ShareChangeNotification) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(notif: ShareChangeNotification): void {
    for (const listener of this.listeners) {
      try {
        listener(notif);
      } catch (err) {
        logger.warn('ShareChangeMonitor', 'Error in notification listener', err);
      }
    }
  }

  private scheduleNext(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (!this.config.enabled) {
      this.nextScheduledRefreshTime = null;
      return;
    }

    const nextTimeMs = Date.now() + this.config.intervalSeconds * 1000;
    this.nextScheduledRefreshTime = new Date(nextTimeMs).toISOString();

    this.timer = setInterval(async () => {
      try {
        await this.checkNow('automatic');
      } catch (err) {
        logger.warn('ShareChangeMonitor', 'Uncaught error in automatic refresh timer', err);
      }
    }, this.config.intervalSeconds * 1000);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Integrates with Phase 4 GPUpdate:
   * When `Refresh Group Policy` completes, it calls this method with the authoritative
   * discovery and diff. This avoids duplicate discoveries immediately after GPUpdate.
   */
  public notifyAuthoritativeDiscovery(
    shares: NetworkShare[],
    diff?: ShareStateDiff,
    source: 'gpupdate' | 'manual' = 'manual'
  ): void {
    // Invalidate any in-flight automatic check
    this.generationId++;
    const deduplicated = deduplicateShares(shares);
    this.knownShares = deduplicated;
    this.lastSuccessfulDiscoveryTime = new Date().toISOString();
    this.lastRefreshTime = this.lastSuccessfulDiscoveryTime;

    if (diff) {
      const hasChanges =
        diff.summary.newCount > 0 ||
        diff.summary.removedCount > 0 ||
        diff.summary.offlineCount > 0 ||
        diff.summary.restoredCount > 0;

      if (hasChanges) {
        this.totalChangesDetected +=
          diff.summary.newCount +
          diff.summary.removedCount +
          diff.summary.restoredCount +
          diff.summary.offlineCount;

        const summary = this.buildChangeSummary(diff);
        this.lastChangeSummary = summary;

        const notif: ShareChangeNotification = {
          id: `gp-${Date.now()}`,
          timestamp: this.lastRefreshTime,
          type: diff.summary.newCount > 0 ? 'NEW_SHARES' : 'ACCESS_REVOKED',
          message: summary,
          newSharesCount: diff.summary.newCount,
          revokedSharesCount: diff.summary.removedCount,
          restoredSharesCount: diff.summary.restoredCount,
          offlineSharesCount: diff.summary.offlineCount,
          diff
        };
        this.lastNotification = notif;
        this.notifyListeners(notif);
      }
    }

    // Push back next automatic refresh cycle
    if (this.config.enabled) {
      this.scheduleNext();
    }
    logger.info(
      'ShareChangeMonitor',
      `Synchronized authoritative discovery from ${source} (${deduplicated.length} shares). Next automatic check postponed.`
    );
  }

  /**
   * Compares previous known shares against newly discovered shares using normalized UNC paths
   */
  public compareNormalizedShareStates(
    oldShares: NetworkShare[],
    newShares: NetworkShare[]
  ): ShareStateDiff {
    const oldMap = new Map<string, NetworkShare>();
    for (const sh of oldShares) {
      oldMap.set(getNormalizedShareKey(sh), sh);
    }

    const newMap = new Map<string, NetworkShare>();
    for (const sh of newShares) {
      newMap.set(getNormalizedShareKey(sh), sh);
    }

    const newlyAccessible: NetworkShare[] = [];
    const noLongerAccessible: NetworkShare[] = [];
    const becameOffline: NetworkShare[] = [];
    const becameAvailable: NetworkShare[] = [];
    const unchanged: NetworkShare[] = [];

    for (const newShare of newShares) {
      const key = getNormalizedShareKey(newShare);
      const oldShare = oldMap.get(key);

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

      // Check offline transitions
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

    // Check for shares in oldShares that are no longer published in newShares
    for (const oldShare of oldShares) {
      const key = getNormalizedShareKey(oldShare);
      if (!newMap.has(key) && oldShare.isAccessible) {
        noLongerAccessible.push({
          ...oldShare,
          isAccessible: false,
          status: 'Inaccessible',
          accessLevel: 'None',
          denialReason: 'Share is no longer published or accessible'
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

  private buildChangeSummary(diff: ShareStateDiff): string {
    const parts: string[] = [];
    if (diff.summary.newCount > 0) {
      parts.push(
        `${diff.summary.newCount} new share${diff.summary.newCount > 1 ? 's' : ''} available`
      );
    }
    if (diff.summary.removedCount > 0) {
      parts.push(
        `${diff.summary.removedCount} share${diff.summary.removedCount > 1 ? 's' : ''} no longer accessible`
      );
    }
    if (diff.summary.restoredCount > 0) {
      parts.push(
        `${diff.summary.restoredCount} share${diff.summary.restoredCount > 1 ? 's' : ''} restored`
      );
    }
    if (diff.summary.offlineCount > 0) {
      parts.push(
        `${diff.summary.offlineCount} server${diff.summary.offlineCount > 1 ? 's' : ''} offline`
      );
    }
    return parts.length > 0 ? parts.join(', ') : 'No access changes detected';
  }

  /**
   * Trigger an active check now (either automatic cycle or manual user request)
   */
  public async checkNow(
    source: 'automatic' | 'manual' = 'automatic'
  ): Promise<{
    discovery: ShareDiscoveryResult | null;
    diff: ShareStateDiff | null;
    changed: boolean;
    notification: ShareChangeNotification | null;
  }> {
    // Concurrency protection: do not run if GPUpdate is running
    if (groupPolicyService.isOperationInProgress()) {
      logger.info('ShareChangeMonitor', 'Group Policy update is active. Skipping monitor cycle.');
      return { discovery: null, diff: null, changed: false, notification: null };
    }

    // Prevent overlapping refresh jobs
    if (this.isRefreshing) {
      logger.warn('ShareChangeMonitor', 'Refresh cycle already in progress, skipping overlapping request.');
      return { discovery: null, diff: null, changed: false, notification: null };
    }

    const currentGeneration = ++this.generationId;
    this.isRefreshing = true;
    const startTime = Date.now();

    try {
      logger.info('ShareChangeMonitor', `Executing ${source} share discovery cycle...`);
      const discovery = await discoveryService.discoverShares();

      // Check if a newer authoritative refresh occurred while discovery was running
      if (this.generationId !== currentGeneration) {
        logger.warn(
          'ShareChangeMonitor',
          'Discarding stale discovery result; newer authoritative refresh was completed.'
        );
        return { discovery: null, diff: null, changed: false, notification: null };
      }

      this.lastDurationMs = Date.now() - startTime;
      this.lastRefreshTime = new Date().toISOString();
      this.lastSuccessfulDiscoveryTime = this.lastRefreshTime;
      this.lastError = null;
      this.currentCycle++;

      const deduplicatedNewShares = deduplicateShares(discovery.shares);

      // Check if this is the very first initialization cycle
      const isInitialBaseline = this.currentCycle === 1 && this.knownShares.length === 0;

      const diff = this.compareNormalizedShareStates(this.knownShares, deduplicatedNewShares);

      let hasChanges = false;

      if (isInitialBaseline) {
        // Establish baseline: populate knownShares without spamming false "new share" alerts
        this.knownShares = deduplicatedNewShares;
        this.lastChangeSummary = `${deduplicatedNewShares.length} initial domain shares detected`;
        hasChanges = false;
        logger.info(
          'ShareChangeMonitor',
          `Baseline established: ${deduplicatedNewShares.length} accessible shares discovered.`
        );
      } else {
        hasChanges =
          diff.summary.newCount > 0 ||
          diff.summary.removedCount > 0 ||
          diff.summary.offlineCount > 0 ||
          diff.summary.restoredCount > 0;

        if (hasChanges) {
          this.totalChangesDetected +=
            diff.summary.newCount +
            diff.summary.removedCount +
            diff.summary.restoredCount +
            diff.summary.offlineCount;

          const summary = this.buildChangeSummary(diff);
          this.lastChangeSummary = summary;

          let notifType: ShareChangeType = 'STATUS_CHANGED';
          if (diff.summary.newCount > 0) notifType = 'NEW_SHARES';
          else if (diff.summary.removedCount > 0) notifType = 'ACCESS_REVOKED';
          else if (diff.summary.restoredCount > 0) notifType = 'RESTORED';
          else if (diff.summary.offlineCount > 0) notifType = 'OFFLINE';

          const notif: ShareChangeNotification = {
            id: `notif-${Date.now()}`,
            timestamp: this.lastRefreshTime,
            type: notifType,
            message: summary,
            newSharesCount: diff.summary.newCount,
            revokedSharesCount: diff.summary.removedCount,
            restoredSharesCount: diff.summary.restoredCount,
            offlineSharesCount: diff.summary.offlineCount,
            diff
          };
          this.lastNotification = notif;

          // Requirement 10: Synchronize Explorer Namespace ONLY when effective share set changes!
          logger.info(
            'ShareChangeMonitor',
            `Changes detected (${summary}). Synchronizing Explorer Namespace...`
          );
          await shellIntegrationService.syncSharesToVirtualFolder(deduplicatedNewShares);
          this.namespaceSyncCount++;

          // Requirement 11: Reconcile mapped drive statuses without deleting mappings
          const accessibleSet = new Set(
            deduplicatedNewShares.filter(s => s.isAccessible).map(s => getNormalizedShareKey(s))
          );
          const offlineSet = new Set(
            deduplicatedNewShares.filter(s => s.status === 'Offline').map(s => s.server.toLowerCase())
          );
          shellIntegrationService.reconcileDriveMappingStatuses(accessibleSet, offlineSet);

          this.notifyListeners(notif);
        } else {
          // Requirement 16 Performance: do NOT sync namespace or write shortcuts if no changes!
          logger.info('ShareChangeMonitor', 'No changes detected in network share accessibility.');
        }

        // Update known shares state
        this.knownShares = deduplicatedNewShares;
      }

      return {
        discovery,
        diff,
        changed: hasChanges,
        notification: this.lastNotification
      };
    } catch (err: unknown) {
      // Requirement 14 & 18: Resilient error handling.
      // Transient network failures do not destroy the known good state!
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.lastError = errorMsg;
      this.lastRefreshTime = new Date().toISOString();
      this.lastDurationMs = Date.now() - startTime;
      logger.error(
        'ShareChangeMonitor',
        `Share change monitor cycle encountered an error: ${errorMsg}. Preserving previous known state.`,
        err
      );
      return { discovery: null, diff: null, changed: false, notification: null };
    } finally {
      this.isRefreshing = false;
      if (this.config.enabled) {
        this.scheduleNext();
      }
    }
  }

  /**
   * Manual refresh integration: triggered by [ Refresh Shares ] button
   * Does NOT run `gpupdate /force`.
   */
  public async triggerManualRefresh(): Promise<{
    discovery: ShareDiscoveryResult;
    diff: ShareStateDiff;
    shellSync: ShellSyncResult | null;
    notification: ShareChangeNotification | null;
  }> {
    const outcome = await this.checkNow('manual');
    const shellStatus = await shellIntegrationService.getStatus();

    if (!outcome.discovery) {
      // Return fallback from cached known shares
      return {
        discovery: {
          shares: this.knownShares,
          inaccessibleSharesCount: 0,
          scannedServers: [],
          identity: (await discoveryService.getShares(false)).identity,
          scanDurationMs: this.lastDurationMs,
          timestamp: this.lastRefreshTime || new Date().toISOString()
        },
        diff: outcome.diff || {
          newlyAccessible: [],
          noLongerAccessible: [],
          becameOffline: [],
          becameAvailable: [],
          unchanged: this.knownShares,
          summary: {
            totalBefore: this.knownShares.length,
            totalAfter: this.knownShares.length,
            newCount: 0,
            removedCount: 0,
            offlineCount: 0,
            restoredCount: 0
          }
        },
        shellSync: null,
        notification: outcome.notification
      };
    }

    return {
      discovery: outcome.discovery,
      diff: outcome.diff || {
        newlyAccessible: [],
        noLongerAccessible: [],
        becameOffline: [],
        becameAvailable: [],
        unchanged: outcome.discovery.shares,
        summary: {
          totalBefore: this.knownShares.length,
          totalAfter: outcome.discovery.shares.length,
          newCount: 0,
          removedCount: 0,
          offlineCount: 0,
          restoredCount: 0
        }
      },
      shellSync: outcome.changed ? {
        success: true,
        virtualRootPath: shellStatus.virtualRootPath,
        createdCount: shellStatus.activeShortcuts.length,
        updatedCount: 0,
        removedCount: 0,
        activeShortcuts: shellStatus.activeShortcuts,
        durationMs: 0,
        timestamp: new Date().toISOString()
      } : null,
      notification: outcome.notification
    };
  }
}

export const shareChangeMonitor = new ShareChangeMonitor();
