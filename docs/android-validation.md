# Android 本机验证

本轮于 2026-10-26 在 Linux 主机执行，验证对象是当前源码构建并内嵌前端资源的 Android 调试 APK。此记录不代表正式发布或 ARM 真机验收。

## 环境

| 项目    | 本轮环境                                                         |
| ------- | ---------------------------------------------------------------- |
| 设备    | Android 17、x86_64、API 37 模拟器                                |
| WebView | Google Android WebView 145.0.7632.218，移动端使用 Wry            |
| 屏幕    | 1080×2400，WebView 411×914，DPR 2.625                            |
| 工具链  | JDK 21、SDK / Build Tools 37.0.0、NDK 28.2.13676358、Rust 1.99.1 |
| 隔离    | 只读 AVD、禁用快照、无窗口、GPU host、明确指定 `emulator-5580`   |

构建命令和 OpenSSL 的 `TARGET_RANLIB` 配置见 [开发说明](development.md)。输出位于 `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`；虽然目录名为 universal，本轮只编译了 x86_64 应用代码，不能用于 ARM 手机。

## 已验证

| 场景                   | 证据                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| 原生安装、冷启动、首页 | APK 安装成功，真实 Activity 和 WebView 启动，无应用崩溃记录                                           |
| 创建文档及软键盘避让   | 展开键盘时 WebView 高度从 914 缩到 578，创建按钮可点击                                                |
| 主题编辑与历史         | 双击进入编辑，中文标题提交，Rust 引擎撤销及重做                                                       |
| 原生剪贴板             | 复制主题后通过原生命令读回结构化内容，独立 FileProvider 正常工作                                      |
| 二维与三维切换         | 三维首帧、主题与连线显示；WebGL 上下文正常，报告宿主 AMD GPU；返回二维后主题保留                      |
| 系统保存               | 通过 Android DocumentsUI 保存实际文件；147,456 字节，SQLite `quick_check` 返回 `ok`，两条主题记录完整 |
| 重启后打开             | 原先被置灰的文件变为可选择；新进程通过系统选择器重开，中文标题与主题数一致                            |
| 取消另存为             | 系统返回键取消后文档不变，未创建额外文件                                                              |
| 移动端窗口入口         | 文件菜单不再提供桌面多窗口操作；适配器对 iOS / Android 均不暴露多窗口能力                             |

原生快速键入已在修复后的完整 APK 通过，中文文本输入、系统 Enter 提交及撤销重做也已通过。浏览器层已验证：缩小编辑画布时，旧代码将 `Draft after resize` 截断为 `Draft a`；修复后完整提交，且一次撤销恢复原标题。

Android WebView 的 CDP 组合输入候选更新及确认序列仍出现重复文字，尚未使用实际中文输入法确认，不计入组合输入通过结果；不能把普通中文文本提交等同于完整输入法验收。

## 本轮修复

- 桌面窗口 API 限定到桌面编译目标，避免 Android 编译引用不存在的最小化、拖动和聚焦方法。
- `pdfrs` 锁定兼容的已发布版本 0.1.10，保留 PPTX 写入及项目原有 PDF 导出路径；未修改第三方源码。
- 剪贴板使用独立 FileProvider 组件，避免与 Tauri 的文件提供器发生清单合并冲突。
- Activity 应用软键盘 insets；二维视口尺寸变化时同步保住活动主题，避免虚拟化卸载编辑器；编辑时自动取景立即完成。
- Android 选择器使用显式应用 MIME，并接受已有二进制类型文档；Rust 保留内容校验。移动端能力不暴露桌面多窗口 API。
- 窄屏恢复提示允许换行，避免恢复及忽略按钮被挤出视口。

## 回归与边界

- 原有标题编辑测试及新增画布尺寸变化测试：7 项通过。
- 平台适配器测试：10 项通过，包含移动端缺少桌面能力及桌面能力保留。
- 原生导出回归：6 项通过，包含 PPTX 文本、图片、备注和长内容。
- Storybook、完整 APK、格式及类型检查通过；lint 为 0 错误，仅有既有 TanStack Virtual 与 React Compiler 兼容性警告。

截图、系统控件 XML、测试文档和本机诊断脚本保存在被忽略的 `test-results/android/`，不作为源码提交。长期浏览器回归位于 `tests/canvas/topic-resize.spec.ts`，沿用现有 Playwright / Storybook 工作流。

本轮未覆盖 ARM 真机、实际中文输入法候选界面、全部文件交换格式、AI / MCP、麦克风、相机和通知权限。模拟器不用于发布性能结论。长时间测试及旋转后曾遇到宿主 GPU 模拟器以 SIGSEGV 退出，重建只读模拟器后继续；该退出不能当作应用进程崩溃。

## 上游兼容问题草稿

拟提交上游为 `yingkitw/pdfrs`，本仓库为 `lyonbrown4d/brainstorming`。本轮仅记录草稿，未对外创建 issue；提交前须检索完整 tracker、确认已有标签及当前账号。

上游草稿标题：`Android/iOS compilation fails in system_font_candidates`。`pdfrs 0.1.11–0.1.13` 的 `src/raster/fonts.rs` 只为 macOS、Linux、Windows 定义 `paths`，函数末尾却无条件使用它。最小复现是在空 Rust library 中依赖 `pdfrs = { version = "=0.1.13", default-features = false }`，安装 `x86_64-linux-android` target 后执行 `cargo check --target x86_64-linux-android`，得到 `E0425: cannot find value paths in this scope`。预期是支持目标可以编译，或提供可关闭该模块的 feature；验收需覆盖 Android / iOS 的编译配置。已知兼容版本为 0.1.10。

本仓库跟踪草稿标题：`Track mobile-compatible pdfrs adoption`。受影响链为 `ppt-rs 0.2.37 -> pdfrs 0.1.13`；当前采用已发布的 0.1.10，构建与 6 项导出回归已通过。依赖维护者在上游发布兼容修复、且 `ppt-rs` 可以采用时重新升级，并重跑移动编译与 PPTX 回归；提交两个 issue 时互相补充链接。这里不构成引入 fork、vendor 或下游补丁的授权。
