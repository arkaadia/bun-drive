<#
.SYNOPSIS
    Bun-Drive Phase 2: Windows File Explorer Shell Namespace Extension & Virtual Folder Mount Script
.DESCRIPTION
    Integrates Bun-Drive directly into the native Windows File Explorer Left Navigation Pane
    under the current Windows user's HKCU registry hive (no Administrator privileges required).
    Creates a real Virtual Namespace Root Folder (%LOCALAPPDATA%\Bun-Drive\NamespaceRoot)
    and synchronizes Windows Folder Shortcuts (.lnk / Shell Folder Shortcuts) pointing to
    authorized Active Directory SMB network shares.
.PARAMETER Action
    'Status'   - Query current HKCU Shell Namespace registration, Virtual Root shortcuts, and mapped drives
    'Register' - Register Bun-Drive CLSID in HKCU Explorer Namespace Tree and synchronize share shortcuts
    'Sync'     - Synchronize authorized AD network shares into the Bun-Drive Virtual Root folder
    'Unregister' - Remove Bun-Drive CLSID from HKCU Explorer Namespace Tree and clean up virtual shortcuts
    'MapDrive' - Map a network share UNC path to a Windows drive letter (e.g. Z:)
    'UnmapDrive' - Remove a mapped Windows drive letter
#>

[CmdletBinding()]
param (
    [ValidateSet('Status', 'Register', 'Sync', 'Unregister', 'MapDrive', 'UnmapDrive')]
    [string]$Action = 'Status',

    [string]$SharesJson = '[]',
    [string]$DriveLetter = '',
    [string]$UncPath = '',
    [bool]$Persistent = $true,
    [bool]$ReplaceExisting = $false
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$CLSID = "{B010D817-E923-4E87-9DC2-A74B29E309FA}"
$SHELL_FOLDER_INSTANCE_CLSID = "{0E5AAE11-A475-4c5b-AB00-C66DE400274E}"
$PROG_ID = "BunDrive.ShellNamespaceExtension.1"
$VIRTUAL_ROOT = Join-Path $env:LOCALAPPDATA "Bun-Drive\NamespaceRoot"
$ICON_PATH = "%SystemRoot%\system32\imageres.dll,-1043"

$clsidRegPath = "HKCU:\Software\Classes\CLSID\$CLSID"
$namespaceRegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace\$CLSID"
$hideIconsRegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel"

function Update-ExplorerCache {
    try {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NativeShell {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@ -ErrorAction SilentlyContinue

        [NativeShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    } catch {}
}

function Ensure-VirtualRoot {
    if (-not (Test-Path -Path $VIRTUAL_ROOT)) {
        New-Item -Path $VIRTUAL_ROOT -ItemType Directory -Force | Out-Null
    }
    # Create desktop.ini for custom folder branding in Windows Explorer
    $desktopIni = Join-Path $VIRTUAL_ROOT "desktop.ini"
    if (-not (Test-Path -Path $desktopIni)) {
        $iniContent = @"
[.ShellClassInfo]
IconResource=%SystemRoot%\system32\imageres.dll,-1043
InfoTip=Bun-Drive Active Directory Network Shares
LocalizedResourceName=Bun-Drive
"@
        Set-Content -Path $desktopIni -Value $iniContent -Encoding UTF8 -Force
        attrib +h +s "$desktopIni" 2>$null
        attrib +r "$VIRTUAL_ROOT" 2>$null
    }
}

function Register-ShellNamespace {
    Ensure-VirtualRoot

    # 1. Root CLSID Key
    New-Item -Path $clsidRegPath -Force | Out-Null
    Set-ItemProperty -Path $clsidRegPath -Name "(Default)" -Value "Bun-Drive"
    Set-ItemProperty -Path $clsidRegPath -Name "InfoTip" -Value "Active Directory Network Shares for Current Windows User"
    Set-ItemProperty -Path $clsidRegPath -Name "System.IsPinnedToNameSpaceTree" -Value 1 -Type DWord
    Set-ItemProperty -Path $clsidRegPath -Name "SortOrderIndex" -Value 66 -Type DWord

    # 2. DefaultIcon
    $iconKey = "$clsidRegPath\DefaultIcon"
    New-Item -Path $iconKey -Force | Out-Null
    Set-ItemProperty -Path $iconKey -Name "(Default)" -Value $ICON_PATH

    # 3. InProcServer32 -> Windows Shell Folder Instance Handler
    $inprocKey = "$clsidRegPath\InProcServer32"
    New-Item -Path $inprocKey -Force | Out-Null
    Set-ItemProperty -Path $inprocKey -Name "(Default)" -Value "%SystemRoot%\system32\shell32.dll"
    Set-ItemProperty -Path $inprocKey -Name "ThreadingModel" -Value "Apartment"

    # 4. Instance -> Point to Shell FileSystem Folder Proxy
    $instanceKey = "$clsidRegPath\Instance"
    New-Item -Path $instanceKey -Force | Out-Null
    Set-ItemProperty -Path $instanceKey -Name "CLSID" -Value $SHELL_FOLDER_INSTANCE_CLSID

    # 5. InitPropertyBag -> Bind Virtual Root Directory
    $bagKey = "$clsidRegPath\Instance\InitPropertyBag"
    New-Item -Path $bagKey -Force | Out-Null
    Set-ItemProperty -Path $bagKey -Name "Attributes" -Value 17 -Type DWord
    Set-ItemProperty -Path $bagKey -Name "TargetFolderPath" -Value $VIRTUAL_ROOT

    # 6. ShellFolder Attributes (SFGAO_FOLDER | SFGAO_HASSUBFOLDER | SFGAO_CANLINK)
    $shellFolderKey = "$clsidRegPath\ShellFolder"
    New-Item -Path $shellFolderKey -Force | Out-Null
    Set-ItemProperty -Path $shellFolderKey -Name "Attributes" -Value ([uint32]"0xF080004D") -Type DWord
    Set-ItemProperty -Path $shellFolderKey -Name "FolderValueFlags" -Value 40 -Type DWord

    # 7. Register in Explorer Desktop NameSpace
    New-Item -Path $namespaceRegPath -Force | Out-Null
    Set-ItemProperty -Path $namespaceRegPath -Name "(Default)" -Value "Bun-Drive"

    # 8. Hide clutter icon on Desktop surface while keeping Navigation Pane pin
    if (-not (Test-Path $hideIconsRegPath)) {
        New-Item -Path $hideIconsRegPath -Force | Out-Null
    }
    Set-ItemProperty -Path $hideIconsRegPath -Name $CLSID -Value 1 -Type DWord

    # Notify Windows Explorer of shell extension association update
    Update-ExplorerCache
}

function Unregister-ShellNamespace {
    if (Test-Path $namespaceRegPath) {
        Remove-Item -Path $namespaceRegPath -Recurse -Force
    }
    if (Test-Path $clsidRegPath) {
        Remove-Item -Path $clsidRegPath -Recurse -Force
    }
    if (Test-Path $hideIconsRegPath) {
        Remove-ItemProperty -Path $hideIconsRegPath -Name $CLSID -ErrorAction SilentlyContinue
    }
    if (Test-Path $VIRTUAL_ROOT) {
        Get-ChildItem -Path $VIRTUAL_ROOT -Filter "*.lnk" -Force | Remove-Item -Force
    }

    # Notify Windows Explorer of shell namespace removal
    Update-ExplorerCache
}

function Sync-VirtualShortcuts {
    param([array]$SharesList)
    Ensure-VirtualRoot

    $wshShell = New-Object -ComObject WScript.Shell
    $expectedFiles = @{}

    foreach ($sh in $SharesList) {
        if (-not $sh.isAccessible) { continue }
        $cleanName = ($sh.name -replace '[\/\\:*?"<>|]', '_').Trim()
        $safeServer = (($sh.server -split '\.')[0] -replace '[\/\\:*?"<>|]', '_').Trim()
        $shortcutName = "$cleanName ($safeServer).lnk"
        $shortcutFull = Join-Path $VIRTUAL_ROOT $shortcutName
        $expectedFiles[$shortcutName] = $true

        $lnk = $wshShell.CreateShortcut($shortcutFull)
        $lnk.TargetPath = $sh.uncPath
        $lnk.Description = if ($sh.description) { $sh.description } else { "Bun-Drive Network Share $($sh.uncPath)" }
        $lnk.IconLocation = "%SystemRoot%\system32\imageres.dll,137"
        $lnk.Save()
    }

    # Remove stale shortcuts no longer accessible or present
    $existingLnks = Get-ChildItem -Path $VIRTUAL_ROOT -Filter "*.lnk"
    foreach ($file in $existingLnks) {
        if (-not $expectedFiles.ContainsKey($file.Name)) {
            Remove-Item -Path $file.FullName -Force
        }
    }

    # Notify Windows Explorer of directory changes
    Update-ExplorerCache
}

function Get-MappedDrives {
    $drives = @()
    try {
        $smbMappings = Get-SmbMapping -ErrorAction Stop
        foreach ($m in $smbMappings) {
            if ($m.LocalPath) {
                $parts = $m.RemotePath.TrimStart('\') -split '\\'
                $drives += [ordered]@{
                    driveLetter = $m.LocalPath
                    uncPath = $m.RemotePath
                    server = if ($parts.Length -gt 0) { $parts[0] } else { "" }
                    shareName = if ($parts.Length -gt 1) { $parts[1] } else { "" }
                    persistent = $true
                    status = [string]$m.Status
                    mappedAt = (Get-Date -Format "o")
                }
            }
        }
    } catch {
        # Fallback to WMI Win32_MappedLogicalDisk
        $wmiDrives = Get-CimInstance -ClassName Win32_MappedLogicalDisk -ErrorAction SilentlyContinue
        foreach ($d in $wmiDrives) {
            $parts = $d.ProviderName.TrimStart('\') -split '\\'
            $drives += [ordered]@{
                driveLetter = $d.DeviceID
                uncPath = $d.ProviderName
                server = if ($parts.Length -gt 0) { $parts[0] } else { "" }
                shareName = if ($parts.Length -gt 1) { $parts[1] } else { "" }
                persistent = $true
                status = "Connected"
                mappedAt = (Get-Date -Format "o")
            }
        }
    }
    return $drives
}

# Execute Requested Action
if ($Action -eq 'Register') {
    Register-ShellNamespace
    $parsedShares = $SharesJson | ConvertFrom-Json
    if ($parsedShares) {
        Sync-VirtualShortcuts -SharesList $parsedShares
    }
} elseif ($Action -eq 'Sync') {
    $parsedShares = $SharesJson | ConvertFrom-Json
    if ($parsedShares) {
        Sync-VirtualShortcuts -SharesList $parsedShares
    }
} elseif ($Action -eq 'Unregister') {
    Unregister-ShellNamespace
} elseif ($Action -eq 'MapDrive') {
    if ($DriveLetter -and $UncPath) {
        $cleanLetter = if ($DriveLetter.EndsWith(':')) { $DriveLetter.ToUpper() } else { "$($DriveLetter.ToUpper()):" }
        if ($cleanLetter -match '^[D-Z]:$' -and $UncPath -match '^\\\\[^<>"|*?;\r\n]+$') {
            if ($ReplaceExisting) {
                net use $cleanLetter /delete /y 2>&1 | Out-Null
            }
            $persistFlag = if ($Persistent) { "/persistent:yes" } else { "/persistent:no" }
            net use $cleanLetter "$UncPath" $persistFlag 2>&1 | Out-Null
        }
    }
} elseif ($Action -eq 'UnmapDrive') {
    if ($DriveLetter) {
        $cleanLetter = if ($DriveLetter.EndsWith(':')) { $DriveLetter.ToUpper() } else { "$($DriveLetter.ToUpper()):" }
        if ($cleanLetter -match '^[D-Z]:$') {
            net use $cleanLetter /delete /y 2>&1 | Out-Null
        }
    }
}

# Build Status Output
$isRegistered = (Test-Path $clsidRegPath) -and (Test-Path $namespaceRegPath)
$isPinned = $false
if (Test-Path $clsidRegPath) {
    $pinVal = (Get-ItemProperty -Path $clsidRegPath -Name "System.IsPinnedToNameSpaceTree" -ErrorAction SilentlyContinue)."System.IsPinnedToNameSpaceTree"
    $isPinned = ($pinVal -eq 1)
}

$shortcuts = @()
if (Test-Path $VIRTUAL_ROOT) {
    $wshShell = New-Object -ComObject WScript.Shell
    $lnks = Get-ChildItem -Path $VIRTUAL_ROOT -Filter "*.lnk"
    foreach ($f in $lnks) {
        $sc = $wshShell.CreateShortcut($f.FullName)
        $target = $sc.TargetPath
        $parts = $target.TrimStart('\') -split '\\'
        $shortcuts += [ordered]@{
            name = $f.BaseName
            shareId = $target
            uncPath = $target
            shortcutPath = $f.FullName
            accessLevel = "ReadWrite"
            server = if ($parts.Length -gt 0) { $parts[0] } else { "" }
            synchronizedAt = $f.LastWriteTime.ToString("o")
            status = "Active"
        }
    }
}

$output = [ordered]@{
    isRegisteredInExplorer = $isRegistered
    isPinnedToNavigationPane = $isPinned
    virtualRootPath = $VIRTUAL_ROOT
    clsid = $CLSID
    progId = $PROG_ID
    activeShortcuts = $shortcuts
    mappedDrives = (Get-MappedDrives)
    timestamp = (Get-Date -Format "o")
}

$output | ConvertTo-Json -Depth 6
