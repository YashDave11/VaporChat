import { createServer } from "node:http"
import express from "express"
import { Server } from "socket.io"
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts"
import { registerHandlers } from "./handlers.ts"

const PORT = Number(process.env.PORT ?? 3001)

const app = express()
app.disable("x-powered-by")

// nothing but a heartbeat — there is no REST API, no storage, no logs of talk
app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

const httpServer = createServer(app)

const io = new Server<ClientToServer, ServerToClient>(httpServer, {
  // dev: vite proxies /socket.io, so same-origin. Keep CORS closed by default.
  cors: { origin: false },
  // small frames only; we're a text chat, not a file drop
  maxHttpBufferSize: 4096,
})

registerHandlers(io)

httpServer.listen(PORT, () => {
  console.log(`vapor server listening on :${PORT} — in-memory only, no history`)
})
