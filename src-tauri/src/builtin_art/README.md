## 内置素材来源

目录包含 4 张原创 AI 透明插画与 54 个 Microsoft Fluent Emoji Flat 图形。原创素材及生成记录位于 `../../builtin-art/originals/`，原始 PNG 按生成输出逐字节保留；128px 缩略图由当前 Rust `image` 0.25.10 管线生成，目录只携带缩略图。

Fluent 图形来自 https://github.com/microsoft/fluentui-emoji ，通过 Iconify `@iconify-json/fluent-emoji-flat` 1.2.6 提取（MIT，完整包解压约 9 MB，当前仅内嵌约 69 KB 精选 SVG 正文）。许可证见 LICENSE-Microsoft.txt，同时编译入目录供应用显示；该 MIT 许可仅适用于 Fluent 素材，不适用于原创 AI 素材。

固定 ID 是唯一读取入口，不接受请求路径或远程 URL；原生 `resvg` 将 Fluent SVG 转成 512px PNG，原创 PNG 原样提供。生成在 `spawn_blocking` 中进行，以 Semaphore(2) 限制并发，Moka 按 ID 合并并缓存成功结果（58 项，空闲 1 小时过期）。图片通过现有 `setTopicImage` 命令随单文件资源保存；一次插入或替换对应一次撤销。
