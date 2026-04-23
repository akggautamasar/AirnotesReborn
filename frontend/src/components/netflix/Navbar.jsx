import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, User, X, ChevronDown } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';

export default function Navbar({ onSearchResults }) {
  const { state, actions } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  function handleSearch(q) {
    setQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { onSearchResults(null); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.search(q);
        onSearchResults(res.results || []);
      } catch {
        onSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
    onSearchResults(null);
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-[#0a0a0a]/95 backdrop-blur-md shadow-2xl' : 'bg-gradient-to-b from-[#0a0a0a] to-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-6 md:px-10 h-16">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <span
            className="font-display text-2xl font-black tracking-tight cursor-pointer select-none"
            style={{ background: 'linear-gradient(135deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            onClick={() => { closeSearch(); actions.setActiveSection('library'); }}
          >
            AirNotes
          </span>
          <div className="hidden md:flex items-center gap-1 text-sm">
            {['All', 'PDFs', 'Recent', 'Favorites'].map((item) => (
              <button
                key={item}
                className="px-3 py-1.5 rounded-md text-gray-300 hover:text-white transition-colors hover:bg-white/10"
                onClick={() => {
                  closeSearch();
                  if (item === 'Recent') actions.setActiveSection('recent');
                  else actions.setActiveSection('library');
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className={`flex items-center transition-all duration-300 ${searchOpen ? 'w-56 md:w-72' : 'w-9'}`}>
            {searchOpen ? (
              <div className="flex items-center w-full border border-white/20 rounded-lg bg-black/60 backdrop-blur-sm px-3 py-1.5">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search notes…"
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none ml-2"
                  onKeyDown={e => e.key === 'Escape' && closeSearch()}
                />
                {searching ? (
                  <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                ) : query ? (
                  <button onClick={closeSearch}><X size={13} className="text-gray-500 hover:text-white" /></button>
                ) : null}
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <Search size={17} />
              </button>
            )}
          </div>

          {/* Notifications */}
          <button className="hidden md:flex w-9 h-9 items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-all relative">
            <Bell size={17} />
            {state.files.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>

          {/* Profile */}
          <div className="relative">
            <button
              onClick={() => setProfileOpen(o => !o)}
              className="flex items-center gap-2 hover:bg-white/10 rounded-lg px-2 py-1.5 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <User size={15} className="text-white" />
              </div>
              <ChevronDown size={12} className={`text-gray-400 transition-transform hidden md:block ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-2 animate-in">
                <div className="px-4 py-2 border-b border-white/10 mb-1">
                  <p className="text-sm font-medium text-white">Student</p>
                  <p className="text-xs text-gray-500">{state.files.length} notes</p>
                </div>
                <button
                  onClick={() => { setProfileOpen(false); actions.logout(); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
