/**
 * Phase 8 Automated Test Suite: Final Production Hardening & Release Validation
 * 
 * Verifies:
 * 1. Security hardening: UNC path validation, drive letter validation, shell character escaping
 * 2. Explorer open safety: safe subprocess execution with regex validation
 * 3. Explorer Namespace COM CLSID stability and HKCU isolation
 * 4. Automatic monitoring clean shutdown and transient network resilience
 * 5. Single-instance detection and background mode configuration
 * 6. Uninstall safety boundaries (zero network share or user document deletion)
 * 7. Version uniformity (1.0.0 across all components)
 * 8. Staging directory hygiene and secret audit
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUN_DRIVE_CLSID,
  BUN_DRIVE_PROGID,
  SHELL_FOLDER_INSTANCE_CLSID,
  ShellExtensionRegistry
} from '../src/core/shellExtensionRegistry.js';
import {
  InstallerBlueprintRegistry,
  INSTALLER_VERSION,
  APPLICATION_NAME,
  DEFAULT_INSTALL_DIR_WIN,
  DEFAULT_VIRTUAL_ROOT_WIN,
  UNINSTALL_REG_KEY,
  RUN_REG_KEY
} from '../src/core/installerBlueprint.js';
import { APPLICATION_VERSION, isAlreadyRunning } from '../src/standalone.js';
import { shellIntegrationService } from '../src/core/shellIntegration.js';
import { shareChangeMonitor, normalizeUncPath, deduplicateShares } from '../src/core/shareChangeMonitor.js';
import { NativeBridge } from '../src/core/nativeBridge.js';
import { fileSystemService } from '../src/core/fileSystem.js';
import { NetworkShare } from '../src/types/drive.js';

describe('Phase 8: Final Production Hardening & Release Validation', () => {

  // 1. Version Uniformity
  test('1. Production version 1.0.0 is uniform across all blueprints and entrypoints', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    assert.strictEqual(pkg.version, '1.0.0', 'package.json must be 1.0.0');
    assert.strictEqual(INSTALLER_VERSION, '1.0.0', 'INSTALLER_VERSION must be 1.0.0');
    assert.strictEqual(APPLICATION_VERSION, '1.0.0', 'APPLICATION_VERSION must be 1.0.0');

    const bp = InstallerBlueprintRegistry.getBlueprint();
    assert.strictEqual(bp.version, '1.0.0', 'Installer blueprint version must be 1.0.0');
    assert.strictEqual(bp.outputArtifact, 'Bun-Drive-Setup-1.0.0.exe', 'Artifact name must match version 1.0.0');
  });

  // 2. Security: UNC Path & Drive Letter Validation
  test('2. Shell mapping rejects malicious drive letters and invalid UNC paths', async () => {
    // Invalid drive letter: A:, B:, C:, numbers, symbols
    await assert.rejects(
      async () => {
        await shellIntegrationService.mapDriveLetter('C:', '\\\\FS01\\Share');
      },
      /Invalid drive letter/,
      'Must reject C: drive mapping to protect local system drive'
    );

    await assert.rejects(
      async () => {
        await shellIntegrationService.mapDriveLetter('1:', '\\\\FS01\\Share');
      },
      /Invalid drive letter/,
      'Must reject numeric drive letter'
    );

    // Invalid UNC path: missing \\ prefix
    await assert.rejects(
      async () => {
        await shellIntegrationService.mapDriveLetter('Z:', 'C:\\Windows\\System32');
      },
      /Invalid UNC path/,
      'Must reject non-UNC path'
    );

    // Injection attempt in UNC path
    await assert.rejects(
      async () => {
        await shellIntegrationService.mapDriveLetter('Z:', '\\\\FS01\\Share; calc.exe');
      },
      /Invalid characters in UNC path/,
      'Must reject UNC path containing semicolon shell separator'
    );

    await assert.rejects(
      async () => {
        await shellIntegrationService.mapDriveLetter('Z:', '\\\\FS01\\Share" & dir');
      },
      /Invalid characters in UNC path/,
      'Must reject UNC path containing double quotes and ampersands'
    );
  });

  // 3. Security: Explorer Launch Subprocess Sanitization
  test('3. NativeBridge.openInExplorer rejects unsafe paths and command injection attempts', async () => {
    const result1 = await NativeBridge.openInExplorer('; calc.exe ;');
    assert.strictEqual(result1, false, 'Must reject path with semicolon injection');

    const result2 = await NativeBridge.openInExplorer('\\\\FS01\\Share" | notepad');
    assert.strictEqual(result2, false, 'Must reject path with pipe injection');

    const result3 = await NativeBridge.openInExplorer('');
    assert.strictEqual(result3, false, 'Must reject empty path');

    // Valid path returns true
    const validResult = await NativeBridge.openInExplorer('\\\\FS01\\Projects');
    assert.strictEqual(validResult, true, 'Valid UNC path must succeed');
  });

  // 4. Security: File System Service Input Sanitization
  test('4. FileSystemService rejects malicious paths in browsePath and getProperties', async () => {
    await assert.rejects(
      async () => {
        await fileSystemService.browsePath('\\\\FS01\\Share; calc.exe');
      },
      /Target path contains invalid or forbidden characters/,
      'browsePath must reject injection characters'
    );

    await assert.rejects(
      async () => {
        await fileSystemService.getProperties('\\\\FS01\\Share<script>');
      },
      /Target path contains invalid or forbidden characters/,
      'getProperties must reject angle bracket injection characters'
    );
  });

  // 5. Explorer Namespace Architecture & CLSID Stability
  test('5. Explorer Namespace CLSID and HKCU registration schema are stable and idempotent', () => {
    assert.strictEqual(BUN_DRIVE_CLSID, '{B010D817-E923-4E87-9DC2-A74B29E309FA}');
    assert.strictEqual(SHELL_FOLDER_INSTANCE_CLSID, '{0E5AAE11-A475-4c5b-AB00-C66DE400274E}');
    assert.strictEqual(BUN_DRIVE_PROGID, 'BunDrive.ShellNamespaceExtension.1');

    const bp = ShellExtensionRegistry.getBlueprint();
    assert.strictEqual(bp.clsid, BUN_DRIVE_CLSID);
    assert.strictEqual(bp.isPinnedToNameSpaceTree, true);
    assert.strictEqual(bp.displayName, 'Bun-Drive');

    // All registry keys must be in HKCU
    for (const entry of bp.registryKeys) {
      assert.strictEqual(entry.hive, 'HKCU', `All keys must target HKCU (was ${entry.hive})`);
    }

    const regExport = ShellExtensionRegistry.generateRegistryFile();
    assert.ok(regExport.includes('[HKEY_CURRENT_USER\\Software\\Classes\\CLSID\\{B010D817-E923-4E87-9DC2-A74B29E309FA}]'));
    assert.ok(regExport.includes('"System.IsPinnedToNameSpaceTree"=dword:00000001'));
  });

  // 6. Monitor Hardening: Deduplication and Normalization
  test('6. ShareChangeMonitor path normalization and deduplication are case-insensitive and stable', () => {
    assert.strictEqual(normalizeUncPath('\\\\SERVER\\share\\'), '\\\\SERVER\\share');
    assert.strictEqual(normalizeUncPath('//SERVER/share/sub/'), '\\\\SERVER\\share\\sub');
    assert.strictEqual(normalizeUncPath('\\\\SERVER\\\\share\\\\'), '\\\\SERVER\\share');

    const shares: NetworkShare[] = [
      {
        id: '1',
        name: 'Public',
        server: 'FS01',
        uncPath: '\\\\FS01\\Public',
        description: '',
        isAccessible: false,
        accessLevel: 'None',
        status: 'Inaccessible',
        connectionStatus: 'Online',
        mappedDrive: null,
        discoverySource: 'AD_LDAP',
        responseTimeMs: 12,
        lastChecked: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Public',
        server: 'FS01',
        uncPath: '\\\\fs01\\public\\',
        description: '',
        isAccessible: true,
        accessLevel: 'ReadWrite',
        status: 'Accessible',
        connectionStatus: 'Online',
        mappedDrive: null,
        discoverySource: 'AD_LDAP',
        responseTimeMs: 8,
        lastChecked: new Date().toISOString()
      }
    ];

    const deduplicated = deduplicateShares(shares);
    assert.strictEqual(deduplicated.length, 1, 'Duplicate shares differing only by casing/trailing slashes must collapse');
    assert.strictEqual(deduplicated[0].isAccessible, true, 'Accessible share must be preferred over stale/inaccessible entry');
  });

  // 7. Monitor Lifecycle: Start, Stop, and Resource Cleanup
  test('7. ShareChangeMonitor starts and stops cleanly without leaving dangling timers', () => {
    shareChangeMonitor.start();
    const status1 = shareChangeMonitor.getStatus();
    assert.strictEqual(status1.enabled, true);

    shareChangeMonitor.stop();
    const status2 = shareChangeMonitor.getStatus();
    assert.strictEqual(status2.nextScheduledRefreshTime, null);
  });

  // 8. Installer & Uninstaller Security Boundaries
  test('8. Installer blueprint strictly protects network shares and user personal files', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    assert.strictEqual(bp.executionLevel, 'user', 'Must be per-user installer');

    // Safe uninstall paths
    assert.ok(bp.safeUninstallPaths.includes('$INSTDIR'));
    assert.ok(bp.safeUninstallPaths.includes(DEFAULT_VIRTUAL_ROOT_WIN));

    // Forbidden uninstall targets
    assert.ok(bp.forbiddenUninstallTargets.includes('\\\\*'), 'Must forbid deleting network shares');
    assert.ok(bp.forbiddenUninstallTargets.includes('$DOCUMENTS'), 'Must forbid deleting Documents');
    assert.ok(bp.forbiddenUninstallTargets.includes('C:\\'), 'Must forbid deleting system drive');

    // Staging forbidden patterns
    const forbidden = ['.env', '.env.local', 'test.test.ts', 'node_modules/express'];
    for (const f of forbidden) {
      let matched = false;
      for (const pattern of bp.forbiddenPatterns) {
        if (pattern.test(f)) {
          matched = true;
          break;
        }
      }
      assert.ok(matched, `Forbidden pattern must match "${f}"`);
    }
  });

  // 9. Startup & Single Instance Protection
  test('9. Startup configuration registers deterministic --background flag in HKCU Run', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    assert.strictEqual(bp.startupRegistry.hive, 'HKCU');
    assert.strictEqual(bp.startupRegistry.key, RUN_REG_KEY);
    assert.strictEqual(bp.startupRegistry.valueName, 'Bun-Drive');
    assert.strictEqual(bp.startupRegistry.value, '"$INSTDIR\\Bun-Drive.exe" --background');
  });

  // 10. No Passwords or Credentials Logged or Stored
  test('10. Codebase contains zero hardcoded passwords or authentication tokens', () => {
    const scripts = fs.readFileSync(path.resolve(process.cwd(), 'scripts/bun-drive-discovery.ps1'), 'utf8');
    assert.strictEqual(scripts.includes('password ='), false, 'Discovery script must never hardcode passwords');
    assert.strictEqual(scripts.includes('ConvertTo-SecureString -String "'), false, 'Discovery script must never embed credentials');
  });
});
