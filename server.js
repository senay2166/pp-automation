const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'server-data.json');

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    saveData(getInitialServerData());
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    return getInitialServerData();
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getInitialServerData() {
  return {
    users: [
      { email: 'admin@demo', password: 'demo123', name: 'Admin Pusat', role: 'admin', area: 'all' },
      { email: 'user@lapangan', password: 'lapangan123', name: 'Engineer Lapangan', role: 'engineer', area: 'field' }
    ],
    assets: [
      { id: 'AST-001', name: 'Panel Utama', area: 'field', location: 'Site A', qr: 'AST-001', status: 'Aktif', updatedAt: new Date().toISOString() }
    ],
    repairs: [
      { id: 'REP-001', assetId: 'AST-001', date: new Date().toISOString(), user: 'Engineer Lapangan', role: 'engineer', area: 'field', note: 'Pembersihan konektor', action: 'Diperbaiki', synced: true, updatedAt: new Date().toISOString() }
    ],
    pendingSync: [],
    lastSync: null,
    areaSettings: {
      all: { name: 'Semua Area', color: '#6366f1' },
      field: { name: 'Lapangan', color: '#22c55e' },
      warehouse: { name: 'Gudang', color: '#f59e0b' }
    },
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

function applyRecord(serverData, record) {
  if (!record || !record.type || !record.data) return;

  const timestamp = new Date().toISOString();
  const recordData = { ...record.data, updatedAt: timestamp };

  switch (record.type) {
    case 'asset': {
      const existing = serverData.assets.find(a => a.id === recordData.id);
      if (existing) {
        Object.assign(existing, recordData);
      } else {
        serverData.assets.push(recordData);
      }
      break;
    }
    case 'repair': {
      const id = recordData.id || `REP-${Date.now()}`;
      const existing = serverData.repairs.find(r => r.id === id);
      if (existing) {
        Object.assign(existing, recordData);
      } else {
        serverData.repairs.push({ ...recordData, id });
      }
      break;
    }
    case 'user': {
      const existing = serverData.users.find(u => u.email === recordData.email);
      if (existing) {
        Object.assign(existing, recordData);
      } else {
        serverData.users.push(recordData);
      }
      break;
    }
    case 'menu': {
      const existing = serverData.menuConfig.find(m => m.id === recordData.id);
      if (existing) {
        Object.assign(existing, recordData);
      } else {
        serverData.menuConfig.push(recordData);
      }
      break;
    }
    case 'area': {
      serverData.areaSettings[recordData.id] = { name: recordData.name, color: recordData.color };
      break;
    }
    case 'audit': {
      serverData.auditLog.unshift({ id: recordData.id || `audit-${Date.now()}`, ...recordData, timestamp });
      if (serverData.auditLog.length > 250) serverData.auditLog.pop();
      break;
    }
    default:
      break;
  }
}

function mergeClientState(serverData, clientState = {}) {
  if (!clientState) return serverData;

  const newData = { ...serverData };

  if (Array.isArray(clientState.assets)) {
    clientState.assets.forEach(asset => {
      if (!asset.id) return;
      const existing = newData.assets.find(a => a.id === asset.id);
      if (!existing || new Date(asset.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
        newData.assets = newData.assets.filter(a => a.id !== asset.id);
        newData.assets.push(asset);
      }
    });
  }

  if (Array.isArray(clientState.repairs)) {
    clientState.repairs.forEach(repair => {
      if (!repair.id) return;
      if (!newData.repairs.some(r => r.id === repair.id)) {
        newData.repairs.push(repair);
      }
    });
  }

  if (Array.isArray(clientState.menuConfig)) {
    clientState.menuConfig.forEach(menuItem => {
      const existing = newData.menuConfig.find(m => m.id === menuItem.id);
      if (!existing) newData.menuConfig.push(menuItem);
    });
  }

  if (Array.isArray(clientState.users)) {
    clientState.users.forEach(user => {
      if (!user.email) return;
      const existing = newData.users.find(u => u.email === user.email);
      if (!existing) newData.users.push(user);
    });
  }

  if (clientState.areaSettings && typeof clientState.areaSettings === 'object') {
    newData.areaSettings = { ...newData.areaSettings, ...clientState.areaSettings };
  }

  if (Array.isArray(clientState.auditLog)) {
    clientState.auditLog.forEach(entry => {
      if (!newData.auditLog.some(a => a.id === entry.id)) {
        newData.auditLog.unshift(entry);
      }
    });
    newData.auditLog = newData.auditLog.slice(0, 250);
  }

  return newData;
}

app.get('/state', (req, res) => {
  const data = loadData();
  res.json(data);
});

app.post('/sync', (req, res) => {
  const serverData = loadData();
  const { pendingSync = [], clientState = {} } = req.body;

  pendingSync.forEach(record => applyRecord(serverData, record));

  const merged = mergeClientState(serverData, clientState);
  merged.lastSync = new Date().toISOString();
  merged.pendingSync = [];

  saveData(merged);
  res.json(merged);
});

app.options('*', (req, res) => {
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Sync server running on http://localhost:${PORT}`);
});
