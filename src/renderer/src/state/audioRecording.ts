import { translate } from '@renderer/i18n'
export const MAX_RECORDING_SECONDS = 120
export const MAX_RECORDING_BYTES = 8 * 1024 * 1024

interface RecordingCallbacks {
  onStarted: () => void
  onComplete: (blob: Blob) => void
  onError: (message: string) => void
  onLimit: () => void
}
/** Owns only browser media resources; document writes remain in the typed asset command path. */
export class AudioRecordingSession {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private bytes = 0
  private discarded = false
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private readonly callbacks: RecordingCallbacks) {}

  start = async (): Promise<void> => {
    if (
      typeof MediaRecorder === 'undefined' ||
      !Reflect.has(navigator, 'mediaDevices') ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    )
      throw new Error(translate('recordingIsUnavailableYouCanImportA'))
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (this.discarded) {
      stream.getTracks().forEach((track) => {
        track.stop()
      })
      return
    }
    this.stream = stream
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      )
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000,
      })
      this.recorder = recorder
      recorder.ondataavailable = (event) => {
        if (this.discarded || !event.data.size) return
        this.bytes += event.data.size
        if (this.bytes > MAX_RECORDING_BYTES) {
          this.callbacks.onError(translate('recordingExceeds8MibExistingAudioIs'))
          this.cancel()
          return
        }
        this.chunks.push(event.data)
      }
      recorder.onerror = () => {
        this.callbacks.onError(translate('recordingFailedCheckYourMicrophoneAndRetry'))
        this.cancel()
      }
      recorder.onstop = () => {
        this.release()
        if (this.discarded) return
        const blob = new Blob(this.chunks, { type: recorder.mimeType })
        this.chunks = []
        if (blob.size) this.callbacks.onComplete(blob)
        else this.callbacks.onError(translate('noAudioRecordedCheckYourMicrophoneAnd'))
      }
      recorder.start(1000)
      this.timer = setTimeout(() => {
        this.callbacks.onLimit()
        this.stop()
      }, MAX_RECORDING_SECONDS * 1000)
      this.callbacks.onStarted()
    } catch (error) {
      this.release()
      throw error
    }
  }
  stop = (): void => {
    clearTimeout(this.timer)
    if (this.recorder?.state === 'recording') this.recorder.stop()
    this.release()
  }
  cancel = (): void => {
    this.discarded = true
    this.chunks = []
    this.stop()
  }
  private release = (): void => {
    clearTimeout(this.timer)
    this.stream?.getTracks().forEach((track) => {
      track.stop()
    })
    this.stream = null
  }
}
