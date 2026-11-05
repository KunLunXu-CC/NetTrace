# NetTrace

NetTrace 是一个面向开发者的桌面网络流量捕获与分析工具。目前仓库已经建立 Electron、React 和 TypeScript 应用骨架；捕获引擎和请求解析能力仍在规划中，当前版本不会捕获真实网络流量。界面组件使用 HeroUI v3，Tailwind CSS v4 负责布局和样式，Lucide React 提供图标。

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

## 本地开发

```bash
pnpm install
pnpm dev
```

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
- 初始界面展示流量概览、统计卡片、流量趋势及请求列表的空状态。
- 捕获启动按钮当前不可用；接入捕获引擎和权限流程后再启用。

## 参与贡献

欢迎提交 Issue 讨论问题和改进方向，也欢迎通过 Pull Request 贡献代码。提交前请先说明变更目的；项目建立代码规范和验证流程后，会在此处补充相应要求。

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。
