# 开发

项目使用单个 pnpm package、Vite、Moon 和 Tauri 2。前端为 React / TypeScript，原生服务为 Rust，移动端平台适配为 Swift / Kotlin。Node.js 要求 24 或更新版本。

## 本机准备

安装 pnpm、Rust stable 和目标平台的 Tauri 官方系统依赖。macOS / iOS 需要 Xcode；Android 需要 JDK 21、Android SDK / NDK，并配置 `JAVA_HOME`、`ANDROID_HOME` 和 `NDK_HOME`。移动设备构建还需要相应签名。原生图片处理需要目标平台的 libvips，不能用宿主机库交叉链接。

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
