# Tauri CLI alpha.5 / CEF 154 的 Linux deb 打包问题

## 归属与影响

2026-10-30，Brainstorming `faf04ee` 的普通 Linux 应用编译通过，但官方 `tauri bundle --debug --bundles deb` 失败。CLI 为 `3.0.0-alpha.5`，对应上游提交 `1991873f5e2baa68773f21465f61baa93077498f`；CEF 为 `154.0.34` / Chromium `154.0.8037.98`，由锁定的 `cef-dll-sys 154.5.0` 选择。

官方 SDK 的 `cmake/cef_variables.cmake` 中，Linux `CEF_BINARY_FILES` 没有 `libEGL.so` 和 `libGLESv2.so`。Tauri 的 [deb 文件收集循环](https://github.com/tauri-apps/tauri/blob/tauri-cli-v3.0.0-alpha.5/crates/tauri-bundler/src/bundle/linux/debian.rs) 仍强制复制这两个文件，因而在复制、strip `libcef.so` 后返回 `No such file or directory (os error 2)`。本机 SDK 与 Cargo 输出目录均缺省这两个库；其余运行库存在。官方 v3 主线在调查时也保留此列表。

该问题阻断本次 deb 生成，不影响已经通过的应用与编辑器回归。RPM、AppImage 和其他发行版未在本次验收。

## 已授权的临时处理

用户明确批准仅为本次本机安装临时修补打包器。[补丁](tauri-cef154-deb-proposal.patch) 只在上述两个 ANGLE 库缺省时跳过复制；其余文件保持原有强制校验。应用、渲染代码、SDK、项目声明的官方 CLI 版本及全局工具不变。

临时工具从上述官方 tag 检出，使用其 Cargo.lock，通过 Rust 1.99.1 编译；源码与工具仅位于忽略的 `src-tauri/target/package-tools/`。补丁文件在本目录仅作审查与复现记录，没有自动应用入口、pnpm patch 或持久 fork。

移除条件：官方 CLI 发布接受该 SDK 分发清单的版本后，升级并重新验证普通打包入口，删除临时工具与对应处理记录。在此之前，常规 `pnpm package` 仍受上游问题影响，本次临时包不能代表 CI 的官方入口已经修复。

原命令失败、临时工具成功生成 deb，构成本次缺省 ANGLE SDK 的回归验证；含独立 ANGLE 的旧 SDK 未实测。包内主程序、CEF 文件与集成文件通过校验，普通应用已从解包目录显示完整主窗口并核对 CEF 加载路径。安装依赖另由本项目配置显式声明；RPM 包名核对了 Fedora 官方的 [NSS](https://packages.fedoraproject.org/pkgs/nss/nss/)、[GBM](https://packages.fedoraproject.org/pkgs/mesa/mesa-libgbm/)、[ALSA](https://packages.fedoraproject.org/pkgs/alsa-lib/alsa-lib/) 与 [CUPS](https://packages.fedoraproject.org/pkgs/cups/cups-libs/) 目录，未据此宣称 RPM 已运行验收。

## 上游 issue 草稿（尚未发布）

目标仓库：`tauri-apps/tauri`。只读搜索 `libEGL cef` 未找到匹配 issue；发布前应再次确认重复项，并按现有标签与可指派权限补齐元数据。本次授权不包含发布 issue，未创建、指派或修改外部反馈。

**Title:** CEF 154 Linux deb bundling fails when standalone ANGLE libraries are absent

**Environment:** Tauri CLI 3.0.0-alpha.5, tauri-runtime-cef 3.0.0-alpha.6, cef-dll-sys 154.5.0, Linux x86_64, Debian 13.

**Reproduction:**

1. Build a Tauri 3 CEF application using the official CEF 154.0.34 / Chromium 154.0.8037.98 minimal SDK, with `bundle.cef.embed = true`.
2. Confirm the SDK's Linux `CEF_BINARY_FILES` lists `libcef.so`, SwiftShader/Vulkan files and sandbox resources, without standalone `libEGL.so` or `libGLESv2.so`.
3. Run `tauri build --debug --bundles deb`.

**Actual:** The application compiles. The Debian bundler copies and strips libcef, then fails with `No such file or directory`. Its fixed CEF file list unconditionally copies the two absent ANGLE libraries.

**Expected:** Accept the official SDK layout while continuing to reject missing required runtime files. Preserve standalone ANGLE libraries when an SDK provides them.

**Evidence:** The tagged Debian bundler file above and the official SDK's `cmake/cef_variables.cmake` disagree. The same SDK runs the current application; a five-line change to skip only absent standalone ANGLE libraries permits bundling. The proposed patch is available with this draft.

**Acceptance:** Test an SDK without the two libraries and one that includes them; retain required-file failure behavior and verify the packaged application starts using its bundled CEF resources.

## 本仓库跟踪 issue 草稿（尚未发布）

- 标题：跟踪 Tauri CLI / CEF 154 的 Linux deb 文件清单不匹配。
- 影响：官方 deb 打包入口失败；本次本机包使用已获批准的一次性工具。其他格式与发行版未验收。
- 上游链接：待获授权发布或找到重复 issue 后补充；尚无可交叉引用的已发布 issue。
- 负责人、标签与指派：发布前按当前登录账户和仓库既有标签核对；未擅自创建标签或指派他人。
- 关闭条件：采用正式上游修复、通过默认打包入口与包内应用启动验证，并移除临时工具。
