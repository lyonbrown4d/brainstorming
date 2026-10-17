# UI 组件来源与组合约定

通用控件优先使用 shadcn/ui。缺少组件时，使用固定版本的官方 CLI 和 pnpm 获取，按项目的 `components.json` 放入 `src/renderer/src/components/ui`。

应用外观复用 [next-themes](https://github.com/pacocoursey/next-themes) `0.4.6`（MIT），管理系统偏好、本机持久化和跨窗口同步；Electron 仅增加白名单事件和原生标题栏颜色同步。纯客户端入口通过公开 `scriptProps` 将库的 SSR 引导脚本设为惰性数据块，实际切换由库的 effect 执行；React-free 启动页只读取已保存选择。

导图配色复用 [Culori](https://culorijs.org/api/) `4.0.2`（MIT）计算填充色和文字对比度。`PaletteChooser`、`CustomPaletteEditor` 与应用外观菜单组合现有 shadcn Button、Input、Label、ScrollArea、ToggleGroup、Popover 和 DropdownMenu；颜色输入调用原生控件，未维护自制拾色器。缩略图是由同一配色数据驱动的微型导图，不使用界面截图作为运行时素材。

本轮使用 CLI `shadcn@4.21.5` 获取 Button、Dialog、Tooltip、Badge、ScrollArea、Input、Select、Label、Separator、Popover、DropdownMenu、Toggle 和 ToggleGroup。下载目录保留官方源码，不通过业务补丁修改组件结构、逻辑、默认样式或公开 API；Prettier 和 ESLint 不重写该目录，TypeScript 检查和交互测试仍覆盖其使用。

业务组合放在 `src/renderer/src/components`：

- `CanvasOverlay` 用 Tailwind 布局及类型明确的动态 inset，把 Dock、缩略图和视角按钮限定在侧栏之间；侧栏覆盖动画不会重建或连续调整画布尺寸。
- `ToolbarFileMenu` 和 `SheetActionMenu` 组合官方 DropdownMenu，统一分组、分隔线、禁用项及删除操作的 destructive 变体；菜单键盘导航、选择后关闭及 Escape 焦点恢复由 Radix 管理。`SheetTabItem` 只组合标签、拖动把手和画布菜单。`ViewModeSwitch` 组合 ToggleGroup；`DockAction` 组合 Button，提供图标和短标签。
- 动作列表使用 DropdownMenu；结构图库、颜色选择及包含参数和提交按钮的“接入分支”表单继续使用 Popover。
- 创建引导的 Stepper 来自 [Dice UI 的 Radix 注册表](https://diceui.com/docs/components/radix/stepper)，通过 `pnpm dlx shadcn@4.21.5 add @diceui/stepper` 获取。`ui/stepper.tsx` 及 `hooks/use-value-as-ref.ts`、`hooks/use-ref-with-init.ts` 保持下载实现，业务在 `CreationHeader` 组合；样式只通过公开 props 和 Tailwind className 调整。步骤、草稿和返回状态不写入文档。
- `FieldSelect` 组合 Select，统一业务选项、可访问名称和值校验。
- `DialogContent` 组合官方 DialogContent、DialogClose 和 Button，通过公开的 `showCloseButton` 属性配置中文关闭按钮。
- `MarkerAction` 组合官方 Popover、FieldSelect 和 ScrollArea；优先级与进度即时应用，Simple Icons 通过 Iconify offline 和随包图标数据呈现，不请求外部图标服务。
- `TopicContentPanel` 组合 Lexical、Button、Badge、ScrollArea 和图片预览，管理主题内容。

差异优先通过组合、公开 props 和 `className` 实现，主题变量集中在 `styles/ui.css`。业务布局优先通过 Tailwind utilities 表达，动态画布值保留为类型明确的样式值；不把业务状态或导图命令放入基础组件。

已有界面在迭代时一并检查基础控件。本轮替换主题样式选择器、移动父主题选择器、画布名称输入、画布控制、大纲和标签操作按钮；React Flow、Lexical 和 dnd-kit 继续负责各自的专业交互。

升级时通过官方 CLI/注册表重新获取，审查 API 差异，再在组合层适配并运行类型、Storybook 和 E2E。不要为了适配业务修改下载组件，也不要以下载组件为模板复制另一套通用控件。
