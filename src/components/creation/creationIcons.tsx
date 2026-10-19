import {
  BookOpen,
  BrainCircuit,
  ChartNoAxesCombined,
  ClipboardList,
  GitFork,
  LayoutGrid,
  Lightbulb,
  Network,
  Table2,
  Timer,
  GitBranch,
  GraduationCap,
  MessagesSquare,
  PenLine,
  RotateCcw,
  Search,
  Target,
  Users,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import type { TemplateSummary } from '@shared/templates'
import type { StructureGroup } from '@renderer/components/documents/structureCatalog'

const structureIcons: Record<StructureGroup, LucideIcon> = {
  all: LayoutGrid,
  thought: BrainCircuit,
  hierarchy: Network,
  analysis: GitFork,
  time: Timer,
  table: Table2,
}

/** Category metadata stays independent of backend-owned template IDs. */
export const templateGroupAppearance = {
  ideate: {
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  plan: {
    className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  },
  analyze: {
    className: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  },
  learn: {
    className: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
  },
} satisfies Record<TemplateSummary['group'], { className: string }>

export const StructureGroupIcon = ({ group }: { group: StructureGroup }) => {
  const Icon = structureIcons[group]
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
}

const templateIcons: Record<TemplateSummary['icon'], LucideIcon> = {
  lightbulb: Lightbulb,
  'wand-sparkles': WandSparkles,
  'brain-circuit': BrainCircuit,
  'clipboard-list': ClipboardList,
  'messages-square': MessagesSquare,
  'rotate-ccw': RotateCcw,
  'git-branch': GitBranch,
  'chart-no-axes-combined': ChartNoAxesCombined,
  search: Search,
  users: Users,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  'pen-line': PenLine,
  target: Target,
}

export const TemplateIcon = ({ icon }: { icon: TemplateSummary['icon'] }) => {
  const Icon = templateIcons[icon]
  return <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
}
