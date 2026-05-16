const STORAGE_KEY = 'ppAutomationData';
const SESSION_KEY = 'ppAutomationCurrentUser';

const LOCAL_SYNC_SERVER = 'http://localhost:3000';
const EMULATOR_SYNC_SERVER = 'http://10.0.2.2:3000';
const DEFAULT_SYNC_SERVER = 'http://localhost:3000'; // Ubah ke URL server production Anda jika sudah dideploy
const SYNC_SERVER = getSyncServerUrl();

const state = {
  currentUser: null,
  activeSection: 'dashboard',
  data: {
    users: [],
    assets: [],
    repairs: [],
    pendingSync: [],
    lastSync: null,
    areaSettings: {},
    menuConfig: [],
    auditLog: []
  }
};

function getSyncServerUrl() {
  const isCapacitorNative = window.location.protocol === 'capacitor:' || window.Capacitor?.isNative;
  if (isCapacitorNative) {
    return EMULATOR_SYNC_SERVER;
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return LOCAL_SYNC_SERVER;
  }
  return DEFAULT_SYNC_SERVER;
}

function getDefaultData() {
  return {
    users: [
      { email: 'admin@demo', password: 'demo123', name: 'Admin Pusat', role: 'admin', area: 'all' },
      { email: 'user@lapangan', password: 'lapangan123', name: 'Engineer Lapangan', role: 'engineer', area: 'field' }
    ],
    assets: [
      { id: 'AST-001', name: 'Panel Utama', area: 'field', location: 'Site A', qr: 'AST-001', status: 'Aktif' }
    ],
    repairs: [
      { assetId: 'AST-001', date: new Date().toISOString(), user: 'Engineer Lapangan', role: 'engineer', area: 'field', note: 'Pembersihan konektor', action: 'Diperbaiki', synced: true }
    ],
    pendingSync: [],
    lastSync: null,
    areaSettings: {
      all: { name: 'Semua Area', color: '#6366f1' },
      field: { name: 'Lapangan', color: '#22c55e' },
      warehouse: { name: 'Gudang', color: '#f59e0b' }
    }, // <-- Sudah diperbaiki menjadi kurung kurawal tutup
    menuConfig: [
      { id: 'dashboard', label: 'Dashboard', roles: ['admin', 'engineer'] },
      { id: 'assets', label: 'Asset & QR', roles: ['admin', 'engineer'] },
      { id: 'history', label: 'History Perbaikan', roles: ['admin', 'engineer'] },
      { id: 'sync', label: 'Sync Otomatis', roles: ['admin', 'engineer'] },
      { id: 'menu-builder', label: 'Custom Menu', roles: ['admin'] },
      { id: 'user-management', label: 'User Management', roles: ['admin'] },
      { id: 'area-management', label: 'Area Management', roles: ['admin'] },
      { id: 'audit-log', label: 'Audit Log', roles: ['admin'] }
    ],
    auditLog: []
  };
}

function initStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      state.data = JSON.parse(raw);
    } catch (error) {
      state.data = getDefaultData();
    }
  } else {
    state.data = getDefaultData();
    saveStorage();
  }
  if (!Array.isArray(state.data.menuConfig) || !state.data.menuConfig.length) {
    state.data.menuConfig = getDefaultData().menuConfig;
    saveStorage();
  }
}

function loadSession() {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return;
  const user = state.data.users.find(u => u.email === email);
  if (user) state.currentUser = user;
}

function saveStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

async function fetchRemoteState() {
  if (!navigator.onLine) return;
  try {
    const response = await fetch(`${SYNC_SERVER}/state`);
    if (!response.ok) return;
    const remoteState = await response.json();
    mergeRemoteState(remoteState);
  } catch (error) {
    console.warn('Tidak bisa ambil state remote:', error);
  }
}

async function syncPendingActions() {
  if (!navigator.onLine) {
    showMessage('Tidak ada koneksi. Sinkronisasi gagal.', 'danger');
    return;
  }
  if (!state.data.pendingSync.length) {
    await fetchRemoteState();
    return;
  }

  try {
    const syncCount = state.data.pendingSync.length;
    const response = await fetch(`${SYNC_SERVER}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingSync: state.data.pendingSync,
        clientState: {
          users: state.data.users,
          assets: state.data.assets,
          repairs: state.data.repairs,
          menuConfig: state.data.menuConfig,
          areaSettings: state.data.areaSettings,
          auditLog: state.data.auditLog
        }
      })
    });

    if (!response.ok) {
      throw new Error('Sinkron gagal. Server tidak merespon.');
    }

    const remoteState = await response.json();
    state.data = { ...remoteState, pendingSync: [] };
    state.data.lastSync = remoteState.lastSync || new Date().toISOString();
    saveStorage();
    addAudit('sync', `Sinkronisasi pending data berhasil (${syncCount})`, { user: state.currentUser?.email, count: syncCount }, false);
    showMessage('Semua data offline telah disinkronkan.', 'success');
    renderApp();
  } catch (error) {
    console.warn('Sinkronisasi gagal:', error);
    showMessage('Sinkronisasi gagal. Coba lagi nanti.', 'danger');
  }
}

function mergeRemoteState(remoteState) {
  if (!remoteState) return;
  state.data = {
    ...remoteState,
    pendingSync: state.data.pendingSync || [],
    lastSync: remoteState.lastSync || state.data.lastSync
  };
  saveStorage();
}

function saveSession() {
  if (state.currentUser) {
    localStorage.setItem(SESSION_KEY, state.currentUser.email);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function addAudit(type, message, meta = {}, queue = true) {
  const auditEntry = {
    id: `${type}-${Date.now()}`,
    type,
    message,
    meta,
    timestamp: new Date().toISOString()
  };
  state.data.auditLog.unshift(auditEntry);
  if (state.data.auditLog.length > 250) state.data.auditLog.pop();
  if (queue) {
    state.data.pendingSync.push({ type: 'audit', data: auditEntry, createdAt: auditEntry.timestamp });
  }
  saveStorage();
}

function showMessage(message, type = 'info') {
  const container = document.getElementById('notification');
  if (!container) return;
  container.innerHTML = `<div class="notice">${message}</div>`;
  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

function getAreaMeta(area) {
  return state.data.areaSettings[area] || { name: area || 'Unknown', color: '#64748b' };
}

function getUserArea() {
  return state.currentUser?.area || 'all';
}

function getFilteredAssets() {
  if (state.currentUser?.role === 'admin') return state.data.assets;
  return state.data.assets.filter(asset => asset.area === getUserArea() || asset.area === 'all');
}

function getFilteredRepairs() {
  if (state.currentUser?.role === 'admin') return state.data.repairs;
  return state.data.repairs.filter(repair => repair.area === getUserArea());
}

function setSection(section) {
  state.activeSection = section;
  renderApp();
}

function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!state.currentUser) {
    app.innerHTML = renderLogin();
    return;
  }

  const areaMeta = getAreaMeta(getUserArea());
  app.innerHTML = `
    <div class="brand" style="border-left:4px solid ${areaMeta.color};padding-left:18px;">
      <div>
        <p class="badge">Halo, ${state.currentUser.name}</p>
        <h1>PP Automation</h1>
        <p style="color:var(--muted);margin:8px 0 0;">Role: ${state.currentUser.role} · Area: ${areaMeta.name}</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <span class="badge ${navigator.onLine ? 'status-online' : 'status-offline'}">${navigator.onLine ? 'Online' : 'Offline'}</span>
        <button class="secondary" onclick="logout()">Logout</button>
      </div>
    </div>
    <div id="notification"></div>
    <div class="card">
      <div class="panel-menu">${renderMenuButtons()}</div>
    </div>
    <div id="section-content">${renderSection()}</div>
  `;

  if (navigator.onLine) {
    ensureOnlineSync();
  }
}

function renderLogin() {
  return `
    <div class="card" style="max-width:520px;margin:80px auto;">
      <div class="label-row"><h2>Login PP Automation</h2></div>
      <div class="form-row">
        <input id="email" type="email" placeholder="Email" autocomplete="username" />
        <input id="password" type="password" placeholder="Password" autocomplete="current-password" />
      </div>
      <button class="primary" onclick="tryLogin()">Masuk</button>
      <p style="color:var(--muted);margin-top:16px;">Gunakan admin@demo / demo123 atau user@lapangan / lapangan123</p>
    </div>
  `;
}

function renderMenuButtons() {
  return state.data.menuConfig
    .filter(item => item.roles.includes(state.currentUser.role))
    .map(item => `<button class="${state.activeSection === item.id ? 'primary' : 'secondary'}" onclick="setSection('${item.id}')">${item.label}</button>`)
    .join('');
}

function renderSection() {
  switch (state.activeSection) {
    case 'dashboard':
      return renderDashboard();
    case 'assets':
      return renderAssets();
    case 'history':
      return renderHistory();
    case 'sync':
      return renderSyncPanel();
    case 'menu-builder':
      return renderMenuBuilder();
    case 'user-management':
      return renderUserManagement();
    case 'area-management':
      return renderAreaManagement();
    case 'audit-log':
      return renderAuditLog();
    default:
      return renderCustomSection(state.activeSection);
  }
}

function renderCustomSection(sectionId) {
  return `
    <div class="card">
      <h2>Menu Kustom: ${sectionId}</h2>
      <p style="color:var(--muted);">Tombol kustom berhasil dibuat. Setiap menu baru dapat dikembangkan lebih lanjut di <code>app.js</code>.</p>
    </div>
  `;
}

function renderDashboard() {
  const assets = getFilteredAssets();
  const repairs = getFilteredRepairs();
  const pending = state.data.pendingSync.length;
  const areaMeta = getAreaMeta(getUserArea());

  return `
    <div class="grid grid-3">
      <div class="card"><h2>Total Asset</h2><p style="font-size:2.5rem;margin:14px 0 0;">${assets.length}</p></div>
      <div class="card"><h2>History Perbaikan</h2><p style="font-size:2.5rem;margin:14px 0 0;">${repairs.length}</p></div>
      <div class="card"><h2>Pending Sync</h2><p style="font-size:2.5rem;margin:14px 0 0;">${pending}</p></div>
    </div>
    <div class="card">
      <div class="header-row"><div><h2>Ringkasan Area</h2><span class="status-pill" style="border:1px solid ${areaMeta.color};color:${areaMeta.color};">${areaMeta.name}</span></div></div>
      <p style="color:var(--muted);">Aplikasi ini mendukung custom area, role-based access, dan offline-first asset management. Perubahan akan tersimpan lokal dan disinkronkan otomatis saat koneksi kembali.</p>
      <div class="grid grid-3" style="margin-top:18px;">
        <div class="card"><p>Area</p><strong>${areaMeta.name}</strong></div>
        <div class="card"><p>Pengguna login</p><strong>${state.currentUser.name}</strong></div>
        <div class="card"><p>Terakhir sinkron</p><strong>${state.data.lastSync ? new Date(state.data.lastSync).toLocaleString() : 'Belum pernah'}</strong></div>
      </div>
    </div>
  `;
}

function renderAssets() {
  const assets = getFilteredAssets();
  const rows = assets.map(asset => `
      <tr>
        <td>${asset.id}</td>
        <td>${asset.name}</td>
        <td>${getAreaMeta(asset.area).name}</td>
        <td>${asset.location}</td>
        <td>${asset.status}</td>
        <td><button class="secondary" onclick="renderQr('${asset.id}')">QR</button></td>
      </tr>
    `).join('');

  return `
    <div class="card">
      <div class="header-row"><div><h2>Asset & QR</h2><p style="color:var(--muted);margin:6px 0 0;">Tambah asset, lihat detail, dan buat QR otomatis.</p></div><button class="primary" onclick="scrollToForm()">Tambah Asset</button></div>
      <table class="table"><thead><tr><th>ID Asset</th><th>Nama</th><th>Area</th><th>Lokasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="card">
      <div class="label-row"><h2>Form Tambah Asset</h2></div>
      <div class="form-row" id="asset-form">
        <input id="asset-id" type="text" placeholder="ID Asset" />
        <input id="asset-name" type="text" placeholder="Nama Asset" />
        <select id="asset-area">${Object.keys(state.data.areaSettings).map(area => `<option value="${area}">${state.data.areaSettings[area].name}</option>`).join('')}</select>
        <input id="asset-location" type="text" placeholder="Lokasi" />
      </div>
      <button class="primary" onclick="addAsset()">Simpan Asset</button>
    </div>
    <div id="qr-panel" class="card qr-card hidden"></div>
  `;
}

function renderHistory() {
  const repairs = getFilteredRepairs();
  const rows = repairs.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(repair => `
      <tr>
        <td>${repair.assetId}</td>
        <td>${repair.action}</td>
        <td>${repair.user}</td>
        <td>${getAreaMeta(repair.area).name}</td>
        <td>${new Date(repair.date).toLocaleString()}</td>
        <td>${repair.note}</td>
        <td><span class="status-pill ${repair.synced ? 'status-online' : 'status-offline'}">${repair.synced ? 'Tersinkron' : 'Offline'}</span></td>
      </tr>
    `).join('');

  return `
    <div class="card">
      <div class="header-row"><h2>History Perbaikan</h2></div>
      <table class="table"><thead><tr><th>Asset ID</th><th>Aksi</th><th>Pembuat</th><th>Area</th><th>Tanggal</th><th>Catatan</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="card">
      <div class="label-row"><h2>Catat Perbaikan Baru</h2></div>
      <div class="form-row">
        <select id="repair-asset">${getFilteredAssets().map(asset => `<option value="${asset.id}">${asset.id} - ${asset.name}</option>`).join('')}</select>
        <input id="repair-note" type="text" placeholder="Catatan perbaikan" />
      </div>
      <button class="primary" onclick="addRepair()">Simpan History</button>
    </div>
  `;
}

function renderSyncPanel() {
  const pending = state.data.pendingSync.length;
  const items = state.data.pendingSync.map(item => `
    <tr>
      <td>${item.type}</td>
      <td>${item.createdAt}</td>
      <td>${item.data.id || item.data.assetId || '-'}</td>
      <td>${item.data.name || item.data.action || '-'}</td>
    </tr>
  `).join('');

  return `
    <div class="card">
      <div class="header-row"><h2>Monitoring Sinkronisasi</h2></div>
      <p>Mode offline otomatis aktif. Setiap perubahan yang belum sinkron disimpan lokal dan diupload saat kembali online.</p>
      <div class="grid grid-3">
        <div class="card"><p>Last Sync</p><strong>${state.data.lastSync ? new Date(state.data.lastSync).toLocaleString() : 'Belum tersinkronisasi'}</strong></div>
        <div class="card"><p>Pending</p><strong>${pending}</strong></div>
        <div class="card"><p>Status</p><strong>${navigator.onLine ? 'Online' : 'Offline'}</strong></div>
      </div>
      <table class="table"><thead><tr><th>Tipe</th><th>Waktu</th><th>Asset</th><th>Ringkas</th></tr></thead><tbody>${items}</tbody></table>
      <button class="primary" onclick="syncPendingActions()">Sinkronisasi Manual</button>
    </div>
  `;
}

function renderMenuBuilder() {
  const rows = state.data.menuConfig.map(menu => `
      <tr>
        <td>${menu.id}</td>
        <td>${menu.label}</td>
        <td>${menu.roles.join(', ')}</td>
      </tr>
    `).join('');

  return `
    <div class="card">
      <div class="header-row"><h2>Menu Builder</h2></div>
      <p style="color:var(--muted);">Tambahkan menu atau tombol baru yang bisa langsung muncul di navigasi berdasarkan role.</p>
      <div class="form-row">
        <input id="menu-id" placeholder="ID menu unik" />
        <input id="menu-label" placeholder="Label tombol" />
        <select id="menu-role"><option value="admin">Admin</option><option value="engineer">Engineer</option></select>
      </div>
      <button class="primary" onclick="addCustomMenu()">Tambah Menu</button>
    </div>
    <div class="card">
      <h2>Menu saat ini</h2>
      <table class="table"><thead><tr><th>ID</th><th>Label</th><th>Roles</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `;
}

function renderUserManagement() {
  const rows = state.data.users.map(user => `
      <tr>
        <td>${user.email}</td>
        <td>${user.name}</td>
        <td>${user.role}</td>
        <td>${getAreaMeta(user.area).name}</td>
      </tr>
    `).join('');

  return `
    <div class="card">
      <div class="header-row"><h2>Manajemen Pengguna</h2></div>
      <p style="color:var(--muted);">Buat user baru untuk admin dan engineer. Setiap user login disimpan dalam audit log.</p>
      <div class="form-row">
        <input id="user-email" type="email" placeholder="Email" />
        <input id="user-name" type="text" placeholder="Nama" />
        <input id="user-password" type="password" placeholder="Password" />
        <select id="user-role"><option value="admin">Admin</option><option value="engineer">Engineer</option></select>
        <select id="user-area">${Object.keys(state.data.areaSettings).map(area => `<option value="${area}">${state.data.areaSettings[area].name}</option>`).join('')}</select>
      </div>
      <button class="primary" onclick="addUser()">Tambah Pengguna</button>
    </div>
    <div class="card">
      <h2>Daftar Pengguna</h2>
      <table class="table"><thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Area</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `;
}

function renderAreaManagement() {
  const rows = Object.entries(state.data.areaSettings).map(([key, area]) => `
      <tr>
        <td>${key}</td>
        <td>${area.name}</td>
        <td><span class="status-pill" style="border:1px solid ${area.color};color:${area.color};">&nbsp;&nbsp;&nbsp;&nbsp;</span></td>
      </tr>
    `).join('');

  return `
    <div class="card">
      <div class="header-row"><h2>Manajemen Area</h2></div>
      <p style="color:var(--muted);">Tambahkan area baru agar user dan asset bisa dikategorikan sesuai wilayah lapangan.</p>
      <div class="form-row">
        <input id="area-id" type="text" placeholder="ID area unik" />
        <input id="area-name" type="text" placeholder="Nama area" />
        <input id="area-color" type="color" value="#22c55e" />
      </div>
      <button class="primary" onclick="addArea()">Tambah Area</button>
    </div>
    <div class="card">
      <h2>Daftar Area</h2>
      <table class="table"><thead><tr><th>ID</th><th>Nama</th><th>Warna</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `;
}

function renderAuditLog() {
  const rows = state.data.auditLog.slice(0, 50).map(entry => `
      <tr>
        <td>${new Date(entry.timestamp).toLocaleString()}</td>
        <td>${entry.type}</td>
        <td>${entry.message}</td>
        <td>${entry.meta.user || '-'}</td>
      </tr>
    `).join('');

  return `
    <div class="card">
      <div class="header-row"><h2>Audit Log</h2></div>
      <p style="color:var(--muted);">Setiap login, logout, penambahan asset, perbaikan, area, dan user dicatat di sini.</p>
      <table class="table"><thead><tr><th>Waktu</th><th>Tipe</th><th>Pesan</th><th>User</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `;
}

function tryLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const user = state.data.users.find(u => u.email === email && u.password === password);
  if (!user) {
    showMessage('Email atau password salah.', 'danger');
    return;
  }
  state.currentUser = user;
  saveSession();
  state.activeSection = 'dashboard';
  addAudit('login', 'Login berhasil', { user: user.email, role: user.role });
  renderApp();
}

function logout() {
  addAudit('logout', 'Logout berhasil', { user: state.currentUser?.email });
  state.currentUser = null;
  saveSession();
  renderApp();
}

function addAsset() {
  const id = document.getElementById('asset-id').value.trim();
  const name = document.getElementById('asset-name').value.trim();
  const area = document.getElementById('asset-area').value;
  const location = document.getElementById('asset-location').value.trim();
  if (!id || !name || !location) {
    showMessage('Lengkapi semua field asset.', 'warning');
    return;
  }
  if (state.data.assets.some(asset => asset.id === id)) {
    showMessage('ID asset sudah ada.', 'warning');
    return;
  }

  const newAsset = { id, name, area, location, status: 'Aktif', qr: id };
  state.data.assets.push(newAsset);
  state.data.pendingSync.push({ type: 'asset', data: newAsset, createdAt: new Date().toISOString() });
  addAudit('asset', `Asset ditambahkan: ${id}`, { user: state.currentUser.email, area });
  saveStorage();
  showMessage('Asset ditambahkan. Menunggu sinkronisasi.', 'success');
  if (navigator.onLine) ensureOnlineSync();
  renderApp();
}

function addRepair() {
  const assetId = document.getElementById('repair-asset').value;
  const note = document.getElementById('repair-note').value.trim();
  if (!assetId || !note) {
    showMessage('Masukkan catatan perbaikan.', 'warning');
    return;
  }

  const newRepair = {
    assetId,
    action: 'Diperbaiki',
    user: state.currentUser.name,
    role: state.currentUser.role,
    area: getUserArea(),
    note,
    date: new Date().toISOString(),
    synced: navigator.onLine
  };

  state.data.repairs.push(newRepair);
  state.data.pendingSync.push({ type: 'repair', data: newRepair, createdAt: new Date().toISOString() });
  if (!navigator.onLine) {
    showMessage('Riwayat perbaikan disimpan offline.', 'success');
  } else {
    showMessage('Riwayat perbaikan tersimpan dan disinkronkan.', 'success');
  }

  addAudit('repair', `Riwayat perbaikan asset ${assetId} ditambahkan`, { user: state.currentUser.email });
  saveStorage();
  if (navigator.onLine) ensureOnlineSync();
  renderApp();
}

function renderQr(assetId) {
  const asset = state.data.assets.find(a => a.id === assetId);
  if (!asset) return;
  const qrPanel = document.getElementById('qr-panel');
  if (!qrPanel) return;
  qrPanel.classList.remove('hidden');
  qrPanel.innerHTML = `
    <div class="label-row"><h2>QR Code untuk ${asset.name}</h2></div>
    <div id="qr-root" class="qr-placeholder"></div>
    <p style="color:var(--muted);margin-top:12px;">Scan untuk melihat ID asset: <strong>${asset.id}</strong></p>
  `;
  new QRCode(document.getElementById('qr-root'), { text: asset.qr, width: 230, height: 230, colorDark: '#111827', colorLight: '#f8fafc' });
  setTimeout(() => {
    const el = document.getElementById('qr-panel');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

function addCustomMenu() {
  const id = document.getElementById('menu-id').value.trim();
  const label = document.getElementById('menu-label').value.trim();
  const role = document.getElementById('menu-role').value;
  if (!id || !label) {
    showMessage('Lengkapi ID dan label menu.', 'warning');
    return;
  }
  if (state.data.menuConfig.some(item => item.id === id)) {
    showMessage('ID menu sudah digunakan.', 'warning');
    return;
  }

  const newMenu = { id, label, roles: [role] };
  state.data.menuConfig.push(newMenu);
  state.data.pendingSync.push({ type: 'menu', data: newMenu, createdAt: new Date().toISOString() });
  addAudit('menu', `Menu kustom ditambahkan: ${label}`, { user: state.currentUser.email, role });
  saveStorage();
  if (navigator.onLine) ensureOnlineSync();
  showMessage('Menu baru ditambahkan.', 'success');
  renderApp();
}

function addUser() {
  const email = document.getElementById('user-email').value.trim();
  const name = document.getElementById('user-name').value.trim();
  const password = document.getElementById('user-password').value.trim();
  const role = document.getElementById('user-role').value;
  const area = document.getElementById('user-area').value;

  if (!email || !name || !password) {
    showMessage('Lengkapi semua field pengguna.', 'warning');
    return;
  }
  if (state.data.users.some(user => user.email === email)) {
    showMessage('Email pengguna sudah terdaftar.', 'warning');
    return;
  }

  const newUser = { email, name, password, role, area };
  state.data.users.push(newUser);
  state.data.pendingSync.push({ type: 'user', data: newUser, createdAt: new Date().toISOString() });
  addAudit('user', `Pengguna baru ditambahkan: ${email}`, { user: state.currentUser.email, role });
  saveStorage();
  if (navigator.onLine) ensureOnlineSync();
  showMessage('Pengguna baru berhasil ditambahkan.', 'success');
  renderApp();
}

function addArea() {
  const areaId = document.getElementById('area-id').value.trim();
  const areaName = document.getElementById('area-name').value.trim();
  const areaColor = document.getElementById('area-color').value;

  if (!areaId || !areaName) {
    showMessage('Lengkapi ID dan nama area.', 'warning');
    return;
  }
  if (state.data.areaSettings[areaId]) {
    showMessage('ID area sudah ada.', 'warning');
    return;
  }

  const newArea = { id: areaId, name: areaName, color: areaColor };
  state.data.areaSettings[areaId] = { name: areaName, color: areaColor };
  state.data.pendingSync.push({ type: 'area', data: newArea, createdAt: new Date().toISOString() });
  addAudit('area', `Area baru ditambahkan: ${areaName}`, { user: state.currentUser.email });
  saveStorage();
  if (navigator.onLine) ensureOnlineSync();
  showMessage('Area baru berhasil ditambahkan.', 'success');
  renderApp();
}

function ensureOnlineSync() {
  if (!navigator.onLine) return;
  if (state.data.pendingSync.length) {
    syncPendingActions();
  } else {
    fetchRemoteState();
  }
}

function scrollToForm() {
  const form = document.getElementById('asset-form');
  if (form) form.scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('load', () => {
  initStorage();
  loadSession();
  renderApp();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => console.warn('Service worker gagal terdaftar.'));
  }

  window.addEventListener('online', () => {
    showMessage('Kembali online. Mulai sinkronisasi.', 'success');
    syncPendingActions();
  });

  window.addEventListener('offline', () => {
    showMessage('Koneksi terputus. Mode offline aktif.', 'warning');
    renderApp();
  });
});
