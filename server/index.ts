import helmet from "helmet"
import { createServer } from "node:http"
import express from "express"
import { Server } from "socket.io"
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts"
import { registerHandlers } from "./handlers.ts"

const PORT = Number(process.env.PORT ?? 3001)
const IS_PROD = process.env.NODE_ENV === "production"

/**
 * CORS_ORIGIN: the frontend origin(s) allowed to connect.
 *  - unset / "false" → same-origin only (dev default)
 *  - single URL       → that one origin
 *  - comma-separated  → array of origins (e.g. "https://vapor.chat,https://www.vapor.chat")
 */
function parseCorsOrigin(): string[] | false {
  const raw = process.env.CORS_ORIGIN
  if (!raw || raw === "false") return false
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

const app = express()
app.disable("x-powered-by")

// behind Render's reverse proxy — trust one hop so req.ip is correct
if (IS_PROD) app.set("trust proxy", 1)

app.use(
  helmet({
    // CSP: the SPA is served from Vercel, not from this server, so we
    // only need headers on /health. Default-src self is fine.
    contentSecurityPolicy: IS_PROD
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
          },
        }
      : false,
    // HSTS: Render provides TLS, tell browsers to stay on HTTPS
    hsts: IS_PROD ? { maxAge: 63072000, includeSubDomains: true } : false,
    // allow browsers to sniff referrer for same-origin but not cross-origin
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
)

// nothing but a heartbeat — there is no REST API, no storage, no logs of talk
app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

// 404 handler for any unmapped routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" })
})

// Global Express error handler — logs stack trace server-side, returns generic error to client
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[express:error]", IS_PROD ? (err instanceof Error ? err.message : String(err)) : err)
  res.status(500).json({ error: "Internal Server Error" })
})

const httpServer = createServer(app)

const corsOrigin = parseCorsOrigin()

const io = new Server<ClientToServer, ServerToClient>(httpServer, {
  cors: corsOrigin
    ? { origin: corsOrigin, credentials: false }
    : { origin: false },
  // small frames only; we're a text chat, not a file drop
  maxHttpBufferSize: 4096,
  // tighter heartbeat: detect dead sockets in ~25s instead of ~45s
  pingInterval: 10000,
  pingTimeout: 15000,
})

// ---- connection-level rate limiting (per IP) ----
const connCounts = new Map<string, number>()
const MAX_CONNS_PER_IP = 12

io.use((socket, next) => {
  const forwarded = socket.handshake.headers["x-forwarded-for"]
  const ip = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : socket.handshake.address
  const count = connCounts.get(ip) ?? 0
  if (count >= MAX_CONNS_PER_IP) {
    return next(new Error("Too many connections"))
  }
  connCounts.set(ip, count + 1)
  socket.on("disconnect", () => {
    const c = connCounts.get(ip) ?? 1
    if (c <= 1) connCounts.delete(ip)
    else connCounts.set(ip, c - 1)
  })
  next()
})

registerHandlers(io)

httpServer.listen(PORT, () => {
  const origins = corsOrigin === false ? "same-origin only" : corsOrigin.join(", ")
  console.log(`[vapor] listening on :${PORT} — in-memory only, no history`)
  console.log(`[vapor] env=${IS_PROD ? "production" : "development"}  cors=${origins}`)
  if (IS_PROD && corsOrigin === false) {
    console.warn(
      "[vapor] WARNING: CORS_ORIGIN is unset — the Vercel frontend will be blocked. " +
        "Set CORS_ORIGIN to your frontend origin(s) in the Render dashboard."
    )
  }
})

// a bound-port failure (e.g. PORT taken) must be loud, not silent
httpServer.on("error", (err) => {
  console.error(`[vapor] FATAL: server failed to start on :${PORT} —`, err instanceof Error ? err.message : err)
  process.exit(1)
})

// ---- global error safety net ----
// log but don't crash — in prod hide stack traces from stdout
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", IS_PROD ? err.message : err)
})
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", IS_PROD ? String(err) : err)
})
