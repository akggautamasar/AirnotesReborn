import React, { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext(null);

const initialState = {
  isAuthenticated: !!localStorage.getItem('airnotes_token'),
  files: [],
  filesLoading: false,
  filesError: null,
  viewMode: localStorage.getItem('viewMode') || 'grid',
  activeSection: 'library',
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  folders: [],
  activeFolderId: null,
  fileAssignments: {},
  openFile: null,
  readerMode: localStorage.getItem('readerMode') || 'dark',
  recentFiles: [],
  highlights: {},
  bookmarks: {},
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_AUTH': return { ...state, isAuthenticated: action.payload };
    case 'LOGOUT':   return { ...initialState, isAuthenticated: false };
    case 'SET_FILES': return { ...state, files: action.payload, filesLoading: false, filesError: null };
    case 'SET_FILES_LOADING': return { ...state, filesLoading: action.payload };
    case 'SET_FILES_ERROR':   return { ...state, filesError: action.payload, filesLoading: false };
    case 'SET_VIEW_MODE':
      localStorage.setItem('viewMode', action.payload);
      return { ...state, viewMode: action.payload };
    case 'SET_ACTIVE_SECTION': return { ...state, activeSection: action.payload, activeFolderId: null };
    case 'SET_SEARCH_QUERY':   return { ...state, searchQuery: action.payload };
    case 'SET_SEARCH_RESULTS': return { ...state, searchResults: action.payload, isSearching: false };
    case 'SET_SEARCHING':      return { ...state, isSearching: action.payload };
    case 'SET_FOLDERS':        return { ...state, folders: action.payload };
    case 'ADD_FOLDER':         return { ...state, folders: [...state.folders, action.payload] };
    case 'REMOVE_FOLDER':      return { ...state, folders: state.folders.filter(f => f.id !== action.payload) };
    case 'RENAME_FOLDER':      return { ...state, folders: state.folders.map(f => f.id === action.payload.id ? { ...f, name: action.payload.name } : f) };
    case 'SET_ACTIVE_FOLDER':  return { ...state, activeFolderId: action.payload, activeSection: 'folder' };
    case 'ASSIGN_FILE':   return { ...state, fileAssignments: { ...state.fileAssignments, [action.fileId]: action.folderId } };
    case 'UNASSIGN_FILE': {
      const a = { ...state.fileAssignments }; delete a[action.fileId]; return { ...state, fileAssignments: a };
    }
    case 'SET_FILE_ASSIGNMENTS': return { ...state, fileAssignments: action.payload };
    case 'OPEN_FILE':  return { ...state, openFile: action.payload };
    case 'CLOSE_FILE': return { ...state, openFile: null };
    case 'SET_READER_MODE':
      localStorage.setItem('readerMode', action.payload);
      return { ...state, readerMode: action.payload };
    case 'SET_RECENT': return { ...state, recentFiles: action.payload };
    case 'ADD_RECENT': {
      const updated = [action.payload, ...state.recentFiles.filter(r => r.fileId !== action.payload.fileId)].slice(0, 20);
      return { ...state, recentFiles: updated };
    }
    case 'SET_HIGHLIGHTS': return { ...state, highlights: { ...state.highlights, [action.fileId]: action.payload } };
    case 'ADD_HIGHLIGHT': {
      const cur = state.highlights[action.fileId] || [];
      return { ...state, highlights: { ...state.highlights, [action.fileId]: [...cur, action.payload] } };
    }
    case 'REMOVE_HIGHLIGHT': {
      const cur = state.highlights[action.fileId] || [];
      return { ...state, highlights: { ...state.highlights, [action.fileId]: cur.filter(h => h.id !== action.id) } };
    }
    case 'SET_BOOKMARKS': return { ...state, bookmarks: { ...state.bookmarks, [action.fileId]: action.payload } };
    default: return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = {
    setAuth: useCallback((val) => dispatch({ type: 'SET_AUTH', payload: val }), []),
    logout: useCallback(() => { localStorage.removeItem('airnotes_token'); dispatch({ type: 'LOGOUT' }); }, []),
    setFiles: useCallback((f) => dispatch({ type: 'SET_FILES', payload: f }), []),
    setFilesLoading: useCallback((v) => dispatch({ type: 'SET_FILES_LOADING', payload: v }), []),
    setFilesError: useCallback((e) => dispatch({ type: 'SET_FILES_ERROR', payload: e }), []),
    setViewMode: useCallback((v) => dispatch({ type: 'SET_VIEW_MODE', payload: v }), []),
    setActiveSection: useCallback((s) => dispatch({ type: 'SET_ACTIVE_SECTION', payload: s }), []),
    setSearchQuery: useCallback((q) => dispatch({ type: 'SET_SEARCH_QUERY', payload: q }), []),
    setSearchResults: useCallback((r) => dispatch({ type: 'SET_SEARCH_RESULTS', payload: r }), []),
    setSearching: useCallback((v) => dispatch({ type: 'SET_SEARCHING', payload: v }), []),
    setFolders: useCallback((f) => dispatch({ type: 'SET_FOLDERS', payload: f }), []),
    addFolder: useCallback((f) => dispatch({ type: 'ADD_FOLDER', payload: f }), []),
    removeFolder: useCallback((id) => dispatch({ type: 'REMOVE_FOLDER', payload: id }), []),
    renameFolder: useCallback((id, name) => dispatch({ type: 'RENAME_FOLDER', payload: { id, name } }), []),
    setActiveFolder: useCallback((id) => dispatch({ type: 'SET_ACTIVE_FOLDER', payload: id }), []),
    assignFile: useCallback((fileId, folderId) => dispatch({ type: 'ASSIGN_FILE', fileId, folderId }), []),
    unassignFile: useCallback((fileId) => dispatch({ type: 'UNASSIGN_FILE', fileId }), []),
    setFileAssignments: useCallback((a) => dispatch({ type: 'SET_FILE_ASSIGNMENTS', payload: a }), []),
    openFile: useCallback((file) => dispatch({ type: 'OPEN_FILE', payload: file }), []),
    closeFile: useCallback(() => dispatch({ type: 'CLOSE_FILE' }), []),
    setReaderMode: useCallback((m) => dispatch({ type: 'SET_READER_MODE', payload: m }), []),
    setRecent: useCallback((r) => dispatch({ type: 'SET_RECENT', payload: r }), []),
    addRecent: useCallback((r) => dispatch({ type: 'ADD_RECENT', payload: r }), []),
    setHighlights: useCallback((fileId, hl) => dispatch({ type: 'SET_HIGHLIGHTS', fileId, payload: hl }), []),
    addHighlight: useCallback((fileId, hl) => dispatch({ type: 'ADD_HIGHLIGHT', fileId, payload: hl }), []),
    removeHighlight: useCallback((fileId, id) => dispatch({ type: 'REMOVE_HIGHLIGHT', fileId, id }), []),
    setBookmarks: useCallback((fileId, bm) => dispatch({ type: 'SET_BOOKMARKS', fileId, payload: bm }), []),
  };

  return <AppContext.Provider value={{ state, actions }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
