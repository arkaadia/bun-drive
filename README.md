# Bun-Drive

**Windows File Explorer Active Directory Network Share Discovery & Shell Namespace Engine**

Bun-Drive dynamically discovers SMB network shares across an Active Directory domain using the currently logged-in Windows user's Kerberos/NTLM security token, filters out unauthorized or access-denied shares via real NTFS/SMB permission checks, and mounts an integrated **Bun-Drive** node directly inside the Windows File Explorer Left Navigation Pane.

---

## Key Capabilities

### Phase 1: Active Directory Discovery & Real Windows Security Filtering
- **Native Windows Identity Resolution**: Queries `WindowsIdentity::GetCurrent()` to resolve the logged-in domain user, SID, Active Directory security groups, logon server, and Kerberos/NTLM authentication context.
- **Multi-Strategy AD Share Discovery**: Scans Active Directory via LDAP (`servicePrincipalName=cifs/*` and Windows Server computer objects), Domain Controllers (`SYSVOL`, `NETLOGON`), and WMI/CIM `Win32_Share` + `net view`.
- **Zero Access-Denied Clutter**: Probes each discovered share under the user's native Windows security token. Shares where the user lacks read/traverse permissions (or administrative `$` shares) are automatically excluded from the user's view and logged to the Security Audit Inspector.

### Phase 2: Windows File Explorer Shell Namespace Integration & Virtual Mounts
- **Live HKCU Navigation Pane Registration**: Registers CLSID `{B010D817-E923-4E87-9DC2-A74B29E309FA}` in `HKCU\Software\Classes\CLSID` and `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace` with `System.IsPinnedToNameSpaceTree = 1`—requiring zero Administrator privileges.
- **Shell Folder Instance Proxy & Virtual Root**: Binds the Windows Shell Folder Instance proxy (`{0E5AAE11-A475-4c5b-AB00-C66DE400274E}`) to `%LOCALAPPDATA%\Bun-Drive\NamespaceRoot` and automatically synchronizes Windows Folder Shortcuts (`.lnk`) for every authorized network share.
- **SMB Drive Letter Mapping**: Maps and disconnects authorized UNC shares to local Windows drive letters (`Z:`, `Y:`, etc.) with persistent sign-in support (`net use /persistent:yes` & `Get-SmbMapping`).
- **Background Auto-Sync Engine**: Periodically refreshes Active Directory shares and prunes stale or revoked shortcuts from the Virtual Namespace Root.

### Phase 3: Active Directory Share Management & Real File Browsing
- **Active Directory & Domain Detection**: Automatically resolves the current Windows user's domain name, NetBIOS and DNS domain, username, computer name, and workgroup status (`Win32_ComputerSystem::PartOfDomain` and `[System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()`) without requiring manual input or elevated Administrator rights.
- **Accessible Share Discovery & Reachability**: Probes network file servers via SMB port 445 checks and validates permissions under the user's logged-in Kerberos/NTLM security token. Classifies resources into `Accessible`, `Inaccessible` (access denied by NTFS/SMB ACL), and `Offline` (unreachable/timed out). Zero password storage or transmission.
- **Hierarchical Share & Subfolder Browser**: Browses physical SMB shares and nested subfolders (e.g. `\\SERVER01\Projects` → `\\SERVER01\Projects\Network` → `\\SERVER01\Projects\Network\Cisco`). Supports folder entry, parent navigation (`Up`), copy UNC, and launch in Windows File Explorer.
- **Direct Target Selection & Subfolder Mounting**: Users can select either an entire network share OR any specific subfolder as the active target for drive letter mapping.
- **Drive Letter Conflict Resolution & Safe Replacement**: Enumerates drive letters `D:` through `Z:`. When an existing mapping conflict is detected, prompts the user with conflict details (existing drive and target) and offers safe replacement (clean unmap followed by remap) or selection of another free letter—never silently overwriting.
- **Persistent Mapping & Explorer Consistency**: Creates persistent drive letters (`/persistent:yes`) that reconnect across Windows logon sessions while maintaining synchronization across Bun-Drive, the Explorer Shell Namespace, and mapped drive letters.

### Phase 3 Completion: Right-Click Actions & Windows Properties Dialog
- **Right-Click Context Menu**: Native context menu on any network share or folder with:
  - **Open**: Directly launches the real UNC path in native Windows File Explorer.
  - **Map Drive**: Connects into the existing Phase 3 drive-mapping workflow with drive letter selection, conflict detection, persistent toggles, and safe replacement.
  - **Properties**: Displays authentic Windows properties with file/folder counts, size, NTFS/SMB ACL verification, security context, and mapped drive status.
  - **Copy UNC Path**: Instantly copies the full UNC path to clipboard.
- **Windows Properties Dialog**: Recreates the authentic Windows Properties dialog with three distinct tabs:
  - **General**: Displays resource name, UNC path, server, share, subfolder, local/remote status, item type (Share, Folder, File), file size, folder and file counts, creation/modification timestamps, and file attributes.
  - **Sharing & Mapping**: Network path details, mapped drive letter, live connection status, network availability, and inline buttons to map or unmap drive letters.
  - **Security & Permissions**: Verified Windows NTFS/SMB permissions (Read/Traverse, Write/Modify, verified ACL status), Active Directory user credentials, domain name, and authentication token type. Zero fabricated data; strictly verifies real permissions without attempting to bypass Windows security.

---

## Technical Guide & Operations

### How Active Directory Discovery Works
1. Resolves the current Windows user security token via `[System.Security.Principal.WindowsIdentity]::GetCurrent()`.
2. Queries the domain context and queries AD LDAP for domain member servers with server OS objects or CIFS Service Principal Names (`(&(objectCategory=computer)(|(operatingSystem=*Server*)(servicePrincipalName=cifs/*)))`).
3. Discovers published disk shares using CIM/WMI `Win32_Share` (type 0 STYPE_DISKTREE) and fallback `net view \\<server>`.
4. Checks server reachability on TCP port 445 before probing to prevent UI hangs on offline servers.

### How Accessible Shares are Detected
Each candidate share is evaluated against the user's native Windows security context via `[System.IO.Directory]::GetFileSystemEntries($uncPath)`. If traversal is permitted, write access is verified with a transient probe. Administrative hidden shares (ending in `$`) and access-denied shares are excluded from the primary user view and recorded in the audit log.

### How to Browse Shares and Select Targets
1. In the **Network Shares Management** view, select any accessible share from the list or server tree.
2. The **Folder Browser** loads real filesystem entries. Double-click folders to navigate deeper.
3. Click **Select Target** on any folder or subfolder (e.g. `\\SERVER01\Projects\Network\Cisco`) to set it as the drive mapping target.

### How Drive Mapping and Conflict Resolution Work
1. Select a drive letter (e.g. `Z:`) from the dropdown. Letters currently in use are clearly marked.
2. Click **Map Drive**. If the letter is free, it is mapped with `/persistent:yes`.
3. If the letter is already mapped, Bun-Drive displays a conflict warning showing the existing remote target and asks whether to cancel, pick a free letter, or safely replace the mapping.

### Required Windows Permissions & Limitations
- **Standard User**: Normal domain user credentials with no Administrator privileges are required. Both HKCU registry registration and drive letter mapping (`net use`) operate within standard user privileges.
- **Non-Domain / Workgroup Environments**: When running on standalone or workgroup machines, Bun-Drive detects the workgroup status and discovers local shares or probed servers using standard SMB negotiation.

---

## Development & Verification

```bash
# Start full-stack server and UI on port 3000
npm run dev

# Run TypeScript typecheck
npm run lint

# Run automated test suite (Identity, Discovery, FileSystem, Shell Blueprint, Phase 2 Shell Integration)
npm test

# Build production bundle
npm run build
```
