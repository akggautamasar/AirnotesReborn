import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Bookmark, BookmarkCheck, Highlighter, MessageSquare, Sun, Moon,
  Coffee, Layers, Menu, RotateCcw, Download
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { highlightStore, bookmarkStore, progressStore } from '../../utils/storage';
import { cleanFileName } from '../../utils/format';
import ThumbnailSidebar from './ThumbnailSidebar';
import AnnotationSidebar from './AnnotationSidebar';

// PDF.js — uses local worker (no CDN, no 20MB limit)
let pdfjsLib = null;
async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjsLib;
}

const MODES = {
  dark:  { bg: '#0e0b08', pageBg: '#161210', text: '#e8ddd0', filter: 'brightness(0.88) contrast(1.05)' },
  sepia: { bg: '#f4efe6', pageBg: '#ede8de', text: '#5c4a32', filter: 'sepia(0.4) brightness(0.97)' },
  light: { bg: '#ffffff', pageBg: '#e8e8e8', text: '#1a1a1a', filter: 'none' },
};

export default function PDFReader() {
  const { state, actions } = useApp();
  const file = state.openFile;
  const mode = MODES[state.readerMode] || MODES.dark;

  const [pdfDoc, setPdfDoc]       = useState(null);
  const [numPages, setNumPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]         = useState(1.2);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [loadProgress, setLoadProgress] = useState(0);

  const [fullscreen, setFullscreen]       = useState(false);
  const [showThumbs, setShowThumbs]       = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showMobileMenu, setShowMobileMenu]   = useState(false);
  const [isBookmarked, setIsBookmarked]   = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlightColor, setHighlightColor] = useState('yellow');
  const [highlights, setHighlights]       = useState([]);
  const [bookmarks, setBookmarks]         = useState([]);

  const isMobile = window.innerWidth < 768;

  const canvasRef    = useRef(null);
  const textLayerRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Auto-scale on mount
  useEffect(() => {
    const w = window.innerWidth;
    if (w < 480)       setScale(0.65);
    else if (w < 768)  setScale(0.85);
    else if (w < 1024) setScale(1.1);
    else               setScale(1.3);
  }, []);

  // Load PDF on open
  useEffect(() => {
    if (!file) return;
    loadPDF();
    loadAnnotations();
    restoreProgress();

    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setCurrentPage(p => Math.min(p + 1, numPages));
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setCurrentPage(p => Math.max(p - 1, 1));
      if (e.key === 'Escape') actions.closeFile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file]);

  // Touch swipe
  useEffect(() => {
    let startX = 0;
    const onStart = (e) => { startX = e.touches[0].clientX; };
    const onEnd   = (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 60) setCurrentPage(p => dx < 0 ? Math.min(p + 1, numPages) : Math.max(p - 1, 1));
    };
    const el = containerRef.current;
    el?.addEventListener('touchstart', onStart, { passive: true });
    el?.addEventListener('touchend', onEnd, { passive: true });
    return () => { el?.removeEventListener('touchstart', onStart); el?.removeEventListener('touchend', onEnd); };
  }, [numPages]);

  async function loadPDF() {
    setLoading(true);
    setError('');
    setLoadProgress(0);
    try {
      const lib = await getPdfJs();
      const streamUrl = api.getStreamUrl(file.id);

      const task = lib.getDocument({
        url: streamUrl,
        httpHeaders: api.authHeaders(),
        withCredentials: false,
        rangeChunkSize: 131072, // 128 KB — works well for MTProto streaming
        disableAutoFetch: false,
        disableStream: false,
      });

      task.onProgress = ({ loaded, total }) => {
        if (total) setLoadProgress(Math.round((loaded / total) * 100));
      };

      const doc = await task.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setLoading(false);
    } catch (e) {
      console.error('PDF load error:', e);
      setError(e.message || 'Failed to load PDF');
      setLoading(false);
    }
  }

  async function loadAnnotations() {
    const hl = await highlightStore.getByFile(file.id);
    const bm = await bookmarkStore.getByFile(file.id);
    setHighlights(hl);
    setBookmarks(bm);
    actions.setHighlights(file.id, hl);
    actions.setBookmarks(file.id, bm);
  }

  async function restoreProgress() {
    const prog = await progressStore.get(file.id);
    if (prog?.currentPage > 1) setCurrentPage(prog.currentPage);
  }

  // Render page whenever page/scale/mode changes
  useEffect(() => {
    if (pdfDoc && canvasRef.current) renderPage(currentPage);
  }, [pdfDoc, currentPage, scale, state.readerMode]);

  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDoc || !canvasRef.current) return;
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;

      // Text layer for selection / highlighting
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.width  = `${viewport.width}px`;
        textLayerRef.current.style.height = `${viewport.height}px`;
        const textContent = await page.getTextContent();
        const lib = await getPdfJs();
        if (lib.renderTextLayer) {
          lib.renderTextLayer({ textContentSource: textContent, container: textLayerRef.current, viewport, textDivs: [] });
        }
      }

      await progressStore.save(file.id, pageNum, pdfDoc.numPages);
      setIsBookmarked(await bookmarkStore.isBookmarked(file.id, pageNum));
    } catch (e) {
      if (e.name !== 'RenderingCancelledException') console.error('Render error:', e);
    }
  }, [pdfDoc, scale, state.readerMode, file]);

  const goTo   = (n) => setCurrentPage(Math.max(1, Math.min(n, numPages)));
  const zoomIn  = () => setScale(s => Math.min(s + 0.2, 4.0));
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.4));
  const resetZoom = () => setScale(window.innerWidth < 768 ? 0.85 : 1.3);

  function toggleFullscreen() {
    if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setFullscreen(true); }
    else { document.exitFullscreen(); setFullscreen(false); }
  }

  async function toggleBookmark() {
    if (isBookmarked) {
      await bookmarkStore.remove(file.id, currentPage);
      setIsBookmarked(false);
      setBookmarks(prev => prev.filter(b => b.page !== currentPage));
    } else {
      await bookmarkStore.add(file.id, currentPage, `Page ${currentPage}`);
      setIsBookmarked(true);
      setBookmarks(await bookmarkStore.getByFile(file.id));
    }
  }

  async function handleTextSelection() {
    if (!highlightMode) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2) return;
    const id = await highlightStore.add(file.id, currentPage, text, highlightColor);
    const newHL = { id, fileId: file.id, page: currentPage, text, color: highlightColor, createdAt: Date.now() };
    setHighlights(prev => [...prev, newHL]);
    actions.addHighlight(file.id, newHL);
    selection.removeAllRanges();
  }

  async function deleteHighlight(id) {
    await highlightStore.delete(id);
    setHighlights(prev => prev.filter(h => h.id !== id));
    actions.removeHighlight(file.id, id);
  }

  const progress    = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;
  const borderColor = state.readerMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
  const title       = cleanFileName(file.name);

  if (!file) return null;

  const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'];
  const COLOR_HEX = { yellow: '#fbbf24', green: '#4ade80', blue: '#60a5fa', pink: '#fb7185' };

  const ModeBtn = ({ modeKey, Icon }) => (
    <button
      onClick={() => actions.setReaderMode(modeKey)}
      className={`p-1.5 rounded-md transition-all ${state.readerMode === modeKey ? 'bg-white/20 opacity-100' : 'opacity-40 hover:opacity-70'}`}
    >
      <Icon size={13} />
    </button>
  );

  return (
    <div ref={containerRef} className="fixed inset-0 z-40 flex flex-col" style={{ background: mode.bg, color: mode.text }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-2 md:px-4 py-2 border-b flex-shrink-0" style={{ borderColor }}>
        <button onClick={() => actions.closeFile()} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors opacity-60 hover:opacity-100 flex-shrink-0">
          <X size={16} />
        </button>

        <div className="flex-1 min-w-0 px-1 md:px-2">
          <p className="text-xs md:text-sm font-medium truncate opacity-80">{title}</p>
          <p className="text-[9px] md:text-[10px] opacity-40 hidden sm:block">{currentPage} / {numPages} · {progress}%</p>
        </div>

        {/* Desktop toolbar */}
        <div className="hidden md:flex items-center gap-1">
          {/* Mode switcher */}
          <div className="flex items-center gap-0.5 bg-black/10 rounded-lg p-0.5">
            <ModeBtn modeKey="dark"  Icon={Moon} />
            <ModeBtn modeKey="sepia" Icon={Coffee} />
            <ModeBtn modeKey="light" Icon={Sun} />
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-black/10 rounded-lg px-2 py-1">
            <button onClick={zoomOut} className="opacity-60 hover:opacity-100"><ZoomOut size={13} /></button>
            <button onClick={resetZoom} className="text-xs font-mono opacity-70 hover:opacity-100 w-10 text-center">
              {Math.round(scale * 100)}%
            </button>
            <button onClick={zoomIn} className="opacity-60 hover:opacity-100"><ZoomIn size={13} /></button>
          </div>

          <button onClick={toggleBookmark} className={`p-1.5 rounded-lg transition-all ${isBookmarked ? 'text-amber-400' : 'opacity-50 hover:opacity-100'}`}>
            {isBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>

          <button onClick={() => setHighlightMode(!highlightMode)}
            className={`p-1.5 rounded-lg transition-all ${highlightMode ? 'bg-yellow-400/20 text-yellow-400' : 'opacity-50 hover:opacity-100'}`}>
            <Highlighter size={15} />
          </button>

          <button onClick={() => { setShowAnnotations(!showAnnotations); setShowThumbs(false); }}
            className={`p-1.5 rounded-lg transition-all ${showAnnotations ? 'bg-black/20' : 'opacity-50 hover:opacity-100'}`}>
            <MessageSquare size={15} />
          </button>

          <button onClick={() => { setShowThumbs(!showThumbs); setShowAnnotations(false); }}
            className={`p-1.5 rounded-lg transition-all ${showThumbs ? 'bg-black/20' : 'opacity-50 hover:opacity-100'}`}>
            <Layers size={15} />
          </button>

          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-all">
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>

        {/* Mobile toolbar */}
        <div className="flex md:hidden items-center gap-0.5">
          <button onClick={zoomOut} className="p-1.5 opacity-60"><ZoomOut size={15} /></button>
          <span className="text-[10px] font-mono opacity-50 w-8 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="p-1.5 opacity-60"><ZoomIn size={15} /></button>
          <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-1.5 rounded-lg opacity-60 hover:opacity-100">
            <Menu size={16} />
          </button>
        </div>
      </div>

      {/* Mobile expanded menu */}
      {showMobileMenu && (
        <div className="md:hidden flex flex-wrap gap-2 px-3 py-2 border-b flex-shrink-0" style={{ borderColor, background: mode.bg }}>
          <div className="flex items-center gap-0.5 bg-black/10 rounded-lg p-0.5">
            <ModeBtn modeKey="dark"  Icon={Moon} />
            <ModeBtn modeKey="sepia" Icon={Coffee} />
            <ModeBtn modeKey="light" Icon={Sun} />
          </div>
          <button onClick={toggleBookmark} className={`p-1.5 rounded-lg ${isBookmarked ? 'text-amber-400' : 'opacity-50'}`}>
            {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
          <button onClick={() => { setHighlightMode(!highlightMode); setShowMobileMenu(false); }}
            className={`p-1.5 rounded-lg ${highlightMode ? 'bg-yellow-400/20 text-yellow-400' : 'opacity-50'}`}>
            <Highlighter size={16} />
          </button>
          <button onClick={() => { setShowThumbs(!showThumbs); setShowAnnotations(false); setShowMobileMenu(false); }}
            className={`p-1.5 rounded-lg ${showThumbs ? 'bg-black/20' : 'opacity-50'}`}>
            <Layers size={16} />
          </button>
          <button onClick={() => { setShowAnnotations(!showAnnotations); setShowThumbs(false); setShowMobileMenu(false); }}
            className={`p-1.5 rounded-lg ${showAnnotations ? 'bg-black/20' : 'opacity-50'}`}>
            <MessageSquare size={16} />
          </button>
          <button onClick={resetZoom} className="p-1.5 rounded-lg opacity-50">
            <RotateCcw size={16} />
          </button>
          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg opacity-50">
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-0.5 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.1)' }}>
        <div className="progress-bar h-full" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Main Area ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Thumbnail sidebar */}
        {showThumbs && pdfDoc && (
          isMobile ? (
            <div className="absolute inset-0 z-20 flex">
              <ThumbnailSidebar pdfDoc={pdfDoc} numPages={numPages} currentPage={currentPage}
                onGoTo={(p) => { goTo(p); setShowThumbs(false); }} bookmarks={bookmarks} readerMode={state.readerMode} />
              <div className="flex-1 bg-black/50" onClick={() => setShowThumbs(false)} />
            </div>
          ) : (
            <ThumbnailSidebar pdfDoc={pdfDoc} numPages={numPages} currentPage={currentPage}
              onGoTo={goTo} bookmarks={bookmarks} readerMode={state.readerMode} />
          )
        )}

        {/* PDF canvas */}
        <div
          className="flex-1 overflow-auto flex flex-col items-center py-4 md:py-8 px-2 md:px-4"
          style={{ background: mode.pageBg }}
          onMouseUp={handleTextSelection}
        >
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-current border-t-transparent animate-spin opacity-30" />
              <div className="text-center">
                <p className="text-sm opacity-40 mb-1">Loading PDF…</p>
                {loadProgress > 0 && loadProgress < 100 && (
                  <div className="w-48 h-1 bg-current/20 rounded-full overflow-hidden">
                    <div className="h-full bg-current/50 rounded-full transition-all" style={{ width: `${loadProgress}%` }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-6">
              <div className="text-4xl">⚠️</div>
              <p className="font-medium text-sm">Failed to load PDF</p>
              <p className="text-xs opacity-50 max-w-xs">{error}</p>
              <button onClick={loadPDF}
                className="mt-2 px-4 py-2 rounded-lg bg-current/10 hover:bg-current/20 text-sm transition-all">
                Retry
              </button>
            </div>
          )}

          {/* Canvas */}
          {!loading && !error && (
            <div className="pdf-page-wrapper">
              <canvas ref={canvasRef} style={{ filter: mode.filter, display: 'block', maxWidth: '100%' }} />
              <div ref={textLayerRef}
                className="absolute top-0 left-0 overflow-hidden"
                style={{ position: 'absolute', top: 0, left: 0,
                  cursor: highlightMode ? 'crosshair' : 'text', userSelect: 'text' }}
              />
              {/* Highlight color picker */}
              {highlightMode && (
                <div className="absolute top-3 right-3 flex gap-1.5 bg-black/60 backdrop-blur-sm rounded-xl p-1.5">
                  {HIGHLIGHT_COLORS.map(c => (
                    <button key={c} onClick={() => setHighlightColor(c)}
                      className={`w-5 h-5 rounded-full transition-transform ${highlightColor === c ? 'scale-125 ring-2 ring-white/50' : ''}`}
                      style={{ background: COLOR_HEX[c] }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Page highlights list */}
          {highlights.filter(h => h.page === currentPage).length > 0 && !loading && (
            <div className="mt-4 w-full max-w-lg px-2">
              {highlights.filter(h => h.page === currentPage).map(h => (
                <div key={h.id}
                  className={`text-xs px-3 py-2 rounded-lg mb-1.5 flex items-start gap-2 highlight-${h.color}`}
                  style={{ color: mode.text }}
                >
                  <span className="flex-1 italic">"{h.text}"</span>
                  <button onClick={() => deleteHighlight(h.id)} className="opacity-40 hover:opacity-80 flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Annotation sidebar */}
        {showAnnotations && (
          isMobile ? (
            <div className="absolute inset-0 z-20 flex justify-end">
              <div style={{ zIndex: 25 }}>
                <AnnotationSidebar highlights={highlights} bookmarks={bookmarks} currentPage={currentPage}
                  onGoTo={(p) => { goTo(p); setShowAnnotations(false); }}
                  onDeleteHighlight={deleteHighlight} readerMode={state.readerMode} />
              </div>
              <div className="absolute inset-0 bg-black/50" style={{ zIndex: 22 }} onClick={() => setShowAnnotations(false)} />
            </div>
          ) : (
            <AnnotationSidebar highlights={highlights} bookmarks={bookmarks} currentPage={currentPage}
              onGoTo={goTo} onDeleteHighlight={deleteHighlight} readerMode={state.readerMode} />
          )
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <div className="flex items-center justify-center gap-2 md:gap-4 px-4 py-2 md:py-3 border-t flex-shrink-0 relative"
        style={{ borderColor }}>
        <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}
          className="p-2 rounded-xl disabled:opacity-20 hover:bg-black/10 transition-all">
          <ChevronLeft size={isMobile ? 22 : 18} />
        </button>

        <div className="flex items-center gap-2">
          <input
            type="number" value={currentPage} min={1} max={numPages}
            onChange={e => goTo(parseInt(e.target.value) || 1)}
            className="w-12 md:w-14 text-center bg-black/10 rounded-lg px-1 py-1 text-xs md:text-sm font-mono
                       border border-transparent focus:outline-none focus:border-current/30"
            style={{ color: mode.text }}
          />
          <span className="text-xs md:text-sm opacity-40">/ {numPages}</span>
        </div>

        <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= numPages}
          className="p-2 rounded-xl disabled:opacity-20 hover:bg-black/10 transition-all">
          <ChevronRight size={isMobile ? 22 : 18} />
        </button>

        <div className="absolute right-3 md:right-6 hidden sm:flex items-center gap-1 text-xs opacity-30">
          {progress}% read
        </div>
      </div>
    </div>
  );
}
