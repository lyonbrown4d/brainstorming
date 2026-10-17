import { applyCommand, createDocument, type MindMapDocument } from '@core'

export const extensionFixture = (): MindMapDocument => {
  return applyCommand(createDocument('扩展', 'extensions'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: 'A' },
      { type: 'addTopic', parentId: 'a', id: 'child', title: 'Child' },
      { type: 'addTopic', parentId: 'root', id: 'b', title: 'B' },
      {
        type: 'setTopicMetadata',
        topicId: 'a',
        metadata: {
          labels: ['设计', 'review'],
          markers: ['star'],
          task: {
            done: false,
            priority: 1,
            progress: 20,
            start: '2026-10-01',
            due: '2026-10-31',
            assignee: 'Owner',
            dependencies: ['b'],
          },
          link: { kind: 'topic', topicId: 'b' },
          equation: 'E=mc^2',
          notesFormat: 'markdown',
          richTitle: '**A**',
        },
      },
      {
        type: 'setTopicMetadata',
        topicId: 'child',
        metadata: {
          link: { kind: 'topic', topicId: 'a' },
          task: { done: false, dependencies: ['a'] },
        },
      },
      {
        type: 'setTopicAudio',
        topicId: 'a',
        asset: { id: 'voice', name: 'voice.wav', mimeType: 'audio/wav', data: 'UklGRgQAAABXQVZF' },
      },
      { type: 'setTopicStructure', topicId: 'a', structure: 'logic-right' },
      {
        type: 'setDocumentSettings',
        settings: {
          layout: 'org-down',
          theme: 'ocean',
          background: '#fafafa',
          fontFamily: 'Arial',
          lineWidth: 2,
        },
      },
      {
        type: 'upsertRelation',
        relation: {
          id: 'relation',
          from: 'a',
          to: 'b',
          title: '连接',
          color: '#123456',
          width: 2,
          dashed: true,
          arrow: 'both',
        },
      },
      {
        type: 'upsertGroup',
        group: { id: 'group', kind: 'boundary', topicIds: ['a', 'child'], title: 'Group' },
      },
      { type: 'upsertCallout', callout: { id: 'callout', topicId: 'child', text: '说明' } },
      { type: 'addFloatingTopic', id: 'floating', title: '游离主题', x: 120, y: -40 },
      {
        type: 'setPresentation',
        steps: [
          { topicId: 'a', camera: { position: [1, 2, 3], target: [0, 0, 0] } },
          { topicId: 'floating' },
        ],
      },
    ],
  })
}
