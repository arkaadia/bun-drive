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
