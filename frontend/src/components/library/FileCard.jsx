import React, { useState } from 'react';
import { FileText, MoreVertical, FolderPlus, FolderMinus, Clock } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { formatSize, formatRelativeDate, cleanFileName, getInitials, stringToColor } from '../../utils/format';
import { folderStore, recentStore } from '../../utils/storage';

export default function FileCard({ file, progress, listMode = false }) {
  const { state, actions } = useApp();
  const [showMenu, setShowMenu] = useState(false);

  const title = cleanFileName(file.name);
  const initials = getInitials(file.name);
  const color = stringToColor(file.name);
  const pct = progress?.percent || 0;

  function openFile() {
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

  const currentFolder = state.fileAssignments[file.id];
  const availableFolders = state.folders.filter(f => f.id !== currentFolder);

  if (listMode) {
    return (
      <div
        className="group flex items-center gap-3 md:gap-4 px-3 md:px-4 py-2.5 rounded-xl
                   hover:bg-ink-800/40 transition-all duration-150 cursor-pointer border border-transparent
                   hover:border-ink-700/30"
        onClick={openFile}
      >
        {/* Icon */}
        <div className="w-8 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
          style={{ background: color }}>
          {initials}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-ink-100 text-sm font-medium truncate group-hover:text-paper-100 transition-colors">
            {title}
          </p>
          <p className="text-ink-500 text-xs truncate hidden md:block">{file.caption || file.name}</p>
        </div>

        {/* Size */}
        <div className="w-16 md:w-20 text-right text-ink-500 text-xs flex-shrink-0 hidden sm:block">
          {formatSize(file.size)}
        </div>

        {/* Date */}
        <div className="w-20 md:w-24 text-right text-ink-500 text-xs flex-shrink-0 hidden md:block">
          {formatRelativeDate(file.date)}
        </div>

        {/* Progress */}
        <div className="w-16 md:w-20 flex-shrink-0 hidden sm:block">
          {pct > 0 && (
            <div className="text-right text-xs text-ink-500 mb-0.5">{pct}%</div>
          )}
          <div className="h-1 bg-ink-800 rounded-full overflow-hidden">
            {pct > 0 && <div className="h-full bg-ink-500 rounded-full" style={{ width: `${pct}%` }} />}
          </div>
        </div>

        {/* Menu */}
        <div className="w-6 flex-shrink-0 relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-ink-200 transition-all p-1"
          >
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <FolderMenu
              availableFolders={availableFolders}
              currentFolder={currentFolder}
              onAssign={assignToFolder}
              onRemove={removeFromFolder}
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
      className="group relative rounded-2xl border border-ink-800/40 overflow-hidden
                 hover:border-ink-600/50 transition-all duration-200 cursor-pointer
                 hover:shadow-xl hover:shadow-ink-900/50 hover:-translate-y-0.5"
      onClick={openFile}
    >
      {/* Cover art */}
      <div
        className="h-32 md:h-36 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${color}cc, ${color}66)` }}
      >
        {/* Pattern overlay */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '8px 8px' }} />

        <div className="relative text-center px-2">
          <div className="text-3xl md:text-4xl font-bold text-white/90 font-display leading-none mb-1">
            {initials}
          </div>
          <div className="flex items-center justify-center gap-1 text-white/60">
            <FileText size={10} />
            <span className="text-[9px] font-mono">PDF</span>
          </div>
        </div>

        {/* Progress overlay */}
        {pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div className="h-full bg-white/50 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Menu button */}
        <button
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all
                     p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white/70 hover:text-white"
          onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
        >
          <MoreVertical size={13} />
        </button>

        {showMenu && (
          <div className="absolute top-8 right-2 z-20" onClick={e => e.stopPropagation()}>
            <FolderMenu
              availableFolders={availableFolders}
              currentFolder={currentFolder}
              onAssign={assignToFolder}
              onRemove={removeFromFolder}
              onClose={() => setShowMenu(false)}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 md:p-3 bg-ink-900">
        <p className="text-ink-100 text-xs font-medium truncate leading-snug mb-1">
          {title}
        </p>
        <div className="flex items-center justify-between text-ink-600 text-[10px]">
          <span>{formatSize(file.size)}</span>
          <span className="flex items-center gap-0.5">
            <Clock size={9} />
            {formatRelativeDate(file.date)}
          </span>
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

function FolderMenu({ availableFolders, currentFolder, onAssign, onRemove, onClose }) {
  return (
    <div
      className="glass rounded-xl shadow-2xl min-w-[160px] py-1.5 z-50"
      onMouseLeave={onClose}
    >
      {currentFolder && (
        <button
          onClick={onRemove}
          className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
        >
          <FolderMinus size={12} />
          Remove from folder
        </button>
      )}
      {availableFolders.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] text-ink-600 uppercase tracking-wider">Add to folder</div>
          {availableFolders.map(f => (
            <button
              key={f.id}
              onClick={() => onAssign(f.id)}
              className="w-full text-left px-3 py-2 text-xs text-ink-300 hover:bg-ink-700/50 flex items-center gap-2"
            >
              <FolderPlus size={12} />
              {f.name}
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
