import { NativeDocuments } from '@main/document-db'
import { ResourceLibrary } from '@main/resources/library'
import type { RecoveryIndexRepository } from '@main/workspace-recovery/repository'
import type { RecentFilesRepository } from '@main/storage/repositories'
import { recoveryIndexRepository, recentFilesRepository } from '@main/di/storage'
import { RecoveryWorkspaceService } from '@main/workspace-recovery/service'
import { ContainerModule } from 'inversify'
import { join } from 'node:path'
import { applicationOptions, type ApplicationOptions } from '@main/application/options'
import { DocumentFiles } from '@main/files'
import { DocumentBackups } from '@main/file-security/backups'
import { FileSecuritySession } from '@main/file-security/session'
import { OpenFileRequests } from '@main/openFiles'

export const filesModule = new ContainerModule(({ bind }) => {
  bind(FileSecuritySession)
    .toResolvedValue(
      (native: NativeDocuments, resources: ResourceLibrary) =>
        new FileSecuritySession(native, resources),
      [NativeDocuments, ResourceLibrary],
    )
    .inSingletonScope()
    .onDeactivation((security) => {
      security.dispose()
    })
  bind(DocumentBackups)
    .toResolvedValue(
      (options: ApplicationOptions, native: NativeDocuments, resources: ResourceLibrary) =>
        new DocumentBackups(join(options.storageDirectory, 'history-native'), native, resources),
      [applicationOptions, NativeDocuments, ResourceLibrary],
    )
    .inSingletonScope()
  bind(RecoveryWorkspaceService)
    .toResolvedValue(
      (
        options: ApplicationOptions,
        security: FileSecuritySession,
        index: RecoveryIndexRepository,
        native: NativeDocuments,
        resources: ResourceLibrary,
      ) =>
        new RecoveryWorkspaceService(options.storageDirectory, security, index, native, resources),
      [
        applicationOptions,
        FileSecuritySession,
        recoveryIndexRepository,
        NativeDocuments,
        ResourceLibrary,
      ],
    )
    .inSingletonScope()
  bind(DocumentFiles)
    .toResolvedValue(
      (
        options: ApplicationOptions,
        security: FileSecuritySession,
        backups: DocumentBackups,
        workspace: RecoveryWorkspaceService,
        recent: RecentFilesRepository,
        native: NativeDocuments,
        resources: ResourceLibrary,
      ) =>
        new DocumentFiles(
          options.storageDirectory,
          security,
          backups,
          workspace,
          recent,
          native,
          resources,
        ),
      [
        applicationOptions,
        FileSecuritySession,
        DocumentBackups,
        RecoveryWorkspaceService,
        recentFilesRepository,
        NativeDocuments,
        ResourceLibrary,
      ],
    )
    .inSingletonScope()
    .onDeactivation((files) => files.flush())
  bind(OpenFileRequests)
    .toDynamicValue(() => new OpenFileRequests())
    .inSingletonScope()
})
