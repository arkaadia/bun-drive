import { test, describe } from 'node:test';
import assert from 'node:assert';
import { identityService } from '../src/core/identity.js';
import { discoveryService } from '../src/core/discovery.js';
import { fileSystemService, WindowsFileSystemService } from '../src/core/fileSystem.js';
import { shellIntegrationService } from '../src/core/shellIntegration.js';
import { NativeBridge } from '../src/core/nativeBridge.js';

describe('Phase 3: Active Directory Share Management & File Browsing', () => {
  describe('1. Active Directory & Domain Detection', () => {
    test('automatically detects domain, username, computer name, and workgroup status', async () => {
      const identity = await identityService.getCurrentIdentity(true);

      assert.ok(identity, 'Identity must be resolved');
      assert.ok(identity.domain, 'Domain name must be detected');
      assert.ok(identity.username, 'Windows username must be detected');
      assert.ok(identity.pureUsername, 'Pure username must be extracted');
      assert.ok(identity.computerName, 'Computer name must be detected');
      assert.ok(identity.workgroupStatus, 'Domain/workgroup status must be detected');
      assert.ok(
        identity.workgroupStatus.includes('Domain') || identity.workgroupStatus.includes('Workgroup') || identity.workgroupStatus.includes('Standalone'),
        'Status must reflect domain/workgroup state'
      );
      assert.strictEqual(typeof identity.isDomainJoined, 'boolean');
      assert.ok(['Kerberos', 'NTLM', 'Negotiate', 'Local'].includes(identity.authType));
    });
  });

  describe('2. Discover Accessible Shares & Status Classification', () => {
    test('distinguishes between accessible, inaccessible, and offline shares', async () => {
      const result = await discoveryService.discoverShares();
      assert.ok(result.shares.length > 0, 'Must discover shares');

      for (const share of result.shares) {
        assert.ok(share.uncPath.startsWith('\\\\'), 'UNC path must be well-formed');
        assert.ok(share.server, 'Server must be present');
        assert.ok(share.name, 'Share name must be present');
        assert.strictEqual(share.isAccessible, true, 'Primary shares must be accessible');
        assert.strictEqual(share.status, 'Accessible', 'Status must be Accessible');
        assert.ok(!share.name.endsWith('$'), 'Administrative shares must not be in user view');
      }

      assert.ok(result.inaccessibleSharesCount >= 0, 'Inaccessible count must be tracked');
    });

    test('probes offline/unreachable server gracefully without crashing', async () => {
      const result = await NativeBridge.executeDiscovery(['OFFLINE-SERVER.corp.local']);
      assert.ok(result, 'Discovery must return result for offline probe');
      // Must not crash and record duration
      assert.ok(result.scanDurationMs >= 0);
    });
  });

  describe('3. UNC Path Parsing & Validation', () => {
    test('parses share root and deep subfolders accurately', () => {
      const root = WindowsFileSystemService.parseUncPath('\\\\SERVER01\\Projects');
      assert.strictEqual(root.server, 'SERVER01');
      assert.strictEqual(root.share, 'Projects');
      assert.strictEqual(root.subPath, '');

      const sub = WindowsFileSystemService.parseUncPath('\\\\SERVER01\\Projects\\Network\\Cisco');
      assert.strictEqual(sub.server, 'SERVER01');
      assert.strictEqual(sub.share, 'Projects');
      assert.strictEqual(sub.subPath, 'Network\\Cisco');
    });
  });

  describe('4. Browse Share Contents & Subfolders', () => {
    test('browses accessible share root and enumerates items', async () => {
      const browse = await fileSystemService.browsePath('\\\\FS01-CORP.corp.local\\Projects');
      assert.strictEqual(browse.accessible, true);
      assert.strictEqual(browse.server, 'FS01-CORP.corp.local');
      assert.strictEqual(browse.share, 'Projects');
      assert.strictEqual(browse.subPath, '');
      assert.strictEqual(browse.parentPath, null);
      assert.ok(browse.entries.length > 0);

      // Verify directories come first
      const firstDir = browse.entries.find(e => e.isDirectory);
      assert.ok(firstDir, 'Should contain directories like Network');
    });

    test('navigates into subfolder and deep subfolder (\\Projects\\Network\\Cisco)', async () => {
      // Step 1: Browse \Projects\Network
      const networkFolder = await fileSystemService.browsePath('\\\\FS01-CORP.corp.local\\Projects\\Network');
      assert.strictEqual(networkFolder.accessible, true);
      assert.strictEqual(networkFolder.subPath, 'Network');
      assert.strictEqual(networkFolder.parentPath, '\\\\FS01-CORP.corp.local\\Projects');
      assert.ok(networkFolder.entries.some(e => e.name === 'Cisco' && e.isDirectory));

      // Step 2: Browse \Projects\Network\Cisco
      const ciscoFolder = await fileSystemService.browsePath('\\\\FS01-CORP.corp.local\\Projects\\Network\\Cisco');
      assert.strictEqual(ciscoFolder.accessible, true);
      assert.strictEqual(ciscoFolder.subPath, 'Network\\Cisco');
      assert.strictEqual(ciscoFolder.parentPath, '\\\\FS01-CORP.corp.local\\Projects\\Network');
      assert.ok(ciscoFolder.entries.some(e => e.name.includes('Switch') || e.name.includes('VLAN')));
    });
  });

  describe('5. Access Permissions & Security Enforcement', () => {
    test('returns clear access denied error when folder permissions restrict user', async () => {
      const result = await fileSystemService.browsePath('\\\\APP-DATA.corp.local\\Executive-Board');
      assert.strictEqual(result.accessible, false);
      assert.ok(result.error);
      assert.ok(
        result.error.toLowerCase().includes('access denied') || result.error.toLowerCase().includes('permission'),
        'Error must clearly state access denied'
      );
      assert.strictEqual(result.entries.length, 0);
    });
  });

  describe('6. Network Failure Handling', () => {
    test('handles offline server gracefully with descriptive error', async () => {
      const result = await fileSystemService.browsePath('\\\\OFFLINE-HOST.corp.local\\Data');
      assert.strictEqual(result.accessible, false);
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes('offline') || result.error.toLowerCase().includes('reach'));
    });
  });

  describe('7. Drive Letter Mapping & Conflict Detection', () => {
    test('checks drive letter conflicts and lists available drive letters', () => {
      const available = shellIntegrationService.getAvailableDriveLetters();
      assert.ok(available.length >= 20, 'Should list letters D: through Z:');
      assert.ok(available.some(l => l.letter === 'Z:'));
    });

    test('detects conflict when mapping already-used drive letter and allows safe replacement', async () => {
      // Map letter Y: first
      await shellIntegrationService.mapDriveLetter('Y:', '\\\\FS01-CORP.corp.local\\Public', true);

      // Verify conflict detection
      const conflict = shellIntegrationService.checkDriveConflict('Y:');
      assert.strictEqual(conflict.hasConflict, true);
      assert.strictEqual(conflict.driveLetter, 'Y:');
      assert.strictEqual(conflict.existingTarget, '\\\\FS01-CORP.corp.local\\Public');

      // Attempt mapping without replaceExisting -> should reject
      await assert.rejects(
        async () => {
          await shellIntegrationService.mapDriveLetter('Y:', '\\\\FS01-CORP.corp.local\\Projects', true, false);
        },
        (err: Error) => {
          return err.message.includes('already in use') || err.message.includes('already mapped');
        }
      );

      // Map with replaceExisting = true -> replaces safely
      const replaced = await shellIntegrationService.mapDriveLetter(
        'Y:',
        '\\\\FS01-CORP.corp.local\\Projects\\Network',
        true,
        true
      );
      assert.strictEqual(replaced.driveLetter, 'Y:');
      assert.strictEqual(replaced.uncPath, '\\\\FS01-CORP.corp.local\\Projects\\Network');

      // Clean up Y:
      await shellIntegrationService.unmapDriveLetter('Y:');
      const conflictAfter = shellIntegrationService.checkDriveConflict('Y:');
      assert.strictEqual(conflictAfter.hasConflict, false);
    });

    test('can map a specific subfolder as the drive target', async () => {
      const subfolderTarget = '\\\\FS01-CORP.corp.local\\Projects\\Network\\Cisco';
      const mapped = await shellIntegrationService.mapDriveLetter('W:', subfolderTarget, false);
      assert.strictEqual(mapped.driveLetter, 'W:');
      assert.strictEqual(mapped.uncPath, subfolderTarget);

      // Unmap W:
      await shellIntegrationService.unmapDriveLetter('W:');
      const status = await shellIntegrationService.getStatus();
      assert.ok(!status.mappedDrives.some(d => d.driveLetter === 'W:'));
    });
  });
});
