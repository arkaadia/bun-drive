/**
 * Bun-Drive Phase 6: Production Windows Installer & Lifecycle Blueprint
 * Defines the installation architecture, file manifest, per-user registry specification,
 * startup run configuration, clean uninstallation boundaries, and NSIS generation engine.
 */

import path from 'path';
import fs from 'fs';
import { BUN_DRIVE_CLSID, SHELL_FOLDER_INSTANCE_CLSID } from './shellExtensionRegistry.js';

export const INSTALLER_VERSION = '1.0.0';
export const APPLICATION_NAME = 'Bun-Drive';
export const PUBLISHER_NAME = 'Bun-Drive Team';
export const DEFAULT_INSTALL_DIR_WIN = '$LOCALAPPDATA\\Programs\\Bun-Drive';
export const DEFAULT_VIRTUAL_ROOT_WIN = '$LOCALAPPDATA\\Bun-Drive\\NamespaceRoot';
export const UNINSTALL_REG_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Bun-Drive';
export const RUN_REG_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';

export interface InstallerBlueprint {
  appName: string;
  version: string;
  publisher: string;
  executionLevel: 'user' | 'admin';
  defaultInstallDir: string;
  outputArtifact: string;
  requiredFiles: string[];
  forbiddenPatterns: RegExp[];
  shortcuts: {
    name: string;
    target: string;
    location: 'StartMenu' | 'Desktop';
    description: string;
    icon?: string;
  }[];
  startupRegistry: {
    hive: 'HKCU';
    key: string;
    valueName: string;
    value: string;
  };
  uninstallRegistry: {
    hive: 'HKCU';
    key: string;
    values: Record<string, string | number>;
  };
  safeUninstallPaths: string[];
  forbiddenUninstallTargets: string[];
}

export class InstallerBlueprintRegistry {
  /**
   * Returns the architectural specification for the Windows installer and uninstaller
   */
  public static getBlueprint(): InstallerBlueprint {
    return {
      appName: APPLICATION_NAME,
      version: INSTALLER_VERSION,
      publisher: PUBLISHER_NAME,
      executionLevel: 'user', // Standard Windows domain user, no elevated Administrator UAC required
      defaultInstallDir: DEFAULT_INSTALL_DIR_WIN,
      outputArtifact: 'Bun-Drive-Setup-1.0.0.exe',
      requiredFiles: [
        'Bun-Drive.exe',
        'scripts/bun-drive-discovery.ps1',
        'scripts/bun-drive-shell-mount.ps1',
        'dist/index.html'
      ],
      forbiddenPatterns: [
        /\.env(\..+)?$/,
        /^\.git/,
        /node_modules/,
        /\.test\.ts$/,
        /vite\.config\.ts$/,
        /tsconfig\.json$/,
        /bun\.lock$/
      ],
      shortcuts: [
        {
          name: 'Bun-Drive.lnk',
          target: '$INSTDIR\\Bun-Drive.exe',
          location: 'StartMenu',
          description: 'Bun-Drive Active Directory Explorer Integration'
        },
        {
          name: 'Uninstall Bun-Drive.lnk',
          target: '$INSTDIR\\uninstall.exe',
          location: 'StartMenu',
          description: 'Uninstall Bun-Drive'
        },
        {
          name: 'Bun-Drive.lnk',
          target: '$INSTDIR\\Bun-Drive.exe',
          location: 'Desktop',
          description: 'Bun-Drive Active Directory Explorer Integration'
        }
      ],
      startupRegistry: {
        hive: 'HKCU',
        key: RUN_REG_KEY,
        valueName: 'Bun-Drive',
        value: '"$INSTDIR\\Bun-Drive.exe" --background'
      },
      uninstallRegistry: {
        hive: 'HKCU',
        key: UNINSTALL_REG_KEY,
        values: {
          DisplayName: APPLICATION_NAME,
          DisplayVersion: INSTALLER_VERSION,
          Publisher: PUBLISHER_NAME,
          DisplayIcon: '$INSTDIR\\Bun-Drive.exe,0',
          UninstallString: '"$INSTDIR\\uninstall.exe"',
          QuietUninstallString: '"$INSTDIR\\uninstall.exe" /S',
          InstallLocation: '$INSTDIR',
          URLInfoAbout: 'https://github.com/arkaadia/bun-drive',
          NoModify: 1,
          NoRepair: 1
        }
      },
      safeUninstallPaths: [
        '$INSTDIR',
        '$SMPROGRAMS\\Bun-Drive',
        '$DESKTOP\\Bun-Drive.lnk',
        DEFAULT_VIRTUAL_ROOT_WIN
      ],
      forbiddenUninstallTargets: [
        '\\\\*',                 // Network shares / UNC paths
        '\\*\\*',               // SMB server contents
        '$DOCUMENTS',           // User Documents
        '$USERPROFILE\\Desktop',// Whole desktop
        'C:\\',                 // System drives
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' // The key itself, only delete the Bun-Drive value!
      ]
    };
  }

  /**
   * Generates a fully compilable, production-ready NSIS installer script (.nsi)
   */
  public static generateNsisScript(stagingDirRelative = '../build/staging', outDirRelative = '../dist-installer'): string {
    const bp = this.getBlueprint();

    return `; ==============================================================================
; Bun-Drive Production Windows Installer Script (NSIS Modern UI 2)
; Target: Windows 10/11 & Windows Server x64, Per-User Installation (Zero Admin Privileges)
; ==============================================================================

!define PRODUCT_NAME "${bp.appName}"
!define PRODUCT_VERSION "${bp.version}"
!define PRODUCT_PUBLISHER "${bp.publisher}"
!define PRODUCT_WEB_SITE "https://github.com/arkaadia/bun-drive"
!define PRODUCT_UNINST_KEY "${bp.uninstallRegistry.key}"
!define PRODUCT_UNINST_ROOT_KEY "${bp.uninstallRegistry.hive}"
!define PRODUCT_RUN_KEY "${bp.startupRegistry.key}"
!define PRODUCT_CLSID "${BUN_DRIVE_CLSID}"
!define SHELL_INSTANCE_CLSID "${SHELL_FOLDER_INSTANCE_CLSID}"

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel ${bp.executionLevel}

; Output executable
OutFile "${outDirRelative}/${bp.outputArtifact}"
InstallDir "${bp.defaultInstallDir}"

; Modern UI 2 Configuration
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define MUI_ABORTWARNING

; Installer Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY

; Components / Options selection
Page custom OptionsPageCreate OptionsPageLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\Bun-Drive.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Bun-Drive now"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Language
!insertmacro MUI_LANGUAGE "English"

; Variables for User Options
Var Dialog
Var CheckboxDesktop
Var CheckboxStartup
Var CheckboxExplorer
Var CreateDesktopShortcut
Var EnableStartup
Var RegisterExplorer

Function .onInit
  SetRegView 64
  ; Detect prior installation to support clean upgrades/reinstalls
  ReadRegStr $0 HKCU "\${PRODUCT_UNINST_KEY}" "InstallLocation"
  \${If} $0 != ""
    StrCpy $INSTDIR $0
  \${EndIf}

  ; Defaults
  StrCpy $CreateDesktopShortcut "1"
  StrCpy $EnableStartup "1"
  StrCpy $RegisterExplorer "1"
FunctionEnd

Function OptionsPageCreate
  !insertmacro MUI_HEADER_TEXT "Configuration & Integration Options" "Select Windows Explorer and system integration preferences."
  nsDialogs::Create 1018
  Pop $Dialog
  \${If} $Dialog == error
    Abort
  \${EndIf}

  \${NSD_CreateCheckbox} 0 10u 100% 12u "Create Desktop shortcut"
  Pop $CheckboxDesktop
  \${NSD_SetState} $CheckboxDesktop $CreateDesktopShortcut

  \${NSD_CreateCheckbox} 0 30u 100% 12u "Start Bun-Drive automatically at Windows logon"
  Pop $CheckboxStartup
  \${NSD_SetState} $CheckboxStartup $EnableStartup

  \${NSD_CreateCheckbox} 0 50u 100% 12u "Register Bun-Drive in Windows File Explorer Navigation Pane"
  Pop $CheckboxExplorer
  \${NSD_SetState} $CheckboxExplorer $RegisterExplorer

  nsDialogs::Show
FunctionEnd

Function OptionsPageLeave
  \${NSD_GetState} $CheckboxDesktop $CreateDesktopShortcut
  \${NSD_GetState} $CheckboxStartup $EnableStartup
  \${NSD_GetState} $CheckboxExplorer $RegisterExplorer
FunctionEnd

; ==============================================================================
; Installation Section
; ==============================================================================
Section "MainSection" SEC01
  SetRegView 64
  ; Terminate any existing running instance before replacing files (Upgrade safe)
  DetailPrint "Checking for running instances of Bun-Drive..."
  nsExec::Exec 'taskkill /F /IM Bun-Drive.exe'
  Sleep 500

  SetOutPath "$INSTDIR"
  SetOverwrite on

  ; Install compiled standalone application executable
  File "${stagingDirRelative}/Bun-Drive.exe"

  ; Install native PowerShell integration scripts
  SetOutPath "$INSTDIR\\scripts"
  File "${stagingDirRelative}/scripts/bun-drive-discovery.ps1"
  File "${stagingDirRelative}/scripts/bun-drive-shell-mount.ps1"

  ; Install precompiled web frontend distribution
  SetOutPath "$INSTDIR\\dist"
  File /r "${stagingDirRelative}/dist/*.*"

  ; Create uninstaller
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\\uninstall.exe"

  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\\Bun-Drive"
  CreateShortcut "$SMPROGRAMS\\Bun-Drive\\Bun-Drive.lnk" "$INSTDIR\\Bun-Drive.exe" "" "$INSTDIR\\Bun-Drive.exe" 0
  CreateShortcut "$SMPROGRAMS\\Bun-Drive\\Uninstall Bun-Drive.lnk" "$INSTDIR\\uninstall.exe" "" "$INSTDIR\\uninstall.exe" 0

  ; Create Desktop shortcut if selected
  \${If} $CreateDesktopShortcut == "1"
    CreateShortcut "$DESKTOP\\Bun-Drive.lnk" "$INSTDIR\\Bun-Drive.exe" "" "$INSTDIR\\Bun-Drive.exe" 0
  \${EndIf}

  ; Windows Startup Registration (HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run)
  \${If} $EnableStartup == "1"
    DetailPrint "Configuring automatic startup on Windows logon..."
    WriteRegStr HKCU "\${PRODUCT_RUN_KEY}" "\${PRODUCT_NAME}" '"$INSTDIR\\Bun-Drive.exe" --background'
  \${Else}
    DeleteRegValue HKCU "\${PRODUCT_RUN_KEY}" "\${PRODUCT_NAME}"
  \${EndIf}

  ; Windows Explorer Shell Namespace Extension Registration
  \${If} $RegisterExplorer == "1"
    DetailPrint "Registering Bun-Drive Explorer Shell Namespace in HKCU..."

    ; 1. CLSID Registration
    WriteRegStr HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}" "" "Bun-Drive"
    WriteRegStr HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}" "InfoTip" "Active Directory Network Shares for Current Windows User"
    WriteRegDWORD HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}" "System.IsPinnedToNameSpaceTree" 1
    WriteRegDWORD HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}" "SortOrderIndex" 66

    ; 2. Default Icon
    WriteRegExpandStr HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\DefaultIcon" "" "%SystemRoot%\\system32\\imageres.dll,-1043"

    ; 3. InProcServer32 (shell32.dll proxy)
    WriteRegExpandStr HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\InProcServer32" "" "%SystemRoot%\\system32\\shell32.dll"
    WriteRegStr HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\InProcServer32" "ThreadingModel" "Apartment"

    ; 4. Instance CLSID -> ShellFolder Instance Handler
    WriteRegStr HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\Instance" "CLSID" "\${SHELL_INSTANCE_CLSID}"

    ; 5. InitPropertyBag -> Point to Virtual Root
    WriteRegDWORD HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\Instance\\InitPropertyBag" "Attributes" 17
    WriteRegExpandStr HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\Instance\\InitPropertyBag" "TargetFolderPath" "$LOCALAPPDATA\\Bun-Drive\\NamespaceRoot"

    ; 6. ShellFolder Attributes
    WriteRegDWORD HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\ShellFolder" "Attributes" 0xF080004D
    WriteRegDWORD HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}\\ShellFolder" "FolderValueFlags" 40

    ; 7. Desktop NameSpace entry
    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\\${PRODUCT_CLSID}" "" "Bun-Drive"

    ; 8. Hide redundant desktop icon surface
    WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel" "\${PRODUCT_CLSID}" 1

    ; Execute helper to ensure Virtual Root folder and initial shortcuts exist
    DetailPrint "Executing shell mount helper..."
    nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\\scripts\\bun-drive-shell-mount.ps1" -Action Register'
  \${EndIf}

  ; Calculate installed size for Add/Remove Programs
  \${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0

  ; Windows Add/Remove Programs (Apps & Features) Registration
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "DisplayName" "\${PRODUCT_NAME}"
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "DisplayVersion" "\${PRODUCT_VERSION}"
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "Publisher" "\${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\\Bun-Drive.exe,0"
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "UninstallString" '"$INSTDIR\\uninstall.exe"'
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\\uninstall.exe" /S'
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${PRODUCT_UNINST_KEY}" "URLInfoAbout" "\${PRODUCT_WEB_SITE}"
  WriteRegDWORD HKCU "\${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "\${PRODUCT_UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "\${PRODUCT_UNINST_KEY}" "EstimatedSize" $0
SectionEnd

; ==============================================================================
; Uninstallation Section
; Strictly scoped: NEVER deletes network share contents, SMB files, or user data.
; ==============================================================================
Section "Uninstall"
  SetRegView 64
  DetailPrint "Stopping Bun-Drive process..."
  nsExec::Exec 'taskkill /F /IM Bun-Drive.exe'
  Sleep 500

  DetailPrint "Unregistering Windows Explorer Shell Namespace..."
  ; 1. Unregister via PowerShell script if present
  \${If} \${FileExists} "$INSTDIR\\scripts\\bun-drive-shell-mount.ps1"
    nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\\scripts\\bun-drive-shell-mount.ps1" -Action Unregister'
  \${EndIf}

  ; 2. Cleanly delete Bun-Drive CLSID & Namespace Registry Keys
  DeleteRegKey HKCU "Software\\Classes\\CLSID\\\${PRODUCT_CLSID}"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\\${PRODUCT_CLSID}"
  DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel" "\${PRODUCT_CLSID}"

  ; 3. Cleanly remove Windows Startup run entry
  DetailPrint "Removing startup registration..."
  DeleteRegValue HKCU "\${PRODUCT_RUN_KEY}" "\${PRODUCT_NAME}"

  ; 4. Cleanly remove Add/Remove Programs registry entry
  DeleteRegKey HKCU "\${PRODUCT_UNINST_KEY}"

  ; 5. Cleanly delete Start Menu & Desktop shortcuts
  DetailPrint "Removing shortcuts..."
  Delete "$SMPROGRAMS\\Bun-Drive\\Bun-Drive.lnk"
  Delete "$SMPROGRAMS\\Bun-Drive\\Uninstall Bun-Drive.lnk"
  RMDir "$SMPROGRAMS\\Bun-Drive"
  Delete "$DESKTOP\\Bun-Drive.lnk"

  ; 6. Cleanly clean up Virtual Namespace Root shortcuts and directory
  DetailPrint "Cleaning virtual namespace root..."
  Delete "$LOCALAPPDATA\\Bun-Drive\\NamespaceRoot\\*.lnk"
  Delete "$LOCALAPPDATA\\Bun-Drive\\NamespaceRoot\\desktop.ini"
  RMDir "$LOCALAPPDATA\\Bun-Drive\\NamespaceRoot"
  ; Remove %LOCALAPPDATA%\\Bun-Drive only if empty (preserves user state/logs if any)
  RMDir "$LOCALAPPDATA\\Bun-Drive"

  ; 7. Remove installed application files
  DetailPrint "Removing installed application files..."
  Delete "$INSTDIR\\Bun-Drive.exe"
  Delete "$INSTDIR\\uninstall.exe"
  RMDir /r "$INSTDIR\\scripts"
  RMDir /r "$INSTDIR\\dist"
  RMDir "$INSTDIR"

  SetAutoClose true
SectionEnd
`;
  }

  /**
   * Validate that a staging directory contains all required runtime assets and zero forbidden items
   */
  public static validateStagingDirectory(stagingDir: string): {
    valid: boolean;
    missingFiles: string[];
    forbiddenFiles: string[];
    details: {
      hasExe: boolean;
      hasDiscoveryScript: boolean;
      hasShellMountScript: boolean;
      hasDistAssets: boolean;
    };
  } {
    const bp = this.getBlueprint();
    const missingFiles: string[] = [];
    const forbiddenFiles: string[] = [];

    // Check required files
    for (const req of bp.requiredFiles) {
      const fullPath = path.join(stagingDir, req);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push(req);
      }
    }

    // Recursively scan staging directory for forbidden items
    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = path.relative(stagingDir, path.join(dir, entry.name));
        for (const pattern of bp.forbiddenPatterns) {
          if (pattern.test(entry.name) || pattern.test(relativePath)) {
            forbiddenFiles.push(relativePath);
          }
        }
        if (entry.isDirectory()) {
          scanDir(path.join(dir, entry.name));
        }
      }
    };
    scanDir(stagingDir);

    const hasExe = fs.existsSync(path.join(stagingDir, 'Bun-Drive.exe'));
    const hasDiscoveryScript = fs.existsSync(path.join(stagingDir, 'scripts', 'bun-drive-discovery.ps1'));
    const hasShellMountScript = fs.existsSync(path.join(stagingDir, 'scripts', 'bun-drive-shell-mount.ps1'));
    const hasDistAssets = fs.existsSync(path.join(stagingDir, 'dist', 'index.html'));

    return {
      valid: missingFiles.length === 0 && forbiddenFiles.length === 0,
      missingFiles,
      forbiddenFiles,
      details: {
        hasExe,
        hasDiscoveryScript,
        hasShellMountScript,
        hasDistAssets
      }
    };
  }
}
