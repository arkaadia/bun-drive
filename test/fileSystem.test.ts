import { test, describe } from 'node:test';
import assert from 'node:assert';
import { fileSystemService, WindowsFileSystemService } from '../src/core/fileSystem.js';

describe('WindowsFileSystemService', () => {
  test('parses UNC paths accurately', () => {
    const p1 = WindowsFileSystemService.parseUncPath('\\\\FS01\\Public');
    assert.strictEqual(p1.server, 'FS01');
    assert.strictEqual(p1.share, 'Public');
    assert.strictEqual(p1.subPath, '');

    const p2 = WindowsFileSystemService.parseUncPath('\\\\FS01-CORP.domain.com\\Marketing\\2026\\Q4');
    assert.strictEqual(p2.server, 'FS01-CORP.domain.com');
    assert.strictEqual(p2.share, 'Marketing');
    assert.strictEqual(p2.subPath, '2026\\Q4');
  });

  test('formats byte sizes correctly', () => {
    assert.strictEqual(WindowsFileSystemService.formatBytes(0), '0 B');
    assert.strictEqual(WindowsFileSystemService.formatBytes(1024), '1 KB');
    assert.strictEqual(WindowsFileSystemService.formatBytes(1048576), '1 MB');
    assert.strictEqual(WindowsFileSystemService.formatBytes(1073741824), '1 GB');
  });

  test('browses network share root path and enumerates files and folders', async () => {
    const result = await fileSystemService.browsePath('\\\\FS01-CORP\\Public');
    assert.ok(result.accessible, 'Share root must be accessible');
    assert.ok(result.entries.length > 0, 'Should contain folder items');
    assert.strictEqual(result.server, 'FS01-CORP');
    assert.strictEqual(result.share, 'Public');

    const directories = result.entries.filter(e => e.isDirectory);
    const files = result.entries.filter(e => !e.isDirectory);
    assert.ok(directories.length > 0, 'Should contain directories');
    assert.ok(files.length > 0, 'Should contain files');

    // Verify directory entry properties
    const dir = directories[0];
    assert.ok(dir.name);
    assert.ok(dir.uncPath.startsWith('\\\\'));
    assert.strictEqual(dir.isDirectory, true);

    // Verify file entry properties
    const file = files[0];
    assert.ok(file.extension);
    assert.ok(file.size > 0);
    assert.ok(file.formattedSize);
  });

  test('browses subfolder and populates parentPath for navigation', async () => {
    const result = await fileSystemService.browsePath('\\\\FS01-CORP\\Public\\Company-Templates');
    assert.ok(result.accessible);
    assert.strictEqual(result.parentPath, '\\\\FS01-CORP\\Public');
    assert.ok(result.entries.length > 0);
  });
});
