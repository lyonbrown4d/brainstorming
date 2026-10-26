# 桌面 CEF 迁移

macOS、Windows、Linux 统一选择 Tauri 3 alpha 的 CEF runtime；iOS、Android 保留 Wry。桌面不再按平台使用 WebKitGTK、WKWebView 或 WebView2。首次迁移曾按要求暂停测试；当前已恢复 WDIO 和本机回归。运行结果按下文记录，不以系统 WebView 的旧帧率推断 CEF 性能。

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

## 对话框与平台边界

| 平台          | 文件选择器                                                                                             | 构建状态                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Linux         | 官方 `tauri-plugin-dialog` 的 XDG Portal 后端，禁用默认 GTK3 feature，避免与 CEF / GTK4 在同一进程冲突 | 本机已编译、识别 FileChooser Portal 接口；E2E 选择器使用原有受限 fixture |
| macOS         | 保留官方原生对话框后端                                                                                 | 依赖按目标隔离，需在 macOS 构建和验收                                    |
| Windows       | 保留官方原生对话框后端                                                                                 | 依赖按目标隔离，需在 Windows 构建和验收                                  |
| iOS / Android | 保留官方移动插件与既有平台适配                                                                         | 本轮未构建或设备验收                                                     |

Linux 消息确认由上游 rfd 的 Zenity 后端提供，deb / rpm 声明 GTK4、XDG Desktop Portal 与 Zenity 运行依赖；AppImage 仍需宿主提供 Portal / Zenity。macOS / Windows 保留各自原生文件选择器和消息确认。

`Cargo.toml` 的 XDG Portal feature 仅声明在 Linux 目标依赖中，不把该后端设为其他操作系统的全局配置。系统选择器之外，剪贴板、通知、文件关联、菜单、窗口控制、截图与签名也必须分别验证；同用 CEF 不代表系统能力相同。

## 原生适配

窗口和网页预览截图统一调用 CEF 进程内 CDP。观察器按浏览器复用，并限制并发请求、结果大小、等待时间与窗口数量；窗口关闭释放注册状态，请求取消清理待处理项。CEF UI 回调不执行文件写入或同步 Tauri 窗口查询。

CEF 权限回调移除了同步 URL 查询，防止原生图片读取触发权限请求时死锁。编辑窗口通过官方 navigation hook 限定为应用来源；仅应用来源嵌入自身时获得访问 loopback 资源服务的 Chromium 权限。资源令牌、Rust 授权和 CSP 继续限制实际访问范围；远程来源不获得该设置。麦克风继续由 CEF / 系统请求用户许可，其他不需要的权限拒绝。

网页预览仍使用清理后的 HTML、禁用脚本和外部子资源的 CSP，使用隔离请求上下文。远程页面没有原生命令权限。普通构建不开放调试端口；只有独立标识的 e2e 构建在显式测试环境下开放本机端口。

## WDIO 驱动

旧 `@wdio/tauri-service` 与 embedded Rust 插件依赖 Tauri 2，已移除。保留 WDIO 9 与原有业务用例，改用官方 ChromeDriver 连接真实 CEF 应用。测试二进制的 `--e2e-browser-version` 输出编译时 SDK 版本，WDIO 匹配同一 Chromium build 的驱动，随后从实际调试端点再次读取运行版本。真实三维拖动通过同一 ChromeDriver CDP 客户端发送按下、移动和终点抬起，保留 held 状态观察、可信事件与指针捕获断言，避免混用客户端或取消输入时回到起点。应用标识必须为 `app.brainstorming.e2e`；启动失败立即终止，不退回普通 Chrome。

每个测试文件使用独立进程和 CEF 缓存；Linux 另隔离配置与数据目录。测试结束清理自己的进程和临时目录，保留日志、截图与失败页面。Hyprland 只在开始时按 PID 和二进制校验窗口，设置浮动并聚焦一次；拖动过程中不反复抢焦点。`pnpm benchmark:2d` 复用同一准备流程，先预热一次，再记录五次根节点拖动，校验窗口、倍率、挂载量和渲染路径一致，并输出中位数与变异系数。实际交互继续等待现有加载和就绪门禁。

## Linux 验证记录

2026-10-26，在 Debian 13 / Linux x86_64、GTK4 4.18.6、CEF 154.0.8037.98、AMD Radeon / Mesa 25.0.7 上验证。用户已安装全局开发依赖。原生测试使用当前源码构建的完整独立 E2E 二进制与内嵌 renderer，未混用开发服务器。

- Rust 文档与存储测试 152 项通过；普通桌面与 e2e 分支分别通过严格 Clippy。
- Vitest 163 个文件、1118 项通过；相关 Storybook 浏览器回归 4 个文件、15 项通过。
- GNOME GPU 隔离环境完整运行 27 个原生 WDIO 文件，25 个通过；`multi-window` 与 `export-center` 的次窗口场景未通过。两者都在 `getWindowState.focused` 检查失败，X11 实际活动窗口仍为主窗口，不能用页面 `document.hasFocus()` 代替原生焦点判定。对应场景此前在 Hyprland 桌面分批运行通过，不能据此消除 GNOME 差异。已修正 CEF 图片权限死锁、异步布局后选区可见性及驱动的输入、定位器和变换尺寸读取差异。
- 尝试 GTK 官方窗口呈现及有效 X11 时间戳后，GNOME 次窗口激活仍未恢复，相关尝试已撤回。未修改依赖源码、跳过原生焦点门禁或重复聚焦掩盖失败；该项需要继续定位 Tauri 3 alpha / CEF 与 Mutter 的激活交互，当前不标记全量通过。
- 隔离退出使用本地 GIO 后端，并通过 Node 文件 API 的有界重试等待临时服务释放挂载；失败状态仍正常向上传递。
- Ctrl＋滚轮完成 24 次连续与离散滚轮检查，窗口、DPR、工具栏尺寸及原生 WebView 缩放保持不变，文字与轮廓的实际截图像素仍在对应 DOM 范围。小倍率字形按前景色和主题底色的抗锯齿覆盖率判断，避免要求每个字都包含纯前景色像素。

### GPU 隔离采样

桌面上的其他 GUI 自动化会抢焦点并改变窗口大小。`pnpm test:e2e:isolated` 和 `pnpm benchmark:2d:isolated` 使用独立的无头 GNOME / XWayland、私有 D-Bus 与临时配置，不占用当前桌面焦点。显示输出为 1920×1080@60，应用视口为 1440×900、DPR 1；真实 CEF WebGL 报告 AMD ANGLE / OpenGL 4.6，非软件渲染。Chromium 的隔离测试缓存不保存用户凭据；普通构建不启用调试端口或测试密码存储选项。

2D 根节点拖动基准使用 1000 主题 fixture、倍率 0.15、挂载 200 个主题、默认 SVG 连线与 CEF GPU 合成。预热一次后五次 FPS 为 48.70、48.95、49.76、49.89、49.89；中位数 49.76，变异系数 1.03%，满足不超过 10% 的本机重复性门槛。数据写入 `test-results/native/planar-benchmark-samples.json` 与 `planar-benchmark-summary.json`，不会被后续功能回归覆盖。该数值是合成拖动的渲染吞吐，不是物理呈现帧率，也不是与旧 WebKit 或 macOS 的等条件优化对比。

### 未验证的平台能力

Linux 系统文件选择器与原生关闭确认的交互未由 WDIO 操作；文件用例使用受限的既有选择器 fixture。Portal 接口已识别，Zenity 已在本机存在，安装包补全了运行依赖；仍需安装包和实际系统弹窗验收。macOS / Windows 的文件选择、关闭确认、剪贴板、通知、文件关联、菜单与窗口、签名和安装需要对应宿主验证，不能由 Linux 通过推断。移动端本轮未编译或设备验收。

上游 alpha 的 Windows CEF 暂未提供进程沙箱；当前沿用官方 Auto 策略，需在后续分发评估中跟踪，不能把该平台描述为已启用 Chromium 进程沙箱。参见 [Tauri CEF 文档](https://v3.tauri.app/develop/cef/) 与 [Tauri 3 迁移指南](https://v3.tauri.app/start/migrate/from-tauri-2/)。
