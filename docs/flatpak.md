# Flatpak 构建

仓库提供本地 Flatpak 构建和 GitHub Actions 制品，不会向 Flathub 发布。

Flatpak 使用 `io.github.lyonbrown4d.brainstorming` 作为桌面启动器和 AppStream ID。Tauri 应用本身仍使用 `app.brainstorming.desktop`；两个 ID 分别服务于上游应用与 Flatpak 安装，桌面文件通过 `StartupWMClass` 对应窗口类。

## 本地构建

Linux 主机需要 Flatpak、desktop-file-validate 和 appstreamcli；仅使用 `--deb` 时还需要 `dpkg-deb`。构建器可使用主机上的 `flatpak-builder`，也可使用官方 `org.flatpak.Builder` Flatpak。Ubuntu/Debian 的主机工具可这样安装：

```sh
sudo apt install flatpak flatpak-builder dpkg-dev desktop-file-utils appstream
```

构建还需要 Flathub 上的 GNOME 50 runtime 与 SDK。安装后，从仓库根目录运行：

```sh
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub org.gnome.Platform//50 org.gnome.Sdk//50
pnpm install --frozen-lockfile
pnpm tsx scripts/build-flatpak.ts
```

脚本先检查构建工具和 runtime，再运行正常应用标识的 `pnpm tauri build --no-bundle`。CEF crate 将锁定 SDK 的运行文件复制到 release 输出目录；打包只收集主程序和官方列出的 CEF binary/resource 文件，不复制 Cargo 构建目录、SDK headers 或宿主动态库。若主机没有 `flatpak-builder`，脚本会检测已安装的官方 Builder app；添加用户级 Flathub remote 后，也可用 `--install-tools` 让脚本限时安装 GNOME SDK 50 和该 Builder app。脚本不会替用户改 remote，也不需要系统级安装。

`--skip-linux-build` 会复用 `src-tauri/target/release/brainstorming` 和同目录的 CEF runtime 文件。也可传入已构建的 no-bundle 目录，用于预览产物；目录中必须有正常应用标识的 `brainstorming` 可执行文件和完整的 CEF runtime 文件。脚本验证文件清单，但不能从目录本身证明构建配置；预览目录只用于预览验收，不代表正式 release 包：

```sh
pnpm tsx scripts/build-flatpak.ts --app-dir src-tauri/target/debug
```

需要从已有 Debian 包打包时，可显式传入包路径；此模式同样不会启动 Linux 构建，也不会从默认目录挑选旧包：

```sh
pnpm tsx scripts/build-flatpak.ts --deb /path/to/current-build.deb
```

构建至少检查 12 GiB 可用磁盘空间。成功构建后会在 `src-tauri/target/release/bundle/flatpak/brainstorming-x86_64.flatpak` 生成制品；其他支持的本机架构会使用对应后缀。

安装本地制品并启动：

```sh
flatpak install --user ./src-tauri/target/release/bundle/flatpak/brainstorming-x86_64.flatpak
flatpak run io.github.lyonbrown4d.brainstorming
```

安装时需要能从已配置的 Flatpak remote 获取 GNOME 50 runtime。CI 上传 `.flatpak` 文件，不嵌入 GNOME runtime。

## 沙箱权限和运行时

应用使用 GNOME 50 runtime 提供 GTK4。清单把 libvips 8.18.7 和 Zypak 固定到可复现的上游版本；CEF 运行文件默认来自当前源码的 no-bundle 构建，也可显式传入已有 `.deb`。启动器设置 `ZYPAK_CEF_LIBRARY_PATH` 并通过 `zypak-wrapper` 启动；不会用 `--no-sandbox` 关闭 Chromium 子进程沙箱。`.deb` 输入会清除 Debian `chrome-sandbox` 的 setuid 位，Zypak 将 Chromium 子进程隔离交给 Flatpak sandbox。

当前 CEF 运行时强制使用 X11，因此清单只授权 X11、GPU、IPC 和网络。Wayland 桌面通过 XWayland 承载应用窗口，不使用原生 Wayland 后端。网络用于用户配置的 AI 服务及本机 MCP 服务；文件选择和 URI 打开继续使用桌面 portal，应用不获准访问宿主 home 或整个文件系统。Secret Service 用于已有密钥存储，通知服务用于用户主动开启的系统通知。`org.freedesktop.Flatpak` 会话 D-Bus 名称由 Zypak 用于启动受限的 CEF 子进程。

桌面文件和 MIME XML 注册 `.brainstorming` 文件类型，图标和 AppStream 元数据沿 Flatpak ID 安装。CEF SDK 的 `CREDITS.html` 作为第三方许可说明安装到 `/app/share/licenses/brainstorming/`。Flatpak 内不注册宿主缩略图服务；已有 `.deb` 的 shell thumbnailer 仍由原 Linux 包安装。

## 本机验收状态

静态类型、lint、格式、metadata 校验均已通过；临时解包的 flatpak-builder 1.4.4 也成功解析 manifest。GNOME SDK 50 下载在限时内失败，因此本机没有生成 `.flatpak` 制品，也没有完成安装或应用启动验收。当前配置与静态检查通过不代表已有可安装版本。

## CI

`.github/workflows/flatpak.yml` 在手动触发、Pull Request 和 `main` 推送时构建 Linux x86_64 `.flatpak`，并作为 Actions artifact 上传。它安装 GNOME 50 runtime/SDK、复用现有 CEF Linux 构建流程并校验 desktop 与 AppStream 元数据。

## 资料

- [Flatpak manifest 与权限说明](https://docs.flatpak.org/en/latest/manifests.html)
- [Flatpak 沙箱权限与 portals](https://docs.flatpak.org/en/latest/sandbox-permissions.html)
- [Flatpak 文件、桌面项和图标约定](https://docs.flatpak.org/en/latest/conventions.html)
- [Tauri CEF Linux 沙箱说明](https://v3.tauri.app/develop/cef/)
- [Zypak CEF 配置与 Flatpak sandbox 集成](https://github.com/refi64/zypak)
