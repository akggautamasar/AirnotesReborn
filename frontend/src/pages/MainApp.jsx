import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import { api } from '../utils/api';
import Sidebar from '../components/Sidebar';
import LibraryView from '../components/library/LibraryView';
import PDFReader from '../components/reader/PDFReader';
import VideoPlayer from '../components/reader/VideoPlayer';
import SearchModal from '../components/ui/SearchModal';
import { Menu } from 'lucide-react';

const POLL_INTERVAL = 5000; // 5 seconds — detect new Telegram uploads fast

export default function MainApp() {
  const { state, actions } = useApp();
  const [showSearch, setShowSearch]   = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastCountRef = useRef(0);
  const pollTimerRef = useRef(null);

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    api.verify().catch(() => actions.logout());
    loadFiles();
    loadFolders();
    loadFileAssignments();
  }, []);

  async function loadFiles() {
    actions.setFilesLoading(true);
    try {
      const data = await api.getFiles();
      actions.setFiles(data.files || []);
      lastCountRef.current = (data.files || []).length;
    } catch (e) {
      actions.setFilesError(e.message);
    }
  }

  async function loadFolders() {
    try {
      const data = await api.getFolders();
      // Normalise key names (backend returns snake_case)
      const folders = (data.folders || []).map(f => ({
        id: f.id, name: f.name, parentId: f.parent_id, createdAt: f.created_at,
        fileCount: f.file_count || 0,
      }));
      actions.setFolders(folders);
    } catch (e) {
      console.warn('Could not load folders:', e);
    }
  }

  async function loadFileAssignments() {
    // We don't have a dedicated /api/assignments endpoint — we re-derive from
    // all files and their folder assignments by fetching with no filter, then
    // use folder endpoint to get per-folder file IDs.
    try {
      const foldersData = await api.getFolders();
      const assignments = {};
      for (const folder of (foldersData.folders || [])) {
        const fd = await api.getFolderFiles(folder.id);
        for (const file of (fd.files || [])) {
          assignments[file.id] = folder.id;
        }
      }
      actions.setFileAssignments(assignments);
    } catch (e) {
      // non-critical
    }
  }

  // ── Real-time polling — detect new uploads instantly ─────────────────
  useEffect(() => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const data = await api.getFiles();
        const files = data.files || [];
        if (files.length !== lastCountRef.current) {
          // New file uploaded! Update the library immediately.
          actions.setFiles(files);
          lastCountRef.current = files.length;
        }
      } catch {
        // ignore poll errors silently
      }
    }, POLL_INTERVAL);
    return () => clearInterval(pollTimerRef.current);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!state.openFile) setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.openFile]);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [state.activeSection, state.activeFolderId]);

  const openedFileType = state.openFile?.type || 'pdf';
  const showPDF   = state.openFile && openedFileType === 'pdf';
  const showVideo = state.openFile && openedFileType === 'video';

  return (
    <div className="h-screen flex overflow-hidden bg-ink-950">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden"
             onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed md:relative z-50 md:z-auto h-full transition-transform duration-300
                       ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <Sidebar
          onSearch={() => { setShowSearch(true); setSidebarOpen(false); }}
          onFolderCreated={loadFolders}
          onFolderChanged={loadFolders}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center gap-3 px-4 py-3 border-b border-ink-800/60 bg-ink-950">
          <button onClick={() => setSidebarOpen(true)} className="text-ink-400 hover:text-ink-100 p-1">
            <Menu size={20} />
          </button>
          <span className="font-display font-bold text-paper-100">AirNotes 2.0</span>
          <button onClick={() => setShowSearch(true)} className="ml-auto text-ink-400 hover:text-ink-100 p-1">
            🔍
          </button>
        </div>
        <LibraryView />
      </div>

      {showPDF   && <PDFReader />}
      {showVideo && <VideoPlayer />}
      {showSearch && !state.openFile && <SearchModal onClose={() => setShowSearch(false)} />}
    </div>
  );
}
