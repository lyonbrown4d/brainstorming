import { ResourceLifecycle } from '@main/resources/lifecycle'
import { ContainerModule } from 'inversify'
import { join } from 'node:path'
import { applicationOptions, type ApplicationOptions } from '@main/application/options'
import { WindowSession } from '@main/application/session'
import { NativeDocuments } from '@main/document-db'
import { ResourceLibrary } from '@main/resources/library'
import { ResourceProtocol } from '@main/resources/protocol'
import { ResourceBridge } from '@main/resources/bridge'
import { LinkPreviewQueue } from '@main/media/linkPreview'
import { DocumentFiles } from '@main/files'

export const resourcesModule = new ContainerModule(({ bind }) => {
  bind(NativeDocuments)
    .toDynamicValue(() => new NativeDocuments())
    .inSingletonScope()
  bind(ResourceLibrary)
    .toResolvedValue(
      (options: ApplicationOptions, native: NativeDocuments) =>
        new ResourceLibrary(options.storageDirectory, native),
      [applicationOptions, NativeDocuments],
    )
    .inSingletonScope()
  bind(LinkPreviewQueue)
    .toResolvedValue(
      (options: ApplicationOptions, library: ResourceLibrary, session: WindowSession) =>
        new LinkPreviewQueue({
          directory: join(options.storageDirectory, 'link-preview-work'),
          importImage: (path) => library.importFile(path, 'image'),
          onReady: (url) => {
            const window = session.window
            if (window && !window.isDestroyed()) window.webContents.send('resource:link:ready', url)
          },
        }),
      [applicationOptions, ResourceLibrary, WindowSession],
    )
    .inSingletonScope()
  bind(ResourceProtocol)
    .toResolvedValue(
      (library: ResourceLibrary, options: ApplicationOptions) =>
        new ResourceProtocol(
          library,
          options.rendererURL ? new URL(options.rendererURL).origin : 'null',
        ),
      [ResourceLibrary, applicationOptions],
    )
    .inSingletonScope()
  bind(ResourceLifecycle)
    .toResolvedValue(
      (
        previews: LinkPreviewQueue,
        library: ResourceLibrary,
        documents: NativeDocuments,
        protocol: ResourceProtocol,
      ) => new ResourceLifecycle(previews, library, documents, protocol),
      [LinkPreviewQueue, ResourceLibrary, NativeDocuments, ResourceProtocol],
    )
    .inSingletonScope()
    .onDeactivation((resources) => resources.dispose())
  bind(ResourceBridge)
    .toResolvedValue(
      (library: ResourceLibrary, previews: LinkPreviewQueue, files: DocumentFiles) =>
        new ResourceBridge(library, previews, files),
      [ResourceLibrary, LinkPreviewQueue, DocumentFiles],
    )
    .inSingletonScope()
})
