# AGENTS.md — Trelyx 开发约定

## 产品方向

Trelyx 是基于 React Flow + Electron 的本地优先桌面思维导图工具。
本仓库已从 Vetra 虚拟化 Block Editor 转向思维导图；旧代码由 Git 历史保留。
对外名称使用 Trelyx。项目采用单 package，禁止重新引入 monorepo/workspace。

## 架构

- `src/core`：纯 TypeScript 主题树、命令、历史、校验、版本化 JSON。
- `src/layout`：主题树到左右布局的纯计算，优先采用成熟布局库。
- `electron` / `src/renderer`：Electron main/preload 与 React renderer。
- Core 不依赖 React、DOM、Electron、React Flow 或其 Node/Edge 类型。
- React Flow 节点/边是文档模型的视图投影，不是持久化协议。
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
- 手写源码原则上不超过 300 行，按职责拆分；不要为了行数拆成无意义碎片。
- React 组件负责呈现和交互；模型、布局、文件协议分别维护。
- 使用局部订阅和稳定引用，避免输入一个字符重绘全部主题。
- Enter、Tab、blur、快捷键必须考虑 IME composition。
- 新增 UI 优先使用 shadcn/ui + Radix 和成熟组件；主题样式与全局样式集中管理。通用能力优先选维护活跃的第三方库，仅为主题树业务规则、命令和必要集成编写自有逻辑。
- ESLint 管质量，Prettier 管格式；Husky 提交前检查格式和类型。
- 文件写入须避免截断原文件；处理取消、无效 JSON、保存失败和恢复失败。
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
- 新分支使用 `codex/` 前缀；正常变更通过 PR 进入 main。
- 并行 agent 各自拥有明确文件范围，不覆盖其他 agent 的未提交修改。
- 不提交密钥、个人路径、依赖缓存、构建产物或本地恢复文件。
