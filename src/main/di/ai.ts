import { ContainerModule } from 'inversify'
import { safeStorage } from 'electron'
import { AISettingsStore, type KeyStorage } from '@main/ai/settings'
import { AIService, type GenerateAI } from '@main/ai/application'
import { generateMindMap } from '@main/ai/service'
import { applicationOptions, type ApplicationOptions } from '@main/application/options'

export const keyStorage = Symbol('KeyStorage')
export const aiGenerator = Symbol('AIGenerator')
export const aiModule = new ContainerModule(({ bind }) => {
  bind<KeyStorage>(keyStorage)
    .toDynamicValue(() => ({
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      ...(process.platform === 'linux'
        ? { getSelectedStorageBackend: () => safeStorage.getSelectedStorageBackend() }
        : {}),
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (value) => safeStorage.decryptString(value),
    }))
    .inSingletonScope()
  bind<GenerateAI>(aiGenerator).toConstantValue(generateMindMap)
  bind(AISettingsStore)
    .toResolvedValue(
      (options: ApplicationOptions, storage: KeyStorage) =>
        new AISettingsStore(options.storageDirectory, storage),
      [applicationOptions, keyStorage],
    )
    .inSingletonScope()
  bind(AIService)
    .toResolvedValue(
      (store: AISettingsStore, generate: GenerateAI) => new AIService(store, generate),
      [AISettingsStore, aiGenerator],
    )
    .inSingletonScope()
    .onDeactivation((service) => service.dispose())
})
