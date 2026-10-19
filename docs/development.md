# 开发

项目使用单个 pnpm package、Vite、Moon 和 Tauri 2。前端为 React / TypeScript，原生服务为 Rust，移动端平台适配为 Swift / Kotlin。Node.js 要求 24 或更新版本；依赖工具支持 Node 24 LTS 或 26 及更新版本，避免使用已停止支持的奇数版本。pnpm 固定为 packageManager 声明的 12.x。

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

`pnpm build-storybook && pnpm test:canvas` 使用现有 Playwright 在隔离的 Storybook 组件预览中执行真实鼠标操作，覆盖画笔命中层级、连续绘制、Esc 取消、擦除与撤销。Moon 的 `canvas-test` 任务会先构建 Storybook。当前 embedded WDIO 1.5 的 pointer actions 实际派发 `MouseEvent`，不能用它验证依赖 `PointerEvent` 与指针捕获的绘画；这部分使用 Playwright 的真实输入，文件持久化继续由 Rust SQLite 集成测试验收，不伪造驱动事件。

原生 E2E 遵循 [Tauri 官方 WebDriver 指南](https://v2.tauri.app/develop/tests/webdriver/)，使用 WebdriverIO 与 `@wdio/tauri-service` 的 embedded 驱动，覆盖 macOS、Windows 和 Linux。插件只在独立 E2E 构建启用；生产应用不启用测试驱动。直接使用 `tauri-driver` 的外部驱动仅支持 Windows、Linux，本项目不为 macOS 维护另一套驱动实现。验收使用当前源码生成的完整测试二进制，不将旧二进制与新的开发 renderer 混用；构建超时或失败时记录阻塞，不能用组件测试结果代替原生 E2E 通过。

CI 保留 Node 24 / 26 的前端、Storybook 构建与浏览器检查；Ubuntu 单独运行无 UI 的 Rust 测试，macOS 运行 Clippy、完整桌面 Rust 测试、真实 WDIO E2E 和 app bundle 构建。预览包使用 Tauri 的 [ad-hoc 签名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)，经 `codesign` 校验后用 `ditto` 打包，保留 app 的执行权限；此步骤不代表完成公证或正式发布。本轮 CI 不构建、不测试 iOS / Android。

移动工程使用 Tauri 官方生成结构 `src-tauri/gen/apple` 和 `src-tauri/gen/android`。原生依赖、签名和模拟器必须独立验证，前端构建成功不代表手机端可以发布。

初始化或重新生成移动工程后，必须再运行 `pnpm tauri icon src/assets/brand/logo-dark.png --output src-tauri/icons`，更新已初始化工程实际使用的 Android / iOS 图标。
`src-tauri/icons/android` 和 `src-tauri/icons/ios` 保留同源的 fallback 图标；iOS init 会从官方模板创建缺失资源，不能仅依靠 fallback 目录自动覆盖新工程的占位图。

## 前端约定

保留 React Compiler 和开发环境 React Scan。内部模块通过 `tsconfig.json` 的 `@core`、`@layout`、`@formats`、`@assets`、`@renderer`、`@shared`、`@tests`、`@project` 等别名导入。禁止相对模块路径，资源 URL 和系统文件路径不受此限制。

手写源文件、测试和 TypeScript 配置不超过 300 行；不压缩代码规避限制。使用箭头函数、严格类型、局部 Zustand 订阅与 TanStack Query。UI 优先组合现成 shadcn 组件，通过 props、className 和集中主题调整，不能直接修改下载组件；样式优先使用 Tailwind utilities。

## 工作区路由与设置

原生入口在 `mountApp.tsx` 使用 React Router 的 `HashRouter`，路径写入 URL 的 `#` 部分，适用于 Tauri 的本地资源协议。没有 Router 上下文的 `App` 预览使用 `MemoryRouter`，不修改 Storybook 页面自身的 hash。

| 路径                                                       | 工作区                         |
| ---------------------------------------------------------- | ------------------------------ |
| `/home`                                                    | 首页                           |
| `/create/document/:stage`                                  | 新建导图                       |
| `/create/sheet/:stage`                                     | 在当前导图中新建画布           |
| `/documents/:tabId/sheets/:sheetId`                        | 指定导图与画布                 |
| `/documents/:tabId/sheets/:sheetId/style/topic`            | 主题属性侧栏                   |
| `/documents/:tabId/sheets/:sheetId/style/canvas/:section?` | 画布属性侧栏                   |
| `/documents/:tabId/sheets/:sheetId/presentation`           | 演示编排                       |
| `/documents/:tabId/sheets/:sheetId/presentation/presenter` | 演讲者视图                     |
| `/documents/:tabId/sheets/:sheetId/presentation/play`      | 观众播放视图                   |
| `/settings`                                                | 保留当前工作区背景的设置对话框 |

创建步骤 `stage` 为 `structure`（选择结构）或 `configuration`（标题与内容模板）；旧的 `/create/document`、`/create/sheet` 会规范化为第一步。浏览器前进、后退和设置往返均保留 Zustand 中的标题、结构与模板草稿；退出引导后再前进也能恢复。创建成功才清空对应文档或画布草稿，失败保留输入。草稿只留本次应用内存，不写入文件和恢复记录。创建页使用一个纵向滚动区，结构预览按内容高度排列，标题、表单与固定底部操作栏共用内容宽度；模板卡片按容器宽度换列。模板对话框继续使用有界的 shadcn ScrollArea。

画布属性的 `section` 为 `structure`、`appearance` 或 `template`，省略时规范化为 `structure`。属性开关、一级分类和画布分组双向同步路由；关闭侧栏回到无 `/style` 后缀的画布。侧栏导航信息随既有文档会话保存，文档模型与撤销历史不变；主题选中、hover 和逐字符编辑不进入 URL。创建步骤使用短距离方向过渡，属性分类使用淡入，均尊重系统减少动态效果偏好，不重挂载整张画布。

`useWorkspaceRoutes` 是 URL 与既有 Zustand 会话之间的同步入口。URL 导航复用文档 Tab、Sheet、创建和演示命令的提交守卫；忙碌或草稿校验失败时，保留当前文档和草稿，并将 URL 替换为实际工作区路径。用户操作引起的导航字段变更合并为一次微任务更新，应用 URL 期间不反向新增历史。文本草稿、选区和播放页码变化不触发导航。

Tab 和 Sheet 标识只定位当前应用中已打开的会话；URL 不包含文件路径、文档内容或恢复数据。已关闭或无效的标识会替换为仍合法的工作区路径，不重新打开文件。设置对话框关闭或按 Esc 时返回来源路径；直接打开 `/settings` 或来源已失效时，返回当前合法工作区。

标题栏统一通过设置按钮进入通用、画布、快捷键和关于四个横向分组。语言复用原生设置 API，浅色、深色与跟随系统复用 `next-themes`，缩略图复用已有画布偏好。修改即时保存，关闭对话框不撤销已保存的偏好；语言保存失败会显示错误并保持原语言。设置内容按需加载，打开设置或演示编排时不重建背景画布。

路由状态专项为 `tests/renderer/workspace-routing.test.ts` 和 `tests/renderer/workspace-route-views.test.ts`；浏览器交互见 `stories/Settings.stories.tsx` 和 `stories/WorkspaceRoutes.stories.tsx`。后者检查真实 App 的 Canvas DOM 身份、演示往返、文档切换和历史返回。运行 Storybook 浏览器检查时避免多个进程共用同一测试缓存。

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

`useFileLifecycle` 启动按 Tab 管理的自动保存。已有路径的文档通过 RxJS 合并连续编辑并串行写入；后台 Tab 不需要切为当前文档。保存快照投影当前文本草稿，不提交编辑历史、不改变 Lexical 选区或输入法状态。保存完成只更新该 Tab 的对应基线，保存期间的新修改继续保持未保存状态。重新打开或拖入文档前，等待已有路径队列中的写入和释放操作结束，避免旧关闭操作撤销新资源会话。删除旧恢复文件时，只有当前资源来源仍指向该旧路径才清理登记；资源扫描隔离单个不可读来源，不阻断其他已授权文档。

手动保存、另存为、密码变更、版本读取和文档释放共用按路径的写入队列。失败保留未保存状态与错误提示，并在服务仍可用时重试。`path === null` 的新建、导入或恢复副本不进入自动保存，也不进入新的工作区恢复快照；关闭或重载后丢失，需通过手动保存选择路径。媒体暂存仍使用原生加密临时资源库，退出时清理。

## 图片导出

导出对话框复用 `src/export/images.ts` 的完整 Sheet SVG 场景，预览和输出包含相同的主题、关联线、标记与嵌入图片。PNG、JPEG、WebP 和 SVG 通过 `exportImage` 交给 Rust；`resvg` 负责原生栅格化，`image` 负责 PNG、JPEG 与无损 WebP 编码。JPEG 默认质量为 92，透明区域填白；SVG 不栅格化，字体使用查看设备的本地字体。PDF 继续使用现有前端栅格图与 jsPDF 单页 A3 流程，不提供可搜索文字。

自动质量从 2× 开始，在分配图片内存前适配单边 16384 px、总计 4000 万像素的上限；手动比例超限会报错。界面显示输出尺寸和自动降倍率提示，并区分准备场景、选择位置、渲染、编码与写入阶段；阶段提示不是精确百分比。原生服务拒绝 SVG 中的脚本和外部资源引用，限制场景与资源大小，串行渲染并在原子写入完成后报告成功。

## 系统文件预览的平台状态

文件内 PNG 的协议、摘要与权限边界见 [单文件协议](file-format.md#文件内系统预览)。`src/lib/documentPreviews.ts` 在成功保存后排队，从同一 SVG 场景生成有界 PNG；图片过大时最多尝试 1600、1024、640 和按每张图片预算计算的较小尺寸。预览仍使用前端 PNG 编码，与导出对话框的原生编码分开。

| 平台 / 分发方式 | 当前实现                                                                 | 验证边界                                                                      |
| --------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| macOS           | `QLThumbnailProvider` 与 `QLPreviewingController` 扩展；后者可切换 Sheet | Swift 编译、只读数据检查和隔离测试包的 ad-hoc 签名校验通过；Finder 加载未验收 |
| Linux deb / rpm | 只读 `brainstorming-thumbnailer`、MIME 与 `.thumbnailer` 包装            | 已实现，尚未在 Linux 文件管理器运行验收                                       |
| Linux AppImage  | 不注册宿主系统的缩略图提供程序                                           | 无宿主桌面集成                                                                |
| Windows         | 文件内可保存预览 PNG                                                     | Explorer 缩略图和预览处理程序未实现                                           |

`pnpm build:desktop` 在 macOS 先构建扩展，再通过 `bundle.macOS.files` 放入应用的 `Contents/PlugIns`，供后续宿主签名与打包。正式分发需要相应签名和公证。本机没有可用签名身份；隔离 ad-hoc 测试包的扩展添加命令返回成功，但查询未发现提供程序，缩略图请求超时且没有输出。因此不能将编译和签名校验视为 Finder 验收通过，也不能据此确定未加载的唯一原因。

Linux 构建脚本将 helper、MIME 和缩略图描述安装项加入 deb / rpm 包；构建过程不修改开发机的系统注册。AppImage 内的私有文件不能代替宿主桌面注册。Windows 后续需要独立实现并验证 Shell 处理程序及安装器注册。

## 内容模板与关联线

内容模板位于 `src-tauri/templates`：版本化 `manifest.json` 和 14 份静态 JSON 通过 `src-tauri/src/templates.rs` 编译进后端。`listTemplates` 返回目录及每份模板的语义图标名称，前端映射为内置 Lucide 图标，并按需通过 `getTemplate` 请求正文，并使用 TanStack Query 缓存；请求只接受固定模板 ID，不解释为路径。后端校验目录与正文一致性，前端再次校验结构，创建时生成新的主题 ID。新建文档、新增 Sheet 和替换模板复用同一目录；「不使用预设」直接创建中心主题，不请求模板正文。

关联线复用 `src/shared/relation-geometry.ts` 计算直线、曲线与直角折线，画布和 SVG 导出共享路径及标签位置。选中后可拖动曲线控制点、折线路径点与标签，也可将端点重新连接到其他主题；拖动只更新临时预览，完成后一次命令提交，取消不写历史。序列化字段与原生校验见 [单文件协议](file-format.md#主题表现笔迹与演示页面)。

## 原生缓存

图片导入使用 Moka `future` 缓存已完成的派生元数据，每个 Importer 最多 256 项，TTL 为 30 分钟。缓存键由原图 SHA-256、管线版本与固定处理参数组成。命中会跳过 libvips 重复生成，仍读取原文件并校验内容、取消和文件变化，重新生成资源身份与授权。缓存不保存原始字节、临时文件、密码或失败结果；修改 libvips 参数时同步更新参数签名或管线版本。

Tauri 的 `src-tauri/gen/schemas` 是按当前构建 feature 生成的权限 schema，由 CLI 重新生成，不提交到 Git。

开发编译的最后一个 Rust 任务同时生成平台所需的库，Cargo 进度条可能较久不变。`profile.dev.debug = "line-tables-only"` 使用官方行号调试信息，减少完整类型符号和静态归档的磁盘写入，保留文件与行号堆栈。首次修改 profile 会重新编译依赖；需要变量级原生调试时可临时设置 `CARGO_PROFILE_DEV_DEBUG=full`。不通过清空 `target` 处理正常编译等待。

macOS `build:desktop --debug`（未指定证书）或显式 `APPLE_SIGNING_IDENTITY=-` 的本地预览包会叠加 `tauri.preview.conf.json`，由 Tauri 完成 [ad-hoc 签名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)。此预览配置不启用 Hardened Runtime：ad-hoc 主程序和 libvips 均没有 Team ID，无法通过其[同团队动态库校验](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.disable-library-validation)。正式分发不使用此预览配置，需配置 Developer ID 和公证；默认发布配置仍保留 Hardened Runtime。

## 数据库迁移

数据访问使用 SQLx / SQLCipher；`libsqlite3-sys` 使用 SQLx 稳定版支持的兼容版本并启用 SQLCipher，Rust 应用后端不能另外链接普通 SQLite；独立 Quick Look 扩展使用系统 SQLite3，只读未加密文件的预览表。根目录 `.cargo/config.toml` 在编译 SQLCipher 时固定 `SQLITE_MAX_LENGTH=134217728`，使初次连接读取不可信 schema 前就有长度上限；连接认证仍设置同样的运行时限制。每条连接在读取数据库前完成 key pragma，关闭 SQL 日志，验证 SQLCipher 和数据库可读性。

文档迁移放在 `src-tauri/src/document/migrations`，本机设置迁移放在 `src-tauri/src/storage/migrations`。两组使用独立 Migrator；执行入口是应用内配置好的 Migrator，不对用户文件执行默认 CLI 迁移。履历表均为 `_brainstorming_migrations`，由 SQLx 维护版本与校验和。不要手写履历 INSERT，也不要运行用户文件内的 SQL。

新变更追加有序编号 SQL，例如 `002_add_topic_index.sql`；不修改已发布的迁移。迁移编号独立于文件协议的 `application_id` / `user_version`。Cargo build.rs 追踪两个迁移目录，新增文件会重新嵌入。迁移或校验失败必须保留原文件，相关测试使用真实 SQLCipher 和有界资源。

### 暖白与石墨界面

主操作和选中态采用石墨 / 暖白反色，默认导图中心为石墨色，界面不使用紫色选中底色；紫色仍可作为用户的导图配色。界面沿用浅色、深色与跟随系统，使用 `src/styles/ui.css` 的语义变量统一标题栏、Dock、属性栏、启动页和演示页。默认导图的画布与派生节点底色跟随界面外观；其他导图预设、自定义背景和显式节点颜色保持文档设置。外观投影不写入工作簿、撤销记录或导出颜色。

三个桌面平台共用 44px 标题栏，常用操作按钮保持 32px 高度；macOS 保留原生交通灯，Windows、Linux 使用右侧窗口操作区。大纲和属性栏宽度由 `src/shared/workbench.ts` 统一维护。

属性折叠复用官方 shadcn Accordion，由固定版本 `shadcn@4.22.0` CLI 下载；上层 `PropertySection` 组合样式并保留折叠内容的编辑器 DOM，不修改下载源码。

### 原生验收输出与构建存储

原生 E2E 截图、窗口指标和失败页面统一写入 `test-results/native`，可通过 `BRAINSTORMING_E2E_ARTIFACTS` 指定输出目录，适用于 macOS、Windows、Linux。诊断采集失败仍保留原始测试失败。每次更换测试二进制前，先退出上一次独立 E2E 应用，避免单实例插件将新启动转交给旧进程；不得关闭用户正在使用的正式应用。测试复用同一构建的单实例窗口时，使用现有 `home()` 流程重置 renderer，不假定启动后总处于首页。刷新前先聚焦原生窗口，再等待新的页面和可用工作区。重置前记录并清空未消费的文件选择器 fixture；隔离 E2E 构建遇到缺失或类型不符的 fixture 会明确失败，不回退到真实系统选择器。创建与编辑操作同时等待当前路由和可用控件，保存等待目标路径成为已保存基线。

Lexical 内容输入通过 `fillContentEditable` 使用 WebDriver 全选后插入文本；不调用 embedded 驱动的 `clearElement`，该实现会直接清空 `innerHTML`，绕过编辑器状态更新。测试的 `home()` 会清理隔离实例的恢复记录；恢复功能本身仍由专用保存、重载和解锁用例验证。

外部存储发生归档写入或依赖读取停滞时，先检查进程与文件活动；可使用本机 SSD 用户缓存目录保存 Cargo 产物（`CARGO_TARGET_DIR`），避免运行中的验收程序被临时目录清理移除，并将 `BRAINSTORMING_E2E_BINARY` 指向该目录生成的当前测试应用。若依赖缓存也在外部卷，使用当前源码的本机临时验收副本和独立 pnpm 缓存；必须按锁文件安装并完整构建，不能混用旧二进制与新 renderer。

## React 开发诊断

React Scan 默认在开发模式启用，显示重渲染和 FPS；可设置 `VITE_REACT_SCAN=false` 关闭。需要组件树或 Profiler 时，先运行 `pnpm devtools`，再在另一个终端运行 `VITE_REACT_DEVTOOLS=true pnpm dev`。官方 React DevTools standalone 监听 `127.0.0.1:8097`，后端 hook 先于 React 与 Scan 初始化。工具未连接不阻止编辑器启动。

DevTools CLI 自身使用 Electron，仅作为开发依赖，产品运行时仍为 Tauri。只有开发 CSP 允许该本机 WebSocket，生产 CSP 与发布入口不加载诊断代码。默认不启用远程诊断；不要把本机调试端口转发到外部网络。React DevTools 上游仅发布 Flow API，`src/dev/react-devtools-core.d.ts` 声明项目实际使用的最小接口。

依赖升级以最新稳定且上游兼容的组合为准。本轮 WDIO 仍使用 9.x：最新 Tauri service 1.5.0 仍调用 `executeAsync`，WDIO 10 已移除此 API；SQLite 底层库受 SQLx 0.9 的 `<0.38` 约束，保持 0.37.0。其余 npm 和 Cargo 版本由锁文件固定。

## React Flow 交互参考

画板工具参考 [官方白板指南](https://reactflow.dev/learn/advanced-use/whiteboard)，沿用 React Flow 坐标转换和视口，笔迹复用 perfect-freehand。画笔输入层高于 React Flow renderer；擦除模式让已绘笔迹直接接收输入，并禁用节点拖动和画布拖动。选择模式恢复正常导图操作。笔迹使用独立 React Flow 节点，复用官方 [NodeResizer](https://reactflow.dev/api-reference/components/node-resizer)、框选和组拖动；原始采样不在缩放过程中重写。混合选区只平移，不改变主题父级；主题与笔迹通过同一批量命令提交，预览、选择和取消不进入历史。真实鼠标回归位于 `tests/canvas/ink-editing.spec.ts`。

演示参考 [官方幻灯片教程](https://reactflow.dev/learn/tutorials/slide-shows-with-react-flow) 的内容与导航状态分离、键盘导航和有限目标聚焦思路。当前产品保留已确认的页面编排、观众与演讲者视图；播放不改变底层导图布局，也不为每页复制整张导图。

## 全局命令与内容索引

命令面板组合官方 shadcn Command / Dialog 和 cmdk，使用 ⌘/Ctrl+Shift+P 打开；编辑快捷键在面板打开时暂停。操作复用既有文件、历史与视口命令。异步内容查询由 TanStack Query 管理，输入经 ahooks 防抖，关闭面板取消过期结果。结果以普通文本呈现，不执行备注中的 HTML。

`state/contentIndexSync.ts` 监听文档会话与已提交工作簿，复用 lodash 防抖，并通过串行队列同步发生变化的文档；查询前等待同步完成。选区、编辑草稿与拖动预览不建立索引。定位只接受仍存在于当前打开会话的文档、Sheet 和主题，复用现有查找定位与视口入口。

Rust 的 `search` 模块通过 FluxDI 装配到 AppState。索引复用 SQLx 和现有 SQLite FTS5：三字及以上词使用 trigram 全文索引，一至两字使用同一内存库中的受限文本匹配，多词按 AND 匹配，标题优先。所有输入使用绑定参数，FTS 操作符按字面文本处理。同步在事务内替换或移除文档，非法批次不改变现有索引。

索引只存已打开且解锁文档的标题、Sheet 名、主题标题与备注；不含资源二进制、文件路径或密码，不创建明文磁盘索引。单进程最多保留 32 份文档、100000 个主题、128 MiB 原始文本，单工作簿最多 20000 个主题；超过限制返回可见错误。重载或关闭会话清除索引，应用退出关闭连接池。此索引无需文件格式迁移。

`tests/native/content-search.spec.ts` 使用真实 Rust IPC 和 SQLite 索引验收跨文档、跨 Sheet 定位、未保存内容更新和关闭清理；前端同步竞态与取消由 renderer 测试覆盖。

## 桌面插件

插件统一由 `src-tauri/src/platform/plugins.rs` 注册。已接入官方 clipboard-manager、fs、single-instance，本轮补充 log `2.10.1`、notification `2.7.0`、window-state `2.5.0`；版本以 Cargo.lock 为准。所有插件从 Rust 侧使用，renderer 继续调用类型明确的 `native_request`，不增加通用文件读写、任意通知或前端日志权限。

- `single-instance` 首先注册，后续启动继续将文件交给已有窗口；主窗口隐藏时不抢先显示，由 `startupReady` 完成启动交接。
- `window-state` 仅管理主窗口。自动恢复尺寸与位置；最大化在 `startupReady` 恢复一次，正常关闭前通过官方接口保存三项状态。不恢复显隐、全屏、窗口装饰，不追踪启动页或远程预览。E2E 关闭窗口状态持久化，避免修改本机窗口偏好。
- `log` 是唯一日志后端，现有 tracing 调用通过官方 `log` 功能转发一次。默认 Warn 级别，只接受本应用 target，输出 stderr 和系统应用日志目录。单文件上限 1 MiB，保留 3 个归档；生命周期错误使用固定文案，避免把底层异常中的内容、路径、URL 或密钥写入日志。不订阅 WebView console。E2E 不写日志文件。
- `notification` 由 FluxDI 管理的 NotificationService 调用，只在 `exportFile` 或 `exportImage` 完成原生写入后发送固定的中英文提示。取消、失败和自动保存不发送；发送失败不改变导出结果，后台发送受容量与时限约束。权限仅由设置中的显式启用动作申请，被拒绝或服务不可用时保留可读状态。桌面插件返回 Granted 并不能证明系统实际展示了通知，仍受通知中心设置、免打扰和打包环境影响。

通知偏好保存在现有 SQLx 本机库，新增 `002_notifications.sql`，不改变导图文件格式。未额外引入 Store，避免形成第二套原生偏好存储；也未引入 Persisted Scope：该插件恢复的是 Tauri fs/asset scope，不会替代当前 Rust 会话的文档、资源与密码授权。

剪贴板仍用成熟的 clipboard-rs 保留应用自定义 MIME 与纯文本的同次写入；官方剪贴板插件不能单独替代主题树的自定义格式。文件系统插件保持可用，文档事务与分块资源继续由 SQLx、tokio 和现有授权服务管理。

参考：[通知](https://v2.tauri.app/zh-cn/plugin/notification/)、[日志](https://v2.tauri.app/zh-cn/plugin/logging/)、[窗口状态](https://v2.tauri.app/zh-cn/plugin/window-state/)、[持久化作用域](https://v2.tauri.app/zh-cn/plugin/persisted-scope/)、[Store](https://v2.tauri.app/zh-cn/plugin/store/)。

## 内置贴图与插画

素材 IPC 仅提供 `listBuiltinArt` 与固定 ID 的 `getBuiltinArt`，不接受路径或远程 URL。目录内嵌于 `src-tauri/src/builtin_art/catalog.json`；4 张原创 PNG 及生成记录位于 `src-tauri/builtin-art/originals/`，原图逐字节保留，128px 预览由 Rust image 管线生成。54 个精选 Fluent Emoji Flat SVG 来自 Iconify 1.2.6 / Microsoft，MIT 全文编译入目录，并保留在素材目录。

原生 SVG 渲染使用现有 resvg，在 `spawn_blocking` 内分配图片，以 `Semaphore(2)` 限制并发，Moka 按 ID 合并并缓存成功结果（最多 58 项，空闲 1 小时过期）。插入复用 `setTopicImage` 和现有资源保存协议；异步完成前切换文档、Sheet 或删除目标主题会丢弃结果。相关验证为 `tests/renderer/builtin-art.test.ts`、`src-tauri/tests/document_builtin_art.rs` 及 `stories/BuiltinArt.stories.tsx`。
