import React, { useState, useRef, useEffect } from 'react';
import { FileText, MoreVertical, FolderPlus, FolderMinus, Clock, Trash2, Pencil, Copy, Check, X } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { formatSize, formatRelativeDate, cleanFileName, getInitials, stringToColor } from '../../utils/format';
import { folderStore, recentStore } from '../../utils/storage';
import { api } from '../../utils/api';

export default function FileCard({ file, progress, listMode = false }) {
  const { state, actions } = useApp();
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [loading, setLoading] = useState(null); // 'delete' | 'copy' | 'rename'
  const menuRef = useRef(null);
  const renameRef = useRef(null);

  const title = cleanFileName(file.name);
  const initials = getInitials(file.name);
  const color = stringToColor(file.name);
  const pct = progress?.percent || 0;

  useEffect(() => {
    if (!showMenu) return;
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  useEffect(() => {
    if (renaming && renameRef.current) renameRef.current.focus();
  }, [renaming]);

  function openFile() {
    if (renaming) return;
    actions.openFile(file);
    recentStore.add(file.id, file.name);
    actions.addRecent({ fileId: file.id, fileName: file.name, openedAt: Date.now() });
  }

  async function assignToFolder(folderId) {
    await folderStore.assignFile(file.id, folderId);
    actions.assignFile(file.id, folderId);
    setShowMenu(false);
  }

  async function removeFromFolder() {
    await folderStore.unassignFile(file.id);
    actions.unassignFile(file.id);
    setShowMenu(false);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setLoading('delete');
    setShowMenu(false);
    try {
      await api.deleteFile(file.id);
      actions.setFiles(state.files.filter(f => f.id !== file.id));
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
    setLoading(null);
  }

  async function handleCopy() {
    setLoading('copy');
    setShowMenu(false);
    try {
      const res = await api.copyFile(file.id);
      actions.setFiles([res.file, ...state.files]);
    } catch (e) {
      alert(`Copy failed: ${e.message}`);
    }
    setLoading(null);
  }

  function startRename() {
    setRenameValue(cleanFileName(file.name));
    setRenaming(true);
    setShowMenu(false);
  }

  async function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === cleanFileName(file.name)) { setRenaming(false); return; }
    setLoading('rename');
    try {
      const res = await api.renameFile(file.id, trimmed);
      actions.setFiles(state.files.map(f => f.id === file.id ? res.file : f));
    } catch (e) {
      alert(`Rename failed: ${e.message}`);
    }
    setRenaming(false);
    setLoading(null);
  }

  const currentFolder = state.fileAssignments[file.id];
  const availableFolders = state.folders.filter(f => f.id !== currentFolder);
  const busy = loading !== null;

  if (listMode) {
    return (
      <div
        className={`group flex items-center gap-3 md:gap-4 px-3 md:px-4 py-2.5 rounded-xl
                    hover:bg-ink-800/40 transition-all duration-150 border border-transparent
                    hover:border-ink-700/30 ${renaming ? '' : 'cursor-pointer'}`}
        onClick={renaming ? undefined : openFile}
      >
        <div
          className="w-8 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
          style={{ background: color }}
        >
          {busy ? <span className="animate-pulse text-base">⏳</span> : initials}
        </div>

        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <input
                ref={renameRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                className="flex-1 bg-ink-800 text-ink-100 text-sm px-2 py-0.5 rounded border border-ink-600 outline-none focus:border-ink-400"
              />
              <button onClick={submitRename} className="text-green-400 hover:text-green-300 p-0.5"><Check size={14} /></button>
              <button onClick={() => setRenaming(false)} className="text-red-400 hover:text-red-300 p-0.5"><X size={14} /></button>
            </div>
          ) : (
            <>
              <p className="text-ink-100 text-sm font-medium truncate group-hover:text-paper-100 transition-colors">{title}</p>
              <p className="text-ink-500 text-xs truncate hidden md:block">{file.caption || file.name}</p>
            </>
          )}
        </div>

        <div className="w-16 md:w-20 text-right text-ink-500 text-xs flex-shrink-0 hidden sm:block">
          {formatSize(file.size)}
        </div>
        <div className="w-20 md:w-24 text-right text-ink-500 text-xs flex-shrink-0 hidden md:block">
          {formatRelativeDate(file.date)}
        </div>

        <div className="w-16 md:w-20 flex-shrink-0 hidden sm:block">
          {pct > 0 && <div className="text-right text-xs text-ink-500 mb-0.5">{pct}%</div>}
          <div className="h-1 bg-ink-800 rounded-full overflow-hidden">
            {pct > 0 && <div className="h-full bg-ink-500 rounded-full" style={{ width: `${pct}%` }} />}
          </div>
        </div>

        <div className="w-6 flex-shrink-0 relative" ref={menuRef} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-ink-200 transition-all p-1"
          >
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <FileMenu
              availableFolders={availableFolders}
              currentFolder={currentFolder}
              onAssign={assignToFolder}
              onRemove={removeFromFolder}
              onDelete={handleDelete}
              onCopy={handleCopy}
              onRename={startRename}
              onClose={() => setShowMenu(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // Grid card
  return (
    <div
      className={`group relative rounded-2xl border border-ink-800/40 overflow-hidden
                  hover:border-ink-600/50 transition-all duration-200
                  hover:shadow-xl hover:shadow-ink-900/50 hover:-translate-y-0.5
                  ${renaming ? '' : 'cursor-pointer'}`}
      onClick={renaming ? undefined : openFile}
    >
      <div
        className="h-32 md:h-36 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${color}cc, ${color}66)` }}
      >
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '8px 8px' }} />

        <div className="relative text-center px-2">
          <div className="text-3xl md:text-4xl font-bold text-white/90 font-display leading-none mb-1">
            {busy ? '⏳' : initials}
          </div>
          <div className="flex items-center justify-center gap-1 text-white/60">
            <FileText size={10} /><span className="text-[9px] font-mono">PDF</span>
          </div>
        </div>

        {pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div className="h-full bg-white/50 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div ref={menuRef} className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
          <button
            className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white/70 hover:text-white"
            onClick={() => setShowMenu(!showMenu)}
          >
            <MoreVertical size={13} />
          </button>
          {showMenu && (
            <div className="absolute top-8 right-0 z-20">
              <FileMenu
                availableFolders={availableFolders}
                currentFolder={currentFolder}
                onAssign={assignToFolder}
                onRemove={removeFromFolder}
                onDelete={handleDelete}
                onCopy={handleCopy}
                onRename={startRename}
                onClose={() => setShowMenu(false)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="p-2.5 md:p-3 bg-ink-900">
        {renaming ? (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <input
              ref={renameRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="flex-1 bg-ink-800 text-ink-100 text-xs px-2 py-0.5 rounded border border-ink-600 outline-none focus:border-ink-400"
            />
            <button onClick={submitRename} className="text-green-400 hover:text-green-300"><Check size={12} /></button>
            <button onClick={() => setRenaming(false)} className="text-red-400 hover:text-red-300"><X size={12} /></button>
          </div>
        ) : (
          <p className="text-ink-100 text-xs font-medium truncate leading-snug mb-1">{title}</p>
        )}
        <div className="flex items-center justify-between text-ink-600 text-[10px]">
          <span>{formatSize(file.size)}</span>
          <span className="flex items-center gap-0.5"><Clock size={9} />{formatRelativeDate(file.date)}</span>
        </div>
        {pct > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex-1 h-0.5 bg-ink-800 rounded-full overflow-hidden">
              <div className="h-full bg-ink-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[9px] text-ink-600">{pct}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FileMenu({ availableFolders, currentFolder, onAssign, onRemove, onDelete, onCopy, onRename, onClose }) {
  return (
    <div className="glass rounded-xl shadow-2xl min-w-[170px] py-1.5 z-50" onMouseLeave={onClose}>
      <button onClick={onRename}
        className="w-full text-left px-3 py-2 text-xs text-ink-300 hover:bg-ink-700/50 flex items-center gap-2">
        <Pencil size={12} /> Rename
      </button>
      <button onClick={onCopy}
        className="w-full text-left px-3 py-2 text-xs text-ink-300 hover:bg-ink-700/50 flex items-center gap-2">
        <Copy size={12} /> Copy
      </button>
      <button onClick={onDelete}
        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2">
        <Trash2 size={12} /> Delete
      </button>

      {(currentFolder || availableFolders.length > 0) && (
        <div className="border-t border-ink-700/50 my-1" />
      )}

      {currentFolder && (
        <button onClick={onRemove}
          className="w-full text-left px-3 py-2 text-xs text-ink-400 hover:bg-ink-700/50 flex items-center gap-2">
          <FolderMinus size={12} /> Remove from folder
        </button>
      )}
      {availableFolders.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] text-ink-600 uppercase tracking-wider">Add to folder</div>
          {availableFolders.map(f => (
            <button key={f.id} onClick={() => onAssign(f.id)}
              className="w-full text-left px-3 py-2 text-xs text-ink-300 hover:bg-ink-700/50 flex items-center gap-2">
              <FolderPlus size={12} /> {f.name}
            </button>
          ))}
        </>
      )}
      {!currentFolder && availableFolders.length === 0 && (
        <p className="px-3 py-2 text-xs text-ink-600">No folders yet</p>
      )}
    </div>
  );
}
