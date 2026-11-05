# `src/backend`

Electron 本地后台代码集中在这里，主进程与 preload 作为独立入口构建。

- `main.ts`：Electron 生命周期、应用窗口和 IPC 处理。
- `preload.ts`：通过 `contextBridge` 暴露受限的 `window.netTrace` API。

主进程与 renderer 共享的 IPC 通道和类型定义在 `../shared/`。新增本地能力时应声明窄类型契约并由主进程校验，不要把原始 IPC 或 Node.js API 直接暴露给 renderer。
