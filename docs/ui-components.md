# UI 组件来源与组合约定

通用控件优先使用 shadcn/ui。缺少组件时，使用固定版本的官方 CLI 和 pnpm 获取，按项目的 `components.json` 放入 `src/components/ui`。

应用外观复用 [next-themes](https://github.com/pacocoursey/next-themes) `0.4.6`（MIT），管理系统偏好、本机持久化和跨窗口同步；Tauri 通过白名单事件同步系统外观。纯客户端入口通过公开 `scriptProps` 将库的 SSR 引导脚本设为惰性数据块，实际切换由库的 effect 执行；React-free 启动页只读取已保存选择。

导图配色复用 [Culori](https://culorijs.org/api/) `4.0.2`（MIT）计算填充色和文字对比度。`PaletteChooser`、`CustomPaletteEditor` 与应用外观菜单组合现有 shadcn Button、Input、Label、ScrollArea、ToggleGroup、Popover 和 DropdownMenu；颜色输入调用原生控件，未维护自制拾色器。缩略图是由同一配色数据驱动的微型导图，不使用界面截图作为运行时素材。

本轮使用 CLI `shadcn@4.22.0` 获取 Button、Dialog、Tooltip、Badge、ScrollArea、Input、Textarea、Checkbox、Select、Label、Separator、Popover、DropdownMenu、Toggle、ToggleGroup 和 Tabs；另保留 Dice UI Stepper；本轮新增 Command 后共 18 个基础组件。本轮从官方注册表重新获取现有组件，使用支持 React 19 与 Tailwind CSS 4 的实现。下载目录保留官方源码，不通过业务补丁修改组件结构、逻辑、默认样式或公开 API；Prettier 和 ESLint 不重写该目录，TypeScript 检查和交互测试仍覆盖其使用。

Tabs 由官方 CLI `shadcn@4.22.0` 获取，`ui/tabs.tsx` 保持上游实现。右侧属性分组和文档标签通过公开 props 与 Tailwind className 组合，不在下载源码中加入业务逻辑。

语言菜单使用 i18next / react-i18next（具体版本由锁文件固定）和官方 DropdownMenu，切换简体中文与英文；选择通过桌面 API 保存，不翻译用户内容。

业务组合放在 `src/components`：

- `DocumentTabs` 位于画布顶部，按 hover 或键盘聚焦展开，单行横向滚动；标签切换独立文档会话。底部 `SheetTabs` 只切换当前工作簿的 Sheet，标题栏保留演示播放与设置。
- `CanvasOverlay` 用 Tailwind 布局及类型明确的动态 inset，把 Dock、缩略图和视角按钮限定在侧栏之间；侧栏覆盖动画不会重建或连续调整画布尺寸。
- `ToolbarFileMenu` 和 `SheetActionMenu` 组合官方 DropdownMenu，统一分组、分隔线、禁用项及删除操作的 destructive 变体；菜单键盘导航、选择后关闭及 Escape 焦点恢复由 Radix 管理。`SheetTabItem` 只组合标签、拖动把手和画布菜单。`ViewModeSwitch` 组合 ToggleGroup；`DockAction` 组合 Button，提供图标和短标签。
- 动作列表使用 DropdownMenu。持续调整的主题样式、标记、任务、链接和注解样式放在右侧属性栏；“画布”分组包含结构、配色与模板。属性分组使用横向 Tabs；包含参数和提交按钮的“接入分支”表单继续使用 Popover。
- 创建引导的 Stepper 来自 [Dice UI 的 Radix 注册表](https://diceui.com/docs/components/radix/stepper)，通过 `pnpm dlx shadcn@4.22.0 add @diceui/stepper` 获取。`ui/stepper.tsx` 及 `hooks/use-value-as-ref.ts`、`hooks/use-ref-with-init.ts` 保持下载实现，业务在 `CreationSteps` 组合；样式只通过公开 props 和 Tailwind className 调整。步骤、草稿和返回状态不写入文档。
- `FieldSelect` 组合 Select，统一业务选项、可访问名称和值校验。
- `DialogContent` 组合官方 DialogContent、DialogClose 和 Button，通过公开的 `showCloseButton` 属性组合随界面语言切换的关闭按钮。
- `MarkerAction` 在右侧主题属性中组合官方 FieldSelect 和 ScrollArea；优先级与进度即时应用，Simple Icons 通过 Iconify offline 和随包图标数据呈现，不请求外部图标服务。
- `TopicContentPanel` 组合 Lexical、Button、Badge、ScrollArea 和图片预览，管理主题内容。

差异优先通过组合、公开 props 和 `className` 实现，主题变量集中在 `styles/ui.css`。业务布局优先通过 Tailwind utilities 表达，需要手写的样式使用 SCSS 预处理；Tailwind v4 / shadcn 的 `ui.css` 入口保留 CSS。动态画布值保留为类型明确的样式值；不把业务状态或导图命令放入基础组件。

已有界面在迭代时一并检查基础控件。本轮替换主题样式选择器、移动父主题选择器、画布名称输入、画布控制、大纲和标签操作按钮；React Flow、Lexical 和 dnd-kit 继续负责各自的专业交互。

升级时通过官方 CLI/注册表重新获取，审查 API 差异，再在组合层适配并运行类型、Storybook 和 E2E。不要为了适配业务修改下载组件，也不要以下载组件为模板复制另一套通用控件。

全局命令面板组合 shadcn Command、Dialog 和 cmdk `1.1.1`（MIT），内容查询与命令执行放在业务层。新增 `ui/command.tsx` 来自 [shadcn 官方源码](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/command.tsx)：固定版本 CLI `shadcn@4.22.1` 的注册表请求返回 403 后，改从同一官方上游获取，仅调整仓库导入别名。业务使用公开 props 扩展布局、键盘提示、错误状态和主题，不修改下载组件。

创建引导及属性栏结构选择复用 `StructureBrowser`，默认按思维与逻辑、层级结构、分析归纳、时间线、表格矩阵分组，搜索覆盖全部中英文预设。创建引导提供“不使用预设”，创建一份仅有中心主题的普通思维导图。设置采用四项横向 Tabs、对齐的紧凑设置行及可滚动内容；画布侧栏与视口控件沿用统一暖白、石墨语义颜色。

标题栏统一为 44px，高频按钮保留 32px，Windows/Linux 窗口按钮为 40×44px。macOS 原生交通灯中心调整为 y=22，与内容行对齐；全屏时取消交通灯预留空间。系统通知入口组合现有 Button 与 TanStack Query，在通用设置中显示启用、关闭、读取失败和权限状态，不新增应用内 Toast 组件。
