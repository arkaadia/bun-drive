import { test, describe } from 'node:test';
import assert from 'node:assert';
import { discoveryService } from '../src/core/discovery.js';

describe('ShareDiscoveryService', () => {
  test('discovers accessible network shares and filters access-denied shares', async () => {
    const result = await discoveryService.discoverShares();

    assert.ok(result, 'Discovery result must be defined');
    assert.ok(Array.isArray(result.shares), 'Shares must be an array');
    assert.ok(result.shares.length > 0, 'Should discover accessible domain shares');

    // Security requirement: Inaccessible/access-denied shares must be strictly excluded from the user's view
    for (const share of result.shares) {
      assert.strictEqual(
        share.isAccessible,
        true,
        `Share ${share.uncPath} in primary view MUST be accessible by user`
      );
      assert.ok(['Read', 'ReadWrite'].includes(share.accessLevel), 'Access level must be Read or ReadWrite');
      assert.ok(share.uncPath.startsWith('\\\\'), 'UNC path must start with double backslash');
      assert.ok(share.server, 'Server name must be present');
      assert.ok(share.name, 'Share name must be present');
      assert.ok(!share.name.endsWith('$'), 'Administrative hidden shares ($) must be excluded');
    }

    // Inaccessible shares counter must track unauthorized shares detected on domain servers
    assert.ok(result.inaccessibleSharesCount >= 0, 'Inaccessible count should be non-negative');
    assert.ok(result.scanDurationMs >= 0, 'Scan duration must be recorded');
  });

  test('probes specific server correctly', async () => {
    const shares = await discoveryService.probeServer('FS01-CORP.corp.local');
    assert.ok(Array.isArray(shares));
    for (const sh of shares) {
      assert.ok(sh.server.includes('FS01-CORP'));
      assert.strictEqual(sh.isAccessible, true);
    }
  });
});
