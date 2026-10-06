/**
 * Bun-Drive Explorer Header Bar
 */
import React from 'react';
import { 
  RefreshCw, 
  ExternalLink, 
  Copy, 
  ShieldCheck, 
  FolderTree, 
  LayoutGrid, 
  List, 
  ChevronRight, 
  ArrowLeft,
  Search,
  Check,
  RotateCcw
} from 'lucide-react';
import { WindowsIdentity } from '../types/drive.js';

interface HeaderBarProps {
  currentPath: string;
  onNavigateHome: () => void;
  onNavigatePath: (path: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onRefreshGroupPolicy: () => void;
  isGpUpdating: boolean;
  onOpenInExplorer: () => void;
  onOpenDiagnostics: () => void;
  identity: WindowsIdentity | null;
  viewMode: 'tiles' | 'details';
  onToggleViewMode: (mode: 'tiles' | 'details') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentPath,
  onNavigateHome,
  onNavigatePath,
  onRefresh,
  isRefreshing,
  onRefreshGroupPolicy,
  isGpUpdating,
  onOpenInExplorer,
  onOpenDiagnostics,
  identity,
  viewMode,
  onToggleViewMode,
  searchQuery,
  onSearchChange,
}) => {
  const [copied, setCopied] = React.useState(false);

  // Parse path breadcrumbs
  const isRoot = !currentPath || currentPath === 'Bun-Drive';
  
  const handleCopyPath = () => {
    const textToCopy = isRoot ? 'Bun-Drive' : currentPath;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getBreadcrumbParts = () => {
    if (isRoot) return [];
    const clean = currentPath.replace(/^[\\\/]+/, '');
    const parts = clean.split(/[\\\/]+/);
    return parts;
  };

  const breadcrumbs = getBreadcrumbParts();

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 flex flex-col select-none">
      {/* Window Title Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950 text-xs border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow">
            B
          </div>
          <span className="font-medium text-slate-300">Bun-Drive</span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">Windows File Explorer AD Integration</span>
          {identity && (
            <span className="bg-blue-950/80 text-blue-300 text-[10px] px-1.5 py-0.5 rounded border border-blue-800/60 font-mono">
              {identity.username}
            </span>
          )}
        </div>

        {/* Decorative Windows Window Controls */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">
            {identity?.isDomainJoined ? `Domain: ${identity.domain}` : 'Local Workstation'}
          </span>
          <div className="flex items-center gap-1.5 pl-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700 hover:bg-slate-600 inline-block cursor-pointer" title="Minimize"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700 hover:bg-slate-600 inline-block cursor-pointer" title="Maximize"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600/80 hover:bg-rose-600 inline-block cursor-pointer" title="Close"></span>
          </div>
        </div>
      </div>

      {/* Main Command Ribbon */}
      <div className="flex items-center justify-between px-3 py-2 gap-2 bg-slate-900">
        {/* Navigation Buttons & Address Bar */}
        <div className="flex items-center gap-2 flex-1 max-w-3xl">
          {!isRoot && (
            <button
              onClick={onNavigateHome}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs border border-slate-700/60"
              title="Back to Bun-Drive Root"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Root</span>
            </button>
          )}

          {/* Breadcrumb / Address Bar */}
          <div className="flex-1 flex items-center bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1 text-xs font-mono shadow-inner overflow-hidden text-slate-200">
            <button
              onClick={onNavigateHome}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition font-semibold"
            >
              <FolderTree className="w-3.5 h-3.5 text-blue-400" />
              <span>Bun-Drive</span>
            </button>

            {breadcrumbs.map((part, idx) => {
              const fullTillHere = '\\\\' + breadcrumbs.slice(0, idx + 1).join('\\');
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={idx}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 mx-1 flex-shrink-0" />
                  <button
                    onClick={() => !isLast && onNavigatePath(fullTillHere)}
                    className={`truncate transition ${
                      isLast
                        ? 'text-slate-100 font-bold cursor-default'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Copy UNC Button */}
          <button
            onClick={handleCopyPath}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs border border-slate-700 flex items-center gap-1 flex-shrink-0"
            title="Copy UNC Path to Clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy UNC'}</span>
          </button>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative w-36 sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Filter shares & files..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md pl-7 pr-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
          </div>

          {/* Refresh AD & Shares */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing || isGpUpdating}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border font-medium transition ${
              isRefreshing
                ? 'bg-blue-900/40 border-blue-700 text-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white shadow-sm'
            }`}
            title="Discover newly published AD shares and re-verify permissions"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Scanning AD...' : 'Refresh Shares'}</span>
          </button>

          {/* Refresh Group Policy (Phase 4) */}
          <button
            onClick={onRefreshGroupPolicy}
            disabled={isGpUpdating || isRefreshing}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border font-medium transition ${
              isGpUpdating
                ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white shadow-sm'
            }`}
            title="Execute gpupdate /force, re-discover authorized shares, and sync Explorer Namespace"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isGpUpdating ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">{isGpUpdating ? 'Updating Group Policy...' : 'Refresh Group Policy'}</span>
            <span className="inline md:hidden">{isGpUpdating ? 'GP...' : 'GP Update'}</span>
          </button>

          {/* Open in Native Windows Explorer */}
          {!isRoot && (
            <button
              onClick={onOpenInExplorer}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white transition"
              title="Open this UNC path in native Windows File Explorer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Open in Explorer</span>
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="hidden sm:flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5">
            <button
              onClick={() => onToggleViewMode('tiles')}
              className={`p-1 rounded ${viewMode === 'tiles' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
              title="Tiles View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onToggleViewMode('details')}
              className={`p-1 rounded ${viewMode === 'details' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
              title="Details View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Diagnostics / Security Context Button */}
          <button
            onClick={onOpenDiagnostics}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition"
            title="Inspect Windows Identity, Kerberos Groups, and Audit Log"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Security & AD Info</span>
          </button>
        </div>
      </div>
    </header>
  );
};
