import type { PreferencesRepository } from '@main/storage/repositories'
import { preferencesRepository } from '@main/di/storage'
import { LanguageStore } from '@main/language'
import { NativeMenu } from '@main/application/nativeMenu'
import { ContainerModule } from 'inversify'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { applicationOptions, type ApplicationOptions } from '@main/application/options'
import { WindowSession } from '@main/application/session'
import { WindowLifecycle, type WindowPorts } from '@main/application/window'
import { IPCRegistry } from '@main/application/ipcRegistry'
import { ApplicationIPC } from '@main/application/ipc'
import { DesktopApplication } from '@main/application/application'
import { DocumentFiles } from '@main/files'
import { OpenFileRequests } from '@main/openFiles'
import { AssetFiles } from '@main/system/assets'
import { SystemEditing } from '@main/system/editing'
import { AIService } from '@main/ai/application'
import { MCPService } from '@main/mcp/application'
import { StartupWindow } from '@main/startupWindow'
import { installWindowChrome } from '@main/windowChrome'
import { installMenu } from '@main/menu'
import { documentDialogs } from '@main/di/system'

export const windowPorts = Symbol('WindowPorts')
export const lifecycleModule = new ContainerModule(({ bind }) => {
  bind(WindowSession)
    .toDynamicValue(() => new WindowSession())
    .inSingletonScope()
  bind<WindowPorts>(windowPorts)
    .toResolvedValue(
      (options: ApplicationOptions, language: LanguageStore) => ({
        createWindow: (settings) => new BrowserWindow(settings),
        createStartup: (cancel, complete) =>
          new StartupWindow(options.rendererURL, cancel, complete, async () => {
            await language.initialize()
            return language.get()
          }),
        installChrome: installWindowChrome,
        showMessageBox: (window, options) => dialog.showMessageBox(window, options),
        showErrorBox: (title, content) => {
          dialog.showErrorBox(title, content)
        },
        quit: () => {
          app.quit()
        },
      }),
      [applicationOptions, LanguageStore],
    )
    .inSingletonScope()
  bind(LanguageStore)
    .toResolvedValue(
      (preferences: PreferencesRepository) => new LanguageStore(preferences, () => app.getLocale()),
      [preferencesRepository],
    )
    .inSingletonScope()
  bind(NativeMenu)
    .toResolvedValue(
      (language: LanguageStore, session: WindowSession) =>
        new NativeMenu(language, session, installMenu),
      [LanguageStore, WindowSession],
    )
    .inSingletonScope()
  bind(WindowLifecycle)
    .toResolvedValue(
      (
        session: WindowSession,
        files: DocumentFiles,
        options: ApplicationOptions,
        ports: WindowPorts,
        language: LanguageStore,
      ) => new WindowLifecycle(session, files, options, ports, language),
      [WindowSession, DocumentFiles, applicationOptions, windowPorts, LanguageStore],
    )
    .inSingletonScope()
    .onDeactivation((windows) => {
      windows.dispose()
    })
  bind(IPCRegistry)
    .toDynamicValue(() => new IPCRegistry(ipcMain))
    .inSingletonScope()
    .onDeactivation((ipc) => {
      ipc.dispose()
    })
  bind(ApplicationIPC)
    .toResolvedValue(
      (
        ipc: IPCRegistry,
        session: WindowSession,
        files: DocumentFiles,
        requests: OpenFileRequests,
        assets: AssetFiles,
        editing: SystemEditing,
        ai: AIService,
        mcp: MCPService,
        menu: NativeMenu,
        dialogs: typeof dialog,
      ) =>
        new ApplicationIPC(ipc, session, files, requests, assets, editing, ai, mcp, menu, dialogs),
      [
        IPCRegistry,
        WindowSession,
        DocumentFiles,
        OpenFileRequests,
        AssetFiles,
        SystemEditing,
        AIService,
        MCPService,
        NativeMenu,
        documentDialogs,
      ],
    )
    .inSingletonScope()
    .onDeactivation((ipc) => {
      ipc.dispose()
    })
  bind(DesktopApplication)
    .toResolvedValue(
      (
        session: WindowSession,
        files: DocumentFiles,
        requests: OpenFileRequests,
        windows: WindowLifecycle,
        ipc: ApplicationIPC,
        menu: NativeMenu,
        ai: AIService,
        mcp: MCPService,
      ) => new DesktopApplication(session, files, requests, windows, ipc, menu, ai, mcp),
      [
        WindowSession,
        DocumentFiles,
        OpenFileRequests,
        WindowLifecycle,
        ApplicationIPC,
        NativeMenu,
        AIService,
        MCPService,
      ],
    )
    .inSingletonScope()
    .onDeactivation((application) => application.dispose())
})
