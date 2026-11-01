import { useEffect } from 'react'
import { useLocation } from 'react-router'
import {
  activateInitialTopicEdit,
  useInitialTopicEdit as useRequest,
} from '@renderer/state/initialTopicEdit'
import { canonicalWorkspacePath } from '@renderer/routing/workspacePaths'
import { useEditor } from '@renderer/state/editor'

export const useInitialTopicEdit = (): void => {
  const { pathname } = useLocation()
  const request = useRequest((state) => state.request)
  const readyScope = useRequest((state) => state.readyScope)
  const workbookId = useEditor((state) => state.workbook.id)
  const sheetId = useEditor((state) => state.activeSheetId)
  useEffect(() => {
    if (
      request &&
      pathname === canonicalWorkspacePath() &&
      readyScope === JSON.stringify([workbookId, sheetId])
    )
      activateInitialTopicEdit()
  }, [pathname, request, readyScope, workbookId, sheetId])
}
