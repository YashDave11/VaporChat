import { io, type Socket } from "socket.io-client"
import type { ClientToServer, ServerToClient } from "@shared/protocol"

export type VaporSocket = Socket<ServerToClient, ClientToServer>

let socket: VaporSocket | null = null

/**
 * Lazy singleton: the socket is created the first time the chat app needs it,
 * so the landing page never opens a connection. Same-origin — vite proxies
 * /socket.io in dev.
 */
export function getSocket(): VaporSocket {
  if (!socket) {
    socket = io({ transports: ["websocket", "polling"] })
  }
  return socket
}
