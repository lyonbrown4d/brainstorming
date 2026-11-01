import { useEditor } from '@renderer/state/editor'
import {
  outlineSessionKey,
  useOutlineWorkspaceState,
} from '@renderer/components/documents/OutlineWorkspaceState'

export const useOutlineWorkspaceOpen = (): boolean => {
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  const key = outlineSessionKey(workbookId, sheetId)
  return useOutlineWorkspaceState((state) => state.sessions[key]?.open ?? false)
}
