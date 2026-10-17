# 开发、验证与发布

项目 Node.js 约束为 `>=24`，不设上限；pnpm 固定 10.12.1。当前使用 Node.js 24.22 验证，CI 使用 24/26；Babel、Vitest 等依赖仍按各自声明的 engine 范围校验。单 package 依赖通过冻结锁文件安装。Moon 依赖范围为 `@moonrepo/cli: ^2.6.2`，锁文件固定实际安装版本；不维护自制任务包装脚本。Vite 配置、Electron main/preload、共享 IPC 类型和测试均为 TypeScript。

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

第三方包和 Node 内置模块保留原包名；资源 URL、文件路径、测试目录和工具配置中的路径不受模块导入规则限制。`tsconfig.json` 是别名的唯一来源；Electron renderer、Vitest 和 Storybook 使用 Vite 8 内置的 `resolve.tsconfigPaths: true`，Playwright 使用 TypeScript 路径映射。`config/renderer.json` 共享预优化清单和 HTML 入口，配置文件读取这份数据，不依赖尚未生效的运行时模块别名。Core 的依赖边界仍由 ESLint 单独限制。

实现前先检查现有依赖和成熟第三方库，优先复用通用能力，也可按需引入成熟库。选型核对维护状态、类型支持、许可证、Electron/浏览器兼容性、包体积和安全性；新增依赖使用 pnpm 并更新锁文件。自有代码主要承载主题树业务规则和必要集成。通用 React hooks 优先复用 ahooks，通用集合与数据处理优先复用 lodash-es，避免重复维护同类工具。

`pnpm lint` 检查相对模块导入、非箭头函数、单文件 300 行上限及新增 JavaScript 文件，`pnpm typecheck` 检查类型。shadcn/Dice UI 官方下载源码保持原样，沿用 ESLint 与 Prettier 的明确排除项，不手改或拆分上游组件。Husky 的 lint-staged 与 CI 继续执行这套规则；`tests/tooling/coding-standards.test.ts` 验证允许和拒绝的代码边界。

## 常用任务

| 命令                                           | 用途                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                     | electron-vite 启动 Electron 和热更新 renderer                          |
| `pnpm ci-gate`                                 | Moon 依赖图执行格式、lint、类型、单测和生产构建                        |
| `pnpm build-storybook` / `pnpm test:storybook` | 静态预览与真实 Chromium 组件交互                                       |
| `pnpm test:e2e`                                | 真实 Electron 新增、编辑、折叠、移动、保存、打开和输入法保护           |
| `pnpm test:perf`                               | 真实 Electron 生产构建，固定 100/1000/5000 主题，每组采样三次并附 JSON |
| `pnpm build` / `pnpm test:desktop`             | 生产构建与真实 Electron 启动、文件桥接                                 |
| `pnpm moon run brainstorming:package`          | 先构建再打包                                                           |

Storybook 组件测试的浏览器由项目固定的 Playwright 版本安装：`pnpm exec playwright install chromium`。Linux CI 使用 `--with-deps`。E2E、桌面集成和性能测试通过 Playwright 启动真实 Electron，不配置浏览器 `webServer`。直接运行前先执行 `pnpm build`；Moon 的 `e2e`、`performance` 与 `package` 任务均依赖 `build`。桌面测试在 macOS 图形会话运行；其它系统安装目标已配置，尚不能等同于已在对应系统验证。

`pnpm test` / `pnpm test:watch` 通过 `cross-env ELECTRON_RUN_AS_NODE=1 electron` 运行 Vitest，使用与应用一致的 Electron Node ABI 加载外部 SQLite 原生模块。Storybook 的浏览器组件测试仍用独立 Vitest 配置，不调用本机数据库。CI 的 Ubuntu Node.js 24/26 任务执行质量检查、Storybook 构建及组件测试；macOS 任务执行构建、真实 Electron E2E、性能采样和预览打包。

## 目录与入口

项目遵循 [electron-vite 推荐目录](https://electron-vite.org/guide/dev#project-structure)：`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/index.html` 与 `src/renderer/src`。electron-vite 自动发现入口；生产输出为 `out/main`、`out/preload`、`out/renderer`。preload 完整打包成 CommonJS，保留 sandbox。产品仅运行于 Electron，不维护独立浏览器入口或文件、密码、下载与 IndexedDB 恢复降级逻辑。Storybook 通过类型明确的桌面 API mock 提供组件预览。

TypeScript 使用 [Microsoft 官方并行方案](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)：`@typescript/native` 是最新 TypeScript 7 的包别名，提供 `tsc`；`typescript` 指向官方 `@typescript/typescript6` 兼容包，供 typescript-eslint 等依赖旧编译器 API 的工具使用。类型检查仍执行 TypeScript 7，不修改第三方包声明或降低 lint 规则。

Electron 44.9 的二进制由官方 `install-electron` CLI 安装。项目 `postinstall` 先执行该 CLI，再由 electron-builder 为 Electron ABI 安装原生依赖，避免首次运行多个进程时同时解压 Electron。需要手动修复时执行 `pnpm exec install-electron`，然后 `pnpm rebuild:native`。

ESLint 10 使用 [官方兼容工具](https://eslint.org/docs/latest/use/migrate-to-10.0.0) `@eslint/compat` 包装尚未更新规则 API 的 React 与可访问性插件；保留推荐规则、类型化检查及项目边界规则，不在下载的插件源码上补丁。

## React 编译

Electron renderer 和 Storybook 共用正式 React Compiler Babel 接入：`@vitejs/plugin-react` 的 `reactCompilerPreset` 与 `@rolldown/plugin-babel`。配置遵循 [React 官方安装说明](https://react.dev/learn/react-compiler/installation)，目标为 React 19，开发及生产均启用。Core、Electron main 和 preload 不经过 React Compiler。

编译器自动优化符合条件的组件与 Hook；保留必要的稳定引用和局部订阅，不批量删除现有 `useMemo` / `useCallback`。验收时检查编译产物中的 memo cache，并用组件和真实桌面测试验证编辑行为。

## 主进程依赖与本机存储

`src/main/di` 使用 Inversify `ContainerModule` 显式声明存储、文件、系统、AI、MCP 和生命周期依赖。容器只在应用组装边界解析服务，业务类通过构造参数接收依赖，不使用旧装饰器或全局 service locator。应用就绪后初始化数据库；退出先撤销 IPC、停止 AI/MCP 并等待文件队列，再关闭 SQLite 和清理会话密钥。

Inversify 容器入口会加载 `reflect-metadata/lite`，因此项目将 `reflect-metadata` 显式声明为生产依赖；不能只依赖 pnpm 自动补齐的 peer。即使不使用装饰器，正式应用包也需要这个运行时依赖。macOS CI 在 `pnpm package --dir` 后执行 `pnpm test:packaged`，验证 ASAR 内的依赖装载、主页、新建与原生保存。

`LocalDatabase` 使用 Kysely + better-sqlite3，单个主进程连接访问 `userData/brainstorming-local.sqlite`，启用 WAL 和 3 秒 busy timeout。`src/main/storage/migrations` 静态注册迁移，通过官方 `Migrator` 维护迁移与锁记录；仓库异步方法等待初始化完成。数据库只保存界面语言、最近文件和恢复索引，不保存文档正文、资源或密码；未知结构拒绝打开，旧数据库不迁移。应用外观和小地图开关继续由 renderer 偏好管理。

原生 `.brainstorming` 由 `NativeDocuments` 按文件路径读写，业务 SQL 通过 Kysely 执行。`better-sqlite3` 包名映射到 `better-sqlite3-multiple-ciphers`，提供 SQLCipher `key`/`rekey`；不能换回缺少这些能力的驱动。原生 schema 在 `src/main/document-db/schema.ts` 静态注册，官方 Migrator 记录迁移。打开时检查 application ID、协议版本和必需功能，拒绝旧 ZIP/JSON 以及未知未来版本。

`NativeDocumentPools` 使用 Effect Pool，键为规范路径与凭据摘要；每个键至多一个连接，借用并发为 1。别名和符号链接路径归并；不同凭据隔离。默认空闲 TTL 为 30 秒，关闭文档和退出会显式释放连接；释放等待现有借用完成。资源读取每次仅为一块借用连接，不在整个播放期间占有连接。原生文件使用 DELETE journal，和本机元数据库的 WAL 设置分开。

工作区恢复最多包含 32 份文档。正文保存在 `userData/recovery-sqlite-v1` 的 SQLite 文件中，继续使用稳定文件名与分块资源；写完后事务替换本机索引。索引提交失败时尝试恢复此前文档，清理本次新建文件；回滚也失败时报告错误。输入元数据总量限制为 128 MiB，资源字节不作为 base64 放进该输入。恢复记录作为未保存副本打开；密码与正式文件同步，密钥只留在主进程内存。

Sharp 在原生工作线程生成 WebP 预览和 Deep Zoom 瓦片。`brainstorming-resource://` 使用本次会话的随机 origin，主进程只提供已登记对象的 GET/HEAD 和单段 Range 流；不能用任意磁盘路径读取文件。拖入文件通过 preload 的 `webUtils.getPathForFile` 获取实际路径，最多 32 个文件，由主进程校验并顺序导入。

网页预览扫描所有已打开工作簿的 HTTP(S) 链接，将完整目标集交给 `LinkPreviewQueue`；`p-queue` 并发为 1，同 URL 去重，移出目标集的后台任务取消。截图使用没有应用 preload 的独立 Electron session，拒绝私网、混合公网/私网 DNS 结果、下载和权限请求。网页预览会访问网络，AI 的显式发送规则不适用于这项自动预览。具体协议与大小限制见 [文件协议](file-format.md)。

界面文案使用 i18next 和 react-i18next，支持 `zh-CN` 与 `en`。语言选择由主进程保存到数据库，首次使用读取系统语言；文档内容不参与翻译。渲染文案通过 `useMessages` 或 react-i18next 返回的 `t` 显式绑定语言，选项数据以翻译函数为输入；全局 `translate` 仅用于事件和非 React 逻辑，避免 React Compiler 缓存旧语言。新增文案应使用类型明确的消息键；启动窗口读取同一本机语言选择，部分底层错误目前仍可能显示中文。

系统文件关联与第二实例传入的文件路径使用有界队列，最多保留 32 个待打开请求，按绝对路径去重并依次消费，不以新请求覆盖旧请求。编辑器最多同时打开 32 份文档；重复路径或工作簿 ID 切换到已有标签。

## React Scan

开发入口先初始化 React Scan，再加载 React 和应用，避免错过 DevTools 注入时机。`pnpm dev` 默认显示扫描工具栏；可设置 `VITE_REACT_SCAN=false` 关闭。生产构建移除该分支，生产 Electron 性能测试不包含扫描工具，避免工具开销污染样本。React Scan 用于定位问题，Playwright 固定采样用于可重复比较。

## 窗口标题栏

`src/main/windowChrome.ts` 管理原生窗口外观，macOS 使用 `hiddenInset`，Windows/Linux 使用 `titleBarOverlay`。窗口按钮、缩放、关闭与未保存确认沿用系统和既有 Electron 行为。`styles/window.css` 声明拖动区域，并为原生按钮预留空间；交互控件必须排除拖动区域。

preload 仅暴露平台、窗口焦点及全屏状态；读取状态仍校验当前窗口和主框架。状态通知只用于界面布局。Storybook 提供 macOS、Windows/Linux、失焦和全屏预览，原生按钮仅在 Electron 中出现。`pnpm test:desktop` 验证真实窗口布局、全屏状态和工具栏操作；跨平台原生行为需在对应系统复核。

## 性能报告

`src/core/fixtures.ts` 生成固定文档，内容不使用随机数。Playwright 将原生窗口设为 1440×960，报告记录 renderer 的实际尺寸，采样三次文件选择、解析到可见界面的耗时和挂载节点数，并输出中位数。当前测试启动真实 Electron 生产构建，包含原生文件选择、解析和自动化等待，仅作比较基线，没有设置硬阈值。

以下保留迁移前的浏览器开发构建历史样本，不代表当前 Electron 生产构建结果。2026-10-15 在本机 macOS arm64、Node.js 25.2.1、Playwright Chromium 156 的一次采样如下。React Scan 已关闭，结果包含文件选择、解析和自动化等待，不等同于纯布局耗时。

| 主题数 | 三次打开耗时中位数 | 挂载主题数 |
| ------ | ------------------ | ---------- |
| 100    | 528 ms             | 100        |
| 1,000  | 692 ms             | 211        |
| 5,000  | 1,644 ms           | 199–214    |

当前报告在 `test-results` 与 `playwright-report`；以本次运行输出为准。CI 将报告作为 artifact 上传。该报告不代表输入延迟、内存峰值或长期运行性能已完成验证。

## 打包与故障排查

`pnpm build` 输出 `out/main`、`out/preload`、`out/renderer`。preload 使用单文件 CommonJS，兼容 Electron sandbox。`pnpm package --dir` 将已有构建装配为 `release` 下的本机应用；使用 Moon package 任务可自动补上构建依赖。

本地 macOS 预览未配置 Developer ID 签名或公证。CI 自动生成 macOS 预览 artifact，不自动发布正式版本。正式发布还需要签名、公证、应用图标和分发策略。当前 electron-builder 使用默认 Electron 图标。

文件读取或恢复失败时，界面显示错误，保留当前内容。保存失败后脏状态保持；可另存到新位置重试。恢复文件或索引损坏时，先保留 `userData/recovery-sqlite-v1`、`brainstorming-local.sqlite` 及元数据库的 WAL/SHM 文件再排查，不覆盖原记录。原生文档还应一并保留；文件内版本依赖其中的共享资源，不能单独抽走资源表。

运行时可选 `ELECTRON_RENDERER_URL` 仅供开发，通过 `src/main/config.ts` 校验为本机 loopback HTTP(S) 地址；生产始终加载打包资源。不要将凭据写入 `.env.example` 或文档。

## Agent 配置

项目指令集中在 `AGENTS.md`，APM CLI 固定 `0.33.0`，显式目标为 Codex。当前没有外部 Agent 依赖；`apm.lock.yaml` 由真实的 `apm lock` 生成。执行 `uvx --from apm-cli==0.33.0 apm install --frozen` 可检查恢复配置。APM 不复制个人登录状态或模型授权。

## 新增能力回归

`tests/e2e/canvas-tools.spec.ts` 验证 Dock 收放、键盘可达性、子面板及连线模式保持展开，画布直接创建与编辑注解。已有 E2E 通过同一可访问入口展开 Dock，不依赖强制显示 CSS。`workbench-dock` 验证真实指针首击和减少动态效果，`workbench-feedback` 验证二维/三维落点与取消，`workbench-viewport` 逐帧检查侧栏开合时位置与缩放、可见区取景及新主题可见性。

真实 Electron E2E、性能测试和 Storybook 浏览器测试串行运行。它们共享图形环境；桌面用例还操作原生窗口、菜单和系统剪贴板，并行执行可能导致焦点、剪贴板或截图捕获相互干扰。`extended-workflows.spec.ts` 覆盖原生文件输出、XMind 往返、搜索替换和密码解锁；桌面测试另验证受限 bridge、离线 AI 服务与历史恢复。

AI 测试使用本机模拟 HTTP 服务和真实 SDK，不使用个人密钥，不请求付费服务。实际第三方服务及实体麦克风硬件仍需按目标系统验证。macOS 打包配置提供录音用途说明；签名和平台权限要在安装产物上复核。
