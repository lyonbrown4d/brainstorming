import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight } from 'lucide-react'

const arrows = {
  'top-left': ArrowUpLeft,
  'top-right': ArrowUpRight,
  'bottom-left': ArrowDownLeft,
  'bottom-right': ArrowDownRight,
}

/** Shared corner direction; the surrounding control owns the larger invisible hit area. */
export const TopicScaleArrow = ({ corner }: { corner: keyof typeof arrows }) => {
  const Arrow = arrows[corner]
  return (
    <Arrow
      aria-hidden
      className="pointer-events-none size-3.5 motion-safe:animate-[topic-controls-enter_150ms_ease-out]"
      strokeWidth={1.75}
    />
  )
}
