/**
 * Bun-Drive Phase 3: Active Directory Share Management & File Browsing
 * Provides real-time Active Directory domain detection, accessible share discovery,
 * real subfolder filesystem browsing, and safe drive letter mapping with conflict resolution.
 */
import React, { useState, useEffect } from 'react';
import {
  Server,
  Folder,
  HardDrive,
  RefreshCw,
  FolderTree,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  ArrowUp,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  FileImage,
  File,
  ChevronRight,
  ChevronDown,
  Layers,
  Lock,
  CornerDownRight,
  Sparkles,
  Info,
  RotateCcw
} from 'lucide-react';
import {
  NetworkShare,
  WindowsIdentity,
  ShellIntegrationState,
  BrowseResult,
  FileSystemEntry,
  LogEntry,
  AvailableDriveLetter,
  DriveMappingConflict,
  ContextMenuTarget,
  GroupPolicyRefreshResult
} from '../types/drive.js';

interface NetworkSharesManagerProps {
  identity: WindowsIdentity | null;
  shares: NetworkShare[];
  inaccessibleCount: number;
  shellState: ShellIntegrationState | null;
  isRefreshing: boolean;
  onRefreshShares: () => Promise<void>;
  onRefreshGroupPolicy?: () => Promise<void>;
  isGpUpdating?: boolean;
  lastGpResult?: GroupPolicyRefreshResult | null;
  gpError?: string | null;
  onClearGpError?: () => void;
  onMapDrive: (letter: string, uncPath: string, persistent: boolean, replace: boolean) => Promise<void>;
  onUnmapDrive: (letter: string) => Promise<void>;
  onOpenInExplorer: (uncPath: string) => void;
  logs: LogEntry[];
  onRefreshLogs: () => void;
  initialSelectedPath?: string;
  onContextMenu?: (e: React.MouseEvent, target: ContextMenuTarget) => void;
  onOpenProperties?: (uncPath: string) => void;
}

export const NetworkSharesManager: React.FC<NetworkSharesManagerProps> = ({
  identity,
  shares,
  inaccessibleCount,
  shellState,
  isRefreshing,
  onRefreshShares,
  onRefreshGroupPolicy,
  isGpUpdating = false,
  lastGpResult,
  gpError,
  onClearGpError,
  onMapDrive,
  onUnmapDrive,
  onOpenInExplorer,
  logs,
  onRefreshLogs,
  initialSelectedPath,
  onContextMenu,
  onOpenProperties
}) => {
  // Selected Target Path (either share root or subfolder)
  const [selectedTarget, setSelectedTarget] = useState<string>(
    initialSelectedPath || (shares.length > 0 ? shares[0].uncPath : '')
  );

  // Drive Letter Mapping Controls
  const [selectedLetter, setSelectedLetter] = useState<string>('Z:');
  const [isPersistent, setIsPersistent] = useState<boolean>(true);
  const [isMappingBusy, setIsMappingBusy] = useState<boolean>(false);
  const [mappingMessage, setMappingMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Conflict Resolution State
  const [activeConflict, setActiveConflict] = useState<DriveMappingConflict | null>(null);

  // Available Drive Letters
  const [availableLetters, setAvailableLetters] = useState<AvailableDriveLetter[]>([]);

  // Folder Browsing State
  const [browsingPath, setBrowsingPath] = useState<string | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [isBrowseLoading, setIsBrowseLoading] = useState<boolean>(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // UI View Mode (grouped tree vs flat table)
  const [displayMode, setDisplayMode] = useState<'tree' | 'table'>('tree');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Load available drive letters from API
  const fetchDriveLetters = async () => {
    try {
      const res = await fetch('/api/shell/drive-letters');
      if (res.ok) {
        const data = await res.json();
        setAvailableLetters(data.letters || []);
      }
    } catch {
      // Fallback generation
      const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => ({
        letter: `${c}:`,
        isMapped: Boolean(shellState?.mappedDrives.some(d => d.driveLetter === `${c}:`)),
        currentTarget: shellState?.mappedDrives.find(d => d.driveLetter === `${c}:`)?.uncPath
      }));
      setAvailableLetters(letters);
    }
  };

  useEffect(() => {
    fetchDriveLetters();
  }, [shellState]);

  // Set default selection when shares arrive or initialSelectedPath updates
  useEffect(() => {
    if (initialSelectedPath) {
      setSelectedTarget(initialSelectedPath);
      loadFolder(initialSelectedPath);
    } else if (shares.length > 0 && !selectedTarget) {
      setSelectedTarget(shares[0].uncPath);
      loadFolder(shares[0].uncPath);
    }
  }, [shares, initialSelectedPath]);

  // Handle Copy Path
  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  // Browse Folder Contents
  const loadFolder = async (uncPath: string) => {
    if (!uncPath) return;
    setIsBrowseLoading(true);
    setBrowseError(null);
    setBrowsingPath(uncPath);
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(uncPath)}`);
      if (res.ok) {
        const data: BrowseResult = await res.json();
        setBrowseResult(data);
      } else {
        const err = await res.json();
        setBrowseError(err.error || 'Failed to browse directory');
        setBrowseResult(null);
      }
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : String(err));
      setBrowseResult(null);
    } finally {
      setIsBrowseLoading(false);
    }
  };

  // Check Drive Letter Conflict when letter changes
  const handleSelectLetterChange = (letter: string) => {
    setSelectedLetter(letter);
    setMappingMessage(null);
    setActiveConflict(null);

    const existing = shellState?.mappedDrives.find(d => d.driveLetter === letter);
    if (existing) {
      setActiveConflict({
        hasConflict: true,
        driveLetter: letter,
        existingTarget: existing.uncPath,
        existingMapping: existing,
        message: `Drive letter ${letter} is already mapped to ${existing.uncPath} (${existing.shareName})`
      });
    }
  };

  // Execute Map Drive
  const handleExecuteMap = async (forceReplace = false) => {
    if (!selectedTarget) {
      setMappingMessage({ text: 'Please select a network share or subfolder first.', type: 'error' });
      return;
    }
    setIsMappingBusy(true);
    setMappingMessage(null);
    try {
      await onMapDrive(selectedLetter, selectedTarget, isPersistent, forceReplace);
      setMappingMessage({
        text: `Successfully mapped ${selectedLetter} -> ${selectedTarget}`,
        type: 'success'
      });
      setActiveConflict(null);
      fetchDriveLetters();
      onRefreshLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already in use') || msg.includes('conflict')) {
        const existing = shellState?.mappedDrives.find(d => d.driveLetter === selectedLetter);
        setActiveConflict({
          hasConflict: true,
          driveLetter: selectedLetter,
          existingTarget: existing?.uncPath || 'Another network resource',
          existingMapping: existing,
          message: msg
        });
      } else {
        setMappingMessage({ text: msg, type: 'error' });
      }
    } finally {
      setIsMappingBusy(false);
    }
  };

  // Execute Unmap Drive
  const handleExecuteUnmap = async (letterToUnmap?: string) => {
    const targetLetter = letterToUnmap || selectedLetter;
    setIsMappingBusy(true);
    setMappingMessage(null);
    try {
      await onUnmapDrive(targetLetter);
      setMappingMessage({
        text: `Successfully unmapped drive ${targetLetter}`,
        type: 'info'
      });
      setActiveConflict(null);
      fetchDriveLetters();
      onRefreshLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMappingMessage({ text: msg, type: 'error' });
    } finally {
      setIsMappingBusy(false);
    }
  };

  // Find next free drive letter
  const handleChooseNextFreeLetter = () => {
    const mappedSet = new Set(shellState?.mappedDrives.map(d => d.driveLetter) || []);
    const candidate = availableLetters.find(l => !mappedSet.has(l.letter));
    if (candidate) {
      setSelectedLetter(candidate.letter);
      setActiveConflict(null);
      setMappingMessage({ text: `Switched to free letter ${candidate.letter}`, type: 'info' });
    }
  };

  // Group shares by server for tree view
  const groupedServers = React.useMemo(() => {
    const map = new Map<string, NetworkShare[]>();
    for (const sh of shares) {
      const srv = sh.server;
      if (!map.has(srv)) map.set(srv, []);
      map.get(srv)!.push(sh);
    }
    return Array.from(map.entries());
  }, [shares]);

  // File icon helper
  const getFileIcon = (entry: FileSystemEntry) => {
    if (entry.isDirectory) {
      return <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20" />;
    }
    const ext = entry.extension.toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    }
    if (['.docx', '.doc', '.pdf', '.txt', '.md'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-400" />;
    }
    if (['.zip', '.rar', '.7z', '.tar'].includes(ext)) {
      return <FileArchive className="w-4 h-4 text-amber-500" />;
    }
    if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
      return <FileImage className="w-4 h-4 text-purple-400" />;
    }
    if (['.json', '.xml', '.ts', '.js', '.cfg', '.vsdx'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-cyan-400" />;
    }
    return <File className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950 text-slate-100 text-xs font-sans">
      {/* ========================================================
          1. ACTIVE DIRECTORY / DOMAIN DETECTION SECTION
          ======================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                Active Directory Share Management
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                  Real Windows Environment
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Automatic domain context & accessible SMB shares for currently authenticated user
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={onRefreshShares}
              disabled={isRefreshing || isGpUpdating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 text-white font-medium rounded text-xs transition shadow-sm"
              title="Rediscover Active Directory shares and refresh live mappings (without gpupdate)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing Shares...' : 'Refresh Shares'}</span>
            </button>

            {onRefreshGroupPolicy && (
              <button
                onClick={onRefreshGroupPolicy}
                disabled={isGpUpdating || isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 text-white font-medium rounded text-xs transition shadow-sm"
                title="Execute gpupdate /force, wait for policy update, and re-discover real network shares"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isGpUpdating ? 'animate-spin' : ''}`} />
                <span>{isGpUpdating ? 'Updating Group Policy...' : 'Refresh Group Policy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Group Policy Active Progress Banner */}
        {isGpUpdating && (
          <div className="bg-indigo-950/70 border border-indigo-700/80 rounded-lg p-3 text-indigo-200 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2.5">
              <RotateCcw className="w-4 h-4 text-indigo-400 animate-spin" />
              <div>
                <span className="font-semibold text-white">Updating Group Policy (gpupdate /force)...</span>
                <p className="text-[11px] text-indigo-300">
                  Refreshing Active Directory computer & user policies, re-evaluating Kerberos security tokens, and preparing network share rediscovery.
                </p>
              </div>
            </div>
            <span className="text-[10px] bg-indigo-900/80 text-indigo-200 px-2 py-0.5 rounded border border-indigo-700/60 font-mono">
              Background Execution
            </span>
          </div>
        )}

        {/* Group Policy Error Banner */}
        {gpError && !isGpUpdating && (
          <div className="bg-rose-950/70 border border-rose-700/80 rounded-lg p-3 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <div>
                <span className="font-semibold text-rose-100">Group Policy update failed</span>
                <p className="text-[11px] text-rose-300">{gpError}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={onRefreshShares}
                className="px-2.5 py-1 bg-rose-900 hover:bg-rose-800 text-white text-[11px] rounded transition"
              >
                Try Standard Share Refresh
              </button>
              {onClearGpError && (
                <button
                  onClick={onClearGpError}
                  className="px-2 py-1 text-rose-400 hover:text-white text-[11px]"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Group Policy Post-Update Diff Notification */}
        {lastGpResult && lastGpResult.success && !isGpUpdating && (
          <div className="bg-slate-950/90 border border-indigo-800/80 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="font-semibold text-white text-xs">
                  Group Policy update completed ({lastGpResult.gpupdate.durationMs}ms)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(lastGpResult.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <span className="text-[10px] text-indigo-300 font-mono bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                Explorer Synced
              </span>
            </div>

            {/* Diff details */}
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              {lastGpResult.diff.summary.newCount > 0 ? (
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/70 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {lastGpResult.diff.summary.newCount} newly accessible: {lastGpResult.diff.newlyAccessible.map(s => s.name).join(', ')}
                </span>
              ) : (
                <span className="text-slate-400">No new shares published.</span>
              )}

              {lastGpResult.diff.summary.removedCount > 0 && (
                <span className="bg-amber-950 text-amber-300 border border-amber-800/70 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {lastGpResult.diff.summary.removedCount} no longer accessible: {lastGpResult.diff.noLongerAccessible.map(s => s.name).join(', ')}
                </span>
              )}

              {lastGpResult.diff.summary.offlineCount > 0 && (
                <span className="bg-rose-950 text-rose-300 border border-rose-800/70 px-2 py-0.5 rounded font-medium">
                  {lastGpResult.diff.summary.offlineCount} offline server(s)
                </span>
              )}

              <span className="text-slate-500 text-[10px]">
                Total accessible: {lastGpResult.discovery.shares.length} • Virtual Root: {lastGpResult.shellStatus.activeShortcuts.length} shortcuts
              </span>
            </div>
          </div>
        )}

        {/* Domain & Identity Details Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="bg-slate-950/70 border border-slate-800/70 rounded p-2.5">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">Domain</span>
            <span className="text-xs font-mono font-medium text-white truncate block mt-0.5">
              {identity?.domain || identity?.dnsDomain || 'Detecting...'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono truncate block">
              {identity?.dnsDomain || 'domain.local'}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/70 rounded p-2.5">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">Current User</span>
            <span className="text-xs font-mono font-medium text-emerald-300 truncate block mt-0.5">
              {identity?.username || 'Current Windows User'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono truncate block">
              Auth: {identity?.authType || 'Kerberos'}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/70 rounded p-2.5">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">Computer Name</span>
            <span className="text-xs font-mono font-medium text-slate-200 truncate block mt-0.5">
              {identity?.computerName || 'WORKSTATION'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono truncate block">
              DC: {identity?.domainController || 'Primary DC'}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/70 rounded p-2.5">
            <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">Status</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-medium text-emerald-300 truncate">
                {identity?.workgroupStatus || (identity?.isDomainJoined ? 'Domain Joined' : 'Workgroup')}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 block truncate">
              {identity?.isDomainJoined ? 'Active Directory Member' : 'Local Network'}
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================
          2. AVAILABLE SHARES LIST & SELECTION BROWSER
          ======================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Available Shares ({shares.length})
            </h3>
            {inaccessibleCount > 0 && (
              <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded font-mono">
                {inaccessibleCount} Inaccessible Hidden (ACL)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDisplayMode(displayMode === 'tree' ? 'table' : 'tree')}
              className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
            >
              View: {displayMode === 'tree' ? 'Tree Hierarchy' : 'Flat Table'}
            </button>
          </div>
        </div>

        {/* Tree Presentation (SERVER01 ├── Public ...) */}
        {displayMode === 'tree' ? (
          <div className="space-y-3">
            {groupedServers.map(([serverName, serverShares]) => (
              <div key={serverName} className="bg-slate-950/60 border border-slate-800/80 rounded-md p-3">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-blue-300 mb-2">
                  <Server className="w-3.5 h-3.5 text-blue-400" />
                  <span>{serverName}</span>
                  <span className="text-[10px] text-slate-500 font-sans font-normal">
                    ({serverShares.length} share{serverShares.length > 1 ? 's' : ''})
                  </span>
                </div>

                <div className="space-y-1.5 pl-4 border-l-2 border-slate-800 ml-1.5 font-mono">
                  {serverShares.map((sh, idx) => {
                    const isSelected = selectedTarget === sh.uncPath;
                    const isLast = idx === serverShares.length - 1;
                    return (
                      <div
                        key={sh.id}
                        onClick={() => {
                          setSelectedTarget(sh.uncPath);
                          loadFolder(sh.uncPath);
                        }}
                        onContextMenu={(e) => {
                          if (onContextMenu) {
                            onContextMenu(e, {
                              name: sh.name,
                              uncPath: sh.uncPath,
                              isDirectory: true,
                              isShare: true,
                              server: sh.server,
                              share: sh.name,
                              mappedDrive: sh.mappedDrive,
                              accessStatus: sh.status || 'Accessible',
                              accessLevel: sh.accessLevel
                            });
                          }
                        }}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition select-none ${
                          isSelected
                            ? 'bg-blue-900/40 border border-blue-600/80 text-white'
                            : 'hover:bg-slate-850 text-slate-300 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 text-xs">{isLast ? '└──' : '├──'}</span>
                          <Folder className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                          <span className="font-semibold text-xs text-white">{sh.name}</span>
                          <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
                            {sh.uncPath}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                            Accessible
                          </span>
                          {sh.mappedDrive ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-700 font-bold">
                              {sh.mappedDrive}
                            </span>
                          ) : (
                            <span className="text-slate-600 px-1">—</span>
                          )}
                          {onOpenProperties && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenProperties(sh.uncPath);
                              }}
                              className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded"
                              title="Properties (Alt+Enter)"
                            >
                              <Info className="w-3 h-3 text-amber-400" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTarget(sh.uncPath);
                              loadFolder(sh.uncPath);
                            }}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
                          >
                            Browse
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Flat Table Presentation */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                  <th className="py-2 px-3 font-semibold">Server</th>
                  <th className="py-2 px-3 font-semibold">Share Name</th>
                  <th className="py-2 px-3 font-semibold">UNC Path</th>
                  <th className="py-2 px-3 font-semibold">Status</th>
                  <th className="py-2 px-3 font-semibold">Mapping</th>
                  <th className="py-2 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {shares.map((sh) => {
                  const isSelected = selectedTarget === sh.uncPath;
                  return (
                    <tr
                      key={sh.id}
                      onClick={() => {
                        setSelectedTarget(sh.uncPath);
                        loadFolder(sh.uncPath);
                      }}
                      onContextMenu={(e) => {
                        if (onContextMenu) {
                          onContextMenu(e, {
                            name: sh.name,
                            uncPath: sh.uncPath,
                            isDirectory: true,
                            isShare: true,
                            server: sh.server,
                            share: sh.name,
                            mappedDrive: sh.mappedDrive,
                            accessStatus: sh.status || 'Accessible',
                            accessLevel: sh.accessLevel
                          });
                        }
                      }}
                      className={`cursor-pointer transition select-none ${
                        isSelected ? 'bg-blue-950/50 text-white' : 'hover:bg-slate-850 text-slate-300'
                      }`}
                    >
                      <td className="py-2 px-3 font-mono text-slate-300">{sh.server}</td>
                      <td className="py-2 px-3 font-semibold text-white flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-amber-400" />
                        {sh.name}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-400">{sh.uncPath}</td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                          Accessible
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono font-bold">
                        {sh.mappedDrive ? (
                          <span className="text-blue-400">{sh.mappedDrive}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onOpenProperties && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenProperties(sh.uncPath);
                              }}
                              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                              title="Properties (Alt+Enter)"
                            >
                              <Info className="w-3.5 h-3.5 text-amber-400" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTarget(sh.uncPath);
                              loadFolder(sh.uncPath);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                          >
                            Select
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================
          3. SELECTED TARGET & DRIVE LETTER MAPPING PANEL
          ======================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>Drive Letter Mapping & Integration</span>
          {shellState?.isRegisteredInExplorer && (
            <span className="text-[10px] text-emerald-400 font-mono font-normal">
              Explorer Shell Namespace Synchronized
            </span>
          )}
        </h3>

        {/* Selected Location Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-md p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500">Selected Mapping Target:</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white break-all">
                {selectedTarget || 'No share or folder selected'}
              </span>
              {selectedTarget && (
                <button
                  onClick={() => handleCopy(selectedTarget)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  title="Copy UNC Path"
                >
                  {copiedPath === selectedTarget ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              You can map the entire share or select any subfolder below as the Windows drive letter mount target.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {selectedTarget && (
              <>
                {onOpenProperties && (
                  <button
                    onClick={() => onOpenProperties(selectedTarget)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-amber-300 text-xs font-medium transition flex items-center gap-1"
                    title="Properties (Alt+Enter)"
                  >
                    <Info className="w-3 h-3" />
                    <span>Properties</span>
                  </button>
                )}
                <button
                  onClick={() => loadFolder(selectedTarget)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded text-slate-200 text-xs font-medium transition"
                >
                  Browse Target
                </button>
                <button
                  onClick={() => onOpenInExplorer(selectedTarget)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-blue-400 text-xs font-medium transition flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Explorer</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Conflict Warning Box (if selected letter is in use) */}
        {activeConflict && (
          <div className="bg-amber-950/40 border border-amber-800/80 rounded-md p-3 text-amber-200 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-amber-100">
                  Drive Letter Conflict: {activeConflict.driveLetter} is already mapped
                </h4>
                <p className="text-[11px] text-amber-300/90 mt-0.5">
                  Existing Target: <span className="font-mono font-bold">{activeConflict.existingTarget}</span>
                </p>
                <p className="text-[11px] text-amber-400/80">
                  Never silently overwrite an existing mapping. Choose whether to cancel, pick another letter, or replace existing mapping.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-900/60">
              <button
                onClick={() => setActiveConflict(null)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleChooseNextFreeLetter}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
              >
                Choose Another Free Letter
              </button>
              <button
                onClick={() => handleExecuteMap(true)}
                disabled={isMappingBusy}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium transition"
              >
                Replace Existing Mapping (Safe)
              </button>
            </div>
          </div>
        )}

        {/* Drive Mapping Action Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Drive Letter:</label>
            <select
              value={selectedLetter}
              onChange={(e) => handleSelectLetterChange(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-blue-500"
            >
              {availableLetters.map((l) => (
                <option key={l.letter} value={l.letter}>
                  {l.letter} {l.isMapped ? `(Mapped: ${l.currentTarget?.split('\\').pop()})` : '(Free)'}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPersistent}
              onChange={(e) => setIsPersistent(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
            />
            <span>Persistent (/persistent:yes)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExecuteMap(false)}
              disabled={isMappingBusy || !selectedTarget}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 text-white font-medium rounded text-xs transition shadow flex items-center gap-1.5"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isMappingBusy ? 'Processing...' : 'Map Drive'}</span>
            </button>

            <button
              onClick={() => handleExecuteUnmap(selectedLetter)}
              disabled={isMappingBusy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded text-xs transition"
            >
              Unmap {selectedLetter}
            </button>
          </div>

          {/* Currently Mapped Drives summary badge */}
          {shellState && shellState.mappedDrives.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto text-[11px] text-slate-400 font-mono">
              <span>Active mappings:</span>
              {shellState.mappedDrives.map(d => (
                <span
                  key={d.driveLetter}
                  onClick={() => setSelectedLetter(d.driveLetter)}
                  className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 cursor-pointer hover:bg-blue-900"
                  title={`${d.driveLetter} -> ${d.uncPath}`}
                >
                  {d.driveLetter}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mapping status message banner */}
        {mappingMessage && (
          <div
            className={`p-2.5 rounded text-xs font-mono border ${
              mappingMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : mappingMessage.type === 'error'
                ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                : 'bg-blue-950/60 border-blue-800 text-blue-300'
            }`}
          >
            {mappingMessage.text}
          </div>
        )}
      </section>

      {/* ========================================================
          4. FOLDER BROWSER SECTION (REAL ACTIVE DIRECTORY CONTENTS)
          ======================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Folder Browser
            </h3>
            {browsingPath && (
              <span className="text-xs font-mono text-blue-400 truncate max-w-md">
                {browsingPath}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {browseResult?.parentPath && (
              <button
                onClick={() => loadFolder(browseResult.parentPath!)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1 text-[11px]"
                title="Navigate up to parent folder"
              >
                <ArrowUp className="w-3 h-3" />
                <span>Up</span>
              </button>
            )}

            {browsingPath && (
              <button
                onClick={() => loadFolder(browsingPath)}
                disabled={isBrowseLoading}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1 text-[11px]"
                title="Refresh current directory contents"
              >
                <RefreshCw className={`w-3 h-3 ${isBrowseLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}

            {browsingPath && (
              <button
                onClick={() => onOpenInExplorer(browsingPath)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1 text-[11px]"
                title="Open directory in Windows Explorer"
              >
                <ExternalLink className="w-3 h-3 text-blue-400" />
                <span>Explorer</span>
              </button>
            )}
          </div>
        </div>

        {/* Loading Indicator */}
        {isBrowseLoading && (
          <div className="py-8 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[11px]">Reading Windows filesystem metadata...</span>
          </div>
        )}

        {/* Access Denied or Error Display */}
        {browseError && !isBrowseLoading && (
          <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-md text-rose-200 space-y-2">
            <div className="flex items-center gap-2 text-rose-300 font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>Access Denied or Directory Error</span>
            </div>
            <p className="text-[11px] text-rose-300/80">{browseError}</p>
          </div>
        )}

        {/* Directory Contents Table */}
        {!isBrowseLoading && browseResult && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                  <th className="py-2 px-3 font-semibold">Name</th>
                  <th className="py-2 px-3 font-semibold">Date Modified</th>
                  <th className="py-2 px-3 font-semibold">Type</th>
                  <th className="py-2 px-3 font-semibold text-right">Size</th>
                  <th className="py-2 px-3 font-semibold text-right">Mapping Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {browseResult.entries.map((entry) => (
                  <tr
                    key={entry.path}
                    className="hover:bg-slate-850/80 group transition cursor-pointer select-none"
                    onContextMenu={(e) => {
                      if (onContextMenu) {
                        onContextMenu(e, {
                          name: entry.name,
                          uncPath: entry.path,
                          isDirectory: entry.isDirectory,
                          isShare: false,
                          server: browseResult.server,
                          share: browseResult.share,
                          accessStatus: 'Accessible',
                          accessLevel: 'ReadWrite'
                        });
                      }
                    }}
                    onDoubleClick={() => {
                      if (entry.isDirectory) {
                        loadFolder(entry.path);
                      } else {
                        onOpenInExplorer(entry.path);
                      }
                    }}
                  >
                    <td className="py-2 px-3 font-medium text-slate-200 group-hover:text-blue-300 flex items-center gap-2">
                      {getFileIcon(entry)}
                      <span
                        onClick={() => {
                          if (entry.isDirectory) {
                            loadFolder(entry.path);
                          }
                        }}
                        className={entry.isDirectory ? 'hover:underline font-semibold' : ''}
                      >
                        {entry.name}
                      </span>
                    </td>

                    <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(entry.modifiedTime).toLocaleDateString()}{' '}
                      {new Date(entry.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td className="py-2 px-3 text-slate-400 text-[11px]">
                      {entry.isDirectory ? 'File folder' : (entry.extension ? `${entry.extension.toUpperCase().slice(1)} File` : 'File')}
                    </td>

                    <td className="py-2 px-3 text-slate-400 font-mono text-right text-[11px]">
                      {entry.formattedSize || '—'}
                    </td>

                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onOpenProperties && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProperties(entry.path);
                            }}
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                            title="Properties (Alt+Enter)"
                          >
                            <Info className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                        )}
                        {entry.isDirectory ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTarget(entry.path);
                              setMappingMessage({
                                text: `Selected subfolder "${entry.name}" as mapping target.`,
                                type: 'info'
                              });
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                              selectedTarget === entry.path
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                            title="Select this subfolder as the Windows drive letter mount target"
                          >
                            {selectedTarget === entry.path ? 'Selected Target' : 'Select Target'}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenInExplorer(entry.path);
                            }}
                            className="p-1 text-slate-400 hover:text-white"
                            title="Open with default Windows application"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {browseResult.entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      This directory is empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================
          5. STATUS / ACTIVITY LOG SECTION
          ======================================================== */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span>Status / Activity Log</span>
            <span className="text-[10px] text-slate-500 font-mono font-normal">
              ({logs.length} events logged)
            </span>
          </h3>

          <button
            onClick={onRefreshLogs}
            className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Refresh Log
          </button>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 rounded p-2.5 max-h-40 overflow-y-auto font-mono text-[11px] space-y-1">
          {logs.slice(0, 30).map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-tight">
              <span className="text-slate-500 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span
                className={`px-1 rounded text-[9px] font-bold shrink-0 ${
                  log.level === 'SECURITY'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : log.level === 'WARN'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : log.level === 'ERROR'
                    ? 'bg-red-950 text-red-300 border border-red-800'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {log.level}
              </span>
              <span className="text-blue-400 shrink-0">[{log.source}]</span>
              <span className="text-slate-300 break-all">{log.message}</span>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="text-slate-500 text-center py-2">No activity logged yet.</div>
          )}
        </div>
      </section>
    </div>
  );
};
