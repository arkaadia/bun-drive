/**
 * Bun-Drive Explorer Navigation Sidebar
 * Emulates the native Windows File Explorer tree view with Bun-Drive pinned location.
 */
import React from 'react';
import { 
  FolderTree, 
  HardDrive, 
  Folder, 
  Lock, 
  Server, 
  ChevronDown, 
  ChevronRight, 
  Shield, 
  Monitor,
  Download,
  FileText
} from 'lucide-react';
import { NetworkShare, WindowsIdentity } from '../types/drive.js';

interface SidebarProps {
  shares: NetworkShare[];
  selectedShareId: string | null;
  onSelectShare: (share: NetworkShare) => void;
  onSelectRoot: () => void;
  isRootSelected: boolean;
  identity: WindowsIdentity | null;
  inaccessibleCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  shares,
  selectedShareId,
  onSelectShare,
  onSelectRoot,
  isRootSelected,
  identity,
  inaccessibleCount
}) => {
  const [isBunDriveExpanded, setIsBunDriveExpanded] = React.useState(true);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col h-full select-none text-xs">
      {/* Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Quick Access Mock Section (for authentic Windows Explorer feel) */}
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">
            Quick Access
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 text-slate-400 cursor-not-allowed">
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              <span>Desktop</span>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 text-slate-400 cursor-not-allowed">
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Downloads</span>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 text-slate-400 cursor-not-allowed">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Documents</span>
            </div>
          </div>
        </div>

        {/* Pinned Bun-Drive Section */}
        <div>
          <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider px-2 mb-1 flex items-center justify-between">
            <span>Domain Storage</span>
            <span className="text-[10px] bg-blue-900/60 text-blue-300 px-1.5 py-0.2 rounded font-mono">
              {shares.length} Active
            </span>
          </div>

          {/* Root Bun-Drive Item */}
          <div
            onClick={onSelectRoot}
            className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition font-medium ${
              isRootSelected
                ? 'bg-blue-600 text-white shadow-sm'
                : 'hover:bg-slate-800 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsBunDriveExpanded(!isBunDriveExpanded);
                }}
                className="p-0.5 hover:bg-black/20 rounded"
              >
                {isBunDriveExpanded ? (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                )}
              </button>
              <div className="w-4 h-4 rounded bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                B
              </div>
              <span className="font-semibold tracking-wide">Bun-Drive</span>
            </div>

            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                isRootSelected
                  ? 'bg-blue-800 text-blue-100'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {shares.length}
            </span>
          </div>

          {/* Discovered Shares Children */}
          {isBunDriveExpanded && (
            <div className="ml-5 mt-1 pl-2 border-l border-slate-800 space-y-0.5">
              {shares.map((share) => {
                const isSelected = selectedShareId === share.id && !isRootSelected;
                return (
                  <div
                    key={share.id}
                    onClick={() => onSelectShare(share)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition group ${
                      isSelected
                        ? 'bg-blue-600 text-white font-medium shadow-sm'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                    title={`${share.uncPath} (${share.accessLevel})`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Folder
                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                          isSelected ? 'text-white' : 'text-amber-400 group-hover:text-amber-300'
                        }`}
                      />
                      <span className="truncate">{share.name}</span>
                    </div>

                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                        share.accessLevel === 'ReadWrite'
                          ? isSelected ? 'bg-blue-800 text-emerald-200' : 'bg-emerald-950 text-emerald-300'
                          : isSelected ? 'bg-blue-800 text-blue-200' : 'bg-blue-950 text-blue-300'
                      }`}
                    >
                      {share.accessLevel === 'ReadWrite' ? 'RW' : 'RO'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* This PC Section */}
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">
            This PC
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 text-slate-400 cursor-not-allowed">
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>Local Disk (C:)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Context Footer Card */}
      <div className="p-2.5 bg-slate-950 border-t border-slate-800">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span className="flex items-center gap-1 font-semibold text-slate-300">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            Security Context
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">
            {identity?.authType || 'Kerberos'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded p-1.5 text-[10px] space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">User:</span>
            <span className="text-slate-200 font-mono font-medium truncate max-w-[130px]" title={identity?.username}>
              {identity?.username || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Domain:</span>
            <span className="text-slate-200 font-mono">
              {identity?.domain || 'N/A'}
            </span>
          </div>
          {inaccessibleCount > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-amber-400/90">
              <span className="flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Filtered:
              </span>
              <span className="font-mono">{inaccessibleCount} denied</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
