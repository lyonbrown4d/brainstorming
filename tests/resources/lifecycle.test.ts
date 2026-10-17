import { describe, expect, it, vi } from 'vitest'
import { ResourceLifecycle } from '@main/resources/lifecycle'

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
const createLifecycle = (
  callbacks: {
    protocol?: () => void
    previews?: () => Promise<void>
    library?: () => Promise<void>
    documents?: () => Promise<void>
  } = {},
) => {
  const events: string[] = []
  const protocol = {
    dispose: vi.fn(() => {
      events.push('protocol')
      callbacks.protocol?.()
    }),
  }
  const previews = {
    dispose: vi.fn(async () => {
      events.push('previews')
      await callbacks.previews?.()
    }),
  }
  const library = {
    dispose: vi.fn(async () => {
      events.push('library')
      await callbacks.library?.()
    }),
  }
  const documents = {
    dispose: vi.fn(async () => {
      events.push('documents')
      await callbacks.documents?.()
    }),
  }
  const lifecycle = new ResourceLifecycle(previews, library, documents, protocol)
  return { lifecycle, events, protocol, previews, library, documents }
}

describe('resource dependency shutdown', () => {
  it('revokes the protocol, drains producers and library, then closes storage exactly once', async () => {
    const producers = deferred()
    const library = deferred()
    const enteredLibrary = deferred()
    const fixture = createLifecycle({
      previews: () => producers.promise,
      library: () => {
        enteredLibrary.resolve()
        return library.promise
      },
    })
    const first = fixture.lifecycle.dispose()
    expect(fixture.lifecycle.dispose()).toBe(first)
    expect(fixture.events).toEqual(['protocol', 'previews'])
    expect(fixture.documents.dispose).not.toHaveBeenCalled()
    producers.resolve()
    await enteredLibrary.promise
    expect(fixture.events).toEqual(['protocol', 'previews', 'library'])
    expect(fixture.documents.dispose).not.toHaveBeenCalled()
    library.resolve()
    await first
    expect(fixture.events).toEqual(['protocol', 'previews', 'library', 'documents'])
    await fixture.lifecycle.dispose()
    for (const service of [fixture.protocol, fixture.previews, fixture.library, fixture.documents])
      expect(service.dispose).toHaveBeenCalledTimes(1)
  })

  it.each(['previews', 'library', 'protocol'] as const)(
    'continues dependency cleanup after a %s failure',
    async (stage) => {
      const failure = new Error(`${stage} failed`)
      const callbacks =
        stage === 'protocol'
          ? {
              protocol: () => {
                throw failure
              },
            }
          : { [stage]: () => Promise.reject(failure) }
      const fixture = createLifecycle(callbacks)
      const first = fixture.lifecycle.dispose()
      await expect(first).rejects.toBe(failure)
      expect(fixture.events).toEqual(['protocol', 'previews', 'library', 'documents'])
      expect(fixture.lifecycle.dispose()).toBe(first)
    },
  )
})
