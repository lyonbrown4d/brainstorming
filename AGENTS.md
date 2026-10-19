# AGENTS.md — Brainstorming 开发约定

## 产品方向

Brainstorming 是基于 React Flow + Tauri 2 / Rust 的本地优先跨平台思维导图工具。
本仓库已从 Vetra 虚拟化 Block Editor 转向思维导图；旧代码由 Git 历史保留。
对外名称使用 Brainstorming（头脑风暴），仓库标识、文件名和本地目录统一使用 brainstorming，不保留旧品牌名称或路径。项目采用单 package，禁止重新引入 monorepo/workspace。

## 架构

- `src/core`：纯 TypeScript 主题树、命令、历史、校验、版本化 JSON。
- `src/formats`：XMind 与大纲转换及导入报告；原生 SQLite 由 Rust 读写，不将第三方文件字段写入 core。
- `src/layout`：主题树到左右布局的纯计算，优先采用成熟布局库。
- `src-tauri/src`：Rust 原生服务；`src-tauri/plugins/brainstorming-native`：Swift / Kotlin 平台适配；`src`：共享 React 前端。
- `src/shared`：前端平台 API 的白名单契约；Rust 在命令边界重新验证。
- Core 不依赖 React、DOM、Tauri、React Flow 或其 Node/Edge 类型。
- React Flow 节点/边是文档模型的视图投影，不是持久化协议。
- 产品聚焦思维导图与头脑风暴，画布使用 React Flow，不提供三维视图或独立 draw.io 编辑器。节点表现是同一主题的样式，切换保留标题、层级、备注和资源；游离想法与手绘和导图共存于同一 Sheet。
- 主题树维护稳定 ID、唯一父节点、有序子节点、禁止循环和不可达节点。
- 所有文档变更必须通过类型化命令；一次用户操作对应一次撤销。
- 拖动中间位置、选区、测量缓存不写入文档历史；拖动结束提交移动命令。
- 产品运行于 Tauri，目标为 macOS、Windows、Linux、iOS、Android，不维护纯 Web 产品或浏览器文件、密码、恢复降级。Storybook 可注入类型明确的平台 API 预览组件。
- Rust 重复计算优先使用成熟异步缓存库；当前图片派生元数据使用 Moka，键包含原图内容摘要、管线版本和参数。缓存必须有容量和过期上限，不缓存失败、明文临时文件、密钥或授权结果；命中仍执行取消、文件变化校验与资源授权。
- Rust 后端使用 FluxDI 2.0.0（Rust >= 1.99.1），按平台、存储、文档、AI/MCP、媒体划分 Module，统一在 `application` 根模块装配。服务依赖优先用 `static_module!` 宏声明，异步工厂负责资源初始化，官方 Module 钩子负责启动与关闭；始终复用同一最外层服务图上下文，业务代码不查询全局容器。`AppState` 是 Tauri 命令使用的类型化服务入口。退出须先停止新操作、排空任务，再关闭连接池与资源；失败或取消时也完成清理。移动端系统能力使用 Tauri 插件，不保留 Node 后端。
- SQLite 使用 SQLx / SQLCipher，查询、事务和连接池统一使用 SQLx 异步 API。迁移采用编译内嵌的显式 SQL，由 SQLx Migrator 管理，履历表统一为 `_brainstorming_migrations`；文档库和本机库分别维护迁移序列，已发布迁移不可修改，新增变更追加文件。迁移版本独立于文件协议标识。文档按规范路径共享连接池，借用期间不得关闭；密码只留在原生内存。
- Tauri capabilities 仅授权应用窗口；远程页面没有原生命令权限。文件访问必须经系统选择器或会话授权，网页截图禁用脚本及外部子资源。

## 工具链

保留 Vite / Tauri CLI、Moon 单项目任务图与 pnpm。package scripts 直接调用成熟 CLI，不维护通用 tasks.ts 包装；多任务依赖与缓存交给 Moon。前端、配置和脚本使用 TypeScript，原生后端使用 Rust。开发模式保留 React Scan，React DevTools 使用官方 standalone 接入并通过本机开关启用，均不进入发布产物。React renderer 与 Storybook 启用正式 React Compiler，沿用 React 19 官方接入方式；不将其用于 core 或 Rust 后端。

## 实现与质量

- pnpm 是唯一包管理器，提交 pnpm-lock.yaml。
- TypeScript strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes；禁止滥用 any。
- 项目内部静态导入、类型导入、再导出和动态导入统一使用 `@` 路径别名，禁止 `./`、`../` 相对模块路径；第三方包和 Node 内置模块保留原包名。路径别名集中维护在 `tsconfig.json`，React renderer、Vitest 和 Storybook 通过 Vite 内置 `resolve.tsconfigPaths` 解析，Playwright 使用 TypeScript 路径映射。资源 URL、文件路径和工具的目录配置不属于模块导入。
- 手写源码、测试、Storybook 和 TypeScript 配置单文件不得超过 300 行，包含空行与注释；按职责拆分，不压缩格式或删除有用注释规避检查。第三方下载源码与生成产物不纳入该限制。
- 函数、React 组件、回调和普通方法统一使用箭头函数；命名函数用 `const`，构造函数及 getter/setter 保留语言语法。断言函数的变量必须显式标注函数类型；迁移时检查初始化顺序，不依赖函数声明提升。
- 新增源码、测试、配置和脚本优先使用 TypeScript（`.ts` / `.tsx`），保持 strict 类型检查，不新增平行的 JavaScript 实现。
- 任何编码实现先检查现有依赖和成熟第三方库，优先复用通用能力，允许按需引入成熟库。选型检查维护状态、官方文档、类型支持、许可证、运行环境兼容性、包体积与安全性；只为主题树业务规则和必要集成维护自有逻辑。新增依赖使用 pnpm 并提交锁文件，不为通用能力另造基础组件或工具框架。
- `pnpm lint` 强制检查内部路径、箭头函数及 300 行上限，`pnpm typecheck` 校验 TypeScript 契约；提交前与 CI 沿用同一套检查。详细别名和示例见 `docs/development.md`。
- React 组件负责呈现和交互；模型、布局、文件协议分别维护。
- 使用局部订阅和稳定引用，避免输入一个字符重绘全部主题。画布投影只缓存当前文档并复用未变化节点/边；视口只在移动结束写入会话。低倍率非选中主题显示轻量文本与形态，选中或编辑时恢复完整内容，尺寸保持不变。禁止为全图节点批量挂载布局动画。
- 自由绘图复用 perfect-freehand；指针中间点仅留临时预览，结束后通过单次命令提交，取消不写历史。笔迹随 Sheet 保存，读取必须验证点数、总量、有限坐标和样式边界。
- 演示为独立页面工作台，从主题树生成编排；仅挂载当前/下一页，页面列表虚拟化，禁止逐项播放重排隐藏画布。编排设置进入文档命令，播放进度与计时只留会话。
- 渲染时的翻译使用 `useMessages` 返回的响应式函数，或直接使用 react-i18next 的 `t`；不要丢弃 `useTranslation` 返回值后调用全局翻译函数，避免 React Compiler 缓存旧语言。选项列表显式接收翻译函数；全局翻译仅用于事件和非 React 业务逻辑。
- Enter、Tab、blur、快捷键必须考虑 IME composition。
- 主题文本编辑复用 Lexical 官方 React 扩展；选区、输入法、纯文本粘贴和编辑内历史交给 Lexical，应用仅衔接导图命令。禁止通过逐字符重建编辑器或自写输入法状态机处理中文输入。
- 新增 UI 优先使用 shadcn/ui + Radix 和成熟组件；主题样式与全局样式集中管理。通用能力优先选维护活跃的第三方库，仅为主题树业务规则、命令和必要集成编写自有逻辑。
- 新增、连线、外框、概要、标注、历史和编辑操作放在画布底部浮动 Dock，单行平铺并支持横向滚动，参数面板优先向上展开；平时收起为可发现的小入口，hover 或键盘聚焦时展开；连线、编辑及子面板操作期间保持可用。持续调整的主题格式、标记、任务、链接、注解样式和画布结构、配色、模板放在右侧属性栏，使用横向 shadcn Tabs 分组；演示播放和设置入口放在标题栏。关联线、外框、概要和标注优先直接在画布创建与原位编辑，不通过模态表单代替画布操作；文件、安全、AI 配置等需要独立确认的流程可使用对话框。
- 多文档使用画布顶部浮动标签，与底部 Dock 一样在 hover 或键盘聚焦时展开，支持横向滚动，不占用标题栏或固定内容行；每份文档保留独立文件路径、脏状态、历史、Sheet 和二维视口。底部 Sheet 标签只切换当前文档的画布。
- 现有 UI 迭代时同步检查通用控件，优先替换为官方 shadcn 组件；缺少的组件通过固定版本的官方 CLI 下载，使用 pnpm，避免自行重写同类基础控件。
- `src/components/ui` 中下载的 shadcn 组件保持官方实现，不直接修改其逻辑、结构、默认样式或 API。业务差异通过上层组合组件、公开 props、`className` 和集中主题变量实现；组合组件放在业务目录，不放入 `ui`。
- 业务视觉样式优先使用 Tailwind CSS utilities，通过组合组件的 `className` 表达布局、间距、字体、颜色和交互状态；不为新功能手写同类 CSS。已有界面被修改时同步迁移涉及的业务样式。CSS 文件仅保留集中主题变量、第三方集成及确实需要数据驱动的画布规则；动态主题颜色、尺寸通过类型明确的样式值或 CSS 变量传入。
- 升级 shadcn 组件通过官方 CLI/注册表重新获取并审查差异，不能在原始组件上维护业务补丁。下载源码属于第三方组件，标明来源；源码行数拆分要求面向手写业务代码，不为行数拆散上游组件。
- ESLint 管质量，Prettier 管格式；Husky 提交前检查格式和类型。
- 原生 `.brainstorming` 使用 SQLite 协议 v2，不兼容旧 ZIP/JSON 文档、本机数据库或恢复记录。主题、顺序和资源引用存关系表；二进制按 SHA-256 去重，以 256 KiB 分块存储，不把大文件 base64 放进 renderer 状态。XMind 导入后保存必须使用新的 `.brainstorming` 路径，不能覆盖源文件；XMind 导出走独立副本流程。密码保护使用 SQLCipher，文件内版本与恢复不得降级为明文；密钥不写入文档或日志。
- 大图片通过 libvips 生成预览和瓦片，renderer 通过受限资源协议按范围读取；网页预览使用禁用脚本的隔离原生 WebView，自动按 URL 去重并串行排队，不能同时打开所有链接。主题图片仅通过显式命令变更。
- 已有路径的导图按 Tab 自动保存，使用不修改编辑器的草稿快照；手动保存、另存为、密码变更、版本读取和释放共用按路径队列。保存结果只能更新原 Tab、原工作簿和原路径的保存基线，期间的新修改保持未保存状态。无路径导图只留内存，不写自动保存或恢复快照，关闭后丢失；继续保留未保存关闭确认。
- 原生文件通过 SQLite 事务写入，不能先截断原文件；处理取消、损坏 SQLite/第三方 ZIP/JSON/XML、保存失败和恢复失败。
- 测试覆盖主题树合法性、命令边界、撤销重做、序列化和恢复。
- UI 遵循 [Tauri 官方 WebDriver 指南](https://v2.tauri.app/develop/tests/webdriver/)，使用 WebdriverIO + `@wdio/tauri-service` 的 embedded 驱动启动真实原生应用，覆盖 macOS、Windows、Linux；原生验收必须使用当前源码构建的完整 E2E 二进制，不混用旧二进制与新的开发 renderer；WDIO 插件与文件选择器测试入口仅在 e2e feature、独立应用标识下启用。Storybook 保留 Playwright 浏览器组件测试；画笔拖动必须使用真实浏览器输入验证命中层级，不以 dispatchEvent 或直接点击笔迹替代。
- Storybook 提供主题和编辑器交互预览；性能使用固定 fixtures、多次采样。
- CI 至少执行 format:check、lint、typecheck、test、build、Storybook、E2E。

## 工作流程

1. 阅读本文件和 product.md，确认范围和包边界。
2. 确定测试点，完成最小可用闭环。
3. 运行格式、lint、类型、相关测试和构建。
4. 同步产品说明、README、Storybook 与必要迁移说明。
5. 交付具体变化、验证证据和未验证限制。

构建与验证须设置时限。长时间无进展时进行一次进程及锁诊断，随后停止并记录未完成项；不得无限等待、重复重跑或终止其他项目的进程。

## Git 与协作

- 保留已有提交历史，不覆盖远程历史。用户已要求删除旧 Vetra 基线分支和代码。
- 后续默认直接在 `main` 分支迭代、提交和推送；需要隔离工作时，新分支使用 `codex/` 前缀。
- 主分支保护规则的调整须获得用户明确授权；禁止为推送或合并擅自绕过保护。
- 并行 agent 各自拥有明确文件范围，不覆盖其他 agent 的未提交修改。
- 不提交密钥、个人路径、依赖缓存、构建产物或本地恢复文件。
