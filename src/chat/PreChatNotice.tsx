import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Button } from "@/components/ui/button"

/**
 * The notice: read once per tab, then the gate. Consent is the primary
 * button itself — no checkbox theater. Acknowledgement lives in
 * sessionStorage like the name and resume token: survives refresh,
 * dies with the tab, exactly like the conversations it describes.
 */
const ACK_KEY = "vapor:notice-ack"

export function hasAcceptedNotice(): boolean {
  return sessionStorage.getItem(ACK_KEY) === "1"
}

/**
 * Five things worth knowing, in the same register as the gate's channel
 * list: a mono tag, a short name, one plain sentence. No legalese —
 * the lawyer pass comes later; this is the UX truth of it.
 */
const SIGNALS: { tag: string; name: string; desc: string }[] = [
  {
    tag: "SIG·01",
    name: "Rooms end without warning",
    desc: "Closing the tab, refreshing, losing your connection, going quiet too long, or server maintenance — any of these can end the session. A brief network blip has ~30 seconds of grace; after that the room is gone for everyone.",
  },
  {
    tag: "SIG·02",
    name: "Nothing is stored",
    desc: "Messages exist only in the memory of the people in the room. No chat logs are kept, nothing is used for advertising, and nothing is sold or shared — beyond the technical infrastructure that relays it in the moment.",
  },
  {
    tag: "SIG·03",
    name: "Keep sensitive things out",
    desc: "No passwords, payment details, government IDs, or anything you'd regret a stranger seeing. We can't retrieve what was said — but the person on the other end can remember or screenshot it.",
  },
  {
    tag: "SIG·04",
    name: "Strangers, not advisors",
    desc: "You're talking to real, anonymous, unverified people. Nothing said here is vetted — treat it as conversation, never as medical, legal, or financial advice.",
    // If an AI assistant mode ships, this row becomes:
    // name: "Automated, not human", desc: "Responses come from an AI
    // assistant. They can be wrong or incomplete, and never replace
    // professional medical, legal, or financial advice."
  },
  {
    tag: "SIG·05",
    name: "What you do with it is yours",
    desc: "You're responsible for how you use anything said here. Decisions made on the strength of a vapor conversation are your own.",
  },
]

/**
 * The doorstep before the gate. Same skeleton, same hairline-list
 * language — this is a screen of the product, not a popup over it.
 */
export function PreChatNotice({
  onAccept,
}: {
  onAccept: () => void
  onDecline?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-notice-item]", {
          opacity: 0,
          y: 18,
          filter: "blur(8px)",
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.07,
        })
      })
    },
    { scope: ref }
  )

  const accept = () => {
    sessionStorage.setItem(ACK_KEY, "1")
    onAccept()
  }

  return (
    <div ref={ref} className="mx-auto w-full max-w-2xl px-6">
      <p
        data-notice-item
        className="font-mono text-xs tracking-[0.25em] text-fog-dim"
      >
        CH·00 · READ ONCE
      </p>
      <h1
        data-notice-item
        className="mt-3 font-display text-4xl font-semibold tracking-tight text-breath sm:text-5xl"
      >
        Before you step in
      </h1>
      <p data-notice-item className="mt-3 text-fog">
        Vapor is anonymous, unrecorded conversation. That comes with rules of
        physics. Thirty seconds of reading, then it&rsquo;s yours.
      </p>

      <ul data-notice-item className="mt-10 border-t hairline" role="list">
        {SIGNALS.map((s) => (
          <li
            key={s.tag}
            className="grid grid-cols-[72px_1fr] items-baseline gap-4 border-b hairline py-5 sm:grid-cols-[110px_1fr] sm:px-4"
          >
            <span className="font-mono text-xs tracking-[0.25em] text-fog-dim">
              {s.tag}
            </span>
            <span>
              <span className="font-display text-lg font-medium text-breath">
                {s.name}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-fog">
                {s.desc}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div
        data-notice-item
        className="mt-10 flex flex-wrap items-center justify-end gap-4"
      >
        <Button onClick={accept}>I understand — start chatting</Button>
      </div>

      <p data-notice-item className="mt-8 font-mono text-[11px] text-fog-dim">
        <a
          href="#/privacy"
          className="underline-offset-4 transition-colors duration-300 hover:text-fog hover:underline"
        >
          privacy policy
        </a>
        {" · "}
        <a
          href="#/terms"
          className="underline-offset-4 transition-colors duration-300 hover:text-fog hover:underline"
        >
          terms of use
        </a>
        {" · "}closing the tab ends everything, always
      </p>
    </div>
  )
}
