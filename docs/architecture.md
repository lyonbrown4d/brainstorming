# 架构与文档格式

Trelyx 是单 package 桌面应用。React Flow 负责画布交互，d3-hierarchy 负责树布局，shadcn/ui 和 Radix 负责通用控件，dnd-kit 负责画布标签排序，Zustand 保存编辑状态，Electron 负责系统集成。

## 目录与依赖

采用 electron-vite 推荐目录，自动识别主进程、预加载和渲染端入口：

```text
src/
  main/index.ts          # 原生窗口、菜单、IPC、文件和恢复
  preload/index.ts       # 受限 contextBridge
  renderer/
    index.html
    src/main.tsx         # React Scan 开发入口
    src/App.tsx          # React 组合入口
    src/components/
    src/hooks/
    src/state/
    src/styles/
  shared/                # main、preload、renderer 共用契约
  core/                  # 纯 TypeScript 主题树、工作簿、命令、校验
  layout/                # 纯布局与文本尺寸估算
```

`@core`、`@layout`、`@shared`、`@renderer` 分别映射上述目录。core 不导入 DOM、React、Electron、renderer 或 React Flow；布局和界面均可依赖 core。应用不使用外部服务、数据库、账户或云同步。

## 编辑与画布历史

主题新增、改名、删除、移动、折叠、方向及样式变更通过类型化命令返回不可变树。每个 Sheet 保留独立主题历史与选择；画布名称和顺序等结构操作另记历史，通过操作顺序与当前画布的内容撤销协调。撤销结构操作时保留其他存续画布的后续编辑，撤销新增后再重做也保留该画布已有内容。历史最多保留 100 步。

切换画布先提交当前草稿；各画布的缩放和平移只存于会话，不影响脏状态，不写入正式文件。左右大纲和样式面板独立开关。样式包括填充、文字颜色、字号、粗斜体、形状、线型与粗细，经过校验、参与撤销并随主题保存。

主题树是内容来源；React Flow 节点与边是布局投影。一次拖拽结束才提交移动命令，中间坐标不进入历史。折叠后不投影后代，画布只挂载视口中的元素。文本估算包含字号、边框与留量，字体平台差异仍需在对应系统复核。

## JSON 协议与迁移

当前 `.trelyx` 文件是 `format: 'trelyx'`、`version: 2` 的工作簿，包含稳定的文档 ID、文档标题和有序 `sheets`。每个 Sheet 包含独立 ID、名称与 `document`；主题树沿用内部 v1 内容结构，样式为经校验的可选字段。文件名、画布名称和中心主题标题相互独立。

旧的顶层 v1 单画布文件和恢复记录会自动升级为一个 Sheet；下次保存写出 v2。导入验证版本、画布数量/唯一 ID/名称、主题唯一父节点、可达性、循环、样式和保留 ID。最后一个画布不能删除；画布复制产生独立 ID 和内容。

导出只保留白名单协议字段，活动画布、选择、历史、视口、面板、拖动状态和输入草稿不进入正式文件。未来版本被明确拒绝，损坏文件不替换当前工作簿。Vetra 和 XMind 文档属于不同协议，不自动加载。

## 文件与恢复

renderer 通过 `src/shared/contracts.ts` 的 DesktopAPI 调用 preload。主进程验证 IPC 来自当前窗口主框架，文件访问限于原生对话框选定位置、当前会话授权位置和持久化最近文件列表。renderer 不直接访问 Node 文件系统；contextIsolation 和 sandbox 保持开启，nodeIntegration 关闭。

保存和恢复覆盖整份工作簿，而非当前 Sheet。复用 write-file-atomic，先写同目录临时文件并同步，然后重命名替换。读取限制 10 MB；另存为文件名独立清理并限制 UTF-8 字节长度。保存期间新增画布或继续输入，完成后仍保持未保存状态；等待打开文件期间若又有任何画布编辑，需要重新确认。

恢复文件与最近文件位于 Electron userData，分别为 recovery.trelyx、recent-files.json。恢复写入串行；未处理上次记录时不以示例覆盖。自动恢复可提交当前输入草稿的副本，不额外增加撤销记录。原生关闭前检查整份工作簿的未保存更改。
