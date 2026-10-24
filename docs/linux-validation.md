# Linux 验证记录（2026-10-24）

本次在 Debian 13、GNOME Wayland、Rust 1.99.1、GTK 3.24.49 / WebKitGTK 2.54.0 上运行现有测试。原生测试使用当前源码完整构建的独立 E2E 应用及 embedded WebdriverIO 驱动。没有 macOS / Windows 本轮对照截图，因此这些结果不能证明跨平台像素一致。

## 测试结果

| 层级                   | 结果                                | 范围                                                  |
| ---------------------- | ----------------------------------- | ----------------------------------------------------- |
| Vitest 单元 / renderer | 162 文件、1114 项通过               | 含新增 2 项独立 3D 截图回归测试                       |
| Rust headless          | 152 项通过                          | 命令、布局、文件及资源等现有测试                      |
| Storybook Chromium     | 49 文件、190 项通过                 | 修正平台声明、按键与异步标注断言后全量复验            |
| Playwright 画布        | 88 项通过                           | 88 项，覆盖 2D/3D、拖动、连线、笔迹、IME、属性与演示  |
| 原生 WebdriverIO 首轮  | 8 文件通过、18 文件失败，共 26 文件 | 不能视为 Linux 原生验收通过；后续失焦造成部分级联失败 |
| 原生 3D 视角导出单项   | 修复后通过                          | 完整重建后确认预览可解码、PNG 可写入及对话框恢复      |

## 已定位并修正

- 原生菜单改为仅 macOS 构建和挂载，Windows / Linux 沿用自定义标题栏与应用内菜单。Linux 原生启动截图确认额外菜单栏消失。
- Storybook 平台桥接原先固定为 macOS，Linux Playwright 的 `ControlOrMeta` 因而与应用识别的修饰键不匹配。预览现跟随宿主浏览器平台，也可显式指定平台；Storybook 与画布测试使用对应平台按键。Node 测试保留原有默认平台。
- 标注编辑 Storybook 测试等待提交后的按钮出现，避免在异步提交完成前同步查找。
- 当前 3D 视角导出仍查找 `.react-flow`，与独立 Three.js 画布不兼容。改为定位实际 Three canvas，并在截图时隐藏三维导航、缩略图和缩放控件。
- 快捷键录制测试先以真实点击聚焦画布，再输入组合键。

## 尚未通过的原生检查

1. **窗口焦点与多窗口激活。** 出现窗口可见但 `document.hasFocus()` 为 false、窗口切换未聚焦，以及脚本调用超时。后半段多个测试在 `home()` 的焦点门禁失败，尚未进入其目标功能；不能将它们都归为渲染缺陷。
2. **真实三维指针输入。** 3D 拖动与性能测试未观察到可信的捕获指针；提前归属预览等待超时。检查锁定的 `tauri-plugin-wdio-webdriver 1.5.0` 源码发现 Linux 使用默认 `dispatch_pointer_event`，通过 `MouseEvent` 与 `dispatchEvent` 投递，不满足测试的可信 PointerEvent 要求。现有 macOS 原生输入适配不覆盖 Linux；相关原生验收仍待补齐。
3. **缩略图拖动。** 原生视口遮罩未随拖动变化。Chromium 真实输入测试与 embedded 原生输入结果需要分别看待，不能以浏览器通过替代 WebKitGTK 验收。
4. **创建页布局。** 宽窗口布局断言失败。单项复验诊断时页面已不在创建表单，预览与提交按钮为空，文档宽 1220 而视口宽 1219；截图进入了编辑器。需要进一步隔离路由、窗口尺寸与输入时序，当前不足以确定纯布局根因。
5. **其他未通过项。** 交换格式选项查找失败；导出流程中的第二窗口调用失去 completion handler。完整失败范围以首轮日志和截图为准。

保留原有焦点、加载状态与可信输入断言。没有将上述未通过项改成跳过或降低通过条件。

## 复现与证据

```sh
CARGO_INCREMENTAL=0 pnpm test
pnpm test:rust --locked
CARGO_INCREMENTAL=0 pnpm test:storybook
CARGO_INCREMENTAL=0 pnpm build-storybook
pnpm test:canvas
CARGO_INCREMENTAL=0 pnpm build:e2e
pnpm test:e2e
pnpm test:e2e --spec tests/native/export-center.spec.ts --mochaOpts.grep 'captures the current 3D'
```

本机曾发生 Rust 增量缓存读取 SIGBUS；本轮原生构建临时使用 `CARGO_INCREMENTAL=0`，未据此改变仓库构建默认值。每次更换二进制前确认前一独立 E2E 应用退出，不结束用户的正式应用。

日志保存在忽略目录 `test-results/linux-validation/`，原生截图和失败 DOM 位于 `test-results/native/`。这些本机产物不进入 Git。

## Linux 打包验证

`pnpm package --debug --bundles deb` 已成功生成 debug amd64 deb，并检查主程序、缩略图 helper、desktop 文件、MIME、thumbnailer 与 libvips/GStreamer 依赖声明。没有在本机安装该包；没有完成 rpm/AppImage、release 分发包或其他发行版安装验收。此包生成于后续渲染修复之前，需要最新内容时重新打包。
