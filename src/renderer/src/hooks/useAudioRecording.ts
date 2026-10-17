import { useEffect, useRef, useState } from 'react'
import { persistRecordedAudio } from '@renderer/state/recordedAudio'
import { AudioRecordingSession } from '@renderer/state/audioRecording'
import { useEditor } from '@renderer/state/editor'

export const useAudioRecording = (topicId: string) => {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'saving'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const session = useRef<AudioRecordingSession | null>(null)
  const alive = useRef(true)
  const unsubscribe = useRef<(() => void) | null>(null)
  const started = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      session.current?.cancel()
      session.current = null
      unsubscribe.current?.()
    }
  }, [topicId])
  useEffect(() => {
    if (status !== 'recording') return
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - started.current) / 1000))
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [status])
  const cancel = (): void => {
    session.current?.cancel()
    session.current = null
    unsubscribe.current?.()
    unsubscribe.current = null
    setStatus('idle')
  }
  const start = async (): Promise<void> => {
    if (session.current) return
    const state = useEditor.getState()
    if (state.busy || state.selectedId !== topicId) return
    state.commitDraft()
    if (useEditor.getState().editingId) return
    const workbookId = state.workbook.id,
      sheetId = state.activeSheetId
    setMessage(null)
    setStatus('requesting')
    setSeconds(0)
    const valid = (): boolean => {
      const current = useEditor.getState()
      return (
        alive.current &&
        current.workbook.id === workbookId &&
        current.activeSheetId === sheetId &&
        current.selectedId === topicId &&
        Boolean(current.history.document.topics[topicId])
      )
    }
    const finish = (): void => {
      if (session.current !== recording) return
      session.current = null
      unsubscribe.current?.()
      unsubscribe.current = null
      if (alive.current) setStatus('idle')
    }
    const recording = new AudioRecordingSession({
      onStarted: () => {
        if (alive.current) {
          started.current = Date.now()
          setStatus('recording')
        }
      },
      onError: (error) => {
        if (alive.current) setMessage(error)
        finish()
      },
      onLimit: () => {
        if (alive.current) setMessage('已达到 2 分钟上限，正在保存录音')
      },
      onComplete: (blob) => {
        if (!valid() || session.current !== recording) {
          finish()
          return
        }
        setStatus('saving')
        void persistRecordedAudio(
          blob,
          { workbookId, sheetId, topicId },
          () => valid() && session.current === recording,
        )
          .catch((error: unknown) => {
            if (alive.current && session.current === recording)
              setMessage(error instanceof Error ? error.message : '录音保存失败')
          })
          .finally(finish)
      },
    })
    session.current = recording
    unsubscribe.current = useEditor.subscribe((current, previous) => {
      if (!valid() || (current.clock === 0 && current.history !== previous.history)) {
        recording.cancel()
        finish()
        if (alive.current) setMessage('主题或画布已改变，录音已取消')
      }
    })
    try {
      await recording.start()
    } catch (error) {
      if (session.current !== recording) return
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      const missing = error instanceof DOMException && error.name === 'NotFoundError'
      if (alive.current)
        setMessage(
          missing
            ? '未检测到麦克风，可以连接设备或导入本地音频'
            : denied
              ? '未获得麦克风权限，可允许访问后重试，或导入本地音频'
              : error instanceof Error
                ? error.message
                : '无法访问麦克风',
        )
      finish()
    }
  }
  return {
    status,
    message,
    seconds,
    start,
    stop: () => {
      setStatus('saving')
      session.current?.stop()
    },
    cancel,
  }
}
