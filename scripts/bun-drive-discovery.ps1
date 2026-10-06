<#
.SYNOPSIS
    Bun-Drive Native Windows Active Directory & SMB Share Discovery Script
.DESCRIPTION
    Executes in the security context of the currently logged-in Windows user.
    Discovers domain controllers, Active Directory file servers, and SMB shares.
    Performs real access checks using current user Kerberos/NTLM credentials without storing passwords.
.OUTPUTS
    JSON payload containing user identity, domain details, and verified network shares.
#>

[CmdletBinding()]
param (
    [string[]]$TargetServers = @(),
    [switch]$IncludeInaccessible = $false,
    [int]$TimeoutSeconds = 15
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$result = [ordered]@{
    timestamp = (Get-Date -Format "o")
    identity = $null
    serversScanned = @()
    shares = @()
    inaccessibleSharesCount = 0
    logs = @()
}

function Write-DiagLog {
    param([string]$Level, [string]$Message)
    $entry = [ordered]@{
        timestamp = (Get-Date -Format "o")
        level = $Level
        source = "BunDrive-PS"
        message = $Message
    }
    $result.logs += $entry
}

Write-DiagLog "INFO" "Starting Bun-Drive discovery in current Windows user security context"

# 1. Resolve Current Windows User Identity
try {
    $windowsIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $fullUserName = $windowsIdentity.Name
    $parts = $fullUserName.Split('\')
    $domainPart = if ($parts.Length -gt 1) { $parts[0] } else { $env:USERDOMAIN }
    $userPart = if ($parts.Length -gt 1) { $parts[1] } else { $env:USERNAME }
    $userSid = $windowsIdentity.User.Value

    # Resolve AD User Groups
    $groups = @()
    foreach ($grp in $windowsIdentity.Groups) {
        try {
            $ntAccount = $grp.Translate([System.Security.Principal.NTAccount])
            $groups += $ntAccount.Value
        } catch {
            $groups += $grp.Value
        }
    }

    # Detect Domain and Domain Controller
    $isDomainJoined = $false
    $dnsDomain = $env:USERDNSDOMAIN
    $domainController = $null
    $authType = $windowsIdentity.AuthenticationType
    if (-not $authType) { $authType = "Negotiate" }

    try {
        $adDomain = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
        if ($adDomain) {
            $isDomainJoined = $true
            $dnsDomain = $adDomain.Name
            $dc = $adDomain.FindDomainController()
            if ($dc) {
                $domainController = $dc.Name
            }
        }
    } catch {
        # Fallback to environment/WMI
        if ($env:USERDNSDOMAIN) {
            $isDomainJoined = $true
        }
    }

    $logonServer = $env:LOGONSERVER
    if (-not $domainController -and $logonServer) {
        $domainController = $logonServer.TrimStart('\')
    }

    $result.identity = [ordered]@{
        username = $fullUserName
        pureUsername = $userPart
        domain = $domainPart
        dnsDomain = $dnsDomain
        userSid = $userSid
        isDomainJoined = $isDomainJoined
        domainController = $domainController
        logonServer = $logonServer
        authType = $authType
        groups = $groups
        computerName = $env:COMPUTERNAME
    }

    Write-DiagLog "INFO" "Resolved Windows user: $fullUserName (Domain: $domainPart, Domain-Joined: $isDomainJoined)"
} catch {
    Write-DiagLog "ERROR" "Failed to query Windows Identity: $_"
}

# 2. Discover Domain Servers
$candidateServers = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

if ($TargetServers -and $TargetServers.Count -gt 0) {
    foreach ($s in $TargetServers) {
        $candidateServers.Add($s.Trim()) | Out-Null
    }
} else {
    # Strategy A: Active Directory LDAP search for Computer Objects with Server OS or CIFS SPN
    if ($result.identity.isDomainJoined) {
        try {
            Write-DiagLog "INFO" "Querying Active Directory LDAP for file servers and domain member servers..."
            $rootEntry = [System.DirectoryServices.DirectoryEntry]::new()
            $searcher = [System.DirectoryServices.DirectorySearcher]::new($rootEntry)
            $searcher.Filter = "(&(objectCategory=computer)(|(operatingSystem=*Server*)(servicePrincipalName=cifs/*)))"
            $searcher.PropertiesToLoad.Add("dNSHostName") | Out-Null
            $searcher.PropertiesToLoad.Add("name") | Out-Null
            $searcher.SizeLimit = 100
            $searcher.ClientTimeout = [System.TimeSpan]::FromSeconds(8)

            $results = $searcher.FindAll()
            foreach ($res in $results) {
                $dnsName = $res.Properties["dnshostname"]
                $sName = $res.Properties["name"]
                if ($dnsName -and $dnsName.Count -gt 0) {
                    $candidateServers.Add($dnsName[0]) | Out-Null
                } elseif ($sName -and $sName.Count -gt 0) {
                    $candidateServers.Add($sName[0]) | Out-Null
                }
            }
            Write-DiagLog "INFO" "Discovered $($results.Count) server candidates from Active Directory"
        } catch {
            Write-DiagLog "WARN" "Active Directory LDAP server query failed: $_"
        }
    }

    # Strategy B: Domain Controller / Logon Server
    if ($result.identity.domainController) {
        $candidateServers.Add($result.identity.domainController) | Out-Null
    }
    if ($env:LOGONSERVER) {
        $candidateServers.Add($env:LOGONSERVER.TrimStart('\')) | Out-Null
    }

    # Strategy C: Local machine (if it hosts shares)
    $candidateServers.Add($env:COMPUTERNAME) | Out-Null
}

$result.serversScanned = @($candidateServers)
Write-DiagLog "INFO" "Scanning $($candidateServers.Count) target server(s) for SMB shares..."

# 3. Discover and Validate Network Shares
$discoveredShares = @()
$inaccessibleCount = 0

foreach ($server in $candidateServers) {
    if ([string]::IsNullOrWhiteSpace($server)) { continue }

    Write-DiagLog "INFO" "Probing server: $server"
    $serverShares = @()

    # Try WMI / CIM first
    try {
        $cimShares = Get-CimInstance -ClassName Win32_Share -ComputerName $server -OperationTimeoutSec 4 -ErrorAction Stop
        foreach ($sh in $cimShares) {
            # Type 0 is Disk Share (STYPE_DISKTREE)
            if ($sh.Type -eq 0) {
                $serverShares += [ordered]@{
                    Name = $sh.Name
                    Description = $sh.Description
                    Server = $server
                }
            }
        }
    } catch {
        # Fallback to 'net view' parser
        try {
            $netView = net view "\\$server" 2>$null
            if ($netView) {
                $parsing = $false
                foreach ($line in $netView) {
                    if ($line -match '^---') {
                        $parsing = $true
                        continue
                    }
                    if ($parsing -and -not [string]::IsNullOrWhiteSpace($line)) {
                        # Match: ShareName  Type  Comment
                        if ($line -match '^([^\s]+)\s+(Disk|Disk Drive|دیسک|DISQUE)\s*(.*)$') {
                            $shName = $Matches[1].Trim()
                            $shDesc = $Matches[3].Trim()
                            $serverShares += [ordered]@{
                                Name = $shName
                                Description = $shDesc
                                Server = $server
                            }
                        }
                    }
                }
            }
        } catch {}
    }

    # Filter system hidden admin shares ($ ending)
    foreach ($sh in $serverShares) {
        $shareName = $sh.Name
        # Exclude administrative shares like ADMIN$, C$, IPC$, PRINT$
        if ($shareName.EndsWith('$')) {
            continue
        }

        $uncPath = "\\$server\$shareName"
        $probeStart = [System.Diagnostics.Stopwatch]::StartNew()
        $isAccessible = $false
        $accessLevel = "None"
        $denialReason = $null

        # 4. Verify Real Permissions using Current Windows Security Token
        try {
            # Attempt directory enumeration using current token
            $entries = [System.IO.Directory]::GetFileSystemEntries($uncPath)
            $isAccessible = $true
            $accessLevel = "Read"

            # Check if write is permitted
            try {
                $testFile = [System.IO.Path]::Combine($uncPath, ".bun_drive_probe_$(Get-Random).tmp")
                [System.IO.File]::WriteAllText($testFile, "test")
                [System.IO.File]::Delete($testFile)
                $accessLevel = "ReadWrite"
            } catch {
                # Read-only permission
                $accessLevel = "Read"
            }
        } catch [System.UnauthorizedAccessException] {
            $isAccessible = $false
            $denialReason = "Access Denied (Windows NTFS/SMB ACL restrictions)"
            $inaccessibleCount++
            Write-DiagLog "SECURITY" "Access denied for current user on: $uncPath"
        } catch {
            $isAccessible = $false
            $denialReason = $_.Exception.Message
            $inaccessibleCount++
            Write-DiagLog "WARN" "Unable to open $uncPath : $($_.Exception.Message)"
        }

        $probeStart.Stop()
        $latencyMs = [int]$probeStart.ElapsedMilliseconds

        if ($isAccessible -or $IncludeInaccessible) {
            $discoveredShares += [ordered]@{
                id = $uncPath
                name = $shareName
                server = $server
                uncPath = $uncPath
                description = $sh.Description
                isAccessible = $isAccessible
                accessLevel = $accessLevel
                denialReason = $denialReason
                discoverySource = if ($server -eq $result.identity.domainController) { "LOGON_SERVER" } else { "AD_LDAP" }
                responseTimeMs = $latencyMs
                lastChecked = (Get-Date -Format "o")
            }
        }
    }
}

$result.shares = $discoveredShares
$result.inaccessibleSharesCount = $inaccessibleCount
Write-DiagLog "INFO" "Discovery completed. Found $($discoveredShares.Count) accessible share(s). Inaccessible filtered: $inaccessibleCount."

# Output JSON
$result | ConvertTo-Json -Depth 6
