import { test, describe } from 'node:test';
import assert from 'node:assert';
import { identityService } from '../src/core/identity.js';

describe('WindowsIdentityService', () => {
  test('resolves Windows identity and domain context', async () => {
    const identity = await identityService.getCurrentIdentity(true);

    assert.ok(identity, 'Identity must be defined');
    assert.ok(identity.username, 'Username must be defined');
    assert.ok(identity.domain, 'Domain must be defined');
    assert.ok(identity.userSid, 'User SID must be defined');
    assert.ok(Array.isArray(identity.groups), 'Groups must be an array');
    assert.ok(identity.groups.length > 0, 'User should have at least one security group');
    assert.ok(typeof identity.isDomainJoined === 'boolean', 'isDomainJoined must be a boolean');
    assert.ok(['Kerberos', 'NTLM', 'Negotiate', 'Local'].includes(identity.authType), 'Valid Windows auth type');
  });

  test('caches identity for fast subsequent calls', async () => {
    const id1 = await identityService.getCurrentIdentity();
    const id2 = await identityService.getCurrentIdentity();
    assert.strictEqual(id1.username, id2.username);
    assert.strictEqual(id1.userSid, id2.userSid);
  });

  test('invalidates cache correctly when requested', async () => {
    identityService.invalidateCache();
    const freshIdentity = await identityService.getCurrentIdentity(true);
    assert.ok(freshIdentity.username);
  });
});
