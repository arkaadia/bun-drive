/**
 * Bun-Drive Windows Installer Build Automation Script
 * 
 * Orchestrates full reproducible build pipeline:
 * 1. Build frontend distribution bundle (dist/)
 * 2. Compile standalone Windows x64 binary (Bun-Drive.exe)
 * 3. Stage production application files (zero secrets, zero dev tooling)
 * 4. Generate NSIS installer configuration script
 * 5. Compile NSIS installer binary (dist-installer/Bun-Drive-Setup-1.0.0.exe)
 * 6. Verify installer artifact integrity
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { InstallerBlueprintRegistry, INSTALLER_VERSION, APPLICATION_NAME } from '../src/core/installerBlueprint.js';

const ROOT_DIR = path.resolve(import.meta.dirname ? import.meta.dirname : path.dirname(new URL(import.meta.url).pathname), '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'staging');
const INSTALLER_DIR = path.join(ROOT_DIR, 'installer');
const DIST_INSTALLER_DIR = path.join(ROOT_DIR, 'dist-installer');
const NSI_FILE = path.join(INSTALLER_DIR, 'bun-drive.nsi');
const OUTPUT_EXE = path.join(DIST_INSTALLER_DIR, `Bun-Drive-Setup-${INSTALLER_VERSION}.exe`);

console.log(`================================================================`);
console.log(`Building Production Windows Installer: ${APPLICATION_NAME} v${INSTALLER_VERSION}`);
console.log(`Working Directory: ${ROOT_DIR}`);
console.log(`================================================================`);

// 1. Build frontend distribution
console.log('\n[1/6] Building production web frontend (npm run build)...');
execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

if (!fs.existsSync(path.join(ROOT_DIR, 'dist', 'index.html'))) {
  throw new Error('Frontend build failed: dist/index.html not found.');
}

// 2. Prepare staging directory
console.log('\n[2/6] Preparing clean staging directory...');
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(path.join(STAGING_DIR, 'scripts'), { recursive: true });
fs.mkdirSync(DIST_INSTALLER_DIR, { recursive: true });
fs.mkdirSync(INSTALLER_DIR, { recursive: true });

// 3. Compile standalone Windows executable
console.log('\n[3/6] Compiling standalone Windows x64 binary with Bun...');
const standaloneEntry = path.join(ROOT_DIR, 'src', 'standalone.ts');
const targetExe = path.join(STAGING_DIR, 'Bun-Drive.exe');

const bunArgs = [
  'bun', 'build',
  '--compile',
  '--target=bun-windows-x64',
  '--production',
  '--windows-hide-console'
];

if (process.platform === 'win32') {
  bunArgs.push(
    `--windows-title="${APPLICATION_NAME}"`,
    '--windows-publisher="Bun-Drive Team"',
    `--windows-version="${INSTALLER_VERSION}.0"`,
    '--windows-description="Bun-Drive Active Directory Explorer Integration"'
  );
}

bunArgs.push(`"${standaloneEntry}"`, '--outfile', `"${targetExe}"`);
const bunCompileCommand = bunArgs.join(' ');

console.log(`Executing: ${bunCompileCommand}`);
execSync(bunCompileCommand, { cwd: ROOT_DIR, stdio: 'inherit' });

if (!fs.existsSync(targetExe)) {
  throw new Error(`Executable compilation failed: ${targetExe} not found.`);
}
const exeSizeMb = (fs.statSync(targetExe).size / (1024 * 1024)).toFixed(2);
console.log(`Standalone executable compiled successfully: ${targetExe} (${exeSizeMb} MB)`);

// 4. Stage runtime assets
console.log('\n[4/6] Staging runtime assets...');
// Copy PowerShell scripts
fs.copyFileSync(
  path.join(ROOT_DIR, 'scripts', 'bun-drive-discovery.ps1'),
  path.join(STAGING_DIR, 'scripts', 'bun-drive-discovery.ps1')
);
fs.copyFileSync(
  path.join(ROOT_DIR, 'scripts', 'bun-drive-shell-mount.ps1'),
  path.join(STAGING_DIR, 'scripts', 'bun-drive-shell-mount.ps1')
);

// Copy dist directory
fs.cpSync(path.join(ROOT_DIR, 'dist'), path.join(STAGING_DIR, 'dist'), { recursive: true });

// Validate staging directory
const validation = InstallerBlueprintRegistry.validateStagingDirectory(STAGING_DIR);
if (!validation.valid) {
  console.error('Staging validation errors:', validation);
  throw new Error(`Staging validation failed: Missing=${validation.missingFiles.join(', ')}, Forbidden=${validation.forbiddenFiles.join(', ')}`);
}
console.log('Staging validation PASSED: zero secrets, required runtime assets present.');

// 5. Generate NSIS installer script
console.log('\n[5/6] Generating NSIS installer script...');
// Generate nsi with relative paths from installer/ directory
const nsiContent = InstallerBlueprintRegistry.generateNsisScript('../build/staging', '../dist-installer');
fs.writeFileSync(NSI_FILE, nsiContent, 'utf8');
console.log(`NSIS script generated at: ${NSI_FILE}`);

// 6. Compile installer with makensis
console.log('\n[6/6] Compiling installer with makensis...');
const makensisCommand = `makensis "${NSI_FILE}"`;
console.log(`Executing: ${makensisCommand}`);
execSync(makensisCommand, { cwd: ROOT_DIR, stdio: 'inherit' });

if (!fs.existsSync(OUTPUT_EXE)) {
  throw new Error(`Installer compilation failed: ${OUTPUT_EXE} not found.`);
}

const installerSizeMb = (fs.statSync(OUTPUT_EXE).size / (1024 * 1024)).toFixed(2);
console.log(`\n================================================================`);
console.log(`SUCCESS! Production Windows Installer created:`);
console.log(`Artifact: ${OUTPUT_EXE}`);
console.log(`Size:     ${installerSizeMb} MB (Solid LZMA compressed)`);
console.log(`================================================================\n`);
