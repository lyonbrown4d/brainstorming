import type { MessageTranslator } from '@renderer/i18n'

export interface ColorOption {
  value: string
  name: string
}

export const fontSizes = Array.from({ length: 21 }, (_, index) => ({
  value: String(index + 12),
  label: String(index + 12),
}))

export const lineWidths = [1, 2, 3, 4, 5, 6].map((width) => ({
  value: String(width),
  label: `${width} px`,
}))

export const getTopicFormattingOptions = (translate: MessageTranslator) => ({
  shapeOptions: [
    {
      value: 'rounded',
      label: translate('roundedRectangle'),
    },
    {
      value: 'rectangle',
      label: translate('rectangle'),
    },
    {
      value: 'ellipse',
      label: translate('ellipse'),
    },
  ] as const,
  lineOptions: [
    {
      value: 'curve',
      label: translate('curved'),
    },
    {
      value: 'straight',
      label: translate('straight'),
    },
  ] as const,
  fillColors: [
    {
      value: '#ffc7c7',
      name: translate('coral'),
    },
    {
      value: '#bcecdf',
      name: translate('mint'),
    },
    {
      value: '#ffe0a3',
      name: translate('warmYellow'),
    },
    {
      value: '#d9d3fa',
      name: translate('lavender'),
    },
    {
      value: '#ffffff',
      name: translate('white'),
    },
  ],
  textColors: [
    {
      value: '#30313b',
      name: translate('ink'),
    },
    {
      value: '#7666c4',
      name: translate('purple'),
    },
    {
      value: '#397a6c',
      name: translate('teal'),
    },
    {
      value: '#b35f55',
      name: translate('brickRed'),
    },
    {
      value: '#ffffff',
      name: translate('white'),
    },
  ],
})
