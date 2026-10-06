/**
 * Bun-Drive Root Shares View
 * Displays discovered network shares accessible to the logged-in Windows user.
 */
import React from 'react';
import { 
  Folder, 
  Server, 
  ExternalLink, 
  Copy, 
  Check, 
  ShieldCheck, 
  Lock, 
  Clock, 
  ArrowRight,
  Layers,
  HardDrive,
  FolderSync,
  Info
} from 'lucide-react';
import { NetworkShare, WindowsIdentity, ShellIntegrationState, ContextMenuTarget } from '../types/drive.js';

interface SharesViewProps {
  shares: NetworkShare[];
  inaccessibleCount: number;
  onOpenShare: (share: NetworkShare) => void;
  onOpenInExplorer: (uncPath: string) => void;
  onOpenDiagnostics: (tab?: 'identity' | 'logs' | 'shell' | 'drives' | 'probe') => void;
  viewMode: 'tiles' | 'details';
  identity: WindowsIdentity | null;
  searchQuery: string;
  shellState: ShellIntegrationState | null;
  onQuickSyncShell: () => void;
  onContextMenu?: (e: React.MouseEvent, target: ContextMenuTarget) => void;
  onOpenProperties?: (uncPath: string) => void;
  onMapDriveShare?: (uncPath: string) => void;
}

export const SharesView: React.FC<SharesViewProps> = ({
  shares,
  inaccessibleCount,
  onOpenShare,
  onOpenInExplorer,
  onOpenDiagnostics,
  viewMode,
  identity,
  searchQuery,
  shellState,
  onQuickSyncShell,
  onContextMenu,
  onOpenProperties,
  onMapDriveShare
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, uncPath: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(uncPath);
    setCopiedId(uncPath);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredShares = shares.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.server.toLowerCase().includes(q) ||
      s.uncPath.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950 text-slate-200">
      {/* Banner / Info Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-900/80 border border-slate-800 rounded-lg p-3.5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Bun-Drive
            </h1>
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full font-mono">
              Active Directory SMB Discovery
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Dynamically discovered network shares authorized for{' '}
            <span className="font-semibold text-slate-200 font-mono">
              {identity?.username || 'Current Windows User'}
            </span>{' '}
            using real Windows security credentials.
          </p>
        </div>

        {/* Security badge, Shell Mount & Filtered counter */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenDiagnostics('shell')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
              shellState?.isRegisteredInExplorer
                ? 'bg-emerald-950/50 border-emerald-800/70 text-emerald-300 hover:bg-emerald-950/80'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Configure Windows File Explorer Navigation Pane Extension"
          >
            <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {shellState?.isRegisteredInExplorer
                ? `Explorer Mounted (${shellState.activeShortcuts.length} synced)`
                : 'Mount in Explorer'}
            </span>
          </button>

          <button
            onClick={() => onOpenDiagnostics('drives')}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-200 transition"
            title="Map Network Share to Windows Drive Letter"
          >
            <HardDrive className="w-3.5 h-3.5 text-blue-400" />
            <span>Map Drive ({shellState?.mappedDrives.length || 0})</span>
          </button>

          {inaccessibleCount > 0 && (
            <div 
              onClick={() => onOpenDiagnostics('logs')}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/40 border border-amber-800/60 rounded text-xs text-amber-300 cursor-pointer hover:bg-amber-950/60 transition"
              title="Click to view security audit log of filtered access-denied shares"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>{inaccessibleCount} inaccessible hidden</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>NTFS / SMB Verified</span>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredShares.length === 0 && (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg bg-slate-900/40">
          <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-slate-300">
            {searchQuery ? 'No shares match your search' : 'No network shares discovered'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No shares matched "${searchQuery}". Clear your search filter.`
              : 'Active Directory discovery did not find published disk shares reachable with the current Windows credentials.'}
          </p>
        </div>
      )}

      {/* Tiles View Mode */}
      {viewMode === 'tiles' && filteredShares.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredShares.map((share) => (
            <div
              key={share.id}
              onClick={() => onOpenShare(share)}
              onContextMenu={(e) => {
                if (onContextMenu) {
                  onContextMenu(e, {
                    name: share.name,
                    uncPath: share.uncPath,
                    isDirectory: true,
                    isShare: true,
                    server: share.server,
                    share: share.name,
                    mappedDrive: share.mappedDrive,
                    accessStatus: share.status,
                    accessLevel: share.accessLevel
                  });
                }
              }}
              className="group bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-blue-600/60 rounded-lg p-3.5 cursor-pointer transition shadow-sm hover:shadow-md flex flex-col justify-between"
            >
              <div>
                {/* Card Top: Share Name + Badges */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-105 transition">
                      <Folder className="w-5 h-5 fill-amber-400/20" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-blue-300 transition">
                        {share.name}
                      </h3>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                        <Server className="w-3 h-3 text-slate-500" />
                        <span className="truncate max-w-[150px]">{share.server}</span>
                      </div>
                    </div>
                  </div>

                  {/* Access Level Badge */}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium font-mono ${
                      share.accessLevel === 'ReadWrite'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                    }`}
                  >
                    {share.accessLevel === 'ReadWrite' ? 'Read / Write' : 'Read Only'}
                  </span>
                </div>

                {/* Description */}
                {share.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3 bg-slate-950/40 p-1.5 rounded border border-slate-850">
                    {share.description}
                  </p>
                )}

                {/* UNC Path Badge */}
                <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1 flex items-center justify-between text-[11px] font-mono text-slate-400 mb-3">
                  <span className="truncate" title={share.uncPath}>
                    {share.uncPath}
                  </span>
                  <button
                    onClick={(e) => handleCopy(e, share.uncPath)}
                    className="p-1 hover:text-white rounded hover:bg-slate-800 transition flex-shrink-0"
                    title="Copy UNC Path"
                  >
                    {copiedId === share.uncPath ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Card Footer: Metadata + Actions */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Clock className="w-3 h-3 text-slate-600" />
                  <span>{share.responseTimeMs} ms</span>
                  <span>•</span>
                  <span>{share.discoverySource}</span>
                </div>

                <div className="flex items-center gap-1">
                  {onOpenProperties && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenProperties(share.uncPath);
                      }}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition"
                      title="Properties (Alt+Enter)"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenInExplorer(share.uncPath);
                    }}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                    title="Open in Windows File Explorer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  </button>

                  <div className="flex items-center gap-0.5 text-blue-400 group-hover:text-blue-300 font-medium text-xs pl-1">
                    <span>Browse</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Details View Mode */}
      {viewMode === 'details' && filteredShares.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                <th className="py-2.5 px-3 font-semibold">Share Name</th>
                <th className="py-2.5 px-3 font-semibold">Server Host</th>
                <th className="py-2.5 px-3 font-semibold">UNC Path</th>
                <th className="py-2.5 px-3 font-semibold">Permissions</th>
                <th className="py-2.5 px-3 font-semibold">Source</th>
                <th className="py-2.5 px-3 font-semibold">Latency</th>
                <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredShares.map((share) => (
                <tr
                  key={share.id}
                  onClick={() => onOpenShare(share)}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      onContextMenu(e, {
                        name: share.name,
                        uncPath: share.uncPath,
                        isDirectory: true,
                        isShare: true,
                        server: share.server,
                        share: share.name,
                        mappedDrive: share.mappedDrive,
                        accessStatus: share.status,
                        accessLevel: share.accessLevel
                      });
                    }
                  }}
                  className="hover:bg-slate-850 cursor-pointer transition group"
                >
                  <td className="py-2 px-3 font-medium text-slate-200 group-hover:text-blue-300 flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span>{share.name}</span>
                  </td>
                  <td className="py-2 px-3 text-slate-400 font-mono">{share.server}</td>
                  <td className="py-2 px-3 text-slate-400 font-mono">{share.uncPath}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        share.accessLevel === 'ReadWrite'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-blue-950 text-blue-300'
                      }`}
                    >
                      {share.accessLevel === 'ReadWrite' ? 'Read / Write' : 'Read Only'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400">{share.discoverySource}</td>
                  <td className="py-2 px-3 text-slate-400 font-mono">{share.responseTimeMs} ms</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {onOpenProperties && (
                        <button
                          onClick={() => onOpenProperties(share.uncPath)}
                          className="p-1 rounded hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition"
                          title="Properties (Alt+Enter)"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleCopy(e, share.uncPath)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="Copy UNC Path"
                      >
                        {copiedId === share.uncPath ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => onOpenInExplorer(share.uncPath)}
                        className="p-1 rounded hover:bg-slate-800 text-blue-400 hover:text-blue-300 transition"
                        title="Open in Windows Explorer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
