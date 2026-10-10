import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { PUBLIC_APP_ORIGIN } from "@/lib/urls"

const HARDCODED_APK_URL = "/vapor_app/vapor.apk"
const APK_URL = import.meta.env.VITE_VAPOR_APK_URL || HARDCODED_APK_URL

interface AndroidDownloadModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AndroidDownloadModal({ isOpen, onClose }: AndroidDownloadModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // lock scroll + Escape while open; Tab-trapping is useFocusTrap below
  useEffect(() => {
    if (!isOpen || !mounted) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isOpen, mounted, onClose])

  useFocusTrap(containerRef, isOpen && mounted)

  // absolute so a phone camera can resolve the link off the QR. Pin to the
  // canonical origin — never window.location.origin, or a Vercel preview host
  // ends up in the QR and the scanning phone hits Vercel's SSO login wall.
  const absoluteApkUrl = APK_URL.startsWith("http")
    ? APK_URL
    : `${PUBLIC_APP_ORIGIN}${APK_URL}`

  // QR is rendered in-browser — no third-party QR service, nothing leaves.
  // qrcode is loaded on demand so it stays out of the main bundle.
  useEffect(() => {
    if (!isOpen || !mounted) return
    let alive = true
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(absoluteApkUrl, {
          width: 180,
          margin: 1,
          color: { dark: "#08090b", light: "#ffffff" },
        })
      )
      .then((url) => alive && setQrDataUrl(url))
      .catch(() => {
        /* QR is a convenience; the download button still works */
      })
    return () => {
      alive = false
    }
  }, [isOpen, mounted, absoluteApkUrl])

  if (!isOpen || !mounted || typeof document === "undefined" || !document.body)
    return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-md transition-opacity duration-200"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="download-modal-title"
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-2xl rounded-sm border border-fog/20 bg-smoke shadow-2xl transition-all overflow-hidden flex flex-col md:flex-row md:items-stretch"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-Right Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-fog-dim hover:text-breath text-xl leading-none transition-colors p-1 focus-visible:ring-2 focus-visible:ring-signal/60 outline-none rounded-sm z-10 cursor-pointer"
          aria-label="Close modal"
        >
          &times;
        </button>

        {/* Left Zone: Details and Instructions */}
        <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
          <div>
            <span className="font-mono text-[11px] tracking-[0.2em] text-signal uppercase block mb-1">
              Official Release
            </span>
            <h2 id="download-modal-title" className="font-display text-2xl md:text-3xl font-semibold text-breath leading-tight">
              Vapor for Android
            </h2>
            <p className="mt-3 text-sm text-fog leading-relaxed">
              Experience secure, ephemeral chatting on your mobile device. Scan the QR code or tap the button to download the APK directly.
            </p>

            {/* Installation Instructions for Unknown Sources */}
            <div className="mt-6 rounded-sm border border-fog/15 bg-smoke-2 p-4 text-left">
              <strong className="block font-mono text-[11px] tracking-wider text-signal uppercase mb-2">
                Installation Note
              </strong>
              <p className="font-body text-xs leading-relaxed text-fog">
                Once downloaded, open the <code className="font-mono text-breath bg-white/5 px-1 py-0.5 rounded">vapor.apk</code> file on your Android device. If prompted by Android, go to <em>Settings</em> and toggle <strong>"Allow installation from this source"</strong> to complete setup.
              </p>
            </div>
          </div>

          <div className="mt-6 md:mt-8 flex justify-start">
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close download modal">
              Close
            </Button>
          </div>
        </div>

        {/* Right Zone: QR Code & Download Button */}
        <div className="w-full md:w-[280px] bg-smoke-2 border-t border-fog/15 md:border-t-0 md:border-l border-fog/15 p-6 md:p-8 flex flex-col items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-sm border border-signal/20 bg-white p-3 shadow-lg hover:border-signal/50 transition-colors duration-300">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Vapor Android APK Download QR Code"
                  className="h-40 w-40 block"
                />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center font-mono text-[10px] text-black/40">
                  generating…
                </div>
              )}
            </div>
            <span className="font-mono text-[10px] text-fog-dim tracking-wide text-center">
              Scan to download on mobile
            </span>
          </div>

          <a
            href={APK_URL}
            download="vapor.apk"
            className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-signal px-6 font-body text-sm font-semibold text-void transition-all hover:bg-breath hover:shadow-[var(--glow-signal)] cursor-pointer"
            aria-label="Download APK file directly"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download APK</span>
          </a>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function DownloadAndroidButton({
  variant = "ghost",
  size = "lg",
  className = "",
}: {
  variant?: "signal" | "ghost" | "danger" | "bare"
  size?: "default" | "lg" | "sm"
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setIsOpen(true)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>Download app</span>
      </Button>
      <AndroidDownloadModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
