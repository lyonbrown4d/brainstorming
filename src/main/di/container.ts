import { ResourceLifecycle } from '@main/resources/lifecycle'
import { resourcesModule } from '@main/di/resources'
import { OpenFileRequests } from '@main/openFiles'
import { storageModule } from '@main/di/storage'
import { Container } from 'inversify'
import { applicationOptions, type ApplicationOptions } from '@main/application/options'
import { DesktopApplication } from '@main/application/application'
import { filesModule } from '@main/di/files'
import { systemModule } from '@main/di/system'
import { aiModule } from '@main/di/ai'
import { mcpModule } from '@main/di/mcp'
import { lifecycleModule } from '@main/di/lifecycle'

/** Each app owns its own singleton graph; only this composition boundary resolves services. */
export const createApplicationContainer = (options: ApplicationOptions): Container => {
  const container = new Container()
  container.bind<ApplicationOptions>(applicationOptions).toConstantValue(options)
  container.load(
    storageModule,
    resourcesModule,
    filesModule,
    systemModule,
    aiModule,
    mcpModule,
    lifecycleModule,
  )
  container.get(ResourceLifecycle)
  return container
}

export const createApplication = (options: ApplicationOptions) => {
  const container = createApplicationContainer(options)
  const requests = container.get(OpenFileRequests)
  let application: DesktopApplication | undefined
  let disposal: Promise<void> | undefined
  return {
    requests,
    get application(): DesktopApplication {
      application ??= container.get(DesktopApplication)
      return application
    },
    dispose: (): Promise<void> => {
      disposal ??= (async () => {
        // Revoke IPC first, then await service deactivation (AI abort and MCP stop).
        await application?.dispose()
        await container.unbindAllAsync()
      })()
      return disposal
    },
  }
}
