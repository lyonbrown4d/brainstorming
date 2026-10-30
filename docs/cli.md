# 命令行导出

`brainstorming-cli` 直接读取原生 `.brainstorming` SQLite 文档，无须启动 CEF、桌面窗口或 Node.js。它与桌面导出共用 Rust 文档校验、资源读取、布局、几何和编码服务。

## 构建与使用

开发环境使用仓库固定的 Rust 工具链：

```sh
pnpm cli --help
pnpm cli sheets example.brainstorming
pnpm cli export example.brainstorming -o example.png
pnpm build:cli
```

发布构建位于 `src-tauri/target/release/brainstorming-cli`，Windows 文件名带 `.exe`。构建后的 CLI 不依赖 pnpm 或图形显示服务。

```sh
brainstorming-cli export example.brainstorming -o first.svg
brainstorming-cli export example.brainstorming --sheet sheet-a -o first.png --width 1600
brainstorming-cli export example.brainstorming --all-sheets --format png -o sheets.zip
brainstorming-cli export example.brainstorming --all-sheets -o sheets.pdf
brainstorming-cli export example.brainstorming --presentation -o slides.pdf
```

## 选项

- 格式：PNG、JPG/JPEG、WebP、SVG、PDF，默认从输出扩展名推断。多张图片使用 ZIP，必须同时传 `--format`。
- 画布：默认首张 Sheet；`--sheet ID` 可重复，按参数顺序输出；`--all-sheets` 按文档顺序输出。`sheets` 子命令返回 ID 与名称的 JSON。
- 尺寸：`--scale` 或 `--width` / `--height`，保持比例；指定宽高时适配该边界。尺寸与像素总量沿用桌面限制。
- 内容：`--include-collapsed` 展开折叠主题；`--transparent` 去除导图背景；`--presentation` 导出演示页面。
- JPEG 质量：`--jpeg-quality 1..100`，仅适用于 JPEG。
- 已有文件：默认拒绝覆盖，显式 `--overwrite` 才原子替换；即使允许覆盖，也拒绝原生源文件的硬链接或路径别名。
- 加密文档：`--password-stdin` 从标准输入读取单行密码；不提供命令行密码参数。调用方应通过受保护的输入通道提供密码，避免把密码写入 shell 历史或日志。

成功时标准输出返回包含路径、格式和字节数的 JSON；失败时标准错误返回原因，退出码为 1，参数解析失败为 2，Ctrl+C 取消为 130。取消后排空已接收的工作，再释放文件和服务。

## 与桌面的一致性及边界

桌面导图导出、导出预览和保存缩略图统一使用原生几何；前端只保留即时交互需要的量测和路径。CLI 的导图输出使用同样的主题、笔迹、素描、图标和资源编码入口。图片栅格化使用本机字体；不同操作系统的字体可用性仍会影响文本外观。

CLI 不包含实时选区或三维镜头状态，导出文档的二维布局或保存的演示编排。桌面的「当前视角」截图仍由正在运行的三维画布提供。

只读事务保证同一次导出的文档与资源来自同一快照。CLI 校验文件协议与迁移校验和，但不执行迁移；需要升级的文件应先由桌面端打开并保存。输出先写入同目录临时文件，再提交最终路径，失败不会截断已有文件。

## Rust 边界与并行

根 Cargo workspace 包含 `brainstorming-engine`、`brainstorming-geometry`、`brainstorming-cli` 和 Tauri 应用壳。前端仍为单个 pnpm package。所有 Rust 包共享根 `Cargo.lock`，构建缓存保留在 `src-tauri/target`。

几何 crate 复用 Roughr 与 perfect_freehand；图标由固定版本的 Lucide / Simple Icons 离线生成。更新前端图标依赖后运行 `pnpm sync:native-markers` 并提交资源差异。

页面生成与图片编码最多并行两页，结果按请求顺序组装。计算复用引擎的有界工作线程，单任务的并行栅格化共享 4000 万像素预算，批量输出总量限制为 128 MiB。PDF 等文档编码在阻塞工作线程执行。

## 本次迁移的验证状态（2026-10-30）

以下为首次提交前的验收记录；实现尚未完成完整验收，不能据此确认所有原有功能均无回归。

- 已通过：最新共享 CLI 的 `cargo check`、前端类型检查和生产构建、完整 ESLint（保留既有 React Compiler 兼容性警告）、完整 Prettier 检查；修订导出契约后，导出资源、自动保存和窗口转移串行复测共 20 项通过。
- 导航专项：11 项 Vitest 通过；真实浏览器验证了二维平移、指针锚定缩放、三维导航与主题拖动、Space 编辑。物理触控板未验证。
- 最近一次完整画布回归：80/92 通过（之后还调整了打印准备入口，最终源码需重新构建 Storybook 验收）；失败涉及动态模块加载、场景就绪等待和输入超时，尚未完全确认原因。代码规范测试的 ESLint 初始化也出现 30 秒超时。
- Rust 完整测试在依赖编译阶段触及时限，未进入测试执行；几何数值对比、CLI 图片一致性、密码文件和源文件保护测试已添加，但尚未取得通过结果。当前源码的原生 CEF 构建、WDIO 和完整 Storybook 浏览器测试也未完成。

测试期间，本机其他项目并行构建，观察到系统负载约 90。已按仓库约定完成进程及锁诊断，并停止连续重跑，保留编译缓存。待构建环境可用后，先运行 `pnpm test:rust --locked`，再重新生成绑定，运行前端、Storybook、画布与隔离显示下的原生 E2E 全套检查；不要使用旧二进制代替当前源码验收。
