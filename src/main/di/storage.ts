import { ContainerModule } from 'inversify'
import { LocalDatabase } from '@main/storage/database'
import { applicationOptions, type ApplicationOptions } from '@main/application/options'
import type { PreferencesRepository, RecentFilesRepository } from '@main/storage/repositories'
import type { RecoveryIndexRepository } from '@main/workspace-recovery/repository'

export const preferencesRepository = Symbol('PreferencesRepository')
export const recentFilesRepository = Symbol('RecentFilesRepository')
export const recoveryIndexRepository = Symbol('RecoveryIndexRepository')

export const storageModule = new ContainerModule(({ bind }) => {
  bind(LocalDatabase)
    .toResolvedValue(
      (options: ApplicationOptions) => new LocalDatabase(options.storageDirectory),
      [applicationOptions],
    )
    .inSingletonScope()
    .onDeactivation((database) => {
      database.close()
    })
  bind<PreferencesRepository>(preferencesRepository)
    .toResolvedValue((database: LocalDatabase) => database.preferences, [LocalDatabase])
    .inSingletonScope()
  bind<RecentFilesRepository>(recentFilesRepository)
    .toResolvedValue((database: LocalDatabase) => database.recentFiles, [LocalDatabase])
    .inSingletonScope()
  bind<RecoveryIndexRepository>(recoveryIndexRepository)
    .toResolvedValue((database: LocalDatabase) => database.recoveryIndex, [LocalDatabase])
    .inSingletonScope()
})
