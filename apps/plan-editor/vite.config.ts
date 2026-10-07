import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function fileAcceptanceDiskPlugin() {
  return {
    name: 'constructflow-file-acceptance-disk',
    apply: 'serve' as const,
    async configureServer(server) {
      if (process.env.CONSTRUCTFLOW_FILE_ACCEPTANCE !== '1') return

      const directory = await mkdtemp(join(tmpdir(), 'constructflow-file-acceptance-'))
      const projectPath = join(directory, `${randomUUID()}.cfproj`)
      server.middlewares.use('/__constructflow-acceptance-file', (request, response) => {
        const sendError = (status, message) => {
          response.statusCode = status
          response.end(message)
        }

        if (request.method === 'GET') {
          void readFile(projectPath).then(content => {
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            response.setHeader('X-Acceptance-File', projectPath)
            response.end(content)
          }).catch(error => sendError(error.code === 'ENOENT' ? 404 : 500, String(error)))
          return
        }

        if (request.method === 'PUT') {
          const chunks = []
          let size = 0
          request.on('data', chunk => {
            size += chunk.length
            if (size > 2_000_000) request.destroy(new Error('Acceptance project exceeds 2 MB'))
            else chunks.push(chunk)
          })
          request.on('end', () => {
            void writeFile(projectPath, Buffer.concat(chunks)).then(() => {
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
              response.end(JSON.stringify({ saved: true, path: projectPath, bytes: size }))
            }).catch(error => sendError(500, String(error)))
          })
          request.on('error', error => sendError(500, String(error)))
          return
        }

        if (request.method === 'DELETE') {
          void rm(directory, { recursive: true, force: true }).then(() => {
            response.statusCode = 204
            response.end()
          }).catch(error => sendError(500, String(error)))
          return
        }

        sendError(405, 'Method not allowed')
      })
      server.httpServer?.once('close', () => { void rm(directory, { recursive: true, force: true }) })
      console.log(`[file-acceptance] Temporary .cfproj path: ${projectPath}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), fileAcceptanceDiskPlugin()],
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor'
        },
      },
    },
  },
})
