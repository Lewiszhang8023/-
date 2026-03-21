import { BootstrapPayload, Equipment, StockAction, StockLog } from './shared';

const apiBaseUrl = window.deviceApp?.apiBaseUrl ?? 'http://127.0.0.1:3210';
const isBrowserOnly = !window.deviceApp;
const STORAGE_KEY = 'photo-gear-browser-db';

type BrowserDatabase = {
  items: Equipment[];
  logs: StockLog[];
};

const browserSeed: BrowserDatabase = {
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
      location: '浏览器演示库 / 01',
      keeper: '演示管理员',
      borrower: '',
      returner: '',
      purchaseDate: '2025-05-16',
      notes: '浏览器模式演示数据。',
      updatedAt: new Date().toISOString(),
      lastActionAt: new Date().toISOString()
    }
  ],
  logs: []
};

function readBrowserDb(): BrowserDatabase {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(browserSeed));
    return browserSeed;
  }
  try {
    return JSON.parse(raw) as BrowserDatabase;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(browserSeed));
    return browserSeed;
  }
}

function writeBrowserDb(next: BrowserDatabase) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function browserBootstrap(): BootstrapPayload {
  const db = readBrowserDb();
  return {
    ...db,
    apiBaseUrl: window.location.origin,
    mobileHosts: [],
    dataFilePath: 'browser-localStorage'
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: async () => (isBrowserOnly ? browserBootstrap() : request<BootstrapPayload>('/api/bootstrap')),
  saveItem: async (item: Equipment) => {
    if (!isBrowserOnly) {
      return request<BootstrapPayload>('/api/items/save', { method: 'POST', body: JSON.stringify(item) });
    }
    const db = readBrowserDb();
    const index = db.items.findIndex((entry) => entry.id === item.id);
    if (index >= 0) db.items[index] = item; else db.items.unshift(item);
    writeBrowserDb(db);
    return browserBootstrap();
  },
  deleteItem: async (id: string) => {
    if (!isBrowserOnly) {
      return request<BootstrapPayload>('/api/items/delete', { method: 'POST', body: JSON.stringify({ id }) });
    }
    const db = readBrowserDb();
    db.items = db.items.filter((item) => item.id !== id);
    db.logs = db.logs.filter((log) => log.equipmentId !== id);
    writeBrowserDb(db);
    return browserBootstrap();
  },
  importData: async (payload: { items: Equipment[]; logs: StockLog[] }) => {
    if (!isBrowserOnly) {
      return request<BootstrapPayload>('/api/items/import', { method: 'POST', body: JSON.stringify(payload) });
    }
    writeBrowserDb(payload);
    return browserBootstrap();
  },
  stockAction: async (equipmentId: string, action: StockAction, person: string, channel: StockLog['channel']) => {
    if (!isBrowserOnly) {
      return request<BootstrapPayload>('/api/stock/action', {
        method: 'POST',
        body: JSON.stringify({ equipmentId, action, person, channel })
      });
    }
    const db = readBrowserDb();
    const item = db.items.find((entry) => entry.id === equipmentId);
    if (!item) throw new Error('设备不存在');
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
    writeBrowserDb(db);
    return browserBootstrap();
  },
  lookup: async (code: string) => {
    if (!isBrowserOnly) {
      return request<Equipment>('/api/lookup', { method: 'POST', body: JSON.stringify({ code }) });
    }
    const db = readBrowserDb();
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
    if (!item) throw new Error('未找到设备');
    return item;
  }
};
