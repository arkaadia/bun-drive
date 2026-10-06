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

### Phase 4: Group Policy Update & Automatic Share Refresh
- **User Actions**:
  - **Refresh Shares**: Performs Active Directory and SMB share re-enumeration under the current user's security token and synchronizes the UI/Explorer Namespace without invoking Group Policy.
  - **Refresh Group Policy**: Executes `gpupdate /force` in the background, waits for Group Policy update completion, triggers a fresh Active Directory share discovery, computes an old-vs-new state diff, updates the UI reactively, and synchronizes the Windows Explorer Namespace.
- **Asynchronous Execution & UI Responsiveness**: The Group Policy update runs entirely in the background without freezing or blocking the UI. Concurrency protection debounces and prevents overlapping simultaneous operations.
- **Post-GPUpdate Share Rediscovery**: Running `gpupdate /force` alone is not enough; Bun-Drive automatically invalidates cached Kerberos tokens and executes a new real Active Directory share discovery using the user's updated security context.
- **Share Accessibility State Diffing**: Automatically analyzes changes between previous and newly discovered states:
  - **Newly Accessible Shares**: New shares published or authorized through updated Group Policy security groups (e.g. `Finance-Secure`).
  - **Revoked / Inaccessible Shares**: Shares whose NTFS/SMB ACLs no longer grant user read/traverse permissions are filtered out of the authorized view.
  - **Offline Transitions & Restorations**: Identifies servers that went offline or became reachable again.
- **Explorer Namespace Synchronization**: Instantly updates virtual folder shortcuts in `%LOCALAPPDATA%\Bun-Drive\NamespaceRoot` (or test environment Virtual Root), materializing newly accessible shares and pruning revoked shortcuts without restarting Windows or re-registering the extension.
- **Security Audit & Diagnostic Logging**: Detailed execution metrics (command line, stdout, stderr, exit code, duration, timestamps) are surfaced in the Diagnostics Modal under the **Group Policy** tab.

---

## Technical Guide & Operations

### How Active Directory Discovery Works
1. Resolves the current Windows user security token via `[System.Security.Principal.WindowsIdentity]::GetCurrent()`.
2. Queries the domain context and queries AD LDAP for domain member servers with server OS objects or CIFS Service Principal Names (`(&(objectCategory=computer)(|(operatingSystem=*Server*)(servicePrincipalName=cifs/*)))`).
3. Discovers published disk shares using CIM/WMI `Win32_Share` (type 0 STYPE_DISKTREE) and fallback `net view \\<server>`.
4. Checks server reachability on TCP port 445 before probing to prevent UI hangs on offline servers.

### How Group Policy Refresh (gpupdate /force) Works
1. When the user clicks **Refresh Group Policy**, Bun-Drive launches `gpupdate.exe /force` via Windows process execution.
2. The standard input (`stdin`) stream is closed immediately to prevent interactive prompts (such as restart or logoff requests) from hanging the process.
3. Bun-Drive captures process startup status, standard output (`stdout`), error stream (`stderr`), exit code (0 for success), and execution duration in milliseconds.
4. If Group Policy update succeeds, cached security identity tokens are invalidated and an immediate fresh Active Directory discovery runs under the user's refreshed token.
5. Bun-Drive compares the old and new share list:
   - Newly authorized shares are added to the UI and materialized as `.lnk` shortcuts in the Explorer Namespace.
   - Shares that became inaccessible or revoked are pruned from the primary view and virtual shortcuts.
   - Previously selected paths that are no longer accessible are safely redirected to the Bun-Drive root.
6. If `gpupdate` fails (e.g. network disconnection, Domain Controller unreachable, non-zero exit code), Bun-Drive alerts the user with a descriptive error and presents a safe fallback button to run standard share rediscovery.

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

### Required Windows Permissions & Domain Configuration
- **Standard User**: Normal domain user credentials with no Administrator privileges are required. Both HKCU registry registration, drive letter mapping (`net use`), and user Group Policy refreshes (`gpupdate /force`) execute within standard user privileges.
- **Domain Controller Connectivity**: For computer policy updates and LDAP discovery, the workstation must have connectivity to the Domain Controller on ports 53 (DNS), 88 (Kerberos), 389 (LDAP), and 445 (SMB).
- **Non-Domain / Workgroup Environments**: When running on standalone or workgroup machines, Bun-Drive detects the workgroup status and discovers local shares or probed servers using standard SMB negotiation.

### Troubleshooting
- **Group Policy Update Failed (Exit Code != 0)**:
  - Check network connectivity to the Domain Controller (`DC01`).
  - Verify DNS resolution of the domain FQDN (e.g. `corp.local`).
  - Ensure Windows Time service (`w32tm`) is synchronized within 5 minutes of the Domain Controller (Kerberos requirement).
  - Use the **Security & AD Info** → **Group Policy** tab in Bun-Drive to inspect the raw `gpupdate` stdout and stderr logs.
- **New Share Not Visible After GPUpdate**:
  - Verify that the user's Active Directory account has been added to the corresponding security group on the Domain Controller.
  - If a group policy requires Kerberos ticket re-issuance, running **Refresh Group Policy** re-evaluates the token; in rare cases involving token bloat, Windows logoff/logon may be required by Active Directory.
- **Drive Mapping Conflict**:
  - If a drive letter is locked by an existing mapping or Windows process, select another available letter from the dropdown or click **Replace Existing** to safely disconnect and remap.

### Phase 6: Production Windows Installer, Startup and Clean Uninstall
- **Production-Ready Windows Installer**: Complete self-contained installer (`Bun-Drive-Setup-1.0.0.exe`) built using NSIS Modern UI 2 with solid LZMA compression (~29 MB installer containing 85 MB standalone executable, UI assets, and scripts).
- **Zero Administrator Rights Required**: Configured with `RequestExecutionLevel user` installing to `%LOCALAPPDATA%\Programs\Bun-Drive` and registering in `HKCU`. Standard Active Directory domain users on restricted corporate workstations can install without IT tickets or UAC elevation.
- **Zero Target Machine Dependencies**: The installer contains the fully compiled Windows x64 binary (`Bun-Drive.exe`), production web bundle (`dist/`), and native PowerShell bridge scripts (`scripts/`). Target workstations require **no** Node.js, npm, Vite, TypeScript, or Git.
- **Automated Windows Logon Startup**: Optional automatic startup registered at `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Bun-Drive` launching `Bun-Drive.exe --background` so the engine runs silently on logon without browser popups while keeping Explorer synchronized.
- **Preserved Explorer Shell Namespace Integration**: Directly registers CLSID `{B010D817-E923-4E87-9DC2-A74B29E309FA}` and binds the Shell Folder Instance proxy `{0E5AAE11-A475-4c5b-AB00-C66DE400274E}` to `%LOCALAPPDATA%\Bun-Drive\NamespaceRoot`.
- **Strictly Scoped Clean Uninstaller**: Completely removes Bun-Drive application files, Start Menu shortcuts, Desktop shortcut, startup run entry, Add/Remove Programs metadata, HKCU Explorer Namespace CLSID, and virtual root shortcuts (`*.lnk`). **Never** touches network share contents, SMB server files, user personal documents, or unrelated registry keys.
- **Safe Reinstall & Upgrade Handling**: Detects previous installation location via `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Bun-Drive`, gracefully terminates running instances (`taskkill /F /IM Bun-Drive.exe`) before overwriting binaries, avoids duplicate registry entries, and preserves user configuration.

---

## Technical Guide & Operations

### Installer Architecture & Technology Selection
- **Selected Technology**: **NSIS (Nullsoft Scriptable Install System) v3.08** with Modern UI 2 (`MUI2.nsh`) and solid LZMA compression.
- **Why NSIS Was Chosen**:
  1. **Native Per-User Architecture**: NSIS provides native, flawless per-user installation (`RequestExecutionLevel user`), installing cleanly into `%LOCALAPPDATA%\Programs\Bun-Drive` without requiring Windows Administrator elevation. This aligns with Bun-Drive's security model, which operates under standard domain user Kerberos/NTLM tokens.
  2. **Cross-Platform Reproducibility**: `makensis` runs deterministically in headless Linux CI/CD environments as well as on native Windows build servers, allowing automated builds of real Windows PE32+ installer executables without proprietary Windows SDK dependencies.
  3. **High-Ratio Solid LZMA Compression**: Compresses the self-contained 85 MB standalone Windows x64 binary, PowerShell scripts, and production web bundle down to ~29 MB.
  4. **Robust Registry & Shortcut Management**: Full native control over `HKCU\Software\Classes\CLSID`, `Desktop\NameSpace`, `Run`, and `Uninstall` keys.
  5. **Clean Uninstallation Engine**: Produces a cryptographically verified `uninstall.exe` with narrow deletion boundaries.

### Installation Directory & Structure
When installed, Bun-Drive is structured as follows:
```
%LOCALAPPDATA%\Programs\Bun-Drive\
├── Bun-Drive.exe          (Standalone Windows x64 compiled application)
├── uninstall.exe          (Clean uninstaller)
├── scripts\
│   ├── bun-drive-discovery.ps1    (Active Directory & SMB share discovery)
│   └── bun-drive-shell-mount.ps1  (Explorer Namespace mount & shortcut sync)
└── dist\
    ├── index.html         (Production React UI entry)
    └── assets\
        ├── index-*.js     (Optimized production script)
        └── index-*.css    (Tailwind styling)
```

Shortcuts created:
- Start Menu: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Bun-Drive\Bun-Drive.lnk`
- Start Menu Uninstaller: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Bun-Drive\Uninstall Bun-Drive.lnk`
- Desktop (optional): `%USERPROFILE%\Desktop\Bun-Drive.lnk`

### Windows Startup Behavior
- **Registry Location**: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- **Value Name**: `Bun-Drive`
- **Command**: `"%LOCALAPPDATA%\Programs\Bun-Drive\Bun-Drive.exe" --background`
- **Execution Lifecycle**:
  - When Windows boots and the domain user logs on, Windows launches `Bun-Drive.exe` with `--background`.
  - The application starts its background services on port 3000 (or configured port), initializes the Windows Explorer Shell Namespace node, and activates the automatic share change monitor.
  - In background mode, Bun-Drive suppresses opening the browser window.
  - If the user subsequently launches Bun-Drive from the Start Menu or Desktop, the application detects the already running instance, brings the web UI up in their default browser (`http://localhost:3000`), and exits immediately to avoid duplicate processes or port binding errors.

### Clean Uninstallation & Security Boundaries
The uninstaller (`uninstall.exe`) strictly removes:
1. Running process: terminates `Bun-Drive.exe` safely.
2. Explorer Shell Namespace: unregisters CLSID `{B010D817-E923-4E87-9DC2-A74B29E309FA}` and removes the Explorer Desktop Namespace pin.
3. Startup Entry: removes the `Bun-Drive` value from `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
4. Add/Remove Programs: removes `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Bun-Drive`.
5. Virtual Namespace Root: removes shortcuts in `%LOCALAPPDATA%\Bun-Drive\NamespaceRoot\*.lnk` and removes the folder.
6. Shortcuts: deletes Start Menu and Desktop shortcuts.
7. Application files: deletes `%LOCALAPPDATA%\Programs\Bun-Drive`.

**CRITICAL SAFETY INVARIANTS**:
- **NEVER** deletes network share contents (`\\server\share\*`).
- **NEVER** touches SMB server files or Active Directory records.
- **NEVER** touches personal user documents or desktop files outside Bun-Drive's managed folders.
- **NEVER** touches unrelated Registry keys or drive mappings created outside Bun-Drive.

### Windows Requirements
- **Operating System**: Windows 10 (1809+), Windows 11, or Windows Server 2016/2019/2022 (x64 architecture).
- **Permissions**: Standard Domain User (no Administrator privileges required).
- **PowerShell**: Windows PowerShell 5.1+ (included natively with Windows 10/11).
- **Network**: Active Directory domain membership and reachability to Domain Controllers on TCP 445 (SMB), 389 (LDAP), and 88 (Kerberos). Standalone / Workgroup machines supported for local SMB share browsing.

### Known Limitations & Validation Scope
- **Real Windows Validation Notice**:
  > Real Windows validation was not performed because the coding environment does not have access to the user's Windows workstation.
- Static verification, full test suite validation, cross-compilation of native Windows PE32+ executables, and NSIS installer generation have been fully executed and verified in the automated build environment.
- Domain Kerberos authentication, live Explorer shell pin visual rendering, and physical SMB share mounts must be verified in the target enterprise Windows environment.

---

## Development & Verification

```bash
# Start full-stack server and UI on port 3000
npm run dev

# Run TypeScript typecheck
npm run lint

# Run automated test suite (Phases 1-6: 69 tests across 17 suites)
npm test

# Build production frontend bundle
npm run build

# Compile standalone Windows binary (Bun-Drive.exe)
npm run build:exe

# Build complete production Windows installer (.exe)
npm run build:installer
```
