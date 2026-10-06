/**
 * Bun-Drive Desktop Application
 * Windows File Explorer Active Directory network share discovery and integration engine.
 */
import React, { useEffect, useState } from 'react';
import { HeaderBar } from './components/HeaderBar.js';
import { Sidebar } from './components/Sidebar.js';
import { SharesView } from './components/SharesView.js';
import { FolderBrowser } from './components/FolderBrowser.js';
import { DiagnosticsModal } from './components/DiagnosticsModal.js';
import { StatusFooter } from './components/StatusFooter.js';
import { NetworkShare, WindowsIdentity, BrowseResult, LogEntry, ShellIntegrationState } from './types/drive.js';

export default function App() {
  const [identity, setIdentity] = useState<WindowsIdentity | null>(null);
  const [shares, setShares] = useState<NetworkShare[]>([]);
  const [inaccessibleCount, setInaccessibleCount] = useState<number>(0);
  const [scanDurationMs, setScanDurationMs] = useState<number>(0);
  const [lastScannedTime, setLastScannedTime] = useState<string | null>(null);
  const [shellState, setShellState] = useState<ShellIntegrationState | null>(null);
  
  // Navigation State
  const [currentPath, setCurrentPath] = useState<string>('Bun-Drive');
  const [selectedShareId, setSelectedShareId] = useState<string | null>(null);
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [isBrowsingLoading, setIsBrowsingLoading] = useState<boolean>(false);

  // UI State
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'tiles' | 'details'>('tiles');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [diagnosticsTab, setDiagnosticsTab] = useState<'identity' | 'logs' | 'shell' | 'drives' | 'probe'>('identity');
  const [logs, setLogs] = useState<LogEntry[]>([]);

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
        loadShellStatus();
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

  const handleMapDrive = async (driveLetter: string, uncPath: string, persistent: boolean) => {
    const res = await fetch('/api/shell/map-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driveLetter, uncPath, persistent })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to map network drive');
    }
    if (data.status) setShellState(data.status);
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
        />

        {/* Content Pane */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {isRootView ? (
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
            />
          ) : (
            <FolderBrowser
              browseResult={browseResult}
              isLoading={isBrowsingLoading}
              onNavigatePath={browseToPath}
              onNavigateUp={handleNavigateUp}
              onOpenInExplorer={(p) => handleOpenInExplorer(p)}
              searchQuery={searchQuery}
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
        initialTab={diagnosticsTab}
      />
    </div>
  );
}
