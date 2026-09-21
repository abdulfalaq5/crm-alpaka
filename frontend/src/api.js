import axios from 'axios';

const KEY = 'alpaka_session';

// Sesi disimpan di localStorage dan dihapus otomatis saat server menyatakan sesi berakhir (401).
export const session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* storage tidak tersedia */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage tidak tersedia */
    }
  },
};

/** Waktu kedaluwarsa (detik epoch) dari payload JWT; null bila tidak terbaca. */
export function tokenExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp || null;
  } catch {
    return null;
  }
}

/** Header untuk permintaan latar belakang (polling) agar tidak memperpanjang sesi idle. */
export const BACKGROUND = { headers: { 'X-Background': '1' } };

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const s = session.get();
  if (s?.token) config.headers.Authorization = `Bearer ${s.token}`;
  return config;
});

const applyRefresh = (headers) => {
  const token = headers?.['x-refresh-token'];
  const s = session.get();
  if (token && s) session.set({ ...s, token });
};

api.interceptors.response.use(
  (res) => {
    applyRefresh(res.headers);
    return res;
  },
  (err) => {
    applyRefresh(err.response?.headers);
    const url = err.config?.url || '';
    if (err.response?.status === 401 && session.get() && !url.startsWith('/auth/')) {
      session.clear();
      window.dispatchEvent(new Event('alpaka:session-expired'));
    }
    return Promise.reject(err);
  }
);

export const errMsg = (err) => err.response?.data?.error?.message || 'Terjadi kesalahan. Silakan coba lagi.';

/** Ubah error validasi server menjadi format field error antd Form. */
export const fieldErrors = (err) => {
  const details = err.response?.data?.error?.details;
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details).map(([name, message]) => ({ name: name.split('.'), errors: [String(message)] }));
};

export default api;
