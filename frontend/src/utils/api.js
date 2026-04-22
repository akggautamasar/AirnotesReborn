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
  login:      (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  verify:     () => request('/auth/verify'),
  getFiles:   () => request('/files'),
  search:     (q) => request(`/search?q=${encodeURIComponent(q)}`),
  refresh:    () => request('/files/refresh', { method: 'POST' }),
  deleteFile: (fileId) => request(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }),
  renameFile: (fileId, name) => request(`/files/${encodeURIComponent(fileId)}/rename`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  copyFile:   (fileId) => request(`/files/${encodeURIComponent(fileId)}/copy`, { method: 'POST' }),
  getStreamUrl: (fileId) => `${BASE_URL}/files/${encodeURIComponent(fileId)}/stream`,
  authHeaders: () => ({ Authorization: `Bearer ${getToken()}` }),
};
