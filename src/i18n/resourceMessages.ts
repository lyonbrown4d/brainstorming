export const resourceMessages = {
  dropFilesTitle: ['松开以导入文件', 'Drop files to import'],
  dropFilesHint: [
    '导图会在新标签中打开；图片、音频和附件会添加到目标主题。',
    'Maps open in new tabs. Images, audio and attachments are added to the target topic.',
  ],
  importingDroppedFiles: ['正在导入文件…', 'Importing files…'],
  dropNeedsDocument: [
    '请先打开或新建导图，再拖入资源文件。',
    'Open or create a map before dropping resource files.',
  ],
  droppedTargetChanged: [
    '目标主题已变化，请重新拖入文件。',
    'The target topic changed. Drop the files again.',
  ],
  droppedFilesFailed: ['文件导入失败，请重试。', 'Could not import files. Try again.'],
  screenshotLink: ['生成网页截图', 'Capture webpage'],
  screenshotLinkBusy: ['正在生成网页截图…', 'Capturing webpage…'],
  screenshotLinkHint: [
    '网页截图在后台排队生成。点击可将截图设为主题图片。',
    'Webpage screenshots are queued in the background. Click to use the screenshot as the topic image.',
  ],
  screenshotLinkFailed: ['网页截图失败，请重试。', 'Could not capture the webpage. Try again.'],
  screenshotLinkQueued: ['网页截图正在排队生成…', 'Webpage screenshot queued…'],
  screenshotLinkDone: ['网页截图已添加', 'Webpage screenshot added'],
} as const
