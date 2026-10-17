import type { LanguageStore } from '@main/language'
import type { WindowSession } from '@main/application/session'
import type { MenuAction } from '@shared/contracts'
import type { AppLanguage } from '@shared/language'

export class NativeMenu {
  constructor(
    readonly language: LanguageStore,
    private readonly session: WindowSession,
    private readonly install: (send: (action: MenuAction) => void, language: AppLanguage) => void,
  ) {}

  initialize = async (): Promise<void> => {
    await this.language.initialize()
    this.rebuild(await this.language.get())
  }

  setLanguage = async (language: AppLanguage): Promise<AppLanguage> => {
    const selected = await this.language.set(language)
    this.rebuild(selected)
    return selected
  }

  private rebuild = (language: AppLanguage): void => {
    this.install((action) => this.session.window?.webContents.send('menu:action', action), language)
  }
}
