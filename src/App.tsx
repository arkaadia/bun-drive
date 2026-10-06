/**
 * Bun-Drive Desktop Application
 * Windows File Explorer Active Directory network share discovery and integration engine.
 */
import React, { useEffect, useState } from 'react';
import { HeaderBar } from './components/HeaderBar.js';
import { Sidebar } from './components/Sidebar.js';
import { SharesView } from './components/SharesView.js';
import { FolderBrowser } from './components/FolderBrowser.js';
import { NetworkSharesManager } from './components/NetworkSharesManager.js';
import { DiagnosticsModal } from './components/DiagnosticsModal.js';
import { StatusFooter } from './components/StatusFooter.js';
import { ContextMenu } from './components/ContextMenu.js';
import { PropertiesModal } from './components/PropertiesModal.js';
import { NetworkShare, WindowsIdentity, BrowseResult, LogEntry, ShellIntegrationState, ContextMenuTarget, GroupPolicyRefreshResult } from './types/drive.js';

export default function App() {
  const [identity, setIdentity] = useState<WindowsIdentity | null>(null);
  const [shares, setShares] = useState<NetworkShare[]>([]);
  const [inaccessibleCount, setInaccessibleCount] = useState<number>(0);
  const [scanDurationMs, setScanDurationMs] = useState<number>(0);
  const [lastScannedTime, setLastScannedTime] = useState<string | null>(null);
  const [shellState, setShellState] = useState<ShellIntegrationState | null>(null);

  // Group Policy Refresh State (Phase 4)
  const [isGpUpdating, setIsGpUpdating] = useState<boolean>(false);
  const [lastGpResult, setLastGpResult] = useState<GroupPolicyRefreshResult | null>(null);
  const [gpError, setGpError] = useState<string | null>(null);
  
  // Navigation State
  const [currentPath, setCurrentPath] = useState<string>('Bun-Drive');
  const [selectedShareId, setSelectedShareId] = useState<string | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [isBrowsingLoading, setIsBrowsingLoading] = useState<boolean>(false);

  // UI State
  const [activeTab, setActiveTab] = useState<'manager' | 'explorer'>('manager');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'tiles' | 'details'>('tiles');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Diagnostics & Logs State
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [diagnosticsTab, setDiagnosticsTab] = useState<'identity' | 'logs' | 'shell' | 'drives' | 'probe'>('identity');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Right-Click Context Menu & Properties Dialog State (Phase 3 Completion)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextMenuTarget;
  } | null>(null);
  const [propertiesTarget, setPropertiesTarget] = useState<string | null>(null);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState<boolean>(false);
  const [mappingTargetPath, setMappingTargetPath] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    loadIdentity();
    loadShares();
    loadShellStatus();
    loadLogs();
  }, []);

  const loadShellStatus = async () => {
    try {
      const res = await fetch('/api/shell/status');
      if (res.ok) {
        const data = await res.json();
        setShellState(data);
      }
    } catch (err) {
      console.error('Failed to load shell integration status', err);
    }
  };

  const loadIdentity = async () => {
    try {
      const res = await fetch('/api/identity');
      if (res.ok) {
        const data = await res.json();
        setIdentity(data);
      }
    } catch (err) {
      console.error('Failed to load identity', err);
    }
  };

  const loadShares = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/shares');
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
        setInaccessibleCount(data.inaccessibleSharesCount || 0);
        setScanDurationMs(data.scanDurationMs || 0);
        setLastScannedTime(data.timestamp || new Date().toISOString());
        if (data.identity) setIdentity(data.identity);
      }
    } catch (err) {
      console.error('Failed to load shares', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/shares/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
        setInaccessibleCount(data.inaccessibleSharesCount || 0);
        setScanDurationMs(data.scanDurationMs || 0);
        setLastScannedTime(data.timestamp || new Date().toISOString());
        if (data.identity) setIdentity(data.identity);
        await loadShellStatus();
        loadLogs();
        
        // If currently in a share, refresh browse data too
        if (currentPath !== 'Bun-Drive') {
          browseToPath(currentPath);
        }
      }
    } catch (err) {
      console.error('Failed to refresh shares', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshGroupPolicy = async () => {
    if (isGpUpdating || isRefreshing) return;
    setIsGpUpdating(true);
    setGpError(null);
    try {
      const res = await fetch('/api/group-policy/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShares(data.discovery?.shares || []);
        setInaccessibleCount(data.discovery?.inaccessibleSharesCount || 0);
        setScanDurationMs(data.discovery?.scanDurationMs || 0);
        setLastScannedTime(data.timestamp || new Date().toISOString());
        if (data.discovery?.identity) setIdentity(data.discovery.identity);
        if (data.shellStatus) setShellState(data.shellStatus);
        setLastGpResult(data);
        await loadIdentity();
        await loadLogs();

        // If currently browsing a path, verify if it is still valid and accessible
        if (currentPath !== 'Bun-Drive') {
          const matchingShare = (data.discovery?.shares || []).find((s: NetworkShare) =>
            currentPath.toLowerCase().startsWith(s.uncPath.toLowerCase()) && s.isAccessible
          );
          if (matchingShare) {
            browseToPath(currentPath);
          } else {
            // Path is no longer accessible under new Group Policy permissions
            setCurrentPath('Bun-Drive');
            setSelectedShareId(null);
            setBrowseResult(null);
          }
        }
      } else {
        const errorMsg = data.error || data.message || 'Group Policy update failed';
        setGpError(errorMsg);
        if (data.gpupdate) {
          setLastGpResult(data);
        }
        await loadLogs();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setGpError(message);
    } finally {
      setIsGpUpdating(false);
    }
  };

  const handleRegisterShell = async () => {
    const res = await fetch('/api/shell/register', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setShellState(data);
      loadLogs();
    }
  };

  const handleUnregisterShell = async () => {
    const res = await fetch('/api/shell/unregister', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setShellState(data);
      loadLogs();
    }
  };

  const handleSyncShell = async () => {
    const res = await fetch('/api/shell/sync', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.status) setShellState(data.status);
      loadLogs();
    }
  };

  const handleMapDrive = async (driveLetter: string, uncPath: string, persistent: boolean, replaceExisting = false) => {
    const res = await fetch('/api/shell/map-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driveLetter, uncPath, persistent, replaceExisting })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to map network drive');
    }
    if (data.status) setShellState(data.status);
    await loadShares();
    loadLogs();
  };

  const handleUnmapDrive = async (driveLetter: string) => {
    const res = await fetch('/api/shell/unmap-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driveLetter })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status) setShellState(data.status);
      await loadShares();
      loadLogs();
    }
  };

  const openDiagnosticsWithTab = (tab: 'identity' | 'logs' | 'shell' | 'drives' | 'probe' = 'identity') => {
    setDiagnosticsTab(tab);
    setIsDiagnosticsOpen(true);
  };

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=50');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const browseToPath = async (targetPath: string) => {
    setIsBrowsingLoading(true);
    setCurrentPath(targetPath);
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(targetPath)}`);
      if (res.ok) {
        const data: BrowseResult = await res.json();
        setBrowseResult(data);
        
        // Find matching share for sidebar selection
        const matching = shares.find(s => targetPath.startsWith(s.uncPath));
        if (matching) {
          setSelectedShareId(matching.id);
        }
      }
    } catch (err) {
      console.error('Failed to browse path', err);
    } finally {
      setIsBrowsingLoading(false);
      loadLogs();
    }
  };

  const handleSelectRoot = () => {
    setCurrentPath('Bun-Drive');
    setSelectedShareId(null);
    setBrowseResult(null);
    setSearchQuery('');
  };

  const handleSelectShare = (share: NetworkShare) => {
    browseToPath(share.uncPath);
  };

  const handleNavigateUp = () => {
    if (browseResult?.parentPath) {
      browseToPath(browseResult.parentPath);
    } else {
      handleSelectRoot();
    }
  };

  const handleOpenInExplorer = async (path?: string) => {
    const target = path || (currentPath === 'Bun-Drive' ? '\\\\' : currentPath);
    try {
      await fetch('/api/open-in-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target }),
      });
      loadLogs();
    } catch (err) {
      console.error('Failed to launch explorer', err);
    }
  };

  const handleProbeServer = async (server: string) => {
    const res = await fetch('/api/test-server', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server }),
    });
    if (!res.ok) {
      throw new Error(`Probe failed with status ${res.status}`);
    }
    await handleRefresh();
  };

  // Context Menu & Properties Handlers (Phase 3 Completion)
  const handleContextMenu = (e: React.MouseEvent, target: ContextMenuTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target
    });
  };

  const handleContextOpen = (target: ContextMenuTarget) => {
    handleOpenInExplorer(target.uncPath);
  };

  const handleContextMapDrive = (target: ContextMenuTarget) => {
    setMappingTargetPath(target.uncPath);
    setActiveTab('manager');
    if (currentPath !== 'Bun-Drive') {
      setCurrentPath('Bun-Drive');
    }
  };

  const handleOpenProperties = (uncPath: string) => {
    setPropertiesTarget(uncPath);
    setIsPropertiesOpen(true);
  };

  const isRootView = currentPath === 'Bun-Drive';

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Top Windows Ribbon & Address Header */}
      <HeaderBar
        currentPath={currentPath}
        onNavigateHome={handleSelectRoot}
        onNavigatePath={browseToPath}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onRefreshGroupPolicy={handleRefreshGroupPolicy}
        isGpUpdating={isGpUpdating}
        onOpenInExplorer={() => handleOpenInExplorer(currentPath)}
        onOpenDiagnostics={() => openDiagnosticsWithTab('identity')}
        identity={identity}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Explorer Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Explorer Navigation Pane */}
        <Sidebar
          shares={shares}
          selectedShareId={selectedShareId}
          onSelectShare={handleSelectShare}
          onSelectRoot={handleSelectRoot}
          isRootSelected={isRootView}
          identity={identity}
          inaccessibleCount={inaccessibleCount}
          shellState={shellState}
          onOpenShellSettings={(tab) => openDiagnosticsWithTab(tab || 'shell')}
          onNavigatePath={browseToPath}
          onContextMenu={handleContextMenu}
          onOpenProperties={handleOpenProperties}
        />

        {/* Content Pane */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {/* Phase 3 & Explorer Mode Switcher */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
              <button
                onClick={() => { setActiveTab('manager'); if (!isRootView) handleSelectRoot(); }}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  activeTab === 'manager' && isRootView
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Network Shares Management
              </button>
              <button
                onClick={() => { setActiveTab('explorer'); if (!isRootView) handleSelectRoot(); }}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  activeTab === 'explorer' && isRootView
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Explorer Namespace View
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => openDiagnosticsWithTab('drives')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded border border-slate-700 text-[11px]"
                title="Manage mapped drive letters"
              >
                Drive Mappings ({shellState?.mappedDrives.length || 0})
              </button>
              <button
                onClick={() => openDiagnosticsWithTab('shell')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-755 text-emerald-300 rounded border border-slate-700 text-[11px]"
                title="Windows Explorer Shell Namespace configuration"
              >
                {shellState?.isRegisteredInExplorer ? 'Explorer Mounted' : 'Mount in Explorer'}
              </button>
            </div>
          </div>

          {isRootView ? (
            activeTab === 'manager' ? (
              <NetworkSharesManager
                identity={identity}
                shares={shares}
                inaccessibleCount={inaccessibleCount}
                shellState={shellState}
                isRefreshing={isRefreshing}
                onRefreshShares={handleRefresh}
                onRefreshGroupPolicy={handleRefreshGroupPolicy}
                isGpUpdating={isGpUpdating}
                lastGpResult={lastGpResult}
                gpError={gpError}
                onClearGpError={() => setGpError(null)}
                onMapDrive={handleMapDrive}
                onUnmapDrive={handleUnmapDrive}
                onOpenInExplorer={(p) => handleOpenInExplorer(p)}
                logs={logs}
                onRefreshLogs={loadLogs}
                initialSelectedPath={mappingTargetPath || undefined}
                onContextMenu={handleContextMenu}
                onOpenProperties={handleOpenProperties}
              />
            ) : (
              <SharesView
                shares={shares}
                inaccessibleCount={inaccessibleCount}
                onOpenShare={handleSelectShare}
                onOpenInExplorer={(p) => handleOpenInExplorer(p)}
                onOpenDiagnostics={(tab) => openDiagnosticsWithTab(tab || 'identity')}
                viewMode={viewMode}
                identity={identity}
                searchQuery={searchQuery}
                shellState={shellState}
                onQuickSyncShell={handleSyncShell}
                onContextMenu={handleContextMenu}
                onOpenProperties={handleOpenProperties}
                onMapDriveShare={(unc) => handleContextMapDrive({ name: '', uncPath: unc, isDirectory: true })}
              />
            )
          ) : (
            <FolderBrowser
              browseResult={browseResult}
              isLoading={isBrowsingLoading}
              onNavigatePath={browseToPath}
              onNavigateUp={handleNavigateUp}
              onOpenInExplorer={(p) => handleOpenInExplorer(p)}
              searchQuery={searchQuery}
              onContextMenu={handleContextMenu}
              onOpenProperties={handleOpenProperties}
              onMapDriveTarget={(unc) => handleContextMapDrive({ name: '', uncPath: unc, isDirectory: true })}
            />
          )}
        </main>
      </div>

      {/* Explorer Status Bar */}
      <StatusFooter
        totalItems={isRootView ? shares.length : (browseResult?.entries.length || 0)}
        itemTypeLabel={isRootView ? 'network shares' : 'items'}
        identity={identity}
        scanDurationMs={scanDurationMs}
        lastScannedTime={lastScannedTime}
      />

      {/* Diagnostics & Security Modal */}
      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        identity={identity}
        logs={logs}
        onRefreshLogs={loadLogs}
        onProbeServer={handleProbeServer}
        shellState={shellState}
        shares={shares}
        onRegisterShell={handleRegisterShell}
        onUnregisterShell={handleUnregisterShell}
        onSyncShell={handleSyncShell}
        onMapDrive={handleMapDrive}
        onUnmapDrive={handleUnmapDrive}
        onOpenInExplorer={(p) => handleOpenInExplorer(p)}
        onRefreshGroupPolicy={handleRefreshGroupPolicy}
        isGpUpdating={isGpUpdating}
        lastGpResult={lastGpResult}
        gpError={gpError}
        initialTab={diagnosticsTab}
      />

      {/* Right-Click Context Menu (Phase 3 Completion) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
          onOpen={handleContextOpen}
          onMapDrive={handleContextMapDrive}
          onProperties={(t) => handleOpenProperties(t.uncPath)}
          onRefresh={handleRefresh}
        />
      )}

      {/* Windows Properties Dialog (Phase 3 Completion) */}
      <PropertiesModal
        isOpen={isPropertiesOpen}
        onClose={() => {
          setIsPropertiesOpen(false);
          setPropertiesTarget(null);
        }}
        targetPath={propertiesTarget}
        onOpenInExplorer={(p) => handleOpenInExplorer(p)}
        onTriggerMapDrive={(unc) => {
          setIsPropertiesOpen(false);
          handleContextMapDrive({ name: '', uncPath: unc, isDirectory: true });
        }}
        onTriggerUnmapDrive={handleUnmapDrive}
      />
    </div>
  );
}
