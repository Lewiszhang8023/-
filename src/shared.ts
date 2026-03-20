export type EquipmentStatus = '在库' | '借出' | '维修中';
export type StockAction = '出库' | '入库';

export type Equipment = {
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

export type StockLog = {
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

export type BootstrapPayload = {
  items: Equipment[];
  logs: StockLog[];
  apiBaseUrl: string;
  mobileHosts: { address: string; mobileUrl: string }[];
  dataFilePath: string;
};

export const emptyForm: Omit<Equipment, 'id' | 'updatedAt' | 'lastActionAt'> = {
  assetCode: '',
  name: '',
  category: '相机',
  brand: '',
  model: '',
  serialNumber: '',
  status: '在库',
  location: '',
  keeper: '器材管理员',
  borrower: '',
  returner: '',
  purchaseDate: '',
  notes: ''
};
