import { io, type Socket } from "socket.io-client"
import type { ClientToServer, ServerToClient } from "@shared/protocol"

export type VaporSocket = Socket<ServerToClient, ClientToServer>

let socket: VaporSocket | null = null

/**
 * Lazy singleton: the socket is created the first time the chat app needs it,
 * so the landing page never opens a connection. In dev, vite proxies /socket.io
 * (same-origin). In production with a split deploy (Vercel frontend + Render
 * backend), VITE_API_URL points at the backend origin.
 */
export function getSocket(): VaporSocket {
  if (!socket) {
    const url = import.meta.env.VITE_API_URL || undefined
    socket = io(url, { transports: ["websocket", "polling"] })
  }
  return socket
}
