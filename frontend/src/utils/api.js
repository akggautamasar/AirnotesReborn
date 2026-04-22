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
  login:  (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  verify: () => request('/auth/verify'),
  getFiles: () => request('/files'),
  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  refresh: () => request('/files/refresh', { method: 'POST' }),

  // Stream URL — includes auth token as query param for range-request compatibility
  getStreamUrl: (fileId) => {
    const token = getToken();
    return `${BASE_URL}/files/${encodeURIComponent(fileId)}/stream`;
  },

  // Auth header helper for fetch calls that need Range + Authorization together
  authHeaders: () => ({
    Authorization: `Bearer ${getToken()}`,
  }),
};
