# Brainstorming（头脑风暴）

基于 React、TypeScript 与 Tauri 2 / Rust 的本地优先思维导图应用。使用单个 pnpm package，面向 macOS、Windows、Linux、iOS 和 Android，不提供独立 Web 产品。

支持多文档标签、多 Sheet、15 种图形结构、2D / 3D 原位编辑、Lexical 中文输入、主题与任务标记、图片和附件、大纲、演示、XMind 导入导出。原生 `.brainstorming` 使用 SQLite / SQLCipher，支持自动保存、密码保护、资源分块、文件内版本与恢复。未选择路径的导图只在内存保留，关闭后丢失。AI 与 MCP 由用户主动启用，不包含云端协作、评论或分享链接。

## 开发

需要 Node.js 24 或更新版本、pnpm、Rust 1.99.1 或更新版本和目标平台的 Tauri 系统依赖。工具链优先使用 Homebrew 安装；macOS 开发先运行 `brew install pkgconf vips`，移动端还需要 Xcode 或 Android SDK / NDK。

```sh
pnpm install --frozen-lockfile
pnpm native:vips --macos
pnpm dev
```

Vite 构建根目录 `index.html` 和 `splash.html`，React 源码位于 `src/`，Rust 和原生插件位于 `src-tauri/`。开发环境启用 React Scan；`VITE_REACT_SCAN=false` 可关闭。React Compiler 保持启用。macOS 开发及正式构建默认启用 `tauri-plugin-macos-fps`，应用图标与界面 Logo 同时适用于开发模式。

桌面使用独立 splash，待 React 挂载完成后显示主窗，自定义标题栏保留原生窗口操作。移动端使用系统启动页、触摸入口、安全区与系统文件选择器。导图颜色按 Sheet 保存，与浅色、深色、跟随系统的界面外观独立。

```sh
pnpm build:desktop
pnpm dev:ios
pnpm dev:android
```

各平台需要独立编译、模拟器或真机验证与签名；前端构建通过不代表全部平台已发布。移动端图片编解码范围及原生库准备见下方说明。

## 文档与验证

- [开发命令与目录](docs/development.md)
- [架构与平台边界](docs/architecture.md)
- [单文件协议](docs/file-format.md)
- [原生图片库与平台能力](docs/native-libraries.md)
- [测试迁移与验证边界](docs/testing-migration.md)
- [产品说明](product.md)

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rust
pnpm build:e2e
pnpm test:e2e
```

Vitest 保留共享 TS 模型、布局、格式和编辑器测试；Rust 测试运行真实 SQLite / SQLCipher 与资源服务；使用 [Tauri 官方推荐的 WebDriver 方案](https://v2.tauri.app/develop/tests/webdriver/)（WebdriverIO + `@wdio/tauri-service` embedded 驱动）启动真实原生应用，支持 macOS、Windows、Linux。E2E 插件和文件选择器替代入口只进入独立的测试构建。Storybook 继续提供组件预览和 Playwright 组件测试。
