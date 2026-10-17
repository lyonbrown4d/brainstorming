# 开发

项目使用单个 pnpm package、Vite、Moon 和 Tauri 2。前端为 React / TypeScript，原生服务为 Rust，移动端平台适配为 Swift / Kotlin。Node.js 要求 24 或更新版本。

## 本机准备

安装 pnpm、Rust 1.99.1 或更新版本和目标平台的 Tauri 官方系统依赖。macOS / iOS 需要 Xcode；Android 需要 JDK 21、Android SDK / NDK，并配置 `JAVA_HOME`、`ANDROID_HOME` 和 `NDK_HOME`。移动设备构建还需要相应签名。原生图片处理需要目标平台的 libvips，不能用宿主机库交叉链接。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 通过 Tauri CLI 启动 Vite 和原生窗口。Vite 服务只是原生 WebView 的开发资源，不是独立 Web 产品。浏览器直接打开时不会获得文件、密码或恢复能力。

## 常用命令

| 命令                                             | 用途                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm build`                                     | 构建 React 和启动窗口资源到 `dist`                                  |
| `pnpm build:desktop`                             | 编译并打包原生桌面应用                                              |
| `pnpm dev:ios` / `pnpm build:ios`                | iOS 开发 / 构建                                                     |
| `pnpm dev:android` / `pnpm build:android`        | Android 开发 / 构建                                                 |
| `pnpm typecheck` / `pnpm lint`                   | TypeScript 类型和工程约定                                           |
| `pnpm test`                                      | 共享 TypeScript 单元与状态测试                                      |
| `pnpm test:rust`                                 | 不启用 native-ui 的 Rust 文件、SQLCipher 和资源测试，不需要 libvips |
| `pnpm exec moon run brainstorming:desktop-test`  | 启用 e2e / native-ui 的 Rust 桌面服务、权限和真实 libvips 测试      |
| `pnpm exec moon run brainstorming:desktop-check` | 启用 e2e / native-ui 的全目标 Clippy 检查                           |
| `pnpm check:rust`                                | 原生 Clippy 检查                                                    |
| `pnpm build:e2e`                                 | 编译独立应用标识、启用 e2e feature 的 Tauri 测试二进制              |
| `pnpm test:e2e`                                  | 使用已编译的测试二进制运行原生 WDIO 流程                            |
| `pnpm exec moon run brainstorming:e2e`           | 先执行 build:e2e，再运行原生 WDIO 流程                              |
| `pnpm native:vips --macos`                       | 校验并准备固定版本 macOS 图片库、许可证和 bundle 配置               |
| `pnpm package --bundles app`                     | 使用现有准备脚本编译并生成 macOS app bundle                         |
| `pnpm storybook` / `pnpm test:storybook`         | 组件预览 / 浏览器组件测试                                           |

macOS 桌面验证先安装 `brew install pkgconf vips`。`desktop-test`、`desktop-check` 和 `build:e2e` 使用本机开发库；`package` 使用构建脚本准备并打包固定版本的 macOS 图片库，不依赖目标机器上的 Homebrew。直接运行 `pnpm test:e2e` 不会编译应用；通常使用 Moon 的 `e2e` 任务，或先运行 `pnpm build:e2e`。

CI 保留 Node 24 / 26 的前端、Storybook 构建与浏览器检查；Ubuntu 单独运行无 UI 的 Rust 测试，macOS 运行 Clippy、完整桌面 Rust 测试、真实 WDIO E2E 和 app bundle 构建。预览包使用 Tauri 的 [ad-hoc 签名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)，经 `codesign` 校验后用 `ditto` 打包，保留 app 的执行权限；此步骤不代表完成公证或正式发布。本轮 CI 不构建、不测试 iOS / Android。

移动工程使用 Tauri 官方生成结构 `src-tauri/gen/apple` 和 `src-tauri/gen/android`。原生依赖、签名和模拟器必须独立验证，前端构建成功不代表手机端可以发布。

初始化或重新生成移动工程后，必须再运行 `pnpm tauri icon src/assets/brand/logo-dark.png --output src-tauri/icons`，更新已初始化工程实际使用的 Android / iOS 图标。
`src-tauri/icons/android` 和 `src-tauri/icons/ios` 保留同源的 fallback 图标；iOS init 会从官方模板创建缺失资源，不能仅依靠 fallback 目录自动覆盖新工程的占位图。

## 前端约定

保留 React Compiler 和开发环境 React Scan。内部模块通过 `tsconfig.json` 的 `@core`、`@layout`、`@formats`、`@assets`、`@renderer`、`@shared`、`@tests`、`@project` 等别名导入。禁止相对模块路径，资源 URL 和系统文件路径不受此限制。

手写源文件、测试和 TypeScript 配置不超过 300 行；不压缩代码规避限制。使用箭头函数、严格类型、局部 Zustand 订阅与 TanStack Query。UI 优先组合现成 shadcn 组件，通过 props、className 和集中主题调整，不能直接修改下载组件；样式优先使用 Tailwind utilities。

## macOS 高刷新率

macOS 默认注册 [tauri-plugin-macos-fps](https://github.com/userFRM/tauri-plugin-macos-fps)，开发和正式构建均启用，自动应用于主窗口和启动窗口。配置位于 `src-tauri/tauri.macos.conf.json` 的 `plugins.macos-fps.enabled`；不向前端增加命令权限。其他平台不编译或注册此插件。

上游说明主要针对 macOS 13–15 的 WKWebView 帧率限制；macOS 26 及更新版本通常无需额外解锁。当前采用站外分发方向，暂不面向 Mac App Store。实际帧率应在对应系统和显示器上测量，不把插件注册视为已经达到 120 FPS。React Scan 仍只在开发模式启用。

## 原生边界

新增平台能力先检查 Tauri 官方插件和维护活跃的 Rust 库。`native_request` 只接收已登记的方法；Rust 再验证输入与文件授权。不要向前端暴露任意 SQL、文件系统或命令执行。WebView 之间的权限不能因为共享应用进程而共享。

文档保存、恢复、解锁和资源生命周期的测试必须使用真实 SQLite / SQLCipher。系统文件选择器可在独立 E2E 构建中替代为指定测试路径；不能模拟文件格式、加密或原生资源读取结果。测试与正式应用使用不同应用标识，禁止删除真实用户数据。

修改后运行相关 Vitest / Rust 测试，以及格式、lint、typecheck 和构建。涉及平台 API 时补充对应原生验证，并在交付中区分编译、模拟器运行、真机及签名发布的结果。

原生库准备与 codec 边界见 [原生图片库](native-libraries.md)，旧测试到 Rust / 原生 UI 的对应见 [测试迁移](testing-migration.md)。

## 后端模块与依赖注入

`src-tauri/src/application` 是原生服务的装配入口，使用 FluxDI 2.0.0 的 `static_module!` 声明类型化依赖图。存储、文档、AI/MCP、媒体和平台按职责维护 Module；缺失依赖、循环及工厂类型由宏检查。启用 `thread-safe`、`async-factory`、`lifecycle`、`macros`，共享句柄使用 `Arc`。

`StorageServices` 提供本机元数据库与加密资源暂存库；`DocumentServices` 导入存储服务并提供文档连接池及会话；`IntegrationServices` 提供 AI 与 MCP；`CoreServices` 汇总这些服务，`BackendServices` 将这个类型化容器注入 `AppState::from_container`，再装配媒体服务。Tauri 继续挂载类型明确的 service；`AppState` 构造函数不再接收逐项服务参数。所有生命周期钩子使用同一个最外层依赖图及其共享上下文，避免导入模块时重复创建数据库或队列。业务方法接收类型明确的依赖，不从全局容器查找服务。

FluxDI `Application` 按平台、存储、文档、集成、媒体的顺序异步启动，正常退出及启动失败清理按相反顺序执行。资源初始化失败须在工厂内关闭尚未交给生命周期管理的资源。文件与资源关闭流程不使用会中断清理的超时；保存任务、SQLx 连接和临时文件继续由原生任务持有，直至关闭完成。

Tauri 命令使用服务访问租约。退出先撤销媒体访问、取消 AI/MCP，再等待已进入的命令结束，随后清理会话、关闭文档连接池和本机数据库。启动任务由共享 future 持有，调用者取消不会中断原生初始化；启动页退出和主窗口销毁也等待初始化与清理。启动失败时不发布半初始化的 Tauri 状态，重试创建新的服务图。

文档连接池注册表由注入的 `DocumentStore` 持有；同一应用中的 Tab 通过共享实例及规范路径复用连接池。`DocumentStore::clone()` 共享注册表，`DocumentStore::new()` 创建独立服务，关闭一个实例不会永久关闭其他实例或阻止启动重试。

## 自动保存

`useFileLifecycle` 启动按 Tab 管理的自动保存。已有路径的文档通过 RxJS 合并连续编辑并串行写入；后台 Tab 不需要切为当前文档。保存快照投影当前文本草稿，不提交编辑历史、不改变 Lexical 选区或输入法状态。保存完成只更新该 Tab 的对应基线，保存期间的新修改继续保持未保存状态。

手动保存、另存为、密码变更、版本读取和文档释放共用按路径的写入队列。失败保留未保存状态与错误提示，并在服务仍可用时重试。`path === null` 的新建、导入或恢复副本不进入自动保存，也不进入新的工作区恢复快照；关闭或重载后丢失，需通过手动保存选择路径。媒体暂存仍使用原生加密临时资源库，退出时清理。

## 原生缓存

图片导入使用 Moka `future` 缓存已完成的派生元数据，每个 Importer 最多 256 项，TTL 为 30 分钟。缓存键由原图 SHA-256、管线版本与固定处理参数组成。命中会跳过 libvips 重复生成，仍读取原文件并校验内容、取消和文件变化，重新生成资源身份与授权。缓存不保存原始字节、临时文件、密码或失败结果；修改 libvips 参数时同步更新参数签名或管线版本。

Tauri 的 `src-tauri/gen/schemas` 是按当前构建 feature 生成的权限 schema，由 CLI 重新生成，不提交到 Git。

开发编译的最后一个 Rust 任务同时生成平台所需的库，Cargo 进度条可能较久不变。`profile.dev.debug = "line-tables-only"` 使用官方行号调试信息，减少完整类型符号和静态归档的磁盘写入，保留文件与行号堆栈。首次修改 profile 会重新编译依赖；需要变量级原生调试时可临时设置 `CARGO_PROFILE_DEV_DEBUG=full`。不通过清空 `target` 处理正常编译等待。

macOS `build:desktop --debug`（未指定证书）或显式 `APPLE_SIGNING_IDENTITY=-` 的本地预览包会叠加 `tauri.preview.conf.json`，由 Tauri 完成 [ad-hoc 签名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)。此预览配置不启用 Hardened Runtime：ad-hoc 主程序和 libvips 均没有 Team ID，无法通过其[同团队动态库校验](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.disable-library-validation)。正式分发不使用此预览配置，需配置 Developer ID 和公证；默认发布配置仍保留 Hardened Runtime。

## 数据库迁移

数据访问使用 SQLx / SQLCipher；`libsqlite3-sys` 使用 SQLx 稳定版支持的兼容版本并启用 SQLCipher，不能另外链接普通 SQLite。根目录 `.cargo/config.toml` 在编译 SQLCipher 时固定 `SQLITE_MAX_LENGTH=134217728`，使初次连接读取不可信 schema 前就有长度上限；连接认证仍设置同样的运行时限制。每条连接在读取数据库前完成 key pragma，关闭 SQL 日志，验证 SQLCipher 和数据库可读性。

文档迁移放在 `src-tauri/src/document/migrations`，本机设置迁移放在 `src-tauri/src/storage/migrations`。两组使用独立 Migrator；执行入口是应用内配置好的 Migrator，不对用户文件执行默认 CLI 迁移。履历表均为 `_brainstorming_migrations`，由 SQLx 维护版本与校验和。不要手写履历 INSERT，也不要运行用户文件内的 SQL。

新变更追加有序编号 SQL，例如 `002_add_topic_index.sql`；不修改已发布的迁移。迁移编号独立于文件协议的 `application_id` / `user_version`。Cargo build.rs 追踪两个迁移目录，新增文件会重新嵌入。迁移或校验失败必须保留原文件，相关测试使用真实 SQLCipher 和有界资源。
