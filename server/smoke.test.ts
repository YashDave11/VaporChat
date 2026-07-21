import "../server/index.ts"
import { io as ioc } from "socket.io-client"

const url = "http://localhost:3001"

function log(...args: unknown[]) {
  console.log(...args)
}

async function main() {
  await new Promise((r) => setTimeout(r, 400))
  const a = ioc(url)
  const b = ioc(url)

  a.emit("session:hello", { name: "alice" })
  b.emit("session:hello", { name: "" })

  a.on("session:ready", (p: { name: string }) => log("A ready as", p.name))
  b.on("session:ready", (p: { name: string }) => log("B ready as", p.name))

  let phase = "stranger"

  a.on("room:joined", (p: any) => {
    log("A joined", p.kind, "peers:", p.peers, p.key ?? "")
    if (p.kind === "private") {
      log("private key:", p.key)
      b.emit("room:join", { key: p.key.toLowerCase() })
    }
  })
  b.on("room:joined", (p: any) => {
    log("B joined", p.kind, "peers:", p.peers)
    if (p.kind === "stranger") {
      a.emit("room:message", { text: "hello there" })
    }
    if (p.kind === "private") {
      b.emit("room:join", { key: "ZZZZ" })
    }
  })
  b.on("room:message", (m: any) => {
    log("B got:", m.from, "->", m.text, "self:", m.self)
    if (phase === "stranger") {
      phase = "private"
      a.emit("room:create")
    }
  })
  a.on("room:message", (m: any) => log("A echo:", m.text, "self:", m.self))
  b.on("room:closed", (p: any) => log("B room closed:", p.reason))
  b.on("app:error", (e: any) => {
    log("B error:", e.code, "-", e.message)
    // rate limit test: spam from A
    for (let i = 0; i < 10; i++) a.emit("room:message", { text: "spam " + i })
  })
  a.on("app:error", (e: any) => {
    log("A error:", e.code, "-", e.message)
    log("DONE")
    process.exit(0)
  })

  setTimeout(() => {
    a.emit("queue:join")
    b.emit("queue:join")
  }, 200)

  setTimeout(() => {
    log("TIMEOUT")
    process.exit(1)
  }, 6000)
}

main()
