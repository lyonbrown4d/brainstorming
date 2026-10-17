import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@core'
import {
  AudioRecordingSession,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
} from '@renderer/state/audioRecording'
import { persistRecordedAudio } from '@renderer/state/recordedAudio'
import { useEditor } from '@renderer/state/editor'

class FakeRecorder {
  static instances: FakeRecorder[] = []
  static isTypeSupported = () => {
    return true
  }
  state: 'recording' | 'inactive' = 'inactive'
  mimeType = 'audio/wav'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onerror: (() => void) | null = null
  onstop: (() => void) | null = null
  constructor() {
    FakeRecorder.instances.push(this)
  }
  start = () => {
    this.state = 'recording'
  }
  stop = () => {
    this.state = 'inactive'
    queueMicrotask(() => {
      this.onstop?.()
    })
  }
  emit = (data: Blob) => {
    this.ondataavailable?.({ data })
  }
}
const trackStop = vi.fn()
const stream = { getTracks: () => [{ stop: trackStop }] }
const getUserMedia = vi.fn(() => Promise.resolve(stream))
const callbacks = () => {
  return { onStarted: vi.fn(), onComplete: vi.fn(), onError: vi.fn(), onLimit: vi.fn() }
}
beforeEach(() => {
  vi.useFakeTimers()
  FakeRecorder.instances = []
  trackStop.mockReset()
  getUserMedia.mockReset().mockResolvedValue(stream)
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('本地录音生命周期', () => {
  it('只在显式开始时请求麦克风，停止生成数据并释放所有轨道', async () => {
    const events = callbacks(),
      session = new AudioRecordingSession(events)
    expect(getUserMedia).not.toHaveBeenCalled()
    await session.start()
    expect(events.onStarted).toHaveBeenCalledOnce()
    FakeRecorder.instances[0]?.emit(new Blob(['recorded audio']))
    session.stop()
    await Promise.resolve()
    expect(events.onComplete).toHaveBeenCalledWith(expect.any(Blob))
    expect(trackStop).toHaveBeenCalledOnce()
  })
  it('权限拒绝与不支持环境不产生录音，权限等待时取消仍释放晚到的媒体流', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('拒绝访问', 'NotAllowedError'))
    await expect(new AudioRecordingSession(callbacks()).start()).rejects.toThrow('拒绝访问')
    let resolve: ((value: typeof stream) => void) | undefined
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const events = callbacks(),
      session = new AudioRecordingSession(events),
      pending = session.start()
    session.cancel()
    resolve?.(stream)
    await pending
    expect(trackStop).toHaveBeenCalledOnce()
    expect(events.onStarted).not.toHaveBeenCalled()
    vi.stubGlobal('MediaRecorder', undefined)
    await expect(new AudioRecordingSession(callbacks()).start()).rejects.toThrow('不支持录音')
  })
  it('取消不保存；达到时长自动停止，超过大小上限不替换现有内容', async () => {
    const cancelled = callbacks(),
      first = new AudioRecordingSession(cancelled)
    await first.start()
    FakeRecorder.instances[0]?.emit(new Blob(['discard']))
    first.cancel()
    await Promise.resolve()
    expect(cancelled.onComplete).not.toHaveBeenCalled()
    const limited = callbacks(),
      second = new AudioRecordingSession(limited)
    await second.start()
    FakeRecorder.instances[1]?.emit(new Blob(['duration-limited']))
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_SECONDS * 1000)
    expect(limited.onLimit).toHaveBeenCalledOnce()
    expect(limited.onComplete).toHaveBeenCalledOnce()
    const oversized = callbacks(),
      third = new AudioRecordingSession(oversized)
    await third.start()
    FakeRecorder.instances[2]?.emit(new Blob([new Uint8Array(MAX_RECORDING_BYTES + 1)]))
    await Promise.resolve()
    expect(oversized.onError).toHaveBeenCalledWith(expect.stringContaining('8 MiB'))
    expect(oversized.onComplete).not.toHaveBeenCalled()
    expect(trackStop).toHaveBeenCalledTimes(3)
  })
})

describe('录音资源提交', () => {
  it('真实 WAV 资源通过原生预检且只产生一次撤销，异步切换目标不写入', async () => {
    useEditor.getState().replace(createDocument('录音'))
    useEditor.setState({ busy: false })
    const state = useEditor.getState(),
      target = {
        workbookId: state.workbook.id,
        sheetId: state.activeSheetId,
        topicId: state.selectedId,
      }
    const bytes = new Uint8Array(46)
    const view = new DataView(bytes.buffer)
    const text = (offset: number, value: string): void => {
      new TextEncoder().encode(value).forEach((byte, index) => {
        bytes[offset + index] = byte
      })
    }
    text(0, 'RIFF')
    view.setUint32(4, 38, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 8000, true)
    view.setUint32(28, 16000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, 2, true)
    const blob = new Blob([bytes], { type: 'audio/wav' })
    expect(await persistRecordedAudio(blob, target, () => true)).toBe(true)
    expect(useEditor.getState().history.past).toHaveLength(1)
    expect(useEditor.getState().history.document.topics.root?.metadata?.audioAssetId).toBeDefined()
    state.undo()
    expect(
      useEditor.getState().history.document.topics.root?.metadata?.audioAssetId,
    ).toBeUndefined()
    expect(await persistRecordedAudio(blob, target, () => false)).toBe(false)
    expect(useEditor.getState().history.past).toHaveLength(0)
  })
})
