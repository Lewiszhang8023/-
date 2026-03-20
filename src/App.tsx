import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

type Equipment = {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: '在库' | '借出' | '维修中';
  location: string;
  owner: string;
  purchaseDate: string;
  notes: string;
  updatedAt: string;
};

type FormState = Omit<Equipment, 'id' | 'updatedAt'>;

const STORAGE_KEY = 'photo-gear-manager-items';

const emptyForm: FormState = {
  name: '',
  category: '相机',
  brand: '',
  model: '',
  serialNumber: '',
  status: '在库',
  location: '',
  owner: '',
  purchaseDate: '',
  notes: ''
};

const seedData: Equipment[] = [
  {
    id: crypto.randomUUID(),
    name: '主力机身',
    category: '相机',
    brand: 'Sony',
    model: 'A7 IV',
    serialNumber: 'SN-A7IV-001',
    status: '在库',
    location: 'A库房 / 防潮柜1',
    owner: '器材管理员',
    purchaseDate: '2025-05-16',
    notes: '婚礼组默认机身。',
    updatedAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    name: '采访灯',
    category: '灯光',
    brand: 'Aputure',
    model: 'Amaran 60x',
    serialNumber: 'LGT-60X-018',
    status: '借出',
    location: '外拍箱 03',
    owner: '视频组',
    purchaseDate: '2024-11-02',
    notes: '带 V 口电池适配板。',
    updatedAt: new Date().toISOString()
  }
];

function loadItems(): Equipment[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedData;
  try {
    return JSON.parse(raw) as Equipment[];
  } catch {
    return seedData;
  }
}

function App() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'全部' | Equipment['status']>('全部');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    setItems(loadItems());
  }, []);

  useEffect(() => {
    if (items.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }, [items]);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [activeId, items]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesKeyword =
        [item.name, item.category, item.brand, item.model, item.serialNumber, item.location, item.owner]
          .join(' ')
          .toLowerCase()
          .includes(keyword.trim().toLowerCase());
      const matchesStatus = statusFilter === '全部' || item.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [items, keyword, statusFilter]);

  useEffect(() => {
    if (!activeItem) {
      setQrImage('');
      return;
    }
    const payload = JSON.stringify({
      id: activeItem.id,
      name: activeItem.name,
      serialNumber: activeItem.serialNumber,
      location: activeItem.location,
      status: activeItem.status
    });
    QRCode.toDataURL(payload, { width: 220, margin: 1 }).then(setQrImage);
  }, [activeItem]);

  async function startScanner() {
    if (scannerRef.current) return;
    const scanner = new Html5Qrcode('reader');
    scannerRef.current = scanner;
    setScannerOpen(true);
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          try {
            const parsed = JSON.parse(decodedText) as { id?: string; serialNumber?: string };
            const match = items.find(
              (item) => item.id === parsed.id || item.serialNumber === parsed.serialNumber
            );
            if (match) {
              setActiveId(match.id);
              stopScanner();
            }
          } catch {
            // ignore invalid qr payload
          }
        },
        () => undefined
      );
    } catch (error) {
      console.error(error);
      setScannerOpen(false);
      scannerRef.current = null;
      alert('无法启动摄像头扫码，请确认本机摄像头权限已经开启。');
    }
  }

  async function stopScanner() {
    if (!scannerRef.current) return;
    await scannerRef.current.stop();
    await scannerRef.current.clear();
    scannerRef.current = null;
    setScannerOpen(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload: Equipment = {
      ...form,
      id: activeItem?.id ?? crypto.randomUUID(),
      updatedAt: new Date().toISOString()
    };

    setItems((current) => {
      const exists = current.some((item) => item.id === payload.id);
      return exists
        ? current.map((item) => (item.id === payload.id ? payload : item))
        : [payload, ...current];
    });
    setActiveId(payload.id);
    setForm(emptyForm);
  }

  function handleEdit(item: Equipment) {
    setActiveId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      brand: item.brand,
      model: item.model,
      serialNumber: item.serialNumber,
      status: item.status,
      location: item.location,
      owner: item.owner,
      purchaseDate: item.purchaseDate,
      notes: item.notes
    });
  }

  function handleDelete(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setForm(emptyForm);
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `photo-gear-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((content) => {
      const parsed = JSON.parse(content) as Equipment[];
      setItems(parsed);
      setActiveId(parsed[0]?.id ?? null);
      setForm(emptyForm);
    });
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local-first / Apple 安装支持</p>
          <h1>摄影器材设备管理</h1>
          <p className="muted">
            支持本地化部署、库内修改、二维码生成与扫码定位设备，适合工作室、影棚、器材室内部使用。
          </p>
        </div>

        <div className="stats-grid">
          <article>
            <strong>{items.length}</strong>
            <span>设备总数</span>
          </article>
          <article>
            <strong>{items.filter((item) => item.status === '在库').length}</strong>
            <span>在库中</span>
          </article>
          <article>
            <strong>{items.filter((item) => item.status === '借出').length}</strong>
            <span>已借出</span>
          </article>
        </div>

        <div className="panel">
          <h2>数据管理</h2>
          <div className="actions vertical">
            <button onClick={exportData}>导出 JSON 备份</button>
            <label className="file-input">
              导入 JSON 数据
              <input type="file" accept="application/json" onChange={importData} />
            </label>
          </div>
          <small className="muted">数据默认保存在当前设备浏览器 / Electron 本地存储，无需联网。</small>
        </div>

        <div className="panel">
          <h2>扫码管理</h2>
          <div className="actions vertical">
            {!scannerOpen ? (
              <button onClick={startScanner}>打开摄像头扫码</button>
            ) : (
              <button className="ghost" onClick={stopScanner}>
                关闭扫码
              </button>
            )}
          </div>
          <div id="reader" className={scannerOpen ? 'scanner active' : 'scanner'} />
        </div>
      </aside>

      <main className="content">
        <section className="panel form-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">设备维护</p>
              <h2>{activeItem ? '编辑器材' : '新增器材'}</h2>
            </div>
            {window.deviceApp?.platform && <span className="badge">{window.deviceApp.platform}</span>}
          </div>

          <form className="equipment-form" onSubmit={handleSubmit}>
            {[
              ['器材名称', 'name'],
              ['品牌', 'brand'],
              ['型号', 'model'],
              ['序列号', 'serialNumber'],
              ['存放位置', 'location'],
              ['负责人', 'owner'],
              ['采购日期', 'purchaseDate']
            ].map(([label, key]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type={key === 'purchaseDate' ? 'date' : 'text'}
                  value={form[key as keyof FormState]}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [key]: event.target.value }))
                  }
                  required={['name', 'brand', 'model', 'serialNumber'].includes(key)}
                />
              </label>
            ))}

            <label>
              <span>器材类别</span>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              >
                <option>相机</option>
                <option>镜头</option>
                <option>灯光</option>
                <option>稳定器</option>
                <option>录音</option>
                <option>附件</option>
              </select>
            </label>

            <label>
              <span>设备状态</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({ ...current, status: event.target.value as Equipment['status'] }))
                }
              >
                <option>在库</option>
                <option>借出</option>
                <option>维修中</option>
              </select>
            </label>

            <label className="full-width">
              <span>备注</span>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <div className="actions full-width">
              <button type="submit">{activeItem ? '保存修改' : '新增设备'}</button>
              <button type="button" className="ghost" onClick={() => setForm(emptyForm)}>
                清空表单
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">库存列表</p>
              <h2>支持检索、筛选和二维码定位</h2>
            </div>
            <div className="toolbar">
              <input
                placeholder="搜索品牌 / 型号 / 序列号 / 负责人"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option>全部</option>
                <option>在库</option>
                <option>借出</option>
                <option>维修中</option>
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类别</th>
                  <th>品牌 / 型号</th>
                  <th>序列号</th>
                  <th>状态</th>
                  <th>位置</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className={activeId === item.id ? 'selected' : ''}>
                    <td>{item.name}</td>
                    <td>{item.category}</td>
                    <td>
                      {item.brand} / {item.model}
                    </td>
                    <td>{item.serialNumber}</td>
                    <td>
                      <span className={`status ${item.status}`}>{item.status}</span>
                    </td>
                    <td>{item.location}</td>
                    <td>
                      <div className="actions compact">
                        <button className="ghost" onClick={() => setActiveId(item.id)}>
                          查看二维码
                        </button>
                        <button className="ghost" onClick={() => handleEdit(item)}>
                          编辑
                        </button>
                        <button className="danger" onClick={() => handleDelete(item.id)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <section className="panel qr-panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">二维码卡片</p>
            <h2>{activeItem ? activeItem.name : '请选择设备'}</h2>
          </div>
        </div>

        {activeItem ? (
          <>
            <div className="qr-card">
              {qrImage && <img src={qrImage} alt={`${activeItem.name} 的二维码`} />}
              <div>
                <h3>{activeItem.brand} {activeItem.model}</h3>
                <p>序列号：{activeItem.serialNumber}</p>
                <p>状态：{activeItem.status}</p>
                <p>位置：{activeItem.location}</p>
                <p>更新：{new Date(activeItem.updatedAt).toLocaleString('zh-CN')}</p>
              </div>
            </div>
            <small className="muted">建议将二维码打印后贴在器材上，扫码后即可在本机快速定位和编辑该设备。</small>
          </>
        ) : (
          <p className="muted">从中间列表选择设备后，即可生成二维码卡片。</p>
        )}
      </section>
    </div>
  );
}

export default App;
