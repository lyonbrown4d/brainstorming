# Brainstorming（头脑风暴）

基于 React、TypeScript 与 Tauri 3 alpha / Rust 的本地优先思维导图应用。使用单个 pnpm package，面向 macOS、Windows、Linux、iOS 和 Android，不提供独立 Web 产品。

支持多窗口与多文档标签、多 Sheet、15 种图形结构、14 种内容模板及空白创建、16 种主题表现、同画布自由绘图、Lexical 中文输入、主题与任务标记、图片和附件、大纲、幻灯片编排与播放、XMind 导入导出，以及可调整路径、标签和端点的关联线。统一导出中心支持图片、PDF、PPTX、DOCX、HTML、大纲、XMind、CSV 和 JSON，范围与格式限制见 [开发说明](docs/development.md#文档导出)。原生 `.brainstorming` 使用 SQLite / SQLCipher，支持自动保存、密码保护、资源分块、文件内版本与恢复。未选择路径的导图只在内存保留，关闭后丢失。AI 与 MCP 由用户主动启用，不包含云端协作、评论或分享链接。

同一导图可切换 2D 与 3D 视图。3D 以原生 2D 布局为基础，使用透视相机，支持拖动旋转、触控板平移与捏合、常用视角、聚焦主题、层距和主题深度，首次进入时等待首帧就绪后开放编辑；视角、聚焦目标、层距和主题深度随 Sheet 保存，选择、编辑及撤销沿用同一文档。完整导图按 2D 布局导出；当前 3D 视角可通过原生截图导出为 PNG、JPEG、WebP 或 PDF。

二维大图编辑复用 React Flow 的即时节点状态和延后刷新的缩略图；密集连线在整图拖动时复用路径与整体变换。PixiJS WebGL 连线保留为构建时可启用的实验，Linux 尚未测得稳定收益，默认使用 SVG。三维画布按需加载，独立使用 React Three Fiber / Three.js 和 GPU 图集绘制，不为每个主题挂载 React Flow 节点；仅活动文字编辑使用共享 Lexical 编辑器。两种画布共享文档命令、历史及属性界面。千节点导航、高频输入、拖动、保存与单次撤销由性能用例检查；性能采样口径见 [开发说明](docs/development.md)，本机结果与未通过项目见 [Linux 验证记录](docs/linux-validation.md)。

同一文档可嵌入各 Sheet 的系统预览 PNG；加密文件不提供系统预览。macOS 扩展已编译并验证 ad-hoc 签名，Finder 尚未验收；Linux deb / rpm 实现待运行验收，AppImage 无宿主注册，Windows Explorer 提供程序未实现。详见 [平台状态](docs/development.md#系统文件预览的平台状态)。

## 开发

需要 Node.js 24 或更新版本、pnpm、Rust 1.99.1 或更新版本和目标平台的 Tauri 系统依赖。本机可继续使用 Node 25，无需切换版本；部分依赖未在 engines 中声明 Node 25，安装时保留兼容性警告，不阻断安装。`.nvmrc` 和 `.node-version` 继续推荐 Node 24，CI 覆盖 Node 24 / 25 / 26 验证。工具链优先使用 Homebrew 安装；macOS 开发先运行 `brew install pkgconf vips cmake ninja`，移动端还需要 Xcode 或 Android SDK / NDK。

```sh
pnpm install --frozen-lockfile
pnpm native:vips --macos
pnpm dev
```

桌面 macOS、Windows、Linux 使用 Tauri 3 alpha / CEF，并将 Chromium 随安装包分发；移动端保留 Wry。首次原生构建下载约 1 GB CEF，安装包会明显增大。Linux 需安装 GTK4 开发依赖，详见 [CEF 迁移说明](docs/cef-migration.md)。

开发、检查与构建会先从 Rust 生成 Tauri 类型绑定；`src/generated` 不提交，首次检查也需要原生构建依赖。手写样式使用 SCSS，Tailwind / shadcn 的主题入口保留 CSS。

Vite 构建根目录 `index.html` 和 `splash.html`，React 源码位于 `src/`，Rust 和原生插件位于 `src-tauri/`。开发环境启用 React Scan；`VITE_REACT_SCAN=false` 可关闭。React Compiler 保持启用。桌面三端统一使用 CEF；旧的 macOS WebKit 帧率插件已移除，应用图标与界面 Logo 同时适用于开发模式。

桌面使用独立 splash，待 React 挂载完成后显示主窗，自定义标题栏保留原生窗口操作。移动端使用系统启动页、触摸入口、安全区与系统文件选择器。导图颜色按 Sheet 保存，与浅色、深色、跟随系统的界面外观独立。

```sh
pnpm build:desktop
pnpm dev:ios
pnpm dev:android
```

各平台需要独立编译、模拟器或真机验证与签名；前端构建通过不代表全部平台已发布。移动端图片编解码范围及原生库准备见下方说明。

## Linux 打包

在 Linux 本机执行，生成 `.deb`、`.rpm` 和 `.AppImage`：

```sh
pnpm package:linux
# 仅构建 Debian/Ubuntu 安装包
pnpm package --bundles deb
# 本机调试包，不用于正式分发
pnpm package --debug --bundles deb
```

产物位于 `src-tauri/target/release/bundle/{deb,rpm,appimage}/`，调试包位于 `target/debug/bundle/`。Debian/Ubuntu 使用 `sudo apt install ./文件名.deb`，Fedora 使用 `sudo dnf install ./文件名.rpm`；AppImage 添加执行权限后直接运行。打包不会安装软件或修改本机桌面注册。

当前 Tauri CLI alpha.5 的 deb 文件清单与 CEF 154 不匹配；本轮本机包使用一次性临时打包器，详见 [问题与处理记录](docs/upstream/tauri-cef154-deb.md)。

构建依赖、发行版兼容边界和 CI 下载方式见 [Linux 打包说明](docs/development.md#linux-打包)。

## 文档与验证

- [开发命令与目录](docs/development.md)
- [依赖版本、catalogs 与升级限制](docs/dependency-upgrade.md)
- [架构与平台边界](docs/architecture.md)
- [单文件协议](docs/file-format.md)
- [原生图片库与平台能力](docs/native-libraries.md)
- [测试迁移与验证边界](docs/testing-migration.md)
- [Linux 本机验证记录](docs/linux-validation.md)
- [Android 本机验证记录](docs/android-validation.md)
- [产品说明](product.md)

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rust
pnpm build:e2e
pnpm test:e2e
# Linux 独立 GPU 显示环境，不占用当前桌面焦点
pnpm test:e2e:isolated
pnpm benchmark:2d:isolated
```

Vitest 保留共享 TS 模型、布局、格式和编辑器测试；Rust 测试运行真实 SQLite / SQLCipher 与资源服务；Storybook 提供组件预览和 Playwright 组件测试。桌面 WDIO 通过官方 ChromeDriver 连接真实 CEF 应用，每个测试文件使用独立进程与临时缓存；不启动独立 Chrome UI。驱动按测试二进制内的 CEF SDK 版本匹配。调试端口仅在独立标识的 e2e 构建中启用，生产构建保持关闭。平台验证范围见 [CEF 迁移记录](docs/cef-migration.md)。

## 命令行导出

无图形环境也可导出原生 `.brainstorming` 文件；桌面与 CLI 共用 Rust 几何、布局和编码服务。用法见 [CLI 说明](docs/cli.md)。

```sh
pnpm cli export example.brainstorming -o example.png
pnpm build:cli
```
