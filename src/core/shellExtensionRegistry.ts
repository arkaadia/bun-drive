/**
 * Bun-Drive Shell Extension Registry Architecture & Phase 2 Shell Folder Instance Configuration
 * Implements per-user (HKCU) Windows Explorer Navigation Pane integration using
 * the native Shell Folder Instance proxy ({0E5AAE11-A475-4c5b-AB00-C66DE400274E})
 * bound to the Bun-Drive Virtual Namespace Root directory.
 * 
 * Target Explorer Architecture:
 * - COM CLSID: {B010D817-E923-4E87-9DC2-A74B29E309FA}
 * - Navigation Pane Pinned Node (System.IsPinnedToNameSpaceTree = 1)
 * - Explorer Desktop Namespace registration
 * - Shell Folder Instance TargetFolderPath -> %LOCALAPPDATA%\Bun-Drive\NamespaceRoot
 */

import { ShellExtensionBlueprint } from '../types/drive.js';

export const BUN_DRIVE_CLSID = '{B010D817-E923-4E87-9DC2-A74B29E309FA}';
export const BUN_DRIVE_PROGID = 'BunDrive.ShellNamespaceExtension.1';
export const SHELL_FOLDER_INSTANCE_CLSID = '{0E5AAE11-A475-4c5b-AB00-C66DE400274E}';
export const DEFAULT_VIRTUAL_ROOT_WIN = '%LOCALAPPDATA%\\Bun-Drive\\NamespaceRoot';

export class ShellExtensionRegistry {
  /**
   * Returns the architectural blueprint and registry schema for Windows Explorer
   */
  public static getBlueprint(customVirtualRoot?: string): ShellExtensionBlueprint {
    const targetFolder = customVirtualRoot || DEFAULT_VIRTUAL_ROOT_WIN;

    return {
      clsid: BUN_DRIVE_CLSID,
      progId: BUN_DRIVE_PROGID,
      displayName: 'Bun-Drive',
      description: 'Active Directory Network Shares for Current Windows User',
      iconPath: '%SystemRoot%\\system32\\imageres.dll,-1043',
      isPinnedToNameSpaceTree: true,
      sortOrderIndex: 66, // 0x42
      registryKeys: [
        // 1. Root CLSID Registration
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}`,
          valueName: '',
          type: 'REG_SZ',
          value: 'Bun-Drive'
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}`,
          valueName: 'InfoTip',
          type: 'REG_SZ',
          value: 'Active Directory Network Shares for Current Windows User'
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}`,
          valueName: 'System.IsPinnedToNameSpaceTree',
          type: 'REG_DWORD',
          value: 1
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}`,
          valueName: 'SortOrderIndex',
          type: 'REG_DWORD',
          value: 66
        },
        // 2. Default Icon
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\DefaultIcon`,
          valueName: '',
          type: 'REG_EXPAND_SZ',
          value: '%SystemRoot%\\system32\\imageres.dll,-1043'
        },
        // 3. InProcServer32 (Windows Native Shell32 Instance Handler)
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\InProcServer32`,
          valueName: '',
          type: 'REG_EXPAND_SZ',
          value: '%SystemRoot%\\system32\\shell32.dll'
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\InProcServer32`,
          valueName: 'ThreadingModel',
          type: 'REG_SZ',
          value: 'Apartment'
        },
        // 4. Instance CLSID (Shell File System Folder Instance Proxy)
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\Instance`,
          valueName: 'CLSID',
          type: 'REG_SZ',
          value: SHELL_FOLDER_INSTANCE_CLSID
        },
        // 5. Instance InitPropertyBag (Binds CLSID to Virtual Root Directory)
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\Instance\\InitPropertyBag`,
          valueName: 'Attributes',
          type: 'REG_DWORD',
          value: 0x00000011
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\Instance\\InitPropertyBag`,
          valueName: 'TargetFolderPath',
          type: 'REG_EXPAND_SZ',
          value: targetFolder
        },
        // 6. ShellFolder Attributes (SFGAO flags)
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\ShellFolder`,
          valueName: 'Attributes',
          type: 'REG_DWORD',
          // SFGAO_FOLDER | SFGAO_HASSUBFOLDER | SFGAO_CANLINK | SFGAO_FILESYSANCESTOR | SFGAO_STORAGEANCESTOR
          value: 0xF080004D
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\ShellFolder`,
          valueName: 'FolderValueFlags',
          type: 'REG_DWORD',
          value: 0x00000028
        },
        // 7. Windows Explorer Namespace Tree Mount Point
        {
          hive: 'HKCU',
          key: `Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\${BUN_DRIVE_CLSID}`,
          valueName: '',
          type: 'REG_SZ',
          value: 'Bun-Drive'
        },
        // 8. Navigation Pane Pinning in Explorer (Hide from Desktop surface)
        {
          hive: 'HKCU',
          key: `Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel`,
          valueName: BUN_DRIVE_CLSID,
          type: 'REG_DWORD',
          value: 1
        }
      ]
    };
  }

  /**
   * Generates a ready-to-import Windows Registry (.reg) script
   */
  public static generateRegistryFile(customVirtualRoot?: string): string {
    const bp = this.getBlueprint(customVirtualRoot);
    let regContent = 'Windows Registry Editor Version 5.00\r\n\r\n';

    const groupedByKey: Record<string, typeof bp.registryKeys> = {};
    for (const rk of bp.registryKeys) {
      const fullKey = `[HKEY_CURRENT_USER\\${rk.key}]`;
      if (!groupedByKey[fullKey]) groupedByKey[fullKey] = [];
      groupedByKey[fullKey].push(rk);
    }

    for (const [keyPath, entries] of Object.entries(groupedByKey)) {
      regContent += `${keyPath}\r\n`;
      for (const entry of entries) {
        const valName = entry.valueName ? `"${entry.valueName}"` : '@';
        if (entry.type === 'REG_DWORD') {
          const hex = (entry.value as number >>> 0).toString(16).padStart(8, '0');
          regContent += `${valName}=dword:${hex}\r\n`;
        } else if (entry.type === 'REG_EXPAND_SZ') {
          regContent += `${valName}=hex(2):${Buffer.from(String(entry.value) + '\0', 'utf16le').toString('hex')}\r\n`;
        } else {
          regContent += `${valName}="${String(entry.value).replace(/\\/g, '\\\\')}"\r\n`;
        }
      }
      regContent += '\r\n';
    }

    return regContent;
  }

  /**
   * Generates an unregistration Windows Registry (.reg) script
   */
  public static generateUnregisterRegistryFile(): string {
    return [
      'Windows Registry Editor Version 5.00',
      '',
      `[-HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\${BUN_DRIVE_CLSID}]`,
      '',
      `[-HKEY_CURRENT_USER\\Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}]`,
      '',
      `[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel]`,
      `"${BUN_DRIVE_CLSID}"=-`,
      ''
    ].join('\r\n');
  }
}

