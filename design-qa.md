# 暖白与石墨界面验收

## 结果与范围

final result: passed

本结果覆盖中性主题的视觉检查及 macOS 原生回归。Windows、Linux 已通过组件级场景，尚未完成对应系统的原生验收。

用户指出上一版仍以紫色为主。本轮将应用主操作、选中底色和焦点统一为石墨 / 暖白，并把默认 Brainstorming 导图中心改为石墨色。导图其他预设、自定义背景和显式节点颜色仍由文档决定。

## 对照证据

- 原始设计板：[reference.png](docs/design/warm-white-graphite/reference.png)，1568 × 1003 像素。
- 当前 macOS 二维浅色：[mac-light.jpg](docs/design/warm-white-graphite/native/mac-light.jpg)。
- 当前 macOS 二维深色：[mac-dark.jpg](docs/design/warm-white-graphite/native/mac-dark.jpg)。
- 当前 macOS 三维浅色：[mac-3d-light.jpg](docs/design/warm-white-graphite/native/mac-3d-light.jpg)。
- 当前 macOS 三维深色：[mac-3d-dark.jpg](docs/design/warm-white-graphite/native/mac-3d-dark.jpg)。
- 原生标题栏测量：[mac-chrome.json](docs/design/warm-white-graphite/native/mac-chrome.json)。

以上当前截图来自本轮源码构建的独立 Tauri E2E 应用，采用系统窗口截图，CSS 视口 1440 × 900、DPR 2，图像为 2880 × 1800。参考板与当前二维浅色、深色截图放在同一比较输入中检查，按 CSS 密度与组件关系比较，不以包含多个缩略窗口的生成板作逐像素断言。生成板里的紫色强调由用户本轮反馈明确替换。

二维截图使用 13 个主题的产品规划文档、右侧主题属性打开、Dock 收起；浅色选中中心主题，深色选中编辑体验。三维截图关闭属性栏并展示相同主题树。状态差异属于主动操作，没有合成或修改截图。左上角紫色共享提示和带光晕的指针属于系统截图环境，不是应用控件。旧目录中的 windows-light、windows-dark、3d-light、3d-dark 图片保留为上一轮历史证据，不代表当前配色。

## 发现与处理

- 色彩：浅色画布 #F7F7F2、面板 #FFFFFF、主操作 #3B3E45、选中底色 #ECEBE6；深色画布 #1C1E22、面板 #25282D、主操作 #E8E6DF、选中底色 #34373E。默认中心 #41464F，默认分支保留珊瑚、青绿、暖黄及蓝色。三维光照与关联线兜底色同步移除紫色偏色。
- 层级：保留系统字体、56px 标题栏、272px 属性栏和横向 Tabs。正文、节点标题和属性字段可读；画布适应后没有节点被属性栏遮挡。浮动工具入口和底部 Sheet 保持原交互。
- 原生窗口：AppKit 实测三个交通灯中心 Y 为 26pt，标题栏中心 Y 为 28px，差值 2；关闭、最小化、缩放均可见且可用。最右交通灯到内容起点留有 32pt 空间，未因颜色修改改变窗口几何。
- 品牌和内容：沿用现有 Logo、Lucide 图标和真实功能名称，没有新增口号。shadcn 下载源码保持官方实现。
- 测试隔离：首次完整回归中 9 项通过、1 项因单实例复用编辑页而等待首页失败。主题用例改用既有 home() 重置流程，随后 10 项全部通过。
- 测试输出：截图、HTML 和窗口指标由公共辅助函数写入可配置目录，取消仅适用于 macOS 的临时目录假设。诊断失败不会覆盖原始测试失败。
- 截图限制：macOS WebDriver 使用 WKWebView snapshot，三维 CSS3D 文字层在该截图中缺失；DOM 文字、颜色、几何、命中及编辑断言正常。额外使用系统窗口截图核对了完整文字，未为截图差异修改产品渲染逻辑。主题切换中的瞬时帧不作为最终视觉证据。

本轮稳定截图未发现阻止当前主题交付的 P0 / P1 / P2 视觉问题。先前的紫色主导偏差已经修正。

## 自动检查与限制

- 当前源码完整构建并运行官方指南推荐的 embedded WebDriver 链路：macOS 5 个 spec、10 项原生 E2E 全部通过，用时 1 分 10 秒；覆盖启动、窗口快捷键、主题持久化、自动保存、真实 SQLite / SQLCipher、图片附件、剪贴板、多文档、多 Sheet，以及二维 / 三维编辑。
- 627 项单元测试、8 项主题与平台 Storybook 场景、ESLint、TypeScript 通过；最新前端生产构建完成。
- 外部卷构建在静态归档写入处停滞，诊断后停止。使用相同锁文件和当前源码的本机 SSD 临时副本后，Rust 完整构建 3 分 15 秒完成，主题更新增量构建 12 秒完成。主仓库与依赖配置未迁移到临时目录。
- 驱动运行有可恢复的脚本超时和 stale element 重试，最终断言均通过，不能据此宣称无驱动警告。原生系统截图补充视觉证据，不替代自动断言。
- Windows、Linux 仅验证组件标题栏与主题分支，系统窗口、字体栅格和窗口管理器仍需对应环境。没有执行移动端、性能、压力或帧率测试。

## 实现检查表

- [x] 浅色、深色及跟随系统使用统一中性主题。
- [x] 标题栏、属性栏、Dock、文档 Tabs 与缩略图适配。
- [x] 二维与三维默认配色一致，显式文档颜色保留。
- [x] 原始 shadcn 组件保持官方实现，业务差异使用组合。
- [x] 保存参考、当前原生渲染与窗口测量证据。
- [x] 使用完整当前 E2E 构建完成 macOS 原生回归。
- [ ] 在 Windows、Linux 原生环境完成窗口及外观验收。
