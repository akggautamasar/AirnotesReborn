import React, { useEffect, useState, useCallback } from 'react';
import {
  Grid3X3, List, RefreshCw, Plus, Folder, FolderOpen, Trash2,
  ChevronRight, BookOpen, Clock, FileText, Film, LayoutGrid
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { folderStore, recentStore } from '../../utils/storage';
import FileCard from './FileCard';
import { cleanFileName, formatRelativeDate } from '../../utils/format';

const TYPE_TABS = [
  { id: 'all',   label: 'All Files', icon: LayoutGrid },
  { id: 'pdf',   label: 'PDFs',      icon: FileText   },
  { id: 'video', label: 'Videos',    icon: Film       },
];

export default function LibraryView() {
  const { state, actions } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});

  // ── Load files on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadFiles();
    const stored = folderStore.getAll();
    actions.setFolders(stored.folders);
    actions.setFileAssignments(stored.assignments);
    const recent = recentStore.getAll();
    actions.setRecent(recent);
  }, []);

  async function loadFiles() {
    actions.setFilesLoading(true);
    try {
      const data = await api.getFiles();
      actions.setFiles(data.files || []);
    } catch (e) {
      actions.setFilesError(e.message);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.refresh();
      // Poll until refresh_in_progress is false
      let tries = 0;
      while (tries < 30) {
        await new Promise(r => setTimeout(r, 2000));
        const data = await api.getFiles();
        actions.setFiles(data.files || []);
        if (!data.refresh_in_progress) break;
        tries++;
      }
    } catch (e) {
      console.error('Refresh failed', e);
    }
    setRefreshing(false);
  }

  // ── Folder management ────────────────────────────────────────────────────
  function addFolder() {
    const name = newFolder.trim();
    if (!name) return;
    const folder = folderStore.createFolder(name);
    actions.addFolder(folder);
    setNewFolder('');
    setAddingFolder(false);
  }

  function deleteFolder(id) {
    if (!window.confirm('Delete this folder? Files will remain.')) return;
    folderStore.deleteFolder(id);
    actions.removeFolder(id);
  }

  function startEditFolder(folder) {
    setEditingFolder(folder.id);
    setEditFolderName(folder.name);
  }

  function saveEditFolder(id) {
    const name = editFolderName.trim();
    if (!name) { setEditingFolder(null); return; }
    folderStore.renameFolder(id, name);
    actions.renameFolder(id, name);
    setEditingFolder(null);
  }

  // ── Derived file lists ───────────────────────────────────────────────────
  const { activeTypeFilter } = state;

  function filterByType(files) {
    if (activeTypeFilter === 'all') return files;
    return files.filter(f => (f.type || 'pdf') === activeTypeFilter);
  }

  let displayFiles = [];
  let sectionTitle = '';

  if (state.activeSection === 'library') {
    displayFiles = filterByType(state.files);
    sectionTitle = activeTypeFilter === 'all' ? 'All Files' :
                   activeTypeFilter === 'pdf' ? 'PDFs' : 'Videos';
  } else if (state.activeSection === 'recent') {
    const recentIds = new Set(state.recentFiles.map(r => r.fileId));
    const recentMap = Object.fromEntries(state.recentFiles.map(r => [r.fileId, r]));
    displayFiles = filterByType(
      state.files.filter(f => recentIds.has(f.id))
                 .sort((a, b) => (recentMap[b.id]?.openedAt || 0) - (recentMap[a.id]?.openedAt || 0))
    );
    sectionTitle = 'Recent';
  } else if (state.activeSection === 'folder') {
    const assignedIds = Object.entries(state.fileAssignments)
      .filter(([, fid]) => fid === state.activeFolderId)
      .map(([id]) => id);
    displayFiles = filterByType(state.files.filter(f => assignedIds.includes(f.id)));
    const folder = state.folders.find(f => f.id === state.activeFolderId);
    sectionTitle = folder?.name || 'Folder';
  }

  const isGridMode = state.viewMode === 'grid';

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-ink-950/95 backdrop-blur border-b border-ink-800/40 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display font-bold text-paper-100 text-lg leading-tight">{sectionTitle}</h1>
            <p className="text-ink-500 text-xs">{displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <button
              onClick={() => actions.setViewMode(isGridMode ? 'list' : 'grid')}
              className="p-2 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-ink-800/50 transition-all"
              title={isGridMode ? 'List view' : 'Grid view'}
            >
              {isGridMode ? <List size={16} /> : <Grid3X3 size={16} />}
            </button>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`p-2 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-ink-800/50 transition-all ${refreshing ? 'opacity-50' : ''}`}
              title="Refresh library"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>

            {/* Add folder */}
            <button
              onClick={() => setAddingFolder(true)}
              className="p-2 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-ink-800/50 transition-all"
              title="New folder"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* ── Type filter tabs ── */}
        {state.activeSection === 'library' && (
          <div className="flex gap-1 mt-2">
            {TYPE_TABS.map(tab => {
              const Icon = tab.icon;
              const count = tab.id === 'all'
                ? state.files.length
                : state.files.filter(f => (f.type || 'pdf') === tab.id).length;
              return (
                <button
                  key={tab.id}
                  onClick={() => actions.setTypeFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTypeFilter === tab.id
                      ? 'bg-ink-700 text-paper-100'
                      : 'text-ink-500 hover:text-ink-200 hover:bg-ink-800/40'
                  }`}
                >
                  <Icon size={12} />
                  {tab.label}
                  <span className={`text-[10px] px-1 rounded ${activeTypeFilter === tab.id ? 'bg-ink-600 text-ink-200' : 'bg-ink-800 text-ink-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 space-y-6">
        {/* ── Add folder form ── */}
        {addingFolder && (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={newFolder}
              onChange={e => setNewFolder(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addFolder(); if (e.key === 'Escape') setAddingFolder(false); }}
              placeholder="Folder name…"
              className="flex-1 bg-ink-800 text-ink-100 text-sm px-3 py-2 rounded-lg border border-ink-600 outline-none focus:border-ink-400"
            />
            <button onClick={addFolder} className="px-3 py-2 bg-ink-700 text-paper-100 text-sm rounded-lg hover:bg-ink-600">Add</button>
            <button onClick={() => setAddingFolder(false)} className="px-3 py-2 text-ink-400 text-sm rounded-lg hover:bg-ink-800">Cancel</button>
          </div>
        )}

        {/* ── Folders ── */}
        {state.activeSection === 'library' && state.folders.length > 0 && (
          <div>
            <h2 className="text-ink-500 text-xs font-medium uppercase tracking-widest mb-2">Folders</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {state.folders.map(folder => {
                const count = Object.values(state.fileAssignments).filter(fid => fid === folder.id).length;
                return (
                  <div
                    key={folder.id}
                    className={`group relative rounded-xl border border-ink-800/40 p-3 cursor-pointer
                                hover:border-ink-600/50 hover:bg-ink-800/20 transition-all
                                ${state.activeFolderId === folder.id && state.activeSection === 'folder' ? 'border-ink-600/70 bg-ink-800/30' : ''}`}
                    onClick={() => actions.setActiveFolder(folder.id)}
                  >
                    {editingFolder === folder.id ? (
                      <input
                        autoFocus
                        value={editFolderName}
                        onChange={e => setEditFolderName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEditFolder(folder.id); if (e.key === 'Escape') setEditingFolder(null); }}
                        onBlur={() => saveEditFolder(folder.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-full bg-ink-700 text-ink-100 text-xs px-1 py-0.5 rounded border border-ink-500 outline-none"
                      />
                    ) : (
                      <>
                        <FolderOpen size={20} className="text-ink-400 mb-1.5" />
                        <p className="text-ink-200 text-xs font-medium truncate">{folder.name}</p>
                        <p className="text-ink-600 text-[10px]">{count} file{count !== 1 ? 's' : ''}</p>
                        <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-1">
                          <button
                            onClick={e => { e.stopPropagation(); startEditFolder(folder); }}
                            className="text-ink-500 hover:text-ink-200 p-0.5"
                          >✏️</button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteFolder(folder.id); }}
                            className="text-red-500/70 hover:text-red-400 p-0.5"
                          ><Trash2 size={10} /></button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Files ── */}
        {state.filesLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-ink-600 border-t-ink-300 rounded-full animate-spin" />
            <p className="text-ink-500 text-sm">Loading library…</p>
          </div>
        ) : state.filesError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-red-400 text-sm">{state.filesError}</p>
            <button onClick={loadFiles} className="text-xs text-ink-400 hover:text-ink-200 underline">Try again</button>
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <BookOpen size={40} className="text-ink-700" />
            <p className="text-ink-500 text-sm">
              {state.activeSection === 'recent' ? 'No recently opened files' :
               state.activeSection === 'folder' ? 'No files in this folder yet' :
               activeTypeFilter === 'video' ? 'No videos in your library' :
               activeTypeFilter === 'pdf' ? 'No PDFs in your library' :
               'Your library is empty'}
            </p>
            <p className="text-ink-600 text-xs">
              {state.activeSection === 'library' ? 'Send files to your Telegram bot to get started' : ''}
            </p>
          </div>
        ) : isGridMode ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {displayFiles.map(file => (
              <FileCard key={file.id} file={file} progress={uploadProgress[file.id]} />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {displayFiles.map(file => (
              <FileCard key={file.id} file={file} progress={uploadProgress[file.id]} listMode />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
