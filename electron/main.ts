import { app, BrowserWindow, shell } from 'electron';
import express from 'express';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const API_PORT = 3210;
const isDev = !app.isPackaged;
const dataFilePath = path.join(app.getPath('userData'), 'inventory.json');

type EquipmentStatus = '在库' | '借出' | '维修中';
type StockAction = '出库' | '入库';

type Equipment = {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: EquipmentStatus;
  location: string;
  keeper: string;
  borrower: string;
  returner: string;
  purchaseDate: string;
  notes: string;
  updatedAt: string;
  lastActionAt: string;
};

type StockLog = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  assetCode: string;
  serialNumber: string;
  action: StockAction;
  person: string;
  channel: '桌面扫码' | '扫码枪' | '手机扫码' | '手动编辑';
  timestamp: string;
};

type Database = {
  items: Equipment[];
  logs: StockLog[];
};

const seedData: Database = {
  items: [
    {
      id: crypto.randomUUID(),
      assetCode: 'CAM-001',
      name: '主力机身',
      category: '相机',
      brand: 'Sony',
      model: 'A7 IV',
      serialNumber: 'SN-A7IV-001',
      status: '在库',
      location: 'A库房 / 防潮柜1',
      keeper: '器材管理员',
      borrower: '',
      returner: '',
      purchaseDate: '2025-05-16',
      notes: '婚礼组默认机身。',
      updatedAt: new Date().toISOString(),
      lastActionAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      assetCode: 'LGT-018',
      name: '采访灯',
      category: '灯光',
      brand: 'Aputure',
      model: 'Amaran 60x',
      serialNumber: 'LGT-60X-018',
      status: '借出',
      location: '外拍箱 03',
      keeper: '器材管理员',
      borrower: '视频组',
      returner: '',
      purchaseDate: '2024-11-02',
      notes: '带 V 口电池适配板。',
      updatedAt: new Date().toISOString(),
      lastActionAt: new Date().toISOString()
    }
  ],
  logs: []
};

function ensureDataFile() {
  if (!fs.existsSync(path.dirname(dataFilePath))) {
    fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
  }
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify(seedData, null, 2), 'utf8');
  }
}

function readDb(): Database {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(dataFilePath, 'utf8')) as Database;
  } catch {
    return seedData;
  }
}

function writeDb(db: Database) {
  ensureDataFile();
  fs.writeFileSync(dataFilePath, JSON.stringify(db, null, 2), 'utf8');
}

function getNetworkUrls() {
  const interfaces = Object.values(os.networkInterfaces()).flat().filter(Boolean) as os.NetworkInterfaceInfo[];
  return interfaces
    .filter((net) => net.family === 'IPv4' && !net.internal)
    .map((net) => ({
      address: net.address,
      mobileUrl: `http://${net.address}:${API_PORT}/mobile.html`
    }));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 720,
    title: '摄影器材设备管理',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.loadURL(isDev ? 'http://127.0.0.1:5173' : `http://127.0.0.1:${API_PORT}`);
}

function applyStockAction(equipmentId: string, action: StockAction, person: string, channel: StockLog['channel']) {
  const db = readDb();
  const item = db.items.find((entry) => entry.id === equipmentId);
  if (!item) {
    return null;
  }

  const now = new Date().toISOString();
  item.status = action === '出库' ? '借出' : '在库';
  item.borrower = action === '出库' ? person : item.borrower;
  item.returner = action === '入库' ? person : item.returner;
  item.updatedAt = now;
  item.lastActionAt = now;

  db.logs.unshift({
    id: crypto.randomUUID(),
    equipmentId: item.id,
    equipmentName: item.name,
    assetCode: item.assetCode,
    serialNumber: item.serialNumber,
    action,
    person,
    channel,
    timestamp: now
  });

  writeDb(db);
  return { item, logs: db.logs.slice(0, 50) };
}

function buildAppServer() {
  const server = express();
  server.use(express.json({ limit: '10mb' }));

  server.get('/api/bootstrap', (_request, response) => {
    const db = readDb();
    response.json({
      ...db,
      apiBaseUrl: `http://127.0.0.1:${API_PORT}`,
      mobileHosts: getNetworkUrls(),
      dataFilePath
    });
  });

  server.post('/api/items/save', (request, response) => {
    const incoming = request.body as Equipment;
    const db = readDb();
    const existing = db.items.findIndex((item) => item.id === incoming.id);
    if (existing >= 0) {
      db.items[existing] = incoming;
    } else {
      db.items.unshift(incoming);
    }
    writeDb(db);
    response.json(db);
  });

  server.post('/api/items/delete', (request, response) => {
    const { id } = request.body as { id: string };
    const db = readDb();
    db.items = db.items.filter((item) => item.id !== id);
    db.logs = db.logs.filter((log) => log.equipmentId !== id);
    writeDb(db);
    response.json(db);
  });

  server.post('/api/items/import', (request, response) => {
    const payload = request.body as Database;
    writeDb(payload);
    response.json(payload);
  });

  server.post('/api/stock/action', (request, response) => {
    const { equipmentId, action, person, channel } = request.body as {
      equipmentId: string;
      action: StockAction;
      person: string;
      channel: StockLog['channel'];
    };
    const result = applyStockAction(equipmentId, action, person, channel);
    if (!result) {
      response.status(404).json({ message: '设备不存在' });
      return;
    }
    response.json(readDb());
  });

  server.post('/api/lookup', (request, response) => {
    const { code } = request.body as { code: string };
    const db = readDb();
    const normalized = code.trim();
    let parsed: Partial<Equipment> = {};
    try {
      parsed = JSON.parse(normalized) as Partial<Equipment>;
    } catch {
      parsed = {};
    }
    const item = db.items.find(
      (entry) =>
        entry.id === normalized ||
        entry.id === parsed.id ||
        entry.assetCode === normalized ||
        entry.assetCode === parsed.assetCode ||
        entry.serialNumber === normalized ||
        entry.serialNumber === parsed.serialNumber
    );
    if (!item) {
      response.status(404).json({ message: '未找到设备' });
      return;
    }
    response.json(item);
  });

  if (!isDev) {
    server.use(express.static(path.join(__dirname, '../dist')));
    server.get('/', (_request, response) => {
      response.sendFile(path.join(__dirname, '../dist/index.html'));
    });
    server.get('/mobile.html', (_request, response) => {
      response.sendFile(path.join(__dirname, '../dist/mobile.html'));
    });
  }

  return server.listen(API_PORT, '0.0.0.0');
}

app.whenReady().then(() => {
  buildAppServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
