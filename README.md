# 摄影器材设备管理

这是一个可本地部署、可继续二次开发、可打包为 macOS DMG 的摄影器材设备管理软件。

## 当前已支持

- 器材增删改查
- 自动适配电脑屏幕尺寸的响应式布局
- Excel 导入 / 导出（`.xlsx` / `.xls`）
- 电脑摄像头扫码后弹出“出库 / 入库”选择窗口
- 增加领用人、归还人、保管人字段
- 扫码枪扫码（键盘回车型扫码枪）
- iPhone / Android 手机通过同局域网页面扫码并回传到电脑
- Electron 桌面版打包 macOS DMG / ZIP

## 技术说明

- **桌面壳**：Electron
- **界面**：React + Vite + TypeScript
- **Excel**：`xlsx`
- **扫码**：`html5-qrcode`
- **二维码生成**：`qrcode`
- **桌面与手机共用数据**：Electron 内置本地 Express 服务 + 本机 JSON 文件存储

## 开发运行

```bash
npm install
npm run dev
```

## 先用浏览器跑

如果你想先不启动 Electron，只验证前端页面，可以直接执行：

```bash
npm install
npm run dev:web
```

这时应用会自动切换到浏览器本地演示模式，数据保存在浏览器 `localStorage` 中。

## 生产构建

```bash
npm run build
```

## 生成真正的 macOS 安装包

请在 **Mac 电脑** 上执行：

```bash
npm install
npm run dist:mac
```

生成后的 DMG / ZIP 会出现在：

```bash
release/
```

## 给 Mac 直接下载的源码包

GitHub 仓库里不再提交二进制压缩包；如果你需要给 Mac 使用的源码包，请在本地重新生成：

```bash
npm run package:downloadables
```

## 手机扫码怎么用

1. 打开桌面端应用。
2. 在左侧“手机扫码入口”里找到局域网地址。
3. 用 iPhone 或 Android 手机浏览器打开该地址。
4. 手机端选择“出库”或“入库”，扫码后填写人员并提交。
5. 电脑端会同步更新状态和记录。

## Excel 模板说明

导出时会生成两个工作表：

- `设备`
- `出入库记录`

导入时至少需要 `设备` 工作表。


## 运行不了时先这样排查

```bash
npm install
npm run doctor
```

如果你只是想先看页面是否正常，请优先执行：

```bash
npm run dev:web
```

如果你确认依赖都安装好了，再运行桌面版：

```bash
npm run dev
```
