const BASE_URL = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('airnotes_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('airnotes_token');
    window.location.reload();
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login:    (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  verify:   () => request('/auth/verify'),

  // Files
  getFiles: (type = null, folderId = null) => {
    const params = new URLSearchParams();
    if (type)     params.set('type', type);
    if (folderId) params.set('folder_id', folderId);
    return request(`/files${params.toString() ? '?' + params : ''}`);
  },
  search:     (q, type = null) => request(`/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}`),
  refresh:    () => request('/files/refresh', { method: 'POST' }),
  deleteFile: (fileId) => request(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }),
  renameFile: (fileId, name) => request(`/files/${encodeURIComponent(fileId)}/rename`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  copyFile:   (fileId) => request(`/files/${encodeURIComponent(fileId)}/copy`, { method: 'POST' }),
  moveFile:   (fileId, folderId) => request(`/files/${encodeURIComponent(fileId)}/move`, { method: 'POST', body: JSON.stringify({ folder_id: folderId }) }),

  // Folders (persisted in backend)
  getFolders:    () => request('/folders'),
  createFolder:  (name) => request('/folders', { method: 'POST', body: JSON.stringify({ name }) }),
  renameFolder:  (folderId, name) => request(`/folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteFolder:  (folderId) => request(`/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' }),
  getFolderFiles:(folderId) => request(`/folders/${encodeURIComponent(folderId)}/files`),

  /** Stream URL for PDFs — uses Authorization header via fetch in PDFReader. */
  getStreamUrl: (fileId) => `${BASE_URL}/files/${encodeURIComponent(fileId)}/stream`,

  /**
   * Stream URL for Videos — embeds token as query param so HTML <video> tag works.
   * HTML video/audio tags cannot set custom headers, so we pass auth via ?token=
   */
  getVideoStreamUrl: (fileId) => {
    const token = getToken();
    return `${BASE_URL}/files/${encodeURIComponent(fileId)}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  authHeaders: () => ({ Authorization: `Bearer ${getToken()}` }),
};
