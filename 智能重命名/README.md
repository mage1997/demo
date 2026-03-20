# 智能重命名

基于 **Electron** 的 Windows 桌面小工具：多选文件 → 按模板规则生成新文件名 → **预览差异** → 确认后执行。执行阶段先统一改为临时文件名再落盘，降低同名互换导致的失败概率；**不覆盖已存在的目标文件**。

## 功能

- 多选文件（系统文件对话框）
- 规则占位符：`{hash}`（短 SHA 前缀，按文件路径+序号计算）、`{date}`、`{project}`、`{index}`、`{orig}`（原主文件名）、`{ext}`（含点的扩展名，如 `.png`）
- 日期格式：`YYYY-MM-DD` / `YYYYMMDD` / `YYYYMMDD_HHMMSS`
- 预览表格：原文件名 / 新文件名 / 是否变更
- 执行前二次确认

## 开发与运行

```bash
cd 智能重命名
npm install
npm start
```

## 打包为 Windows 安装包 / 绿色版

```bash
npm run dist
```

产物在 `release/`：

- **便携版**：`智能重命名 1.0.0.exe`（可直接运行）
- **安装包**：`智能重命名 Setup 1.0.0.exe`（NSIS）

> 首次打包会下载 Electron / NSIS 等依赖，耗时取决于网络。若本机访问 GitHub 不稳定导致失败，可在仓库 **Actions** 中运行工作流 **Build Windows release**，从 **Artifacts** 下载已构建的安装包。

### CI 构建

推送至 `main` 或 `rename_demo`（且变更在 `智能重命名/` 下）会触发 [`.github/workflows/build-windows.yml`](../.github/workflows/build-windows.yml)。在 GitHub 仓库页 **Actions** → 对应运行记录 → **Artifacts** 下载 `smart-rename-windows-x64`。

`package.json` 中已设置 `win.signAndEditExecutable: false`，避免部分网络环境下额外下载 `winCodeSign` 失败。

> `release/` 中的**便携版 / 安装包 / blockmap** 已纳入版本库，便于在 GitHub 网页直接浏览下载；`release/win-unpacked/` 仍被忽略（体积大且与 `.exe` 重复）。`node_modules/` 始终在 `.gitignore` 中。单文件约 70MB+，GitHub 会提示「超过 50MB 建议」；若后续频繁更新安装包，可考虑改用 [Git LFS](https://git-lfs.github.com)。

## 限制说明

- 若执行过程中在「第二阶段」中途失败，可能已有一部分文件已改名成功，其余会尽量从临时文件回滚；如遇异常请检查同目录下 `.smart-rename-*.tmp` 残留。
- 路径合法性依赖 Windows 文件名规则；模板结果会做一次安全字符过滤。

## 许可证

MIT
