import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { shellIntegrationService } from '../src/core/shellIntegration.js';
import { ShellExtensionRegistry, BUN_DRIVE_CLSID, SHELL_FOLDER_INSTANCE_CLSID } from '../src/core/shellExtensionRegistry.js';
import { NetworkShare } from '../src/types/drive.js';

describe('Phase 2: Windows Explorer Shell Namespace Integration & Virtual Mounts', () => {
  test('blueprint includes ShellFolder Instance proxy and InitPropertyBag TargetFolderPath', () => {
    const bp = ShellExtensionRegistry.getBlueprint('C:\\Users\\Test\\AppData\\Local\\Bun-Drive\\NamespaceRoot');
    assert.strictEqual(bp.clsid, BUN_DRIVE_CLSID);

    const instanceKey = bp.registryKeys.find(
      k => k.key.endsWith('\\Instance') && k.valueName === 'CLSID'
    );
    assert.ok(instanceKey, 'Must configure Instance CLSID for Explorer ShellFolder proxy');
    assert.strictEqual(instanceKey.value, SHELL_FOLDER_INSTANCE_CLSID);

    const targetFolderKey = bp.registryKeys.find(
      k => k.key.endsWith('\\Instance\\InitPropertyBag') && k.valueName === 'TargetFolderPath'
    );
    assert.ok(targetFolderKey, 'Must configure InitPropertyBag TargetFolderPath');
    assert.strictEqual(targetFolderKey.value, 'C:\\Users\\Test\\AppData\\Local\\Bun-Drive\\NamespaceRoot');
  });

  test('registers Bun-Drive in Explorer and synchronizes only accessible shares to Virtual Root', async () => {
    const sampleShares: NetworkShare[] = [
      {
        id: '\\\\FS01\\Public',
        name: 'Public',
        server: 'FS01.corp.local',
        uncPath: '\\\\FS01.corp.local\\Public',
        description: 'Public Share',
        isAccessible: true,
        accessLevel: 'ReadWrite',
        discoverySource: 'AD_LDAP',
        responseTimeMs: 10,
        lastChecked: new Date().toISOString()
      },
      {
        id: '\\\\FS01\\HR-Secret',
        name: 'HR-Secret',
        server: 'FS01.corp.local',
        uncPath: '\\\\FS01.corp.local\\HR-Secret',
        description: 'Restricted Share',
        isAccessible: false,
        accessLevel: 'None',
        denialReason: 'Access Denied',
        discoverySource: 'AD_LDAP',
        responseTimeMs: 12,
        lastChecked: new Date().toISOString()
      },
      {
        id: '\\\\FS01\\ADMIN$',
        name: 'ADMIN$',
        server: 'FS01.corp.local',
        uncPath: '\\\\FS01.corp.local\\ADMIN$',
        description: 'Hidden Admin Share',
        isAccessible: true,
        accessLevel: 'ReadWrite',
        discoverySource: 'AD_LDAP',
        responseTimeMs: 8,
        lastChecked: new Date().toISOString()
      }
    ];

    const state = await shellIntegrationService.registerInExplorer(sampleShares);
    assert.strictEqual(state.isRegisteredInExplorer, true);
    assert.strictEqual(state.isPinnedToNavigationPane, true);
    assert.strictEqual(state.activeShortcuts.length, 1, 'Only accessible, non-$ shares should be synced');
    assert.strictEqual(state.activeShortcuts[0].uncPath, '\\\\FS01.corp.local\\Public');
    assert.ok(fs.existsSync(state.activeShortcuts[0].shortcutPath), 'Shortcut file must exist on disk');
  });

  test('maps and unmaps Windows drive letters accurately', async () => {
    const mapped = await shellIntegrationService.mapDriveLetter('Z:', '\\\\FS01.corp.local\\Public', true);
    assert.strictEqual(mapped.driveLetter, 'Z:');
    assert.strictEqual(mapped.uncPath, '\\\\FS01.corp.local\\Public');
    assert.strictEqual(mapped.status, 'Connected');

    const statusAfterMap = await shellIntegrationService.getStatus();
    assert.ok(statusAfterMap.mappedDrives.some(d => d.driveLetter === 'Z:'));

    await shellIntegrationService.unmapDriveLetter('Z:');
    const statusAfterUnmap = await shellIntegrationService.getStatus();
    assert.ok(!statusAfterUnmap.mappedDrives.some(d => d.driveLetter === 'Z:'));
  });

  test('unregisters Bun-Drive and cleans up virtual root shortcuts', async () => {
    const state = await shellIntegrationService.unregisterFromExplorer();
    assert.strictEqual(state.isRegisteredInExplorer, false);
    assert.strictEqual(state.isPinnedToNavigationPane, false);
    assert.strictEqual(state.activeShortcuts.length, 0);
  });
});
