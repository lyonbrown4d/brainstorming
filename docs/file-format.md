# Brainstorming 原生格式与格式转换

`.brainstorming` 使用 SQLite，MIME 为 `application/vnd.brainstorming+sqlite3`。旧 ZIP/JSON 原生文档、旧本机数据库和旧恢复记录不迁移；只改后缀不能转换文件。XMind 的 ZIP/XML/JSON 导入仍由独立适配器处理。

## 工作簿与多画布

一个文件保存完整工作簿及有序 Sheet。工作簿、Sheet、文档、主题和资源使用稳定 ID；文件标题、画布名称和中心主题标题分别保存。相同资源 ID 或同名附件在不同 Sheet 内独立映射，二进制相同的对象可以共享。

选择、活动画布、视口、编辑器撤销栈和输入草稿属于会话，重新打开默认选择第一张画布。复制或删除画布可撤销，主题和资源描述随快照恢复；文件内的版本记录与编辑器撤销栈分开。

## 原生 SQLite 协议

未加密文件以 `SQLite format 3\0` 开头，`PRAGMA application_id` 为 `0x42524e53`。`document.protocol` 当前为 `1`，必需功能为 `ordered-topics` 和 `chunked-resources`。SQLCipher 文件须先解密才能读取这些字段；文件头检测不能替代密码验证和模型校验。

| 表或表组                                                                       | 保存内容                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------- |
| `document`、`sheets`                                                           | 工作簿身份、协议、必需功能、Sheet 顺序与元数据 |
| `topics`                                                                       | Sheet 内主题身份、父级、兄弟顺序及主题内容     |
| `relations`、`topic_groups`、`group_members`、`callouts`、`presentation_steps` | 注解、成员顺序和显式演示步骤                   |
| `resources`、`topic_resources`                                                 | Sheet 内资源 ID、对象引用及主题使用角色        |
| `resource_objects`、`resource_chunks`                                          | SHA-256 对象身份、长度与有序二进制块           |
| `resource_variants`、`image_tiles`                                             | 原图对应的预览对象和瓦片坐标                   |
| `document_revisions`、`revision_resources`                                     | 最近 20 个结构版本及各版本引用的对象           |
| `kysely_migration`、`kysely_migration_lock`                                    | 官方 Kysely Migrator 的迁移和锁记录            |

原生 schema 静态注册于 `src/main/document-db/schema.ts`，初始迁移为 `202610170001_native_document`。打开时检查 application ID、协议、必需功能和迁移版本；不支持的文件明确拒绝。打包运行不依赖扫描 TypeScript 迁移目录。原生读写入口为 `NativeDocuments`；按文件路径执行 SQLite 事务，不先把整个原生文件读入 JavaScript 字节数组。

core 的 JSON 是内部 IPC、状态比较和剪贴板契约。大资源传递 `storage` 描述：对象 ID、字节长度、可选尺寸、预览和瓦片元数据；路径、会话 URL 和密码不写进 core。小型内联资源仍可用规范 base64 表示，保存时转为二进制对象。`encodeBrainstorming` / `decodeBrainstorming` 为异步、有界工具适配器，最多接受 64 MiB 字节文件；生产打开和保存直接走文件路径接口。

## 主题与资源

`Topic` 保存纯文本标题、有序子级、折叠、方向、样式和可选内容。主题支持一张图片、最多 32 个附件、最多 100000 字符备注。图片引用记录尺寸，布局计算画布显示尺寸。

对象按 SHA-256 去重，以 256 KiB 块保存；读入块时检查长度、顺序与块摘要。Sheet 排序和资源重命名不改变对象身份。移除主题引用后，旧版本仍可能引用原对象，因此不能把未被当前主题引用的对象直接视为无用数据。版本只保存结构快照并共享已有对象。

工作簿当前引用的唯一二进制资源最多 256 GiB，单个存储对象最多 64 GiB；不同资源 ID、不同 Sheet 引用同一对象只计一次。新增唯一对象超限时整次命令失败，保留此前状态；复制同一资源不会重复计入这项预算。内联资源的单项 8 MiB 限制继续适用于工具和剪贴板，不代表原生文件的存储对象上限。

Sharp 读取图片签名和尺寸，在原生工作线程生成最长边不超过 1600 像素的 WebP 预览，以及边长 512、重叠 1 像素的分级瓦片。原图保持完整；动画图片的派生图使用首帧。图片输入最大 1 GiB，像素预算为 268402689；SVG/HTML 不作为图片解码。

renderer 通过随机会话 origin 的 `brainstorming-resource://` URL 读取已登记对象。协议仅处理 GET/HEAD，支持单段 Range、Content-Range、流背压和取消；瓦片通过已授权原图查找，不能传入任意磁盘路径。每次只为资源块借用数据库连接。已知图片、音视频和 PDF 使用受限 MIME，其他内容作为附件下载，响应带 `nosniff` 和 sandbox CSP。

主题 metadata 保存标签、图标、网页/内部主题链接、任务、公式、音频资源 ID、备注格式和可移植 Markdown 标题。可选 `markerStyle` 保存图标位置 `position`（`top`、`bottom`、`left`、`right`）和整数尺寸 `size`（12–48 px）。缺省为下方、16 px；拖动预览不进入文件。富文本不持久化 Lexical 内部节点。Document 可保存 `settings`、`relations`、`groups`、`callouts`、`floatingIds`、`floatingPositions` 和 `presentation`。游离主题仍使用树的稳定 ID 和唯一父级规则，其根附件关系不渲染为连线；显式位置是文档数据。普通视口不持久化，主动保存的演示步骤可包含三维相机。

`settings.layout` 和主题 `structure` 支持 `map`、`logic-right/left`、`org-down/up`、`tree-down/up`、`brace-right/left`、`fishbone`、`timeline`、`timeline-vertical`、`matrix`、`tree-table-right/down`。这些是各个独立枚举值，斜杠仅用于本文合并方向说明。原生协议为 SQLite v1，缺省结构使用导图；文件不保存派生节点坐标、括号路径或表格几何。

`settings.theme` 支持 `brainstorming`、`ocean`、`forest`、`sunset`、`mono`、`dawn`、`paper`、`night`。可选 `customPalette` 保存 `name`（最多 40 字符）、`root`、恰好 5 个 `branches` 颜色和 `background`；颜色均为六位十六进制值。文字与浅填充从这些数据计算，不保存视图缓存。XMind 通过 Brainstorming 命名空间扩展保留这些设置，不保证外部 XMind 使用相同配色。应用的浅色、深色或系统偏好仅保存在本机，不写入工作簿。

音频按字节签名识别，不凭扩展名判断。音频与附件同样使用对象和分块资源；读取原始媒体支持字节范围，不需要把完整录音或视频放进 renderer 状态。

## 网页预览与拖入文件

打开工作簿后，renderer 扫描所有文档标签中的 HTTP(S) 主题链接并提交去重后的目标集合。主进程通过 `p-queue` 串行截图，同一 URL 复用待处理任务或缓存；一次集合最多 1000 个地址。已移除链接的后台任务取消。自动预览只更新缓存；链接面板的显式操作才把截图设为主题图片。

预览会访问网络，包括从 XMind 导入的网页链接。截图运行在独立 Electron session，没有应用 preload、主窗口资源协议和文件权限；拒绝私网、混合公网/私网解析、下载与权限申请。网络连接使用校验后的解析地址，重定向和子请求也经过校验。失败不修改主题内容，可在链接面板重试。

preload 使用 `webUtils.getPathForFile` 取得实际拖入文件的路径；主进程校验绝对路径和最多 32 项限制，顺序读取。原生文档和 XMind 走既有解锁与标签接受流程。资源添加到落点或所选主题，整批资源通过一次命令提交；首页同时拖入文档和资源时，资源添加到打开后的主题。

## XMind 打开行为

存在 `content.json` 时使用现代格式，否则读取旧版 `content.xml`，配合 `styles.xml` 解析样式引用。现代内容损坏时不回退到可能过期的 XML。

导入生成可编辑、未保存的 Brainstorming 工作簿；首次保存选择 `.brainstorming` 文件，主进程不允许向 `.xmind` 路径保存。最近文件保留源文件入口，重新打开会重新导入。

| 内容                             | 当前支持                                           |
| -------------------------------- | -------------------------------------------------- |
| 多画布、名称和顺序               | 保留，长名称调整并提示                             |
| 主题标题、中文、多行、层级和顺序 | 保留                                               |
| 折叠与基础样式                   | 保留折叠，映射支持范围内的颜色、字号、粗斜体和形状 |
| 备注                             | 保留纯文本；富文本转换为纯文本并提示格式未保留     |
| 包内 PNG/JPEG/GIF/WebP           | 嵌入为主题图片，保留资源字节                       |
| 指向包内资源的附件链接           | 嵌入并提供另存                                     |
| 游离、概要等附加主题             | 转为命名分支，提示原位置或语义变化                 |
| 标签和安全网页链接               | 保留；打开后进入后台网页预览队列                   |
| 第三方关联线、概要关系、图标等   | 未映射内容在导入报告中聚合提示                     |
| XMind 导出                       | 现代 ZIP；额外字段放入 Brainstorming 命名空间扩展  |

XMind 解析不请求网络或任意本地路径，不执行备注中的 HTML；工作簿打开后的自动网页预览会按前述公网策略访问链接。缺失、重复和保留名称的 ID 会重新生成；损坏、缺失、超限和不支持的内嵌资源会跳过并提示。不承诺视觉完全一致或无损往返。

## 边界与恢复

- 原生工作簿最多 128 个 Sheet、合计 20000 个主题；中心主题计第一层，最大深度 128。存储对象与工具适配器分别使用前述预算，不能把 XMind ZIP 限制套到原生 SQLite 文件。
- XMind ZIP 最大 32 MiB，最多 512 个条目，单条目解压后最大 10 MiB，累计最大 64 MiB。拒绝重复名称、路径穿越和不支持的压缩形式；XML 拒绝 DOCTYPE 和自定义实体。
- 完整结构校验后才接受新文档。保存使用 SQLite 事务；失败保留编辑器未保存状态。单个正文事务与后续密码重置是不同阶段；密码重置失败时先验证旧密钥，再补偿本次结构与版本。验证或补偿失败会明确报错，不将跨文件流程描述为一个原子事务。
- 本机语言、最近文件和恢复索引存于 `userData/brainstorming-local.sqlite`。这是独立的 Kysely 元数据库，不存正文、资源和密码；使用 WAL 与静态 `001-metadata` 迁移，拒绝未知结构。
- 工作区恢复正文位于 `userData/recovery-sqlite-v1` 的独立 SQLite 文件，索引版本为 2；最多 32 份文档，待写入元数据 JSON 合计最多 128 MiB，资源另行分块。稳定恢复文件按正文事务更新，再事务替换索引。索引失败时尝试回滚正文并清理新建文件，回滚同时失败会报告错误。
- 恢复以未保存副本打开，不恢复正式路径。损坏记录保留供排查；旧 ZIP/JSON、旧本机数据库与旧恢复记录不自动迁移。

实际系统文件关联仍需安装打包产物后按平台验证；本文说明实现边界，不声明大文件性能或特定硬件上的吞吐结果。

## XMind 导出与大纲交换

XMind 导出包含标准主题、基础样式、折叠、图片、备注、首个附件/安全链接和标签。Brainstorming 专有元数据、多附件、音频、方向、混合结构、布局、注解、游离位置和演示步骤保存在 `org.brainstorming.interchange` 扩展；Brainstorming 重新导入时严格校验并恢复。其他应用可能忽略这些扩展，不承诺在 XMind 中呈现全部语义。第三方扩展不会被当成 Brainstorming 内容执行。

标准 `structureClass` 映射以 [XMind 官方 viewer 枚举](https://github.com/xmindltd/xmind-viewer/blob/master/src/common/constants/structures.ts) 为依据。现代 JSON 和旧 XML 可导入已映射的导图、左右逻辑图、上下组织图、横纵时间线及左侧鱼头鱼骨图；未知结构报告警告，保留主题树。导出这些类型时写入标准结构字段。树形图、括号图、矩阵和树形表格暂用已知的逻辑图或组织图作为标准字段的近似回退，精确类型保存在 Brainstorming 扩展；在其他应用中打开可能呈现近似布局。Brainstorming 自有扩展优先于标准字段。

Markdown/OPML 导入先预览再替换当前工作簿。OPML 禁用 DTD 和自定义实体。Markdown、OPML、文本导出为大纲，会损失图像、复杂样式和部分元数据；界面在导出前说明。当前 Sheet 输出会移除指向未导出 Sheet 的内部链接。

PNG/SVG/PDF 从完整二维布局生成，可选择展开所有折叠分支；不截取当前 DOM。PNG/PDF 受单边 16384 像素和 4000 万像素预算限制，超出时提示降低倍率或使用矢量图。打印复用完整 SVG、隔离 iframe 与系统打印。

## 密码与文件内版本

`better-sqlite3` 在本项目映射到 `better-sqlite3-multiple-ciphers`，原生文档使用 SQLCipher。写入该原生文件的正文、资源及其预览、瓦片和版本位于同一加密数据库。自动网页截图先保留在会话资源缓存中，显式添加为主题图片后才随文档保存。密码只留在主进程会话中，改变或移除密码通过 `key`/`rekey` 处理，不能依靠 ZIP 条目加密。忘记密码无法恢复。

待解锁文件使用限时不透明 token；取消或接受失败不能提前激活新文档的密钥。已有恢复记录随密码变化更新。文件内历史使用当前文件密码，无需为同一数据库的旧版本保留旧密码；普通导出副本不自动获得原生密码保护。

每次原生写入保留最近 20 个结构版本，版本与资源关系均在该文件中。复制文件会带上这些版本；版本接口只接收生成的版本 ID，读取前须打开对应文件。恢复结果以未保存副本打开，再次保存才更新正式文档。没有单独的 `history-v1` 快照目录，也不把编辑器撤销栈写入文件。

实现入口：[原生 schema](../src/main/document-db/schema.ts)、[文档连接池](../src/main/document-db/pool.ts)、[资源协议](../src/main/resources/protocol.ts)、[图片派生](../src/main/media/prepareImage.ts)、[网页预览队列](../src/main/media/linkPreview.ts)。
