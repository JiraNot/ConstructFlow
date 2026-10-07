import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageDirectories = [
  'packages/project-model',
  'packages/representation-engine',
  'packages/command-schema',
  'packages/structure-engine',
  'packages/architecture-engine',
  'packages/catalog-engine',
  'packages/clash-engine',
  'packages/command-runtime',
  'packages/extension-engine',
  'packages/takeoff-engine',
  'packages/sheet-engine',
]
const windows = process.platform === 'win32'

function run(directory, args) {
  process.stdout.write(`\n${directory}: npm ${args.join(' ')}\n`)
  const command = windows ? process.env.ComSpec ?? 'cmd.exe' : 'npm'
  const commandArgs = windows ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args
  const result = spawnSync(command, commandArgs, {
    cwd: resolve(root, directory),
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const install = process.argv.includes('--install')
if (install) {
  for (const directory of packageDirectories) {
    run(directory, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
  }
}
for (const directory of packageDirectories) run(directory, ['run', 'build'])

const app = 'apps/plan-editor'
if (install) run(app, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
else run(app, ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
run(app, ['run', 'build'])
