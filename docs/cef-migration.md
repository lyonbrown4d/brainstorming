# 桌面 CEF 迁移

macOS、Windows、Linux 统一选择 Tauri 3 alpha 的 CEF runtime；iOS、Android 保留 Wry。桌面不再按平台使用 WebKitGTK、WKWebView 或 WebView2。此次迁移按用户要求暂停回归、UI 和性能测试，不能据此声称帧率已有提升。

## 依赖与构建

- Rust `tauri = 3.0.0-alpha.5`、`tauri-build = 3.0.0-alpha.4`、`tauri-runtime-cef = 3.0.0-alpha.6`，使用精确版本并提交 Cargo.lock。
- npm CLI `3.0.0-alpha.5`、API `3.0.0-alpha.3`，官方原生插件全部升级到 Tauri 3 alpha。
- 原 `tauri-specta` 仅支持 Tauri 2。改用独立社区包 [`tauri3-specta 0.1.0-alpha.3`](https://github.com/nyssance/tauri3-specta)（MIT），配套 Specta rc.27，继续从 Rust 生成绑定，不提交生成产物。此包仍是 alpha，需要后续持续验证。
- 实际桌面入口处理 CEF 子进程，然后再启动应用服务。runtime 使用官方默认 GPU、沙箱与存储策略，不添加关闭 GPU 或沙箱的开关。
- `bundle.cef.embed = true`；CEF 由安装包分发。macOS helper、框架和签名由 Tauri CLI 处理，Linux 保留 deb / rpm / AppImage 入口。

Linux 构建机安装开发依赖需要 sudo：

```sh
sudo apt-get install libgtk-4-dev
```

完整 Linux 依赖与打包命令见 [开发说明](development.md#linux-打包)。macOS 另需 CMake、Ninja：`brew install pkgconf vips cmake ninja`；Windows 需 CMake、Ninja 和官方 C++ 构建工具。

首次构建下载约 1 GB 的 CEF SDK。Tauri CLI 使用平台缓存；直接运行 Cargo 时可设置 `CEF_PATH` 指向相同缓存或已解压 SDK。安装包体积和运行内存会增加，不能沿用系统 WebView 的体积预期。

## 原生适配

窗口和网页预览截图统一调用 CEF 进程内 CDP。观察器按浏览器复用，并限制并发请求、结果大小、等待时间与窗口数量；窗口关闭释放注册状态，请求取消清理待处理项。CEF UI 回调不执行文件写入或阻塞式窗口查询。截图继续验证 PNG 尺寸、取消和临时文件清理。

网页预览仍使用清理后的 HTML、禁用脚本和外部子资源的 CSP。页面原生命令权限继续由 capabilities 和 Rust 命令边界限制，不为远程页面开放命令。远程调试服务器保持关闭。

## 待验证边界

2026-10-26 Linux x86_64 构建记录：依赖解析、真实 Rust 绑定生成、TypeScript、ESLint、格式检查及完整 CEF debug 二进制构建通过；ESLint 保留一处既有 TanStack Virtual / React Compiler 警告。e2e feature 的主程序与输入适配也完成编译检查。编译使用临时解压的官方 GTK4 开发包，没有修改系统安装；正常开发仍需安装上文的系统依赖。未启动应用或运行迁移后的功能、UI、性能测试。

旧 `@wdio/tauri-service` / Rust embedded 驱动仍依赖 Tauri 2，已移除应用中的旧驱动注册。现有 WDIO 用例和 CI 门禁定义保留，但在兼容驱动接入前原生 E2E 无法执行；不能把它们标为通过。CEF 输入适配仅在独立 e2e feature 中保留，真实指针、IME、焦点、窗口、截图、文件操作和打包验收均待后续恢复测试。

本次未执行 CEF 性能对照。旧 WebView 的采样仅保留为历史记录；后续应使用完整匹配的 CEF 二进制、固定 fixture、窗口尺寸、倍率和多次采样重新建立基准。macOS 与 Windows 的构建、签名和安装也需要各自宿主验证。

上游 alpha 的 Windows CEF 暂未提供进程沙箱；当前沿用官方 Auto 策略，需在后续分发评估中跟踪，不能把该平台描述为已启用 Chromium 进程沙箱。参见 [Tauri CEF 文档](https://v3.tauri.app/develop/cef/) 与 [Tauri 3 迁移指南](https://v3.tauri.app/start/migrate/from-tauri-2/)。
