import { ListTree } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useMessages } from '@renderer/i18n/useMessages'
import { useOutlineWorkspaceOpen } from '@renderer/components/documents/useOutlineWorkspaceOpen'
import { setOutlineWorkspaceOpen } from '@renderer/components/documents/OutlineWorkspaceActions'

/** The left outline remains navigation; this opens a dedicated editing surface. */
export const OutlineEditor = () => {
  const { translate } = useMessages()
  const open = useOutlineWorkspaceOpen()
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={open}
      onClick={() => {
        setOutlineWorkspaceOpen(!open)
      }}
    >
      <ListTree className="size-4" />
      {translate('editOutline')}
    </Button>
  )
}
