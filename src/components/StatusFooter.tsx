/**
 * Bun-Drive Explorer Status Bar
 */
import React from 'react';
import { ShieldCheck, HardDrive, Cpu, CheckCircle2 } from 'lucide-react';
import { WindowsIdentity } from '../types/drive.js';

interface StatusFooterProps {
  totalItems: number;
  itemTypeLabel: string;
  identity: WindowsIdentity | null;
  scanDurationMs: number;
  lastScannedTime: string | null;
}

export const StatusFooter: React.FC<StatusFooterProps> = ({
  totalItems,
  itemTypeLabel,
  identity,
  scanDurationMs,
  lastScannedTime,
}) => {
  return (
    <footer className="h-6 bg-slate-950 border-t border-slate-800 px-3 flex items-center justify-between text-[11px] text-slate-400 select-none">
      <div className="flex items-center gap-3">
        <span className="font-medium text-slate-300">
          {totalItems} {itemTypeLabel}
        </span>
        <span className="text-slate-600">|</span>
        <div className="flex items-center gap-1 text-slate-400">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Active Directory: {identity?.domain || 'Connected'}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
        {scanDurationMs > 0 && (
          <div className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-slate-600" />
            <span>Scan: {scanDurationMs}ms</span>
          </div>
        )}
        <span className="text-slate-700">•</span>
        <div className="flex items-center gap-1 text-emerald-500/90">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>{identity?.authType || 'Kerberos'} Token</span>
        </div>
        {lastScannedTime && (
          <>
            <span className="text-slate-700">•</span>
            <span>Last sync: {new Date(lastScannedTime).toLocaleTimeString()}</span>
          </>
        )}
      </div>
    </footer>
  );
};
