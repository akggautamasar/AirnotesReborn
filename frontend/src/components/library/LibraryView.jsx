import React, { useEffect, useState, useMemo } from 'react';
import { Grid, List, RefreshCw, AlertCircle, BookOpen } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { progressStore, folderStore, recentStore } from '../../utils/storage';
import FileCard from './FileCard';

export default function LibraryView() {
  const { state, actions } = useApp();
  const [progresses, setProgresses] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFiles();
    loadLocalData();
  }, []);

  async function loadFiles() {
    actions.setFilesLoading(true);
    try {
      const res = await api.getFiles();
      actions.setFiles(res.files || []);
    } catch (e) {
      actions.setFilesError(e.message);
    }
  }

  async function loadLocalData() {
    const allProgress = await progressStore.getAll();
    const map = {};
    for (const p of allProgress) map[p.fileId] = p;
    setProgresses(map);

    const folders = await folderStore.getAll();
    actions.setFolders(folders);

    const assignments = await folderStore.getAllAssignments();
    const assignMap = {};
    for (const a of assignments) assignMap[a.fileId] = a.folderId;
    actions.setFileAssignments(assignMap);

    const recent = await recentStore.getAll(20);
    actions.setRecent(recent);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await api.refresh();
      await loadFiles();
    } catch (e) {
      await loadFiles();
    }
    setRefreshing(false);
  }

  const displayedFiles = useMemo(() => {
    let files = state.files;
    if (state.activeSection === 'search') return state.searchResults;
    if (state.activeSection === 'recent') {
      const ids = state.recentFiles.map(r => r.fileId);
      return ids.map(id => state.files.find(f => f.id === id)).filter(Boolean);
    }
    if (state.activeSection === 'folder' && state.activeFolderId) {
      const inFolder = Object.entries(state.fileAssignments)
        .filter(([, fid]) => fid === state.activeFolderId).map(([fileId]) => fileId);
      return files.filter(f => inFolder.includes(f.id));
    }
    return files;
  }, [state.files, state.activeSection, state.searchResults, state.recentFiles, state.activeFolderId, state.fileAssignments]);

  const sectionTitle = useMemo(() => {
    if (state.activeSection === 'search') return `Results for "${state.searchQuery}"`;
    if (state.activeSection === 'recent') return 'Recently Opened';
    if (state.activeSection === 'folder' && state.activeFolderId) {
      const f = state.folders.find(f => f.id === state.activeFolderId);
      return f ? `📁 ${f.name}` : 'Folder';
    }
    return 'My Library';
  }, [state.activeSection, state.searchQuery, state.activeFolderId, state.folders]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h2 className="font-display text-lg md:text-xl font-semibold text-paper-100">{sectionTitle}</h2>
          <p className="text-ink-500 text-xs md:text-sm mt-0.5">
            {displayedFiles.length} {displayedFiles.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={refreshing}
            className="p-2 text-ink-500 hover:text-ink-200 rounded-lg hover:bg-ink-800/50 transition-all" title="Refresh">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <div className="flex bg-ink-900 border border-ink-800/50 rounded-lg p-0.5">
            {[['grid', Grid], ['list', List]].map(([mode, Icon]) => (
              <button key={mode} onClick={() => actions.setViewMode(mode)}
                className={`p-1.5 rounded-md transition-all ${state.viewMode === mode ? 'bg-ink-700 text-ink-100' : 'text-ink-500 hover:text-ink-300'}`}>
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading skeletons */}
      {state.filesLoading && (
        <div className={state.viewMode === 'grid'
          ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4'
          : 'space-y-1'}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} list={state.viewMode === 'list'} />)}
        </div>
      )}

      {/* Error */}
      {state.filesError && !state.filesLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={32} className="text-red-400 mb-3" />
          <p className="text-ink-300 mb-1 font-medium">Failed to load files</p>
          <p className="text-ink-500 text-sm mb-4">{state.filesError}</p>
          <button onClick={loadFiles} className="btn-primary text-sm">Retry</button>
        </div>
      )}

      {/* Empty */}
      {!state.filesLoading && !state.filesError && displayedFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen size={40} className="text-ink-700 mb-4" />
          <p className="text-ink-400 font-medium mb-1">
            {state.activeSection === 'folder' ? 'This folder is empty' : 'No PDFs found'}
          </p>
          <p className="text-ink-600 text-sm">
            {state.activeSection === 'folder' ? 'Assign PDFs to this folder from the library' : 'Add PDF files to your Telegram channel'}
          </p>
        </div>
      )}

      {/* Grid */}
      {!state.filesLoading && !state.filesError && displayedFiles.length > 0 && state.viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 animate-fade-in">
          {displayedFiles.map(file => (
            <FileCard key={file.id} file={file} progress={progresses[file.id]} />
          ))}
        </div>
      )}

      {/* List */}
      {!state.filesLoading && !state.filesError && displayedFiles.length > 0 && state.viewMode === 'list' && (
        <div className="space-y-0.5 animate-fade-in">
          <div className="hidden md:flex items-center gap-4 px-4 py-2 text-[11px] font-medium text-ink-600 uppercase tracking-wider">
            <div className="w-8" /><div className="flex-1">Title</div>
            <div className="w-20 text-right">Size</div><div className="w-24 text-right">Added</div>
            <div className="w-20 text-right">Progress</div><div className="w-6" />
          </div>
          {displayedFiles.map(file => (
            <FileCard key={file.id} file={file} progress={progresses[file.id]} listMode />
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonCard({ list }) {
  if (list) return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl">
      <div className="w-8 h-10 rounded-lg shimmer flex-shrink-0" />
      <div className="flex-1"><div className="h-3 w-3/4 rounded shimmer mb-1.5" /><div className="h-2 w-1/2 rounded shimmer" /></div>
    </div>
  );
  return (
    <div className="rounded-2xl overflow-hidden border border-ink-800/30">
      <div className="h-36 shimmer" />
      <div className="p-3"><div className="h-3 w-3/4 rounded shimmer mb-1.5" /><div className="h-2 w-1/2 rounded shimmer" /></div>
    </div>
  );
}
