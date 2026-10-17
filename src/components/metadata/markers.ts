import type { MessageTranslator } from '@renderer/i18n'
import {
  Star,
  Flag,
  CircleAlert,
  Lightbulb,
  Heart,
  ThumbsUp,
  Timer,
  CircleHelp,
  Smile,
  CheckCircle2,
} from 'lucide-react'

export const markerOptions = [
  {
    value: 'star',
    titleKey: 'star',
    Icon: Star,
  },
  {
    value: 'flag',
    titleKey: 'flag',
    Icon: Flag,
  },
  {
    value: 'important',
    titleKey: 'important',
    Icon: CircleAlert,
  },
  {
    value: 'idea',
    titleKey: 'idea',
    Icon: Lightbulb,
  },
  {
    value: 'heart',
    titleKey: 'heart',
    Icon: Heart,
  },
  {
    value: 'approved',
    titleKey: 'approved',
    Icon: ThumbsUp,
  },
  {
    value: 'waiting',
    titleKey: 'waiting',
    Icon: Timer,
  },
  {
    value: 'question',
    titleKey: 'question',
    Icon: CircleHelp,
  },
  {
    value: 'smile',
    titleKey: 'smile',
    Icon: Smile,
  },
  {
    value: 'complete',
    titleKey: 'completeMarker',
    Icon: CheckCircle2,
  },
] as const

export const getMarkerOptions = (translate: MessageTranslator) =>
  markerOptions.map((option) => ({ ...option, title: translate(option.titleKey) }))
