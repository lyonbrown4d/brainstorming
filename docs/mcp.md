# MCP 连接

Brainstorming 桌面版在 Electron 主进程内嵌 MCP Server，通过本机 Streamable HTTP 向外部客户端提供当前授权工作簿的读取和编辑草稿能力。服务默认关闭，不需要独立启动脚本，也不要求用户安装 Node.js。此功能与内置 AI 的模型服务配置相互独立。

## 启用与停止

1. 打开或创建工作簿，在画布底部 Dock 打开「MCP 连接」。
2. 按需勾选「允许读取主题备注」及「允许提交编辑草稿，由我确认后应用」。默认均不勾选。
3. 点击「启用本机 MCP 服务」。Brainstorming 绑定 `127.0.0.1` 的空闲端口，生成本次连接的随机访问令牌。
4. 点击「显示连接配置」，将配置交给支持 Streamable HTTP 与自定义请求头的客户端。客户端的配置文件结构以其文档为准。
5. 使用结束后点击「停止 MCP 服务」。再次启用会生成新的端口和令牌，需要更新客户端配置。

示例仅说明配置结构；地址和令牌必须使用界面显示的本次值：

```json
{
  "mcpServers": {
    "brainstorming": {
      "url": "http://127.0.0.1:PORT/mcp",
      "headers": {
        "Authorization": "Bearer SESSION_TOKEN"
      }
    }
  }
}
```

关闭窗口、重新加载 renderer、renderer 崩溃或退出应用会停止服务。重启应用不会自动恢复连接。连接配置只保留在内存，不写入 `.brainstorming`、恢复记录或本机设置；客户端如何保存令牌由客户端决定。

## 共享范围

授权绑定启用时的工作簿 ID，包含该工作簿全部 Sheet 中已经提交的主题标题和层级。正在输入且尚未提交的编辑草稿不属于读取结果。只有勾选备注权限才返回备注；图片、附件、音频、文件路径和文件密码不通过 MCP 提供。

已解锁的加密工作簿也可由用户主动共享，文件加密不会阻止本次已授权的客户端读取。切换到其他工作簿后，旧连接拒绝读取新内容；需停止服务后重新启用。返回首页但仍保留当前工作簿时，共享继续有效。

服务仅监听 IPv4 回环地址。每个请求校验 Bearer 令牌、Host 和 Origin，不接受携带 Origin 的浏览器请求。此连接方式用于本机原生 MCP 客户端，不向局域网开放，也不提供远程 OAuth 登录或 stdio 入口。

## 工具契约

| 工具              | 输入                                                     | 结果                                                                     |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `get_workbook`    | 空对象                                                   | 工作簿名称、当前 Sheet ID、各 Sheet 的 ID、名称、根主题 ID 和 `revision` |
| `read_branch`     | `sheetId`，可选 `topicId`、`offset`、`limit`、`revision` | 按深度优先顺序排列的主题、当前 `revision` 与 `nextOffset`                |
| `propose_edit`    | `sheetId`、`revision`、`summary`、`operations`           | 校验通过后的 `proposalId` 和 `pending` 状态，不立即修改文档              |
| `get_edit_status` | `proposalId`                                             | `pending`、`applied`、`rejected` 或 `stale`                              |

只有启用提交草稿权限时，工具列表才包含 `propose_edit` 和 `get_edit_status`。工具不提供保存文件、打开路径、执行 shell 或直接覆盖文档的能力。

`read_branch` 不传 `topicId` 时读取该 Sheet 的根分支，包含折叠主题的子主题。`limit` 默认 100，最大 200；返回的主题数据超过 256 KiB 时返回错误，需要减少 `limit`。分页请求必须携带上一页的 `revision`，画布变化后应重新从第一页读取。`nextOffset` 为 `null` 表示读取完毕。

`propose_edit` 支持以下有序操作；每份草稿最多 50 项：

```json
{
  "sheetId": "SHEET_ID",
  "revision": "REVISION_FROM_READ",
  "summary": "添加发布准备分支",
  "operations": [
    {
      "type": "addTopic",
      "parentId": "ROOT_TOPIC_ID",
      "id": "new-topic-unique-id",
      "title": "准备发布"
    }
  ]
}
```

| `type`          | 其他字段                                         |
| --------------- | ------------------------------------------------ |
| `addTopic`      | `parentId`、新主题的唯一 `id`、`title`           |
| `renameTopic`   | `topicId`、`title`                               |
| `moveTopic`     | `topicId`、`parentId`、可选的从 0 开始的 `index` |
| `deleteTopic`   | `topicId`；删除该主题及其子树                    |
| `setTopicNotes` | `topicId`、`notes`；空字符串清空备注             |

未授权读取备注时，允许提交草稿仍可提出备注更新；用户在确认界面查看更新后的完整内容。标题最多 200 字符，备注最多 12000 字符，操作还必须满足 core 的主题树及文件大小约束。

## 草稿应用与失败处理

外部客户端提交草稿后，Dock 的 MCP 入口显示待确认数量。用户在「MCP 连接」中查看具体操作，选择确认或拒绝。最多保留 5 份待确认草稿和最近 20 份草稿状态；停止连接会清除草稿。

提交和应用时均通过 core 校验整批命令。循环挂接、删除根主题、重复 ID 等错误不会部分提交。确认时检查工作簿、目标 Sheet 快照与连接是否仍匹配；不匹配则标记为 `stale`，需要客户端重新读取和提交。

确认应用会切换到目标 Sheet，通过现有命令历史提交整批操作，一次撤销恢复整批变化。编辑主题、文件操作或演示期间暂不允许应用。`applied` 表示草稿曾被确认应用，不代表文件已保存；后续用户仍可撤销或继续修改。

连接失败时先确认服务仍在运行、客户端使用当前地址和令牌，且没有通过代理发送请求。401 表示令牌缺失或失效；403 表示 Host 或 Origin 不被允许；413 表示请求超过 128 KiB；429 表示并发请求过多。编辑器请求最多等待 10 秒，最多同时处理 4 个请求。

## 实现与兼容性

协议与生命周期复用官方 `@modelcontextprotocol/server`，Node HTTP 转换、Host 与 Origin 校验复用官方 `@modelcontextprotocol/node`；参数使用现有 Zod 校验。SDK 的 `createMcpHandler` 同时处理新版协议与旧版无状态 Streamable HTTP 请求。旧版 SSE 独立端点和会话恢复不在首版范围内。

主进程只管理服务、连接权限和有界 IPC 请求；renderer 读取当前编辑器快照并预校验草稿，core 保持纯 TypeScript，不依赖 MCP。对应实现位于 `src/main/mcp`、`src/shared/mcp.ts` 与 `src/renderer/src/components/mcp`，协议与业务边界测试位于 `tests/mcp`，真实桌面闭环位于 `tests/desktop/mcp.spec.ts`。

参考：[官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[MCP 传输规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。
