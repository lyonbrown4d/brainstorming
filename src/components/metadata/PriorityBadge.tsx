import type { TaskPriority } from '@core'
import { PRIORITY_BADGE_PATH, PRIORITY_COLORS } from '@shared/taskPriority'

export const PriorityBadge = ({
  priority,
  className = 'size-7',
}: {
  priority: TaskPriority
  className?: string
}) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" data-priority={priority}>
    <path d={PRIORITY_BADGE_PATH} fill={PRIORITY_COLORS[priority]} stroke="white" strokeWidth="1" />
    <path d="M7 4h10" stroke="white" strokeOpacity="0.35" strokeLinecap="round" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="white"
      fontFamily="system-ui, sans-serif"
      fontSize="13"
      fontWeight="750"
    >
      {priority}
    </text>
  </svg>
)
