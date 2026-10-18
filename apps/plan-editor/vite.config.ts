import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

export default defineConfig(({ command }) => {
  const development = command === 'serve'
  const csp = [
    "default-src 'self' data: blob:",
    `script-src 'self' blob: 'wasm-unsafe-eval'${development ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' data: blob:${development ? ' http://localhost:8000 http://127.0.0.1:8000 ws://localhost:5183 ws://127.0.0.1:5183 ws://localhost:5184 ws://127.0.0.1:5184 ws://localhost:8765 ws://127.0.0.1:8765' : ''}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  const securityHeaders = {
    'Content-Security-Policy': csp,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Origin-Agent-Cluster': '?1',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }
  const aiGatewayTarget = process.env.CONSTRUCTFLOW_AI_GATEWAY_TARGET ?? 'http://127.0.0.1:8000'
  return {
  plugins: [react(), fileAcceptanceDiskPlugin()],
  optimizeDeps: { include: ['@constructflow/geometry-kernel > earcut', 'three', 'three/addons/controls/OrbitControls.js', 'three/addons/loaders/GLTFLoader.js', 'three/addons/loaders/OBJLoader.js', '@mlightcad/libredwg-web'] },
  resolve: {
    alias: {
      '@constructflow/constraint-engine': fileURLToPath(new URL('../../packages/constraint-engine/dist/index.js', import.meta.url)),
      '@constructflow/architecture-engine': fileURLToPath(new URL('../../packages/architecture-engine/dist/index.js', import.meta.url)),
      '@constructflow/laser-survey': fileURLToPath(new URL('../../packages/laser-survey/dist/index.js', import.meta.url)),
    },
  },
  server: {
    // Expose Vite to other devices on the user's private LAN, not just loopback.
    host: '0.0.0.0',
    port: 5183,
    strictPort: true,
    headers: securityHeaders,
    proxy: {
      '/api/ai': { target: aiGatewayTarget, changeOrigin: true },
    },
  },
  preview: {
    headers: securityHeaders,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor'
          if (id.includes('/node_modules/pdf-lib/')) return 'pdf-lib-vendor'
          if (id.includes('/node_modules/@pdf-lib/fontkit/')) return 'pdf-font-vendor'
          if (
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/scheduler/')
          ) return 'react-vendor'
        },
      },
    },
  },
  }
})
