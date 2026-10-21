export const spatialMessages = {
  spatial2d: ['二维视图', '2D view'],
  spatial3d: ['三维视图', '3D view'],
  spatialDepth: ['深度', 'Depth'],
  spatialTopicDepth: ['主题深度', 'Topic depth'],
  spatialDepthValue: ['主题深度数值', 'Topic depth value'],
  spatialResetDepth: ['重置深度', 'Reset depth'],
  spatialSpacing: ['层间距', 'Layer spacing'],
  spatialResetCamera: ['恢复视角', 'Reset angle'],
  spatialCameraHint: [
    '空白拖动平移 · Alt 拖动调整视角 · 捏合缩放',
    'Drag to pan · Alt-drag to tilt · Pinch to zoom',
  ],
  spatialDepthHint: ['连同子主题调整，松手后保存', 'Adjust with descendants; save on release'],
  spatialFallback: [
    '立体渲染暂不可用，编辑仍可继续',
    '3D rendering is unavailable; editing remains available',
  ],
  spatialRetry: ['重试立体渲染', 'Retry 3D rendering'],
} as const
