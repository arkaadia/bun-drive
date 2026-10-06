/**
 * Bun-Drive Diagnostics & Security Modal
 * Displays Active Directory user identity, Kerberos token,
 * access-denied security logs, and Phase 2 Windows Shell Extension Blueprint.
 */
import React from 'react';
import { 
  X, 
  Shield, 
  Terminal, 
  FileCode, 
  Server, 
  Check, 
  Copy, 
  Download, 
  AlertTriangle,
  RefreshCw,
  Search
} from 'lucide-react';
import { WindowsIdentity, LogEntry, ShellExtensionBlueprint } from '../types/drive.js';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  identity: WindowsIdentity | null;
  logs: LogEntry[];
  onRefreshLogs: () => void;
  onProbeServer: (server: string) => Promise<void>;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
  identity,
  logs,
  onRefreshLogs,
  onProbeServer
}) => {
  const [activeTab, setActiveTab] = React.useState<'identity' | 'logs' | 'shell' | 'probe'>('identity');
  const [blueprint, setBlueprint] = React.useState<ShellExtensionBlueprint | null>(null);
  const [regFile, setRegFile] = React.useState<string>('');
  const [targetServer, setTargetServer] = React.useState('');
  const [isProbing, setIsProbing] = React.useState(false);
  const [probeMessage, setProbeMessage] = React.useState<string | null>(null);
  const [copiedReg, setCopiedReg] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      fetch('/api/shell/blueprint')
        .then(res => res.json())
        .then(data => {
          setBlueprint(data.blueprint);
          setRegFile(data.regFile);
        })
        .catch(console.error);
    }
  }, [isOpen]);

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
      targetServer && setTargetServer('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setProbeMessage(`Probe error: ${msg}`);
    } finally {
      setIsProbing(false);
    }
  };

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
            className={`py-2 px-3 border-b-2 font-medium transition ${
              activeTab === 'shell'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Shell Extension Blueprint (Phase 2)
          </button>
          <button
            onClick={() => setActiveTab('probe')}
            className={`py-2 px-3 border-b-2 font-medium transition ${
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

          {/* TAB 3: SHELL EXTENSION BLUEPRINT */}
          {activeTab === 'shell' && blueprint && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Windows File Explorer Shell Namespace Architecture
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Phase 1 lays the architecture for Phase 2 Windows File Explorer Navigation Pane integration.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyReg}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1"
                    >
                      {copiedReg ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy .reg</span>
                    </button>
                    <button
                      onClick={handleDownloadReg}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 shadow-sm"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download .reg</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-500">COM CLSID:</span>
                    <div className="font-mono text-blue-400">{blueprint.clsid}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Navigation Pane Pin:</span>
                    <div className="font-mono text-emerald-400">System.IsPinnedToNameSpaceTree = 1</div>
                  </div>
                </div>
              </div>

              {/* Code preview */}
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                  Registry Registration Script Preview
                </span>
                <pre className="bg-slate-950 border border-slate-800 p-3 rounded-lg font-mono text-[10px] text-emerald-300 max-h-60 overflow-y-auto whitespace-pre-wrap select-all">
                  {regFile}
                </pre>
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
