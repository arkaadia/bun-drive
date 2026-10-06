/**
 * Bun-Drive Right-Click Context Menu Component
 * Provides authentic Windows context menu actions:
 * - Open (Native Windows File Explorer)
 * - Map Drive (Drive Mapping Workflow)
 * - Properties (Windows Properties Dialog)
 */
import React, { useEffect, useRef } from 'react';
import { 
  FolderOpen, 
  HardDrive, 
  Info, 
  Copy, 
  Check, 
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { ContextMenuTarget } from '../types/drive.js';

interface ContextMenuProps {
  x: number;
  y: number;
  target: ContextMenuTarget;
  onClose: () => void;
  onOpen: (target: ContextMenuTarget) => void;
  onMapDrive: (target: ContextMenuTarget) => void;
  onProperties: (target: ContextMenuTarget) => void;
  onRefresh?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  target,
  onClose,
  onOpen,
  onMapDrive,
  onProperties,
  onRefresh
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Viewport clamping
  const [coords, setCoords] = React.useState({ x, y });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      let clampedX = x;
      let clampedY = y;

      if (x + rect.width > winW - 10) {
        clampedX = Math.max(10, winW - rect.width - 10);
      }
      if (y + rect.height > winH - 10) {
        clampedY = Math.max(10, winH - rect.height - 10);
      }

      setCoords({ x: clampedX, y: clampedY });
    }
  }, [x, y]);

  const handleCopyUnc = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(target.uncPath);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 600);
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${coords.y}px`, left: `${coords.x}px` }}
      className="fixed z-50 min-w-56 bg-slate-900 border border-slate-700/80 rounded-md shadow-2xl py-1 text-xs text-slate-200 backdrop-blur-md select-none animate-in fade-in duration-100"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Target Preview Header */}
      <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] font-mono text-slate-400 truncate max-w-xs">
        <span className="text-slate-500">{target.isDirectory ? '📁 ' : '📄 '}</span>
        <span className="font-semibold text-slate-200">{target.name}</span>
      </div>

      {/* 1. Open in Windows File Explorer */}
      <button
        onClick={() => {
          onOpen(target);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between group transition font-medium"
      >
        <div className="flex items-center gap-2">
          <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover:text-white" />
          <span>Open in Explorer</span>
        </div>
        <span className="text-[10px] text-slate-500 group-hover:text-blue-200 font-mono">Enter</span>
      </button>

      {/* 2. Map Drive */}
      {target.isDirectory && (
        <button
          onClick={() => {
            onMapDrive(target);
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between group transition font-medium"
        >
          <div className="flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400 group-hover:text-white" />
            <span>Map Drive...</span>
          </div>
          {target.mappedDrive ? (
            <span className="text-[10px] bg-blue-950 text-blue-300 group-hover:bg-blue-800 group-hover:text-white px-1.5 py-0.2 rounded font-mono font-bold">
              {target.mappedDrive}
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 group-hover:text-blue-200">Z:</span>
          )}
        </button>
      )}

      {/* Copy UNC Path */}
      <button
        onClick={handleCopyUnc}
        className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center justify-between group transition text-slate-300"
      >
        <div className="flex items-center gap-2">
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>{copied ? 'Copied UNC Path' : 'Copy UNC Path'}</span>
        </div>
      </button>

      {/* Optional Refresh */}
      {onRefresh && (
        <button
          onClick={() => {
            onRefresh();
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2 group transition text-slate-300"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          <span>Refresh</span>
        </button>
      )}

      <div className="my-1 border-t border-slate-800"></div>

      {/* 3. Properties */}
      <button
        onClick={() => {
          onProperties(target);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between group transition font-medium"
      >
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-amber-400 group-hover:text-white" />
          <span>Properties</span>
        </div>
        <span className="text-[10px] text-slate-500 group-hover:text-blue-200 font-mono">Alt+Enter</span>
      </button>
    </div>
  );
};
