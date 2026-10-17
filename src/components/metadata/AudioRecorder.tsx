import { useMessages } from '@renderer/i18n/useMessages'

import { Mic, Square, X } from 'lucide-react'
import { useAudioRecording } from '@renderer/hooks/useAudioRecording'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'

export const AudioRecorder = ({ topicId }: { topicId: string }) => {
  const { translate } = useMessages()

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
            {translate('recordAudio')}
          </Button>
        ) : (
          <>
            <span className="flex items-center gap-1 text-xs" role="status">
              <span className="size-2 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
              {recording.status === 'requesting'
                ? translate('requestingMicrophone')
                : recording.status === 'saving'
                  ? translate('savingRecording')
                  : translate('value0120Seconds', { value0: recording.seconds })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={recording.status !== 'recording'}
              onClick={recording.stop}
            >
              <Square className="size-3" />
              {translate('stopAndSave')}
            </Button>
            <Button variant="ghost" size="sm" onClick={recording.cancel}>
              <X className="size-3" />
              {translate('cancelRecording')}
            </Button>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {translate('requestsMicrophoneAccessWhenClickedMaximum2')}
      </p>
      {recording.message && (
        <p className="text-xs text-muted-foreground" role="status">
          {recording.message}
        </p>
      )}
    </div>
  )
}
