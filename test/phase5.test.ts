import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  ShareChangeMonitor,
  normalizeUncPath,
  getNormalizedShareKey,
  deduplicateShares
} from '../src/core/shareChangeMonitor.js';
import { groupPolicyService } from '../src/core/groupPolicy.js';
import { NativeBridge } from '../src/core/nativeBridge.js';
import { discoveryService } from '../src/core/discovery.js';
import { shellIntegrationService } from '../src/core/shellIntegration.js';
import { NetworkShare } from '../src/types/drive.js';

function createTestShare(overrides: Partial<NetworkShare> & { uncPath: string; name: string }): NetworkShare {
  const { uncPath, name, id, server, isAccessible, status, accessLevel, ...rest } = overrides;
  return {
    id: id || `sh-${Math.random().toString(36).slice(2, 7)}`,
    server: server || uncPath.split('\\')[2] || 'FS01',
    name,
    uncPath,
    isAccessible: isAccessible ?? true,
    status: status ?? (isAccessible === false ? 'Inaccessible' : 'Accessible'),
    accessLevel: accessLevel ?? (isAccessible === false ? 'None' : 'Read'),
    discoverySource: 'AD_LDAP',
    responseTimeMs: 5,
    lastChecked: new Date().toISOString(),
    ...rest
  };
}

describe('Phase 5: Automatic Detection of New Shares & Permission Changes', () => {
  let monitor: ShareChangeMonitor;

  beforeEach(() => {
    NativeBridge.resetSimulatedPolicyState();
    monitor = new ShareChangeMonitor();
    monitor.stop();
  });

  afterEach(() => {
    monitor.stop();
    NativeBridge.resetSimulatedPolicyState();
  });

  // 1. Normalization of UNC paths & case-insensitivity
  test('1. UNC path normalization handles casing, trailing slashes, and slashes', () => {
    assert.strictEqual(normalizeUncPath('\\\\SERVER\\Share\\'), '\\\\SERVER\\Share');
    assert.strictEqual(normalizeUncPath('//server/share/'), '\\\\server\\share');
    assert.strictEqual(normalizeUncPath('\\\\server\\\\share\\\\sub\\\\'), '\\\\server\\share\\sub');
    assert.strictEqual(normalizeUncPath('\\\\server\\share'), '\\\\server\\share');

    const key1 = getNormalizedShareKey('\\\\SERVER\\Share\\');
    const key2 = getNormalizedShareKey('\\\\server\\share');
    const key3 = getNormalizedShareKey('//server/SHARE/');

    assert.strictEqual(key1, key2);
    assert.strictEqual(key2, key3);
    assert.strictEqual(key1, '\\\\server\\share');
  });

  // 2. Deduplication of shares
  test('2. Deduplication collapses duplicate UNC paths and prefers accessible entry', () => {
    const rawShares: NetworkShare[] = [
      createTestShare({
        id: '1',
        server: 'SERVER01',
        name: 'Public',
        uncPath: '\\\\SERVER01\\Public',
        isAccessible: false,
        status: 'Inaccessible',
        accessLevel: 'None'
      }),
      createTestShare({
        id: '2',
        server: 'server01',
        name: 'public',
        uncPath: '\\\\server01\\public\\',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'ReadWrite'
      }),
      createTestShare({
        id: '3',
        server: 'server02',
        name: 'Docs',
        uncPath: '\\\\server02\\Docs',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'Read'
      })
    ];

    const deduplicated = deduplicateShares(rawShares);
    assert.strictEqual(deduplicated.length, 2);
    const pub = deduplicated.find(s => s.name.toLowerCase() === 'public');
    assert.ok(pub);
    assert.strictEqual(pub.isAccessible, true);
    assert.strictEqual(pub.accessLevel, 'ReadWrite');
  });

  // 3. Newly Accessible Share Detection
  test('3. Detects newly accessible share when GPO/AD group membership grants access', () => {
    const baseline: NetworkShare[] = [
      createTestShare({
        id: 'sh-1',
        server: 'FS01',
        name: 'Public',
        uncPath: '\\\\FS01\\Public',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'Read'
      })
    ];

    const updated: NetworkShare[] = [
      createTestShare({
        id: 'sh-1',
        server: 'FS01',
        name: 'Public',
        uncPath: '\\\\FS01\\Public',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'Read'
      }),
      createTestShare({
        id: 'sh-2',
        server: 'FS01',
        name: 'Finance',
        uncPath: '\\\\FS01\\Finance',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'ReadWrite'
      })
    ];

    const diff = monitor.compareNormalizedShareStates(baseline, updated);
    assert.strictEqual(diff.summary.newCount, 1);
    assert.strictEqual(diff.newlyAccessible[0].name, 'Finance');
    assert.strictEqual(diff.summary.removedCount, 0);
  });

  // 4. Inaccessible / Access Revoked Detection
  test('4. Detects newly inaccessible or revoked shares when permissions are removed', () => {
    const baseline: NetworkShare[] = [
      createTestShare({
        id: 'sh-1',
        server: 'FS01',
        name: 'Public',
        uncPath: '\\\\FS01\\Public',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'Read'
      }),
      createTestShare({
        id: 'sh-2',
        server: 'FS01',
        name: 'Finance',
        uncPath: '\\\\FS01\\Finance',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'ReadWrite'
      })
    ];

    // Finance becomes inaccessible
    const updated: NetworkShare[] = [
      createTestShare({
        id: 'sh-1',
        server: 'FS01',
        name: 'Public',
        uncPath: '\\\\FS01\\Public',
        isAccessible: true,
        status: 'Accessible',
        accessLevel: 'Read'
      }),
      createTestShare({
        id: 'sh-2',
        server: 'FS01',
        name: 'Finance',
        uncPath: '\\\\FS01\\Finance',
        isAccessible: false,
        status: 'Inaccessible',
        accessLevel: 'None'
      })
    ];

    const diff = monitor.compareNormalizedShareStates(baseline, updated);
    assert.strictEqual(diff.summary.removedCount, 1);
    assert.strictEqual(diff.noLongerAccessible[0].name, 'Finance');
    assert.strictEqual(diff.summary.newCount, 0);
  });

  // 5. Offline and Restored Server/Share Transitions
  test('5. Detects offline transition and subsequent restoration', () => {
    const onlineShare: NetworkShare = createTestShare({
      id: 'sh-1',
      server: 'BRANCH-SRV',
      name: 'LocalDocs',
      uncPath: '\\\\BRANCH-SRV\\LocalDocs',
      isAccessible: true,
      status: 'Accessible',
      accessLevel: 'ReadWrite'
    });

    const offlineShare: NetworkShare = createTestShare({
      id: 'sh-1',
      server: 'BRANCH-SRV',
      name: 'LocalDocs',
      uncPath: '\\\\BRANCH-SRV\\LocalDocs',
      isAccessible: false,
      status: 'Offline',
      accessLevel: 'None',
      connectionStatus: 'Offline'
    });

    // Transition 1: online -> offline
    const diff1 = monitor.compareNormalizedShareStates([onlineShare], [offlineShare]);
    assert.strictEqual(diff1.summary.offlineCount, 1);
    assert.strictEqual(diff1.becameOffline[0].name, 'LocalDocs');

    // Transition 2: offline -> restored
    const diff2 = monitor.compareNormalizedShareStates([offlineShare], [onlineShare]);
    assert.strictEqual(diff2.summary.restoredCount, 1);
    assert.strictEqual(diff2.becameAvailable[0].name, 'LocalDocs');
  });

  // 6. Explorer Namespace Synchronization on changes
  test('6. Synchronizes Explorer Namespace when real share accessibility changes', async () => {
    await shellIntegrationService.registerInExplorer();

    const initialShares = await discoveryService.discoverShares();
    monitor.setKnownShares(initialShares.shares);

    // Grant a new share in policy
    NativeBridge.setSimulatedPolicyState({
      grantedShares: [
        createTestShare({
          id: 'phase5-share-99',
          server: 'CORP-SEC',
          name: 'ExecutiveArchive',
          uncPath: '\\\\CORP-SEC\\ExecutiveArchive',
          isAccessible: true,
          status: 'Accessible',
          accessLevel: 'ReadWrite',
          description: 'Phase 5 Newly Granted AD Share'
        })
      ]
    });

    const statusBefore = monitor.getStatus();
    const result = await monitor.checkNow('manual');

    assert.strictEqual(result.changed, true);
    assert.ok(result.diff);
    assert.strictEqual(result.diff.summary.newCount, 1);
    assert.strictEqual(result.diff.newlyAccessible[0].name, 'ExecutiveArchive');

    // Verify Explorer Namespace was updated
    const statusAfter = monitor.getStatus();
    assert.strictEqual(statusAfter.namespaceSyncCount, statusBefore.namespaceSyncCount + 1);

    const shellStatus = await shellIntegrationService.getStatus();
    const shortcutExists = shellStatus.activeShortcuts.some(
      s => s.name.toLowerCase().includes('executivearchive') || s.uncPath.toLowerCase().includes('executivearchive')
    );
    assert.strictEqual(shortcutExists, true, 'Virtual root shortcut must exist for new share');
  });

  // 7. No unnecessary Explorer writes when no changes detected
  test('7. Does not rewrite Explorer Namespace shortcuts when no shares changed', async () => {
    const discovery = await discoveryService.discoverShares();
    monitor.setKnownShares(discovery.shares);

    const statusBefore = monitor.getStatus();
    const result = await monitor.checkNow('manual');

    assert.strictEqual(result.changed, false);
    const statusAfter = monitor.getStatus();
    assert.strictEqual(statusAfter.namespaceSyncCount, statusBefore.namespaceSyncCount, 'Must not increment sync count');
  });

  // 8. Drive mapping status reconciliation without breaking mappings
  test('8. Reconciles drive mapping status to Connected or Unavailable without removing mapping', async () => {
    await shellIntegrationService.mapDriveLetter('Z:', '\\\\FS01.corp.local\\Public', true);

    const accessible = new Set<string>(['\\\\fs01.corp.local\\public']);
    const offline = new Set<string>();

    shellIntegrationService.reconcileDriveMappingStatuses(accessible, offline);
    let drives = shellIntegrationService.getMappedDrives();
    let zDrive = drives.find(d => d.driveLetter === 'Z:');
    assert.strictEqual(zDrive?.status, 'Connected');

    // Now mark server offline
    offline.add('fs01.corp.local');
    shellIntegrationService.reconcileDriveMappingStatuses(new Set(), offline);
    drives = shellIntegrationService.getMappedDrives();
    zDrive = drives.find(d => d.driveLetter === 'Z:');
    assert.strictEqual(zDrive?.status, 'Unavailable');
    assert.strictEqual(drives.length, 1, 'Mapping must not be deleted');

    // Clean up
    await shellIntegrationService.unmapDriveLetter('Z:');
  });

  // 9. Configurable interval with clamping and start/stop
  test('9. Configurable monitor interval with min/max bounds and start/stop control', () => {
    const cfg1 = monitor.setConfig({ intervalSeconds: 15 });
    // minIntervalSeconds is 30s
    assert.strictEqual(cfg1.intervalSeconds, 30);

    const cfg2 = monitor.setConfig({ intervalSeconds: 5000 });
    // maxIntervalSeconds is 3600s
    assert.strictEqual(cfg2.intervalSeconds, 3600);

    const cfg3 = monitor.setConfig({ intervalSeconds: 120 });
    assert.strictEqual(cfg3.intervalSeconds, 120);

    monitor.start();
    let st = monitor.getStatus();
    assert.strictEqual(st.enabled, true);
    assert.ok(st.nextScheduledRefreshTime);

    monitor.stop();
    st = monitor.getStatus();
    assert.strictEqual(st.nextScheduledRefreshTime, null);
  });

  // 10. Handover / integration with Phase 4 GPUpdate
  test('10. GPUpdate completion hands authoritative discovery over to monitor without duplication', async () => {
    const notifySpy: any[] = [];
    const unsub = monitor.addListener((notif) => {
      notifySpy.push(notif);
    });

    const gpResult = await groupPolicyService.refreshGroupPolicy();
    assert.strictEqual(gpResult.success, true);

    const known = monitor.getKnownShares();
    assert.strictEqual(known.length, gpResult.discovery.shares.length);
    assert.ok(monitor.getStatus().lastSuccessfulDiscoveryTime);

    unsub();
  });

  // 11. Transient error resilience: preserves known good state
  test('11. Preserves known good state and reports error when transient network failure occurs', async () => {
    const goodShares = await discoveryService.discoverShares();
    monitor.setKnownShares(goodShares.shares);
    const countBefore = monitor.getKnownShares().length;

    const originalDiscover = discoveryService.discoverShares;
    (discoveryService as any).discoverShares = async () => {
      throw new Error('RPC_S_SERVER_UNAVAILABLE: 0x800706BA');
    };

    try {
      const result = await monitor.checkNow('automatic');
      assert.strictEqual(result.changed, false);
      assert.strictEqual(result.discovery, null);

      // Known good state must be intact
      assert.strictEqual(monitor.getKnownShares().length, countBefore);
      assert.ok(monitor.getStatus().lastError?.includes('RPC_S_SERVER_UNAVAILABLE'));
    } finally {
      (discoveryService as any).discoverShares = originalDiscover;
    }
  });

  // 12. Manual refresh trigger returns discovery and notification
  test('12. Manual refresh trigger executes discovery and returns diff state', async () => {
    const result = await monitor.triggerManualRefresh();
    assert.ok(result.discovery);
    assert.ok(result.diff);
    assert.ok(Array.isArray(result.discovery.shares));
    assert.strictEqual(result.discovery.shares.length > 0, true);
  });
});
