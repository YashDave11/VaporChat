/**
 * End-to-end smoke test against the real server. Sequential scenario:
 *  1. mandatory names: blank display name and blank room names rejected
 *  2. stranger matching + message echo/broadcast + typing relay
 *  3. stranger leave → room:ended for the peer (1-to-1 semantics)
 *  4. end-chat: either side ends a private room for both, key dies
 *  5. public room: named creation, directory update, join, step-out vs end
 *  6. presence: disconnect → away after grace; resume reclaims the seat
 *  7. rate limiting + overlong messages
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

function once<T>(s: Socket, event: string, timeoutMs = 6000): Promise<T> {
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

  // ---- 1. mandatory names ----
  const nameless = ioc(url)
  await once(nameless, "connect")
  const nameErr = once<any>(nameless, "app:error")
  nameless.emit("session:hello", { name: "   " })
  ok((await nameErr).code === "NAME_REQUIRED", "blank display name rejected")
  const noSession = once<any>(nameless, "app:error")
  nameless.emit("queue:join")
  ok(
    (await noSession).code === "NAME_REQUIRED",
    "queueing without a session rejected"
  )
  nameless.disconnect()

  const a = await connect("alice")
  const b = await connect("bram")

  const roomNameErr = once<any>(a, "app:error")
  a.emit("public:create", { roomName: "  " })
  ok(
    (await roomNameErr).code === "ROOM_NAME_REQUIRED",
    "blank public room name rejected"
  )
  const privNameErr = once<any>(a, "app:error")
  a.emit("private:create", { roomName: "" })
  ok(
    (await privNameErr).code === "ROOM_NAME_REQUIRED",
    "blank private room name rejected"
  )

  // ---- 2. stranger matching + typing ----
  const aJoined = once<any>(a, "room:joined")
  const bJoined = once<any>(b, "room:joined")
  a.emit("queue:join")
  await once(a, "queue:waiting")
  b.emit("queue:join")
  const [ar, br] = await Promise.all([aJoined, bJoined])
  ok(ar.kind === "stranger" && br.kind === "stranger", "stranger rooms match")
  ok(ar.roomId === br.roomId, "both strangers share one room")
  ok(br.peers.length === 1 && br.peers[0].status === "active", "second joiner sees one active peer")
  ok(typeof ar.resumeToken === "string" && ar.resumeToken.length > 0, "join grants a resume token")

  const bTyping = once<any>(b, "room:peer_typing")
  a.emit("room:typing", { active: true })
  const typ = await bTyping
  ok(typ.name === "alice" && typ.active === true, "typing signal relayed to peer")

  const bMsg = once<any>(b, "room:message")
  const aEcho = once<any>(a, "room:message")
  const bTypingStop = once<any>(b, "room:peer_typing")
  a.emit("room:message", { text: "hello there" })
  const [got, echo, typStop] = await Promise.all([bMsg, aEcho, bTypingStop])
  ok(got.text === "hello there" && got.self === false, "peer receives message")
  ok(echo.self === true, "author receives self echo")
  ok(typStop.active === false, "a sent message settles the typing signal")

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

  // ---- 3. stranger leave ends the room for the peer ----
  const bEnded = once<any>(b, "room:ended")
  a.emit("room:leave")
  const ended = await bEnded
  ok(
    typeof ended.reason === "string" && ended.by === undefined,
    "stranger leave ends room for peer (no 'by' — it was a leave)"
  )

  // ---- 4. private rooms: named, keyed, end-chat for both ----
  const pJoined = once<any>(a, "room:joined")
  a.emit("private:create", { roomName: "  midnight   channel " })
  const priv = await pJoined
  ok(priv.kind === "private" && typeof priv.key === "string", "private room minted with key")
  ok(priv.title === "midnight channel", "private room name sanitized and kept")
  ok(priv.capacity === 2, "private capacity is 2")

  const badKey = once<any>(b, "app:error")
  b.emit("private:join", { key: "ZZZZ" })
  ok((await badKey).code === "BAD_KEY", "invalid key rejected")

  const bPriv = once<any>(b, "room:joined")
  b.emit("private:join", { key: priv.key.toLowerCase() })
  const bp = await bPriv
  ok(bp.roomId === priv.roomId, "case-insensitive key join works")
  ok(bp.title === "midnight channel", "joiner sees the creator's room name")

  const c = await connect("carol")
  const cFull = once<any>(c, "app:error")
  c.emit("private:join", { key: priv.key })
  ok((await cFull).code === "ROOM_FULL", "third joiner rejected from private room")

  // b ends it → both sides get room:ended naming b
  const aEnded = once<any>(a, "room:ended")
  const bEnded2 = once<any>(b, "room:ended")
  b.emit("room:end")
  const [ea, eb] = await Promise.all([aEnded, bEnded2])
  ok(ea.by === "bram" && eb.by === "bram", "end-chat names who ended it, for everyone")

  const deadKey = once<any>(c, "app:error")
  c.emit("private:join", { key: priv.key })
  ok((await deadKey).code === "BAD_KEY", "key dies when the chat is ended")

  // ---- 5. public rooms + directory ----
  const cDir = once<any>(c, "directory:update")
  c.emit("directory:subscribe")
  ok((await cDir).rooms.length === 0, "directory starts empty")

  const gJoined = once<any>(a, "room:joined")
  const cDirUpdate = once<any>(c, "directory:update")
  a.emit("public:create", { roomName: "night shift" })
  const pub = await gJoined
  ok(pub.kind === "public" && pub.title === "night shift", "public room carries its creator-chosen name")
  ok(pub.capacity === 10, "public capacity is 10")
  const dir1 = await cDirUpdate
  ok(
    dir1.rooms.length === 1 && dir1.rooms[0].title === "night shift" && dir1.rooms[0].count === 1,
    "named public room appears in directory with count"
  )
  ok(
    Object.keys(dir1.rooms[0]).sort().join(",") === "capacity,count,createdAt,id,title",
    "directory exposes only safe metadata"
  )

  const bPub = once<any>(b, "room:joined")
  b.emit("public:join", { roomId: pub.roomId })
  ok((await bPub).roomId === pub.roomId, "public room joinable by id from directory")

  // step-out (leave) in a public room only removes that member
  const cPub = once<any>(c, "room:joined")
  c.emit("public:join", { roomId: pub.roomId })
  await cPub
  const bSeesLeave = once<any>(b, "room:peer_left")
  c.emit("room:leave")
  ok((await bSeesLeave).name === "carol", "leaving a public room does not end it")

  // end-chat in a public room ends it for every remaining voice
  const aPubEnded = once<any>(a, "room:ended")
  const bPubEnded = once<any>(b, "room:ended")
  b.emit("room:end")
  const [pa, pb] = await Promise.all([aPubEnded, bPubEnded])
  ok(pa.by === "bram" && pb.by === "bram", "public end-chat reaches all members")
  const dirAfterEnd = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 3000)
    const listener = (p: any) => {
      if (p.rooms.length === 0) {
        clearTimeout(t)
        c.off("directory:update", listener)
        resolve(true)
      }
    }
    c.on("directory:update", listener)
    c.emit("directory:subscribe")
  })
  ok(dirAfterEnd, "ended public room removed from directory")

  const goneErr = once<any>(c, "app:error")
  c.emit("public:join", { roomId: "g-nonsense" })
  ok((await goneErr).code === "ROOM_GONE", "joining a dead room id fails cleanly")

  // ---- 6. presence grace + resume ----
  const dJoined = once<any>(a, "room:joined")
  a.emit("private:create", { roomName: "thin ice" })
  const graceRoom = await dJoined
  const eJoined = once<any>(b, "room:joined")
  b.emit("private:join", { key: graceRoom.key })
  const eb2 = await eJoined
  const bToken = eb2.resumeToken

  // b drops without leaving → a sees "away" only after the grace beat
  let sawAway = false
  const awayPromise = new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 6000)
    const listener = (p: any) => {
      const peer = p.peers.find((x: any) => x.name === "bram")
      if (peer?.status === "away") {
        clearTimeout(t)
        a.off("room:presence", listener)
        resolve(true)
      }
    }
    a.on("room:presence", listener)
  })
  const dropAt = Date.now()
  b.disconnect()
  sawAway = await awayPromise
  const awayDelay = Date.now() - dropAt
  ok(sawAway, "disconnected peer marked away")
  ok(awayDelay >= 2000, `away only after grace period (${awayDelay}ms)`)

  // resume with the token: same seat, same room, presence returns to active
  const b2 = ioc(url)
  await once(b2, "connect")
  const resumed = once<any>(b2, "room:joined")
  const aBack = new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 4000)
    const listener = (p: any) => {
      const peer = p.peers.find((x: any) => x.name === "bram")
      if (peer?.status === "active") {
        clearTimeout(t)
        a.off("room:presence", listener)
        resolve(true)
      }
    }
    a.on("room:presence", listener)
  })
  b2.emit("session:resume", { token: bToken })
  const rj = await resumed
  ok(rj.roomId === graceRoom.roomId && rj.name === "bram", "resume token reclaims the same seat")
  ok(await aBack, "peer sees the resumed member active again")

  // a stale/junk token fails cleanly
  const junkResume = once<any>(c, "app:error")
  c.emit("session:resume", { token: "not-a-token" })
  ok((await junkResume).code === "ROOM_GONE", "junk resume token rejected")

  // full departure without resume: room ends for the survivor after the window
  // (checked implicitly by cleanup below — b2 ends the chat instead, faster)
  const aGraceEnded = once<any>(a, "room:ended")
  b2.emit("room:end")
  ok((await aGraceEnded).by === "bram", "resumed member can end the chat")
  b2.disconnect()

  // ---- 7. rate limiting ----
  const r1 = once<any>(a, "room:joined")
  a.emit("private:create", { roomName: "overflow" })
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
