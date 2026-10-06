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
  domainController?: string; // Hostname or IP of primary DC, e.g. "DC01.contoso.local"
  logonServer?: string;      // Logon server UNC e.g. "\\DC01"
  authType: 'Kerberos' | 'NTLM' | 'Negotiate' | 'Local';
  groups: string[];          // AD Groups user belongs to (e.g. "Domain Users", "Finance-RW")
  computerName: string;
}

export type ShareAccessLevel = 'Read' | 'ReadWrite' | 'None';

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
