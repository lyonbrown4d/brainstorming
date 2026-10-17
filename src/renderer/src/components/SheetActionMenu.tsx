import { useMessages } from '@renderer/i18n/useMessages'

import { ChevronDown } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import type { SheetDialogAction } from '@renderer/components/SheetDialog'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu'

interface SheetActionMenuProps {
  sheet: { id: string; name: string }
  index: number
  count: number
  busy: boolean
  onDialog: (action: SheetDialogAction) => void
}

export const SheetActionMenu = ({ sheet, index, count, busy, onDialog }: SheetActionMenuProps) => {
  const { translate } = useMessages()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="sheet-menu-trigger h-7 w-6 shrink-0 rounded-md p-0 text-inherit"
          aria-label={translate('sheetMenuValue0', { value0: sheet.name })}
          disabled={busy}
        >
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-38"
        side="top"
        align="start"
        sideOffset={8}
        aria-label={translate('sheetActionsValue0', { value0: sheet.name })}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => {
              onDialog({ kind: 'rename', ...sheet })
            }}
          >
            {translate('renameSheet')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => {
              useEditor.getState().duplicateSheet(sheet.id)
            }}
          >
            {translate('duplicateSheet')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={busy || index === 0}
            onSelect={() => {
              useEditor.getState().moveSheet(sheet.id, index - 1)
            }}
          >
            {translate('moveLeft')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy || index === count - 1}
            onSelect={() => {
              useEditor.getState().moveSheet(sheet.id, index + 1)
            }}
          >
            {translate('moveRight')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={busy || count <= 1}
            onSelect={() => {
              onDialog({ kind: 'delete', ...sheet })
            }}
          >
            {translate('deleteSheet')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
