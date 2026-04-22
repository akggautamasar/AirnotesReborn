import React, { useState, useEffect, useRef } from 'react';
import { Search, X, FileText, Loader } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { cleanFileName, formatSize } from '../../utils/format';
import { recentStore } from '../../utils/storage';

export default function SearchModal({ onClose }) {
  const { state, actions } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search(query);
        setResults(res.files || []);
      } catch (e) {
        // Search on local files as fallback
        const q = query.toLowerCase();
        setResults(state.files.filter(f =>
          f.name.toLowerCase().includes(q) || (f.caption || '').toLowerCase().includes(q)
        ));
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  function openFile(file) {
    actions.openFile(file);
    actions.setSearchQuery(query);
    recentStore.add(file.id, file.name);
    actions.addRecent({ fileId: file.id, fileName: file.name, openedAt: Date.now() });
    onClose();
  }

  const displayResults = query.trim() ? results : state.recentFiles
    .map(r => state.files.find(f => f.id === r.fileId))
    .filter(Boolean)
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-ink-900 border border-ink-700/50 rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-800/60">
          {loading ? <Loader size={16} className="text-ink-500 animate-spin flex-shrink-0" /> : <Search size={16} className="text-ink-500 flex-shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your PDFs…"
            className="flex-1 bg-transparent text-ink-100 placeholder-ink-600 text-sm focus:outline-none"
            onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && displayResults.length > 0) openFile(displayResults[0]); }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-ink-500 hover:text-ink-300">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() && (
            <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-600">
              Recently opened
            </div>
          )}
          {displayResults.length === 0 && query.trim() && !loading && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText size={28} className="text-ink-700 mb-2" />
              <p className="text-ink-500 text-sm">No results for "{query}"</p>
            </div>
          )}
          {displayResults.map(file => (
            <button
              key={file.id}
              onClick={() => openFile(file)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-800/50 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-ink-300">
                PDF
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ink-200 text-sm font-medium truncate group-hover:text-ink-100">
                  {cleanFileName(file.name)}
                </p>
                <p className="text-ink-600 text-xs truncate">{formatSize(file.size)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-ink-800/40 flex gap-4 text-[10px] text-ink-600">
          <span><kbd className="bg-ink-800 px-1 py-0.5 rounded">↵</kbd> open</span>
          <span><kbd className="bg-ink-800 px-1 py-0.5 rounded">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
