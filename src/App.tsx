import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from './api';
import { BootstrapPayload, emptyForm, Equipment, EquipmentStatus, StockAction, StockLog } from './shared';

type ScanDialogState = {
  item: Equipment;
  source: StockLog['channel'];
  code: string;
};

const categories = ['相机', '镜头', '灯光', '稳定器', '录音', '附件'];

function App() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'全部' | EquipmentStatus>('全部');
  const [mobileHosts, setMobileHosts] = useState<{ address: string; mobileUrl: string }[]>([]);
  const [dataFilePath, setDataFilePath] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [message, setMessage] = useState('');
  const [scanDialog, setScanDialog] = useState<ScanDialogState | null>(null);
  const [scanAction, setScanAction] = useState<StockAction>('出库');
  const [scanPerson, setScanPerson] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'camera' | 'gun'>('camera');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const gunBuffer = useRef('');
  const gunTimestamp = useRef(0);

  async function refresh() {
    const payload = await api.bootstrap();
    hydrate(payload);
  }

  function hydrate(payload: BootstrapPayload) {
    setItems(payload.items);
    setLogs(payload.logs);
    setMobileHosts(payload.mobileHosts);
    setDataFilePath(payload.dataFilePath);
    if (!activeId && payload.items[0]) {
      setActiveId(payload.items[0].id);
    }
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(String(error)));
  }, []);

  const activeItem = useMemo(() => items.find((item) => item.id === activeId) ?? null, [activeId, items]);

  useEffect(() => {
    if (!activeItem) {
      setQrImage('');
      return;
    }
    const payload = JSON.stringify({
      id: activeItem.id,
      assetCode: activeItem.assetCode,
      serialNumber: activeItem.serialNumber,
      name: activeItem.name
    });
    QRCode.toDataURL(payload, { width: 220, margin: 1 }).then(setQrImage);
  }, [activeItem]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!scannerOpen || scannerMode !== 'gun') return;
      const now = Date.now();
      if (now - gunTimestamp.current > 50) {
        gunBuffer.current = '';
      }
      gunTimestamp.current = now;
      if (event.key === 'Enter') {
        if (gunBuffer.current.trim()) {
          lookupScan(gunBuffer.current.trim(), '扫码枪');
        }
        gunBuffer.current = '';
        return;
      }
      if (event.key.length === 1) {
        gunBuffer.current += event.key;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scannerOpen, scannerMode, items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesKeyword = [item.assetCode, item.name, item.brand, item.model, item.serialNumber, item.borrower, item.returner, item.location]
        .join(' ')
        .toLowerCase()
        .includes(keyword.trim().toLowerCase());
      const matchesStatus = statusFilter === '全部' || item.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [items, keyword, statusFilter]);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    const payload: Equipment = {
      ...form,
      id: activeItem?.id ?? crypto.randomUUID(),
      updatedAt: now,
      lastActionAt: activeItem?.lastActionAt ?? now
    };
    const result = await api.saveItem(payload);
    hydrate(result);
    setActiveId(payload.id);
    setMessage(`${payload.name} 已保存。`);
    setForm(emptyForm);
  }

  function handleEdit(item: Equipment) {
    setActiveId(item.id);
    setForm({
      assetCode: item.assetCode,
      name: item.name,
      category: item.category,
      brand: item.brand,
      model: item.model,
      serialNumber: item.serialNumber,
      status: item.status,
      location: item.location,
      keeper: item.keeper,
      borrower: item.borrower,
      returner: item.returner,
      purchaseDate: item.purchaseDate,
      notes: item.notes
    });
  }

  async function handleDelete(id: string) {
    const result = await api.deleteItem(id);
    hydrate(result);
    if (activeId === id) {
      setActiveId(null);
      setForm(emptyForm);
    }
  }

  function exportExcel() {
    const itemSheet = XLSX.utils.json_to_sheet(items);
    const logSheet = XLSX.utils.json_to_sheet(logs);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, itemSheet, '设备');
    XLSX.utils.book_append_sheet(workbook, logSheet, '出入库记录');
    XLSX.writeFile(workbook, `photo-gear-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.arrayBuffer().then(async (buffer) => {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const itemSheet = workbook.Sheets['设备'] ?? workbook.Sheets[workbook.SheetNames[0]];
      const logSheet = workbook.Sheets['出入库记录'];
      const nextItems = (XLSX.utils.sheet_to_json(itemSheet) as Equipment[]).map((item) => ({
        ...item,
        borrower: item.borrower ?? '',
        returner: item.returner ?? '',
        keeper: item.keeper ?? '器材管理员'
      }));
      const nextLogs = logSheet ? (XLSX.utils.sheet_to_json(logSheet) as StockLog[]) : [];
      const result = await api.importData({ items: nextItems, logs: nextLogs });
      hydrate(result);
      setMessage(`已导入 ${nextItems.length} 条设备记录。`);
    });
  }

  async function lookupScan(code: string, source: StockLog['channel']) {
    try {
      const item = await api.lookup(code);
      setScanDialog({ item, source, code });
      setScanAction(item.status === '借出' ? '入库' : '出库');
      setScanPerson('');
      setActiveId(item.id);
      setMessage(`已识别设备：${item.name}`);
    } catch {
      setMessage(`未识别到设备编码：${code}`);
    }
  }

  async function startCameraScanner() {
    if (scannerRef.current) return;
    const scanner = new Html5Qrcode('reader');
    scannerRef.current = scanner;
    setScannerOpen(true);
    setScannerMode('camera');
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => lookupScan(decodedText, '桌面扫码'),
      () => undefined
    );
  }

  async function stopScanner() {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      await scannerRef.current.clear();
      scannerRef.current = null;
    }
    setScannerOpen(false);
  }

  async function submitScanAction() {
    if (!scanDialog || !scanPerson.trim()) {
      setMessage('请填写领用人或归还人。');
      return;
    }
    const result = await api.stockAction(scanDialog.item.id, scanAction, scanPerson.trim(), scanDialog.source);
    hydrate(result);
    setMessage(`${scanDialog.item.name} 已${scanAction}。`);
    setScanDialog(null);
    setScanPerson('');
  }

  return (
    <div className="app-shell">
      <header className="hero panel">
        <div>
          <p className="eyebrow">真正可做 DMG 的本地器材管理桌面端</p>
          <h1>摄影器材设备管理</h1>
          <p className="muted">支持电脑扫码、扫码枪、iOS/Android 手机辅助扫码、Excel 导入导出，以及出入库人员追踪。</p>
        </div>
        <div className="hero-meta">
          <span className="badge">{window.deviceApp?.platform ?? 'desktop'}</span>
          <span className="badge">数据文件：{dataFilePath || '加载中...'}</span>
        </div>
      </header>

      <div className="responsive-grid">
        <aside className="left-column">
          <section className="panel">
            <h2>统计</h2>
            <div className="stats-grid">
              <article><strong>{items.length}</strong><span>总设备</span></article>
              <article><strong>{items.filter((item) => item.status === '在库').length}</strong><span>在库</span></article>
              <article><strong>{items.filter((item) => item.status === '借出').length}</strong><span>借出</span></article>
            </div>
          </section>

          <section className="panel">
            <h2>Excel 数据</h2>
            <div className="actions vertical">
              <button onClick={exportExcel}>导出 Excel</button>
              <label className="file-input">导入 Excel<input type="file" accept=".xlsx,.xls" onChange={importExcel} /></label>
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">扫码中心</p>
                <h2>支持摄像头 / 扫码枪</h2>
              </div>
            </div>
            <div className="actions vertical">
              <button onClick={startCameraScanner}>打开电脑摄像头扫码</button>
              <button className={scannerMode === 'gun' ? 'active' : 'ghost'} onClick={() => { setScannerOpen(true); setScannerMode('gun'); setMessage('扫码枪模式已开启，请将焦点留在窗口并扫码后回车。'); }}>
                启用扫码枪模式
              </button>
              <button className="ghost" onClick={stopScanner}>关闭扫码</button>
            </div>
            <div id="reader" className={scannerOpen && scannerMode === 'camera' ? 'scanner active' : 'scanner'} />
            <small className="muted">扫码后会弹出“出库 / 入库”选择窗口，并填写领用人或归还人。</small>
          </section>

          <section className="panel">
            <h2>手机扫码入口</h2>
            <p className="muted">让 iPhone / Android 手机访问下列同局域网地址即可扫码回传到电脑。</p>
            <div className="host-list">
              {mobileHosts.map((host) => (
                <article key={host.address}>
                  <strong>{host.address}</strong>
                  <a href={host.mobileUrl} target="_blank" rel="noreferrer">{host.mobileUrl}</a>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <main className="center-column">
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">设备维护</p>
                <h2>{activeItem ? '编辑设备' : '新增设备'}</h2>
              </div>
              <span className="muted">自动适配窗口尺寸</span>
            </div>
            <form className="equipment-form" onSubmit={handleSubmit}>
              {[
                ['资产编码', 'assetCode'],
                ['设备名称', 'name'],
                ['品牌', 'brand'],
                ['型号', 'model'],
                ['序列号', 'serialNumber'],
                ['保管人', 'keeper'],
                ['领用人', 'borrower'],
                ['归还人', 'returner'],
                ['存放位置', 'location'],
                ['采购日期', 'purchaseDate']
              ].map(([label, key]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type={key === 'purchaseDate' ? 'date' : 'text'}
                    value={form[key as keyof typeof form]}
                    onChange={(event) => updateField(key as keyof typeof form, event.target.value as never)}
                  />
                </label>
              ))}
              <label>
                <span>器材类别</span>
                <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                <span>当前状态</span>
                <select value={form.status} onChange={(event) => updateField('status', event.target.value as EquipmentStatus)}>
                  <option>在库</option>
                  <option>借出</option>
                  <option>维修中</option>
                </select>
              </label>
              <label className="full-width">
                <span>备注</span>
                <textarea rows={4} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
              </label>
              <div className="actions full-width">
                <button type="submit">保存设备</button>
                <button type="button" className="ghost" onClick={() => setForm(emptyForm)}>清空表单</button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="section-title wrap-on-small">
              <div>
                <p className="eyebrow">库存列表</p>
                <h2>检索 / 状态 / 扫码定位</h2>
              </div>
              <div className="toolbar">
                <input placeholder="搜索资产编码 / 型号 / 领用人 / 归还人" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
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
                    <th>资产编码</th>
                    <th>设备</th>
                    <th>状态</th>
                    <th>领用人</th>
                    <th>归还人</th>
                    <th>位置</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className={item.id === activeId ? 'selected' : ''}>
                      <td>{item.assetCode}</td>
                      <td>{item.brand} {item.model}<br /><small>{item.name}</small></td>
                      <td><span className={`status ${item.status}`}>{item.status}</span></td>
                      <td>{item.borrower || '-'}</td>
                      <td>{item.returner || '-'}</td>
                      <td>{item.location}</td>
                      <td>
                        <div className="actions compact">
                          <button className="ghost" onClick={() => setActiveId(item.id)}>二维码</button>
                          <button className="ghost" onClick={() => handleEdit(item)}>编辑</button>
                          <button className="danger" onClick={() => handleDelete(item.id)}>删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="right-column">
          <section className="panel">
            <h2>二维码卡片</h2>
            {activeItem ? (
              <div className="qr-card vertical-card">
                {qrImage && <img src={qrImage} alt={`${activeItem.name} 二维码`} />}
                <div>
                  <h3>{activeItem.name}</h3>
                  <p>{activeItem.assetCode}</p>
                  <p>{activeItem.brand} {activeItem.model}</p>
                  <p>领用人：{activeItem.borrower || '-'}</p>
                  <p>归还人：{activeItem.returner || '-'}</p>
                </div>
              </div>
            ) : <p className="muted">选择设备后生成二维码。</p>}
          </section>

          <section className="panel">
            <h2>最近出入库记录</h2>
            <div className="log-list">
              {logs.slice(0, 12).map((log) => (
                <article key={log.id}>
                  <strong>{log.equipmentName}</strong>
                  <span>{log.action} / {log.person}</span>
                  <span>{log.channel}</span>
                  <small>{new Date(log.timestamp).toLocaleString('zh-CN')}</small>
                </article>
              ))}
            </div>
          </section>

          {message && <section className="panel"><p>{message}</p></section>}
        </aside>
      </div>

      {scanDialog && (
        <div className="modal-backdrop">
          <div className="modal panel">
            <p className="eyebrow">扫码结果</p>
            <h2>{scanDialog.item.name}</h2>
            <p>{scanDialog.item.assetCode} / {scanDialog.item.serialNumber}</p>
            <div className="segmented">
              <button className={scanAction === '出库' ? 'active' : 'ghost'} onClick={() => setScanAction('出库')}>出库</button>
              <button className={scanAction === '入库' ? 'active' : 'ghost'} onClick={() => setScanAction('入库')}>入库</button>
            </div>
            <input placeholder={scanAction === '出库' ? '请输入领用人' : '请输入归还人'} value={scanPerson} onChange={(event) => setScanPerson(event.target.value)} />
            <div className="actions">
              <button onClick={submitScanAction}>确认</button>
              <button className="ghost" onClick={() => setScanDialog(null)}>取消</button>
            </div>
            <small className="muted">扫码来源：{scanDialog.source} / 编码：{scanDialog.code}</small>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
