# 开发、验证与发布

使用 Node.js 24/26、pnpm 10.12.1。单 package 依赖通过冻结锁文件安装。Vite 配置、Electron main/preload、共享 IPC 类型和测试均为 TypeScript。

## 常用任务

| 命令                                           | 用途                                            |
| ---------------------------------------------- | ----------------------------------------------- |
| `pnpm dev`                                     | electron-vite 启动 Electron 和热更新 renderer   |
| `pnpm dev:web`                                 | 浏览器预览，不提供原生文件能力                  |
| `pnpm ci-gate`                                 | Moon 依赖图执行格式、lint、类型、单测和生产构建 |
| `pnpm build-storybook` / `pnpm test:storybook` | 静态预览与真实 Chromium 组件交互                |
| `pnpm test:e2e`                                | 新增、编辑、折叠、移动、保存、打开和输入法保护  |
| `pnpm test:perf`                               | 固定 100/1000/5000 主题，每组采样三次并附 JSON  |
| `pnpm build` / `pnpm test:desktop`             | 生产构建与真实 Electron 启动、文件桥接          |
| `pnpm moon run trelyx:package`                 | 先构建再打包                                    |

测试浏览器由项目固定的 Playwright 版本安装：`pnpm exec playwright install chromium`。Linux CI 使用 `--with-deps`。桌面测试在 macOS 图形会话运行；其它系统安装目标已配置，尚不能等同于已在对应系统验证。

## React Scan

开发入口先初始化 React Scan，再加载 React 和应用，避免错过 DevTools 注入时机。`pnpm dev` / `pnpm dev:web` 默认显示扫描工具栏；可设置 `VITE_REACT_SCAN=false` 关闭。生产构建移除该分支，浏览器性能测试显式关闭扫描，避免工具开销污染样本。React Scan 用于定位问题，Playwright 固定采样用于可重复比较。

## 性能报告

`src/core/fixtures.ts` 生成固定文档，内容不使用随机数。Playwright 固定视口 1440×960，记录三次文件选择、解析到可见界面的耗时和挂载节点数，输出中位数。当前测试针对开发构建，含自动化开销，仅作比较基线，没有设置硬阈值。

报告在 `test-results` 与 `playwright-report`；原生桌面测试独立使用 `test-results-desktop`，避免互相清理 trace。CI 将报告作为 artifact 上传。该报告不代表输入延迟、内存峰值或长期运行性能已完成验证。

## 打包与故障排查

`pnpm build` 输出 `out/main`、`out/preload`、`out/renderer`。preload 使用单文件 CommonJS，兼容 Electron sandbox。`pnpm package --dir` 将已有构建装配为 `release` 下的本机应用；使用 Moon package 任务可自动补上构建依赖。

本地 macOS 预览未配置 Developer ID 签名或公证。CI 自动生成 macOS 预览 artifact，不自动发布正式版本。正式发布还需要签名、公证、应用图标和分发策略。当前 electron-builder 使用默认 Electron 图标。

文件读取或恢复失败时，界面显示错误，保留当前内容。保存失败后脏状态保持；可另存到新位置重试。恢复文件损坏时，先备份 `userData/recovery.trelyx` 再排查，不直接覆盖原文件。

运行时可选 `ELECTRON_RENDERER_URL` 仅供开发，通过 `electron/config.ts` 校验为本机 loopback HTTP(S) 地址；生产始终加载打包资源。不要将凭据写入 `.env.example` 或文档。

## Agent 配置

项目指令集中在 `AGENTS.md`，APM CLI 固定 `0.33.0`，显式目标为 Codex。当前没有外部 Agent 依赖；`apm.lock.yaml` 由真实的 `apm lock` 生成。执行 `uvx --from apm-cli==0.33.0 apm install --frozen` 可检查恢复配置。APM 不复制个人登录状态或模型授权。
