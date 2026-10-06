import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { groupPolicyService } from '../src/core/groupPolicy.js';
import { NativeBridge } from '../src/core/nativeBridge.js';
import { discoveryService } from '../src/core/discovery.js';
import { shellIntegrationService } from '../src/core/shellIntegration.js';
import { NetworkShare } from '../src/types/drive.js';

describe('Phase 4: Group Policy Update & Automatic Share Refresh', () => {
  beforeEach(() => {
    NativeBridge.resetSimulatedPolicyState();
  });

  afterEach(() => {
    NativeBridge.resetSimulatedPolicyState();
  });

  // 1. GPUpdate Command Invocation
  test('1. GPUpdate command invocation executes gpupdate /force with captured execution details', async () => {
    const gpResult = await NativeBridge.executeGpupdate();

    assert.ok(gpResult, 'Result must be defined');
    assert.strictEqual(gpResult.command, 'gpupdate /force', 'Must execute "gpupdate /force"');
    assert.strictEqual(gpResult.started, true, 'Process must report started = true');
    assert.ok(gpResult.durationMs >= 0, 'Duration must be non-negative');
    assert.ok(gpResult.timestamp, 'Timestamp must be recorded');
    assert.strictEqual(typeof gpResult.success, 'boolean');
  });

  // 2. GPUpdate Success
  test('2. GPUpdate success captures zero exit code, standard output, and duration', async () => {
    const gpResult = await NativeBridge.executeGpupdate();

    assert.strictEqual(gpResult.success, true);
    assert.strictEqual(gpResult.exitCode, 0);
    assert.ok(gpResult.stdout.includes('Policy update has completed successfully'));
    assert.strictEqual(gpResult.stderr, '');
    assert.strictEqual(gpResult.timedOut, false);
    assert.strictEqual(gpResult.error, undefined);
  });

  // 3. GPUpdate Failure
  test('3. GPUpdate failure captures non-zero exit code and error output without crashing', async () => {
    const failedResult = await NativeBridge.executeGpupdate({
      simulateScenario: 'failure',
      simulatedExitCode: 1,
      simulatedStderr: 'The Group Policy client-side extension failed to apply policy: Access is denied.'
    });

    assert.strictEqual(failedResult.started, true);
    assert.strictEqual(failedResult.success, false);
    assert.strictEqual(failedResult.exitCode, 1);
    assert.ok(failedResult.stderr.includes('Access is denied'));
    assert.ok(failedResult.error?.includes('exit code 1'));

    // Verify service orchestration handles failure gracefully without pretending it succeeded
    const refreshResult = await groupPolicyService.refreshGroupPolicy({
      simulateScenario: 'failure',
      simulatedExitCode: 1
    });

    assert.strictEqual(refreshResult.success, false, 'Must not claim success if gpupdate failed');
    assert.strictEqual(refreshResult.gpupdate.exitCode, 1);
    assert.ok(refreshResult.message.includes('failed') || refreshResult.message.includes('exit code'));
  });

  // 4. GPUpdate Timeout
  test('4. GPUpdate timeout aborts cleanly and reports timedOut status', async () => {
    const timeoutResult = await NativeBridge.executeGpupdate({
      simulateScenario: 'timeout',
      timeoutMs: 1000
    });

    assert.strictEqual(timeoutResult.started, true);
    assert.strictEqual(timeoutResult.success, false);
    assert.strictEqual(timeoutResult.timedOut, true);
    assert.ok(timeoutResult.error?.toLowerCase().includes('timed out'));
  });

  // 5. Post-GPUpdate Rediscovery
  test('5. post-GPUpdate rediscovery performs a new active share discovery in user context', async () => {
    const initialShares = await discoveryService.discoverShares();
    assert.ok(initialShares.shares.length > 0);

    const refreshResult = await groupPolicyService.refreshGroupPolicy();

    assert.strictEqual(refreshResult.success, true);
    assert.ok(refreshResult.discovery, 'Must return new discovery result');
    assert.ok(Array.isArray(refreshResult.discovery.shares), 'Must return discovered shares');
    assert.ok(refreshResult.discovery.shares.length > 0);
    assert.ok(refreshResult.discovery.timestamp, 'Timestamp must be refreshed');
    assert.ok(refreshResult.discovery.scanDurationMs >= 0);

    // Verify all primary discovered shares are accessible
    for (const sh of refreshResult.discovery.shares) {
      assert.strictEqual(sh.isAccessible, true);
    }
  });

  // 6. New Share Detection
  test('6. new share detection identifies newly published/accessible shares after Group Policy', async () => {
    // Baseline discovery
    await discoveryService.discoverShares();

    // Simulate Active Directory Policy granting a new share to the user
    const newGrantedShare: NetworkShare = {
      id: '\\\\FS01-CORP.corp.local\\Finance-Secure',
      name: 'Finance-Secure',
      server: 'FS01-CORP.corp.local',
      uncPath: '\\\\FS01-CORP.corp.local\\Finance-Secure',
      description: 'Newly Provisioned Fiscal Share via GPO Policy Drive Map',
      isAccessible: true,
      accessLevel: 'ReadWrite',
      status: 'Accessible',
      connectionStatus: 'Online',
      mappedDrive: null,
      discoverySource: 'AD_LDAP',
      responseTimeMs: 15,
      lastChecked: new Date().toISOString()
    };

    NativeBridge.setSimulatedPolicyState({
      grantedShares: [newGrantedShare]
    });

    const refreshResult = await groupPolicyService.refreshGroupPolicy();

    assert.strictEqual(refreshResult.success, true);
    assert.ok(refreshResult.diff.summary.newCount >= 1, 'Should detect at least 1 new share');
    assert.ok(
      refreshResult.diff.newlyAccessible.some(s => s.name === 'Finance-Secure'),
      'Finance-Secure must appear in newlyAccessible'
    );
    assert.ok(
      refreshResult.discovery.shares.some(s => s.name === 'Finance-Secure'),
      'Finance-Secure must appear in discovered shares'
    );
  });

  // 7. Removed / Inaccessible Share Detection
  test('7. removed/inaccessible share detection identifies revoked shares and updates access status', async () => {
    // Baseline
    const baseline = await discoveryService.discoverShares();
    assert.ok(baseline.shares.some(s => s.name === 'Marketing-Assets'));

    // Simulate GPO revoking access permissions to Marketing-Assets
    NativeBridge.setSimulatedPolicyState({
      revokedShareIds: ['\\\\FS01-CORP.corp.local\\Marketing-Assets', 'Marketing-Assets']
    });

    const refreshResult = await groupPolicyService.refreshGroupPolicy();

    assert.strictEqual(refreshResult.success, true);
    assert.ok(refreshResult.diff.summary.removedCount >= 1, 'Must detect revoked share');
    assert.ok(
      refreshResult.diff.noLongerAccessible.some(s => s.name === 'Marketing-Assets'),
      'Marketing-Assets must be reported in noLongerAccessible'
    );

    // In user's primary view, revoked share must not be listed as accessible
    assert.ok(
      !refreshResult.discovery.shares.some(s => s.name === 'Marketing-Assets'),
      'Revoked share must not be present in accessible shares'
    );
  });

  // 8. Share Status Changes
  test('8. share status changes identifies offline transitions and restoration', () => {
    const oldShares: NetworkShare[] = [
      {
        id: '\\\\FS01\\ShareA',
        name: 'ShareA',
        server: 'FS01',
        uncPath: '\\\\FS01\\ShareA',
        isAccessible: true,
        accessLevel: 'ReadWrite',
        status: 'Accessible',
        connectionStatus: 'Online',
        discoverySource: 'AD_LDAP',
        responseTimeMs: 10,
        lastChecked: new Date().toISOString()
      },
      {
        id: '\\\\FS02\\ShareB',
        name: 'ShareB',
        server: 'FS02',
        uncPath: '\\\\FS02\\ShareB',
        isAccessible: false,
        accessLevel: 'None',
        status: 'Offline',
        connectionStatus: 'Offline',
        discoverySource: 'AD_LDAP',
        responseTimeMs: 1000,
        lastChecked: new Date().toISOString()
      }
    ];

    const newShares: NetworkShare[] = [
      {
        id: '\\\\FS01\\ShareA',
        name: 'ShareA',
        server: 'FS01',
        uncPath: '\\\\FS01\\ShareA',
        isAccessible: false,
        accessLevel: 'None',
        status: 'Offline',
        connectionStatus: 'Offline',
        discoverySource: 'AD_LDAP',
        responseTimeMs: 2000,
        lastChecked: new Date().toISOString()
      },
      {
        id: '\\\\FS02\\ShareB',
        name: 'ShareB',
        server: 'FS02',
        uncPath: '\\\\FS02\\ShareB',
        isAccessible: true,
        accessLevel: 'Read',
        status: 'Accessible',
        connectionStatus: 'Online',
        discoverySource: 'AD_LDAP',
        responseTimeMs: 12,
        lastChecked: new Date().toISOString()
      }
    ];

    const diff = groupPolicyService.compareShareStates(oldShares, newShares);

    assert.strictEqual(diff.summary.offlineCount, 1, 'ShareA became offline');
    assert.strictEqual(diff.becameOffline[0].name, 'ShareA');

    assert.strictEqual(diff.summary.restoredCount, 1, 'ShareB was restored');
    assert.strictEqual(diff.becameAvailable[0].name, 'ShareB');
  });

  // 9. UI Refresh State & Status Tracking
  test('9. UI refresh state accurately reflects status and history', async () => {
    const statusBefore = groupPolicyService.getStatus();
    assert.strictEqual(statusBefore.isUpdating, false);

    const refreshResult = await groupPolicyService.refreshGroupPolicy();

    const statusAfter = groupPolicyService.getStatus();
    assert.strictEqual(statusAfter.isUpdating, false);
    assert.strictEqual(statusAfter.lastStatus, 'completed');
    assert.ok(statusAfter.lastRunAt);
    assert.strictEqual(statusAfter.lastResult?.timestamp, refreshResult.timestamp);
  });

  // 10. Explorer Namespace Synchronization
  test('10. Explorer Namespace synchronization updates virtual root shortcuts after GPO refresh', async () => {
    // Ensure Explorer Namespace is registered
    await shellIntegrationService.registerInExplorer();

    // Add a new share
    const projectShare: NetworkShare = {
      id: '\\\\FS01-CORP.corp.local\\Projects-Archive',
      name: 'Projects-Archive',
      server: 'FS01-CORP.corp.local',
      uncPath: '\\\\FS01-CORP.corp.local\\Projects-Archive',
      isAccessible: true,
      accessLevel: 'ReadWrite',
      status: 'Accessible',
      connectionStatus: 'Online',
      discoverySource: 'AD_LDAP',
      responseTimeMs: 14,
      lastChecked: new Date().toISOString()
    };

    NativeBridge.setSimulatedPolicyState({
      grantedShares: [projectShare]
    });

    const refreshResult = await groupPolicyService.refreshGroupPolicy();

    assert.strictEqual(refreshResult.shellSync.success, true);
    assert.ok(refreshResult.shellStatus.isRegisteredInExplorer);

    // Verify virtual root contains the newly synchronized shortcut
    const shortcutNames = refreshResult.shellStatus.activeShortcuts.map(s => s.name);
    assert.ok(
      shortcutNames.some(n => n.includes('Projects-Archive')),
      'Projects-Archive shortcut must be active in Explorer Namespace'
    );
  });

  // 11. Manual Refresh Without GPUpdate
  test('11. manual refresh without gpupdate discovers shares without running gpupdate', async () => {
    const previousRunAt = groupPolicyService.getStatus().lastRunAt;

    // Normal share refresh
    const normalResult = await groupPolicyService.rediscoverWithoutGpupdate();

    assert.ok(normalResult.discovery.shares.length > 0);
    assert.ok(normalResult.shellSync);

    // Verify GPUpdate last run timestamp did not change
    const currentRunAt = groupPolicyService.getStatus().lastRunAt;
    assert.strictEqual(currentRunAt, previousRunAt, 'Standard refresh must NOT execute gpupdate');
  });

  // 12. Concurrent Refresh Protection
  test('12. concurrent refresh protection prevents simultaneous GPUpdate runs', async () => {
    // Trigger two refreshes concurrently
    const promise1 = groupPolicyService.refreshGroupPolicy();
    const promise2 = groupPolicyService.refreshGroupPolicy();

    // One of them should succeed, while the second must be rejected with concurrency error
    const outcomes = await Promise.allSettled([promise1, promise2]);

    const fulfilled = outcomes.filter(o => o.status === 'fulfilled');
    const rejected = outcomes.filter(o => o.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent call should proceed');
    assert.strictEqual(rejected.length, 1, 'Second concurrent call must be rejected');

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason as Error;
    assert.ok(
      rejectionReason.message.toLowerCase().includes('already in progress'),
      'Must provide descriptive concurrency rejection message'
    );
  });
});
