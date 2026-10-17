# 开发、验证与发布

使用 Node.js 24/26、pnpm 10.12.1。单 package 依赖通过冻结锁文件安装。Moon 依赖范围为 `@moonrepo/cli: ^2.6.1`，锁文件固定实际安装版本；不维护自制任务包装脚本。Vite 配置、Electron main/preload、共享 IPC 类型和测试均为 TypeScript。

## 编码规范

源码、测试、Storybook、工具配置和脚本使用 TypeScript。手写文件最多 300 行，空行与注释均计入；超出前按职责拆分。函数、React 组件、回调和普通方法统一使用箭头函数，命名函数写作 `const`；构造函数与 getter/setter 保留语言语法。断言函数显式标注变量的函数类型，函数初始化顺序不得依赖声明提升。

项目内部导入、类型导入、再导出与动态导入统一使用 `@` 别名：

| 别名                      | 目录                                   |
| ------------------------- | -------------------------------------- |
| `@core` / `@core/*`       | `src/core`                             |
| `@formats` / `@formats/*` | `src/formats`                          |
| `@layout` / `@layout/*`   | `src/layout`                           |
| `@assets` / `@assets/*`   | `src/assets`                           |
| `@main/*` / `@preload/*`  | `src/main` / `src/preload`             |
| `@shared/*`               | `src/shared`                           |
| `@renderer/*`             | `src/renderer/src`                     |
| `@tests/*` / `@stories/*` | `tests` / `stories`                    |
| `@project/*`              | 仓库根目录，仅用于工具配置等根目录模块 |

```ts
import type { MindMapDocument } from '@core'
import { validateDocument } from '@core/validation'

export const checkDocument: (value: unknown) => asserts value is MindMapDocument = (value) => {
  validateDocument(value)
}

const loadSpatialCanvas = () => import('@renderer/components/spatial/SpatialCanvas')
```

第三方包和 Node 内置模块保留原包名；资源 URL、文件路径、测试目录和工具配置中的路径不受模块导入规则限制。`tsconfig.json` 是别名的唯一来源；Electron、浏览器、Vitest 和 Storybook 使用 Vite 8 内置的 `resolve.tsconfigPaths: true`，Playwright 使用 TypeScript 路径映射。`config/renderer.json` 共享预优化清单和 HTML 入口，配置文件读取这份数据，不依赖尚未生效的运行时模块别名。Core 的依赖边界仍由 ESLint 单独限制。

实现前先检查现有依赖和成熟第三方库，优先复用通用能力，也可按需引入成熟库。选型核对维护状态、类型支持、许可证、Electron/浏览器兼容性、包体积和安全性；新增依赖使用 pnpm 并更新锁文件。自有代码主要承载主题树业务规则和必要集成。

`pnpm lint` 检查相对模块导入、非箭头函数、单文件 300 行上限及新增 JavaScript 文件，`pnpm typecheck` 检查类型。shadcn/Dice UI 官方下载源码保持原样，沿用 ESLint 与 Prettier 的明确排除项，不手改或拆分上游组件。Husky 的 lint-staged 与 CI 继续执行这套规则；`tests/tooling/coding-standards.test.ts` 验证允许和拒绝的代码边界。

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

## 目录与入口

项目遵循 [electron-vite 推荐目录](https://electron-vite.org/guide/dev#project-structure)：`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/index.html` 与 `src/renderer/src`。electron-vite 自动发现入口，浏览器 Vite 预览同一 renderer 根目录；生产输出仍为 `out/main`、`out/preload`、`out/renderer`。preload 完整打包成 CommonJS，保留 sandbox。

## React Scan

开发入口先初始化 React Scan，再加载 React 和应用，避免错过 DevTools 注入时机。`pnpm dev` / `pnpm dev:web` 默认显示扫描工具栏；可设置 `VITE_REACT_SCAN=false` 关闭。生产构建移除该分支，浏览器性能测试显式关闭扫描，避免工具开销污染样本。React Scan 用于定位问题，Playwright 固定采样用于可重复比较。

## 窗口标题栏

`src/main/windowChrome.ts` 管理原生窗口外观，macOS 使用 `hiddenInset`，Windows/Linux 使用 `titleBarOverlay`。窗口按钮、缩放、关闭与未保存确认沿用系统和既有 Electron 行为。`styles/window.css` 声明拖动区域，并为原生按钮预留空间；交互控件必须排除拖动区域。

preload 仅暴露平台、窗口焦点及全屏状态；读取状态仍校验当前窗口和主框架。状态通知只用于界面布局。Storybook 提供 macOS、Windows/Linux、失焦和全屏预览，原生按钮仅在 Electron 中出现。`pnpm test:desktop` 验证真实窗口布局、全屏状态和工具栏操作；跨平台原生行为需在对应系统复核。

## 性能报告

`src/core/fixtures.ts` 生成固定文档，内容不使用随机数。Playwright 固定视口 1440×960，记录三次文件选择、解析到可见界面的耗时和挂载节点数，输出中位数。当前测试针对开发构建，含自动化开销，仅作比较基线，没有设置硬阈值。

2026-10-15 在本机 macOS arm64、Node.js 25.2.1、Playwright Chromium 156 的一次采样如下。React Scan 已关闭，结果包含文件选择、解析和自动化等待，不等同于纯布局耗时。

| 主题数 | 三次打开耗时中位数 | 挂载主题数 |
| ------ | ------------------ | ---------- |
| 100    | 528 ms             | 100        |
| 1,000  | 692 ms             | 211        |
| 5,000  | 1,644 ms           | 199–214    |

报告在 `test-results` 与 `playwright-report`；原生桌面测试独立使用 `test-results-desktop`，避免互相清理 trace。CI 将报告作为 artifact 上传。该报告不代表输入延迟、内存峰值或长期运行性能已完成验证。

## 打包与故障排查

`pnpm build` 输出 `out/main`、`out/preload`、`out/renderer`。preload 使用单文件 CommonJS，兼容 Electron sandbox。`pnpm package --dir` 将已有构建装配为 `release` 下的本机应用；使用 Moon package 任务可自动补上构建依赖。

本地 macOS 预览未配置 Developer ID 签名或公证。CI 自动生成 macOS 预览 artifact，不自动发布正式版本。正式发布还需要签名、公证、应用图标和分发策略。当前 electron-builder 使用默认 Electron 图标。

文件读取或恢复失败时，界面显示错误，保留当前内容。保存失败后脏状态保持；可另存到新位置重试。恢复文件损坏时，先备份 `userData/recovery-v1.trelyx` 再排查，不直接覆盖原文件。

运行时可选 `ELECTRON_RENDERER_URL` 仅供开发，通过 `src/main/config.ts` 校验为本机 loopback HTTP(S) 地址；生产始终加载打包资源。不要将凭据写入 `.env.example` 或文档。

## Agent 配置

项目指令集中在 `AGENTS.md`，APM CLI 固定 `0.33.0`，显式目标为 Codex。当前没有外部 Agent 依赖；`apm.lock.yaml` 由真实的 `apm lock` 生成。执行 `uvx --from apm-cli==0.33.0 apm install --frozen` 可检查恢复配置。APM 不复制个人登录状态或模型授权。

## 新增能力回归

`tests/e2e/canvas-tools.spec.ts` 验证 Dock 收放、键盘可达性、子面板及连线模式保持展开，画布直接创建与编辑注解。已有 E2E 通过同一可访问入口展开 Dock，不依赖强制显示 CSS。`workbench-dock` 验证真实指针首击和减少动态效果，`workbench-feedback` 验证二维/三维落点与取消，`workbench-viewport` 逐帧检查侧栏开合时位置与缩放、可见区取景及新主题可见性。

浏览器 E2E、Storybook 浏览器测试和真实 Electron 测试串行运行。它们共享图形环境；桌面用例还操作原生窗口、菜单和系统剪贴板，并行执行可能导致焦点、剪贴板或截图捕获相互干扰。`extended-workflows.spec.ts` 覆盖实际下载、XMind 往返、搜索替换和密码解锁；桌面测试另验证受限 bridge、离线 AI 服务与历史恢复。

AI 测试使用本机模拟 HTTP 服务和真实 SDK，不使用个人密钥，不请求付费服务。实际第三方服务及实体麦克风硬件仍需按目标系统验证。macOS 打包配置提供录音用途说明；签名和平台权限要在安装产物上复核。
