/**
 * Bun-Drive Windows Properties Dialog Component
 * Displays real Windows filesystem metadata, Active Directory security context,
 * NTFS/SMB access permissions, and mapped drive status.
 */
import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  File,
  HardDrive,
  ShieldCheck,
  Lock,
  AlertTriangle,
  Server,
  ExternalLink,
  Copy,
  Check,
  Clock,
  KeyRound
} from 'lucide-react';
import { ShareProperties } from '../types/drive.js';

interface PropertiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath: string | null;
  initialProperties?: ShareProperties | null;
  onOpenInExplorer?: (path: string) => void;
  onTriggerMapDrive?: (uncPath: string) => void;
  onTriggerUnmapDrive?: (letter: string) => void;
}

export const PropertiesModal: React.FC<PropertiesModalProps> = ({
  isOpen,
  onClose,
  targetPath,
  initialProperties,
  onOpenInExplorer,
  onTriggerMapDrive,
  onTriggerUnmapDrive
}) => {
  const [properties, setProperties] = useState<ShareProperties | null>(initialProperties || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'sharing' | 'security'>('general');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && targetPath) {
      setLoading(true);
      setError(null);
      fetch(`/api/properties?path=${encodeURIComponent(targetPath)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          return res.json();
        })
        .then((data: ShareProperties) => {
          setProperties(data);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, targetPath]);

  if (!isOpen || !targetPath) return null;

  const handleCopyUnc = () => {
    navigator.clipboard.writeText(targetPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const isShare = properties?.itemType === 'Share';
  const isFile = properties?.itemType === 'File';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 text-xs text-slate-200 select-none"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/90 rounded-lg shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Windows Dialog Header */}
        <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isShare ? (
              <Server className="w-4 h-4 text-blue-400" />
            ) : isFile ? (
              <File className="w-4 h-4 text-emerald-400" />
            ) : (
              <Folder className="w-4 h-4 text-amber-400" />
            )}
            <h2 className="text-xs font-semibold text-white truncate max-w-xs">
              {properties?.name || 'Item'} Properties
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-3 text-[11px] gap-1">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-1.5 px-3 border-b-2 font-medium transition ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('sharing')}
            className={`py-1.5 px-3 border-b-2 font-medium transition ${
              activeTab === 'sharing'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Sharing & Mapping
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-1.5 px-3 border-b-2 font-medium transition ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Security & Permissions
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3 font-sans">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Querying Windows SMB & NTFS metadata...</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-rose-950/50 border border-rose-800 text-rose-300">
              <div className="font-semibold flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Error retrieving properties</span>
              </div>
              <p className="text-[11px] text-rose-300/80">{error}</p>
            </div>
          )}

          {!loading && properties && (
            <>
              {/* TAB 1: GENERAL */}
              {activeTab === 'general' && (
                <div className="space-y-3">
                  {/* Name and Icon Header */}
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                    <div className="w-10 h-10 rounded bg-slate-800/80 border border-slate-700 flex items-center justify-center shrink-0">
                      {isShare ? (
                        <Server className="w-6 h-6 text-blue-400" />
                      ) : isFile ? (
                        <File className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <Folder className="w-6 h-6 text-amber-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-white truncate">{properties.name}</div>
                      <div className="text-[11px] text-slate-400">{properties.locationType}</div>
                    </div>
                  </div>

                  {/* Property Details Grid */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Type:</span>
                      <span className="font-medium text-slate-200">{properties.itemType}</span>
                    </div>

                    <div className="py-1 border-b border-slate-800/60 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Location (UNC):</span>
                        <button
                          onClick={handleCopyUnc}
                          className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="font-mono text-[11px] text-slate-300 bg-slate-950 p-1.5 rounded border border-slate-800 break-all">
                        {properties.uncPath}
                      </div>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Server:</span>
                      <span className="font-mono text-slate-200">{properties.server}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Share:</span>
                      <span className="font-mono text-slate-200">{properties.share}</span>
                    </div>

                    {properties.subPath && (
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Subfolder:</span>
                        <span className="font-mono text-slate-200">{properties.subPath}</span>
                      </div>
                    )}

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Local / Remote:</span>
                      <span className="text-slate-300">Remote Active Directory SMB</span>
                    </div>

                    {properties.formattedSize && (
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Size:</span>
                        <span className="font-mono text-slate-200">
                          {properties.formattedSize} ({properties.sizeBytes?.toLocaleString()} bytes)
                        </span>
                      </div>
                    )}

                    {properties.folderCount !== undefined && properties.fileCount !== undefined && (
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Contains:</span>
                        <span className="text-slate-200">
                          {properties.folderCount} Folder(s), {properties.fileCount} File(s)
                        </span>
                      </div>
                    )}

                    {properties.modifiedTime && (
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Modified:</span>
                        <span className="font-mono text-slate-300 text-[11px]">
                          {new Date(properties.modifiedTime).toLocaleString()}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Attributes:</span>
                      <span className="font-mono text-slate-300">
                        {properties.attributes?.join(', ') || 'Directory'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SHARING & MAPPING */}
              {activeTab === 'sharing' && (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Network Path
                    </span>
                    <div className="font-mono text-xs text-blue-300 break-all select-all">
                      {properties.uncPath}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Accessible across the domain via SMB protocol using authenticated Windows Kerberos/NTLM ticket.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Windows Drive Letter Mapping
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Mapped Letter:</span>
                      {properties.mappedDrive ? (
                        <span className="px-2 py-0.5 rounded bg-blue-900/80 text-blue-200 border border-blue-700 font-mono font-bold">
                          {properties.mappedDrive}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Not currently mapped</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Connection Status:</span>
                      <span className="font-medium text-emerald-300">{properties.connectionStatus}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Availability:</span>
                      <span className="font-medium text-slate-200">{properties.availability}</span>
                    </div>

                    <div className="pt-2 flex gap-2">
                      {properties.mappedDrive ? (
                        onTriggerUnmapDrive && (
                          <button
                            onClick={() => {
                              onTriggerUnmapDrive(properties.mappedDrive!);
                              onClose();
                            }}
                            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-xs transition"
                          >
                            Unmap Drive {properties.mappedDrive}
                          </button>
                        )
                      ) : (
                        onTriggerMapDrive && (
                          <button
                            onClick={() => {
                              onTriggerMapDrive(properties.uncPath);
                              onClose();
                            }}
                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition shadow flex items-center justify-center gap-1.5"
                          >
                            <HardDrive className="w-3.5 h-3.5" />
                            <span>Map to Drive Letter...</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: SECURITY & PERMISSIONS */}
              {activeTab === 'security' && (
                <div className="space-y-3 text-xs">
                  {/* Status Banner */}
                  <div
                    className={`p-3 rounded border flex items-center gap-2.5 ${
                      properties.accessStatus === 'Accessible'
                        ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
                        : properties.accessStatus === 'Access Denied'
                        ? 'bg-rose-950/50 border-rose-800 text-rose-200'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300'
                    }`}
                  >
                    {properties.accessStatus === 'Accessible' ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <Lock className="w-5 h-5 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold text-xs">
                        Access Status: {properties.accessStatus}
                      </div>
                      <div className="text-[11px] opacity-90">
                        {properties.denialReason || `Verified under user's domain security credentials.`}
                      </div>
                    </div>
                  </div>

                  {/* Access Rights Checklist */}
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Verified Windows Permissions
                    </span>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Read / Traverse:</span>
                      <span className={properties.isReadable ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {properties.isReadable ? 'Allowed (Verified)' : 'Denied'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Write / Modify:</span>
                      <span className={properties.isWritable ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        {properties.isWritable ? 'Allowed (Verified)' : 'Read-Only / Denied'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Access Level:</span>
                      <span className="font-mono font-bold text-blue-300">{properties.accessLevel}</span>
                    </div>
                  </div>

                  {/* Security Context Details */}
                  {properties.securityContext && (
                    <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1.5 text-[11px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1">
                        Active Directory Security Context
                      </span>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Domain User:</span>
                        <span className="font-mono text-slate-300">{properties.securityContext.user}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Domain:</span>
                        <span className="font-mono text-slate-300">{properties.securityContext.domain}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Authentication:</span>
                        <span className="text-slate-300">{properties.securityContext.authType} Token</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">ACL Status:</span>
                        <span className="text-emerald-400 font-mono">
                          {properties.securityContext.verifiedPermissions}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Windows Dialog Footer */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div>
            {onOpenInExplorer && targetPath && (
              <button
                onClick={() => onOpenInExplorer(targetPath)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-medium flex items-center gap-1 border border-slate-700 transition"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in Explorer</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
