# Mac 本地运行 / 打包说明

## 你拿到源码包后怎么做

1. 把 `photo-gear-manager-mac-source-*.zip` 或 `photo-gear-manager-mac-source-*.tar.gz` 复制到你的 Mac。
2. 解压后进入目录：
   ```bash
   cd photo-gear-manager
   ```
3. 安装依赖：
   ```bash
   npm install
   ```
4. 本地开发运行：
   ```bash
   npm run dev
   ```
5. 生成 macOS 安装包：
   ```bash
   npm run dist:mac
   ```

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

## 说明

- 这个项目是本地优先（local-first）的，设备数据默认保存在本机本地存储。
- 第一次扫码时，macOS 可能会请求摄像头权限，请允许 Electron 使用摄像头。
- 如果你后面想改成 SQLite 本地数据库版，我也可以继续帮你升级。
