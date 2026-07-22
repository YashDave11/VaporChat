import { lazy, Suspense, useSyncExternalStore } from "react"
import { Nav } from "@/components/Nav"
import { Hero } from "@/components/Hero"
import { Modes } from "@/components/Modes"
import { Privacy } from "@/components/Privacy"
import { HowItWorks } from "@/components/HowItWorks"
import { Preview } from "@/components/Preview"
import { FinalCta, Footer } from "@/components/FinalCta"
import { VantaBackground } from "@/components/VantaBackground"
import { ErrorBoundary } from "@/components/ErrorBoundary"

// the chat app (and socket.io-client with it) loads only when entered
const ChatApp = lazy(() =>
  import("@/chat/ChatApp").then((m) => ({ default: m.ChatApp }))
)

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
const getHash = () => window.location.hash

export default function App() {
  const hash = useSyncExternalStore(subscribeHash, getHash)
  // #/chat is the front door; #/join/<token> is a shared invite link —
  // both land in the chat app, which reads the token off the hash itself
  const inChat = hash.startsWith("#/chat") || hash.startsWith("#/join/")

  if (inChat) {
    return (
      <ErrorBoundary>
        <div className="grain">
          <Suspense fallback={null}>
            <ChatApp />
          </Suspense>
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <div className="grain">
        <VantaBackground />
        <Nav />
        <main className="relative z-10">
          <Hero />
          <Modes />
          <Privacy />
          <HowItWorks />
          <Preview />
          <FinalCta />
        </main>
        <div className="relative z-10">
          <Footer />
        </div>
      </div>
    </ErrorBoundary>
  )
}
