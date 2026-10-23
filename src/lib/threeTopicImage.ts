export const loadSceneImage = (
  src: string,
  signal: AbortSignal,
): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null)
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    const finish = (result: HTMLImageElement | null) => {
      signal.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
      resolve(result)
    }
    const abort = () => {
      image.src = ''
      finish(null)
    }
    signal.addEventListener('abort', abort, { once: true })
    image.onload = () => {
      finish(image)
    }
    image.onerror = () => {
      finish(null)
    }
    image.src = src
  })
