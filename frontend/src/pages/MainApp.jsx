import React, { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { api } from '../utils/api';
import Sidebar from '../components/Sidebar';
import LibraryView from '../components/library/LibraryView';
import PDFReader from '../components/reader/PDFReader';
import SearchModal from '../components/ui/SearchModal';
import { Menu, X } from 'lucide-react';

export default function MainApp() {
  const { state, actions } = useApp();
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api.verify().catch(() => actions.logout());
  }, []);

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

  return (
    <div className="h-screen flex overflow-hidden bg-ink-950">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 md:z-auto h-full transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar onSearch={() => { setShowSearch(true); setSidebarOpen(false); }} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center gap-3 px-4 py-3 border-b border-ink-800/60 bg-ink-950">
          <button onClick={() => setSidebarOpen(true)} className="text-ink-400 hover:text-ink-100 p-1">
            <Menu size={20} />
          </button>
          <span className="font-display font-bold text-paper-100">AirNotes 2.0</span>
          <button
            onClick={() => setShowSearch(true)}
            className="ml-auto text-ink-400 hover:text-ink-100 p-1"
          >
            🔍
          </button>
        </div>

        <LibraryView />
      </div>

      {state.openFile && <PDFReader />}

      {showSearch && !state.openFile && (
        <SearchModal onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}
