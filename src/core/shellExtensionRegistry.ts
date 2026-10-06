/**
 * Bun-Drive Shell Extension Registry Architecture
 * Prepares the Windows Explorer Namespace Extension foundation for Phase 2.
 * 
 * Target Explorer Architecture:
 * - COM CLSID: {B010D817-E923-4E87-9DC2-A74B29E309FA}
 * - Navigation Pane Pinned Node (System.IsPinnedToNameSpaceTree = 1)
 * - Explorer Desktop Namespace registration
 * - Shell Folder Attributes: SFGAO_FOLDER | SFGAO_HASSUBFOLDER | SFGAO_CANLINK | SFGAO_STORAGE
 */

import { ShellExtensionBlueprint } from '../types/drive.js';

export const BUN_DRIVE_CLSID = '{B010D817-E923-4E87-9DC2-A74B29E309FA}';
export const BUN_DRIVE_PROGID = 'BunDrive.ShellNamespaceExtension.1';

export class ShellExtensionRegistry {
  /**
   * Returns the architectural blueprint and registry schema for Windows Explorer
   */
  public static getBlueprint(): ShellExtensionBlueprint {
    return {
      clsid: BUN_DRIVE_CLSID,
      progId: BUN_DRIVE_PROGID,
      displayName: 'Bun-Drive',
      description: 'Active Directory Network Shares for Current Windows User',
      iconPath: '%ProgramFiles%\\Bun-Drive\\resources\\bun-drive.ico,0',
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
          value: '%ProgramFiles%\\Bun-Drive\\resources\\bun-drive.ico,0'
        },
        // 3. InProcServer32 (COM Server DLL for Windows Shell)
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\InProcServer32`,
          valueName: '',
          type: 'REG_EXPAND_SZ',
          value: '%ProgramFiles%\\Bun-Drive\\BunDriveShell.dll'
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\InProcServer32`,
          valueName: 'ThreadingModel',
          type: 'REG_SZ',
          value: 'Apartment'
        },
        // 4. ShellFolder Attributes (SFGAO flags)
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\ShellFolder`,
          valueName: 'Attributes',
          type: 'REG_DWORD',
          // SFGAO_FOLDER (0x20000000) | SFGAO_HASSUBFOLDER (0x80000000) | SFGAO_CANLINK (0x00000001)
          value: 0xA0000001
        },
        {
          hive: 'HKCU',
          key: `Software\\Classes\\CLSID\\${BUN_DRIVE_CLSID}\\ShellFolder`,
          valueName: 'FolderValueFlags',
          type: 'REG_DWORD',
          value: 0x00000028
        },
        // 5. Windows Explorer Namespace Tree Mount Point
        {
          hive: 'HKCU',
          key: `Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Desktop\\NameSpace\\${BUN_DRIVE_CLSID}`,
          valueName: '',
          type: 'REG_SZ',
          value: 'Bun-Drive'
        },
        // 6. Navigation Pane Pinning in Explorer
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
  public static generateRegistryFile(): string {
    const bp = this.getBlueprint();
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
          const hex = (entry.value as number).toString(16).padStart(8, '0');
          regContent += `${valName}=dword:${hex}\r\n`;
        } else if (entry.type === 'REG_EXPAND_SZ') {
          regContent += `${valName}=hex(2):${Buffer.from(String(entry.value), 'utf16le').toString('hex')}\r\n`;
        } else {
          regContent += `${valName}="${String(entry.value).replace(/\\/g, '\\\\')}"\r\n`;
        }
      }
      regContent += '\r\n';
    }

    return regContent;
  }
}
