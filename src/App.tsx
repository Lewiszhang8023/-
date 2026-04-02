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

const excelColumns: Array<{ key: keyof Equipment; label: string }> = [
  { key: 'assetCode', label: '资产编码' },
  { key: 'name', label: '设备名称' },
  { key: 'category', label: '器材类别' },
  { key: 'brand', label: '品牌' },
  { key: 'model', label: '型号' },
  { key: 'serialNumber', label: '序列号' },
  { key: 'status', label: '设备状态' },
  { key: 'location', label: '存放位置' },
  { key: 'keeper', label: '保管人' },
  { key: 'borrower', label: '领用人' },
  { key: 'returner', label: '归还人' },
  { key: 'purchaseDate', label: '采购日期' },
  { key: 'notes', label: '备注' },
  { key: 'updatedAt', label: '更新时间' },
  { key: 'lastActionAt', label: '最后出入库时间' }
];

const logColumns: Array<{ key: keyof StockLog; label: string }> = [
  { key: 'equipmentName', label: '设备名称' },
  { key: 'assetCode', label: '资产编码' },
  { key: 'serialNumber', label: '序列号' },
  { key: 'action', label: '动作' },
  { key: 'person', label: '处理人' },
  { key: 'channel', label: '来源' },
  { key: 'timestamp', label: '时间' }
];

const headerToField = new Map(excelColumns.map((column) => [column.label, column.key]));
const logHeaderToField = new Map(logColumns.map((column) => [column.label, column.key]));

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
  const [mobileEntryQr, setMobileEntryQr] = useState('');
  const [message, setMessage] = useState('');
  const [scanDialog, setScanDialog] = useState<ScanDialogState | null>(null);
  const [scanAction, setScanAction] = useState<StockAction>('出库');
  const [scanPerson, setScanPerson] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'camera' | 'gun' | 'idle'>('idle');
  const [manualCode, setManualCode] = useState('');
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
    const entry = mobileHosts[0]?.mobileUrl;
    if (!entry) {
      setMobileEntryQr('');
      return;
    }
    QRCode.toDataURL(entry, { width: 180, margin: 1 }).then(setMobileEntryQr);
  }, [mobileHosts]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!scannerOpen || scannerMode !== 'gun') return;

      if (event.key === 'Escape') {
        disableGunMode();
        return;
      }

      const now = Date.now();
      if (now - gunTimestamp.current > 50) {
        gunBuffer.current = '';
      }
      gunTimestamp.current = now;

      if (event.key === 'Enter') {
        if (gunBuffer.current.trim()) {
          void lookupScan(gunBuffer.current.trim(), '扫码枪');
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
  }, [scannerOpen, scannerMode]);

  const categoryStats = useMemo(() => {
    return categories.map((category) => {
      const count = items.filter((item) => item.category === category).length;
      const ratio = items.length ? Math.round((count / items.length) * 100) : 0;
      return { category, count, ratio };
    });
  }, [items]);

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
    const itemRows = items.map((item) => {
      const row: Record<string, string> = {};
      for (const column of excelColumns) {
        row[column.label] = String(item[column.key] ?? '');
      }
      return row;
    });

    const logRows = logs.map((log) => {
      const row: Record<string, string> = {};
      for (const column of logColumns) {
        row[column.label] = String(log[column.key] ?? '');
      }
      return row;
    });

    const itemSheet = XLSX.utils.json_to_sheet(itemRows, { header: excelColumns.map((column) => column.label) });
    const logSheet = XLSX.utils.json_to_sheet(logRows, { header: logColumns.map((column) => column.label) });
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
      const rawItemRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(itemSheet);
      const rawLogRows = logSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(logSheet) : [];

      const nextItems = rawItemRows.map((row) => {
        const equipment: Partial<Equipment> = {};
        for (const [header, value] of Object.entries(row)) {
          const field = headerToField.get(header);
          if (field) {
            equipment[field] = String(value ?? '') as never;
          }
        }
        return {
          id: equipment.id || crypto.randomUUID(),
          assetCode: equipment.assetCode || '',
          name: equipment.name || '',
          category: equipment.category || '相机',
          brand: equipment.brand || '',
          model: equipment.model || '',
          serialNumber: equipment.serialNumber || '',
          status: (equipment.status as EquipmentStatus) || '在库',
          location: equipment.location || '',
          keeper: equipment.keeper || '器材管理员',
          borrower: equipment.borrower || '',
          returner: equipment.returner || '',
          purchaseDate: equipment.purchaseDate || '',
          notes: equipment.notes || '',
          updatedAt: equipment.updatedAt || new Date().toISOString(),
          lastActionAt: equipment.lastActionAt || new Date().toISOString()
        };
      });

      const nextLogs = rawLogRows.map((row) => {
        const log: Partial<StockLog> = {};
        for (const [header, value] of Object.entries(row)) {
          const field = logHeaderToField.get(header);
          if (field) {
            log[field] = String(value ?? '') as never;
          }
        }
        return {
          id: log.id || crypto.randomUUID(),
          equipmentId: log.equipmentId || '',
          equipmentName: log.equipmentName || '',
          assetCode: log.assetCode || '',
          serialNumber: log.serialNumber || '',
          action: (log.action as StockAction) || '出库',
          person: log.person || '',
          channel: (log.channel as StockLog['channel']) || '手动编辑',
          timestamp: log.timestamp || new Date().toISOString()
        };
      });

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
    setMessage('摄像头已启动。若浏览器无法调用摄像头，请优先使用“微信扫码入口”或扫码枪模式。');
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        void lookupScan(decodedText, '桌面扫码');
      },
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
    setScannerMode('idle');
  }

  function enableGunMode() {
    void stopScanner().finally(() => {
      setScannerOpen(true);
      setScannerMode('gun');
      setMessage('扫码枪模式已开启。按 ESC 可立即退出扫码枪模式。');
    });
  }

  function disableGunMode() {
    gunBuffer.current = '';
    setScannerOpen(false);
    setScannerMode('idle');
    setMessage('扫码枪模式已关闭。');
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
          <p className="eyebrow">本地器材管理桌面端</p>
          <h1>
            <img src="/film-gear-icon.svg" alt="器材图标" className="title-icon" />
            摄影器材设备管理
          </h1>
          <p className="muted">支持电脑扫码、扫码枪、iOS/Android 手机辅助扫码、Excel 数据同步，以及出入库人员追踪。</p>
        </div>
        <div className="hero-meta">
          <span className="badge">{window.deviceApp?.platform ?? 'browser'}</span>
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
            <div className="category-bars">
              {categoryStats.map((stat) => (
                <div key={stat.category}>
                  <div className="bar-label"><span>{stat.category}</span><span>{stat.count} 台 / {stat.ratio}%</span></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${stat.ratio}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Excel 数据同步</h2>
            <div className="actions vertical">
              <button onClick={exportExcel}>导出 Excel</button>
              <label className="file-input">导入 Excel<input type="file" accept=".xlsx,.xls" onChange={importExcel} /></label>
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">扫描中心</p>
                <h2>扫码 / 扫码枪 / 摄像头</h2>
              </div>
            </div>
            <div className="actions vertical">
              <input placeholder="粘贴二维码内容或输入资产编码后回车" value={manualCode} onChange={(event) => setManualCode(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter' && manualCode.trim()) {
                  void lookupScan(manualCode.trim(), '手动编辑');
                  setManualCode('');
                }
              }} />
              <button className={scannerMode === 'gun' ? 'active' : 'ghost'} onClick={enableGunMode}>启用扫码枪模式</button>
              <button className="ghost" onClick={disableGunMode}>关闭扫码枪模式</button>
              <button onClick={() => void startCameraScanner()}>打开电脑摄像头扫码</button>
              <button className="ghost" onClick={() => void stopScanner()}>关闭摄像头扫码</button>
            </div>
            <div id="reader" className={scannerOpen && scannerMode === 'camera' ? 'scanner active' : 'scanner'} />
            <small className="muted">扫码后会弹出“出库 / 入库”选择窗口，并填写领用人或归还人。</small>
          </section>

          <section className="panel">
            <h2>手机 / 微信扫码入口</h2>
            <p className="muted">手机浏览器或微信扫一扫下方二维码，打开手机扫码页并回传到电脑。</p>
            {mobileEntryQr && <img className="entry-qr" src={mobileEntryQr} alt="手机扫码入口二维码" />}
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
                          <button className="danger" onClick={() => void handleDelete(item.id)}>删除</button>
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
              <button onClick={() => void submitScanAction()}>确认</button>
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
