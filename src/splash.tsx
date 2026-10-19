import { createRoot } from 'react-dom/client'
import { initializeAppearance } from '@renderer/appearanceBootstrap'
import { SplashScreen } from '@renderer/components/splash/SplashScreen'
import { useSplashStartup } from '@renderer/components/splash/useSplashStartup'

initializeAppearance()

const Splash = () => {
  const startup = useSplashStartup()
  return (
    <SplashScreen
      phase={startup.phase}
      language={startup.language}
      retrying={startup.retrying}
      onRetry={() => {
        void startup.retry()
      }}
      onQuit={startup.quit}
    />
  )
}

const container = document.getElementById('splash-root')
if (!container) throw new Error('启动窗口挂载点不存在')
createRoot(container).render(<Splash />)
