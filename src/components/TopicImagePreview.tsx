import { useMessages } from '@renderer/i18n/useMessages'

import { DialogContent } from '@renderer/components/DialogContent'
import type { TopicImage as TopicImageData } from '@core'
import { Expand } from 'lucide-react'
import { StoredImageViewer } from '@renderer/components/StoredImageViewer'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'

export const TopicImagePreview = ({ image }: { image: TopicImageData }) => {
  const { translate } = useMessages()
  const asset = useEditor((state) => state.history.document.assets?.[image.assetId])

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-[31px] gap-[5px] px-[9px] text-xs"
          aria-label={translate('previewImage')}
        >
          <Expand size={14} />
          {translate('preview')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="topic-image-dialog sm:max-w-[min(720px,calc(100vw-48px))]"
        closeLabel={translate('closeImagePreview')}
      >
        <DialogHeader>
          <DialogTitle>{translate('topicImage')}</DialogTitle>
          <DialogDescription>{translate('imagesAreSavedWithTheMapReplace')}</DialogDescription>
        </DialogHeader>
        {asset && <StoredImageViewer asset={asset} />}
      </DialogContent>
    </Dialog>
  )
}
