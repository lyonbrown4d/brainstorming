import { ResourceLibrary } from '@main/resources/library'
import { ContainerModule } from 'inversify'
import { clipboard, ClipboardItem, dialog, nativeImage, shell } from 'electron'
import { AssetFiles, type AssetPorts } from '@main/system/assets'
import { SystemEditing, type EditingPorts } from '@main/system/editing'

export const assetPorts = Symbol('AssetPorts')
export const editingPorts = Symbol('EditingPorts')
export const documentDialogs = Symbol('DocumentDialogs')

export const systemModule = new ContainerModule(({ bind }) => {
  bind<AssetPorts>(assetPorts)
    .toDynamicValue(() => ({
      showOpenDialog: (window, options) => dialog.showOpenDialog(window, options),
      showSaveDialog: (window, options) => dialog.showSaveDialog(window, options),
      decodeImage: (bytes) => !nativeImage.createFromBuffer(bytes).isEmpty(),
    }))
    .inSingletonScope()
  bind<EditingPorts>(editingPorts)
    .toDynamicValue(() => ({
      clipboard,
      createClipboardItem: (data) => new ClipboardItem(data),
      showSaveDialog: (window, options) => dialog.showSaveDialog(window, options),
      openExternal: (url) => shell.openExternal(url),
    }))
    .inSingletonScope()
  bind(documentDialogs)
    .toDynamicValue(() => dialog)
    .inSingletonScope()
  bind(AssetFiles)
    .toResolvedValue(
      (ports: AssetPorts, resources: ResourceLibrary) => new AssetFiles(ports, resources),
      [assetPorts, ResourceLibrary],
    )
    .inSingletonScope()
  bind(SystemEditing)
    .toResolvedValue((ports: EditingPorts) => new SystemEditing(ports), [editingPorts])
    .inSingletonScope()
})
