# `src/backend`

Electron 本地后台代码集中在这里，主进程与 preload 作为独立入口构建。

- `main.ts`：Electron 生命周期、应用窗口和 IPC 处理。
- `preload.ts`：通过 `contextBridge` 暴露受限的 `window.netTrace` API。
- `capture/capture-manager.ts`：启动外部开发命令、管理本机 IPC socket 与捕获记录。
- `capture/control-server.ts`：为 `nettrace run` CLI 提供本机 Unix socket 控制和事件通道。
- `capture/node-hook.cjs`：由 NODE_OPTIONS 临时注入目标 Node 进程的 HTTP/fetch hook，并为 Electron 设置 CDP 启动参数。
- `capture/cdp-capture.ts`：连接本机 Chromium DevTools Protocol，收集 renderer HTTP(S) 和 WebSocket 帧。

`nettrace run -- <command> [args...]` 从 CLI 当前工作目录启动通用项目命令。采集 hook 会随 `NODE_OPTIONS` 传递给 Node 子进程；只有 Electron 应用会额外启用 Chromium CDP。不要在 UI 或后台能力中固定具体项目路径或项目名称。

主进程与 renderer 共享的 IPC 通道和类型定义在 `../shared/`。新增本地能力时应声明窄类型契约并由主进程校验，不要把原始 IPC 或 Node.js API 直接暴露给 renderer。
