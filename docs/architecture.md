# 架构与文档格式

Trelyx 是单 package 桌面应用。React Flow 负责画布交互，d3-hierarchy 负责树形与层级分区布局，shadcn/ui 和 Radix 负责通用控件，dnd-kit 负责画布标签排序，Zustand 保存编辑状态，Electron 负责系统集成。

三维视图按需加载 Three.js、React Three Fiber 和 Drei。`layout/spatial.ts` 从同一主题树派生空间坐标，Drei 负责相机、圆角几何、连线和中文标签投影；不将 Three 类型写入 core；普通相机仅是会话状态，显式保存的演示步骤使用纯数值坐标。独立 Zustand 视图状态保存各 Sheet 的维度、聚焦和相机，打开文档时重置。标题原位编辑仍由现有 Lexical 扩展提交类型化改名命令；触控板适配仅将浏览器 wheel 意图转换为 CameraControls 的平移、缩放和旋转调用。

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

`@core`、`@layout`、`@shared`、`@renderer` 分别映射上述目录。core 不导入 DOM、React、Electron、renderer 或 React Flow；布局和界面均可依赖 core。文档编辑不依赖账户或云同步。AI 服务由用户主动配置，主进程使用成熟 SDK 调用；renderer 不持有持久化服务密钥。

## 编辑与画布历史

`StartupWindow` 由主进程管理独立启动窗和隐藏主窗的交接。启动窗在本地数据初始化前创建，使用独立的 sandbox preload，仅暴露阶段订阅、重试和退出；主窗 preload 只发送界面就绪和启动失败通知。主进程校验发送窗口及主框架，同时等待 Electron `ready-to-show` 与 React 首帧就绪，再显示主窗并销毁启动窗。失败与超时可重试，关闭启动窗会结束启动；定时器和 IPC 监听在交接或退出时清理。`index.html` 与 `splash.html` 共用 Vite 多入口构建，两个 preload 输出独立 CJS 文件，避免 sandbox 中加载本地共享分块。浏览器预览保留静态启动提示与减少动态效果支持。

`workspace` 保存首页、编辑器及文档/Sheet 创建引导的会话状态，不写入工作簿。启动时仅初始化内部空文档，直到用户创建、打开、恢复或主动探索示例后才启用自动恢复写入。导航到首页与创建引导保留原工作簿；确认创建时才替换文档或追加独立 Sheet。离开编辑器或替换文档时关闭查找面板，避免对隐藏文档进行替换。打开系统传入的文件和恢复草稿沿用原有校验流程，成功后进入编辑器。

主题新增、改名、删除、移动、折叠、方向及样式变更通过类型化命令返回不可变树。每个 Sheet 保留独立主题历史与选择；画布名称和顺序等结构操作另记历史，通过操作顺序与当前画布的内容撤销协调。撤销结构操作时保留其他存续画布的后续编辑，撤销新增后再重做也保留该画布已有内容。历史最多保留 100 步。

画布投影把布局已知的主题尺寸传入 React Flow 的 `initialWidth` / `initialHeight`，避免新节点在首次 DOM 测量前被隐藏，导致 Lexical 聚焦失败。主题编辑器继续使用官方 AutoFocus 扩展，新挂载的画布编辑器通过 Lexical 选择占位文字。`topicCreation` 统一处理新增主题；父主题折叠时批量执行展开与新增。二维画布和三维主题按钮共享结构快捷键，三维仅在焦点原本位于主题按钮时跟随键盘选择，避免抢走工具栏和表单焦点。

切换画布先提交当前草稿；各画布的缩放和平移只存于会话，不影响脏状态，不写入正式文件。左右大纲和样式面板独立开关。样式包括填充、文字颜色、字号、粗斜体、形状、线型与粗细，经过校验、参与撤销并随主题保存。

主题树是内容来源；React Flow 节点与边是布局投影。一次拖拽结束才提交移动命令，中间坐标不进入历史。折叠后不投影后代，画布只挂载视口中的元素。文本估算包含字号、边框与留量，字体平台差异仍需在对应系统复核。

`settings.layout` 指定 Sheet 默认结构，`topic.structure` 可覆盖分支；切换整页时以一个批命令设置默认结构并清除根覆盖。D3 tidy tree 处理分支排序与避让，partition 处理树形表格的层级单元格；矩阵按列、共享行高和单元格内的 D3 子树排列。业务适配输出纯几何的括号、骨架、单元格和显式连线路径，混合分支与游离主题整体平移这些几何信息。`shared/layout-geometry` 统一二维画布与 SVG 的路径，PNG/PDF/打印复用同一输出。

三维投影将相同的结构几何转换为世界坐标，结构化组件保持同一平面，默认导图继续按分支展开深度。Three.js SVGLoader 采样括号与特殊连线路径，Drei Line 绘制线条，表格单元格使用位于卡片后方的透明平面；普通导图边保留 Bézier 渲染路径。完整结构边界参与相机取景，分支聚焦对无关几何淡化，不改变文件内容。

主题编辑复用 Lexical 的 `LexicalExtensionComposer`、`PlainTextExtension`、`AutoFocusExtension` 和 `HistoryExtension`。仅选中主题、当前编辑主题和右侧名称区域挂载编辑器，未选主题保持普通文本。Lexical 管理 DOM、组合输入、选区、粘贴及编辑内撤销；渲染层集成只处理导图快捷键、草稿和提交。编辑期间不随每个字符重设 Lexical 状态，提交、取消或文档撤销后才同步主题树中的文本，避免旧 React Flow 投影覆盖新内容。文件保存纯文本标题及可移植的 Markdown 格式；局部标题与富文本备注使用 Lexical 官方 RichText/List/Link/Markdown 扩展。图片、附件与音频在各画布内以稳定资源 ID 引用。

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

## 注解、交换与安全

浮动 Dock 统一呈现画布工具。`annotationInteraction` 只保存连线起点、放置模式、注解选中和内联编辑状态；创建关联线、边界、概要、标注或游离主题时才发出 core 命令。React Flow 自定义边与 ViewportPortal 负责二维投影，三维注解使用稳定的 Drei HTML portal。UI 不通过单独的模态表单替代画布选择。

core 批命令先构造并验证完整结果，再一次写入历史；选区、搜索与演示播放状态在独立 Zustand store 中。主题剪贴板使用经过校验的版本化数据，粘贴重新生成主题、资源与注解 ID，并预检工作簿预算。桌面剪贴板同时提供可读文本与自定义类型；不把 React Flow 元素作为文件协议。

格式转换复用 fflate、mdast、XML 库和 jsPDF；完整图形输出调用纯布局，不依赖屏幕上已挂载的节点。XMind 自有扩展严格校验后才回写模型。第三方导入缺失和有损映射通过报告说明。

密码原生文件复用 AES ZIP 库。桌面密码、待解锁文件与 token 由主进程会话管理，完成文档接受后才激活；token 限时且不能访问任意路径。密码变化串行保护恢复记录，开启时保护已有明文历史；旧加密历史保留旧密码。版本历史只暴露生成的标识，不暴露任意文件读写 API。

AI 配置使用系统 safeStorage 加密持久化密钥；不可用或 basic_text 时仅保存在内存。主进程限制提示、上下文、主题数量、树深、响应大小、输出 token 和时限，校验结构化结果。renderer 先预览，再通过已有命令添加新 Sheet 或新分支；异步期间文档变更会阻止应用旧结果。

编辑器明确区分主题选择与文本编辑。Lexical 负责原生 composition 和 Range；Space/双击通过一次编辑入口指定末尾或全选，不在字符更新时重建选区。React Flow 负责框选、组拖动和关联端点重连；拖动会话保留初始位置与排除子树，结束时才生成命令。三维通过 Three.js 投影卡片边界并以射线和平面交点计算拖动位移；选区和子树预览在 renderer 中保留，挂接与排序复用二维的视图无关目标规则。相机在选区和节点拖动期间暂停，文档或 Sheet 身份变化时取消会话。游离位置只保存平面位移，三维深度不进入文件。方向导航按不可变文档 WeakMap 缓存可见布局。MiniMap 偏好使用独立 Zustand persist，不进入工作簿。

演示路线、播放快照和视图恢复请求均为会话状态。无自定义路线时只计算可见主题顺序；播放使用临时展开投影，界面屏蔽编辑。共享播放控件跨 2D/3D 挂载，退出恢复原始选区和视图。

TanStack Query 缓存最近文件等异步 IPC 读取，命令和工作簿仍存于 Zustand。RxJS debounceTime 合并恢复请求，concatMap 串行写入；内部 catchError 隔离单次失败，卸载取消待处理任务。原生 dirty 状态去重后通知主进程。
