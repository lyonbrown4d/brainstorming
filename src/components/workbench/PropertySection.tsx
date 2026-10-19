import { useState, type ReactNode } from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@renderer/components/ui/accordion'

/** Preserve editor DOM and drafts while low-frequency inspector sections are folded. */
export const PropertySection = ({
  title,
  children,
  defaultOpen = false,
}: {
  readonly title: string
  readonly children: ReactNode
  readonly defaultOpen?: boolean
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Accordion
      type="single"
      collapsible
      value={open ? 'section' : ''}
      onValueChange={(value) => {
        setOpen(value === 'section')
      }}
      className="border-t border-border/60"
    >
      <AccordionItem value="section" className="border-0">
        <AccordionTrigger className="items-center rounded-sm py-2.5 text-xs font-medium text-secondary-foreground hover:bg-transparent hover:text-foreground hover:no-underline [&>svg]:size-3.5 [&>svg]:translate-y-0">
          {title}
        </AccordionTrigger>
        <AccordionContent
          forceMount
          hidden={!open}
          className="pb-3 [&>section]:border-0 [&>section]:pt-0 [&>section>h3]:sr-only"
        >
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
