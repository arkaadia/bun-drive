/**
 * Bun-Drive Type Definitions
 * Represents Windows Security Context, Active Directory Entities, Network Shares,
 * and File Explorer Navigation structures.
 */

export interface WindowsIdentity {
  username: string;          // e.g. "CONTOSO\\Administrator" or "jdoe"
  pureUsername: string;      // e.g. "Administrator"
  domain: string;            // NetBIOS domain name, e.g. "CONTOSO"
  dnsDomain?: string;        // Fully-qualified DNS domain, e.g. "contoso.local"
  userSid: string;           // Windows Security Identifier, e.g. "S-1-5-21-..."
  isDomainJoined: boolean;   // Whether the computer belongs to an AD domain
  workgroupStatus?: string;  // e.g. "Domain Joined (CONTOSO.LOCAL)" or "Workgroup (WORKGROUP)"
  domainController?: string; // Hostname or IP of primary DC, e.g. "DC01.contoso.local"
  logonServer?: string;      // Logon server UNC e.g. "\\DC01"
  authType: 'Kerberos' | 'NTLM' | 'Negotiate' | 'Local';
  groups: string[];          // AD Groups user belongs to (e.g. "Domain Users", "Finance-RW")
  computerName: string;
}

export type ShareAccessLevel = 'Read' | 'ReadWrite' | 'None';

export type ShareStatus = 'Accessible' | 'Inaccessible' | 'Offline';

export type DiscoverySource = 
  | 'AD_LDAP'        // Discovered via Active Directory LDAP computer/server search
  | 'DFS_ROOT'       // Discovered via Domain Distributed File System (DFS) namespace
  | 'NET_ENUM'       // Discovered via NetServerEnum / WNetEnumResource
  | 'LOGON_SERVER'   // Discovered on the authenticating Domain Controller / Logon Server
  | 'MANUAL_SERVER'; // User or administrator probed server

export interface NetworkShare {
  id: string;                // Unique identifier, e.g. "\\\\CORP-FS01\\Marketing"
  name: string;              // Share name, e.g. "Marketing"
  server: string;            // Server name or FQDN, e.g. "CORP-FS01.contoso.local"
  uncPath: string;           // Full UNC path, e.g. "\\\\CORP-FS01\\Marketing"
  description?: string;      // Share comment/remark from SMB header
  isAccessible: boolean;     // Whether the current Windows user has read/traverse permissions
  accessLevel: ShareAccessLevel;
  status?: ShareStatus;      // Phase 3: Accessibility status ('Accessible' | 'Inaccessible' | 'Offline')
  connectionStatus?: 'Online' | 'Offline' | 'Unreachable';
  mappedDrive?: string | null; // e.g. "Z:" or null if unmapped
  denialReason?: string;     // Reason if access denied (e.g. "Access Denied (NTFS/SMB ACL)")
  discoverySource: DiscoverySource;
  responseTimeMs: number;    // Latency to probe the share
  lastChecked: string;       // ISO timestamp
  folderCount?: number;
  fileCount?: number;
}

export interface FileSystemEntry {
  name: string;
  path: string;              // Full UNC path or relative path
  uncPath: string;
  isDirectory: boolean;
  size: number;              // Bytes
  formattedSize: string;
  modifiedTime: string;      // ISO string
  createdTime?: string;
  extension: string;
  isReadable: boolean;
  isWritable: boolean;
  attributes?: string[];     // ['Directory', 'Archive', 'ReadOnly', etc.]
}

export interface BrowseResult {
  currentPath: string;
  server: string;
  share: string;
  subPath: string;
  parentPath: string | null;
  entries: FileSystemEntry[];
  totalFolders: number;
  totalFiles: number;
  accessible: boolean;
  error?: string;
}

export interface ShareDiscoveryResult {
  shares: NetworkShare[];
  inaccessibleSharesCount: number;
  scannedServers: string[];
  identity: WindowsIdentity;
  scanDurationMs: number;
  timestamp: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
  source: string;
  message: string;
  details?: unknown;
}

export interface ShellExtensionBlueprint {
  clsid: string;
  progId: string;
  displayName: string;
  description: string;
  iconPath: string;
  isPinnedToNameSpaceTree: boolean;
  sortOrderIndex: number;
  registryKeys: Array<{
    hive: 'HKCU' | 'HKLM';
    key: string;
    valueName: string;
    type: 'REG_SZ' | 'REG_DWORD' | 'REG_EXPAND_SZ';
    value: string | number;
  }>;
}

/**
 * Phase 2: Windows Explorer Shell Namespace Integration & Virtual Mounts
 */

export interface ShellShortcutEntry {
  name: string;              // e.g. "Marketing-Assets (FS01-CORP)"
  shareId: string;
  uncPath: string;           // Target UNC path e.g. "\\\\FS01-CORP\\Marketing-Assets"
  shortcutPath: string;      // Physical .lnk or Folder Shortcut path inside Virtual Root
  accessLevel: ShareAccessLevel;
  server: string;
  synchronizedAt: string;    // ISO timestamp
  status: 'Active' | 'Stale' | 'Orphaned';
}

export interface MappedDriveLetter {
  driveLetter: string;       // e.g. "Z:"
  uncPath: string;           // e.g. "\\\\FS01-CORP\\Public"
  shareName: string;
  server: string;
  persistent: boolean;
  status: 'Connected' | 'Disconnected' | 'Unavailable';
  mappedAt: string;
}

export interface ShellIntegrationState {
  isRegisteredInExplorer: boolean;
  isPinnedToNavigationPane: boolean;
  virtualRootPath: string;            // e.g. "%LOCALAPPDATA%\\Bun-Drive\\NamespaceRoot"
  clsid: string;
  progId: string;
  autoSyncEnabled: boolean;
  syncIntervalSeconds: number;
  lastSyncedAt: string | null;
  activeShortcuts: ShellShortcutEntry[];
  mappedDrives: MappedDriveLetter[];
  explorerIntegrationMode: 'ShellFolderInstance' | 'NamespaceJunction' | 'Hybrid';
  healthStatus: 'Healthy' | 'NeedsSync' | 'Unregistered' | 'Error';
  lastError?: string;
}

export interface ShellSyncResult {
  success: boolean;
  virtualRootPath: string;
  createdCount: number;
  updatedCount: number;
  removedCount: number;
  activeShortcuts: ShellShortcutEntry[];
  durationMs: number;
  timestamp: string;
}

/**
 * Phase 3: Active Directory Share Management & Drive Conflict Types
 */
export interface DriveMappingConflict {
  hasConflict: boolean;
  driveLetter: string;
  existingTarget?: string;
  existingMapping?: MappedDriveLetter;
  message?: string;
}

export interface AvailableDriveLetter {
  letter: string;
  isMapped: boolean;
  currentTarget?: string;
}

/**
 * Phase 3 Completion: Real Properties & Right-Click Context Menu Types
 */
export interface ShareProperties {
  name: string;
  uncPath: string;
  server: string;
  share: string;
  subPath?: string;
  itemType: 'Share' | 'Folder' | 'File';
  accessStatus: 'Accessible' | 'Inaccessible' | 'Access Denied' | 'Offline';
  accessLevel: 'Read' | 'ReadWrite' | 'None';
  isReadable: boolean;
  isWritable: boolean;
  mappedDrive?: string | null;
  connectionStatus: 'Connected' | 'Disconnected' | 'Online' | 'Offline' | 'Unreachable';
  availability: 'Available on Network' | 'Offline' | 'Access Restricted';
  locationType: 'Remote SMB Network Share' | 'Remote Active Directory Share Directory' | 'Remote Network File';
  sizeBytes?: number;
  formattedSize?: string;
  folderCount?: number;
  fileCount?: number;
  createdTime?: string;
  modifiedTime?: string;
  attributes?: string[];
  denialReason?: string;
  description?: string;
  securityContext?: {
    user: string;
    domain: string;
    authType: string;
    verifiedPermissions: string;
  };
}

export interface ContextMenuTarget {
  name: string;
  uncPath: string;
  isDirectory: boolean;
  isShare?: boolean;
  server?: string;
  share?: string;
  mappedDrive?: string | null;
  accessStatus?: 'Accessible' | 'Inaccessible' | 'Access Denied' | 'Offline' | ShareStatus;
  accessLevel?: 'Read' | 'ReadWrite' | 'None';
}

