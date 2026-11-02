# 依赖升级记录

最近一次依赖更新见 [2026-11-02 记录](#2026-11-02-依赖更新)。下方版本及验收结果保留为历史记录。

## 2026-11-02 依赖更新

基于 `fa03db2` 查询 npm 与 Cargo 注册表，更新当前约束内可用的兼容版本：

| 依赖                                                      | 升级前  | 更新后  |
| --------------------------------------------------------- | ------- | ------- |
| i18next                                                   | 26.5.12 | 26.6.0  |
| react-doctor / oxlint-plugin-react-doctor（传递开发依赖） | 0.9.18  | 0.9.19  |
| crc32fast                                                 | 1.5.3   | 1.5.4   |
| openssl-sys                                               | 0.9.117 | 0.9.118 |
| zip                                                       | 9.2.0   | 9.2.2   |

[i18next 26.6.0](https://github.com/i18next/i18next/releases/tag/v26.6.0) 主要改进类型检查；新增的严格插值选项默认关闭。保留现有翻译配置。`@rolldown/plugin-babel` 仍保留 0.2.4，当前 React 构建插件的 peer 约束不支持 0.3.0。Tauri npm 的 `next` 仍为 3 alpha，不切换到 `latest` 指向的 Tauri 2。

Cargo 定向更新三个补丁依赖，保留 `pdfrs 0.1.10` 的移动端兼容锁定和既有 SQLx、PDF、Tauri 约束。锁文件中 `tempfile` 的既有 getrandom 依赖引用随解析调整，未更改 tempfile 版本。

冻结锁文件安装、1,164 项前端单元测试、TypeScript 与 lint 检查通过；lint 保留两项既有 TanStack Virtual / React Compiler 警告。npm 审计仍为 0 高危、0 严重及 3 项中等级开发依赖告警。

Storybook 发布构建通过。首轮交互测试 204 项通过，另有一条仍期待旧导图名称的过期断言；同步上一轮中心主题改名行为后，该文件 8 项交互测试复验通过。未修改产品行为。

本机安装未完成：完整 macOS 打包在生成原生绑定时停滞，原生库编译进程持续无 CPU 进展；完成进程、构建锁及采样诊断后停止本轮构建，未替换 `/Applications/Brainstorming.app`。Rust 测试仅等待同一构建目录的锁，触及 15 分钟时限，未执行完成。画布回归触及 10 分钟时限，已运行场景中两项未能在现有门禁内完成三维加载，不能记为全套通过。本轮未进行桌面实机交互验收。

随后定向复验被前次超时留下的 4331 端口占用阻止，未执行测试；已清理本轮残留预览服务，未改为复用服务或放宽测试门禁。

用户随后要求先提交并推送。正常提交钩子重新执行单文件 lint 时耗时数分钟后被中止；临时关闭重复钩子的提交方案最初被自动审批拒绝，用户随后明确批准本次提交和推送跳过钩子。本次按该授权复用上文已完成的独立检查，不修改仓库钩子配置，不能据此声称最后一次提交钩子、原生构建或完整验收通过。

本轮于 2026-10-30 查询 npm、crates.io、Google Maven 和 Gradle 官方发布元数据，更新直接依赖与可兼容的传递依赖。版本以已发布包为准，不跟踪未发布 Git 分支。

## 本轮版本

| 依赖组                   | 升级前                 | 当前                   |
| ------------------------ | ---------------------- | ---------------------- |
| pnpm                     | 12.14.0                | 12.16.1                |
| Lexical 全组             | 0.52.0                 | 0.53.0                 |
| WebdriverIO 全组         | 9.x                    | 10.1.0                 |
| Storybook 全组           | 10.6.3                 | 10.6.5                 |
| TanStack Query / Virtual | 5.104.5 / 3.14.22      | 5.105.0 / 3.14.23      |
| i18next / react-i18next  | 26.5.10 / 17.1.8       | 26.5.11 / 17.1.9       |
| resvg                    | 0.48.1                 | 0.49.0                 |
| rmcp                     | 3.7.0                  | 3.8.0                  |
| zip / lol_html / rustix  | 9.1.1 / 3.0.2 / 1.1.5  | 9.1.3 / 3.0.3 / 1.1.6  |
| Gradle / AGP / Kotlin    | 9.6.1 / 9.3.1 / 2.2.10 | 9.8.2 / 9.5.0 / 2.4.21 |

图标、动画、路由、ahooks、Sass、类型及 lint 工具也已更新；完整版本以 `package.json`、catalogs、Cargo manifests 和两个锁文件为准。Android 的 WebKit、Activity、AppCompat、Core、Material、Lifecycle 与测试库同步更新到查询到的稳定版本。Gradle wrapper 使用华为云国内镜像 `https://repo.huaweicloud.com/gradle/gradle-9.8.2-bin.zip`，保留官方 SHA-256；镜像响应头的校验值已与官方值核对一致。

## Tauri 与兼容边界

Tauri 3 核心 `3.0.0-alpha.5`、CEF runtime `3.0.0-alpha.6`、Wry runtime `3.0.0-alpha.5`、build / plugin 工具 `3.0.0-alpha.4`，npm CLI `3.0.0-alpha.5` 和 API `3.0.0-alpha.3`，在本轮查询时均已是相应通道的最新发布版。原生插件和 `tauri3-specta 0.1.0-alpha.3` 也没有更新发布。保留这些版本；npm 的 `latest` 指向 Tauri 2，不能据此降级。桌面三端继续 CEF，移动端继续 Wry。

以下依赖保留兼容版本，不能声称所有传递包都已使用各自最高版本：

- `libsqlite3-sys 0.37.0`：最新 SQLx 0.9.0 的公开约束仍是 `>=0.30.1, <0.38.0`；0.39.1 无法与它共同解析为唯一 SQLite 链接库。保留 SQLx 异步 API、SQLCipher 和现有迁移协议。
- `pdf-writer 0.12.1`：最新 svg2pdf 0.13.0 的 `to_chunk` 返回此版本的 `Chunk` / `Ref`。不能只把组合代码的依赖改成 0.15.0，否则公开类型不兼容。
- `pdfrs 0.1.10`：最新 ppt-rs 0.2.37 仍要求 0.1 系列；0.1.11–0.1.13 的移动端编译缺陷及上游草稿见 [Android 验证记录](android-validation.md)。0.2.0 不满足上游约束。
- Android 工程继续使用当前 Tauri 模板要求的 `android.builtInKotlin=false` 与 `android.newDsl=false`；不修改下载的上游插件源码。自有 Kotlin 插件改用 `compilerOptions`。

iOS 与 macOS 的图片库产物经官方发布元数据核对，没有新版本，本轮保持原校验和。Android 图片库继续使用已有固定产物及 NDK ABI 校验，不把仓库默认分支变化当作新的二进制发布。

## 破坏性变更适配

- [Lexical 0.53](https://github.com/meta/lexical/releases/tag/v0.53.0) 移除了旧扩展和不受检查的节点泛型。现有编辑器未使用这些已移除 API，继续复用官方输入与历史；通过现有标题、选区和组合输入回归验证。
- [WebdriverIO 10](https://webdriver.io/docs/v10-migration) 改变脚本返回类型并默认启用严格选择器。原生 IPC helper 明确命令只返回 JSON，因此不参与 DOM 元素返回转换；外观查询限定到下拉选项，打开文件限定到实际按钮，保留严格模式。使用 HTTP(S) 代理下载 ChromeDriver 时，在启动 Node 前设置 `NODE_USE_ENV_PROXY=1`，例如 `NODE_USE_ENV_PROXY=1 pnpm test:e2e:isolated`。
- React DevTools 最新 8.0.0 仍声明旧 Electron 与 cross-spawn。`overrides` 只针对这两条开发依赖边固定官方 Electron 45.1.0 和 cross-spawn 7.0.6，保留官方 DevTools 实现。产品不包含 Electron。
- Edge / Firefox 驱动和 core-js 通知脚本继续显式禁用；本项目原生测试使用与实际 CEF 匹配的官方 ChromeDriver。

## 验证

已通过真实桌面绑定生成、TypeScript 检查、1,119 项前端单元测试、Storybook 与完整 CEF 测试应用构建。lint 为 0 错误，保留既有 TanStack Virtual / React Compiler 兼容性警告。

Gradle wrapper 升级及 Android 应用、全部插件 Kotlin 编译通过，分别完成 5 与 77 个任务；完整 x86_64 调试 APK 构建通过，ARM 与真机未验收。华为云镜像地址已通过 wrapper 实际下载、官方 SHA-256 校验和 `./gradlew --version` 启动验证。官方 React DevTools 已在独立 GNOME 显示环境使用 Electron 45.1.0 启动，连接等待界面正常。

90 项真实浏览器画布回归全部通过，包含二维与三维、节点拖动、手绘、标题编辑、组合输入和视口变化。最终 TLS 等传递依赖已补齐，完整 CEF 应用已重新构建，Rust 无界面全套 152 项测试通过。首次复跑的 8 分钟时限中有 7 分 10 秒用于编译；复用完成的编译产物后，通过锁定依赖、离线方式完成全套测试。

WebdriverIO 10 的 27 个原生测试文件在 Linux 独立 GNOME / XWayland GPU 显示环境分批全部通过，实际 CEF 报告 AMD ANGLE 渲染器。覆盖启动、窗口与主题、保存与密码、资源、搜索、导出、演示、通知、多窗口移交、二维缩放及三维交互。首轮全套受隔离入口总时限影响，后续只补跑未完成和已修复场景。未关闭严格选择器、放宽焦点检查或绕过加载门禁；先激活当前 CEF 页面，再继续验证原生窗口与 DOM 焦点。

macOS、Windows、ARM 及 Android 真机未在本轮验收。Android 的真实中文输入法候选验收仍按既有验证记录保留为未完成，不能用浏览器组合输入测试替代。

更新后的 npm 审计为 0 高危、0 严重，剩余 1 项中危来自 React DevTools 的 `update-notifier -> got 9.6.0`。最新版 DevTools 尚未升级该依赖；不能将 got 强制改成不兼容 API，也没有复制或修改上游源码。此链仅属于开发工具，不进入产品构建。

## 本机 Linux 安装包

普通应用使用生产前端资源、不启用 e2e feature；已生成 amd64 调试 deb。官方 CLI 的 CEF 154 文件清单问题经用户明确批准后，以一次性临时打包器处理，详见 [上游记录与补丁](upstream/tauri-cef154-deb.md)。常规打包入口仍待正式上游修复。

包内文件校验与 apt 模拟安装通过。在独立 GNOME 会话、私有 XDG 目录与临时 Secret Service 集合中，解包应用显示 1440 × 900 的完整主窗口，截图已检查；进程映射确认加载包内 `libcef.so`。最初截图只有启动页且被新钥匙环提示遮挡，没有计作主界面通过；准备临时会话集合后完成验证，未修改真实桌面或真实钥匙环。

根据实际动态链接结果，deb / rpm 补齐 NSS / NSPR、GBM、ALSA 和 CUPS 运行依赖；RPM 仍未构建验收。deb、校验摘要和安装模拟日志位于忽略的构建与 `test-results/dependencies` 目录。本机 sudo 需要密码，自动安装尚未执行；同版本覆盖安装应使用 `sudo apt install --reinstall ./安装包.deb`，安装后重启应用。

依赖升级已提交并推送为 `faf04ee`。本节安装包、运行依赖与上游反馈草稿的补充在提交检查中遇到超时：提交钩子重新生成原生绑定时触及 8 分钟时限；一次缓存续跑也触及 3 分钟时限。已做一次进程诊断，观察到编译链接活动，随后按仓库时限约定停止。用户随后明确授权跳过本次提交检查并提交这些改动。此前完整回归与本机 deb 验证仍按上述实际结果记录，不能据此声称最后一次提交门禁已通过。

停止后独立运行的 `tsc --noEmit` 通过；本次改动文件已通过提交钩子的定向格式化，末尾补充记录也已单独格式化。另一次全库 `prettier . --check` 触及 90 秒时限，未声称其通过。最终 deb 的 SHA-256 复核通过。

## 2026-11-01 提交前复核

基于 `19108ec`，在提交画布动效、选中反馈和二维、三维主题样式统一之前，重新查询 npm 与 crates.io，并刷新兼容的传递依赖。

| 依赖                 | 变更              | 说明                                                                                                                      |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| lucide-react         | 1.65.0 → 1.66.0   | [官方发布记录](https://github.com/lucide-icons/lucide/releases/tag/1.66.0)；React 19 在其 peer 范围内，保留精确版本       |
| electron-to-chromium | 1.5.470 → 1.5.471 | 刷新构建及驱动工具使用的浏览器版本数据，不改变产品的 CEF SDK                                                              |
| pdfrs                | 0.1.13 → 0.1.10   | 恢复仓库原有的移动端兼容锁定；0.1.11–0.1.13 的缺陷及移除条件见 [Android 验证记录](android-validation.md#上游兼容问题草稿) |

此前 Cargo 刷新遗漏了 `pdfrs` 的兼容锁定。本次重新核对 0.1.13 的官方发布源码，其字体路径函数仍未覆盖 Android / iOS，因此恢复已发布的 0.1.10，不添加 fork、vendor 或第三方源码补丁。Cargo 同时重新解析了已有 Windows 平台依赖及宏依赖的引用；这些包自身的版本未变。

`cargo update --dry-run --verbose` 未发现其他可解析的兼容版本更新。Tauri 3、Specta、FluxDI、SQLx 和 PDF 组合继续遵循已记录的版本约束。`@rolldown/plugin-babel` 保留 0.2.4：当前 `@vitejs/plugin-react 6.1.2` 的 [peer 声明](https://registry.npmjs.org/@vitejs%2Fplugin-react/6.1.2) 不包含 0.3.0，不通过覆盖 peer 约束强行升级。

前端完成冻结锁文件安装验证。npm 审计为 0 高等级、0 严重；仍有 3 项中等级开发依赖告警，分别来自 [got](https://github.com/advisories/GHSA-pfrx-2q88-qq97)、[minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) 和 [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)。没有为消除告警强行跨越上游版本约束。

更新后已通过 1,156 项前端单元测试、159 项 Rust 无界面测试、112 项真实输入画布回归、54 个文件的 205 项 Storybook 测试，以及前端和 Storybook 构建。发布构建的回归另发现，隐藏的连接点被第三方样式重新赋予鼠标命中；通过业务层样式明确禁用普通状态的命中，并保留改接时的连接提示，完整回归复验通过。格式与 lint 检查通过，lint 保留两项 TanStack Virtual / React Compiler 兼容性警告。

原生绑定生成的一次独立检查触及 120 秒时限，随后完成一次锁与进程诊断；提交仍执行正常的绑定生成及 TypeScript 钩子，不跳过检查。按用户要求先提交推送，macOS 安装包在独立目录继续后台构建，使用已验证的前端快照，完成本机签名校验后安装到 `/Applications/Brainstorming.app`。本轮不再启动桌面实机交互验收；此前 macOS 原生验收结果仍以 [当轮记录](macos-validation.md) 的范围为准。
