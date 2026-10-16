# Trelyx

Trelyx 是基于 React Flow 和 Electron 的本地优先桌面思维导图应用。

支持多布局导图、二维/三维原位编辑、多选与分支剪贴板、画布注解、富文本与嵌入资源、演示、大纲、导入导出，以及本地 `.trelyx` 保存、密码保护与历史恢复。项目采用单 package，源码、配置和共享契约使用 TypeScript。开发模式默认启用 React Scan，支持查看组件渲染；`VITE_REACT_SCAN=false` 可关闭，生产构建自动排除。

## 开发

需要 Node.js 24 或 26、pnpm 10.12.1。仓库固定包管理器版本，CI 覆盖 Node.js 24/26。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 直接运行 `electron-vite dev`。`pnpm dev:web` 启动浏览器预览；浏览器使用文件导入、下载和 IndexedDB 恢复，桌面版通过受限 preload API 访问本地文件。

## 使用

界面采用大画布、画布底部浮动 Dock 与 Trelyx 紫色视觉。Dock 平时收起，移入或键盘聚焦后展开，连线与子面板操作期间保持展开。关联线通过画布起终点创建，边界、概要与标注原位编辑。右上角独立开关左侧大纲和右侧样式面板，文件名菜单提供新建、打开、保存与最近文件。底部标签对应同一文件内的 Sheet，支持新增、重命名、复制、删除、键盘切换、菜单移动和拖动排序；每页保留独立内容、选择、缩放及撤销历史。

选中主题后，按 Tab 新建子主题、Enter 新建同级主题、F2 或直接输入编辑标题。编辑时 Shift+Enter 换行，Esc 取消。中文输入法组词时不触发结构快捷键。方向键在主题之间导航。

画布、右侧名称和主题备注编辑统一使用 Lexical 官方编辑、焦点与历史扩展，中文组词期间保持同一个编辑器和选区；结束编辑时只提交一次文档历史。编辑内撤销由 Lexical 处理，提交后的撤销恢复整次主题修改。Motion 提供侧栏轻滑入与退出、Sheet 切换淡入；系统启用“减少动态效果”时关闭位移和视角动画。

拖动分支到目标主题附近可更换父级，右侧面板支持上下排序和切换一级分支方向。修改通过命令记录，⌘/Ctrl+Z 撤销，Shift+⌘/Ctrl+Z 重做。

主题面板提供 Lexical 局部标题格式、Markdown 富文本备注、标签、图标、链接、任务、公式、音频、一张主题图片和多个附件。图片支持 PNG/JPEG/GIF/WebP，嵌入画布并可预览；附件嵌入文件，可另存和移除。内容操作参与撤销，复制 Sheet 保留内容并可独立修改。

顶部 2D/3D 开关切换当前 Sheet 的视图。三维视图复用 Three.js、React Three Fiber 与 Drei，提供空间卡片、分支聚焦、路径返回和相机控制。单击选择主题，双击或选中后按 F2 在卡片内使用 Lexical 编辑；独立聚焦按钮打开分支和主题面板。触控板双指平移、捏合缩放，Alt/Option + 双指旋转；鼠标拖动旋转、右键拖动平移。普通相机与聚焦仅保留于本次会话，各 Sheet 独立；主动添加的演示步骤可保存主题顺序与三维视角；图形能力不可用时可返回二维继续编辑。

使用 ⌘/Ctrl+S 保存，⌘/Ctrl+O 打开，⌘/Ctrl+N 新建。支持打开 `.trelyx` 原生文件和 `.xmind`；XMind 转为未保存文档，首次保存创建 `.trelyx`，源文件保持原样。导入报告列出样式调整和未导入内容。恢复提示需要主动选择；无效文件不会替换当前文档。

桌面标题栏与文档工具栏合并，顶部空白可拖动窗口。macOS 保留原生红黄绿按钮；Windows/Linux 使用原生窗口按钮覆盖层。全屏与窗口失焦会同步调整标题栏。

底部 Dock 横向平铺工具，可左右滚动访问布局与主题、筛选、模板、大纲编辑、演示、导入导出、文件密码、版本历史和 AI。布局支持左右导图、左右逻辑图、上下组织图、鱼骨、时间线、矩阵与分支结构覆盖。⌘/Ctrl+F 打开跨 Sheet 查找；替换限制在当前画布，可整次撤销。

## 工具链与检查

package scripts 直接调用 CLI，多任务依赖和缓存交给 Moon。

```bash
pnpm ci-gate          # Moon：格式、lint、类型、单元测试、生产构建
pnpm test:e2e         # 浏览器编辑流程
pnpm test:perf        # 100/1000/5000 主题固定输入，多次采样
pnpm storybook       # 组件与交互预览
pnpm build-storybook
pnpm test:storybook   # Vitest + Playwright 浏览器组件测试
pnpm build
pnpm test:desktop     # 真实 Electron 生产构建启动
pnpm moon run trelyx:package
```

首次运行浏览器测试前执行 `pnpm exec playwright install chromium`。桌面测试需要图形会话。`pnpm package` 直接运行 electron-builder，执行前须先 `pnpm build`；Moon 的 package 任务已经声明这项依赖。

## 目录与组件

- `src/core`：主题树、命令、历史和版本化 JSON，独立于 UI 框架。
- `src/formats`：原生 ZIP/AES 容器、XMind 与大纲转换及导入报告。
- `src/layout`：基于 d3-hierarchy / Dagre 的多结构、分支混合布局与派生空间布局。
- `src/renderer/index.html`、`src/renderer/src`：React Flow 画布、Zustand 状态和 shadcn/ui 通用组件。
- `src/main`：窗口、菜单、受信任 IPC、本地文件和恢复。
- `src/preload`：白名单 bridge 与隔离上下文。
- `src/shared`：main/preload/renderer 共享的类型契约。
- `stories`、`tests`：组件交互、文件边界、E2E 和性能验证。

UI 通用组件使用官方 shadcn 源码，业务差异通过组合和 Tailwind utilities 实现，详见 [UI 组件约定](docs/ui-components.md)。

详见[产品范围](product.md)、[架构与文件协议](docs/architecture.md)、[验证与发布](docs/development.md)和[设计验收与实图](design-qa.md)。

## 当前限制

原生格式为 ZIP + JSON，协议版本 1；不读取旧 JSON `.trelyx` 或旧恢复记录。XMind 第三方扩展、特殊结构与部分样式仍可能丢失或转换，不能保证与 XMind 无损往返或视觉一致。Trelyx 自有扩展可在导出 XMind 后由 Trelyx 恢复。文件协议和格式损失说明见 [原生格式与 XMind 支持范围](docs/file-format.md)。

PNG/SVG/PDF 和打印输出当前 Sheet 的完整二维布局；不会导出三维截图。Markdown/OPML/文本仅保留大纲内容。密码只保护原生文件、自动恢复和版本历史；导出副本是普通文件。修改密码后旧加密快照仍需原密码。

AI 仅桌面版提供，需用户自行配置服务；没有默认密钥。浏览器不提供桌面历史版本。多人协作、评论和分享链接本次不包含。macOS 打包尚未配置正式签名与公证；系统文件关联和麦克风权限需安装产物后按平台验证。

Agent 共享约定位于 [AGENTS.md](AGENTS.md)，APM CLI 固定为 `.apm-version` 中的版本，`apm.yml` 显式面向 Codex。当前没有外部 Agent 依赖；可通过 `uvx --from apm-cli==0.33.0 apm install --frozen` 核对真实生成的锁文件。
