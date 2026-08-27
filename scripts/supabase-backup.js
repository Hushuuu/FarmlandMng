import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const backupScript = resolve(rootDir, 'scripts', 'backup-supabase.mjs')
const outputDir = process.env.BACKUP_OUTPUT_DIR?.trim()
const forwardedArgs = process.argv.slice(2)
const args = [backupScript, ...forwardedArgs]

if (outputDir && !forwardedArgs.includes('--output-dir')) {
  args.push('--output-dir', outputDir)
}

const result = spawnSync(process.execPath, args, {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
  windowsHide: false,
})

if (result.error) {
  console.error(`無法啟動 Supabase 備份程序：${result.error.message}`)
  process.exitCode = 1
} else if (result.signal) {
  console.error(`Supabase 備份程序被訊號 ${result.signal} 終止。`)
  process.exitCode = 1
} else {
  process.exitCode = result.status ?? 1
}
