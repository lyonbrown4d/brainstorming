import 'dotenv/config'
import { $ } from 'zx'

// macOS CEF loads its framework and helper processes from the application bundle.
const platformArguments =
  process.platform === 'darwin'
    ? ['--config', 'src-tauri/tauri.e2e.macos.conf.json', '--bundles', 'app']
    : ['--no-bundle']

await $({
  stdio: 'inherit',
  timeout: '15m',
})`pnpm tauri build --debug --features e2e --config src-tauri/tauri.e2e.conf.json ${platformArguments}`
