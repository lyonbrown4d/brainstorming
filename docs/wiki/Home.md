# Brainstorming 项目 Wiki

Brainstorming 是本地优先的桌面思维导图应用，使用 React Flow、Electron、Vite、Moon、TypeScript 和 shadcn/ui。当前版本为 V0.1，项目采用单 package。

功能包含多文档标签、多 Sheet、多种布局、二维与三维编辑、大纲、撤销重做、备注/图片/附件和自动恢复。本机语言、最近文件和恢复索引使用 SQLite，文档使用 `.brainstorming` ZIP 原生格式保存，支持现代和旧版 `.xmind` 导入；当前不提供云端协作或账户。

权威正文维护在代码仓库，Wiki 只提供导航，避免两份说明分别修改：

- [开发与使用入口](https://github.com/lyonbrown4d/brainstorming/blob/main/README.md)
- [产品范围](https://github.com/lyonbrown4d/brainstorming/blob/main/product.md)
- [模块边界、编辑流程和文件协议](https://github.com/lyonbrown4d/brainstorming/blob/main/docs/architecture.md)
- [运行、配置、测试、打包和故障排查](https://github.com/lyonbrown4d/brainstorming/blob/main/docs/development.md)
- [原生文件格式与 XMind 导入](https://github.com/lyonbrown4d/brainstorming/blob/main/docs/file-format.md)
- [后续计划](https://github.com/lyonbrown4d/brainstorming/blob/main/roadmap.md)

维护职责由仓库维护者承担，暂未设独立运维团队。当前在 `main` 迭代。正式分发仍需应用签名与公证。
