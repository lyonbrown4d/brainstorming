import { app, dialog, protocol } from 'electron'
import { desktopConfig } from '@main/config'
import { createApplication } from '@main/di/container'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'brainstorming-resource',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])
app.setName('Brainstorming')
if (!app.requestSingleInstanceLock()) app.quit()
else {
  const runtime = createApplication({
    storageDirectory: app.getPath('userData'),
    rendererURL: app.isPackaged ? undefined : desktopConfig.rendererURL,
    platform: process.platform,
  })
  runtime.requests.enqueueArguments(process.argv)
  const earlyOpen = (event: Electron.Event, path: string): void => {
    event.preventDefault()
    runtime.requests.enqueue(path)
  }
  const earlySecond = (_event: Electron.Event, arguments_: string[]): void => {
    runtime.requests.enqueueArguments(arguments_)
  }
  app.on('open-file', earlyOpen)
  app.on('second-instance', earlySecond)
  void app
    .whenReady()
    .then(async () => {
      app.removeListener('open-file', earlyOpen)
      app.removeListener('second-instance', earlySecond)
      const application = runtime.application
      application.attach(app, runtime.dispose)
      await application.start()
    })
    .catch(async () => {
      await runtime.dispose()
      dialog.showErrorBox(
        '无法启动 Brainstorming',
        '本地应用数据无法初始化，请检查存储空间与目录权限。',
      )
      app.quit()
    })
}
