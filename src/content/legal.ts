/**
 * Plain-language legal copy for Vapor, grounded in how the app actually
 * works: no database, in-memory rooms, peer-to-peer voice. Content lives
 * as data so LegalPage.tsx stays a dumb renderer.
 *
 * EDIT THESE before launch — they are the only values a lawyer/owner must set:
 */
export const LEGAL = {
  contactPrivacy: "privacy@vaporchat.dev",
  contactTerms: "legal@vaporchat.dev",
  // Governing jurisdiction for the Terms. Set to your actual country/state.
  jurisdiction: "India",
  updated: "October 10, 2026",
}

export interface LegalSection {
  tag: string
  title: string
  body: string[]
  bullets?: string[]
}

export interface LegalDoc {
  kind: "privacy" | "terms"
  eyebrow: string
  title: string
  intro: string
  sections: LegalSection[]
}

export const PRIVACY: LegalDoc = {
  kind: "privacy",
  eyebrow: "LEGAL · PRIVACY",
  title: "Privacy policy",
  intro:
    "Vapor is built so there is almost nothing to have a policy about. This explains what that means in practice — what never leaves your device, what our server briefly handles to connect you, and the one place your network address can be seen.",
  sections: [
    {
      tag: "SEC·01",
      title: "The short version",
      body: [
        "No accounts. No logs. No message history. Conversations live in server memory only while the room is alive, and they are gone the instant it ends. We cannot read, recover, or sell what we never store — there is no database behind Vapor at all.",
      ],
    },
    {
      tag: "SEC·02",
      title: "What stays on your device",
      body: [
        "Vapor uses your browser's sessionStorage — not cookies — to hold a few things while the tab is open. All of it is erased the moment you close the tab.",
      ],
      bullets: [
        "The display name you choose for the session.",
        "A short-lived token that lets you reclaim your seat for about 30 seconds after a refresh or dropped connection.",
        "A flag recording that you have read the entry notice.",
      ],
    },
    {
      tag: "SEC·03",
      title: "What our server sees",
      body: [
        "To connect you and relay messages in real time, the server necessarily handles your IP address and the room you are in. This is used only to route traffic, enforce rate limits, and cap abuse — never logged to build a profile, never sold, never handed to advertisers.",
        "Messages pass through memory and are overwritten as the conversation moves on. Nothing is written to disk.",
      ],
    },
    {
      tag: "SEC·04",
      title: "Voice and screen share are peer-to-peer",
      body: [
        "When you join a call, audio and screen video flow directly between participants' browsers over WebRTC. Our server only relays the initial handshake — the media itself never passes through it.",
        "Because the connection is direct, the other people in the call can see your network (IP) address, and a STUN server (operated by Google) observes your public IP during setup. On restrictive networks an optional TURN relay may carry the encrypted stream; it sees connection metadata but no usable content. Treat anyone in a call as someone who can see roughly where you connect from.",
      ],
    },
    {
      tag: "SEC·05",
      title: "Third parties",
      body: [
        "We keep these to a minimum. The web app is served by Vercel, the relay server runs on Render, and web fonts load from a font CDN. Any third party that serves a request can see your IP as a normal part of web traffic.",
        "We embed no analytics, no advertising trackers, and no crash-reporting SDKs.",
      ],
    },
    {
      tag: "SEC·06",
      title: "No cookies, no tracking",
      body: [
        "Vapor sets no cookies and runs no analytics or advertising scripts. There is no cross-site tracking and no “remember me.” This page did not record your visit.",
      ],
    },
    {
      tag: "SEC·07",
      title: "How long we keep things",
      body: [
        "On our side, nothing persists. Messages exist only in RAM for the life of the room; when the last person leaves — or a one-to-one ends — they are gone. A brief grace window of about 30 seconds lets you rejoin after a drop, after which your seat is released.",
      ],
    },
    {
      tag: "SEC·08",
      title: "Your rights",
      body: [
        "Because we hold no stored personal data about you, there is nothing to export, correct, or delete on request — the deletion is built into the product. Where laws such as the GDPR or CCPA apply, you still have the right to ask what we hold (the honest answer is: nothing persistent) and to raise concerns with us.",
      ],
    },
    {
      tag: "SEC·09",
      title: "Children",
      body: [
        "Vapor is not intended for anyone under 13, or under 16 in the EEA and UK. We do not knowingly collect information from children. If you are below that age, please do not use Vapor.",
      ],
    },
    {
      tag: "SEC·10",
      title: "Changes to this policy",
      body: [
        "If this policy changes, we will update the date at the top. Material changes will appear here before they take effect.",
      ],
    },
    {
      tag: "SEC·11",
      title: "Contact",
      body: [
        `Questions about privacy? Reach us at ${LEGAL.contactPrivacy}.`,
      ],
    },
  ],
}

export const TERMS: LegalDoc = {
  kind: "terms",
  eyebrow: "LEGAL · TERMS",
  title: "Terms of use",
  intro:
    "The rules for using Vapor, in plain language. They exist mostly to say three things: be lawful, be decent to the strangers you meet, and understand that an ephemeral service comes with no guarantees.",
  sections: [
    {
      tag: "SEC·01",
      title: "Agreeing to these terms",
      body: [
        "By using Vapor you agree to these terms. If you do not agree, do not use it. Picking a name and entering a room counts as acceptance.",
      ],
    },
    {
      tag: "SEC·02",
      title: "Who can use Vapor",
      body: [
        "You must be at least 13 — or 16 in the EEA and UK — to use Vapor. By using it you confirm you meet this and that you will use the service lawfully.",
      ],
    },
    {
      tag: "SEC·03",
      title: "What Vapor is — and isn't",
      body: [
        "Vapor is anonymous, unrecorded, real-time conversation with strangers. The people here are unverified and unaccountable. Nothing said is vetted or endorsed by us, and nothing here is medical, legal, financial, or professional advice. Treat it as conversation, never as counsel.",
      ],
    },
    {
      tag: "SEC·04",
      title: "How you may not use it",
      body: ["You agree not to use Vapor to:"],
      bullets: [
        "Break the law, or help anyone else do so.",
        "Create, request, or share sexual content involving minors. We report such material to the authorities where identifiable.",
        "Harass, threaten, stalk, or incite violence against anyone.",
        "Impersonate another person or misrepresent your affiliation.",
        "Distribute malware, spam, or unsolicited promotion.",
        "Breach, overload, scrape, or circumvent the rate limits, frame caps, or connection limits that keep the service running.",
        "Collect or redistribute other participants' information without their consent.",
      ],
    },
    {
      tag: "SEC·05",
      title: "Your words are yours",
      body: [
        "You are responsible for everything you say and do here. Because conversations are peer-to-peer or relayed and never stored by us, we cannot retrieve or moderate them after the fact — but the people you talk to can read, remember, or screenshot what you send. Share nothing you would regret a stranger keeping.",
      ],
    },
    {
      tag: "SEC·06",
      title: "The service is provided “as is”",
      body: [
        "Vapor is offered on an “as is” and “as available” basis, without warranties of any kind. Rooms can end without warning, connections can drop, and features can change or disappear. We do not guarantee the service will be uninterrupted, secure, or error-free.",
      ],
    },
    {
      tag: "SEC·07",
      title: "Limitation of liability",
      body: [
        "To the fullest extent the law allows, Vapor and its creator are not liable for any indirect, incidental, or consequential damages, nor for anything said or done by other users, arising from your use of the service.",
      ],
    },
    {
      tag: "SEC·08",
      title: "Indemnification",
      body: [
        "You agree to hold Vapor and its creator harmless from any claims arising out of your use of the service or your breach of these terms.",
      ],
    },
    {
      tag: "SEC·09",
      title: "Ending access",
      body: [
        "We may limit, suspend, or end access to the service — for anyone, at any time, for any reason or none — to protect users or the service itself. Rooms are ephemeral by design and may end at any moment.",
      ],
    },
    {
      tag: "SEC·10",
      title: "Changes to these terms",
      body: [
        "We may update these terms; the date at the top shows the latest version. Continuing to use Vapor after a change means you accept it.",
      ],
    },
    {
      tag: "SEC·11",
      title: "Governing law",
      body: [
        `These terms are governed by the laws of ${LEGAL.jurisdiction}, without regard to its conflict-of-law rules.`,
      ],
    },
    {
      tag: "SEC·12",
      title: "Contact",
      body: [`Questions about these terms? Reach us at ${LEGAL.contactTerms}.`],
    },
  ],
}
