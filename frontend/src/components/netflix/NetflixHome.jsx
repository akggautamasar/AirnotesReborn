import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { progressStore, recentStore } from '../../utils/storage';
import { generateThumbnailsBatch } from '../../utils/thumbnails';
import Navbar from './Navbar';
import HeroBanner from './HeroBanner';
import ContentRow from './ContentRow';
import SearchOverlay from './SearchOverlay';
import SkeletonRows from './SkeletonRows';

// ── Subject keyword groups ───────────────────────────────────────────────────
const SUBJECT_PATTERNS = {
  '⚗️ Chemistry':   /chem|organic|inorganic|mol|bond|acid|base|reaction|periodic/i,
  '🔬 Physics':     /phys|newton|quantum|mechanics|optics|wave|force|energy|electric|magnet/i,
  '🧮 Mathematics': /math|calculus|algebra|geometry|trig|stat|prob|differential|linear/i,
  '🧬 Biology':     /bio|cell|gene|dna|rna|protein|evolution|ecology|anatomy|physiology/i,
  '💻 Computer Science': /cs|code|program|algo|data struct|network|os|database|software|machine learn|ai|ml/i,
  '📚 History':     /hist|war|revolution|empire|dynasty|civilization|ancient|medieval|modern/i,
  '🌍 Geography':   /geo|country|continent|climate|map|region|earth|terrain/i,
  '💰 Economics':   /econ|market|supply|demand|gdp|trade|finance|micro|macro/i,
  '🧠 Psychology':  /psych|behavior|cognit|mental|emotion|memory|learning|freud/i,
  '✍️ Literature':  /lit|novel|poem|poetry|drama|fiction|author|english|essay|write/i,
};

function groupBySubject(files) {
  const groups = {};
  for (const file of files) {
    const name = (file.name || '').toLowerCase();
    for (const [subject, pattern] of Object.entries(SUBJECT_PATTERNS)) {
      if (pattern.test(name)) {
        if (!groups[subject]) groups[subject] = [];
        groups[subject].push(file);
        break;
      }
    }
  }
  return groups;
}

const FAVORITES_KEY = 'airnotes_favorites';

function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}'); } catch { return {}; }
}
function saveFavs(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

// ── Component ────────────────────────────────────────────────────────────────
export default function NetflixHome() {
  const { state, actions } = useApp();
  const [progresses, setProgresses] = useState({});
  const [thumbnails, setThumbnails] = useState({});
  const [thumbLoading, setThumbLoading] = useState(false);
  const [favorites, setFavorites] = useState(loadFavs);
  const [searchResults, setSearchResults] = useState(null); // null = no search active
  const pollRef = useRef(null);
  const sseRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadFiles();
    loadFolders();
    loadLocalProgress();
    const cleanup = connectSSE();
    return () => { clearInterval(pollRef.current); cleanup?.(); };
  }, []);

  // Generate thumbnails once files are loaded (first batch only)
  useEffect(() => {
    if (state.files.length === 0 || thumbLoading) return;
    const pdfFiles = state.files.filter(f => (f.type || 'pdf') === 'pdf').slice(0, 30);
    const missing = pdfFiles.filter(f => !thumbnails[f.id]);
    if (missing.length === 0) return;

    setThumbLoading(true);
    generateThumbnailsBatch(
      missing,
      api.getStreamUrl,
      api.authHeaders(),
    ).then(newThumbs => {
      setThumbnails(prev => ({ ...prev, ...newThumbs }));
      setThumbLoading(false);
    }).catch(() => setThumbLoading(false));
  }, [state.files]);

  // ── SSE ───────────────────────────────────────────────────────────────────
  function connectSSE() {
    const token = localStorage.getItem('airnotes_token');
    if (!token) return;
    const BASE_URL = import.meta.env.VITE_API_URL || '/api';
    let es, retryTimer;

    function connect() {
      if (sseRef.current) sseRef.current.close();
      es = new EventSource(`${BASE_URL}/events?token=${encodeURIComponent(token)}`);
      sseRef.current = es;
      es.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.event === 'new_file' && p.file) {
            const cur = stateRef.current.files;
            if (!cur.find(f => f.id === p.file.id)) actions.setFiles([p.file, ...cur]);
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 5000);
      };
    }
    connect();
    return () => { clearTimeout(retryTimer); if (es) es.close(); };
  }

  async function loadFiles() {
    actions.setFilesLoading(true);
    try {
      const res = await api.getFiles();
      actions.setFiles(res.files || []);
      if (res.refresh_in_progress) {
        pollRef.current = setInterval(async () => {
          try {
            const r = await api.getFiles();
            actions.setFiles(r.files || []);
            if (!r.refresh_in_progress) clearInterval(pollRef.current);
          } catch {}
        }, 3000);
      }
    } catch (e) { actions.setFilesError(e.message); }
  }

  async function loadFolders() {
    try {
      const [fr, ar] = await Promise.all([api.getFolders(), api.getFileAssignments()]);
      const folders = (fr.folders || []).map(f => ({ id: f.id, name: f.name, parentId: f.parent_id, createdAt: f.created_at, fileCount: f.file_count || 0 }));
      actions.setFolders(folders);
      actions.setFileAssignments(ar.assignments || {});
    } catch {}
  }

  async function loadLocalProgress() {
    const all = await progressStore.getAll();
    const map = {};
    for (const p of all) map[p.fileId] = p;
    setProgresses(map);
    const recent = await recentStore.getAll(20);
    actions.setRecent(recent);
  }

  // ── Open a file ───────────────────────────────────────────────────────────
  async function handleOpen(file) {
    await recentStore.add(file.id, file.name);
    actions.addRecent({ fileId: file.id, fileName: file.name });
    actions.openFile(file);
  }

  // ── Favorites ─────────────────────────────────────────────────────────────
  function toggleFav(fileId) {
    setFavorites(prev => {
      const next = { ...prev };
      if (next[fileId]) delete next[fileId];
      else next[fileId] = Date.now();
      saveFavs(next);
      return next;
    });
  }

  // ── File actions ──────────────────────────────────────────────────────────
  async function handleDelete(fileId) {
    if (!confirm('Delete this note?')) return;
    try {
      await api.deleteFile(fileId);
      actions.setFiles(state.files.filter(f => f.id !== fileId));
    } catch (e) { alert('Delete failed: ' + e.message); }
  }

  async function handleCopy(fileId) {
    try {
      const res = await api.copyFile(fileId);
      if (res.file) actions.setFiles([res.file, ...state.files]);
    } catch (e) { alert('Copy failed: ' + e.message); }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const pdfFiles = useMemo(() => state.files.filter(f => (f.type || 'pdf') === 'pdf'), [state.files]);

  const continueReading = useMemo(() => {
    const recentIds = state.recentFiles.map(r => r.fileId);
    return recentIds
      .map(id => pdfFiles.find(f => f.id === id))
      .filter(Boolean)
      .slice(0, 20);
  }, [pdfFiles, state.recentFiles]);

  const recentlyAdded = useMemo(() =>
    [...pdfFiles].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 20),
    [pdfFiles]
  );

  const favFiles = useMemo(() =>
    pdfFiles.filter(f => !!favorites[f.id]),
    [pdfFiles, favorites]
  );

  const subjectGroups = useMemo(() => groupBySubject(pdfFiles), [pdfFiles]);

  const sharedProps = { progresses, thumbnails, favorites, onOpen: handleOpen, onToggleFav: toggleFav, onDelete: handleDelete, onCopy: handleCopy };

  const loading = state.filesLoading && pdfFiles.length === 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] overflow-x-hidden">
      <Navbar onSearchResults={setSearchResults} />

      {/* Search overlay */}
      {searchResults !== null ? (
        <div className="pt-20">
          <SearchOverlay
            results={searchResults}
            query=""
            {...sharedProps}
          />
        </div>
      ) : (
        <>
          {/* Hero */}
          {!loading && (
            <HeroBanner
              onOpen={handleOpen}
              thumbnails={thumbnails}
              favorites={favorites}
              onToggleFav={toggleFav}
            />
          )}

          {/* Content rows */}
          <div className="relative z-10 pb-16" style={{ marginTop: loading ? '80px' : '-20px' }}>
            {loading ? (
              <div className="pt-20">
                <SkeletonRows count={4} />
              </div>
            ) : (
              <>
                {continueReading.length > 0 && (
                  <ContentRow title="▶ Continue Reading" files={continueReading} {...sharedProps} />
                )}

                <ContentRow
                  title="🕐 Recently Added"
                  files={recentlyAdded}
                  emptyMessage="No files yet. Upload PDFs via Telegram."
                  {...sharedProps}
                />

                {favFiles.length > 0 && (
                  <ContentRow title="⭐ Favorites" files={favFiles} {...sharedProps} />
                )}

                {/* Subject rows */}
                {Object.entries(subjectGroups).map(([subject, files]) => (
                  <ContentRow key={subject} title={subject} files={files} {...sharedProps} />
                ))}

                {/* Separator + All Notes */}
                {pdfFiles.length > 0 && (
                  <>
                    <div className="mx-8 md:mx-14 my-6 border-t border-white/5" />
                    <ContentRow title="📚 All Notes" files={pdfFiles} {...sharedProps} />
                  </>
                )}

                {/* Empty state */}
                {pdfFiles.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-32 text-center px-8">
                    <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-4xl">
                      📖
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">No notes yet</h3>
                    <p className="text-gray-500 max-w-sm">
                      Upload PDFs via your Telegram bot and they'll appear here automatically.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
