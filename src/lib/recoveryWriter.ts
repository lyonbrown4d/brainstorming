import { catchError, concatMap, debounceTime, defer, EMPTY, Subject } from 'rxjs'

/** Coalesce typing and serialize recovery writes; a failed write never kills later recovery. */
export const createRecoveryWriter = (
  write: () => Promise<void>,
  failed: (error: unknown) => void,
) => {
  const requests = new Subject<boolean>()
  const subscription = requests
    .pipe(
      debounceTime(700),
      concatMap((enabled) =>
        enabled
          ? defer(write).pipe(
              catchError((error: unknown) => {
                failed(error)
                return EMPTY
              }),
            )
          : EMPTY,
      ),
    )
    .subscribe()
  return {
    schedule: () => {
      requests.next(true)
    },
    cancel: () => {
      requests.next(false)
    },
    dispose: () => {
      subscription.unsubscribe()
      requests.complete()
    },
  }
}
