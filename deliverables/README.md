# Deliverables

GitHub 仓库中不再提交二进制压缩包（如 `.zip`、`.tar.gz`）。

如果你需要给 Mac 使用的源码包，请在本地执行：

```bash
npm run package:downloadables
```

执行后会在当前目录生成：

- `deliverables/photo-gear-manager-mac-source.tar.gz`
- `deliverables/photo-gear-manager-mac-source.zip`

这些文件默认被 `.gitignore` 忽略，不会再提交到 GitHub。

如果你要生成真正的 macOS 安装包，请在 Mac 上执行：

```bash
npm install
npm run dist:mac
```
