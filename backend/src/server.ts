import { createServer } from 'node:http'
import { handleRequest } from './app.js'

const port = Number(process.env.PORT ?? 4100)

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error: unknown) => {
    console.error(error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } }))
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`GymFlow API listening on http://127.0.0.1:${port}`)
})
