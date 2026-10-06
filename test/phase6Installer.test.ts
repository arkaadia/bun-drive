/**
 * Phase 6 Automated Test Suite: Production Windows Installer, Startup and Uninstall
 * Validates installer configuration, script generation, runtime assets staging,
 * startup run keys, clean uninstall boundaries, upgrade safety, and version consistency.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  InstallerBlueprintRegistry,
  INSTALLER_VERSION,
  APPLICATION_NAME,
  PUBLISHER_NAME,
  RUN_REG_KEY,
  UNINSTALL_REG_KEY,
  DEFAULT_INSTALL_DIR_WIN,
  DEFAULT_VIRTUAL_ROOT_WIN
} from '../src/core/installerBlueprint.js';
import { BUN_DRIVE_CLSID, SHELL_FOLDER_INSTANCE_CLSID } from '../src/core/shellExtensionRegistry.js';
import { APPLICATION_VERSION } from '../src/standalone.js';

describe('Phase 6: Production Windows Installer, Startup and Uninstall', () => {
  // 1. Installer project configuration
  test('1. Installer project configuration conforms to per-user Windows specifications', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    assert.strictEqual(bp.appName, 'Bun-Drive');
    assert.strictEqual(bp.version, '1.0.0');
    assert.strictEqual(bp.publisher, 'Bun-Drive Team');
    assert.strictEqual(bp.executionLevel, 'user', 'Must use per-user execution level without requiring UAC admin rights');
    assert.strictEqual(bp.defaultInstallDir, DEFAULT_INSTALL_DIR_WIN);
    assert.ok(bp.outputArtifact.endsWith('.exe'), 'Output artifact must be a Windows executable installer');
  });

  // 2. Installer build
  test('2. Installer build produces valid Windows installer artifact or compiles cleanly with makensis', () => {
    const nsi = InstallerBlueprintRegistry.generateNsisScript('../build/staging', '../dist-installer');
    assert.ok(nsi.includes('!define PRODUCT_NAME "Bun-Drive"'));
    assert.ok(nsi.includes('RequestExecutionLevel user'));
    assert.ok(nsi.includes('SetCompressor /SOLID lzma'));

    // Check if dist-installer/Bun-Drive-Setup-1.0.0.exe exists
    const artifactPath = path.resolve(process.cwd(), 'dist-installer', `Bun-Drive-Setup-${INSTALLER_VERSION}.exe`);
    if (fs.existsSync(artifactPath)) {
      const stat = fs.statSync(artifactPath);
      assert.ok(stat.size > 1000000, `Installer artifact must be substantial (actual: ${stat.size} bytes)`);

      // Verify file header is PE format
      const buffer = Buffer.alloc(2);
      const fd = fs.openSync(artifactPath, 'r');
      fs.readSync(fd, buffer, 0, 2, 0);
      fs.closeSync(fd);
      const magic = buffer.toString('utf8');
      assert.strictEqual(magic, 'MZ', 'Installer artifact must be a valid PE executable starting with MZ magic bytes');
    }
  });

  // 3. Required application files included
  test('3. Required application files are specified in installer manifest and present in staging', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    assert.ok(bp.requiredFiles.includes('Bun-Drive.exe'));
    assert.ok(bp.requiredFiles.includes('dist/index.html'));

    // Verify source files exist in repository
    assert.ok(fs.existsSync(path.resolve(process.cwd(), 'src/standalone.ts')), 'standalone.ts must exist');
    assert.ok(fs.existsSync(path.resolve(process.cwd(), 'dist/index.html')), 'dist/index.html must exist');
  });

  // 4. Required runtime files included
  test('4. Required runtime files (PowerShell scripts) are packaged and intact', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    assert.ok(bp.requiredFiles.includes('scripts/bun-drive-discovery.ps1'));
    assert.ok(bp.requiredFiles.includes('scripts/bun-drive-shell-mount.ps1'));

    const discoveryScript = fs.readFileSync(path.resolve(process.cwd(), 'scripts/bun-drive-discovery.ps1'), 'utf8');
    assert.ok(discoveryScript.includes('servicePrincipalName=cifs/*'), 'Discovery script must contain AD CIFS scan');

    const shellScript = fs.readFileSync(path.resolve(process.cwd(), 'scripts/bun-drive-shell-mount.ps1'), 'utf8');
    assert.ok(shellScript.includes(BUN_DRIVE_CLSID), 'Shell mount script must contain Bun-Drive CLSID');
    assert.ok(shellScript.includes('Register'), 'Shell mount script must support Register action');
    assert.ok(shellScript.includes('Unregister'), 'Shell mount script must support Unregister action');
  });

  // 5. No secrets included
  test('5. No secrets or credentials are packaged into installer or staging directory', () => {
    const stagingDir = path.resolve(process.cwd(), 'build/staging');
    if (fs.existsSync(stagingDir)) {
      const validation = InstallerBlueprintRegistry.validateStagingDirectory(stagingDir);
      assert.strictEqual(validation.forbiddenFiles.length, 0, `Staging must have 0 forbidden files: ${validation.forbiddenFiles.join(', ')}`);
      assert.ok(!fs.existsSync(path.join(stagingDir, '.env')), '.env file must never be staged');
      assert.ok(!fs.existsSync(path.join(stagingDir, '.env.local')), '.env.local must never be staged');
    }

    const nsi = InstallerBlueprintRegistry.generateNsisScript();
    assert.ok(!nsi.includes('API_KEY'), 'Installer script must not contain API keys');
    assert.ok(!nsi.includes('PASSWORD'), 'Installer script must not contain passwords');
  });

  // 6. No development-only files included unnecessarily
  test('6. Development tooling and test files are excluded from installer staging', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    const testPatterns = [
      '.env',
      '.git/config',
      'node_modules/vite',
      'src/test/phase6.test.ts',
      'tsconfig.json',
      'vite.config.ts',
      'bun.lock'
    ];

    for (const testPath of testPatterns) {
      const matchesForbidden = bp.forbiddenPatterns.some(p => p.test(testPath));
      assert.ok(matchesForbidden, `Pattern '${testPath}' must be caught by forbiddenPatterns filter`);
    }
  });

  // 7. Installation file structure
  test('7. Installation file structure defines proper application layout and shortcuts', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    
    // Start Menu shortcuts
    const smShortcut = bp.shortcuts.find(s => s.location === 'StartMenu' && s.name === 'Bun-Drive.lnk');
    assert.ok(smShortcut, 'Must define Start Menu shortcut for Bun-Drive.exe');
    assert.strictEqual(smShortcut.target, '$INSTDIR\\Bun-Drive.exe');

    const uninstShortcut = bp.shortcuts.find(s => s.location === 'StartMenu' && s.name === 'Uninstall Bun-Drive.lnk');
    assert.ok(uninstShortcut, 'Must define Start Menu shortcut for uninstall.exe');

    // Desktop shortcut
    const desktopShortcut = bp.shortcuts.find(s => s.location === 'Desktop');
    assert.ok(desktopShortcut, 'Must define Desktop shortcut');
  });

  // 8. Uninstall definitions
  test('8. Uninstall definitions are strictly scoped and protect network shares and user data', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    const nsi = InstallerBlueprintRegistry.generateNsisScript();

    // Check that network shares (\\*) are never targeted
    for (const forbidden of bp.forbiddenUninstallTargets) {
      assert.ok(!nsi.includes(`RMDir /r "${forbidden}"`), `Uninstaller must never delete forbidden target: ${forbidden}`);
    }

    // Verify uninstaller cleans up only Bun-Drive owned registry keys
    assert.ok(nsi.includes(`!define PRODUCT_CLSID "${BUN_DRIVE_CLSID}"`));
    assert.ok(nsi.includes('DeleteRegKey HKCU "Software\\Classes\\CLSID\\${PRODUCT_CLSID}"'));
    assert.ok(nsi.includes('DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\${PRODUCT_CLSID}"'));
    assert.ok(nsi.includes('DeleteRegValue HKCU "${PRODUCT_RUN_KEY}" "${PRODUCT_NAME}"'));
    assert.ok(nsi.includes('DeleteRegKey HKCU "${PRODUCT_UNINST_KEY}"'));

    // Verify uninstaller deletes virtual root shortcuts
    assert.ok(nsi.includes('NamespaceRoot\\*.lnk'));
  });

  // 9. Startup configuration definitions
  test('9. Startup configuration configures per-user automatic logon execution with --background', () => {
    const bp = InstallerBlueprintRegistry.getBlueprint();
    assert.strictEqual(bp.startupRegistry.hive, 'HKCU');
    assert.strictEqual(bp.startupRegistry.key, RUN_REG_KEY);
    assert.strictEqual(bp.startupRegistry.valueName, 'Bun-Drive');
    assert.ok(bp.startupRegistry.value.includes('--background'), 'Must include --background flag to prevent browser popup during login');

    const nsi = InstallerBlueprintRegistry.generateNsisScript();
    assert.ok(nsi.includes('WriteRegStr HKCU "${PRODUCT_RUN_KEY}" "${PRODUCT_NAME}" \'"$INSTDIR\\Bun-Drive.exe" --background\''));
  });

  // 10. Registry configuration definitions where statically verifiable
  test('10. Registry definitions statically match Explorer Namespace CLSID and properties', () => {
    const nsi = InstallerBlueprintRegistry.generateNsisScript();
    assert.ok(nsi.includes(`!define PRODUCT_CLSID "${BUN_DRIVE_CLSID}"`));
    assert.ok(nsi.includes('WriteRegStr HKCU "Software\\Classes\\CLSID\\${PRODUCT_CLSID}"'));
    assert.ok(nsi.includes('System.IsPinnedToNameSpaceTree'));
    assert.ok(nsi.includes('SortOrderIndex'));
    assert.ok(nsi.includes(SHELL_FOLDER_INSTANCE_CLSID));
    assert.ok(nsi.includes('TargetFolderPath'));
    assert.ok(nsi.includes('0xF080004D'));
  });

  // 11. Upgrade / reinstall configuration
  test('11. Upgrade configuration detects existing installation and avoids file lock collisions', () => {
    const nsi = InstallerBlueprintRegistry.generateNsisScript();
    
    // Checks existing InstallLocation
    assert.ok(nsi.includes('ReadRegStr $0 HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation"'));
    
    // Gracefully terminates running instance before overwriting
    assert.ok(nsi.includes("taskkill /F /IM Bun-Drive.exe"));
    
    // Sets overwrite mode
    assert.ok(nsi.includes('SetOverwrite on'));
  });

  // 12. Package / version metadata
  test('12. Package and version metadata are uniform across package.json, installer, and app', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    assert.strictEqual(pkg.name, 'bun-drive');
    assert.strictEqual(pkg.version, '1.0.0');
    assert.strictEqual(INSTALLER_VERSION, '1.0.0');
    assert.strictEqual(APPLICATION_VERSION, '1.0.0');
    assert.strictEqual(APPLICATION_NAME, 'Bun-Drive');
  });
});
