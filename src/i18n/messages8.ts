export const messages8 = {
  applyValue0: ['应用{{value0}}', 'Apply {{value0}}'],
  filterResultValue0: ['筛选结果：{{value0}}', 'Filter result: {{value0}}'],
  theLast20SavedSnapshotsAreKept: [
    '成功保存后会保留本机最近 20 份快照。恢复版本会先替换当前内容，直到下次保存才更新文件。已加密的历史版本保留保存时的密码。',
    'The last 20 saved snapshots are kept locally. Restoring replaces current content; the file updates on your next save. Encrypted snapshots retain their original password.',
  ],
  generationSendsYourRequestAndSelectedBranch: [
    '生成时会把提示及勾选的分支文字发送到上方服务，服务可能收费；不发送图片、附件或音频。每次最多 200 个主题、8 层、4096 输出 token，30 秒超时。',
    'Generation sends your request and selected branch text to the service above, which may charge. Images, attachments and audio are excluded. Maximum 200 topics, 8 levels, 4096 output tokens and a 30-second timeout.',
  ],
  forClientsSupportingHttpAndHeadersSettings: [
    '适用于支持 HTTP 与 headers 配置的客户端。配置包含本次访问令牌，请仅交给信任的客户端。',
    'For clients supporting HTTP and headers. Settings include the access token. Share them only with trusted clients.',
  ],
  checkTheTopicCountBeforeOpeningA: [
    '先检查主题数量，再打开为新文档。当前文档有未保存修改时会先确认。Markdown 读取标题与列表；OPML 读取层级与纯文本备注。',
    'Check the topic count before opening a new document. Unsaved changes require confirmation. Markdown reads headings and lists; OPML reads hierarchy and plain-text notes.',
  ],
  exportTheFull2dMapWithImages: [
    '导出当前画布的完整二维导图。图片、标题和内容标记可见，备注正文与附件文件不在图中。',
    'Export the full 2D map with images, titles and content markers. Notes and attachment files are excluded.',
  ],
  exportTheFull2dVectorMapWith: [
    '导出完整二维矢量导图，嵌入图片。字体使用查看设备的本地系统字体；备注正文与附件文件不在图中。',
    'Export the full 2D vector map with embedded images. Uses fonts available on the viewing device. Notes and attachments are excluded.',
  ],
  exportASinglepagePdfFittedToA3: [
    '导出单页 PDF，按完整二维导图适配 A3 页面；中文以图片保留，文字不可搜索。',
    'Export a single-page PDF fitted to A3. Text is rasterized and cannot be searched.',
  ],
  keepTopicHierarchyAndTitlesMarkdownExcludes: [
    '保留全部主题层级与标题。Markdown 不保留样式、折叠、备注、图片、附件及其他注释内容。',
    'Keep topic hierarchy and titles. Markdown excludes styles, collapse state, notes, images, attachments and annotations.',
  ],
  keepSheetsHierarchyTitlesAndPlaintextNotes: [
    '保留画布、主题层级、标题和纯文本备注。OPML 不保留样式、折叠、图片、附件及其他注释内容。',
    'Keep sheets, hierarchy, titles and plain-text notes. OPML excludes styles, collapse state, images, attachments and annotations.',
  ],
  keepSheetNamesHierarchyAndTitlesTitle: [
    '保留画布名称、缩进层级和标题；标题内换行写作 \\\\n。纯文本不保留其他内容。',
    'Keep sheet names, hierarchy and titles. Title line breaks are written as \\\\n. Other content is excluded.',
  ],
  modernXmindIncludesSelectedSheetsTopicsNotes: [
    '现代 XMind 文件包含所选画布、主题、备注和内嵌资源。每个主题的首个附件使用标准链接；额外附件和扩展元数据写入 Brainstorming 扩展，其他软件可能忽略。仅导出当前画布时会移除指向其他画布的主题链接。',
    'Modern XMind includes selected sheets, topics, notes and embedded resources. The first attachment uses a standard link. Extra attachments and metadata use Brainstorming extensions that other apps may ignore. Exporting one sheet removes links to other sheets.',
  ],
  sheetDoesNotExist: ['画布不存在', 'Sheet does not exist'],
  theSheetChangedReadItAgain: ['画布已改变，请重新读取', 'The sheet changed. Read it again.'],
  paginationRequiresARevision: ['分页读取须提供 revision', 'Pagination requires a revision'],
  topicDoesNotExist: ['主题不存在', 'Topic does not exist'],
  theSharedWorkbookWasClosedOrChanged: [
    '共享的工作簿已关闭或切换，请在 Brainstorming 中重新启用 MCP',
    'The shared workbook was closed or changed. Re-enable MCP in Brainstorming.',
  ],
  editingDraftDoesNotExistOrHas: [
    '编辑草稿不存在或已过期',
    'Editing draft does not exist or has expired',
  ],
  thisConnectionDoesNotAllowEditingDrafts: [
    '本次连接未授权提交编辑草稿',
    'This connection does not allow editing drafts',
  ],
  tooManyPendingDraftsReviewThemIn: [
    '待确认草稿已达上限，请先在 Brainstorming 中处理',
    'Too many pending drafts. Review them in Brainstorming first.',
  ],
  waitingForApprovalInBrainstormingTheDocument: [
    '等待用户在 Brainstorming 中确认；文档尚未修改',
    'Waiting for approval in Brainstorming. The document has not changed.',
  ],
  finishEditingFileOperationsOrPresentationFirst: [
    '请先完成当前编辑、文件操作或演示',
    'Finish editing, file operations or presentation first',
  ],
  couldNotApplyEditingDraftTheDocument: [
    '无法应用编辑草稿，文档未修改',
    'Could not apply editing draft. The document is unchanged.',
  ],
  theConnectionOrSheetChangedSubmitThe: [
    '草稿对应的连接或画布已改变，请重新提交',
    'The connection or sheet changed. Submit the draft again.',
  ],
  readResultIsTooLargeReduceThe: [
    '读取结果过大，请减少 limit 或选择较小分支',
    'Read result is too large. Reduce the limit or choose a smaller branch.',
  ],
  mcpRequiresTheBrainstormingDesktopAppLabel827: [
    'MCP 需要 Brainstorming 桌面版',
    'MCP requires the Brainstorming desktop app',
  ],
} as const
