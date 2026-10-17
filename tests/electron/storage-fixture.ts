import { LocalDatabase } from '@main/storage/database'
import { validateRecoveryIndex } from '@main/workspace-recovery/repository'
import { isAppLanguage } from '@shared/language'

const run = async (): Promise<void> => {
  const [operation, directory, payload] = process.argv.slice(2)
  if (!directory) throw new Error('Missing test storage directory')
  const database = new LocalDatabase(directory)
  try {
    let result: unknown = null
    switch (operation) {
      case 'language:set':
        if (!isAppLanguage(payload)) throw new Error('Invalid test language')
        await database.preferences.setLanguage(payload)
        break
      case 'language:get':
        result = await database.preferences.getLanguage()
        break
      case 'recovery:read':
        result = await database.recoveryIndex.read()
        break
      case 'recovery:replace': {
        const entries: unknown = JSON.parse(payload ?? 'null')
        await database.recoveryIndex.replace(validateRecoveryIndex(entries))
        break
      }
      default:
        throw new Error(`Unknown storage fixture operation: ${operation ?? ''}`)
    }
    process.stdout.write(JSON.stringify(result))
  } finally {
    database.close()
  }
}
await run()
