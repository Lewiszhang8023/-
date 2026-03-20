# Mac 本地运行 / 打包说明

## 你拿到源码包后怎么做

1. 在本地执行 `npm run package:downloadables` 生成源码包。
2. 将生成的 `deliverables/photo-gear-manager-mac-source.zip` 或 `deliverables/photo-gear-manager-mac-source.tar.gz` 复制到 Mac。
3. 在你的 Mac 上解压。
4. 进入解压后的目录：
   ```bash
   cd photo-gear-manager
   ```
5. 安装依赖：
   ```bash
   npm install
   ```
6. 本地开发运行：
   ```bash
   npm run dev
   ```
7. 生成真正的 macOS 安装包（DMG / ZIP）：
   ```bash
   npm run dist:mac
   ```

## 现在这一版新增能力

- 扫码后弹出“出库 / 入库”选择窗口
- 自动适配电脑屏幕尺寸
- 增加领用人、归还人、保管人字段
- Excel 导入 / 导出
- 支持扫码枪扫码
- 支持 iPhone / Android 手机扫码回传到电脑

## 环境要求

- macOS
- Node.js 20+（建议使用 LTS）
- npm 10+

## 产物位置

执行 `npm run dist:mac` 后，安装包会输出到：

```bash
release/
```

通常会包含：

- `*.dmg`
- `*.zip`

## 手机扫码使用方式

1. 启动桌面版应用。
2. 在桌面端左侧找到“手机扫码入口”。
3. 仅在 HTTPS 或 localhost 这类安全上下文中，用 iPhone 或 Android 手机打开对应的 `mobile.html` 地址。
4. 手机端选择出库 / 入库，扫码并填写人员后提交。
5. 电脑端会同步更新设备状态和出入库记录。

## 说明

- 数据默认保存在当前 Mac 本机的 Electron 用户数据目录中。
- 第一次扫码时，macOS 可能会请求摄像头权限，请允许 Electron 和手机浏览器使用摄像头。
- 如果你后面想升级成 SQLite / 多用户版，我可以继续帮你改。
