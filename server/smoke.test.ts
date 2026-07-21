/**
 * End-to-end smoke test against the real server. Sequential scenario:
 *  1. stranger matching + message echo/broadcast
 *  2. stranger disconnect → room:closed
 *  3. private room: create, bad key, full-room rejection (cap 2), cleanup
 *  4. public room: create, directory update, join, full-room rejection
 *  5. empty public room disappears from the directory
 *  6. rate limiting
 */
// own port so the test never collides with a running dev server
process.env.PORT = "3101"
await import("../server/index.ts")
import { io as ioc, type Socket } from "socket.io-client"

const url = "http://localhost:3101"
let failures = 0

function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`)
  if (!cond) failures++
}

function connect(name: string): Promise<Socket> {
  return new Promise((resolve) => {
    const s = ioc(url)
    s.on("connect", () => {
      s.emit("session:hello", { name })
      s.on("session:ready", () => resolve(s))
    })
  })
}

function once<T>(s: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs
    )
    s.once(event, (p: T) => {
      clearTimeout(t)
      resolve(p)
    })
  })
}

async function main() {
  await new Promise((r) => setTimeout(r, 400))

  // ---- 1. stranger matching ----
  const a = await connect("alice")
  const b = await connect("") // gets an anonymous name

  const aJoined = once<any>(a, "room:joined")
  const bJoined = once<any>(b, "room:joined")
  a.emit("queue:join")
  await once(a, "queue:waiting")
  b.emit("queue:join")
  const [ar, br] = await Promise.all([aJoined, bJoined])
  ok(ar.kind === "stranger" && br.kind === "stranger", "stranger rooms match")
  ok(ar.roomId === br.roomId, "both strangers share one room")
  ok(br.peers.length === 1, "second joiner sees one peer")

  const bMsg = once<any>(b, "room:message")
  const aEcho = once<any>(a, "room:message")
  a.emit("room:message", { text: "hello there" })
  const [got, echo] = await Promise.all([bMsg, aEcho])
  ok(got.text === "hello there" && got.self === false, "peer receives message")
  ok(echo.self === true, "author receives self echo")

  // reply with quoted context travels with the message
  const aReply = once<any>(a, "room:message")
  b.emit("room:message", {
    text: "hi back",
    replyTo: { id: got.id, from: got.from, excerpt: got.text },
  })
  const reply = await aReply
  ok(
    reply.replyTo?.id === got.id && reply.replyTo?.excerpt === "hello there",
    "quoted reply relayed with sanitized ref"
  )
  const aReply2 = once<any>(a, "room:message")
  b.emit("room:message", {
    text: "junk quote",
    replyTo: { id: "", from: 42, excerpt: "x".repeat(500) },
  })
  ok((await aReply2).replyTo === undefined, "malformed reply ref dropped")

  // ---- 2. stranger leave closes the room ----
  const bClosed = once<any>(b, "room:closed")
  a.emit("room:leave")
  const closed = await bClosed
  ok(typeof closed.reason === "string", "stranger leave closes room for peer")

  // ---- 3. private rooms (cap 2) ----
  const pJoined = once<any>(a, "room:joined")
  a.emit("private:create")
  const priv = await pJoined
  ok(priv.kind === "private" && typeof priv.key === "string", "private room minted with key")
  ok(priv.capacity === 2, "private capacity is 2")

  const badKey = once<any>(b, "app:error")
  b.emit("private:join", { key: "ZZZZ" })
  ok((await badKey).code === "BAD_KEY", "invalid key rejected")

  const bPriv = once<any>(b, "room:joined")
  b.emit("private:join", { key: priv.key.toLowerCase() })
  ok((await bPriv).roomId === priv.roomId, "case-insensitive key join works")

  const c = await connect("carol")
  const cFull = once<any>(c, "app:error")
  c.emit("private:join", { key: priv.key })
  ok((await cFull).code === "ROOM_FULL", "third joiner rejected from private room")

  // both leave → key dies with the room
  a.emit("room:leave")
  b.emit("room:leave")
  await new Promise((r) => setTimeout(r, 150))
  const deadKey = once<any>(c, "app:error")
  c.emit("private:join", { key: priv.key })
  ok((await deadKey).code === "BAD_KEY", "key dies when private room empties")

  // ---- 4. public rooms + directory ----
  const cDir = once<any>(c, "directory:update")
  c.emit("directory:subscribe")
  ok((await cDir).rooms.length === 0, "directory starts empty")

  const gJoined = once<any>(a, "room:joined")
  const cDirUpdate = once<any>(c, "directory:update")
  a.emit("public:create")
  const pub = await gJoined
  ok(pub.kind === "public" && typeof pub.title === "string", "public room created with title")
  ok(pub.capacity === 10, "public capacity is 10")
  const dir1 = await cDirUpdate
  ok(
    dir1.rooms.length === 1 && dir1.rooms[0].id === pub.roomId && dir1.rooms[0].count === 1,
    "new public room appears in directory with count"
  )
  ok(
    Object.keys(dir1.rooms[0]).sort().join(",") === "capacity,count,createdAt,id,title",
    "directory exposes only safe metadata"
  )

  const bPub = once<any>(b, "room:joined")
  b.emit("public:join", { roomId: pub.roomId })
  ok((await bPub).roomId === pub.roomId, "public room joinable by id from directory")

  // fill to capacity: 8 more sockets → 10 total, 11th rejected
  const extras: Socket[] = []
  for (let i = 0; i < 8; i++) {
    const s = await connect(`extra${i}`)
    const j = once<any>(s, "room:joined")
    s.emit("public:join", { roomId: pub.roomId })
    await j
    extras.push(s)
  }
  const dFull = once<any>(c, "app:error")
  c.emit("public:join", { roomId: pub.roomId })
  ok((await dFull).code === "ROOM_FULL", "11th joiner rejected at cap 10")

  const goneErr = once<any>(c, "app:error")
  c.emit("public:join", { roomId: "g-nonsense" })
  ok((await goneErr).code === "ROOM_GONE", "joining a dead room id fails cleanly")

  // ---- 5. empty public room falls out of the directory ----
  a.emit("room:leave")
  b.emit("room:leave")
  for (const s of extras) s.disconnect()
  // directory broadcasts fire per-leave; wait for the one that reaches zero
  const emptied = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 3000)
    const listener = (p: any) => {
      if (p.rooms.length === 0) {
        clearTimeout(t)
        c.off("directory:update", listener)
        resolve(true)
      }
    }
    c.on("directory:update", listener)
  })
  ok(emptied, "empty public room removed from directory")

  // ---- 6. rate limiting ----
  const r1 = once<any>(a, "room:joined")
  a.emit("private:create")
  await r1
  const limited = once<any>(a, "app:error")
  for (let i = 0; i < 12; i++) a.emit("room:message", { text: `spam ${i}` })
  ok((await limited).code === "RATE_LIMITED", "burst spam rate limited")

  const tooLong = once<any>(a, "app:error", 5000)
  await new Promise((r) => setTimeout(r, 1200)) // let a token refill
  a.emit("room:message", { text: "x".repeat(600) })
  ok((await tooLong).code === "MSG_TOO_LONG", "overlong message rejected")

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("FATAL", err)
  process.exit(1)
})
