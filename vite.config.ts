import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'mineru-upload-proxy',
      configureServer(server) {
        server.middlewares.use('/api/mineru-upload', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }
          let raw = ''
          req.on('data', (chunk) => { raw += chunk })
          req.on('end', async () => {
            try {
              const payload = JSON.parse(raw || '{}') as {
                uploadUrl?: string
                fileBase64?: string
                contentType?: string
                method?: string
                headers?: Record<string, string>
                formFields?: Record<string, string>
                fileFieldName?: string
                fileName?: string
              }
              if (!payload.uploadUrl || !payload.fileBase64) {
                res.statusCode = 400
                res.end('Bad Request')
                return
              }
              const body = Buffer.from(payload.fileBase64, 'base64')
              const method = (payload.method || 'PUT').toUpperCase()
              const sanitizeHeaders = (headers?: Record<string, string>) => {
                const out: Record<string, string> = {}
                if (!headers) return out
                for (const [k, v] of Object.entries(headers)) {
                  const key = k.toLowerCase()
                  if (['host', 'content-length'].includes(key)) continue
                  if (method === 'POST' && key === 'content-type') continue
                  out[k] = v
                }
                return out
              }
              let upstream: Response
              if (method === 'POST' && payload.formFields && Object.keys(payload.formFields).length > 0) {
                const form = new FormData()
                for (const [k, v] of Object.entries(payload.formFields)) form.append(k, String(v))
                form.append(payload.fileFieldName || 'file', new Blob([body], { type: payload.contentType || 'application/octet-stream' }), payload.fileName || 'file.bin')
                const postHeaders = sanitizeHeaders(payload.headers)
                upstream = await fetch(payload.uploadUrl, { method: 'POST', body: form, headers: Object.keys(postHeaders).length > 0 ? postHeaders : undefined })
              } else {
                const headers = sanitizeHeaders(payload.headers)
                upstream = await fetch(payload.uploadUrl, {
                  method,
                  headers: Object.keys(headers).length > 0 ? headers : undefined,
                  body
                })
              }
              const text = await upstream.text()
              res.statusCode = upstream.status
              res.end(text || 'ok')
            } catch (err) {
              res.statusCode = 500
              res.end(err instanceof Error ? err.message : 'proxy error')
            }
          })
        })
      }
    }
  ],
  server: {
    proxy: {
      '/api/paddle-layout': {
        target: 'https://7bj8i4gb0bp656t9.aistudio-app.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/paddle-layout/, '/layout-parsing')
      },
      '/api/mineru': {
        target: 'https://mineru.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mineru/, '')
      }
    }
  }
})
