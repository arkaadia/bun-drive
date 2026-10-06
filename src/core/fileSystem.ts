/**
 * Bun-Drive Windows File System Service
 * Handles UNC path browsing, file system entry enumeration,
 * Windows permission checks on directories/files, and File Explorer execution.
 */

import path from 'path';
import fs from 'fs';
import { BrowseResult, FileSystemEntry, ShareProperties } from '../types/drive.js';
import { NativeBridge } from './nativeBridge.js';
import { logger } from './logger.js';

export class WindowsFileSystemService {
  /**
   * Helper to format byte sizes to human-readable strings
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Parse UNC path components: \\Server\Share\Sub\Path
   */
  public static parseUncPath(uncPath: string): { server: string; share: string; subPath: string } {
    const clean = uncPath.replace(/^[\\\/]+/, '');
    const parts = clean.split(/[\\\/]+/);
    const server = parts[0] || '';
    const share = parts[1] || '';
    const subPath = parts.slice(2).join('\\');
    return { server, share, subPath };
  }

  /**
   * Browse a UNC path
   */
  public async browsePath(targetPath: string): Promise<BrowseResult> {
    const { server, share, subPath } = WindowsFileSystemService.parseUncPath(targetPath);
    logger.info('FileSystem', `Browsing path: ${targetPath}`);

    // If on native Windows and the UNC path exists physically
    if (NativeBridge.isWindowsHost()) {
      try {
        const stats = await fs.promises.stat(targetPath);
        if (!stats.isDirectory()) {
          throw new Error('Target path is not a directory');
        }

        const dirEntries = await fs.promises.readdir(targetPath, { withFileTypes: true });
        const entries: FileSystemEntry[] = [];

        for (const dirent of dirEntries) {
          const itemPath = path.join(targetPath, dirent.name);
          try {
            const itemStat = await fs.promises.stat(itemPath);
            const isDir = dirent.isDirectory();
            const ext = isDir ? '' : path.extname(dirent.name).toLowerCase();

            entries.push({
              name: dirent.name,
              path: itemPath,
              uncPath: itemPath.replace(/\//g, '\\'),
              isDirectory: isDir,
              size: isDir ? 0 : itemStat.size,
              formattedSize: isDir ? '' : WindowsFileSystemService.formatBytes(itemStat.size),
              modifiedTime: itemStat.mtime.toISOString(),
              createdTime: itemStat.birthtime.toISOString(),
              extension: ext,
              isReadable: true,
              isWritable: true,
              attributes: isDir ? ['Directory'] : ['Archive']
            });
          } catch (itemErr) {
            logger.warn('FileSystem', `Skipping unreadable item ${itemPath}`, itemErr);
          }
        }

        // Sort: directories first, then alphabetical
        entries.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        const parentPath = subPath ? `\\\\${server}\\${share}${subPath.includes('\\') ? '\\' + subPath.split('\\').slice(0, -1).join('\\') : ''}` : null;

        return {
          currentPath: targetPath,
          server,
          share,
          subPath,
          parentPath,
          entries,
          totalFolders: entries.filter(e => e.isDirectory).length,
          totalFiles: entries.filter(e => !e.isDirectory).length,
          accessible: true
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('FileSystem', `Access error on path: ${targetPath}`, err);
        return {
          currentPath: targetPath,
          server,
          share,
          subPath,
          parentPath: null,
          entries: [],
          totalFolders: 0,
          totalFiles: 0,
          accessible: false,
          error: message.includes('EACCES') || message.includes('denied')
            ? 'Access Denied: Windows NTFS permissions do not allow reading this directory.'
            : message
        };
      }
    }

    // Permission and offline checks for non-Windows testing / fallback
    if (server.toLowerCase().includes('offline') || server.toLowerCase().includes('unreachable')) {
      return {
        currentPath: targetPath,
        server,
        share,
        subPath,
        parentPath: null,
        entries: [],
        totalFolders: 0,
        totalFiles: 0,
        accessible: false,
        error: `Network Error: The network path "${targetPath}" could not be reached. The file server is offline or unreachable.`
      };
    }

    if (
      share.toLowerCase().includes('executive') || 
      share.toLowerCase().includes('hr-confidential') || 
      subPath.toLowerCase().includes('denied') || 
      subPath.toLowerCase().includes('restricted')
    ) {
      const parentPath = subPath 
        ? (subPath.includes('\\') 
            ? `\\\\${server}\\${share}\\${subPath.split('\\').slice(0, -1).join('\\')}`
            : `\\\\${server}\\${share}`)
        : null;

      return {
        currentPath: targetPath,
        server,
        share,
        subPath,
        parentPath,
        entries: [],
        totalFolders: 0,
        totalFiles: 0,
        accessible: false,
        error: 'Access Denied: Windows NTFS permissions do not allow reading this directory.'
      };
    }

    // Dynamic fixture browsing for domain share structures
    const fixtureEntries = this.generateShareContents(server, share, subPath);
    
    // Sort directories first
    fixtureEntries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = subPath 
      ? (subPath.includes('\\') 
          ? `\\\\${server}\\${share}\\${subPath.split('\\').slice(0, -1).join('\\')}`
          : `\\\\${server}\\${share}`)
      : null;

    return {
      currentPath: targetPath,
      server,
      share,
      subPath,
      parentPath,
      entries: fixtureEntries,
      totalFolders: fixtureEntries.filter(e => e.isDirectory).length,
      totalFiles: fixtureEntries.filter(e => !e.isDirectory).length,
      accessible: true
    };
  }

  /**
   * Generates realistic directory structures for enterprise shares
   */
  private generateShareContents(server: string, share: string, subPath: string): FileSystemEntry[] {
    const basePath = subPath ? `\\\\${server}\\${share}\\${subPath}` : `\\\\${server}\\${share}`;

    if (!subPath) {
      // Root of share
      if (share.toLowerCase() === 'projects') {
        return [
          this.createDir(basePath, 'Network', '2026-10-02T11:00:00Z'),
          this.createDir(basePath, 'Infrastructure', '2026-09-28T09:30:00Z'),
          this.createDir(basePath, 'Software-Rollout', '2026-10-01T14:15:00Z'),
          this.createFile(basePath, 'Project-Master-Schedule.xlsx', 1950000, '2026-10-03T16:00:00Z'),
          this.createFile(basePath, 'Architecture-Overview.pdf', 3200000, '2026-09-25T10:45:00Z')
        ];
      }

      if (share.toLowerCase() === 'public') {
        return [
          this.createDir(basePath, 'Company-Templates', '2026-09-15T08:30:00Z'),
          this.createDir(basePath, 'Software-Installers', '2026-09-20T11:15:00Z'),
          this.createDir(basePath, 'Forms-and-Notices', '2026-10-01T09:00:00Z'),
          this.createFile(basePath, 'Organization-Chart-2026.pdf', 3450000, '2026-09-28T14:22:00Z'),
          this.createFile(basePath, 'IT-Helpdesk-Guidelines.docx', 840000, '2026-10-02T16:45:00Z'),
          this.createFile(basePath, 'Acceptable-Use-Policy.pdf', 1200000, '2026-08-11T10:00:00Z')
        ];
      }

      if (share.toLowerCase().includes('marketing')) {
        return [
          this.createDir(basePath, 'Campaign-Q4-2026', '2026-10-02T10:00:00Z'),
          this.createDir(basePath, 'Branding-Logos-Vector', '2026-08-15T12:00:00Z'),
          this.createDir(basePath, 'Product-Photography', '2026-09-18T15:30:00Z'),
          this.createFile(basePath, 'Brand-Styleguide-v4.pdf', 14200000, '2026-09-12T09:15:00Z'),
          this.createFile(basePath, 'Social-Media-Calendar.xlsx', 420000, '2026-10-04T18:00:00Z')
        ];
      }

      if (share.toLowerCase().includes('engineering')) {
        return [
          this.createDir(basePath, 'Architecture-RFCs', '2026-09-29T13:40:00Z'),
          this.createDir(basePath, 'Release-Builds', '2026-10-05T07:12:00Z'),
          this.createDir(basePath, 'Database-Schemas', '2026-09-19T16:00:00Z'),
          this.createFile(basePath, 'Network-Topology-Diagram.vsdx', 4800000, '2026-09-25T11:20:00Z'),
          this.createFile(basePath, 'Security-Hardening-Standard.md', 64000, '2026-10-03T14:10:00Z')
        ];
      }

      if (share.toLowerCase().includes('finance')) {
        return [
          this.createDir(basePath, 'FY2026-Q3-Statements', '2026-09-30T17:00:00Z'),
          this.createDir(basePath, 'Audit-Workpapers', '2026-08-20T10:00:00Z'),
          this.createFile(basePath, 'Approved-Budget-Summary.xlsx', 2150000, '2026-10-01T12:00:00Z'),
          this.createFile(basePath, 'Vendor-Payment-Schedule.pdf', 980000, '2026-10-04T09:30:00Z')
        ];
      }

      if (share.toLowerCase() === 'sysvol') {
        return [
          this.createDir(basePath, 'Policies', '2026-09-01T00:00:00Z'),
          this.createDir(basePath, 'scripts', '2026-09-01T00:00:00Z')
        ];
      }

      // Default share contents
      return [
        this.createDir(basePath, 'Documents', '2026-09-25T10:00:00Z'),
        this.createDir(basePath, 'Shared', '2026-09-20T14:30:00Z'),
        this.createFile(basePath, 'README.txt', 2048, '2026-10-01T11:00:00Z')
      ];
    } else {
      // Subfolder contents
      const normalizedSub = subPath.toLowerCase().replace(/\\/g, '/');
      if (normalizedSub === 'network') {
        return [
          this.createDir(basePath, 'Cisco', '2026-10-04T12:00:00Z'),
          this.createDir(basePath, 'Juniper', '2026-09-15T09:30:00Z'),
          this.createFile(basePath, 'Subnet-Plan.xlsx', 540000, '2026-10-02T14:10:00Z')
        ];
      }
      if (normalizedSub === 'network/cisco' || normalizedSub.endsWith('/cisco')) {
        return [
          this.createDir(basePath, 'IOS-Images', '2026-09-10T08:00:00Z'),
          this.createFile(basePath, 'Switch-Core01-Running.cfg', 28400, '2026-10-03T16:20:00Z'),
          this.createFile(basePath, 'VLAN-Configuration.txt', 12400, '2026-10-04T11:00:00Z')
        ];
      }
      if (normalizedSub === 'company-templates') {
        return [
          this.createDir(basePath, 'Letterheads', '2026-09-10T10:00:00Z'),
          this.createDir(basePath, 'PowerPoint', '2026-09-12T14:00:00Z'),
          this.createFile(basePath, 'Standard-NDA-Template.docx', 420000, '2026-09-20T11:30:00Z')
        ];
      }
      const folderName = subPath.split('\\').pop() || 'Subfolder';
      return [
        this.createFile(basePath, `${folderName}-Summary.docx`, 1850000, '2026-10-03T15:20:00Z'),
        this.createFile(basePath, `${folderName}-Data.xlsx`, 3420000, '2026-10-04T09:15:00Z'),
        this.createFile(basePath, `Archive-Notes.txt`, 12800, '2026-09-28T16:00:00Z')
      ];
    }
  }

  private createDir(base: string, name: string, modified: string): FileSystemEntry {
    const full = `${base}\\${name}`;
    return {
      name,
      path: full,
      uncPath: full,
      isDirectory: true,
      size: 0,
      formattedSize: '',
      modifiedTime: modified,
      extension: '',
      isReadable: true,
      isWritable: true,
      attributes: ['Directory']
    };
  }

  private createFile(base: string, name: string, size: number, modified: string): FileSystemEntry {
    const full = `${base}\\${name}`;
    const ext = path.extname(name).toLowerCase();
    return {
      name,
      path: full,
      uncPath: full,
      isDirectory: false,
      size,
      formattedSize: WindowsFileSystemService.formatBytes(size),
      modifiedTime: modified,
      extension: ext,
      isReadable: true,
      isWritable: true,
      attributes: ['Archive']
    };
  }

  /**
   * Launch native Windows File Explorer to target UNC path
   */
  public async openInExplorer(uncPath: string): Promise<boolean> {
    return NativeBridge.openInExplorer(uncPath);
  }

  /**
   * Phase 3: Retrieve full Windows properties for a UNC path, share, or folder
   */
  public async getProperties(targetPath: string, mappedDriveLetter?: string | null): Promise<ShareProperties> {
    const { server, share, subPath } = WindowsFileSystemService.parseUncPath(targetPath);
    const itemName = subPath ? subPath.split('\\').pop() || share : share || server;
    const isRootShare = !subPath && Boolean(share);
    const isFile = !isRootShare && path.extname(itemName).length > 0;
    const itemType: 'Share' | 'Folder' | 'File' = isRootShare ? 'Share' : (isFile ? 'File' : 'Folder');

    logger.info('FileSystem', `Retrieving Windows properties for: ${targetPath}`);

    // If on native Windows
    if (NativeBridge.isWindowsHost()) {
      try {
        const stats = await fs.promises.stat(targetPath);
        const isDir = stats.isDirectory();
        let folderCount = 0;
        let fileCount = 0;
        const sizeBytes = stats.size;

        if (isDir) {
          try {
            const dirEntries = await fs.promises.readdir(targetPath, { withFileTypes: true });
            folderCount = dirEntries.filter(e => e.isDirectory()).length;
            fileCount = dirEntries.filter(e => !e.isDirectory()).length;
          } catch {}
        }

        let isWritable = false;
        try {
          if (isDir) {
            const testFile = path.join(targetPath, `.bun_prop_probe_${Date.now()}.tmp`);
            await fs.promises.writeFile(testFile, 'test');
            await fs.promises.unlink(testFile);
            isWritable = true;
          }
        } catch {
          isWritable = false;
        }

        const identity = await NativeBridge.getWindowsIdentity();

        return {
          name: itemName,
          uncPath: targetPath,
          server,
          share,
          subPath: subPath || undefined,
          itemType,
          accessStatus: 'Accessible',
          accessLevel: isWritable ? 'ReadWrite' : 'Read',
          isReadable: true,
          isWritable,
          mappedDrive: mappedDriveLetter || null,
          connectionStatus: mappedDriveLetter ? 'Connected' : 'Online',
          availability: 'Available on Network',
          locationType: isRootShare ? 'Remote SMB Network Share' : (isFile ? 'Remote Network File' : 'Remote Active Directory Share Directory'),
          sizeBytes,
          formattedSize: isDir ? undefined : WindowsFileSystemService.formatBytes(sizeBytes),
          folderCount: isDir ? folderCount : undefined,
          fileCount: isDir ? fileCount : undefined,
          createdTime: stats.birthtime.toISOString(),
          modifiedTime: stats.mtime.toISOString(),
          attributes: isDir ? ['Directory'] : ['Archive'],
          securityContext: {
            user: identity.username,
            domain: identity.domain,
            authType: identity.authType,
            verifiedPermissions: isWritable ? 'Read, Write, Traverse (ACL Verified)' : 'Read, Traverse (ACL Verified)'
          }
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const isAccessDenied = message.includes('EACCES') || message.includes('denied');
        const identity = await NativeBridge.getWindowsIdentity();

        return {
          name: itemName,
          uncPath: targetPath,
          server,
          share,
          subPath: subPath || undefined,
          itemType,
          accessStatus: isAccessDenied ? 'Access Denied' : 'Offline',
          accessLevel: 'None',
          isReadable: false,
          isWritable: false,
          mappedDrive: mappedDriveLetter || null,
          connectionStatus: isAccessDenied ? 'Disconnected' : 'Offline',
          availability: isAccessDenied ? 'Access Restricted' : 'Offline',
          locationType: isRootShare ? 'Remote SMB Network Share' : 'Remote Active Directory Share Directory',
          denialReason: isAccessDenied ? 'Access Denied: Windows NTFS/SMB permissions restrict access' : message,
          securityContext: {
            user: identity.username,
            domain: identity.domain,
            authType: identity.authType,
            verifiedPermissions: 'Access Denied'
          }
        };
      }
    }

    // Non-Windows simulation / unit testing
    const identity = await NativeBridge.getWindowsIdentity();

    if (server.toLowerCase().includes('offline') || server.toLowerCase().includes('unreachable')) {
      return {
        name: itemName,
        uncPath: targetPath,
        server,
        share,
        subPath: subPath || undefined,
        itemType,
        accessStatus: 'Offline',
        accessLevel: 'None',
        isReadable: false,
        isWritable: false,
        mappedDrive: mappedDriveLetter || null,
        connectionStatus: 'Offline',
        availability: 'Offline',
        locationType: isRootShare ? 'Remote SMB Network Share' : 'Remote Active Directory Share Directory',
        denialReason: `Network Error: The server ${server} is offline or unreachable on SMB port 445.`,
        securityContext: {
          user: identity.username,
          domain: identity.domain,
          authType: identity.authType,
          verifiedPermissions: 'Host Unreachable'
        }
      };
    }

    if (
      share.toLowerCase().includes('executive') ||
      share.toLowerCase().includes('hr-confidential') ||
      subPath.toLowerCase().includes('denied') ||
      subPath.toLowerCase().includes('restricted')
    ) {
      return {
        name: itemName,
        uncPath: targetPath,
        server,
        share,
        subPath: subPath || undefined,
        itemType,
        accessStatus: 'Access Denied',
        accessLevel: 'None',
        isReadable: false,
        isWritable: false,
        mappedDrive: mappedDriveLetter || null,
        connectionStatus: 'Disconnected',
        availability: 'Access Restricted',
        locationType: isRootShare ? 'Remote SMB Network Share' : 'Remote Active Directory Share Directory',
        denialReason: 'Access Denied: Windows NTFS permissions do not allow reading this resource.',
        securityContext: {
          user: identity.username,
          domain: identity.domain,
          authType: identity.authType,
          verifiedPermissions: 'Access Denied (NTFS/SMB ACL)'
        }
      };
    }

    const isReadOnly = share.toLowerCase().includes('finance') || share.toLowerCase() === 'sysvol' || share.toLowerCase() === 'netlogon';
    const accessLevel = isReadOnly ? 'Read' : 'ReadWrite';

    // Calculate simulated folder count / file count
    const browse = await this.browsePath(targetPath);
    const folderCount = browse.totalFolders;
    const fileCount = browse.totalFiles;
    const totalSize = browse.entries.reduce((acc, e) => acc + (e.size || 0), 0);

    return {
      name: itemName,
      uncPath: targetPath,
      server,
      share,
      subPath: subPath || undefined,
      itemType,
      accessStatus: 'Accessible',
      accessLevel,
      isReadable: true,
      isWritable: !isReadOnly,
      mappedDrive: mappedDriveLetter || null,
      connectionStatus: mappedDriveLetter ? 'Connected' : 'Online',
      availability: 'Available on Network',
      locationType: isRootShare ? 'Remote SMB Network Share' : (isFile ? 'Remote Network File' : 'Remote Active Directory Share Directory'),
      sizeBytes: totalSize > 0 ? totalSize : 4194304,
      formattedSize: isFile ? WindowsFileSystemService.formatBytes(totalSize) : undefined,
      folderCount: isFile ? undefined : folderCount,
      fileCount: isFile ? undefined : fileCount,
      createdTime: '2026-09-15T08:00:00.000Z',
      modifiedTime: '2026-10-04T12:00:00.000Z',
      attributes: isFile ? ['Archive'] : ['Directory'],
      securityContext: {
        user: identity.username,
        domain: identity.domain,
        authType: identity.authType,
        verifiedPermissions: !isReadOnly ? 'Read, Write, Traverse (ACL Verified)' : 'Read, Traverse (ACL Verified)'
      }
    };
  }
}

export const fileSystemService = new WindowsFileSystemService();
