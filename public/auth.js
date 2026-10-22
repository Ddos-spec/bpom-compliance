// Modul Autentikasi & RBAC (Role-Based Access Control)
// Mendukung role: 'petugas' (Lapangan), 'auditor' (Hukum/Kepala), 'admin' (Sistem)

const AUTH_KEY = 'tera.auth.v1';

export const ROLES = {
  petugas: {
    id: 'petugas',
    name: 'Petugas Lapangan',
    badge: 'Inspektorat',
    canCreate: true,
    canEditLabel: true,
    canSendWa: true,
    canSignBA: false,
    canManageRules: false,
  },
  auditor: {
    id: 'auditor',
    name: 'Auditor Hukum & Verifikator',
    badge: 'Penilai Hukum',
    canCreate: true,
    canEditLabel: true,
    canSendWa: true,
    canSignBA: true,
    canManageRules: true,
  },
  admin: {
    id: 'admin',
    name: 'Administrator Disperindag',
    badge: 'Superadmin',
    canCreate: true,
    canEditLabel: true,
    canSendWa: true,
    canSignBA: true,
    canManageRules: true,
  },
};

export const PRESET_USERS = [
  {
    email: 'petugas@disperindag.banten.go.id',
    name: 'Fadjar A. Seto',
    nip: '19950814 202012 1 002',
    role: 'petugas',
    instansi: 'Disperindag Kab/Kota Tangerang Selatan',
    jabatan: 'Pengawas Mutu Produk Lapangan',
  },
  {
    email: 'auditor@disperindag.banten.go.id',
    name: 'Dr. Hendro Prasetyo, M.H.',
    nip: '19820412 200801 1 009',
    role: 'auditor',
    instansi: 'Dinas Perindustrian dan Perdagangan',
    jabatan: 'Penyidik & Pemeriksa Kepatuhan Regulasi',
  },
  {
    email: 'admin@disperindag.banten.go.id',
    name: 'Administrator Pusat',
    nip: '19880101 201001 1 001',
    role: 'admin',
    instansi: 'Pusat Data & Informasi Regulasi Tera',
    jabatan: 'Sysadmin & Auditor JDIH',
  },
];

export function currentSession() {
  try {
    if (localStorage.getItem('tera.auth.logged_out') === '1') {
      return null;
    }
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed reading auth state', e);
  }
  // Default session awal (Petugas Lapangan aktif) agar siap pakai pertama kali
  const def = {
    user: PRESET_USERS[0],
    role: ROLES.petugas,
    token: 'tera-session-demo-token-123',
    loggedInAt: new Date().toISOString(),
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(def));
  return def;
}

export function isLoggedIn() {
  const s = currentSession();
  return Boolean(s && s.user);
}

export function login(email, password = '') {
  const found = PRESET_USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!found) {
    throw new Error('Email atau NIP tidak terdaftar di direktori Disperindag.');
  }
  // Simulasi verifikasi kredensial
  const session = {
    user: found,
    role: ROLES[found.role],
    token: 'tera-token-' + Math.random().toString(36).substring(2),
    loggedInAt: new Date().toISOString(),
  };
  localStorage.removeItem('tera.auth.logged_out');
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function logout() {
  localStorage.setItem('tera.auth.logged_out', '1');
  localStorage.removeItem(AUTH_KEY);
  return null;
}

export function hasPermission(perm) {
  const s = currentSession();
  return Boolean(s?.role?.[perm]);
}
