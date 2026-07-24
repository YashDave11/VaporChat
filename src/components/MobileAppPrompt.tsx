import { useEffect, useState } from "react"

const DISMISS_KEY = "vapor:android-app-prompt-dismissed"
const APK_URL = import.meta.env.VITE_VAPOR_APK_URL || "/vapor_app/vapor.apk"
const ANDROID_APP_ID = "chat.vapor"

type RelatedApp = { id?: string }
type RelatedAppsNavigator = Navigator & {
  getInstalledRelatedApps?: () => Promise<RelatedApp[]>
}

function isAndroidBrowser(): boolean {
  return /Android/i.test(navigator.userAgent)
}

/**
 * A small, optional Android-only nudge for people using the website. Modern
 * Chromium browsers can report installed related apps; other browsers prevent
 * sites from checking installed apps, so they receive the same dismissible
 * suggestion rather than a forced redirect.
 */
export function MobileAppPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isAndroidBrowser() || sessionStorage.getItem(DISMISS_KEY)) return

    const relatedApps = (navigator as RelatedAppsNavigator).getInstalledRelatedApps
    if (!relatedApps) {
      setVisible(true)
      return
    }

    void relatedApps()
      .then((apps) => setVisible(!apps.some((app) => app.id === ANDROID_APP_ID)))
      // Browsers commonly deny this capability. Keep the non-blocking offer
      // available rather than assuming an app is installed.
      .catch(() => setVisible(true))
  }, [])

  if (!visible) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1")
    setVisible(false)
  }

  return (
    <aside
      role="status"
      aria-label="Vapor for Android"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-sm border border-signal/30 bg-smoke/95 px-4 py-3 shadow-[var(--shadow-panel)] backdrop-blur"
    >
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
          Vapor for Android
        </p>
        <p className="mt-0.5 text-sm leading-snug text-fog">
          Prefer the app? It keeps Vapor one tap away.
        </p>
      </div>
      <a
        href={APK_URL}
        download="vapor.apk"
        className="shrink-0 rounded-sm bg-signal px-3 py-2 font-mono text-[11px] font-medium text-void transition-colors hover:bg-breath focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
      >
        Install
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss app suggestion"
        className="shrink-0 cursor-pointer rounded-sm p-1.5 font-mono text-xs text-fog-dim transition-colors hover:text-breath focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
      >
        ×
      </button>
    </aside>
  )
}
