import { translate } from '@renderer/i18n'
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
        if (alive.current) setMessage(translate('recordingReachedThe2minuteLimitSaving'))
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
              setMessage(
                error instanceof Error ? error.message : translate('couldNotSaveRecording'),
              )
          })
          .finally(finish)
      },
    })
    session.current = recording
    unsubscribe.current = useEditor.subscribe((current, previous) => {
      if (!valid() || (current.clock === 0 && current.history !== previous.history)) {
        recording.cancel()
        finish()
        if (alive.current) setMessage(translate('theTopicOrSheetChangedRecordingCancelled'))
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
            ? translate('noMicrophoneFoundConnectOneOrImport')
            : denied
              ? translate('microphoneAccessDeniedAllowAccessAndRetry')
              : error instanceof Error
                ? error.message
                : translate('couldNotAccessMicrophone'),
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
