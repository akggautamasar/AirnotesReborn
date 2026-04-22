import React, { useState } from 'react';
import { BookOpen, Clock, Search, LogOut, Plus, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { api } from '../utils/api';

export default function Sidebar({ onSearch, onFolderCreated, onFolderChanged }) {
  const { state, actions } = useApp();
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [creatingFolder, setCreatingFolder]   = useState(false);
  const [newFolderName, setNewFolderName]     = useState('');
  const [renamingId, setRenamingId]           = useState(null);
  const [renameValue, setRenameValue]         = useState('');
  const [saving, setSaving]                   = useState(false);

  const rootFolders = state.folders.filter(f => !f.parentId);

  async function createFolder() {
    if (!newFolderName.trim() || saving) return;
    setSaving(true);
    try {
      const data = await api.createFolder(newFolderName.trim());
      const folder = { id: data.folder.id, name: data.folder.name, parentId: data.folder.parent_id,
                       createdAt: data.folder.created_at, fileCount: 0 };
      actions.addFolder(folder);
      setNewFolderName('');
      setCreatingFolder(false);
      onFolderCreated?.();
    } catch (e) {
      console.error('Create folder failed:', e);
    } finally {
      setSaving(false);
    }
  }

  async function doRename(folderId) {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      await api.renameFolder(folderId, renameValue.trim());
      actions.renameFolder(folderId, renameValue.trim());
      onFolderChanged?.();
    } catch (e) {
      console.error('Rename failed:', e);
    }
    setRenamingId(null);
  }

  async function deleteFolder(folderId) {
    try {
      await api.deleteFolder(folderId);
      actions.removeFolder(folderId);
      if (state.activeFolderId === folderId) actions.setActiveSection('library');
      onFolderChanged?.();
    } catch (e) {
      console.error('Delete folder failed:', e);
    }
  }

  return (
    <aside className="w-60 h-full bg-ink-950 border-r border-ink-800/60 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-ink-800/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-ink-800 border border-ink-700/50 flex items-center justify-center text-lg flex-shrink-0">
            📚
          </div>
          <div>
            <h1 className="font-display text-base font-bold text-paper-100 leading-none">AirNotes</h1>
            <span className="text-emerald-400 text-[10px]">MTProto · Instant sync</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <button onClick={onSearch}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-800/50
                           border border-ink-700/30 text-ink-400 text-sm hover:bg-ink-800 hover:text-ink-200 transition-all">
          <Search size={14} />
          <span className="font-body text-xs">Search…</span>
          <kbd className="ml-auto text-[10px] bg-ink-700/50 px-1.5 py-0.5 rounded text-ink-500">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="px-3 space-y-0.5">
        {[
          { key: 'library', icon: BookOpen, label: 'All Files', count: state.files.length },
          { key: 'recent',  icon: Clock,    label: 'Recent',    count: state.recentFiles.length },
        ].map(item => (
          <button key={item.key} onClick={() => actions.setActiveSection(item.key)}
                  className={`sidebar-item w-full ${state.activeSection === item.key && !state.activeFolderId ? 'active' : ''}`}>
            <item.icon size={15} />
            <span className="flex-1 text-left">{item.label}</span>
            {item.count > 0 && (
              <span className="text-[10px] bg-ink-700/60 text-ink-400 px-1.5 py-0.5 rounded-full">{item.count}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Folders */}
      <div className="px-3 mt-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-600">Folders</span>
          <button onClick={() => setCreatingFolder(true)} className="text-ink-600 hover:text-ink-300 transition-colors" title="New folder">
            <Plus size={13} />
          </button>
        </div>

        {creatingFolder && (
          <div className="mb-2 flex gap-1">
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
                   placeholder="Folder name"
                   className="flex-1 bg-ink-800 border border-ink-600 rounded-lg px-2 py-1 text-xs text-ink-100 focus:outline-none" />
            <button onClick={createFolder} disabled={saving} className="text-ink-300 hover:text-ink-100 px-1">✓</button>
          </div>
        )}

        {rootFolders.length === 0 && !creatingFolder && (
          <p className="text-ink-700 text-xs px-1 py-2">No folders yet</p>
        )}

        {rootFolders.map(folder => (
          <FolderItem key={folder.id} folder={folder} allFolders={state.folders}
            isActive={state.activeFolderId === folder.id}
            expanded={expandedFolders.has(folder.id)}
            renamingId={renamingId} renameValue={renameValue}
            onRenameChange={setRenameValue}
            onToggle={() => setExpandedFolders(prev => { const n = new Set(prev); n.has(folder.id) ? n.delete(folder.id) : n.add(folder.id); return n; })}
            onSelect={() => actions.setActiveFolder(folder.id)}
            onStartRename={(id, name) => { setRenamingId(id); setRenameValue(name); }}
            onRename={doRename} onDelete={deleteFolder}
            fileAssignments={state.fileAssignments}
          />
        ))}
      </div>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-ink-800/40">
        <button onClick={actions.logout} className="sidebar-item w-full text-red-400/70 hover:text-red-400 hover:bg-red-500/10">
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

function FolderItem({ folder, allFolders, isActive, expanded, renamingId, renameValue,
  onRenameChange, onToggle, onSelect, onStartRename, onRename, onDelete, fileAssignments }) {
  const [showMenu, setShowMenu] = useState(false);
  const fileCount = Object.values(fileAssignments).filter(fid => fid === folder.id).length;
  const children  = allFolders.filter(f => f.parentId === folder.id);
  const Icon = isActive ? FolderOpen : Folder;

  if (renamingId === folder.id) {
    return (
      <div className="flex gap-1 mb-0.5">
        <input autoFocus value={renameValue} onChange={e => onRenameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onRename(folder.id); if (e.key === 'Escape') onRename(null); }}
          className="flex-1 bg-ink-800 border border-ink-600 rounded-lg px-2 py-1 text-xs text-ink-100 focus:outline-none"
        />
        <button onClick={() => onRename(folder.id)} className="text-ink-300 px-1 text-xs">✓</button>
      </div>
    );
  }

  return (
    <div>
      <div className={`relative group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-all
                       ${isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-400 hover:text-ink-200 hover:bg-ink-800/50'}`}
           onClick={onSelect}>
        {children.length > 0 && (
          <button onClick={e => { e.stopPropagation(); onToggle(); }} className="text-ink-600 hover:text-ink-400 flex-shrink-0">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        )}
        <Icon size={13} className="flex-shrink-0" />
        <span className="flex-1 truncate text-xs font-medium">{folder.name}</span>
        {fileCount > 0 && <span className="text-[10px] bg-ink-700/50 text-ink-500 px-1 rounded">{fileCount}</span>}
        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }} className="text-ink-600 hover:text-ink-300 px-0.5">⋯</button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 glass rounded-lg shadow-xl min-w-[120px] py-1"
                 onMouseLeave={() => setShowMenu(false)}>
              <button onClick={e => { e.stopPropagation(); onStartRename(folder.id, folder.name); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700/50">Rename</button>
              <button onClick={e => { e.stopPropagation(); onDelete(folder.id); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">Delete</button>
            </div>
          )}
        </div>
      </div>
      {expanded && children.map(child => (
        <div key={child.id} className="ml-4 mt-0.5 border-l border-ink-800/60 pl-2">
          <FolderItem folder={child} allFolders={allFolders} isActive={false} expanded={false}
            renamingId={renamingId} renameValue={renameValue} onRenameChange={onRenameChange}
            onToggle={() => {}} onSelect={onSelect} onStartRename={onStartRename}
            onRename={onRename} onDelete={onDelete} fileAssignments={fileAssignments} />
        </div>
      ))}
    </div>
  );
}
