import type Database from 'better-sqlite3'
import { CompiledQuery, Kysely, SqliteDialect } from 'kysely'

/** All business statements execute through Kysely; the driver is retained only for cipher/PRAGMA APIs. */
export class NativeConnection {
  readonly kysely: Kysely<unknown>
  readonly driver: Database.Database & {
    key: (key: Buffer) => number
    rekey: (key: Buffer) => number
  }
  constructor(driver: Database.Database) {
    this.driver = driver as typeof this.driver
    this.kysely = new Kysely<unknown>({ dialect: new SqliteDialect({ database: driver }) })
  }
  prepare = (statement: string) => ({
    all: async (...parameters: readonly unknown[]): Promise<unknown[]> => {
      return (await this.kysely.executeQuery(CompiledQuery.raw(statement, [...parameters]))).rows
    },
    get: async (...parameters: readonly unknown[]): Promise<unknown> => {
      return (await this.kysely.executeQuery(CompiledQuery.raw(statement, [...parameters]))).rows[0]
    },
    run: async (...parameters: readonly unknown[]): Promise<void> => {
      await this.kysely.executeQuery(CompiledQuery.raw(statement, [...parameters]))
    },
  })
  exec = async (statement: string): Promise<void> => {
    await this.kysely.executeQuery(CompiledQuery.raw(statement))
  }
  close = async (): Promise<void> => {
    await this.kysely.destroy()
  }
}
