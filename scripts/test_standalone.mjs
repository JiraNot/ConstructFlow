import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const packages = [
  'packages/project-model', 'packages/representation-engine', 'packages/command-schema',
  'packages/structure-engine', 'packages/architecture-engine', 'packages/catalog-engine',
  'packages/clash-engine', 'packages/command-runtime', 'packages/extension-engine',
  'packages/takeoff-engine', 'packages/sheet-engine', 'apps/plan-editor',
]

function run(directory, args) {
  console.log(`\n${directory}: npm ${args.join(' ')}`)
  const response = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: resolve(root, directory), stdio: 'inherit', shell: process.platform === 'win32',
  })
  if (response.error) throw response.error
  if (response.status !== 0) process.exit(response.status ?? 1)
}

for (const directory of packages) {
  if (process.argv.includes('--install')) run(directory, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
  run(directory, ['run', 'build'])
}
for (const directory of ['packages/project-model', 'packages/representation-engine', 'packages/architecture-engine', 'packages/clash-engine', 'packages/sheet-engine', 'packages/command-runtime', 'packages/extension-engine']) run(directory, ['test'])
for (const verifier of ['verify:kitchen', 'verify:file-io']) run('.', ['run', verifier])
