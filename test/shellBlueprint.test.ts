import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ShellExtensionRegistry, BUN_DRIVE_CLSID, BUN_DRIVE_PROGID } from '../src/core/shellExtensionRegistry.js';

describe('ShellExtensionRegistry Architecture', () => {
  test('generates valid Windows Explorer shell namespace blueprint', () => {
    const bp = ShellExtensionRegistry.getBlueprint();
    assert.strictEqual(bp.clsid, BUN_DRIVE_CLSID);
    assert.strictEqual(bp.progId, BUN_DRIVE_PROGID);
    assert.strictEqual(bp.displayName, 'Bun-Drive');
    assert.strictEqual(bp.isPinnedToNameSpaceTree, true);
    assert.ok(bp.registryKeys.length >= 8, 'Should register all required Shell Namespace keys');

    // Verify pinned to namespace tree key
    const pinnedKey = bp.registryKeys.find(k => k.valueName === 'System.IsPinnedToNameSpaceTree');
    assert.ok(pinnedKey, 'Must have System.IsPinnedToNameSpaceTree');
    assert.strictEqual(pinnedKey.value, 1);

    // Verify GUID format: {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
    const guidRegex = /^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$/;
    assert.match(bp.clsid, guidRegex, 'CLSID must match Windows GUID format');
  });

  test('generates valid Windows Registry (.reg) exportable content', () => {
    const reg = ShellExtensionRegistry.generateRegistryFile();
    assert.ok(reg.startsWith('Windows Registry Editor Version 5.00'), 'Must contain standard Windows registry header');
    assert.ok(reg.includes(BUN_DRIVE_CLSID), 'Must contain Bun-Drive CLSID');
    assert.ok(reg.includes('System.IsPinnedToNameSpaceTree'), 'Must register navigation pane pin');
    assert.ok(reg.includes('Desktop\\NameSpace'), 'Must register Desktop namespace entry');
  });
});
