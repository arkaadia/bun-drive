/**
 * Bun-Drive Folder Browser Component
 * Allows browsing subfolders and files inside a network share
 * with real Windows permissions.
 */
import React from 'react';
import { 
  Folder, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  FileArchive, 
  FileImage, 
  File, 
  ArrowUp, 
  ExternalLink, 
  Copy, 
  Check, 
  AlertCircle,
  Clock,
  HardDrive
} from 'lucide-react';
import { BrowseResult, FileSystemEntry } from '../types/drive.js';

interface FolderBrowserProps {
  browseResult: BrowseResult | null;
  isLoading: boolean;
  onNavigatePath: (path: string) => void;
  onNavigateUp: () => void;
  onOpenInExplorer: (uncPath: string) => void;
  searchQuery: string;
}

export const FolderBrowser: React.FC<FolderBrowserProps> = ({
  browseResult,
  isLoading,
  onNavigatePath,
  onNavigateUp,
  onOpenInExplorer,
  searchQuery,
}) => {
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null);

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  // Icon helper based on file extension
  const getFileIcon = (entry: FileSystemEntry) => {
    if (entry.isDirectory) {
      return <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20" />;
    }
    const ext = entry.extension.toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    }
    if (['.docx', '.doc', '.pdf', '.txt', '.md', '.rtf'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-400" />;
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
      return <FileArchive className="w-4 h-4 text-amber-500" />;
    }
    if (['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'].includes(ext)) {
      return <FileImage className="w-4 h-4 text-purple-400" />;
    }
    if (['.json', '.xml', '.ts', '.js', '.ps1', '.bat', '.cmd'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-cyan-400" />;
    }
    return <File className="w-4 h-4 text-slate-400" />;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-400 text-xs">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Reading Windows directory metadata...</span>
        </div>
      </div>
    );
  }

  if (!browseResult) {
    return null;
  }

  if (!browseResult.accessible) {
    return (
      <div className="flex-1 p-6 bg-slate-950 flex items-center justify-center">
        <div className="max-w-md bg-rose-950/40 border border-rose-800 rounded-lg p-5 text-center">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-rose-200">Windows Access Denied</h3>
          <p className="text-xs text-rose-300/80 mt-1">
            {browseResult.error || 'Your Windows domain credentials do not have permission to read this folder.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {browseResult.parentPath && (
              <button
                onClick={onNavigateUp}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700"
              >
                Go Up to Parent
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const filteredEntries = browseResult.entries.filter((entry) => {
    if (!searchQuery) return true;
    return entry.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden text-xs text-slate-200">
      {/* Explorer Path Header & Tools */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {browseResult.parentPath && (
            <button
              onClick={onNavigateUp}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 border border-slate-700"
              title="Up to Parent Folder"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Up</span>
            </button>
          )}

          <div className="text-xs font-mono text-slate-300">
            <span className="text-slate-500">Location: </span>
            <span className="font-semibold text-white">{browseResult.currentPath}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy(browseResult.currentPath)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 flex items-center gap-1"
            title="Copy UNC Path"
          >
            {copiedPath === browseResult.currentPath ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{copiedPath === browseResult.currentPath ? 'Copied' : 'Copy UNC'}</span>
          </button>

          <button
            onClick={() => onOpenInExplorer(browseResult.currentPath)}
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1 shadow-sm"
            title="Open in Native Windows File Explorer"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open in Explorer</span>
          </button>
        </div>
      </div>

      {/* File List Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0 backdrop-blur">
              <th className="py-2 px-3 font-semibold">Name</th>
              <th className="py-2 px-3 font-semibold">Date Modified</th>
              <th className="py-2 px-3 font-semibold">Type</th>
              <th className="py-2 px-3 font-semibold text-right">Size</th>
              <th className="py-2 px-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {filteredEntries.map((entry) => (
              <tr
                key={entry.path}
                onDoubleClick={() => {
                  if (entry.isDirectory) {
                    onNavigatePath(entry.path);
                  } else {
                    onOpenInExplorer(entry.path);
                  }
                }}
                className="hover:bg-slate-850 cursor-pointer transition select-none group"
              >
                {/* File / Folder Name */}
                <td className="py-2 px-3 font-medium text-slate-200 group-hover:text-blue-300 flex items-center gap-2">
                  {getFileIcon(entry)}
                  <span
                    onClick={() => {
                      if (entry.isDirectory) {
                        onNavigatePath(entry.path);
                      }
                    }}
                    className={entry.isDirectory ? 'hover:underline font-semibold' : ''}
                  >
                    {entry.name}
                  </span>
                </td>

                {/* Date Modified */}
                <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                  {new Date(entry.modifiedTime).toLocaleDateString()} {new Date(entry.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>

                {/* Type */}
                <td className="py-2 px-3 text-slate-400 text-[11px]">
                  {entry.isDirectory ? 'File folder' : (entry.extension ? `${entry.extension.toUpperCase().slice(1)} File` : 'File')}
                </td>

                {/* Size */}
                <td className="py-2 px-3 text-slate-400 font-mono text-right text-[11px]">
                  {entry.formattedSize || '—'}
                </td>

                {/* Actions */}
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(entry.path);
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      title="Copy UNC Path"
                    >
                      {copiedPath === entry.path ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInExplorer(entry.path);
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-blue-400 hover:text-blue-300 transition"
                      title="Open with Default Windows Program"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  {searchQuery ? 'No items match your filter.' : 'This folder is empty.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Directory Footer Summary */}
      <div className="p-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <div>
          <span>{browseResult.totalFolders} folder(s), </span>
          <span>{browseResult.totalFiles} file(s)</span>
        </div>
        <div className="flex items-center gap-1 font-mono text-slate-500">
          <HardDrive className="w-3 h-3" />
          <span>Server: {browseResult.server}</span>
        </div>
      </div>
    </div>
  );
};
