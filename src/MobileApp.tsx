import { useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from './api';
import { Equipment, StockAction } from './shared';

function MobileApp() {
  const [mode, setMode] = useState<StockAction>('出库');
  const [person, setPerson] = useState('');
  const [message, setMessage] = useState('请先选择出库或入库，再点击开始扫码。');
  const [item, setItem] = useState<Equipment | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const title = useMemo(() => (mode === '出库' ? '手机出库扫码' : '手机入库扫码'), [mode]);

  async function startScanner() {
    if (scannerRef.current) return;
    const scanner = new Html5Qrcode('mobile-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (code) => {
          try {
            const found = await api.lookup(code);
            setItem(found);
            setMessage(`已识别：${found.name}（${found.assetCode}）`);
          } catch {
            setMessage('未找到对应设备，请检查二维码/条码内容。');
          }
        },
        () => undefined
      );
      setMessage('摄像头已启动，请对准设备二维码。');
    } catch {
      setMessage('手机摄像头无法启动，请确认浏览器已授权摄像头权限。');
      scannerRef.current = null;
    }
  }

  async function stopScanner() {
    if (!scannerRef.current) return;
    await scannerRef.current.stop();
    await scannerRef.current.clear();
    scannerRef.current = null;
    setMessage('扫码已停止。');
  }

  async function submitAction() {
    if (!item || !person.trim()) {
      setMessage('请先扫码并填写人员姓名。');
      return;
    }
    await api.stockAction(item.id, mode, person.trim(), '手机扫码');
    setMessage(`${item.name} 已${mode === '出库' ? '出库' : '入库'}，处理人：${person}`);
    setItem(null);
    setPerson('');
  }

  return (
    <div className="mobile-shell">
      <div className="mobile-card">
        <p className="eyebrow">iPhone / Android 手机扫码</p>
        <h1>{title}</h1>
        <div className="segmented">
          <button className={mode === '出库' ? 'active' : 'ghost'} onClick={() => setMode('出库')}>
            出库
          </button>
          <button className={mode === '入库' ? 'active' : 'ghost'} onClick={() => setMode('入库')}>
            入库
          </button>
        </div>
        <input placeholder={mode === '出库' ? '领用人姓名' : '归还人姓名'} value={person} onChange={(event) => setPerson(event.target.value)} />
        <div id="mobile-reader" className="scanner active" />
        <div className="actions">
          <button onClick={startScanner}>开始扫码</button>
          <button className="ghost" onClick={stopScanner}>停止扫码</button>
        </div>
        {item && (
          <div className="mobile-result">
            <strong>{item.name}</strong>
            <span>{item.assetCode} / {item.serialNumber}</span>
            <span>当前位置：{item.location}</span>
            <button onClick={submitAction}>确认{mode}</button>
          </div>
        )}
        <p className="muted">{message}</p>
      </div>
    </div>
  );
}

export default MobileApp;
