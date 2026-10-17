# Brainstorming（头脑风暴）更名记录

日期：2026-10-17。

## 统一名称

| 项目                       | 新名称                     |
| -------------------------- | -------------------------- |
| 应用显示名                 | Brainstorming              |
| 中文说明                   | 头脑风暴                   |
| package、Moon、APM 项目名  | brainstorming              |
| GitHub 仓库                | lyonbrown4d/brainstorming  |
| 本地项目目录名             | brainstorming              |
| Electron appId             | app.brainstorming.desktop  |
| 原生文件                   | .brainstorming             |
| 原生 SQLite application ID | `0x42524e53`               |
| 本机 SQLite                | brainstorming-local.sqlite |

主分支仍为 main，保留既有提交历史与保护规则。源码中的文件格式模块、preload 白名单、剪贴板类型、XMind 扩展命名空间、偏好键和文档链接同步更名。

此次不兼容旧格式文件、格式标识、恢复或本机偏好，不提供迁移。旧文件不会被自动改写；仅改文件后缀不能转换格式。

Logo 不在本轮调整范围。已有图形素材保留原貌；更名后的真实打包应用截图见 [首页](design/rename/home.png) 与 [编辑器](design/rename/editor.png)。

## 更名时的历史验证

以下结果对应更名时的 ZIP 实现。当前原生文件已改为 SQLite，不沿用这些结果作为存储改造验收；当前机制见 [文件协议](file-format.md)。

- 新目录下重新安装并构建，Moon 正确解析 brainstorming 项目；打包生成 Brainstorming.app。
- 格式、ESLint、TypeScript 和 84 个文件的 708 项单元测试通过。
- Electron 桌面验收 15 项通过，覆盖启动、窗口、主题、语言、多文档、恢复、剪贴板和加密文件。
- 文件与编辑工作流 17 项全部通过，覆盖 XMind 导入、图片附件、原生保存重开、三维和打包启动。其中一项首次因画布初始动画阻挡双击失败，独立复验通过。
- 更名后从新目录重新打包，原生打包验收再次通过：检查应用名称、独立 SQLite、.brainstorming ZIP 保存与正常退出。
- Storybook 构建通过；窗口、创建页和文档标签交互共 17 项通过。

移除旧目录入口及旧构建、浏览器和 GPU 缓存；用户文档与恢复文件保留，不作迁移。
