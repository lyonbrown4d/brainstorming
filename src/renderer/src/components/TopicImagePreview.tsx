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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-[31px] gap-[5px] px-[9px] text-xs"
          aria-label="预览图片"
        >
          <Expand size={14} />
          预览
        </Button>
      </DialogTrigger>
      <DialogContent
        className="topic-image-dialog sm:max-w-[min(720px,calc(100vw-48px))]"
        closeLabel="关闭图片预览"
      >
        <DialogHeader>
          <DialogTitle>主题图片</DialogTitle>
          <DialogDescription>图片随导图文件保存，可在主题面板中替换或移除。</DialogDescription>
        </DialogHeader>
        <TopicImage
          image={image}
          className="topic-image-full m-auto block h-auto max-h-[65vh] w-auto max-w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
