import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultBackupRoot = join(rootDir, 'backups', 'supabase')
const supabaseCliEntryPoint = join(
  rootDir,
  'node_modules',
  'supabase',
  'dist',
  'supabase.js',
)
const cliDisplayCommand = 'npx supabase'

const dumpJobs = [
  {
    fileName: 'roles.sql',
    flags: ['--role-only'],
  },
  {
    fileName: 'schema.sql',
    flags: [],
  },
  {
    fileName: 'data.sql',
    flags: [
      '--use-copy',
      '--data-only',
      '--exclude',
      'storage.buckets_vectors',
      '--exclude',
      'storage.vector_indexes',
    ],
  },
]

function printUsage() {
  console.log(`Usage: npm run db:backup [-- --dry-run] [-- --output-dir <path>]

Creates a timestamped Supabase logical backup containing roles.sql, schema.sql,
and data.sql. Set SUPABASE_DB_PASSWORD to avoid the CLI password prompt.`)
}

function parseArgs() {
  const args = process.argv.slice(2)
  let dryRun = false
  let outputDir

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    if (arg === '--output-dir') {
      const value = args[index + 1]
      if (!value) {
        throw new Error('--output-dir 需要指定資料夾路徑')
      }
      outputDir = resolve(rootDir, value)
      index += 1
      continue
    }

    throw new Error(`不支援的參數：${arg}`)
  }

  if (!outputDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    outputDir = join(defaultBackupRoot, timestamp)
  }

  return { dryRun, outputDir }
}

function readDotEnvValue(name) {
  const envPath = join(rootDir, '.env')
  if (!existsSync(envPath)) {
    return undefined
  }

  const prefix = `${name}=`
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith(prefix))

  if (!line) {
    return undefined
  }

  const value = line.slice(line.indexOf('=') + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function projectRefFromUrl(value) {
  try {
    const hostname = new URL(value).hostname
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i)
    return match?.[1]
  } catch {
    return undefined
  }
}

function getProjectRef() {
  const explicitProjectRef =
    process.env.SUPABASE_PROJECT_REF || readDotEnvValue('SUPABASE_PROJECT_REF')
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || readDotEnvValue('VITE_SUPABASE_URL')
  const linkedProjectPath = join(rootDir, 'supabase', '.temp', 'project-ref')
  const linkedProjectRef = existsSync(linkedProjectPath)
    ? readFileSync(linkedProjectPath, 'utf8').trim()
    : undefined
  const projectRef =
    explicitProjectRef || projectRefFromUrl(supabaseUrl) || linkedProjectRef

  if (!projectRef) {
    throw new Error(
      '找不到 Supabase project ref。請設定 SUPABASE_PROJECT_REF，或在 .env 提供 VITE_SUPABASE_URL。',
    )
  }

  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('Supabase project ref 格式不正確，應為 20 個小寫英數字元。')
  }

  if (linkedProjectRef && linkedProjectRef !== projectRef) {
    throw new Error(
      `目前 CLI 連結的 project ref (${linkedProjectRef}) 與設定的 project ref (${projectRef}) 不一致。`,
    )
  }

  return projectRef
}

function displayCommand(args) {
  return [cliDisplayCommand, ...args]
    .map((arg, index, allArgs) => {
      if (allArgs[index - 1] === '--password') {
        return '[REDACTED]'
      }
      return /\s/.test(arg) ? JSON.stringify(arg) : arg
    })
    .join(' ')
}

function ensureSupabaseCliIsInstalled() {
  if (!existsSync(supabaseCliEntryPoint)) {
    throw new Error(
      '找不到本機 Supabase CLI。請先執行 npm install，再重新執行 npm run db:backup。',
    )
  }
}

function ensureDockerIsRunning() {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      cwd: rootDir,
      stdio: 'ignore',
      windowsHide: false,
    })
  } catch {
    throw new Error(
      'Supabase CLI 的 db dump 需要正在執行的 Docker Desktop。請先啟動 Docker Desktop，再重新執行 npm run db:backup。',
    )
  }
}

function runDump({ fileName, flags }, outputDir, projectRef, password, dryRun) {
  const outputPath = join(outputDir, fileName)
  const args = [
    'db',
    'dump',
    '--project-ref',
    projectRef,
    '--file',
    outputPath,
    ...flags,
  ]

  if (password) {
    args.push('--password', password)
  }

  if (dryRun) {
    console.log(displayCommand(args))
    return
  }

  try {
    execFileSync(process.execPath, [supabaseCliEntryPoint, ...args], {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
      windowsHide: false,
    })
  } catch (error) {
    const exitCode =
      error && typeof error.status === 'number'
        ? `exit code ${error.status}`
        : 'command error'
    throw new Error(`${fileName} 建立失敗（${exitCode}）。請查看上方 CLI 輸出。`)
  }

  if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
    throw new Error(`${fileName} 建立後不存在或是空檔案。`)
  }
}

function writeManifest(outputDir, projectRef, createdAt) {
  const manifest = {
    format: 1,
    projectRef,
    createdAt,
    files: dumpJobs.map(({ fileName }) => fileName),
    restoreOrder: ['roles.sql', 'schema.sql', 'data.sql'],
  }

  writeFileSync(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
}

function main() {
  const { dryRun, outputDir } = parseArgs()
  const projectRef = getProjectRef()
  const password = process.env.SUPABASE_DB_PASSWORD
  const createdAt = new Date().toISOString()

  console.log(`Supabase project: ${projectRef}`)
  console.log(`Backup directory: ${outputDir}`)

  if (dryRun) {
    console.log('\nDry run:')
    dumpJobs.forEach((job) =>
      runDump(job, outputDir, projectRef, password, true),
    )
    return
  }

  ensureSupabaseCliIsInstalled()
  ensureDockerIsRunning()
  mkdirSync(dirname(outputDir), { recursive: true })
  mkdirSync(outputDir, { recursive: false })

  try {
    dumpJobs.forEach((job) => {
      console.log(`\nCreating ${job.fileName}...`)
      runDump(job, outputDir, projectRef, password, false)
    })
    writeManifest(outputDir, projectRef, createdAt)
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} 部分檔案可能已留在 ${outputDir}。`,
    )
  }

  console.log(`\nBackup completed: ${outputDir}`)
}

try {
  main()
} catch (error) {
  console.error(
    `\nSupabase backup failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  )
  process.exitCode = 1
}
