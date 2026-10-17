import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { type AISettings, type AISettingsInput } from '@shared/ai'
import { object, validateSettings } from '@main/ai/validation'

export interface KeyStorage {
  readonly isEncryptionAvailable: () => boolean
  readonly getSelectedStorageBackend?: () => string
  readonly encryptString: (value: string) => Buffer
  readonly decryptString: (value: Buffer) => string
}
export interface PrivateAISettings {
  baseURL: string
  model: string
  apiKey: string
  structuredOutputs: boolean
}
const defaults: AISettingsInput = {
  baseURL: 'https://api.openai.com/v1',
  model: '',
  rememberKey: true,
  structuredOutputs: true,
}
export class AISettingsStore {
  private settings = { ...defaults }
  private key = ''
  private persistedKey: string | undefined
  private initialized: Promise<void> | undefined
  private queue: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly directory: string,
    private readonly storage: KeyStorage,
  ) {}
  private secure = (): boolean => {
    return (
      this.storage.isEncryptionAvailable() &&
      this.storage.getSelectedStorageBackend?.() !== 'basic_text'
    )
  }
  private initialize = (): Promise<void> => {
    this.initialized ??= this.load()
    return this.initialized
  }
  private load = async (): Promise<void> => {
    try {
      const bytes = await readFile(join(this.directory, 'ai-settings.json'))
      if (bytes.length > 16384) throw new Error('AI 设置文件超过限制')
      const record = object(JSON.parse(bytes.toString('utf8')) as unknown)
      if (
        Object.keys(record).some(
          (key) =>
            !['baseURL', 'model', 'rememberKey', 'structuredOutputs', 'encryptedKey'].includes(key),
        )
      )
        throw new Error('AI 设置包含不支持的字段')
      const { encryptedKey, ...settings } = record
      this.settings = validateSettings(settings)
      if (encryptedKey !== undefined) {
        if (
          typeof encryptedKey !== 'string' ||
          encryptedKey.length > 12000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(encryptedKey)
        )
          throw new Error('AI 密钥存储格式无效')
        this.persistedKey = encryptedKey
        if (this.secure())
          this.key = this.storage.decryptString(Buffer.from(encryptedKey, 'base64'))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('无法读取 AI 设置，请重新保存服务配置')
    }
  }
  private view = (): AISettings => {
    return {
      baseURL: this.settings.baseURL,
      model: this.settings.model,
      rememberKey: this.settings.rememberKey,
      structuredOutputs: this.settings.structuredOutputs,
      hasKey: !!this.key,
      keyStorage: this.key ? (this.persistedKey && this.secure() ? 'encrypted' : 'memory') : 'none',
      notice: !this.secure()
        ? '系统安全存储不可用，密钥仅在本次运行保留；关闭应用后需重新输入。'
        : null,
    }
  }
  get = async (): Promise<AISettings> => {
    await this.queue.catch(() => undefined)
    await this.initialize()
    return this.view()
  }
  privateSettings = async (): Promise<PrivateAISettings> => {
    await this.queue.catch(() => undefined)
    await this.initialize()
    return {
      baseURL: this.settings.baseURL,
      model: this.settings.model,
      structuredOutputs: this.settings.structuredOutputs,
      apiKey: this.key,
    }
  }
  save = (input: unknown): Promise<AISettings> => {
    const next = validateSettings(input)
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.initialize()
        } catch {
          this.settings = { ...defaults }
          this.persistedKey = undefined
          this.key = ''
          this.initialized = Promise.resolve()
        }
        const providedKey = next.apiKey?.trim()
        const newKey = next.clearKey
          ? ''
          : providedKey !== undefined && providedKey.length > 0
            ? providedKey
            : next.baseURL === this.settings.baseURL
              ? this.key
              : ''
        const encryptedKey =
          newKey && next.rememberKey && this.secure()
            ? this.storage.encryptString(newKey).toString('base64')
            : undefined
        const settings = {
          baseURL: next.baseURL,
          model: next.model,
          rememberKey: next.rememberKey,
          structuredOutputs: next.structuredOutputs,
        }
        await mkdir(this.directory, { recursive: true })
        await writeFileAtomic(
          join(this.directory, 'ai-settings.json'),
          JSON.stringify({ ...settings, ...(encryptedKey ? { encryptedKey } : {}) }),
          { mode: 0o600 },
        )
        this.settings = settings
        this.key = newKey
        this.persistedKey = encryptedKey
        return this.view()
      })
    this.queue = operation
    return operation
  }
}
