import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const node = process.execPath
const buildArgs = [resolve(root, 'scripts/build_standalone.mjs')]
if (process.argv.includes('--install')) buildArgs.push('--install')

const build = spawn(node, buildArgs, { cwd: root, stdio: 'inherit' })
const buildExit = await new Promise((resolveExit, reject) => {
  build.once('error', reject)
  build.once('exit', (code, signal) => resolveExit(signal ? 1 : code ?? 1))
})
if (buildExit !== 0) process.exit(buildExit)

const appDirectory = resolve(root, 'apps/plan-editor')
const viteCli = resolve(appDirectory, 'node_modules/vite/bin/vite.js')
const server = spawn(node, [viteCli, '--host', '0.0.0.0'], {
  cwd: appDirectory,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}
server.once('error', error => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
server.once('exit', (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1
})
