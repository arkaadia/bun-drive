/**
 * Bun-Drive Diagnostics & Security Modal
 * Displays Active Directory user identity, Kerberos token,
 * access-denied security logs, and Phase 2 Windows Shell Extension Blueprint.
 */
import React from 'react';
import { 
  X, 
  Shield, 
  Server, 
  Check, 
  Copy, 
  Download, 
  RefreshCw,
  HardDrive,
  FolderSync,
  Power,
  Trash2,
  ExternalLink,
  Link2
} from 'lucide-react';
import {
  WindowsIdentity,
  LogEntry,
  ShellExtensionBlueprint,
  ShellIntegrationState,
  NetworkShare
} from '../types/drive.js';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  identity: WindowsIdentity | null;
  logs: LogEntry[];
  onRefreshLogs: () => void;
  onProbeServer: (server: string) => Promise<void>;
  shellState: ShellIntegrationState | null;
  shares: NetworkShare[];
  onRegisterShell: () => Promise<void>;
  onUnregisterShell: () => Promise<void>;
  onSyncShell: () => Promise<void>;
  onMapDrive: (letter: string, uncPath: string, persistent: boolean, replace?: boolean) => Promise<void>;
  onUnmapDrive: (letter: string) => Promise<void>;
  onOpenInExplorer: (path: string) => void;
  initialTab?: 'identity' | 'logs' | 'shell' | 'drives' | 'probe';
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
  identity,
  logs,
  onRefreshLogs,
  onProbeServer,
  shellState,
  shares,
  onRegisterShell,
  onUnregisterShell,
  onSyncShell,
  onMapDrive,
  onUnmapDrive,
  onOpenInExplorer,
  initialTab = 'identity'
}) => {
  const [activeTab, setActiveTab] = React.useState<'identity' | 'logs' | 'shell' | 'drives' | 'probe'>(initialTab);
  const [blueprint, setBlueprint] = React.useState<ShellExtensionBlueprint | null>(null);
  const [regFile, setRegFile] = React.useState<string>('');
  const [targetServer, setTargetServer] = React.useState('');
  const [isProbing, setIsProbing] = React.useState(false);
  const [probeMessage, setProbeMessage] = React.useState<string | null>(null);
  const [copiedReg, setCopiedReg] = React.useState(false);
  const [isShellBusy, setIsShellBusy] = React.useState(false);
  const [shellMessage, setShellMessage] = React.useState<string | null>(null);

  // Drive mapping state
  const [selectedDriveLetter, setSelectedDriveLetter] = React.useState('Z:');
  const [selectedShareUnc, setSelectedShareUnc] = React.useState('');
  const [persistentDrive, setPersistentDrive] = React.useState(true);
  const [driveMessage, setDriveMessage] = React.useState<string | null>(null);
  const [conflictTarget, setConflictTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetch('/api/shell/blueprint')
        .then(res => res.json())
        .then(data => {
          setBlueprint(data.blueprint);
          setRegFile(data.regFile);
        })
        .catch(console.error);
    }
  }, [isOpen, initialTab]);

  React.useEffect(() => {
    if (shares.length > 0 && !selectedShareUnc) {
      setSelectedShareUnc(shares[0].uncPath);
    }
  }, [shares, selectedShareUnc]);

  if (!isOpen) return null;

  const handleCopyReg = () => {
    navigator.clipboard.writeText(regFile);
    setCopiedReg(true);
    setTimeout(() => setCopiedReg(false), 2000);
  };

  const handleDownloadReg = () => {
    const blob = new Blob([regFile], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Bun-Drive-ShellExtension.reg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExecuteProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetServer.trim()) return;
    setIsProbing(true);
    setProbeMessage(null);
    try {
      await onProbeServer(targetServer.trim());
      setProbeMessage(`Probe completed for ${targetServer}. Check shares list and logs.`);
      setTargetServer('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setProbeMessage(`Probe error: ${msg}`);
    } finally {
      setIsProbing(false);
    }
  };

  const handleToggleRegistration = async () => {
    setIsShellBusy(true);
    setShellMessage(null);
    try {
      if (shellState?.isRegisteredInExplorer) {
        await onUnregisterShell();
        setShellMessage('Bun-Drive unregistered from Windows Explorer Navigation Pane.');
      } else {
        await onRegisterShell();
        setShellMessage('Bun-Drive registered in HKCU Explorer Namespace and pinned to Navigation Pane.');
      }
    } catch (err: unknown) {
      setShellMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsShellBusy(false);
    }
  };

  const handleManualSync = async () => {
    setIsShellBusy(true);
    setShellMessage(null);
    try {
      await onSyncShell();
      setShellMessage('Synchronized authorized AD shares into Virtual Root Folder.');
    } catch (err: unknown) {
      setShellMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsShellBusy(false);
    }
  };

  const handleMapDriveSubmit = async (e?: React.FormEvent, forceReplace = false) => {
    if (e) e.preventDefault();
    if (!selectedDriveLetter || !selectedShareUnc) return;
    setIsShellBusy(true);
    setDriveMessage(null);
    setConflictTarget(null);
    try {
      await onMapDrive(selectedDriveLetter, selectedShareUnc, persistentDrive, forceReplace);
      setDriveMessage(`Mapped ${selectedDriveLetter} to ${selectedShareUnc}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already in use') || msg.includes('conflict')) {
        const existing = shellState?.mappedDrives.find(d => d.driveLetter === selectedDriveLetter);
        setConflictTarget(existing?.uncPath || 'Another network share');
      }
      setDriveMessage(msg);
    } finally {
      setIsShellBusy(false);
    }
  };

  const availableLetters = ['Z:', 'Y:', 'X:', 'W:', 'V:', 'U:', 'T:', 'S:', 'R:', 'Q:', 'P:', 'M:', 'N:'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 text-xs text-slate-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Bun-Drive Diagnostics & Security Inspector</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('identity')}
            className={`py-2 px-3 border-b-2 font-medium transition ${
              activeTab === 'identity'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Windows Identity & AD
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-2 px-3 border-b-2 font-medium transition ${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Security Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('shell')}
            className={`py-2 px-3 border-b-2 font-medium transition whitespace-nowrap ${
              activeTab === 'shell'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Explorer Shell Mount (Phase 2)
          </button>
          <button
            onClick={() => setActiveTab('drives')}
            className={`py-2 px-3 border-b-2 font-medium transition whitespace-nowrap ${
              activeTab === 'drives'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Drive Letter Mapping
          </button>
          <button
            onClick={() => setActiveTab('probe')}
            className={`py-2 px-3 border-b-2 font-medium transition whitespace-nowrap ${
              activeTab === 'probe'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Probe Custom Server
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-900">
          {/* TAB 1: IDENTITY */}
          {activeTab === 'identity' && identity && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">
                    Logged-in User
                  </span>
                  <div className="text-sm font-semibold text-white font-mono">{identity.username}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">SID: {identity.userSid}</div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">
                    Active Directory Domain
                  </span>
                  <div className="text-sm font-semibold text-emerald-400 font-mono">
                    {identity.domain} {identity.dnsDomain ? `(${identity.dnsDomain})` : ''}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Domain Joined: <span className="text-emerald-400 font-semibold">{identity.isDomainJoined ? 'Yes (Enterprise AD)' : 'Workgroup'}</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">
                    Domain Controller & Logon Server
                  </span>
                  <div className="text-xs font-mono text-slate-200">
                    DC: {identity.domainController || 'Auto-negotiated'}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-0.5">
                    Logon: {identity.logonServer || 'Local'}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">
                    Windows Authentication Protocol
                  </span>
                  <div className="text-xs font-semibold text-blue-400 font-mono">
                    {identity.authType}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Client Computer: {identity.computerName}
                  </div>
                </div>
              </div>

              {/* Active Directory Groups */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block mb-2">
                  Active Directory Security Groups ({identity.groups.length})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {identity.groups.map((grp, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono"
                    >
                      {grp}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Real-time Windows access decisions and SMB share discovery probes:
                </span>
                <button
                  onClick={onRefreshLogs}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 flex items-center gap-1 border border-slate-700"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Logs</span>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] space-y-1 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`py-1 px-1.5 rounded flex items-start gap-2 ${
                      log.level === 'SECURITY'
                        ? 'bg-amber-950/40 text-amber-300 border border-amber-900/50'
                        : log.level === 'ERROR'
                        ? 'bg-rose-950/40 text-rose-300 border border-rose-900/50'
                        : log.level === 'WARN'
                        ? 'text-amber-400'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-600 flex-shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`font-semibold px-1 rounded text-[10px] ${
                        log.level === 'SECURITY'
                          ? 'bg-amber-800 text-amber-100'
                          : log.level === 'ERROR'
                          ? 'bg-rose-800 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-slate-500">[{log.source}]</span>
                    <span className="flex-1 break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SHELL EXTENSION MOUNT (PHASE 2) */}
          {activeTab === 'shell' && blueprint && (
            <div className="space-y-4">
              {/* Live Registration Control Panel */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-white">
                        Windows File Explorer Navigation Pane Integration
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                          shellState?.isRegisteredInExplorer
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {shellState?.isRegisteredInExplorer ? 'MOUNTED & PINNED' : 'UNREGISTERED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Registers Bun-Drive in HKCU Explorer Desktop Namespace and synchronizes authorized AD share shortcuts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleManualSync}
                      disabled={isShellBusy}
                      className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <FolderSync className={`w-3.5 h-3.5 text-blue-400 ${isShellBusy ? 'animate-spin' : ''}`} />
                      <span>Sync Virtual Folder</span>
                    </button>

                    <button
                      onClick={handleToggleRegistration}
                      disabled={isShellBusy}
                      className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
                        shellState?.isRegisteredInExplorer
                          ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>
                        {shellState?.isRegisteredInExplorer ? 'Unpin from Explorer' : 'Pin to Explorer Nav Pane'}
                      </span>
                    </button>
                  </div>
                </div>

                {shellMessage && (
                  <div className="p-2 rounded bg-slate-900 border border-slate-700 text-[11px] text-emerald-300 font-mono">
                    {shellMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] pt-1 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">COM CLSID:</span>
                    <span className="font-mono text-blue-400">{blueprint.clsid}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Virtual Root Folder:</span>
                    <span className="font-mono text-slate-200 truncate block" title={shellState?.virtualRootPath}>
                      {shellState?.virtualRootPath || '%LOCALAPPDATA%\\Bun-Drive\\NamespaceRoot'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Active Share Shortcuts:</span>
                    <span className="font-mono text-emerald-400 tabular-nums">
                      {shellState?.activeShortcuts.length || 0} synchronized
                    </span>
                  </div>
                </div>
              </div>

              {/* Synchronized Virtual Root Shortcuts Table */}
              {shellState && shellState.activeShortcuts.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Synchronized Namespace Shortcuts ({shellState.activeShortcuts.length})
                    </span>
                    <button
                      onClick={() => onOpenInExplorer(shellState.virtualRootPath)}
                      className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open Virtual Root in Explorer</span>
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-800/60">
                    {shellState.activeShortcuts.map((sc) => (
                      <div key={sc.name} className="px-3 py-1.5 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2 truncate">
                          <Link2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="font-medium text-slate-200">{sc.name}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-slate-400">
                          <span>{sc.uncPath}</span>
                          <span className="text-emerald-400">{sc.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Registry Export Tools */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-semibold">
                    Windows Registry Registration Script (.reg)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyReg}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 text-[11px]"
                    >
                      {copiedReg ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy .reg</span>
                    </button>
                    <button
                      onClick={handleDownloadReg}
                      className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 text-[11px]"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download .reg</span>
                    </button>
                  </div>
                </div>
                <pre className="bg-slate-950 border border-slate-800 p-3 rounded-lg font-mono text-[10px] text-emerald-300 max-h-44 overflow-y-auto whitespace-pre-wrap select-all">
                  {regFile}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: DRIVE LETTER MAPPING */}
          {activeTab === 'drives' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    Map Network Share to Windows Drive Letter
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Bind any authorized Active Directory SMB share to a local drive letter (e.g. Z:) via Windows SMB Mapping.
                  </p>
                </div>

                <form onSubmit={handleMapDriveSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-slate-400 mb-1">Drive Letter</label>
                    <select
                      value={selectedDriveLetter}
                      onChange={(e) => setSelectedDriveLetter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    >
                      {availableLetters.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-7">
                    <label className="block text-[10px] text-slate-400 mb-1">Authorized Network Share (UNC)</label>
                    <select
                      value={selectedShareUnc}
                      onChange={(e) => setSelectedShareUnc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    >
                      {shares.map((s) => (
                        <option key={s.id} value={s.uncPath}>
                          {s.uncPath} ({s.accessLevel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      disabled={isShellBusy || !selectedShareUnc}
                      className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-medium rounded text-xs transition flex items-center justify-center gap-1.5"
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>Map Drive</span>
                    </button>
                  </div>
                </form>

                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={persistentDrive}
                    onChange={(e) => setPersistentDrive(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span>Reconnect automatically at Windows sign-in (/persistent:yes)</span>
                </label>

                {driveMessage && (
                  <div className="p-2 rounded bg-slate-900 border border-slate-700 text-xs text-blue-300 font-mono">
                    {driveMessage}
                  </div>
                )}

                {conflictTarget && (
                  <div className="p-2.5 rounded bg-amber-950/60 border border-amber-800 text-xs text-amber-200 flex items-center justify-between gap-2">
                    <span>Letter {selectedDriveLetter} mapped to: <b>{conflictTarget}</b></span>
                    <button
                      type="button"
                      onClick={() => handleMapDriveSubmit(undefined, true)}
                      className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-medium"
                    >
                      Replace Existing Mapping
                    </button>
                  </div>
                )}
              </div>

              {/* Active Mapped Drives List */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300">
                    Active Mapped Network Drives ({shellState?.mappedDrives.length || 0})
                  </span>
                </div>
                {(!shellState || shellState.mappedDrives.length === 0) ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    No network drives currently mapped. Select a drive letter above to mount a share.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {shellState.mappedDrives.map((d) => (
                      <div key={d.driveLetter} className="px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono font-semibold text-xs">
                            {d.driveLetter}
                          </span>
                          <div>
                            <div className="font-medium text-slate-200">{d.shareName}</div>
                            <div className="text-[11px] font-mono text-slate-400">{d.uncPath}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onOpenInExplorer(d.uncPath)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3 text-blue-400" />
                            <span>Open</span>
                          </button>
                          <button
                            onClick={() => onUnmapDrive(d.driveLetter)}
                            className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60"
                            title="Disconnect Network Drive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PROBE CUSTOM SERVER */}
          {activeTab === 'probe' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                <h3 className="text-xs font-semibold text-white mb-1">
                  Probe Specific Active Directory File Server
                </h3>
                <p className="text-[11px] text-slate-400 mb-3">
                  Test discovery against a specific domain server or DFS host using your current Windows security context.
                </p>

                <form onSubmit={handleExecuteProbe} className="flex gap-2">
                  <div className="relative flex-1">
                    <Server className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="e.g. FS01-CORP.contoso.local or \\FS02"
                      value={targetServer}
                      onChange={(e) => setTargetServer(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isProbing || !targetServer.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium rounded-md text-xs transition"
                  >
                    {isProbing ? 'Probing...' : 'Probe Server'}
                  </button>
                </form>

                {probeMessage && (
                  <div className="mt-3 p-2 rounded bg-slate-900 border border-slate-700 text-xs text-blue-300 font-mono">
                    {probeMessage}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
