import { useMessages } from '@renderer/i18n/useMessages'

import { DialogContent } from '@renderer/components/DialogContent'
import type { TopicImage as TopicImageData } from '@core'
import { Expand } from 'lucide-react'
import { TopicImage } from '@renderer/components/TopicImage'
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
        <TopicImage
          image={image}
          className="topic-image-full m-auto block h-auto max-h-[65vh] w-auto max-w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
