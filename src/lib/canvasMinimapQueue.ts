import {
  animationFrameScheduler,
  asyncScheduler,
  observeOn,
  scheduled,
  Subject,
  switchMap,
  timer,
  type SchedulerLike,
} from 'rxjs'

interface MinimapSchedulers {
  readonly quiet?: SchedulerLike
  readonly frame?: SchedulerLike
  readonly task?: SchedulerLike
}

/** New main-canvas work cancels even an overview task already waiting behind its frame. */
export const createCanvasMinimapQueue = (flush: () => void, schedulers: MinimapSchedulers = {}) => {
  const updates = new Subject<'update' | 'finish'>()
  const frame = () =>
    scheduled([undefined], schedulers.frame ?? animationFrameScheduler).pipe(
      observeOn(schedulers.task ?? asyncScheduler),
    )
  const subscription = updates
    .pipe(
      switchMap((kind) =>
        kind === 'finish'
          ? frame()
          : timer(80, schedulers.quiet ?? asyncScheduler).pipe(switchMap(frame)),
      ),
    )
    .subscribe(flush)
  return {
    request: () => {
      updates.next('update')
    },
    finish: () => {
      updates.next('finish')
    },
    unsubscribe: () => {
      subscription.unsubscribe()
      updates.complete()
    },
  }
}
