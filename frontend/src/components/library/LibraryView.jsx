import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Grid, List, RefreshCw, AlertCircle, BookOpen, Loader2, Zap } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { progressStore, recentStore } from '../../utils/storage';
import FileCard from './FileCard';

export default function LibraryView() {
  const { state, actions } = useApp();
  const [progresses, setProgresses] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const pollRef = useRef(null);
  const sseRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    loadFiles();
    loadFolders();
    loadLocalProgress();
    const cleanup = connectSSE();
    return () => {
      clearInterval(pollRef.current);
      cleanup?.();
    };
  }, []);

  // ── SSE: instant push when bot uploads a file ─────────────────────────
  function connectSSE() {
    const token = localStorage.getItem('airnotes_token');
    if (!token) return;

    const BASE_URL = import.meta.env.VITE_API_URL || '/api';
    const url = `${BASE_URL}/events?token=${encodeURIComponent(token)}`;

    let es;
    let retryTimer;

    function connect() {
      if (sseRef.current) sseRef.current.close();
      es = new EventSource(url);
      sseRef.current = es;

      es.onopen = () => setSseConnected(true);

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.event === 'new_file' && payload.file) {
            const file = payload.file;
            // Prepend to files list immediately — no page reload
            const current = stateRef.current.files;
            if (!current.find(f => f.id === file.id)) {
              actions.setFiles([file, ...current]);
            }
            // Update folder assignment if set
            if (file.folder_id) {
              actions.setFileAssignments({
                ...stateRef.current.fileAssignments,
                [file.id]: file.folder_id,
              });
            }
          }
        } catch (_) {}
      };

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimer);
      if (es) es.close();
    };
  }

  async function loadFiles() {
    actions.setFilesLoading(true);
    try {
      const res = await api.getFiles();
      actions.setFiles(res.files || []);
      if (res.refresh_in_progress) {
        setBackgroundRefreshing(true);
        startPolling();
      } else {
        setBackgroundRefreshing(false);
      }
    } catch (e) {
      actions.setFilesError(e.message);
    }
  }

  // ── Load folders + assignments from BACKEND (not local IndexedDB) ─────
  async function loadFolders() {
    try {
      const [foldersRes, assignmentsRes] = await Promise.all([
        api.getFolders(),
        api.getFileAssignments(),
      ]);

      const folders = (foldersRes.folders || []).map(f => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id || null,
        createdAt: f.created_at,
        fileCount: f.file_count || 0,
      }));
      actions.setFolders(folders);
      actions.setFileAssignments(assignmentsRes.assignments || {});
    } catch (e) {
      console.error('Load folders failed:', e);
    }
  }

  async function loadAssignmentsFromFolders(folders) {
    const assignMap = {};
    await Promise.all(
      folders.map(async folder => {
        try {
          const res = await api.getFolderFiles(folder.id);
          for (const file of (res.files || [])) {
            assignMap[file.id] = folder.id;
          }
        } catch (_) {}
      })
    );
    actions.setFileAssignments(assignMap);
  }

  async function loadLocalProgress() {
    const allProgress = await progressStore.getAll();
    const map = {};
    for (const p of allProgress) map[p.fileId] = p;
    setProgresses(map);
    const recent = await recentStore.getAll(20);
    actions.setRecent(recent);
  }

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getFiles();
        actions.setFiles(res.files || []);
        if (!res.refresh_in_progress) {
          setBackgroundRefreshing(false);
          clearInterval(pollRef.current);
        }
      } catch (_) {}
    }, 3000);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await api.refresh();
      setBackgroundRefreshing(true);
      startPolling();
      await loadFolders();
    } catch (e) {
      await loadFiles();
    }
    setRefreshing(false);
  }

  const displayedFiles = useMemo(() => {
    if (state.activeSection === 'search') return state.searchResults;
    if (state.activeSection === 'recent') {
      const ids = state.recentFiles.map(r => r.fileId);
      return ids.map(id => state.files.find(f => f.id === id)).filter(Boolean);
    }
    if (state.activeSection === 'folder' && state.activeFolderId) {
      const inFolder = Object.entries(state.fileAssignments)
        .filter(([, fid]) => fid === state.activeFolderId)
        .map(([fileId]) => fileId);
      return state.files.filter(f => inFolder.includes(f.id));
    }
    return state.files;
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
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h2 className="font-display text-lg md:text-xl font-semibold text-paper-100">{sectionTitle}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-ink-500 text-xs md:text-sm">
              {displayedFiles.length} {displayedFiles.length === 1 ? 'document' : 'documents'}
            </p>
            {backgroundRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Loader2 size={11} className="animate-spin" />
                syncing…
              </span>
            )}
            {sseConnected && !backgroundRefreshing && (
              <span className="flex items-center gap-1 text-xs text-emerald-400" title="Live — bot uploads appear instantly">
                <Zap size={11} className="fill-emerald-400" />
                live
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={refreshing || backgroundRefreshing}
            className="p-2 text-ink-500 hover:text-ink-200 rounded-lg hover:bg-ink-800/50 transition-all" title="Refresh">
            <RefreshCw size={15} className={(refreshing || backgroundRefreshing) ? 'animate-spin' : ''} />
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

      {state.filesLoading && (
        <div className={state.viewMode === 'grid'
          ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4'
          : 'space-y-1'}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} list={state.viewMode === 'list'} />)}
        </div>
      )}

      {state.filesError && !state.filesLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={32} className="text-red-400 mb-3" />
          <p className="text-ink-300 mb-1 font-medium">Failed to load files</p>
          <p className="text-ink-500 text-sm mb-4">{state.filesError}</p>
          <button onClick={loadFiles} className="btn-primary text-sm">Retry</button>
        </div>
      )}

      {!state.filesLoading && !state.filesError && displayedFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen size={40} className="text-ink-700 mb-4" />
          <p className="text-ink-400 font-medium mb-1">
            {backgroundRefreshing
              ? 'Loading your files from Telegram…'
              : state.activeSection === 'folder'
                ? 'This folder is empty'
                : 'No files found'}
          </p>
          <p className="text-ink-600 text-sm">
            {backgroundRefreshing
              ? 'Files will appear automatically.'
              : state.activeSection === 'folder'
                ? 'Upload to this folder via bot with /set_folder, or assign files here from the library'
                : 'Add PDF or video files to your Telegram channel'}
          </p>
          {backgroundRefreshing && <Loader2 size={20} className="animate-spin text-ink-600 mt-4" />}
        </div>
      )}

      {!state.filesLoading && !state.filesError && displayedFiles.length > 0 && state.viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 animate-fade-in">
          {displayedFiles.map(file => (
            <FileCard key={file.id} file={file} progress={progresses[file.id]} />
          ))}
        </div>
      )}

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
