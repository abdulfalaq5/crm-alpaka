import axios from 'axios';

const KEY = 'alpaka_session';

// Sesi disimpan di localStorage (default, checkbox "ingat saya") atau sessionStorage (tanpa checkbox),
// dan dihapus otomatis dari keduanya saat server menyatakan sesi berakhir (401).
export const session = {
  get() {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        const raw = store.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        /* storage tidak tersedia */
      }
    }
    return null;
  },
  /** `remember` false → hanya bertahan selama tab ini terbuka. */
  set(value, remember = true) {
    const target = remember ? window.localStorage : window.sessionStorage;
    try {
      (remember ? window.sessionStorage : window.localStorage).removeItem(KEY);
    } catch {
      /* storage tidak tersedia */
    }
    try {
      target.setItem(KEY, JSON.stringify(value));
    } catch {
      /* storage tidak tersedia */
    }
  },
  /** Store mana yang sedang dipakai; dipakai agar refresh token tidak memindahkan sesi ke store lain. */
  get remember() {
    try {
      return !!window.localStorage.getItem(KEY);
    } catch {
      return true;
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY);
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* storage tidak tersedia */
    }
  },
};

/** Payload JWT; null bila token tidak terbaca. */
function tokenPayload(token) {
  try {
    return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** Waktu kedaluwarsa (detik epoch) dari payload JWT; null bila tidak terbaca. */
export function tokenExp(token) {
  return tokenPayload(token)?.exp || null;
}

/** Panjang validitas token (detik) = jendela sesi idle dari server. */
export function tokenTtl(token) {
  const p = tokenPayload(token);
  return p?.exp && p?.iat ? p.exp - p.iat : null;
}

/** Header untuk permintaan latar belakang (polling) agar tidak memperpanjang sesi idle. */
export const BACKGROUND = { headers: { 'X-Background': '1' } };

// VITE_API_URL diisi saat build bila frontend & backend berada di subdomain berbeda
// (mis. https://dev-api-crm-alpaka.lokatali.my.id/api). Kosongkan untuk pakai proxy relatif '/api'
// (satu domain, lihat deploy/nginx/alpaka.conf).
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const s = session.get();
  if (s?.token) {
    config.headers.Authorization = `Bearer ${s.token}`;
    config.usedToken = s.token; // tandai token request ini, agar 401-nya tidak salaharti
  }
  return config;
});

const applyRefresh = (headers) => {
  const token = headers?.['x-refresh-token'];
  const s = session.get();
  // `session.remember`: jangan pindahkan sesi dari sessionStorage ke localStorage saat token disegarkan.
  if (token && s) session.set({ ...s, token }, session.remember);
};

api.interceptors.response.use(
  (res) => {
    applyRefresh(res.headers);
    return res;
  },
  (err) => {
    applyRefresh(err.response?.headers);
    const url = err.config?.url || '';
    const sekarang = session.get()?.token;
    // Sesi hanya diputus bila 401 ini masih milik token yang sedang dipakai.
    // 401 dari request lama (mis. masih berjalan saat login baru) tidak boleh
    // menghapus sesi yang baru saja dibuat — itu memunculkan "sesi berakhir" padahal baru login.
    const milikSesiSekarang = !err.config?.usedToken || err.config.usedToken === sekarang;
    if (err.response?.status === 401 && sekarang && milikSesiSekarang && !url.startsWith('/auth/')) {
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
