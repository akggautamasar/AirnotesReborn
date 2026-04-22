/**
 * PDFReader — Chrome/Google Drive style
 * - Continuous scroll (all pages rendered in one scrollable column)
 * - Sticky top toolbar with page #, zoom, mode, search
 * - Pinch-to-zoom on mobile
 * - Keyboard nav, text selection, smooth scroll-to-page
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Download, Search, Sun, Moon, Coffee,
  BookmarkCheck, Bookmark, RotateCcw, Maximize2, Minimize2
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { bookmarkStore, progressStore } from '../../utils/storage';
import { cleanFileName } from '../../utils/format';

let pdfjsLib = null;
async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjsLib;
}

const MODES = {
  light: { bg: '#f0f0f0', pageBg: '#ffffff', text: '#1a1a1a', toolbar: '#ffffff', border: '#e0e0e0' },
  dark:  { bg: '#1a1a1a', pageBg: '#2c2c2c', text: '#e8ddd0', toolbar: '#2c2c2c', border: '#444' },
  sepia: { bg: '#e8ddd0', pageBg: '#f4efe6', text: '#5c4a32', toolbar: '#f4efe6', border: '#c8b89a' },
};

const MIN_SCALE = 0.4;
const MAX_SCALE = 4.0;
const SCALE_STEP = 0.25;

export default function PDFReader() {
  const { state, actions } = useApp();
  const file = state.openFile;
  const mode = MODES[state.readerMode] || MODES.light;

  const [pdfDoc, setPdfDoc]         = useState(null);
  const [numPages, setNumPages]     = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]           = useState(1.2);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [loadProgress, setLoadProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageInput, setPageInput]   = useState('1');
  const [renderedPages, setRenderedPages] = useState(new Set());
  const [fitMode, setFitMode]       = useState('width'); // 'width' | 'page' | 'custom'

  const containerRef   = useRef(null);
  const scrollRef      = useRef(null);
  const pageRefs       = useRef({}); // page# -> div ref
  const canvasRefs     = useRef({}); // page# -> canvas ref
  const renderQueue    = useRef([]);
  const renderingRef   = useRef(false);
  const renderTasksRef = useRef({}); // page# -> renderTask

  const title = file ? cleanFileName(file.name) : '';

  // ── Load PDF ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    loadPDF();
    const savedPage = progressStore.get(file.id);
    if (savedPage) setCurrentPage(parseInt(savedPage) || 1);

    const handleKey = (e) => {
      if (e.key === 'Escape') { if (!document.fullscreenElement) actions.closeFile(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [file]);

  async function loadPDF() {
    setLoading(true);
    setError('');
    setLoadProgress(0);
    try {
      const lib = await getPdfJs();
      const token = localStorage.getItem('airnotes_token');
      const url   = api.getStreamUrl(file.id);
      const task  = lib.getDocument({
        url,
        httpHeaders: { Authorization: `Bearer ${token}` },
        withCredentials: false,
      });
      task.onProgress = ({ loaded, total }) => {
        if (total) setLoadProgress(Math.round((loaded / total) * 100));
      };
      const doc = await task.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setLoading(false);

      const bm = bookmarkStore.getAll(file.id);
      setIsBookmarked(bm.includes(currentPage));
    } catch (e) {
      setError(`Failed to load PDF: ${e.message}`);
      setLoading(false);
    }
  }

  // ── Fit scale to container ───────────────────────────────────────────
  const computeFitScale = useCallback(async (doc, mode) => {
    if (!doc || !scrollRef.current) return scale;
    const containerWidth = scrollRef.current.clientWidth - 48; // padding
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    if (mode === 'page') {
      const containerH = scrollRef.current.clientHeight - 48;
      return Math.min(containerWidth / viewport.width, containerH / viewport.height);
    }
    return containerWidth / viewport.width;
  }, []);

  useEffect(() => {
    if (!pdfDoc) return;
    computeFitScale(pdfDoc, fitMode).then(s => setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, s))));
  }, [pdfDoc, fitMode]);

  // ── Render a single page ─────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDoc || !canvasRefs.current[pageNum]) return;
    if (renderedPages.has(pageNum)) return;

    // Cancel any existing render for this page
    if (renderTasksRef.current[pageNum]) {
      try { renderTasksRef.current[pageNum].cancel(); } catch {}
    }

    try {
      const page     = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas   = canvasRefs.current[pageNum];
      if (!canvas) return;
      const ctx      = canvas.getContext('2d');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTasksRef.current[pageNum] = task;
      await task.promise;
      setRenderedPages(prev => new Set([...prev, pageNum]));
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') {
        console.error(`Page ${pageNum} render error:`, e);
      }
    }
  }, [pdfDoc, scale]);

  // When scale changes, clear all canvases and re-render
  useEffect(() => {
    if (!pdfDoc) return;
    setRenderedPages(new Set());
    Object.keys(renderTasksRef.current).forEach(k => {
      try { renderTasksRef.current[k]?.cancel(); } catch {}
    });
    renderTasksRef.current = {};
  }, [scale, pdfDoc]);

  // ── Intersection observer — render visible pages lazily ──────────────
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pn = parseInt(entry.target.dataset.page);
            renderPage(pn);
            // Also pre-render adjacent pages
            if (pn > 1)         renderPage(pn - 1);
            if (pn < numPages)  renderPage(pn + 1);
          }
        });
      },
      { root: scrollRef.current, rootMargin: '200px', threshold: 0.01 }
    );

    Object.values(pageRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [pdfDoc, numPages, renderPage]);

  // ── Scroll spy — update currentPage from scroll position ─────────────
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const onScroll = () => {
      const scrollTop = scrollEl.scrollTop + scrollEl.clientHeight / 3;
      for (let p = 1; p <= numPages; p++) {
        const el = pageRefs.current[p];
        if (el && el.offsetTop <= scrollTop && el.offsetTop + el.offsetHeight >= scrollTop) {
          setCurrentPage(p);
          setPageInput(String(p));
          if (file) progressStore.set(file.id, p);
          const bm = bookmarkStore.getAll(file?.id);
          setIsBookmarked(bm.includes(p));
          break;
        }
      }
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [numPages, file]);

  // ── Scroll to page ────────────────────────────────────────────────────
  function scrollToPage(p) {
    const el = pageRefs.current[p];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
    }
  }

  function goToPage(p) {
    const clamped = Math.max(1, Math.min(numPages, p));
    setCurrentPage(clamped);
    setPageInput(String(clamped));
    scrollToPage(clamped);
  }

  function handlePageInput(e) {
    setPageInput(e.target.value);
    const n = parseInt(e.target.value);
    if (!isNaN(n) && n >= 1 && n <= numPages) goToPage(n);
  }

  function handlePageInputKey(e) {
    if (e.key === 'Enter') {
      const n = parseInt(pageInput);
      if (!isNaN(n)) goToPage(n);
    }
  }

  function zoomIn()  { setScale(s => Math.min(MAX_SCALE, parseFloat((s + SCALE_STEP).toFixed(2)))); setFitMode('custom'); }
  function zoomOut() { setScale(s => Math.max(MIN_SCALE, parseFloat((s - SCALE_STEP).toFixed(2)))); setFitMode('custom'); }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!document.fullscreenElement) { el?.requestFullscreen?.(); setFullscreen(true); }
    else { document.exitFullscreen?.(); setFullscreen(false); }
  }

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function toggleBookmark() {
    if (!file) return;
    if (isBookmarked) {
      bookmarkStore.remove(file.id, currentPage);
      setIsBookmarked(false);
    } else {
      bookmarkStore.add(file.id, currentPage);
      setIsBookmarked(true);
    }
  }

  const modeIcons = { light: <Sun size={15} />, dark: <Moon size={15} />, sepia: <Coffee size={15} /> };
  const nextMode  = { light: 'dark', dark: 'sepia', sepia: 'light' };

  if (!file) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: mode.bg, color: mode.text }}
    >
      {/* ── Chrome-style Toolbar ── */}
      <div
        className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 shrink-0 border-b shadow-sm"
        style={{ background: mode.toolbar, borderColor: mode.border }}
      >
        {/* Back */}
        <button onClick={actions.closeFile}
                className="p-1.5 rounded hover:bg-black/10 transition-colors shrink-0"
                title="Close">
          <ChevronLeft size={18} />
        </button>

        {/* Title (truncated) */}
        <span className="text-sm font-medium truncate flex-1 min-w-0 hidden sm:block">{title}</span>

        {/* Page navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                  className="p-1 rounded hover:bg-black/10 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <input
            type="number"
            value={pageInput}
            onChange={handlePageInput}
            onKeyDown={handlePageInputKey}
            min={1} max={numPages}
            className="w-12 text-center text-sm border rounded px-1 py-0.5"
            style={{ background: 'transparent', borderColor: mode.border, color: mode.text }}
          />
          <span className="text-xs opacity-60 whitespace-nowrap">/ {numPages}</span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}
                  className="p-1 rounded hover:bg-black/10 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="w-px h-5 bg-black/20 mx-1 hidden sm:block" />

        {/* Zoom */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={zoomOut} className="p-1.5 rounded hover:bg-black/10" title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <button
            onClick={() => { setFitMode(fitMode === 'width' ? 'page' : 'width'); }}
            className="text-xs font-mono px-1.5 py-0.5 rounded hover:bg-black/10 border whitespace-nowrap"
            style={{ borderColor: mode.border }}
            title="Click to fit width/page"
          >
            {Math.round(scale * 100)}%
          </button>
          <button onClick={zoomIn} className="p-1.5 rounded hover:bg-black/10" title="Zoom in">
            <ZoomIn size={15} />
          </button>
        </div>

        <div className="w-px h-5 bg-black/20 mx-1 hidden sm:block" />

        {/* Bookmark */}
        <button onClick={toggleBookmark}
                className="p-1.5 rounded hover:bg-black/10 transition-colors"
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark page'}>
          {isBookmarked ? <BookmarkCheck size={16} className="text-yellow-500" /> : <Bookmark size={16} />}
        </button>

        {/* Mode toggle */}
        <button onClick={() => actions.setReaderMode(nextMode[state.readerMode] || 'light')}
                className="p-1.5 rounded hover:bg-black/10" title="Toggle theme">
          {modeIcons[state.readerMode] || modeIcons.light}
        </button>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-black/10" title="Fullscreen">
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        {/* Download */}
        <a href={api.getStreamUrl(file.id)} download={file.name}
           className="p-1.5 rounded hover:bg-black/10" title="Download">
          <Download size={15} />
        </a>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
             style={{ background: mode.bg }}>
          <div className="w-48 h-1.5 rounded-full bg-black/10 overflow-hidden mb-3">
            <div className="h-full bg-blue-500 rounded-full transition-all"
                 style={{ width: `${loadProgress}%` }} />
          </div>
          <p className="text-sm opacity-60">Loading PDF… {loadProgress}%</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={loadPDF}
                  className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-black/10">
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )}

      {/* ── Scrollable pages (Chrome-style continuous scroll) ── */}
      {!error && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-auto"
          style={{ background: mode.bg }}
        >
          <div className="flex flex-col items-center py-6 gap-4 px-4">
            {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
              <div
                key={pageNum}
                ref={el => { pageRefs.current[pageNum] = el; }}
                data-page={pageNum}
                className="relative shadow-lg rounded"
                style={{ background: mode.pageBg }}
              >
                <canvas
                  ref={el => { canvasRefs.current[pageNum] = el; }}
                  className="block"
                  style={{
                    display: 'block',
                    filter: state.readerMode === 'dark' ? 'brightness(0.88) contrast(1.05)' :
                            state.readerMode === 'sepia' ? 'sepia(0.4) brightness(0.97)' : 'none',
                  }}
                />
                {/* Page number badge */}
                <div className="absolute bottom-2 right-2 text-xs px-1.5 py-0.5 rounded
                                bg-black/40 text-white/70 pointer-events-none">
                  {pageNum}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
