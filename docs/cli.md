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

- 前端完整单元测试：163 个文件、1120 项通过；快捷键重绑后的 Ctrl/⌘+R 会阻止 Chromium 默认刷新，避免丢失内存草稿，同时保留新的绑定行为。
- Rust 无界面测试：159 项通过，包含正式 workspace 的 3 项几何对比、真实无显示环境 CLI 导出、桌面/CLI 图片一致性、加密文件、源文件保护和资源读取。perfect_freehand 临时补丁已获用户批准，来源、复现与移除条件见 [上游跟踪](upstream/perfect-freehand-end-cap.md)。
- Storybook 浏览器组件测试：49 个文件、190 项通过；修复快捷键后已重建 Storybook。画布 92 项用例分批通过，覆盖二维与三维的鼠标、滚轮、缩放、拖动、笔迹、中文输入法、撤销与属性编辑。全量批次在本机高负载时达到 8 分钟上限，保留失败现场后只补验失败和未完成项；补验 47 项及完整三维导航 8 项全部通过。
- 完整 CEF E2E 应用已从修复后的源码构建（最终 Cargo 二进制名为 brainstorming-native；CLI 在重命名前触及总时限，复验通过环境变量明确指向新二进制），正式 Tauri 绑定与迁移前逐字节一致。隔离 GNOME/XWayland 显示确认使用 AMD 硬件加速；原生 27 个测试文件分批验收通过。2026-11-01 使用含 PNG 修复的完整 E2E 二进制复验选区性能，四个场景全部通过：二维/三维各覆盖属性面板关闭与开启，每组保留三轮 40 次采样及原有单次 3 秒门限。原测试将全部场景放在一项用例，触及 120 秒总时限，现按独立场景拆分，每项仍保留 120 秒时限。
- 格式、TypeScript 和 ESLint 已校验；保留既有 TanStack Virtual / React Compiler 兼容性警告。2026-11-01 复验：五个自有 Rust 包完整 Clippy 通过（warnings 视为错误）；含 native-ui 的原生服务测试 57 项通过、1 项原有大文件测试忽略。原生测试发现损坏 PNG 可被 libvips 接受，已复用现有 png 库补上流式数据块完整性校验，并覆盖字节及文件导入；原有失败用例和真实 libvips 集成测试现均通过。
- Flatpak 清单、打包脚本和 CI 已提供，静态校验通过；GNOME SDK 下载限时失败，尚未生成或启动真实 `.flatpak`，见 [Flatpak 构建](flatpak.md)。

本轮 GUI 验收运行于 Linux 隔离显示环境。macOS、Windows、移动端与物理触控板未在本机实测。本机同时有其他项目编译，性能样本仅用于检查渲染更新及功能完整性，不作为稳定帧率基准。
