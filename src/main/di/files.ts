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
    .toDynamicValue(() => new FileSecuritySession())
    .inSingletonScope()
    .onDeactivation((security) => {
      security.dispose()
    })
  bind(DocumentBackups)
    .toResolvedValue(
      (options: ApplicationOptions) =>
        new DocumentBackups(join(options.storageDirectory, 'history-v1')),
      [applicationOptions],
    )
    .inSingletonScope()
  bind(RecoveryWorkspaceService)
    .toResolvedValue(
      (
        options: ApplicationOptions,
        security: FileSecuritySession,
        index: RecoveryIndexRepository,
      ) => new RecoveryWorkspaceService(options.storageDirectory, security, index),
      [applicationOptions, FileSecuritySession, recoveryIndexRepository],
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
      ) => new DocumentFiles(options.storageDirectory, security, backups, workspace, recent),
      [
        applicationOptions,
        FileSecuritySession,
        DocumentBackups,
        RecoveryWorkspaceService,
        recentFilesRepository,
      ],
    )
    .inSingletonScope()
    .onDeactivation((files) => files.flush())
  bind(OpenFileRequests)
    .toDynamicValue(() => new OpenFileRequests())
    .inSingletonScope()
})
