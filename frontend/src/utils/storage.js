import { openDB } from 'idb';

const DB_NAME = 'airnotes2_db';
const DB_VERSION = 1;
let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('highlights')) {
          const s = db.createObjectStore('highlights', { keyPath: 'id', autoIncrement: true });
          s.createIndex('fileId', 'fileId');
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          const s = db.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true });
          s.createIndex('fileId', 'fileId');
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'fileId' });
        }
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('fileAssignments')) {
          const s = db.createObjectStore('fileAssignments', { keyPath: 'fileId' });
          s.createIndex('folderId', 'folderId');
        }
        if (!db.objectStoreNames.contains('recent')) {
          db.createObjectStore('recent', { keyPath: 'fileId' });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Highlights ───────────────────────────────────────────────────────────────
export const highlightStore = {
  async add(fileId, page, text, color = 'yellow') {
    const db = await getDB();
    return db.add('highlights', { fileId, page, text, color, createdAt: Date.now() });
  },
  async getByFile(fileId) {
    const db = await getDB();
    return db.getAllFromIndex('highlights', 'fileId', fileId);
  },
  async delete(id) {
    const db = await getDB();
    return db.delete('highlights', id);
  },
};

// ─── Bookmarks ────────────────────────────────────────────────────────────────
export const bookmarkStore = {
  async add(fileId, page, label = '') {
    const db = await getDB();
    return db.add('bookmarks', { fileId, page, label, createdAt: Date.now() });
  },
  async getByFile(fileId) {
    const db = await getDB();
    return db.getAllFromIndex('bookmarks', 'fileId', fileId);
  },
  async isBookmarked(fileId, page) {
    const all = await bookmarkStore.getByFile(fileId);
    return all.some(b => b.page === page);
  },
  async remove(fileId, page) {
    const db = await getDB();
    const all = await db.getAllFromIndex('bookmarks', 'fileId', fileId);
    const match = all.find(b => b.page === page);
    if (match) await db.delete('bookmarks', match.id);
  },
};

// ─── Progress ─────────────────────────────────────────────────────────────────
export const progressStore = {
  async save(fileId, currentPage, totalPages) {
    const db = await getDB();
    await db.put('progress', {
      fileId, currentPage, totalPages,
      percent: Math.round((currentPage / totalPages) * 100),
      updatedAt: Date.now(),
    });
  },
  async get(fileId) {
    const db = await getDB();
    return db.get('progress', fileId);
  },
  async getAll() {
    const db = await getDB();
    return db.getAll('progress');
  },
};

// ─── Folders ──────────────────────────────────────────────────────────────────
export const folderStore = {
  async create(name, parentId = null) {
    const db = await getDB();
    const id = `folder_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await db.put('folders', { id, name, parentId, createdAt: Date.now() });
    return id;
  },
  async getAll() {
    const db = await getDB();
    return db.getAll('folders');
  },
  async rename(id, name) {
    const db = await getDB();
    const f = await db.get('folders', id);
    if (f) await db.put('folders', { ...f, name });
  },
  async delete(id) {
    const db = await getDB();
    await db.delete('folders', id);
    // Remove all file assignments for this folder
    const all = await db.getAll('fileAssignments');
    for (const a of all) {
      if (a.folderId === id) await db.delete('fileAssignments', a.fileId);
    }
  },
  async assignFile(fileId, folderId) {
    const db = await getDB();
    await db.put('fileAssignments', { fileId, folderId });
  },
  async unassignFile(fileId) {
    const db = await getDB();
    await db.delete('fileAssignments', fileId);
  },
  async getFilesInFolder(folderId) {
    const db = await getDB();
    return db.getAllFromIndex('fileAssignments', 'folderId', folderId);
  },
  async getAllAssignments() {
    const db = await getDB();
    return db.getAll('fileAssignments');
  },
};

// ─── Recent ───────────────────────────────────────────────────────────────────
export const recentStore = {
  async add(fileId, fileName) {
    const db = await getDB();
    await db.put('recent', { fileId, fileName, openedAt: Date.now() });
  },
  async getAll(limit = 20) {
    const db = await getDB();
    const all = await db.getAll('recent');
    return all.sort((a, b) => b.openedAt - a.openedAt).slice(0, limit);
  },
};
