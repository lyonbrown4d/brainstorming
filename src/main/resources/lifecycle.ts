import type { NativeDocuments } from '@main/document-db'
import type { LinkPreviewQueue } from '@main/media/linkPreview'
import type { ResourceLibrary } from '@main/resources/library'
import type { ResourceProtocol } from '@main/resources/protocol'

/** Stop producers before their storage dependencies; repeated DI teardown shares one drain. */
export class ResourceLifecycle {
  private disposal: Promise<void> | undefined
  constructor(
    private readonly previews: Pick<LinkPreviewQueue, 'dispose'>,
    private readonly library: Pick<ResourceLibrary, 'dispose'>,
    private readonly documents: Pick<NativeDocuments, 'dispose'>,
    private readonly protocol: Pick<ResourceProtocol, 'dispose'>,
  ) {}
  dispose = (): Promise<void> => {
    this.disposal ??= (async () => {
      try {
        this.protocol.dispose()
      } finally {
        try {
          await this.previews.dispose()
        } finally {
          try {
            await this.library.dispose()
          } finally {
            await this.documents.dispose()
          }
        }
      }
    })()
    return this.disposal
  }
}
