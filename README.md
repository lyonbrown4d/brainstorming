# Brainstorming（头脑风暴）

Brainstorming 是基于 React Flow 和 Electron 的本地优先桌面思维导图应用。

项目与 GitHub 仓库现统一命名为 `brainstorming`，本地目录也使用该名称。原生文件后缀为 `.brainstorming`，不读取旧格式文件、恢复记录或本机偏好；此次更名不提供迁移兼容。

支持多布局导图、二维/三维原位编辑、多选与分支剪贴板、画布注解、富文本与嵌入资源、演示、大纲、导入导出，以及本地 `.brainstorming` 保存、密码保护与历史恢复。项目采用单 package，源码、配置和共享契约使用 TypeScript。开发模式默认启用 React Scan，支持查看组件渲染；`VITE_REACT_SCAN=false` 可关闭，生产构建自动排除。

## 开发

需要 Node.js 24 及以上、pnpm 10.12.1；项目不设 Node.js 版本上限，依赖仍遵循各自的 engine 约束。当前使用 Node.js 24.22 验证，CI 覆盖 Node.js 24/26。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 直接运行 `electron-vite dev`。产品仅支持 Electron，通过受限 preload API 访问本地文件；不提供独立浏览器版本。Storybook 使用类型明确的桌面 API mock 预览组件。

## 使用

桌面启动先显示独立的 Electron 启动窗口，主界面首帧就绪后自动切换，不设置固定等待时间。加载失败或耗时较长时提供重试和退出入口。启动页与主页面通过 Vite 多 HTML 入口统一构建，启动窗口读取已保存的界面语言，支持简体中文和英文。

启动进入两步创建引导，第一步直接展示全部 15 种结构方向，第二步填写名称并按需选择 4 种内容模板；返回上一步保留选择与输入。首页提供打开本地文件、桌面最近文件和探索示例入口；未创建或打开文档前不写入示例恢复记录。新建文档和底部“新建画布”共用引导，新增画布保留当前工作簿及保存路径，每个 Sheet 独立选择图形结构。步骤条复用 Dice UI 的 shadcn/Radix Stepper，文件与画布动作菜单统一使用官方 shadcn DropdownMenu。

点击左上角 Brainstorming 返回首页，或在创建引导中返回画布，不会丢弃当前内容；创建或打开文档会新增标签，保留已有文档；关闭含未保存修改的标签时需要确认。创建名称支持中文输入法。示例需主动打开，恢复记录仍由用户确认恢复。

界面采用“结构工作台”：精简顶栏、可收放的大纲与属性栏、大画布、底部浮动 Dock 和 Sheet 标签，保留 Brainstorming 紫色视觉。Dock 保持固定入口，工具向上展开，图标与短标签单行排列并支持横向滚动；连线、编辑与子面板操作期间保持展开。关联线通过画布起终点创建，边界、概要与标注原位编辑。右上角独立开关左侧大纲和右侧属性栏，文件名菜单提供新建、打开、保存与最近文件。画布顶部浮动文档标签最多支持 32 份导图，平时收起，移入或键盘聚焦后展开，可横向滚动。每份导图独立保留路径、未保存状态、历史、当前 Sheet、二维/三维模式和视图；重复打开同一路径或工作簿会切换已有标签，关闭最后一份回到首页。Ctrl+Tab / Ctrl+Shift+Tab 切换导图，⌘/Ctrl+W 关闭当前导图，⇧⌘/Ctrl+Shift+W 关闭窗口。底部标签对应同一文件内的 Sheet，支持新增、重命名、复制、删除、键盘切换、菜单移动和拖动排序；每页保留独立内容、选择、缩放及撤销历史。

顶栏“应用外观”提供浅色、深色和跟随系统，默认跟随系统；本机记住用户选择，重启后恢复。Electron 通过 `nativeTheme.updated` 通知渲染进程，不使用轮询。启动页复用已保存外观，三维控制与浮层使用同一套界面颜色。

右侧属性栏按“主题”和“画布”分组，画布中横向切换结构、配色和模板。“配色”提供 8 套导图配色缩略图、自定义颜色，以及字体、背景和线宽设置。导图配色按 Sheet 保存、一次撤销，与应用外观独立：深色界面也可展示浅色导图。二维、三维、缩略图及 PNG/SVG/PDF 图形导出共用颜色计算，已有主题的显式颜色优先保留。

单击选中主题，按 Space 或双击进入编辑：占位文字全选，已有文字从末尾续写；F2 全选编辑，直接输入替换标题。选中时 Tab 新建子主题、Enter 新建同级主题；编辑时 Enter 确认、Tab 确认并创建子主题、Shift+Enter 换行、Esc 取消。文字选区、删除和编辑内撤销交给 Lexical，中文组词不触发结构快捷键。方向键按当前结构的实际布局导航。

新建主题自动聚焦并选中占位文字，可用 Tab 连续创建子主题；Enter 确认文字后，再按 Enter 创建同级主题。向折叠分支添加主题时自动展开父主题，展开和新增可一起撤销。三维主题卡片也支持 Tab、Enter、F2、删除和方向键；键盘导航时焦点随选中的主题移动。

⌘/Ctrl+Enter 插入父主题，⌘+Backspace（Windows/Linux 为 Ctrl+Delete）仅删当前主题并提升子主题；⌥/Alt+↑↓ 调整同级顺序，⌘/Ctrl+/ 折叠或展开，⌘/Ctrl+R 前往中心。⌘/Ctrl+加号、减号、0 控制画布缩放，桌面菜单使用相同视图操作。常用行为参考 [XMind 桌面主题操作](https://xmind.com/user-guide/topic-editing-new)，不覆盖其全部可配置快捷键。

拖动画布空白平移，Shift + 拖动框选主题，Shift、⌘/Ctrl + 单击支持追加选择；拖动选中组会同步预览子树，松手后提交一次批量移动，支持挂接、同级排序和游离主题组平移。中键、右键拖动或双指滚动平移，捏合或 ⌘/Ctrl+滚轮缩放。二维 MiniMap 复用 React Flow，支持定位、拖动和缩放，可关闭并重新打开，开关在本机保留。

关联线单击选中、双击或 Space/F2 原位编辑名称，Delete 删除选中注解；选中后可拖动端点改接，取消拖动不改文档。空白双击创建游离主题。

画布、右侧名称和主题备注编辑统一使用 Lexical 官方编辑、焦点与历史扩展，中文组词期间保持同一个编辑器和选区；结束编辑时只提交一次文档历史。编辑内撤销由 Lexical 处理，提交后的撤销恢复整次主题修改。Motion 提供侧栏宽度过渡、Dock 和视图淡入、Sheet 下划线切换；侧栏覆盖展开，保持画布位置与缩放；工具和适应全图使用侧栏之间的可见区域。多选属性支持批量样式和标记，拖动反馈区分移入与同级插入；系统启用“减少动态效果”时关闭位移和视角动画。

拖动分支到目标主题附近可更换父级，右侧面板支持上下排序和切换一级分支方向。修改通过命令记录，⌘/Ctrl+Z 撤销，Shift+⌘/Ctrl+Z 重做。

主题面板提供 Lexical 局部标题格式、Markdown 富文本备注、标签、图标、链接、任务、公式、音频、一张主题图片和多个附件。图片支持 PNG/JPEG/GIF/WebP，使用预览图和分级瓦片查看，原图保留在原生文件中；附件可另存和移除。拖入原生文档或 XMind 会打开标签，图片、音频和其他文件可添加到目标主题；一次资源拖入可一次撤销。复制 Sheet 保留内容并可独立修改。

网页链接会自动进入后台截图队列，同一 URL 去重，截图任务串行执行。预览使用隔离 Electron 会话，只访问通过校验的公网 HTTP(S) 地址；打开或导入包含链接的导图可能触发这些网络请求。预览缓存不改主题图片；链接面板可显式将截图设为主题图片。

右侧主题属性中的“图标与任务标记”可即时设置 P1–P3 优先级、完成状态和进度，搜索常用图标或 Simple Icons 品牌图标。二维、三维、原生保存及图片/矢量导出共用标记；品牌图标按需加载随包资源，无需联网，每个主题最多 32 个图标。未知标记保留并显示回退图形。选中画布主题后，可拖动图标两侧手柄调整为 12–48 px，拖动图标本身切换到文字的上、下、左、右侧；松手提交一次撤销，Esc 取消预览。缩放手柄位于图标外侧，命中区域为 24 px；缩放和移动通过浮动预览反馈尺寸与目标位置，保持标题布局，松手后再重排。小于 4 px 的指针移动视为点击。面板可精确选择位置与尺寸，品牌图标库使用虚拟滚动连续浏览。

顶部 2D/3D 开关切换当前 Sheet 的视图。三维视图复用 Three.js、React Three Fiber 与 Drei，提供空间卡片、分支聚焦、路径返回和相机控制。单击选择主题，双击或选中后按 F2 在卡片内使用 Lexical 编辑；独立聚焦按钮打开分支和主题面板。触控板双指平移、捏合缩放，Alt/Option + 双指旋转；鼠标拖动空白平移，Alt/Option + 左键拖动旋转，右键仍可平移。Shift + 拖动框选完整卡片，拖动任一选中卡片可移动整组和子树，落到主题上挂接或排序；Esc 取消预览。三维与二维共用选区、移动命令和一次撤销；自动布局分支松手后按结构排列，游离主题组可保存平移位置。⌘/Ctrl+滚轮也可缩放。普通相机与聚焦仅保留于本次会话，各 Sheet 独立；主动添加的演示步骤可保存主题顺序与三维视角；图形能力不可用时可返回二维继续编辑。

顶栏可直接播放演示，并提供演示设置入口。已有步骤按保存顺序播放；未设置步骤时按当前 Sheet 的可见主题生成临时路线。播放隐藏编辑工具与面板，可用方向键、空格、PageUp/PageDown、Home/End 切换，Esc 退出，可选全屏。退出恢复原来的选择和视图；播放不写入文件或撤销历史。

使用 ⌘/Ctrl+S 保存，⌘/Ctrl+O 打开，⌘/Ctrl+N 新建。支持打开 `.brainstorming` 原生文件和 `.xmind`；XMind 转为未保存文档，首次保存创建 `.brainstorming`，源文件保持原样。导入报告列出样式调整和未导入内容。恢复提示需要主动选择；无效文件不会替换当前文档。

桌面标题栏与文档工具栏合并，顶部空白可拖动窗口。macOS 保留原生红黄绿按钮；Windows/Linux 使用原生窗口按钮覆盖层。全屏与窗口失焦会同步调整标题栏。

底部 Dock 横向平铺新增、连线、外框、概要、标注、编辑、筛选、大纲编辑、导入导出、文件密码、版本历史和 AI 等操作。主题格式、图标、任务、链接和注解样式集中在右侧属性栏；画布结构、配色和模板放在“画布”分组。“图形结构”提供 9 类结构、15 个方向选项的缩略图，包含树形图、括号图、横纵时间线和树形表格；可作用于当前 Sheet 或所选分支，支持混合结构与一次撤销。切换自动调整视野，主题内容保持完整。⌘/Ctrl+F 打开跨 Sheet 查找；替换限制在当前画布，可整次撤销。

全部结构同时支持 3D 原位编辑。括号、鱼骨骨架、时间轴和表格面使用 Three.js/Drei 绘制；结构化视图保持同一组件平面，默认导图保留分支深度展开。旋转、聚焦和触控板操作沿用同一套交互。

## 工具链与检查

桌面版在底部 Dock 提供「MCP 连接」，通过内嵌的官方 MCP Server 向外部客户端共享当前工作簿。默认关闭；读取备注和提交编辑草稿分别授权，草稿确认后整批应用并可一次撤销。连接配置和工具说明见 [MCP 连接](docs/mcp.md)。

最近文件使用 TanStack Query 共享异步 IPC 缓存，打开和保存后失效刷新。RxJS 合并自动恢复事件并串行写入，单次失败后仍继续接收后续恢复请求。文档树、草稿、选择和撤销历史仍由现有命令及 Zustand 管理。

主进程通过 Inversify 显式模块组装服务；界面语言、最近文件和恢复索引使用 Kysely + better-sqlite3，存入 `userData/brainstorming-local.sqlite`。原生文档与 `userData/recovery-sqlite-v1` 下的恢复正文都是 SQLite 文件，使用显式 Kysely 迁移；资源分块存储，连接由 Effect Pool 按规范路径与凭据共享。工作区最多恢复 32 份文档，恢复时作为未保存副本打开。SQLCipher 保护正文、资源和文件内版本，密钥仅留在主进程内存。

package scripts 直接调用 CLI，多任务依赖和缓存交给 Moon。

```bash
pnpm ci-gate          # Moon：格式、lint、类型、单元测试、生产构建
pnpm test:e2e         # 真实 Electron 编辑流程和桌面集成
pnpm test:perf        # 100/1000/5000 主题固定输入，多次采样
pnpm storybook       # 组件与交互预览
pnpm build-storybook
pnpm test:storybook   # Vitest + Playwright 浏览器组件测试
pnpm build
pnpm test:desktop     # 真实 Electron 生产构建启动
pnpm test:packaged    # 先 package --dir，再验证正式应用包启动和原生保存
pnpm moon run brainstorming:package
```

首次运行 Storybook 组件测试前执行 `pnpm exec playwright install chromium`。E2E 和性能测试需要图形会话，并先执行 `pnpm build`；也可运行已声明构建依赖的 Moon `e2e` / `performance` 任务。`pnpm test` 使用 Electron 的 Node 运行时执行 Vitest，以匹配 SQLite 原生模块 ABI。CI 在 Ubuntu Node.js 24/26 执行质量与 Storybook 检查，在 macOS 执行真实 Electron E2E、性能采样、打包与产物启动回归。`pnpm package` 直接运行 electron-builder，执行前须先 `pnpm build`；Moon 的 package 任务已经声明这项依赖。

## 目录与组件

- `src/core`：主题树、命令、历史和版本化 JSON，独立于 UI 框架。
- `src/formats`：原生 SQLite 有界工具适配、XMind 与大纲转换及导入报告。
- `src/main/document-db`、`src/main/resources`、`src/main/media`：原生关系表、连接池、分块资源、图片派生和网页预览。
- `src/layout`：基于 d3-hierarchy 的多结构、分支混合布局与派生空间布局。
- `src/renderer/index.html`、`src/renderer/src`：React Flow 画布、Zustand 状态和 shadcn/ui 通用组件。
- `src/main`：窗口、菜单、受信任 IPC、本地文件和恢复。
- `src/preload`：白名单 bridge 与隔离上下文。
- `src/shared`：main/preload/renderer 共享的类型契约。
- `stories`、`tests`：组件交互、文件边界、E2E 和性能验证。

UI 通用组件使用官方 shadcn 源码，业务差异通过组合和 Tailwind utilities 实现，详见 [UI 组件约定](docs/ui-components.md)。

详见[产品范围](product.md)、[架构与文件协议](docs/architecture.md)、[编码规范与验证](docs/development.md)和[设计验收与实图](design-qa.md)。

## 当前限制

原生格式为 SQLite，协议版本 1；不读取旧 ZIP/JSON `.brainstorming`、旧本机数据库或旧恢复记录，不提供自动迁移。XMind 第三方扩展、特殊结构与部分样式仍可能丢失或转换，不能保证与 XMind 无损往返或视觉一致。Brainstorming 自有扩展可在导出 XMind 后由 Brainstorming 恢复。文件协议和格式损失说明见 [原生格式与 XMind 支持范围](docs/file-format.md)。

PNG/SVG/PDF 和打印输出当前 Sheet 的完整二维布局；不会导出三维截图。Markdown/OPML/文本仅保留大纲内容。密码只保护原生文件、自动恢复和版本历史；导出副本是普通文件。文件内最近 20 个版本随文档复制，并随文件密码一起更新；撤销栈只保留在会话中。

AI 需用户自行配置服务；没有默认密钥。界面支持简体中文和英文，首次按系统语言选择，后续在本机保存；切换不翻译用户内容。部分底层错误仍可能显示中文。多人协作、评论和分享链接本次不包含。macOS 打包尚未配置正式签名与公证；系统文件关联和麦克风权限需安装产物后按平台验证。

Agent 共享约定位于 [AGENTS.md](AGENTS.md)，APM CLI 固定为 `.apm-version` 中的版本，`apm.yml` 显式面向 Codex。当前没有外部 Agent 依赖；可通过 `uvx --from apm-cli==0.33.0 apm install --frozen` 核对真实生成的锁文件。
