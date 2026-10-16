import { Mic, Square, X } from 'lucide-react'
import { useAudioRecording } from '../../hooks/useAudioRecording'
import { useEditor } from '../../state/editor'
import { Button } from '../ui/button'

export function AudioRecorder({ topicId }: { topicId: string }) {
  const recording = useAudioRecording(topicId)
  const busy = useEditor((state) => state.busy)
  return (
    <div className="space-y-2 rounded-lg border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        {recording.status === 'idle' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              void recording.start()
            }}
          >
            <Mic className="size-3" />
            开始录音
          </Button>
        ) : (
          <>
            <span className="flex items-center gap-1 text-xs" role="status">
              <span className="size-2 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
              {recording.status === 'requesting'
                ? '正在请求麦克风…'
                : recording.status === 'saving'
                  ? '正在保存录音…'
                  : `${recording.seconds} / 120 秒`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={recording.status !== 'recording'}
              onClick={recording.stop}
            >
              <Square className="size-3" />
              停止并保存
            </Button>
            <Button variant="ghost" size="sm" onClick={recording.cancel}>
              <X className="size-3" />
              取消录音
            </Button>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        点击后请求麦克风；最长 2 分钟、最大 8 MiB。
      </p>
      {recording.message && (
        <p className="text-xs text-muted-foreground" role="status">
          {recording.message}
        </p>
      )}
    </div>
  )
}
