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
  formats/               # ZIP、原生协议与 XMind 转换
```

`@core`、`@layout`、`@shared`、`@renderer` 分别映射上述目录。core 不导入 DOM、React、Electron、renderer 或 React Flow；布局和界面均可依赖 core。应用不使用外部服务、数据库、账户或云同步。

## 编辑与画布历史

主题新增、改名、删除、移动、折叠、方向及样式变更通过类型化命令返回不可变树。每个 Sheet 保留独立主题历史与选择；画布名称和顺序等结构操作另记历史，通过操作顺序与当前画布的内容撤销协调。撤销结构操作时保留其他存续画布的后续编辑，撤销新增后再重做也保留该画布已有内容。历史最多保留 100 步。

切换画布先提交当前草稿；各画布的缩放和平移只存于会话，不影响脏状态，不写入正式文件。左右大纲和样式面板独立开关。样式包括填充、文字颜色、字号、粗斜体、形状、线型与粗细，经过校验、参与撤销并随主题保存。

主题树是内容来源；React Flow 节点与边是布局投影。一次拖拽结束才提交移动命令，中间坐标不进入历史。折叠后不投影后代，画布只挂载视口中的元素。文本估算包含字号、边框与留量，字体平台差异仍需在对应系统复核。

主题编辑复用 Lexical 的 `LexicalExtensionComposer`、`PlainTextExtension`、`AutoFocusExtension` 和 `HistoryExtension`。仅选中主题、当前编辑主题和右侧名称区域挂载编辑器，未选主题保持普通文本。Lexical 管理 DOM、组合输入、选区、粘贴及编辑内撤销；渲染层集成只处理导图快捷键、草稿和提交。编辑期间不随每个字符重设 Lexical 状态，提交、取消或文档撤销后才同步主题树中的文本，避免旧 React Flow 投影覆盖新内容。文件保存纯文本标题和备注；图片与附件在各画布内以稳定资源 ID 引用。

Motion 管理侧栏进出和 Sheet 切换淡入；面板使用位移与透明度，避免逐帧改宽度触发 React Flow 测量循环。动效不记录到文档或历史中，减少动态效果设置也作用于缩放、适应视口和选区自动定位。

## 文档协议

原生 `.trelyx` 是 ZIP 容器，包含 `manifest.json` 和 `document.json`。容器协议标识为 `app.trelyx.document`、版本为 1。内容保存独立工作簿、画布、文档 ID、标题、主题树和样式；格式适配层负责与 core 模型转换。core 的版本化 JSON 仅用于内部传输和状态比较，不是磁盘协议。

不提供此前 JSON 文件或旧恢复记录的迁移。未来容器版本和未知原生内容明确拒绝，防止打开再保存导致静默丢失。活动画布、选择、历史、视口、面板、拖动状态和输入草稿不进入正式文件。

`src/formats/xmind` 识别 ZIP 内的现代 `content.json` 和旧版 `content.xml`，转换为经过校验的工作簿。XMind 导入返回转换报告和无保存路径的文档，保存时创建原生文件；最近文件仍可记住源文件。ZIP/XML 复用成熟依赖，业务映射独立于 renderer 和 Electron。具体结构、边界及限制见 [文件格式](file-format.md)。

## 文件与恢复

renderer 通过 `src/shared/contracts.ts` 的 DesktopAPI 调用 preload。主进程验证 IPC 来自当前窗口主框架，文件访问限于原生对话框选定位置、当前会话授权位置和持久化最近文件列表。renderer 不直接访问 Node 文件系统；contextIsolation 和 sandbox 保持开启，nodeIntegration 关闭。

保存和恢复覆盖整份工作簿，而非当前 Sheet。复用 write-file-atomic，先写同目录临时文件并同步，然后重命名替换。压缩输入限制 32 MiB，单条目解压后限制 10 MiB；另存为文件名独立清理并限制 UTF-8 字节长度。保存期间新增画布或继续输入，完成后仍保持未保存状态；等待打开文件期间若又有任何画布编辑，需要重新确认。

恢复文件与最近文件位于 Electron userData，分别为 recovery-v1.trelyx、recent-files.json。恢复写入串行；未处理上次记录时不以示例覆盖。自动恢复可提交当前输入草稿的副本，不额外增加撤销记录。原生关闭前检查整份工作簿的未保存更改。

操作系统打开请求由 main 保存到一个待处理槽位，通过 preload 通知 renderer；renderer 在恢复记录处理完成后消费，并对未保存更改确认。启动参数、macOS open-file 与第二实例共用该流程，renderer 不能传入任意系统打开路径。

## 主题内容与多画布资源

每个 Sheet 的 document 维护自己的资源表；主题保存可选 notes、image 和 attachments。资源 ID 在单页内唯一，图片引用包含尺寸。编辑命令返回不可变快照；移除资源引用后，会话保留字节以支持撤销，正式序列化仅保存仍被引用的资源。复制 Sheet 复制主题元数据和资源，原页和副本可独立编辑。

一个原生文件保存工作簿的有序 sheets 和所有引用资源。ZIP 中资源路径为 assets/<sheet-index>/<asset-id>，画布排序后重新生成包内路径；稳定的工作簿、Sheet、主题和资源 ID 不受排序影响。同名或同 ID 的附件在不同页隔离。删除再撤销恢复完整内容，保存不携带撤销历史。整份工作簿资源总量限制为 24 MiB，复制导致超限时保留原工作簿并提示。

资源读取、文件选择和导出由受信任 IPC 与主进程执行，单资源上限 8 MiB，图片类型通过字节签名确认，禁止将 SVG/HTML 当作图片。附件只提供显式另存，不自动执行。浏览器使用 idb-keyval 在 IndexedDB 保存恢复记录，避免附件超出 localStorage 常见容量。
