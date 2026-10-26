# 开发

项目使用单个 pnpm package、Vite、Moon 和 Tauri 3 alpha。前端为 React / TypeScript，原生服务为 Rust，移动端平台适配为 Swift / Kotlin。Node.js 要求 24 或更新版本，本机可继续使用 Node 25；pnpm 固定为 packageManager 声明的 12.x。部分依赖的 engines 范围未声明 Node 25，`engineStrict: false` 将依赖版本检查保留为警告；根 package 的 Node / pnpm 要求仍由 pnpm 强制校验，`verifyDepsBeforeRun: error` 继续检查已安装依赖与锁文件的一致性。项目命令沿用终端的 Node，不自动下载或替换运行时。`.nvmrc` 和 `.node-version` 继续推荐 Node 24，CI 覆盖 Node 24 / 25 / 26 验证；Node 25 的实际兼容性以本机测试结果为准。

## 本机准备

安装 pnpm、Rust 1.99.1 或更新版本和目标平台的 Tauri 官方系统依赖。macOS / iOS 需要 Xcode；Android 需要 JDK 21、Android SDK / NDK，并配置 `JAVA_HOME`、`ANDROID_HOME` 和 `NDK_HOME`。移动设备构建还需要相应签名。原生图片处理需要目标平台的 libvips，不能用宿主机库交叉链接。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 通过 Tauri CLI 启动 Vite 和原生窗口。Vite 服务只是原生 WebView 的开发资源，不是独立 Web 产品。浏览器直接打开时不会获得文件、密码或恢复能力。

## 原生接口生成

`pnpm generate:bindings` 从真实 Rust 命令生成 `src/generated/native.ts`。该目录已被 Git、ESLint 和 Prettier 忽略，不能手工编辑或提交。开发、类型检查、测试、Storybook 和构建入口会先生成绑定，Moon 也将其列为前置任务。生成器使用基础 `TAURI_CONFIG={}`，避免继承外层 E2E 构建的测试权限配置。首次运行前端检查需要 Rust 和对应平台的 Tauri / libvips 开发依赖；CI 的前端任务同样安装这些依赖。

macOS 打包设置 `VIPS_LIB_DIR` 后，绑定生成器需要在应用包外运行。构建脚本只为 `generate-bindings` 添加该图片库目录的运行时搜索路径；安装应用仍通过包内 `Contents/Frameworks` 加载图片库，不依赖构建机缓存路径。

新增计算命令时，在 `src-tauri/src/platform/compute.rs` 声明 Tauri / Specta 命令，加入 `bindings.rs` 的唯一命令清单，再通过 `src/lib/nativeComputeAPI.ts` 转为业务视图类型。修订号用十进制字符串传输，避免 Rust u64 在 JavaScript 中丢失精度。动态工作簿使用具名 JSON 类型并在原生边界校验，不开启全局大整数强转。计算接口处理会话与派生结果，不改变版本化 JSON 或 SQLite 文件表结构，无需新增 SQL 迁移。

导出格式、范围、内容和阶段分别由 Rust 的 `ExportFormat`、`ExportScope`、`ExportContent`、`ExportStage` 枚举定义，前端 `src/shared/documentExports.ts` 引用生成类型并提供具名常量；窗口和原生菜单同样通过生成契约传递。新增枚举值先更新 Rust，再重新生成绑定，不能手工维护第二套字符串联合类型。

正式画布向 `compute_layout` / `compute_spatial_layout` 发送空 `measurements`，由 Rust 在有界工作线程内估算全图尺寸；只在布局缓存未命中时执行。显式传入的尺寸仍用于预览和确定性几何比较；Storybook 保留 TypeScript 参考量测。前端缓存几何输入的身份，原生快照合并复用未变笔迹及其数组，避免重复运行 perfect-freehand；文本对比色使用有容量上限的 LRU Cache。

2D / 3D 布局查询使用冻结的字符串数组作为键，通过 TanStack Query 官方 `hashKey` 生成哈希，并按数组身份用 WeakMap 复用结果。键内容与默认哈希保持一致，结构相同的查询、精确失效和默认 QueryClient 读取仍共享缓存；可变键及包含对象的键不复用哈希。二维节点外部投影或选区改变后同步更新协调基线，后续指针状态变化复用已协调节点，保留 React Flow 临时框选、拖动释放位置与最新函数式更新。专项回归见 `src/lib/nativeLayoutQueryKey.test.ts` 和 `stories/CanvasNodeState.stories.tsx`。

2D 平移与缩放由 React Flow 更新视口，不触发原生重布局；画布继续复用 TanStack Query 的布局缓存和现有低倍率细节层级。缩放读数只订阅取整后的百分比，平移不重绘缩放按钮。父子分支线复用 React Flow 的端点、可见性与路径算法，合并到共享 SVG，拖动期间将相关连线与可缓存的静止连线分层；原始边记录保留用于连接查询，关闭单边 SVG 包装、指针命中、改接端点与透明交互副本。至少 250 条分支线时，相邻同色的不透明普通曲线或直线合并为路径；路由、手绘和未知样式沿用单线绘制。小组拖动只拆出受影响的线，整组移动继续批量绘制，避免重新挂载大量路径。手动关联线仍保留选中、拖动与改接能力；主题容器使用布局与样式 containment，避免内部变化扩散到其他主题。

二维拖动开始时按当前 React Flow 节点快照建立 [Flatbush](https://github.com/mourner/flatbush) 静态空间索引，并缓存父节点、剩余同级顺序和排列轴。指针移动只查询附近目标，保持主题正文优先于插入提示区的规则；默认提前 48 屏幕像素识别子主题或同级插入，保留退出缓冲，原父主题的无变化挂接不触发预判。预览线只订阅移动根主题与目标父主题，批量选区最多展示 24 条预览线，整组命令仍覆盖全部所选主题。手势结束、取消、切换 Sheet 或卸载后释放索引。拖动回调复用 ahooks 稳定函数，关联线事件处理器按挂载周期缓存。拖动期间使用临时合成层提示，结束或取消后释放。位置通知通过 RxJS 动画帧调度合并，同一帧保留每个节点的最新位置，松手同步排空，取消丢弃待处理位置。React Flow 的位置变更和子树跟随通过官方 Store API 一次发布完整预览，外部布局在 `useLayoutEffect` 中协调；选区通过 Zustand 的订阅直接同步到 React Flow，避免重渲染画布外壳。仅选区变化时复用几何和未变化的节点，忽略显式选区之后重复的主选中 ID 通知；未位移的节点和数组保留引用。每个工作簿与 Sheet 使用独立 ReactFlowProvider 生命周期，避免旧画布清理覆盖新节点。二维主题与笔迹共用选区及批量命令；全图测量和布局仍交给 Rust，指针命中留在前端。

二维缩略图继续复用 React Flow 官方 MiniMap，通过独立 ReactFlowProvider 保存延后的视图快照，与主画布共享导航控制器。复用 RxJS 合并更新通知：平移和缩放停止变化 80ms 后，先等待主画布动画帧，再排入后续任务读取最新状态；主题拖动期间保留上一张概览，结束或取消后直接排队同步。主画布恢复更新时，也取消已经排入动画帧或后续任务的旧刷新，避免低帧率下概览任务插入连续导航。没有逐帧复制全图，也没有把绘制移到工作线程。至少 250 个已测量节点时，相邻同色的不透明概览区域合并为路径，保留绘制顺序；超过 32 组则复用浏览器 SVG 图片解码器异步生成一张缓存图像，固定 512 × 512 像素的固有尺寸避免按世界坐标分配巨大图像。新图就绪前保留旧概览，失败后恢复路径；替换、取消或卸载时释放对象 URL。自定义组件、点击回调、描边、半透明或无法解析的颜色沿用官方节点。小地图自身的拖动和滚轮操作读取主画布的即时视口，避免延迟快照覆盖连续输入；SVG 数值尺寸跟随实际容器变化，避免紧凑布局下裁切；开始导航前同步视口和缩放基线。关闭后取消待处理任务，重新打开从当前状态初始化。

普通主题轮廓在颜色已解析为十六进制时复用浏览器 SVG 图片缓存和有界 LRU，保留原始几何与描边外延，正文与连接点仍使用共享编辑组件；手绘、中心主题与未解析颜色继续使用原 SVG。每个主题复用四个官方连接点，通过 React Flow 的 Loose 模式支持线的两个端点，减少不可见重复端口；文档中的关联线锚点不变。

主题缩放手柄只在投影后的主题至少为 48 × 28 屏幕像素时显示，避免固定大小的四角手柄遮住远处主题的拖动区域；拉近后自动恢复。此规则共用于二维和三维，不改变文档中的缩放比例。

属性栏的折叠区首次展开时才挂载内容，之后折叠保留输入控件和草稿。父主题选择复用 shadcn Popover 与 Command，支持搜索；关闭时不创建全图选项；工具栏的主题筛选结果也仅在弹层打开时生成。没有活动编辑时，确认草稿不发布额外的全局状态。上述规则共用于二维和三维，不改变选区、历史或文件协议。

千节点检查复用 `createFixtureDocument(1000)`。二维组件预览为 `Canvas Performance / Thousand Topics`；原生性能用例包括 `tests/native/canvas-performance.spec.ts`、`tests/native/high-frequency.spec.ts`、`tests/native/selection-performance.spec.ts` 和 `tests/native/independent-spatial-performance.spec.ts`。`tests/native/independent-spatial-correctness.spec.ts` 与三维交互用例检查相机导航、选中、混合拖动、归属预判、笔迹、缩放、关联线、保存和单次撤销。用例存在不代表已经执行通过，当前独立三维架构的原生性能仍需使用当前源码的完整 E2E 二进制采样；旧 React Flow 三维投影与 PixiJS GPU 混合方案的测量不适用于当前架构。

原生缩放契约通过 CEF 指针与滚轮输入检查实际相机、节点与视距变化；合成输入吞吐采样不能代表硬件触控板捏合或物理呈现帧率。

性能采样区分 requestAnimationFrame 调度、WebGL 渲染提交和拖动中的实际位置更新频率。它们不等于 GPU 物理呈现帧率，合成滚轮和拖动也不能代表物理触控板。高频检查每帧输入多次等量事件，并检查操作结果，不能只数回调。千节点连续导航与拖动以尽量稳定在 60 FPS 以上为优化目标，不设置 60 FPS 上限；结果需注明系统、导图规模、输入方式与采样范围，不能由单机结果推断全部平台。React Scan 只用于开发环境重渲染检查；真实指针命中由 `tests/canvas` 验证。

### 独立二维与三维画布

`src/App.tsx` 只装配路由、QueryClient、MotionConfig 与 TooltipProvider。`components/application/ApplicationShell.tsx` 负责应用外壳与工作区选择，`EditorWorkspace.tsx` 组合画布、侧栏和演示，`WorkspaceNotices.tsx` 负责恢复、错误和密码提示；服务初始化集中在 `useApplicationServices`。编辑工作区仅在 2D 分支挂载 ReactFlowProvider。`components/Canvas.tsx` 选择二维 Canvas2D，或通过 `React.lazy` 加载 `spatial/independent/IndependentSpatialCanvas`，三维不依赖二维视口、节点或 store。

Three.js、React Three Fiber、Drei 从三维入口按需加载；PixiJS 从三维量测或二维 GPU 实验入口按需加载。二维入口的静态依赖不能间接引入这些运行时；纯类型引用可保留。Vite 的 `optimizeDeps` 只负责开发依赖预构建，不表示浏览器已预加载三维模块。构建 manifest 为被忽略的生成产物，可用于核对入口与动态 chunk，不进入 Git。

独立三维由 `IndependentSpatialRuntime` 保存场景模型、相机投影、手势预览与订阅，React Three Fiber 使用 `frameloop="demand"`。CameraControls 直接控制实际 Three.js 透视相机；镜头变化只请求场景渲染，不把每个主题的位置逐帧写入 React Flow 或 React 状态。相机姿态、镜头请求和临时文档预览分别同步；内容编辑不能重置临时镜头，真正的空间配置变更及撤销仍应用到相机。前端只承担视图计算和即时交互，确定性全图量测、布局与缓存继续由 Rust 负责。

主题正面使用始终面向相机的 GPU 实例与纹理图集，不逐主题挂载 DOM。图集最多 4 页，每页 2048 × 2048 像素；容量不足时降低采样密度，不无限分配纹理。主题栅格缓存有容量上限，准备分批让出主线程，模型替换及卸载时取消过期任务并释放资源。在该三维路径中，PixiJS 只提供 `CanvasTextMetrics` 和 `TextStyle` 的字体量测与换行，不创建 Pixi Application 或第二套三维 GPU 渲染器。主题形态与分支线路径复用共享几何，通过 Three.js SVGLoader 处理；笔迹合并到场景几何中。当前活动标题使用共享 Lexical 编辑覆盖层，其余主题保持 GPU 内容。首次进入或切换文档、Sheet 时等待布局、相机与 GPU 首帧后开放编辑。同一画布内的内容更新保留上一帧并后台准备新图集，不显示整屏蒙版；超过 150ms 才显示不拦截指针的更新提示。更新期间保留镜头导航与已打开的 Lexical 编辑器，依赖新几何的选择、拖动、缩放和关联线操作等待新 GPU 首帧；小地图保留旧位图，完成后异步刷新。仅相机变化的等价模型直接复用。

选中变化通过 Three.js `BufferAttribute.addUpdateRange` 只提交受影响实例的高亮值，不重写位置、尺寸或图集；基础层与细节层同步选中。普通点击不准备全图拖动快照，也不发布几何预览；超过 4 像素拖动阈值后才创建后代集合、位置快照和归属索引，取消时仅清理本次手势持有的预览。

镜头静止 180ms 后，可见主题按投影尺寸和实际像素比补充高分辨率图集；最多 24 个主题、单页 2048 × 2048、单项不超过 100 万像素，每次扫描至少间隔 600ms。连续镜头输入只取消和合并请求，不逐帧重建文字；失败保留基础图集，替换和卸载释放纹理。线条复用导数抗锯齿及多重采样覆盖。关联线按布局引用缓存端点索引和世界几何，相机只投影已有采样；DOM 命中路径仍随镜头更新，其成本与关系数和采样点数相关。

三维命中、框选、主题与笔迹混合拖动、提前归属预判、画笔、擦除、四角缩放和手动关联线由独立视图处理，再提交既有类型化命令。混合选区保留各元素深度与相同世界位移；中间预览、选区和取消不写历史，结束按一次操作提交。侧栏、属性、快捷键及文档历史复用原有业务能力，不建立第二套文档模型。笔迹渲染键按文档缓存并避让主题 ID，矩形显式携带原始 drawing ID，禁止用前缀截取还原业务标识。

三维缩略图使用单张 Canvas 2D 位图，复用本机开关偏好。镜头变化暂停 80ms 后，先等待主画布动画帧，再通过 RxJS 异步队列读取最新投影；连续导航取消旧刷新，拖动期间保留旧概览，结束或取消后刷新。拖动与滚轮直接调用独立相机；小地图拖动期间冻结位图，仅同步 SVG 视口框，结束后重绘。缩略图不逐帧投影或复制全图，也不建立第二个 React Flow 画布。

`compute_spatial_layout` 复用原生 2D 布局，并返回主题深度。深度由层级、`settings.spatial.spacing` 和沿祖先累加的 `style.spatialDepth` 计算，笔迹沿用可选 `drawings[].spatialDepth`；2D 量测与布局忽略这些字段。计算使用 Moka 缓存与有界工作任务。节点保留二维正面，不绘制背板或挤出实体，地面网格提供空间参照。网格复用 Drei Grid，浅色画布提高中性线条对比与主次线宽；有限范围淡出以相机在地面的投影为中心，避免地面高度让线条额外衰减。

CameraControls 处理空白处旋转、右键平移、双指平移、捏合与 Alt 双指旋转，放大、缩小、复位、显示全部和聚焦使用同一相机。视角、相机目标、层距及主题深度继续通过既有文档命令随 Sheet 保存与撤销；镜头距离、运行时缓冲、选择和拖动预览只保留在渲染会话，不参与原生布局缓存键。首次进入等待原生布局、场景内容与相机就绪，失败提供加载错误与重试。独立画布不改变现有文件协议或 SQLite 表结构，无需数据库迁移；字段约束见 [单文件协议](file-format.md#主题表现笔迹与演示页面)。

## 常用命令

| 命令                                             | 用途                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm build`                                     | 构建 React 和启动窗口资源到 `dist`                                  |
| `pnpm build:desktop`                             | 编译并打包原生桌面应用                                              |
| `pnpm dev:ios` / `pnpm build:ios`                | iOS 开发 / 构建                                                     |
| `pnpm dev:android` / `pnpm build:android`        | Android 开发 / 构建                                                 |
| `pnpm typecheck` / `pnpm lint`                   | TypeScript 类型和工程约定                                           |
| `pnpm test`                                      | 共享 TypeScript 单元与状态测试                                      |
| `pnpm test:rust`                                 | 不启用 native-ui 的 Rust 文件、SQLCipher 和资源测试，不需要 libvips |
| `pnpm exec moon run brainstorming:desktop-test`  | 启用 e2e / native-ui 的 Rust 桌面服务、权限和真实 libvips 测试      |
| `pnpm exec moon run brainstorming:desktop-check` | 启用 e2e / native-ui 的全目标 Clippy 检查                           |
| `pnpm check:rust`                                | 原生 Clippy 检查                                                    |
| `pnpm build:e2e`                                 | 编译独立应用标识、启用 e2e feature 的 Tauri 测试二进制              |
| `pnpm test:e2e`                                  | 使用已编译的测试二进制运行原生 WDIO 流程                            |
| `pnpm exec moon run brainstorming:e2e`           | 先执行 build:e2e，再运行原生 WDIO 流程                              |
| `pnpm native:vips --macos`                       | 校验并准备固定版本 macOS 图片库、许可证和 bundle 配置               |
| `pnpm package --bundles app`                     | 使用现有准备脚本编译并生成 macOS app bundle                         |
| `pnpm storybook` / `pnpm test:storybook`         | 组件预览 / 浏览器组件测试                                           |

macOS 桌面验证先安装 `brew install pkgconf vips cmake ninja`。`desktop-test`、`desktop-check` 和 `build:e2e` 使用本机开发库；`package` 使用构建脚本准备并打包固定版本的 macOS 图片库，不依赖目标机器上的 Homebrew。直接运行 `pnpm test:e2e` 不会编译应用；通常使用 Moon 的 `e2e` 任务，或先运行 `pnpm build:e2e`。macOS 的 E2E 构建生成 ad-hoc 签名的 `Brainstorming E2E.app`，WDIO 默认启动其中的 `Contents/MacOS/brainstorming`；CEF Framework 和 helper 必须随这个应用包存在，不能直接启动 `target/debug/brainstorming`。Linux / Windows 继续使用无安装包的测试二进制。

`pnpm build-storybook && pnpm test:canvas` 使用现有 Playwright 在隔离的 Storybook 组件预览中执行真实鼠标操作，覆盖画笔命中层级、连续绘制、Esc 取消、擦除与撤销。Moon 的 `canvas-test` 任务会先构建 Storybook。CEF 原生用例通过 ChromeDriver 的同客户端 CDP 输入验证真实 PointerEvent 与 held 状态；Storybook 继续提供独立组件命中验证，文件持久化由真实 SQLite 测试验收。

桌面 macOS、Windows、Linux 统一使用 Tauri 3 alpha / CEF，移动端使用 Wry。原生 WDIO 通过官方 ChromeDriver 连接实际 CEF 浏览器；`--e2e-browser-version` 仅在 e2e 构建中输出该二进制编译使用的 SDK 版本，驱动按相同 Chromium build 匹配。每个测试文件独立启动完整应用，并使用临时 CEF 缓存和 Linux 数据目录；来源受限的 Tauri 全局 API 用于调用真实命令。启动失败或应用标识不匹配立即终止，不退回普通 Chrome。调试端口仅在 e2e feature + 独立标识 + 显式测试环境变量下启用，生产构建关闭。Hyprland 仅在规格开始时，按 PID 和实际二进制校验窗口，设置浮动并聚焦一次；操作过程中不循环抢焦点。迁移与平台边界见 [CEF 迁移说明](cef-migration.md)。禁止混用旧二进制与新的开发 renderer。

Linux 在仍需使用桌面时可运行 `pnpm test:e2e:isolated` 或 `pnpm benchmark:2d:isolated`。入口需要 `gnome-shell`、`glxinfo`（Debian 的 `mesa-utils`）和 `dbus-run-session`；使用独立无头 GNOME / XWayland、1920×1080@60 虚拟输出、临时配置和私有 D-Bus，不修改当前桌面。构建仍须先运行 `pnpm build:e2e`。日志记录真实 CEF WebGL 渲染器；基准拒绝软件 GL，并保留五次采样的几何与焦点检查。隔离构建的 Chromium 临时缓存使用 basic 密码存储，避免调起宿主密钥环；应用 SQLCipher 和凭据服务保持原有路径。macOS / Windows 仍运行 `pnpm test:e2e`，不启用 Linux 显示入口。

CI 覆盖 Node 24 / 25 / 26 的前端、Storybook 构建与浏览器检查；Ubuntu 单独运行无 UI 的 Rust 测试，macOS 运行 Clippy、完整桌面 Rust 测试、真实 WDIO E2E 和 app bundle 构建。预览包使用 Tauri 的 [ad-hoc 签名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)，经 `codesign` 校验后用 `ditto` 打包，保留 app 的执行权限；此步骤不代表完成公证或正式发布。本轮 CI 不构建、不测试 iOS / Android。

移动工程使用 Tauri 官方生成结构 `src-tauri/gen/apple` 和 `src-tauri/gen/android`。原生依赖、签名和模拟器必须独立验证，前端构建成功不代表手机端可以发布。

初始化或重新生成移动工程后，必须再运行 `pnpm tauri icon src/assets/brand/logo-dark.png --output src-tauri/icons`，更新已初始化工程实际使用的 Android / iOS 图标。
`src-tauri/icons/android` 和 `src-tauri/icons/ios` 保留同源的 fallback 图标；iOS init 会从官方模板创建缺失资源，不能仅依靠 fallback 目录自动覆盖新工程的占位图。

## 前端约定

保留 React Compiler 和开发环境 React Scan。内部模块通过 `tsconfig.json` 的 `@core`、`@layout`、`@formats`、`@assets`、`@renderer`、`@shared`、`@tests`、`@project` 等别名导入。禁止相对模块路径，资源 URL 和系统文件路径不受此限制。

手写源文件、测试和 TypeScript 配置不超过 300 行；不压缩代码规避限制。使用箭头函数、严格类型、局部 Zustand 订阅与 TanStack Query。UI 优先组合现成 shadcn 组件，通过 props、className 和集中主题调整，不能直接修改下载组件；样式优先使用 Tailwind utilities；需要手写的样式使用 SCSS，Vite 通过官方 `sass-embedded` 预处理。通过浅层嵌套、`@use` 和必要的 mixin 复用规则，不另建业务样式库。`src/styles/ui.css` 保留为 Tailwind v4 与 shadcn 的 CSS 入口，不经过 Sass。

## 工作区路由与设置

原生入口在 `mountApp.tsx` 使用 React Router 的 `HashRouter`，路径写入 URL 的 `#` 部分，适用于 Tauri 的本地资源协议。没有 Router 上下文的 `App` 预览使用 `MemoryRouter`，不修改 Storybook 页面自身的 hash。

| 路径                                                       | 工作区                         |
| ---------------------------------------------------------- | ------------------------------ |
| `/home`                                                    | 首页                           |
| `/create/document/:stage`                                  | 新建导图                       |
| `/create/sheet/:stage`                                     | 在当前导图中新建画布           |
| `/documents/:tabId/sheets/:sheetId`                        | 指定导图与画布                 |
| `/documents/:tabId/sheets/:sheetId/style/topic`            | 主题属性侧栏                   |
| `/documents/:tabId/sheets/:sheetId/style/canvas/:section?` | 画布属性侧栏                   |
| `/documents/:tabId/sheets/:sheetId/presentation`           | 演示编排                       |
| `/documents/:tabId/sheets/:sheetId/presentation/presenter` | 演讲者视图                     |
| `/documents/:tabId/sheets/:sheetId/presentation/play`      | 观众播放视图                   |
| `/settings`                                                | 保留当前工作区背景的设置对话框 |

创建步骤 `stage` 为 `structure`（选择结构）或 `configuration`（标题与内容模板）；旧的 `/create/document`、`/create/sheet` 会规范化为第一步。浏览器前进、后退和设置往返均保留 Zustand 中的标题、结构与模板草稿；退出引导后再前进也能恢复。创建成功才清空对应文档或画布草稿，失败保留输入。草稿只留本次应用内存，不写入文件和恢复记录。创建页使用一个纵向滚动区，结构预览按内容高度排列，标题、表单与固定底部操作栏共用内容宽度；模板卡片按容器宽度换列。模板对话框继续使用有界的 shadcn ScrollArea。

画布属性的 `section` 为 `structure`、`appearance` 或 `template`，省略时规范化为 `structure`。属性开关、一级分类和画布分组双向同步路由；关闭侧栏回到无 `/style` 后缀的画布。侧栏导航信息随既有文档会话保存，文档模型与撤销历史不变；主题选中、hover 和逐字符编辑不进入 URL。创建步骤使用短距离方向过渡，属性分类使用淡入，均尊重系统减少动态效果偏好，不重挂载整张画布。

`useWorkspaceRoutes` 是 URL 与既有 Zustand 会话之间的同步入口。URL 导航复用文档 Tab、Sheet、创建和演示命令的提交守卫；忙碌或草稿校验失败时，保留当前文档和草稿，并将 URL 替换为实际工作区路径。用户操作引起的导航字段变更合并为一次微任务更新，应用 URL 期间不反向新增历史。文本草稿、选区和播放页码变化不触发导航。

Tab 和 Sheet 标识只定位当前应用中已打开的会话；URL 不包含文件路径、文档内容或恢复数据。已关闭或无效的标识会替换为仍合法的工作区路径，不重新打开文件。设置对话框关闭或按 Esc 时返回来源路径；直接打开 `/settings` 或来源已失效时，返回当前合法工作区。

标题栏统一通过设置按钮进入通用、画布、快捷键和关于四个横向分组。语言复用原生设置 API，浅色、深色与跟随系统复用 `next-themes`，缩略图复用已有画布偏好。修改即时保存，关闭对话框不撤销已保存的偏好；语言保存失败会显示错误并保持原语言。设置内容按需加载，打开设置或演示编排时不重建背景画布。

路由状态专项为 `tests/renderer/workspace-routing.test.ts` 和 `tests/renderer/workspace-route-views.test.ts`；浏览器交互见 `stories/Settings.stories.tsx` 和 `stories/WorkspaceRoutes.stories.tsx`。后者检查真实 App 的 Canvas DOM 身份、演示往返、文档切换和历史返回。运行 Storybook 浏览器检查时避免多个进程共用同一测试缓存。

## macOS 高刷新率

桌面统一使用 CEF / Chromium，由其管理渲染调度与 GPU 合成；旧的 macOS WebKit 帧率插件已移除。CEF 实际呈现性能需在各平台重新采样。

当前采用站外分发方向，暂不面向 Mac App Store。实际帧率应在对应系统和显示器上测量；React Scan 仍只在开发模式启用。

## 原生边界

新增平台能力先检查 Tauri 官方插件和维护活跃的 Rust 库。`native_request` 只接收已登记的方法；Rust 再验证输入与文件授权。不要向前端暴露任意 SQL、文件系统或命令执行。WebView 之间的权限不能因为共享应用进程而共享。

文档保存、恢复、解锁和资源生命周期的测试必须使用真实 SQLite / SQLCipher。系统文件选择器可在独立 E2E 构建中替代为指定测试路径；不能模拟文件格式、加密或原生资源读取结果。测试与正式应用使用不同应用标识，禁止删除真实用户数据。

修改后运行相关 Vitest / Rust 测试，以及格式、lint、typecheck 和构建。涉及平台 API 时补充对应原生验证，并在交付中区分编译、模拟器运行、真机及签名发布的结果。

原生库准备与 codec 边界见 [原生图片库](native-libraries.md)，旧测试到 Rust / 原生 UI 的对应见 [测试迁移](testing-migration.md)。

## 后端模块与依赖注入

`src-tauri/src/application` 是原生服务的装配入口，使用 FluxDI 2.0.0 的 `static_module!` 声明类型化依赖图。存储、文档、AI/MCP、媒体和平台按职责维护 Module；缺失依赖、循环及工厂类型由宏检查。启用 `thread-safe`、`async-factory`、`lifecycle`、`macros`，共享句柄使用 `Arc`。

`StorageServices` 提供本机元数据库与加密资源暂存库；`DocumentServices` 导入存储服务并提供文档连接池及会话；`IntegrationServices` 提供 AI 与 MCP；`CoreServices` 汇总这些服务，`BackendServices` 将这个类型化容器注入 `AppState::from_container`，再装配媒体服务。Tauri 继续挂载类型明确的 service；`AppState` 构造函数不再接收逐项服务参数。所有生命周期钩子使用同一个最外层依赖图及其共享上下文，避免导入模块时重复创建数据库或队列。业务方法接收类型明确的依赖，不从全局容器查找服务。

FluxDI `Application` 按平台、存储、文档、集成、媒体的顺序异步启动，正常退出及启动失败清理按相反顺序执行。资源初始化失败须在工厂内关闭尚未交给生命周期管理的资源。文件与资源关闭流程不使用会中断清理的超时；保存任务、SQLx 连接和临时文件继续由原生任务持有，直至关闭完成。

Tauri 命令使用服务访问租约。退出先撤销媒体访问、取消 AI/MCP，再等待已进入的命令结束，随后清理会话、关闭文档连接池和本机数据库。启动任务由共享 future 持有，调用者取消不会中断原生初始化；启动页退出和主窗口销毁也等待初始化与清理。启动失败时不发布半初始化的 Tauri 状态，重试创建新的服务图。

文档连接池注册表由注入的 `DocumentStore` 持有；同一应用中的 Tab 通过共享实例及规范路径复用连接池。`DocumentStore::clone()` 共享注册表，`DocumentStore::new()` 创建独立服务，关闭一个实例不会永久关闭其他实例或阻止启动重试。

## 自动保存

`useFileLifecycle` 启动按 Tab 管理的自动保存。已有路径的文档通过 RxJS 合并连续编辑并串行写入；后台 Tab 不需要切为当前文档。保存快照投影当前文本草稿，不提交编辑历史、不改变 Lexical 选区或输入法状态。保存完成只更新该 Tab 的对应基线，保存期间的新修改继续保持未保存状态。重新打开或拖入文档前，等待已有路径队列中的写入和释放操作结束，避免旧关闭操作撤销新资源会话。删除旧恢复文件时，只有当前资源来源仍指向该旧路径才清理登记；资源扫描隔离单个不可读来源，不阻断其他已授权文档。

手动保存、另存为、密码变更、版本读取和文档释放共用按路径的写入队列。失败保留未保存状态与错误提示，并在服务仍可用时重试。`path === null` 的新建、导入或恢复副本不进入自动保存，也不进入新的工作区恢复快照；关闭或重载后丢失，需通过手动保存选择路径。媒体暂存仍使用原生加密临时资源库，退出时清理。

## 文档导出

统一导出入口使用 `src/shared/documentExports.ts`，原生命令位于 `platform/export_commands.rs`，范围选择、文档编码和任务管理位于 `document_exports`。前端先等待原生编辑队列完成，再准备所选内容和几何；Rust 重新校验工作簿、范围及格式组合。完整导图由原生场景服务生成 2D SVG，不受当前视口裁剪。

- 格式：PNG、JPEG、无损 WebP、SVG、PDF、PPTX、DOCX、HTML、Markdown、OPML、TXT、XMind、CSV、JSON。
- 范围：`current`、`all`、`sheets`、`topics`、`branch`。选区限一张 Sheet，可包含主题与笔迹；`branch` 包含主题后代。输出副本移除未选资源和失效引用，不改原工作簿。
- 内容：`map` 为完整 2D 导图；`presentation` 为演示页面，支持图片、PDF、HTML 和 PPTX，PPTX 必须选择演示页面；`view` 为当前 3D 原生 WebView 截图，只支持 PNG、JPEG、WebP 和 PDF。截图中的文字与图形保持栅格形式，移动端暂不支持当前视角截图。

PNG、JPEG 和 WebP 使用 `resvg` / `image` 栅格化与编码；JPEG 默认质量为 92，透明区域填白。SVG 保持矢量，字体取决于查看设备。位图自动质量从 2× 开始，适配单边 16384 px、总计 4000 万像素上限；手动比例超限报错。多页图片（含 SVG）打包 ZIP，页面按序号和清理后的标题命名。

PDF 使用 `svg2pdf` / `pdf-writer` 从 SVG 生成矢量内容，原生字体库发现系统字体；不能据此承诺所有字体在其他设备上外观一致。纸张支持自动尺寸、A4、A3、Letter，方向支持自动、纵向、横向；默认边距 12 mm，可设 0–50 mm。固定纸张可分页，自动尺寸保持一张源场景一页；总页数最多 128 页。PPTX 复用演示场景，生成 16:9 可编辑文字、形状、图片和讲稿；DOCX 按主题层级输出标题、备注、链接和图片。HTML 内嵌 SVG 图形及转义后的正文并限制脚本和外部资源；CSV 输出主题表格并中和公式前缀；JSON 使用 `brainstorming.export` / `version: 1` 包装交换工作簿，不是原生存储文件。

导出任务最多登记 4 个，渲染按有界队列执行。阶段为排队、准备、渲染、选择位置、编码、写入和完成，阶段进度不是精确百分比；取消和窗口关闭会取消对应任务。场景总量最多 64 MiB，成品最多 128 MiB。原生服务拒绝脚本、外部资源和非法尺寸，写入前验证扩展名，并检查所有窗口打开的源路径及文件身份（含硬链接），禁止覆盖正在编辑的原生导图。文件通过同目录临时文件完成写入后原子替换；完成后的打开或定位仅接受本窗口成功导出的授权路径。导出不更新正式保存路径或保存基线。

## 多窗口与原生菜单

`runtime/windows.rs` 为每个编辑窗口维护独立的文件授权、密码会话、搜索索引与 MCP 状态，并统一登记工作簿及路径归属；最多 16 个窗口、合计 32 份文档。同一工作簿只允许一个窗口编辑，已打开路径再次打开时聚焦原窗口与文档；另存为也不能占用其他标签或窗口已登记的目标。

`runtime/window_transfer.rs` 与前端 `state/windowTransfers.ts` 完成移交：源窗口提交草稿并等待编辑队列，停止播放，携带文档会话、焦点历史、二维/三维视口和镜头距离交给目标。原生历史继续复用同一工作簿，资源授权、密码和文件保留引用在目标确认后转移，源标签随后移除。移交期间暂停该文档编辑；45 秒内未确认或窗口关闭时撤销待接收请求，源窗口仍保留文档。无路径文档移交只转移内存会话，不触发自动保存。

`platform/menu*.rs` 按窗口保存 `hasDocument`、`busy`、`playing` 上下文，只用聚焦窗口的状态构建原生菜单，并将类型化 `MenuActionEvent` 定向发给该窗口。macOS 提供应用、文件、编辑、视图、演示、窗口与帮助菜单；窗口列表支持聚焦和移交，标准文字剪贴操作使用系统菜单项。语言切换及窗口焦点变化会刷新菜单。仅 macOS 挂载原生菜单；Windows 和 Linux 不挂载原生菜单栏，操作通过自定义标题栏、应用内菜单和快捷键提供；原生 E2E 对 Windows 和 Linux 断言菜单为空。标题栏左侧下拉菜单提供窗口列表与最近文件；窗口切换通过生成的 `focusEditorWindow` 命令验证调用窗口和目标窗口。最近文件在本机 SQLite 中按最近使用顺序保留 10 条，更新采用写事务合并，避免窗口之间覆盖历史，重启后继续保留。实现与测试入口存在不代表 Windows / Linux 原生验收已完成，也不代表已在 Office 应用中打开验证导出文件。

## 系统文件预览的平台状态

文件内 PNG 的协议、摘要与权限边界见 [单文件协议](file-format.md#文件内系统预览)。`src/lib/documentPreviews.ts` 在成功保存后排队，从预览 SVG 场景生成有界 PNG；图片过大时最多尝试 1600、1024、640 和按每张图片预算计算的较小尺寸。预览仍使用前端 PNG 编码，与导出对话框的原生编码分开。

| 平台 / 分发方式 | 当前实现                                                                 | 验证边界                                                                      |
| --------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| macOS           | `QLThumbnailProvider` 与 `QLPreviewingController` 扩展；后者可切换 Sheet | Swift 编译、只读数据检查和隔离测试包的 ad-hoc 签名校验通过；Finder 加载未验收 |
| Linux deb / rpm | 只读 `brainstorming-thumbnailer`、MIME 与 `.thumbnailer` 包装            | 已实现，尚未在 Linux 文件管理器运行验收                                       |
| Linux AppImage  | 不注册宿主系统的缩略图提供程序                                           | 无宿主桌面集成                                                                |
| Windows         | 文件内可保存预览 PNG                                                     | Explorer 缩略图和预览处理程序未实现                                           |

`pnpm build:desktop` 在 macOS 先构建扩展，再通过 `bundle.macOS.files` 放入应用的 `Contents/PlugIns`，供后续宿主签名与打包。正式分发需要相应签名和公证。本机没有可用签名身份；隔离 ad-hoc 测试包的扩展添加命令返回成功，但查询未发现提供程序，缩略图请求超时且没有输出。因此不能将编译和签名校验视为 Finder 验收通过，也不能据此确定未加载的唯一原因。

Linux 构建脚本将 helper、MIME 和缩略图描述安装项加入 deb / rpm 包；构建过程不修改开发机的系统注册。AppImage 内的私有文件不能代替宿主桌面注册。Windows 后续需要独立实现并验证 Shell 处理程序及安装器注册。

## 内容模板与关联线

内容模板位于 `src-tauri/templates`：版本化 `manifest.json` 和 14 份静态 JSON 通过 `src-tauri/src/templates.rs` 编译进后端。`listTemplates` 返回目录及每份模板的语义图标名称，前端映射为内置 Lucide 图标，并按需通过 `getTemplate` 请求正文，并使用 TanStack Query 缓存；请求只接受固定模板 ID，不解释为路径。后端校验目录与正文一致性，前端再次校验结构，创建时生成新的主题 ID。新建文档、新增 Sheet 和替换模板复用同一目录；「不使用预设」直接创建中心主题，不请求模板正文。

关联线复用 `src/shared/relation-geometry.ts` 计算直线、曲线与直角折线，画布和 SVG 导出共享路径及标签位置。选中后可拖动曲线控制点、折线路径点与标签，也可将端点重新连接到其他主题；拖动只更新临时预览，完成后一次命令提交，取消不写历史。序列化字段与原生校验见 [单文件协议](file-format.md#主题表现笔迹与演示页面)。

## 原生缓存

计算服务通过 serde_json 流式序列化、标准库 32 KiB BufWriter 和 RustCrypto `digest-io` 计算 SHA-256 缓存键，不再先分配整份 JSON 字节。字节上限仍为 64 MiB，按实际 JSON 编码长度计数，超限立即停止；摘要与原实现保持一致。计算仍运行于有界工作任务中，未改变取消规则和缓存键所含字段；边界与摘要回归位于 `src-tauri/src/compute/cache_key_tests.rs`。

图片导入使用 Moka `future` 缓存已完成的派生元数据，每个 Importer 最多 256 项，TTL 为 30 分钟。缓存键由原图 SHA-256、管线版本与固定处理参数组成。命中会跳过 libvips 重复生成，仍读取原文件并校验内容、取消和文件变化，重新生成资源身份与授权。缓存不保存原始字节、临时文件、密码或失败结果；修改 libvips 参数时同步更新参数签名或管线版本。

Tauri 的 `src-tauri/gen/schemas` 是按当前构建 feature 生成的权限 schema，由 CLI 重新生成，不提交到 Git。

开发编译的最后一个 Rust 任务同时生成平台所需的库，Cargo 进度条可能较久不变。`profile.dev.debug = "line-tables-only"` 使用官方行号调试信息，减少完整类型符号和静态归档的磁盘写入，保留文件与行号堆栈。首次修改 profile 会重新编译依赖；需要变量级原生调试时可临时设置 `CARGO_PROFILE_DEV_DEBUG=full`。不通过清空 `target` 处理正常编译等待。

macOS `build:desktop --debug`（未指定证书）或显式 `APPLE_SIGNING_IDENTITY=-` 的本地预览包会叠加 `tauri.preview.conf.json`，由 Tauri 完成 [ad-hoc 签名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)。此预览配置不启用 Hardened Runtime：ad-hoc 主程序和 libvips 均没有 Team ID，无法通过其[同团队动态库校验](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.disable-library-validation)。正式分发不使用此预览配置，需配置 Developer ID 和公证；默认发布配置仍保留 Hardened Runtime。

## 数据库迁移

数据访问使用 SQLx / SQLCipher；`libsqlite3-sys` 使用 SQLx 稳定版支持的兼容版本并启用 SQLCipher，Rust 应用后端不能另外链接普通 SQLite；独立 Quick Look 扩展使用系统 SQLite3，只读未加密文件的预览表。根目录 `.cargo/config.toml` 在编译 SQLCipher 时固定 `SQLITE_MAX_LENGTH=134217728`，使初次连接读取不可信 schema 前就有长度上限；连接认证仍设置同样的运行时限制。每条连接在读取数据库前完成 key pragma，关闭 SQL 日志，验证 SQLCipher 和数据库可读性。

文档迁移放在 `src-tauri/src/document/migrations`，本机设置迁移放在 `src-tauri/src/storage/migrations`。两组使用独立 Migrator；执行入口是应用内配置好的 Migrator，不对用户文件执行默认 CLI 迁移。履历表均为 `_brainstorming_migrations`，由 SQLx 维护版本与校验和。不要手写履历 INSERT，也不要运行用户文件内的 SQL。

新变更追加有序编号 SQL，例如 `002_add_topic_index.sql`；不修改已发布的迁移。迁移编号独立于文件协议的 `application_id` / `user_version`。Cargo build.rs 追踪两个迁移目录，新增文件会重新嵌入。迁移或校验失败必须保留原文件，相关测试使用真实 SQLCipher 和有界资源。

### 暖白与石墨界面

主操作和选中态采用石墨 / 暖白反色，默认导图中心为石墨色，界面不使用紫色选中底色；紫色仍可作为用户的导图配色。界面沿用浅色、深色与跟随系统，使用 `src/styles/ui.css` 的语义变量统一标题栏、Dock、属性栏、启动页和演示页。默认导图的画布与派生节点底色跟随界面外观；其他导图预设、自定义背景和显式节点颜色保持文档设置。外观投影不写入工作簿、撤销记录或导出颜色。

三个桌面平台共用 44px 标题栏，常用操作按钮保持 32px 高度；macOS 保留原生交通灯，Windows、Linux 使用右侧窗口操作区。大纲和属性栏宽度由 `src/shared/workbench.ts` 统一维护。

属性折叠复用官方 shadcn Accordion，由固定版本 `shadcn@4.22.0` CLI 下载；上层 `PropertySection` 组合样式并保留折叠内容的编辑器 DOM，不修改下载源码。

### 原生验收输出与构建存储

原生 E2E 截图、窗口指标和失败页面统一写入 `test-results/native`，可通过 `BRAINSTORMING_E2E_ARTIFACTS` 指定输出目录，适用于 macOS、Windows、Linux。诊断采集失败仍保留原始测试失败。每次更换测试二进制前，先退出上一次独立 E2E 应用，避免单实例插件将新启动转交给旧进程；不得关闭用户正在使用的正式应用。测试复用同一构建的单实例窗口时，使用现有 `home()` 流程重置 renderer，不假定启动后总处于首页。刷新前先聚焦原生窗口，再等待新的页面和可用工作区。重置前记录并清空未消费的文件选择器 fixture；隔离 E2E 构建遇到缺失或类型不符的 fixture 会明确失败，不回退到真实系统选择器。创建与编辑操作同时等待当前路由和可用控件，保存等待目标路径成为已保存基线。

Lexical 内容输入通过 `fillContentEditable` 使用 WebDriver 全选后插入文本；不调用 embedded 驱动的 `clearElement`，该实现会直接清空 `innerHTML`，绕过编辑器状态更新。测试的 `home()` 会清理隔离实例的恢复记录；恢复功能本身仍由专用保存、重载和解锁用例验证。

外部存储发生归档写入或依赖读取停滞时，先检查进程与文件活动；可使用本机 SSD 用户缓存目录保存 Cargo 产物（`CARGO_TARGET_DIR`），避免运行中的验收程序被临时目录清理移除，并将 `BRAINSTORMING_E2E_BINARY` 指向该目录生成的当前测试应用。若依赖缓存也在外部卷，使用当前源码的本机临时验收副本和独立 pnpm 缓存；必须按锁文件安装并完整构建，不能混用旧二进制与新 renderer。

## 二维密集连线与 GPU 拖动

GPU 连线实验默认关闭；构建时设置 `VITE_DENSE_EDGE_GPU=1` 才启用。此前 Linux 系统 WebView 的采样比 SVG 慢，当前仍默认仅采用几何复用优化；CEF 性能尚未重新采样。启用后，至少 250 条结构连线且均符合现有不透明普通曲线/直线样式契约时，拖动期间使用按需加载的 PixiJS 8 WebGL RenderGroup。节点文字、命中与编辑仍由 React Flow / Lexical 管理；关联线沿用原有交互。平移、缩放与空闲显示使用 SVG，视口稳定 200ms 后通过 ahooks 预热下一次拖动的 GPU 缓冲，不启动持续绘制的 ticker。路由、折点、手绘及不满足批处理契约的样式继续使用 SVG。

整体刚性平移时复用端点和路径，将位移交给场景变换；节点集合、尺寸、端口或内容变化时重新计算几何。GPU 只持有当前场景可见曲线，模型不变的路径保留几何缓冲；画布卸载时释放曲线和 WebGL 上下文。GPU 首帧提交后才切换可见层，初始化失败或上下文丢失时保留 SVG。使用 `pixi.js/unsafe-eval` 的官方静态 shader/uniform 同步实现兼容严格 CSP，不添加 CSP 的 `unsafe-eval` 授权。

原生性能对照复用 `tests/native/canvas-performance.spec.ts`：千节点导图、三次根节点拖动，每次先通过适应画布按钮复位，等待动画停止后再居中，记录实际倍率并要求三次一致；每次 60 个输入、61 个动画帧间隔，同时验证实际连线位置、保存和单次撤销。使用启用了 `VITE_DENSE_EDGE_GPU=1` 的完整 E2E 二进制时，测试可设置 `BRAINSTORMING_EXPECT_GPU=1`，要求 GPU 预热完成、拖动期间实际提交 WebGL 帧，并记录窗口尺寸、像素比例与渲染路径。同版本 SVG 对照可设置 `BRAINSTORMING_GPU_REFERENCE=1`，在 GPU 首帧就绪后通过 `WEBGL_lose_context` 触发实际上下文丢失，要求 SVG 回退可见且拖动确实使用 SVG；不再依赖覆盖 `getContext` 原型来模拟不可用。默认构建的原生测试可用 `BRAINSTORMING_EXPECT_SVG=1` 要求实际 SVG 路径。真实鼠标 GPU 验证先以 `VITE_DENSE_EDGE_GPU=1 pnpm build-storybook` 构建，再运行 `BRAINSTORMING_EXPECT_GPU=1 pnpm test:canvas --grep "thousand-topic root translation"`，覆盖拖动、取消、撤销与上下文丢失。该用例使用合成 WebView 输入，衡量更新吞吐，不代表物理屏幕呈现帧率。比较时应保持窗口、倍率与构建方式一致，保留失败和受环境干扰的批次。

## Linux 打包

复用 `scripts/build-desktop.ts` 与 Tauri bundler，`pnpm package:linux` 生成 deb、rpm、AppImage；`pnpm package --bundles deb`、`--bundles rpm` 或 `--bundles appimage` 可单独选择格式，追加 `--debug` 可生成本机调试包。Linux 平台配置由 Tauri 自动合并 `src-tauri/tauri.linux.conf.json`，不影响其他平台。桌面主程序和缩略图 helper 使用相同架构与 debug/release 配置，生成的安装映射只位于忽略的 target 目录。

Ubuntu 24.04 / Debian 13 构建机需先安装系统依赖（需要 sudo）：

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config cmake ninja-build libgtk-4-dev zenity xdg-desktop-portal libxdo-dev libssl-dev librsvg2-dev libvips-dev patchelf
pnpm install --frozen-lockfile
pnpm package:linux
```

桌面运行库由 CEF 随包分发，不再依赖 WebKitGTK；Tauri 自动收集 GTK4 / CEF 的平台依赖。libvips 要求至少 8.15；deb / rpm 声明 GTK4、XDG Desktop Portal、Zenity 和对应 libvips 运行依赖；Portal 后端由宿主桌面提供，Linux 消息确认复用上游 Zenity 后端。AppImage 也需要宿主提供 Portal / Zenity。CEF 自带浏览器媒体运行库，移除旧 WebKitGTK 的 GStreamer 打包开关；实际音视频格式支持、AppImage 及 libvips 编解码器仍需在目标发行版验证。deb/rpm 同时包含只读缩略图 helper、MIME 与 thumbnailer 描述；AppImage 不安装宿主缩略图提供程序。

默认输出为 `src-tauri/target/release/bundle/deb/*.deb`、`rpm/*.rpm`、`appimage/*.AppImage`，debug 使用 `target/debug/bundle/`；设置 `CARGO_TARGET_DIR` 或目标架构时路径相应变化。可用 `dpkg-deb --info`、`dpkg-deb --contents` 检查 deb 的运行依赖和桌面集成文件，安装需由用户在目标系统使用 apt/dnf 执行。

`.github/workflows/linux-packages.yml` 在 Ubuntu 24.04 x86_64 构建三种格式，限时 45 分钟，产物通过 Actions 的 `brainstorming-linux-x86_64` artifact 下载，不自动发布或安装。正式分发以该构建环境为基线，不承诺更老的 glibc 系统可运行；本机 Debian 13 产物只用于本机验证。遵循 [Tauri Linux 分发兼容要求](https://v2.tauri.app/distribute/appimage/#limitations)，ARM AppImage 必须在对应架构的 Linux 主机或模拟器构建，不能仅传 `--target` 完成跨架构打包。

## React 开发诊断

React Scan 默认在开发模式启用，显示重渲染和 FPS；可设置 `VITE_REACT_SCAN=false` 关闭。需要组件树或 Profiler 时，先运行 `pnpm devtools`，再在另一个终端运行 `VITE_REACT_DEVTOOLS=true pnpm dev`。官方 React DevTools standalone 监听 `127.0.0.1:8097`，后端 hook 先于 React 与 Scan 初始化。工具未连接不阻止编辑器启动。

DevTools CLI 自身使用 Electron，仅作为开发依赖，产品运行时仍为 Tauri。只有开发 CSP 允许该本机 WebSocket，生产 CSP 与发布入口不加载诊断代码。默认不启用远程诊断；不要把本机调试端口转发到外部网络。React DevTools 上游仅发布 Flow API，`src/dev/react-devtools-core.d.ts` 声明项目实际使用的最小接口。

Tauri 核心、CLI、官方插件和 CEF runtime 固定到已发布的兼容 alpha 版本。原 `tauri-specta 2` 不支持 Tauri 3，绑定改用已发布的 `tauri3-specta 0.1.0-alpha.3`，配套 Specta `2.0.0-rc.27` 与 TypeScript 导出器 `0.0.14`；保持位置参数与 Rust Result 的拒绝语义。该适配器为 MIT 许可的独立社区 alpha 包，版本由 Cargo.lock 固定。SQLite 底层库仍受 SQLx 0.9 的 `<0.38` 约束，保持 0.37.0；`svg2pdf 0.13` 与 PDF 合并代码共用 `pdf-writer 0.12.1` 的类型。

原生截图统一通过 CEF 进程内 CDP 完成，不开放远程调试 TCP 端口。E2E feature 中的指针与滚轮适配也改用 CEF 输入接口，继续验证独立应用标识、页面、窗口、前台与视口；驱动接入和真实输入回归尚未验证。性能采样脚本仅在开始时请求一次焦点，拖动期间只观察焦点变化；CEF 驱动就绪后再恢复采样。

## React Flow 交互参考

画板工具参考 [官方白板指南](https://reactflow.dev/learn/advanced-use/whiteboard)，沿用 React Flow 坐标转换和视口，笔迹复用 perfect-freehand。画笔输入层高于 React Flow renderer；擦除模式让已绘笔迹直接接收输入，并禁用节点拖动和画布拖动。选择模式恢复正常导图操作。笔迹使用独立 React Flow 节点，复用官方 [NodeResizer](https://reactflow.dev/api-reference/components/node-resizer)、框选和组拖动；原始采样不在缩放过程中重写。混合选区只平移，不改变主题父级；主题与笔迹通过同一批量命令提交，预览、选择和取消不进入历史。真实鼠标回归位于 `tests/canvas/ink-editing.spec.ts`。

演示参考 [官方幻灯片教程](https://reactflow.dev/learn/tutorials/slide-shows-with-react-flow) 的内容与导航状态分离、键盘导航和有限目标聚焦思路。当前产品保留已确认的页面编排、观众与演讲者视图；播放不改变底层导图布局，也不为每页复制整张导图。

## 全局命令与内容索引

命令面板组合官方 shadcn Command / Dialog 和 cmdk，使用 ⌘/Ctrl+Shift+P 打开；编辑快捷键在面板打开时暂停。操作复用既有文件、历史与视口命令。异步内容查询由 TanStack Query 管理，输入经 ahooks 防抖，关闭面板取消过期结果。结果以普通文本呈现，不执行备注中的 HTML。

`state/contentIndexSync.ts` 监听文档会话与已提交工作簿，复用 lodash 防抖，并通过串行队列同步发生变化的文档；查询前等待同步完成。选区、编辑草稿与拖动预览不建立索引。定位只接受仍存在于当前打开会话的文档、Sheet 和主题，复用现有查找定位与视口入口。

Rust 的 `search` 模块通过 FluxDI 装配到 AppState。索引复用 SQLx 和现有 SQLite FTS5：三字及以上词使用 trigram 全文索引，一至两字使用同一内存库中的受限文本匹配，多词按 AND 匹配，标题优先。所有输入使用绑定参数，FTS 操作符按字面文本处理。同步在事务内替换或移除文档，非法批次不改变现有索引。

索引只存已打开且解锁文档的标题、Sheet 名、主题标题与备注；不含资源二进制、文件路径或密码，不创建明文磁盘索引。单进程最多保留 32 份文档、100000 个主题、128 MiB 原始文本，单工作簿最多 20000 个主题；超过限制返回可见错误。重载或关闭会话清除索引，应用退出关闭连接池。此索引无需文件格式迁移。

`tests/native/content-search.spec.ts` 使用真实 Rust IPC 和 SQLite 索引验收跨文档、跨 Sheet 定位、未保存内容更新和关闭清理；前端同步竞态与取消由 renderer 测试覆盖。

## 桌面插件

插件统一由 `src-tauri/src/platform/plugins.rs` 注册。已接入官方 clipboard-manager、fs、single-instance，本轮补充 log `2.10.1`、notification `2.7.0`、window-state `2.5.0`；版本以 Cargo.lock 为准。所有插件从 Rust 侧使用，renderer 继续调用类型明确的 `native_request`，不增加通用文件读写、任意通知或前端日志权限。

- `single-instance` 首先注册，后续启动继续将文件交给已有窗口；主窗口隐藏时不抢先显示，由 `startupReady` 完成启动交接。 交接先关闭启动页，再显示并聚焦原生窗口和 WebView；原生启动验收同时检查窗口焦点与 `document.hasFocus()`。
- `window-state` 仅管理主窗口。自动恢复尺寸与位置；最大化在 `startupReady` 恢复一次，正常关闭前通过官方接口保存三项状态。不恢复显隐、全屏、窗口装饰，不追踪启动页或远程预览。E2E 关闭窗口状态持久化，避免修改本机窗口偏好。
- `log` 是唯一日志后端，现有 tracing 调用通过官方 `log` 功能转发一次。默认 Warn 级别，只接受本应用 target，输出 stderr 和系统应用日志目录。单文件上限 1 MiB，保留 3 个归档；生命周期错误使用固定文案，避免把底层异常中的内容、路径、URL 或密钥写入日志。不订阅 WebView console。E2E 不写日志文件。
- `notification` 由 FluxDI 管理的 NotificationService 调用，只在 `exportFile` 或 `exportImage` 完成原生写入后发送固定的中英文提示。取消、失败和自动保存不发送；发送失败不改变导出结果，后台发送受容量与时限约束。权限仅由设置中的显式启用动作申请，被拒绝或服务不可用时保留可读状态。桌面插件返回 Granted 并不能证明系统实际展示了通知，仍受通知中心设置、免打扰和打包环境影响。

通知偏好保存在现有 SQLx 本机库，新增 `002_notifications.sql`，不改变导图文件格式。未额外引入 Store，避免形成第二套原生偏好存储；也未引入 Persisted Scope：该插件恢复的是 Tauri fs/asset scope，不会替代当前 Rust 会话的文档、资源与密码授权。

剪贴板仍用成熟的 clipboard-rs 保留应用自定义 MIME 与纯文本的同次写入；官方剪贴板插件不能单独替代主题树的自定义格式。文件系统插件保持可用，文档事务与分块资源继续由 SQLx、tokio 和现有授权服务管理。

参考：[通知](https://v2.tauri.app/zh-cn/plugin/notification/)、[日志](https://v2.tauri.app/zh-cn/plugin/logging/)、[窗口状态](https://v2.tauri.app/zh-cn/plugin/window-state/)、[持久化作用域](https://v2.tauri.app/zh-cn/plugin/persisted-scope/)、[Store](https://v2.tauri.app/zh-cn/plugin/store/)。

## 内置贴图与插画

素材 IPC 仅提供 `listBuiltinArt` 与固定 ID 的 `getBuiltinArt`，不接受路径或远程 URL。目录内嵌于 `src-tauri/src/builtin_art/catalog.json`；4 张原创 PNG 及生成记录位于 `src-tauri/builtin-art/originals/`，原图逐字节保留，128px 预览由 Rust image 管线生成。54 个精选 Fluent Emoji Flat SVG 来自 Iconify 1.2.6 / Microsoft，MIT 全文编译入目录，并保留在素材目录。

原生 SVG 渲染使用现有 resvg，在 `spawn_blocking` 内分配图片，以 `Semaphore(2)` 限制并发，Moka 按 ID 合并并缓存成功结果（最多 58 项，空闲 1 小时过期）。插入复用 `setTopicImage` 和现有资源保存协议；异步完成前切换文档、Sheet 或删除目标主题会丢弃结果。相关验证为 `tests/renderer/builtin-art.test.ts`、`src-tauri/tests/document_builtin_art.rs` 及 `stories/BuiltinArt.stories.tsx`。

画布右键菜单复用官方 shadcn Context Menu（`shadcn@4.22.0` CLI 下载），操作通过业务组合接入既有命令和历史；下载源码不维护业务补丁。

快捷键通过类型化注册表统一定义可配置操作，Zustand persist 保存本机覆盖值；`null` 表示禁用，删除覆盖值表示恢复默认。加载时过滤损坏、冲突与保留绑定；Lexical 与全局监听共用实际绑定，编辑和 IME 优先。主题宽度使用 React Flow `NodeResizeControl`，中间预览不写历史；概要主题使用原有主题命令，范围手柄仅衔接成员选择与单次命令。文件字段约束见 [文件协议](file-format.md#主题表现笔迹与演示页面)。
