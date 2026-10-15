# 架构与文档格式

Trelyx V0.1 是单 package 桌面应用。React Flow 负责画布交互，d3-hierarchy 负责树布局，shadcn/ui 和 Radix 负责通用控件，Zustand 保存界面状态，Electron 负责系统集成。

## 编辑流程

界面把新增、改名、删除、移动、折叠和方向切换转换为 core 命令。命令返回新的不可变文档；历史最多保留 100 个步骤。一次拖拽结束才提交移动命令，中间坐标不进入历史。新建到折叠分支、移动到折叠父级时，命令同时展开目标父级。

主题树是唯一内容来源。`layoutDocument` 计算主题的坐标和估算尺寸，再投影为 React Flow 节点与边。折叠后不投影后代，画布只挂载视口中的元素；节点尺寸使用文本估算，浏览器字体差异仍需在视觉验证中检查。

## JSON 协议

文件内容为 `format: 'trelyx'`、`version: 1` 的内部 JSON，包含文档 ID、标题、rootId 与 topics。每个主题包含 ID、标题、有序 children、collapsed 和 side。中心主题方向固定 right，左右一级分支的后代继承方向。

导入验证版本、结构、唯一父节点、可达性、循环和保留 ID。导出只保留协议字段，选择、视口、临时拖动和输入草稿不进入正式文件。当前没有旧版本 migration；未来协议变化必须增加版本与相应兼容测试。Vetra 和 XMind 文档属于不同协议，不自动加载。

## 文件与恢复

渲染进程通过 `shared/contracts.ts` 的 DesktopAPI 调用 preload。主进程验证 IPC 来自当前窗口主框架，文件访问限于原生对话框选定的位置、当前会话授权位置和持久化最近文件列表。renderer 不直接访问 Node 文件系统。

保存复用 write-file-atomic，先写同目录临时文件并同步，然后重命名替换目标文件。读取限制为 10 MB，内容必须通过 core 校验。另存为的文件名与文档标题分开处理，限制 UTF-8 字节长度。

恢复文件和最近文件位于 Electron `userData`，分别为 `recovery.trelyx`、`recent-files.json`。恢复写入串行执行；上次记录尚未被用户处理时，不用当前示例文档覆盖。原生关闭未保存导图前确认，尚未处理的启动恢复记录单独保留。保存期间继续编辑不会错误地把新内容标为已保存；打开文件等待期间若又有编辑，需要重新确认。

## 边界

`src/core` 不导入 DOM、React、Electron 或 React Flow。布局和界面均可依赖 core。当前应用不使用外部服务、数据库、账户或云同步。
