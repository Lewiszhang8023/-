# 摄影器材设备管理

一个可本地化部署的摄影器材设备管理软件，支持：

- 器材库存增删改查
- 本地离线存储（浏览器 / Electron 本地）
- 器材二维码生成
- 使用摄像头扫码快速定位设备
- 导入 / 导出 JSON 备份
- 打包 macOS 安装包（DMG / ZIP）
- 导出可带到 Mac 上运行的源码包

## 技术方案

- **前端**：React + Vite + TypeScript
- **桌面端**：Electron
- **二维码**：`qrcode` 生成，`html5-qrcode` 扫描
- **数据存储**：`localStorage` 本地存储，适合局域网内或单机部署

## 当前可直接交付给 Mac 的内容

你可以在当前仓库执行下面命令，生成一份可复制到 Mac 的源码压缩包：

```bash
npm run package:source
```

生成后文件会在：

```bash
release/photo-gear-manager-mac-source-*.tar.gz
release/photo-gear-manager-mac-source-*.zip
```

把其中任意一个压缩包复制到你的 Mac 上，再按 `MAC_SETUP.md` 操作即可。

## 本地运行

```bash
npm install
npm run dev
```

## 构建桌面版

```bash
npm run build
```

## 生成苹果安装包

在 macOS 设备上执行：

```bash
npm install
npm run dist:mac
```

产物会输出到 `release/` 目录，默认包含：

- `dmg` 安装包
- `zip` 压缩包

详细步骤见：[`MAC_SETUP.md`](./MAC_SETUP.md)

## 建议扩展

如果你后续需要，我还可以继续帮你加：

1. 借出 / 归还审批流程
2. 多用户权限和账号登录
3. SQLite 本地数据库
4. 标签打印模板
5. 维修记录 / 折旧统计
