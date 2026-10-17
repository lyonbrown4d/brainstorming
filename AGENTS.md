# AGENTS.md — Trelyx 开发约定

## 产品方向

Trelyx 是基于 React Flow + Electron 的本地优先桌面思维导图工具。
本仓库已从 Vetra 虚拟化 Block Editor 转向思维导图；旧代码由 Git 历史保留。
对外名称使用 Trelyx。项目采用单 package，禁止重新引入 monorepo/workspace。

## 架构

- `src/core`：纯 TypeScript 主题树、命令、历史、校验、版本化 JSON。
- `src/formats`：原生 ZIP 容器协议、XMind 导入与转换报告；不将第三方文件字段写入 core。
- `src/layout`：主题树到左右布局的纯计算，优先采用成熟布局库。
- `src/main` / `src/preload` / `src/renderer/src`：Electron main、preload 与 React renderer，入口遵循 electron-vite 标准目录。
- `src/shared`：主进程、preload 与 renderer 共用的白名单契约。
- Core 不依赖 React、DOM、Electron、React Flow 或其 Node/Edge 类型。
- React Flow 节点/边是文档模型的视图投影，不是持久化协议。
- 三维视图使用 Three.js、React Three Fiber 与 Drei；空间坐标由纯布局派生，相机、聚焦和视图模式按 Sheet 保存在会话状态，不写入文档或历史。二维与三维共用主题命令和 Lexical 编辑链路。
- 主题树维护稳定 ID、唯一父节点、有序子节点、禁止循环和不可达节点。
- 所有文档变更必须通过类型化命令；一次用户操作对应一次撤销。
- 拖动中间位置、选区、测量缓存不写入文档历史；拖动结束提交移动命令。
- 主进程管理文件和系统能力，preload 只暴露类型明确的白名单 API。
- 必须启用 contextIsolation 和 sandbox，关闭 nodeIntegration。

## 工具链

保留 Vite / electron-vite、Moon 单项目任务图与 pnpm。package scripts 直接调用成熟 CLI，不维护通用 tasks.ts 包装；多任务依赖与缓存交给 Moon。main、preload、renderer、配置和脚本均为 TypeScript-first。

## 实现与质量

- pnpm 是唯一包管理器，提交 pnpm-lock.yaml。
- TypeScript strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes；禁止滥用 any。
- 项目内部静态导入、类型导入、再导出和动态导入统一使用 `@` 路径别名，禁止 `./`、`../` 相对模块路径；第三方包和 Node 内置模块保留原包名。路径别名集中维护在 `tsconfig.json`，Electron、浏览器、Vitest 和 Storybook 通过 Vite 内置 `resolve.tsconfigPaths` 解析，Playwright 使用 TypeScript 路径映射。资源 URL、文件路径和工具的目录配置不属于模块导入。
- 手写源码、测试、Storybook 和 TypeScript 配置单文件不得超过 300 行，包含空行与注释；按职责拆分，不压缩格式或删除有用注释规避检查。第三方下载源码与生成产物不纳入该限制。
- 函数、React 组件、回调和普通方法统一使用箭头函数；命名函数用 `const`，构造函数及 getter/setter 保留语言语法。断言函数的变量必须显式标注函数类型；迁移时检查初始化顺序，不依赖函数声明提升。
- 新增源码、测试、配置和脚本优先使用 TypeScript（`.ts` / `.tsx`），保持 strict 类型检查，不新增平行的 JavaScript 实现。
- 任何编码实现先检查现有依赖和成熟第三方库，优先复用通用能力，允许按需引入成熟库。选型检查维护状态、官方文档、类型支持、许可证、运行环境兼容性、包体积与安全性；只为主题树业务规则和必要集成维护自有逻辑。新增依赖使用 pnpm 并提交锁文件，不为通用能力另造基础组件或工具框架。
- `pnpm lint` 强制检查内部路径、箭头函数及 300 行上限，`pnpm typecheck` 校验 TypeScript 契约；提交前与 CI 沿用同一套检查。详细别名和示例见 `docs/development.md`。
- React 组件负责呈现和交互；模型、布局、文件协议分别维护。
- 使用局部订阅和稳定引用，避免输入一个字符重绘全部主题。
- Enter、Tab、blur、快捷键必须考虑 IME composition。
- 主题文本编辑复用 Lexical 官方 React 扩展；选区、输入法、纯文本粘贴和编辑内历史交给 Lexical，应用仅衔接导图命令。禁止通过逐字符重建编辑器或自写输入法状态机处理中文输入。
- 新增 UI 优先使用 shadcn/ui + Radix 和成熟组件；主题样式与全局样式集中管理。通用能力优先选维护活跃的第三方库，仅为主题树业务规则、命令和必要集成编写自有逻辑。
- 画布工具统一放在画布底部浮动 Dock，操作尽量单行平铺并支持横向滚动，参数面板优先向上展开；平时收起为可发现的小入口，hover 或键盘聚焦时展开；连线、编辑及子面板操作期间保持可用。关联线、外框、概要和标注优先直接在画布创建与原位编辑，不通过模态表单代替画布操作；文件、安全、AI 配置等需要独立确认的流程可使用对话框。
- 现有 UI 迭代时同步检查通用控件，优先替换为官方 shadcn 组件；缺少的组件通过固定版本的官方 CLI 下载，使用 pnpm，避免自行重写同类基础控件。
- `src/renderer/src/components/ui` 中下载的 shadcn 组件保持官方实现，不直接修改其逻辑、结构、默认样式或 API。业务差异通过上层组合组件、公开 props、`className` 和集中主题变量实现；组合组件放在业务目录，不放入 `ui`。
- 业务视觉样式优先使用 Tailwind CSS utilities，通过组合组件的 `className` 表达布局、间距、字体、颜色和交互状态；不为新功能手写同类 CSS。已有界面被修改时同步迁移涉及的业务样式。CSS 文件仅保留集中主题变量、第三方集成及确实需要数据驱动的画布规则；动态主题颜色、尺寸通过类型明确的样式值或 CSS 变量传入。
- 升级 shadcn 组件通过官方 CLI/注册表重新获取并审查差异，不能在原始组件上维护业务补丁。下载源码属于第三方组件，标明来源；源码行数拆分要求面向手写业务代码，不为行数拆散上游组件。
- ESLint 管质量，Prettier 管格式；Husky 提交前检查格式和类型。
- 原生 `.trelyx` 使用 ZIP 容器协议 v1，不兼容旧 JSON 文件或恢复记录。XMind 导入后保存必须使用新的 `.trelyx` 路径，不能覆盖源文件；XMind 导出走独立副本流程。密码保护使用成熟 AES ZIP 库，恢复与历史不得降级为明文；密钥不写入文档或日志。
- 文件写入须避免截断原文件；处理取消、损坏 ZIP/JSON/XML、保存失败和恢复失败。
- 测试覆盖主题树合法性、命令边界、撤销重做、序列化和恢复。
- UI 通过 Playwright 验证新增、编辑、折叠、移动、保存和重新打开。
- Storybook 提供主题和编辑器交互预览；性能使用固定 fixtures、多次采样。
- CI 至少执行 format:check、lint、typecheck、test、build、Storybook、E2E。

## 工作流程

1. 阅读本文件和 product.md，确认范围和包边界。
2. 确定测试点，完成最小可用闭环。
3. 运行格式、lint、类型、相关测试和构建。
4. 同步产品说明、README、Storybook 与必要迁移说明。
5. 交付具体变化、验证证据和未验证限制。

## Git 与协作

- 保留已有提交历史，不覆盖远程历史。用户已要求删除旧 Vetra 基线分支和代码。
- 后续默认直接在 `main` 分支迭代、提交和推送；需要隔离工作时，新分支使用 `codex/` 前缀。
- 主分支保护规则的调整须获得用户明确授权；禁止为推送或合并擅自绕过保护。
- 并行 agent 各自拥有明确文件范围，不覆盖其他 agent 的未提交修改。
- 不提交密钥、个人路径、依赖缓存、构建产物或本地恢复文件。
