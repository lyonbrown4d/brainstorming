import { useEffect } from 'react'
import { applyCommand, serializeDocument } from '@/core'
import { isDirty, useEditor } from '../state/editor'
import { newDocument, openDocument, RECOVERY_KEY, saveDocument } from '../state/files'

export function useFileLifecycle(): void {
  useEffect(() => {
    let alive = true
    let ready = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const bridge = window.trelyx
    function synchronize(): void {
      const state = useEditor.getState()
      bridge?.setDirty(isDirty(), !ready || Boolean(state.recovery))
      window.document.title = `${isDirty() ? '• ' : ''}${state.history.document.title} — Trelyx`
      clearTimeout(timer)
      if (!ready || state.recovery) return
      timer = setTimeout(() => {
        const current = useEditor.getState()
        let document = current.history.document
        if (current.editingId && current.draft.trim()) {
          document = applyCommand(document, {
            type: 'renameTopic',
            topicId: current.editingId,
            title: current.draft.trim(),
          })
        }
        const contents = serializeDocument(document)
        const write = bridge
          ? bridge.writeRecovery(contents)
          : Promise.resolve().then(() => {
              localStorage.setItem(RECOVERY_KEY, contents)
            })
        void write.catch((error: unknown) => {
          useEditor
            .getState()
            .setError(
              `自动恢复写入失败：${error instanceof Error ? error.message : '请手动保存文件。'}`,
            )
        })
      }, 700)
    }
    const read = bridge
      ? bridge.readRecovery()
      : Promise.resolve().then(() => localStorage.getItem(RECOVERY_KEY))
    void read
      .then((recovery) => {
        if (!alive) return
        useEditor.setState({ recovery })
        ready = true
        synchronize()
      })
      .catch(() => {
        useEditor.getState().setError('无法读取自动恢复记录。请先手动保存当前导图。')
      })
    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (
        state.history.document !== previous.history.document ||
        state.draft !== previous.draft ||
        state.editingId !== previous.editingId ||
        state.baseline !== previous.baseline ||
        state.recovery !== previous.recovery
      )
        synchronize()
    })
    const removeMenu = bridge?.onMenuAction((action) => {
      const state = useEditor.getState()
      switch (action) {
        case 'new':
          newDocument()
          break
        case 'open':
          void openDocument()
          break
        case 'save':
          void saveDocument()
          break
        case 'saveAs':
          void saveDocument(true)
          break
        case 'undo':
          state.undo()
          break
        case 'redo':
          state.redo()
          break
      }
    })
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!bridge && isDirty()) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    synchronize()
    return () => {
      alive = false
      clearTimeout(timer)
      unsubscribe()
      removeMenu?.()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])
}
