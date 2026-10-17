# 架构

Brainstorming 使用共享 React / TypeScript 编辑器和 Tauri 2 原生宿主。桌面目标为 macOS、Windows、Linux，移动目标为 iOS、Android。前端没有 Node 运行时；文件、SQLite、恢复、密钥和网络请求由 Rust 管理。

## 模块

| 目录                                     | 职责                                                        |
| ---------------------------------------- | ----------------------------------------------------------- |
| `src/core`                               | 纯 TypeScript 文档模型、不可变命令、校验、撤销和多 Sheet    |
| `src/layout`                             | 复用 D3 / Dagre 的纯几何布局                                |
| `src/formats`                            | XMind、Markdown、OPML 等交换格式与转换报告                  |
| `src/assets`                             | 有界内联资源校验与前端导出适配                              |
| `src`                                    | React Flow、Lexical、Three.js / R3F / Drei、shadcn 组件组合 |
| `src/shared`                             | 类型明确的平台能力契约                                      |
| `src-tauri/src/document`                 | 原生文件、SQLCipher、资源块、版本、显式 SQL 迁移            |
| `src-tauri/src/storage`                  | 本机索引、加密临时资源及 Deadpool 连接管理                  |
| `src-tauri/src/runtime`                  | 文档会话、系统文件、恢复、剪贴板、AI 和 MCP                 |
| `src-tauri/src/media`                    | 资源导入、libvips 预览 / 瓦片和网页截图队列                 |
| `src-tauri/src/transport`                | 受令牌和来源约束的资源流式读取服务                          |
| `src-tauri/src/platform`                 | Tauri 生命周期、菜单、窗口和命令入口                        |
| `src-tauri/plugins/brainstorming-native` | Swift / Kotlin 文件授权、密钥、剪贴板和原生截图             |

`AppState` 显式组合原生服务，不维护 Node sidecar。前端通过 `native_request` 白名单访问平台能力；Rust 再校验参数、来源窗口、文件授权和资源范围。Storybook 和契约测试可显式注入平台 API，正式应用不能回退到浏览器本地文件或恢复存储。

## 编辑与会话

React Flow 的节点与边是文档投影。2D 和 3D 共享主题命令、选择、Lexical 标题编辑和 Sheet 内容。每次用户操作对应一次撤销；拖动中间坐标、相机、视口、面板和文本草稿不写入正式文件。

每个文档标签保留独立的路径、脏状态、历史和 Sheet；每个 Sheet 可以选择自己的结构和配色。关闭标签只释放对应文档会话。连接池按规范文件路径复用，操作期间持有租约，应用退出等待进行中的事务和恢复写入结束。

## 原生文件

`.brainstorming` 是 SQLite / SQLCipher 单文件，原生协议版本为 2，application ID 为 `0x42524E54`。不兼容此前的文件、缓存或恢复目录。TypeScript 工作簿 JSON 继续作为编辑器与原生边界的数据模型，其版本与文件协议独立。

主题、父级、有序子节点、Sheet 和资源引用存关系表；局部结构与样式存经过校验的 JSON。二进制按 SHA-256 去重，并以 256 KiB 块保存。普通读取和 Range 读取均按块流式返回；视频不必一次读入前端。图片通过 libvips 生成 WebP 预览和 DeepZoom 瓦片，原始资源保留。

正式保存通过 SQLite 事务完成；新文件和密码变更使用临时文件与原子替换。最多保留 20 次文件内结构版本；资源对象可被不同 Sheet 和历史版本共享。密码不写入本机索引或前端持久化，恢复副本保持密码保护。详见 [文件格式](file-format.md)。

## 系统文件与移动端

系统选择器、拖放和系统打开事件授予文件访问，前端不能自行提供任意本机路径。iOS 的安全范围书签与 Android 的持久 URI 授权由原生插件管理。移动端外部文件先进入工作副本，再通过平台授权写回；iOS 首次导出在完整生成文件后交给系统文件选择器，取消不会建立成功保存状态。

本机元数据库保存语言、最近文件和恢复索引。恢复正文使用独立原生文件，先完成一代正文再替换索引；失败时保留之前一代。解锁令牌有有效期，激活文档后才建立密码会话。

## 资源与网页预览

本机资源服务只监听随机的 loopback 端口，使用随机会话令牌，并检查 Host 和 Origin。GET、HEAD 和单范围 Range 由 Axum 流式响应；每次读取有界，客户端断开或退出时取消。没有公开目录服务或任意路径读取接口。

网页预览按 URL 去重、缓存并串行排队。Rust 限制请求、跳转、DNS、公网地址和下载预算，再将静态 HTML、样式与图片交给禁用脚本的原生 WebView 截图。截图窗口不具有编辑器权限。依赖 JavaScript 的页面可能只显示明确标注的元数据预览，不能保证与浏览器动态页面一致。预览不会自动替换用户主题图片。

## 启动与测试

Vite 构建 `index.html` 与 `splash.html`。桌面启动使用独立 Tauri 启动窗口与隐藏主窗口，React 挂载完成后交接；移动端使用系统 LaunchScreen 与主 WebView 内的启动提示。主页面重载时先取消 AI / MCP 会话。

Vitest 验证共享模型、布局、格式和前端状态；Rust 测试验证 SQLite、SQLCipher、资源流、恢复和权限边界；WebdriverIO Tauri service 验证真实原生应用。E2E 专用二进制使用独立应用标识，文件选择器替代入口和 WebDriver 插件均由 `e2e` feature 隔离。Storybook 使用 Playwright 进行组件测试。
