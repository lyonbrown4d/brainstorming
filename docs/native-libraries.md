# 原生图片库与打包

图片原件保存在 Rust 管理的资源库中。libvips 只生成 WebP 预览和 DeepZoom 瓦片，不替换原件。文件选择、原生拖入和导出不经过 JavaScript 大字节缓冲区；浏览器文件回退的合计上限为 8 MiB。

## 平台和编解码器

| 平台                        | 固定来源                                                  | PNG / JPEG / GIF / WebP | TIFF                 | AVIF                 | 当前验证范围                                                                          |
| --------------------------- | --------------------------------------------------------- | ----------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| macOS arm64 / x64           | Sharp `@img/sharp-libvips-darwin-*` 1.3.4，libvips 8.18.7 | 上游包含                | 上游包含             | 上游包含             | 校验二进制符号和系统动态库依赖；原生图片测试单独运行                                  |
| iOS 设备 / 模拟器           | `TimOliver/vips-cocoa` 8.18.0 动态 XCFramework            | 上游包含                | 上游未提供           | 上游包含             | 准备脚本检查框架切片和所需 C 符号；设备运行结果需另行验收                             |
| Android arm64 / armv7 / x64 | `fluttercandies/libvips_ffi` 固定提交，libvips 8.16.0     | 二进制配置声明包含      | 二进制配置声明未包含 | 二进制配置声明未包含 | 核对各 `.so` 的哈希、符号和依赖；64 位 ELF 已检查 16 KiB 对齐；设备运行结果需另行验收 |

缺少编解码器时，导入会返回具体格式的错误。应用保留原始文件，不伪造预览，也不会把缩略图当作原图。移动端 TIFF，以及 Android AVIF 的完整支持仍需重新构建带相应编解码器的目标库；当前不能据此宣称这些格式已在移动端可用。

## 准备与构建

使用项目已锁定的 pnpm 依赖。脚本通过 `tsx` 和 `zx` 执行；本机工具优先通过 Homebrew 安装；下载优先使用 Homebrew `aria2c`，缺少该工具时使用系统 `curl`。

```sh
pnpm install --frozen-lockfile
pnpm native:vips --ios
pnpm native:vips --android
pnpm native:vips --macos
pnpm build:desktop
```

Android 准备前需要先初始化 Tauri Android 工程，并安装项目要求的 Android NDK。iOS 需要完整 Xcode、对应 SDK 和 `xcodegen`。macOS 打包入口运行 `scripts/build-desktop.ts`：它把经过校验的单个 libvips 动态库加入应用的 `Contents/Frameworks`，并把其安装名称改为 `@rpath`。运行时只依赖系统库与系统框架，不依赖开发机的 Homebrew 安装目录。

直接运行 `tauri build` 不会自动采用脚本生成的原生库打包配置。发布构建应使用项目的 `build:desktop` 入口；手动构建时需要传入 `src-tauri/tauri.native-vips.conf.json`，并使用准备脚本返回的目标库目录设置 `VIPS_LIB_DIR`。

下载和解压缓存使用用户缓存目录。macOS 默认路径为 `~/Library/Caches/brainstorming/native-vips`；Linux 使用 XDG 缓存目录；Windows 使用本地应用数据目录。`BRAINSTORMING_NATIVE_CACHE` 可指定仓库外的绝对路径。缓存没有放入仓库，也没有改变 pnpm、Cargo 或 Android SDK 的默认存储位置。

`config/native-vips.lock.json` 固定 iOS 发布包及 Android 各 ABI 文件的 SHA-256。Android 文件还固定来源提交，以及 NDK 28.2.13676358 各 ABI 的 C++ 运行库哈希。`config/native-vips-macos.lock.json` 固定 Sharp npm 包、包完整性和动态库本身的哈希。准备脚本发现校验值不一致会失败，不会继续使用未知库。

Rust `build.rs` 根据 Cargo 目标选择库。iOS 从正确的设备或模拟器切片链接动态框架；Android 从对应 ABI 目录链接 `.so`。交叉编译不会退回宿主机的 `pkg-config` 结果。iOS 框架需要在 Xcode 工程中嵌入并签名；Android 还需要随包提供 NDK 的 `libc++_shared.so`。

## 资源访问与网页预览

图片、音频、视频和附件通过随机端口的环回 HTTP 服务读取。地址包含每次进程启动新建的会话令牌，服务校验主窗口来源和 Host。完整视频及 Range 响应均按最多 256 KiB 读取；会话撤销会关闭未消费的连接。iOS 只开放本机网络访问；Android 的明文例外限定在环回主机，其余地址保持默认 HTTPS 要求。

网页预览由隔离的系统 WebView 生成真实静态截图。Rust 逐次校验 DNS 和重定向、固定公开 IP，并在大小上限内内联 CSS 和位图。截图 WebView 不执行 JavaScript，也不自行访问远程资源。依赖 JavaScript 的空页面会使用真实网页元数据并明确标注；没有可用元数据时返回错误。它不等同于运行任意网页脚本后的完整动态截图。

## 上游与许可证

- [libvips](https://github.com/libvips/libvips)：LGPL-2.1-or-later，具体分发还需保留编解码器等依赖的许可证。
- [Sharp libvips 分发](https://github.com/lovell/sharp-libvips)：npm 平台包标注 LGPL-3.0-or-later，包内包含第三方许可证；macOS 打包脚本一并保留。
- [vips-cocoa](https://github.com/TimOliver/vips-cocoa)：构建脚本采用 MIT 许可，动态框架及其依赖分别遵循对应上游许可。
- [libvips_ffi](https://github.com/fluttercandies/libvips_ffi)：Android 二进制取自固定提交 `e9dbdd3372f209208a38c16addd3402b427a2e42`，项目代码采用 Apache-2.0；libvips 与第三方库保留其原许可。该仓库 README 指向的原始 Android 构建仓库当前不可访问，因此锁定提交和文件哈希是本项目的可复现依据。

编译成功、符号检查、模拟器运行和签名发布是不同的验收步骤。修改原生库版本或编解码器后，需要重新运行原生图片测试以及对应平台的导入、保存、导出和大资源播放检查。
