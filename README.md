# NetTrace

NetTrace 是一个面向开发者的桌面网络流量捕获与分析工具。界面组件使用 HeroUI v3，Tailwind CSS v4 负责布局和样式，Lucide React 提供图标。

## 技术结构

```text
src/renderer/  React 界面与样式
src/backend/   Electron 主进程、preload 和本地能力
src/shared/    主进程与渲染进程共享的类型契约
```

Renderer 禁用 Node 集成，通过启用上下文隔离的 preload 暴露窄接口。跨进程能力应先在 `src/shared/` 中声明契约，再由主进程实现；不要向 renderer 暴露原始 IPC 或任意本地能力。

## 环境要求

- Node.js 20 或更新版本
- pnpm 10
- macOS、Windows 或 Linux 的图形桌面环境

## 开发 NetTrace

```bash
git clone <NetTrace 仓库地址>
cd NetTrace
pnpm install
pnpm dev
```

`pnpm dev` 会先准备采集资源并安装本机 `nettrace` 命令，再启动 Electron 开发版。修改 renderer、主进程或 preload 代码后，electron-vite 会按开发配置重新构建。无需运行 `pnpm link`。

常用开发命令：

```bash
pnpm typecheck  # TypeScript 检查
pnpm build      # 构建 Electron 主进程、preload 和 renderer
```

`pnpm build` 会在构建成功后安装或更新 `nettrace` 命令。当前仓库配置的是 electron-vite 构建，尚未配置生成 `.dmg`、`.exe` 等桌面安装包的流程。

## 监控其他项目

先保持 NetTrace 桌面端运行。开发时在一个终端启动：

```bash
cd /path/to/NetTrace
pnpm dev
```

在另一个终端进入要监控的项目目录，用 `nettrace run --` 启动项目的正常开发命令：

```bash
cd /path/to/your/project
nettrace run -- pnpm dev
nettrace run -- npm run dev
nettrace run -- node server.js
```

`nettrace run` 将命令的工作目录设为当前项目目录，保留项目的终端输出，并将采集记录发送到 NetTrace。按 Ctrl+C 会停止被监控的进程树并结束本次采集。也可以在 NetTrace 界面填写项目目录和启动命令，再点击“启动命令”。

首次运行 `pnpm dev` 或 `pnpm build` 时，安装器会把 `nettrace` 放到 PATH 中可用的用户命令目录；macOS 优先使用 `~/Library/pnpm`，没有合适目录时会提示配置 PATH。安装器只更新由 NetTrace 自己创建的命令文件；如果 PATH 中已有其他同名 `nettrace`，安装会停止并提示冲突。新加入 PATH 的目录需要在终端配置中启用，并重新打开终端。开发命令安装失败时，也可以通过 `NETTRACE_CLI_BIN_DIR` 指定一个已加入 PATH 的可写目录。

确认命令已安装：

```bash
nettrace --help
```

按需开启正文采集：

```bash
nettrace run --capture-bodies -- pnpm dev
```

默认只采集请求和响应的元信息，不采集正文。正文采集开启后，常见凭证字段会脱敏，每个正文最多保留 128 KB；二进制响应不展开。包含 Cookie、Authorization、token、secret、password、API key 等关键词的请求头始终替换为 `[REDACTED]`。记录只保存在 NetTrace 进程内存中，最多保留 10,000 条，退出后清空。

## 捕获范围

采集 hook 通过 `NODE_OPTIONS` 传给启动命令及其 Node 子进程，覆盖 Node `http`、`https` 和 `fetch`。当启动命令是 Electron 应用时，还会启用 Chromium DevTools Protocol，捕获 renderer 的 HTTP(S) 请求和 WebSocket 帧。非 Node 程序、清理了 `NODE_OPTIONS` 的子进程、原生网络栈以及 HTTP/2 当前不保证覆盖；这不是 macOS 全系统抓包。

NetTrace 桌面端必须先启动，因为 CLI 通过本机 socket 与桌面端通信。若提示桌面端未运行，请先启动 `pnpm dev` 或已构建的 NetTrace 应用，再重新运行 `nettrace run`。

## 校验与构建

```bash
pnpm typecheck
pnpm build
```

## 规划方向

- 捕获并查看网络流量
- 按请求、连接和协议筛选数据
- 检查 HTTP/HTTPS 请求与响应
- 提供清晰的会话记录，便于定位问题
- 在保证可理解性的前提下，逐步补充跨平台支持

具体支持的操作系统、协议、捕获方式和功能范围将随项目实现逐步明确。

## 当前状态

- 已搭建 Electron 主进程、preload 与 React renderer。
- 已配置严格 TypeScript、electron-vite 开发和构建命令。
- 可从界面或 `nettrace run` 启动项目并实时查看支持范围内的 HTTP 请求和 WebSocket 帧。
- 请求正文采集可选，默认关闭；凭证类头部默认脱敏。

## 参与贡献

欢迎提交 Issue 讨论问题和改进方向，也欢迎通过 Pull Request 贡献代码。提交前请先说明变更目的；项目建立代码规范和验证流程后，会在此处补充相应要求。

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。
