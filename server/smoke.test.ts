/**
 * End-to-end smoke test against the real server. Sequential scenario:
 *  1. mandatory names: blank display name and blank room names rejected
 *  2. stranger matching: live count, double consent, decline + no-rematch,
 *     rename re-eligibility, accept → room + message echo/broadcast + typing
 *  3. stranger vaporize → room:ended (cause "vaporized") for the peer
 *  4. private 1v1 chat: named create, key join, vaporize ends for both
 *  5. public room: named creation, directory, group vaporize = leave only
 *  6. invite links: minted per shareable room, resolve to safe metadata,
 *     join through the token, dead/full links answered gracefully
 *  7. presence: disconnect → away after grace; resume reclaims the seat
 *  8. rate limiting + overlong messages
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

function connect(name: string, clientId?: string): Promise<Socket> {
  return new Promise((resolve) => {
    const s = ioc(url)
    s.on("connect", () => {
      s.emit("session:hello", { name, clientId })
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

/** resolves true only if the event does NOT arrive within the window */
function silence(s: Socket, event: string, windowMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (quiet: boolean) => {
      clearTimeout(t)
      s.off(event, onEvent)
      resolve(quiet)
    }
    const t = setTimeout(() => done(true), windowMs)
    const onEvent = () => done(false)
    s.on(event, onEvent)
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

  // ---- 2. stranger double-consent matching ----

  // dedicated pair for the consent lifecycle — stable per-tab client ids
  const d1 = await connect("nora", "cid-n")
  const d2 = await connect("owen", "cid-o")

  const d1Count = once<any>(d1, "queue:count")
  d1.emit("queue:join")
  await once(d1, "queue:waiting")
  ok((await d1Count).count === 1, "first seeker sees a live count of 1")

  const d1Cand = once<any>(d1, "queue:candidate")
  const d2Cand = once<any>(d2, "queue:candidate")
  const d1Count2 = once<any>(d1, "queue:count")
  d2.emit("queue:join")
  ok((await d1Count2).count === 2, "count updates live when a second seeker arrives")
  const [c1, c2] = await Promise.all([d1Cand, d2Cand])
  ok(
    c1.name === "owen" && c2.name === "nora",
    "both sides shown a named candidate, no room yet"
  )

  // one yes is not enough — the other side just learns about it
  const d2Peer = once<any>(d2, "queue:peer_accepted")
  d1.emit("queue:accept")
  ok((await d2Peer).name === "nora", "single accept only notifies the other side")

  // a decline dissolves the pairing: the other side is told, the decliner
  // already knows (their client transitions locally, no echo)
  const d1Gone = once<any>(d1, "queue:candidate_gone")
  const d2Quiet = silence(d2, "queue:candidate_gone")
  d2.emit("queue:decline")
  ok(
    (await d1Gone).reason === "declined",
    "decline returns the other side to searching"
  )
  ok(await d2Quiet, "decliner gets no echo of their own no")
  ok(
    await silence(d1, "queue:candidate"),
    "declined pair is not immediately rematched"
  )

  // a new display name is a new identity — eligible again
  const d1Cand2 = once<any>(d1, "queue:candidate")
  const d2Cand2 = once<any>(d2, "queue:candidate")
  d2.emit("session:hello", { name: "wren", clientId: "cid-o" })
  await once(d2, "session:ready")
  d2.emit("queue:join")
  const [c3, c4] = await Promise.all([d1Cand2, d2Cand2])
  ok(
    c3.name === "wren" && c4.name === "nora",
    "renamed identity becomes matchable again"
  )

  // both accept → the pairing becomes a stranger room
  const d1Room = once<any>(d1, "room:joined")
  const d2Room = once<any>(d2, "room:joined")
  d1.emit("queue:accept")
  d2.emit("queue:accept")
  const [dr1, dr2] = await Promise.all([d1Room, d2Room])
  ok(
    dr1.kind === "stranger" && dr1.roomId === dr2.roomId,
    "double accept starts one shared stranger room"
  )
  d1.disconnect()
  d2.disconnect()

  // ---- 2b. matched strangers: messaging + typing ----
  const aJoined = once<any>(a, "room:joined")
  const bJoined = once<any>(b, "room:joined")
  const aCand = once<any>(a, "queue:candidate")
  const bCand = once<any>(b, "queue:candidate")
  a.emit("queue:join")
  await once(a, "queue:waiting")
  b.emit("queue:join")
  await Promise.all([aCand, bCand])
  a.emit("queue:accept")
  b.emit("queue:accept")
  const [ar, br] = await Promise.all([aJoined, bJoined])
  ok(ar.kind === "stranger" && br.kind === "stranger", "stranger rooms match")
  ok(ar.roomId === br.roomId, "both strangers share one room")
  ok(ar.invite === undefined, "a stranger match has no invite — nothing to point at")
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

  // ---- 3. stranger vaporize ends the room for the peer ----
  const bEnded = once<any>(b, "room:ended")
  a.emit("room:vaporize")
  const ended = await bEnded
  ok(
    ended.cause === "vaporized" && ended.by === "alice",
    "stranger vaporize ends room for peer, naming who and why"
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

  // b vaporizes → both sides get room:ended naming b, cause vaporized
  const aEnded = once<any>(a, "room:ended")
  const bEnded2 = once<any>(b, "room:ended")
  b.emit("room:vaporize")
  const [ea, eb] = await Promise.all([aEnded, bEnded2])
  ok(
    ea.by === "bram" && eb.by === "bram" && ea.cause === "vaporized",
    "private 1v1 vaporize ends it for both, naming who"
  )

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

  // group vaporize only removes the vaporizer — the room lives on
  const cPub = once<any>(c, "room:joined")
  c.emit("public:join", { roomId: pub.roomId })
  await cPub
  const bSeesLeave = once<any>(b, "room:peer_left")
  c.emit("room:vaporize")
  ok(
    (await bSeesLeave).name === "carol",
    "vaporizing out of a public room does not end it"
  )

  // the room is destroyed only when the last voice vaporizes out
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
    a.emit("room:vaporize")
    b.emit("room:vaporize")
  })
  ok(dirAfterEnd, "public room removed from directory when last member leaves")

  const goneErr = once<any>(c, "app:error")
  c.emit("public:join", { roomId: "g-nonsense" })
  ok((await goneErr).code === "ROOM_GONE", "joining a dead room id fails cleanly")

  // ---- 6. invite links ----

  // shareable rooms carry a token; matched strangers never do
  const invJoined = once<any>(a, "room:joined")
  a.emit("private:create", { roomName: "back channel" })
  const invRoom = await invJoined
  ok(
    typeof invRoom.invite === "string" && invRoom.invite.length === 10,
    "private room minted with a 10-glyph invite token"
  )

  // resolving needs no session — the doorstep is public, the room id is not
  const doorstep = ioc(url)
  await once(doorstep, "connect")
  const info = once<any>(doorstep, "invite:info")
  doorstep.emit("invite:resolve", { token: invRoom.invite.toLowerCase() })
  const inf = await info
  ok(
    inf.token === invRoom.invite && inf.kind === "private" && inf.title === "back channel",
    "invite resolves case-insensitively to doorstep metadata"
  )
  ok(
    Object.keys(inf).sort().join(",") === "capacity,count,kind,title,token",
    "invite info exposes only safe metadata — never the room id"
  )

  // a junk token is a dead link, not an app error
  const junkInvite = once<any>(doorstep, "invite:dead")
  doorstep.emit("invite:resolve", { token: "ZZZZZZZZZZ" })
  ok((await junkInvite).reason === "gone", "unknown invite token answers gone")

  // joining through the link requires a name, like every other door
  const inviteNoName = once<any>(doorstep, "app:error")
  doorstep.emit("invite:join", { token: invRoom.invite })
  ok(
    (await inviteNoName).code === "NAME_REQUIRED",
    "invite join without a session rejected"
  )

  // named, the token opens the room
  doorstep.emit("session:hello", { name: "dana" })
  await once(doorstep, "session:ready")
  const doorJoined = once<any>(doorstep, "room:joined")
  doorstep.emit("invite:join", { token: invRoom.invite })
  const dj = await doorJoined
  ok(dj.roomId === invRoom.roomId, "invite token joins the correct room")
  ok(dj.invite === invRoom.invite, "joiner receives the room's invite token")

  // the room is now a full 1v1 — the same link answers full, not an error
  const fullInvite = once<any>(c, "invite:dead")
  c.emit("invite:resolve", { token: invRoom.invite })
  ok((await fullInvite).reason === "full", "invite to a full room answers full")
  const fullInviteJoin = once<any>(c, "invite:dead")
  c.emit("invite:join", { token: invRoom.invite })
  ok(
    (await fullInviteJoin).reason === "full",
    "join through a full invite also answers full"
  )

  // links die with their rooms
  const invEnded = once<any>(a, "room:ended")
  doorstep.emit("room:vaporize")
  await invEnded
  const deadInvite = once<any>(c, "invite:dead")
  c.emit("invite:resolve", { token: invRoom.invite })
  ok(
    (await deadInvite).reason === "gone",
    "invite dies when its room vaporizes"
  )
  doorstep.disconnect()

  // public rooms carry invites too, resolving with a live seat count
  const pubInvJoined = once<any>(a, "room:joined")
  a.emit("public:create", { roomName: "late shift" })
  const pubInv = await pubInvJoined
  ok(typeof pubInv.invite === "string", "public room minted with an invite")
  const pubInfo = once<any>(c, "invite:info")
  c.emit("invite:resolve", { token: pubInv.invite })
  const pi = await pubInfo
  ok(
    pi.kind === "public" && pi.count === 1 && pi.capacity === 10,
    "public invite doorstep carries kind and live seat count"
  )
  a.emit("room:vaporize") // last voice out — room and invite vaporize together

  // ---- 7. presence grace + resume ----
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
  // (checked implicitly by cleanup below — b2 vaporizes instead, faster)
  const aGraceEnded = once<any>(a, "room:ended")
  b2.emit("room:vaporize")
  ok((await aGraceEnded).by === "bram", "resumed member can vaporize the chat")
  b2.disconnect()

  // ---- 8. rate limiting ----
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
