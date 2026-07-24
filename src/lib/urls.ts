/**
 * Public URLs must never inherit a preview/deployment host. Invitees should
 * always arrive through Vapor's canonical domain, even if the sender happens
 * to be using a Vercel preview URL.
 */
const DEFAULT_PUBLIC_ORIGIN = "https://www.vaporchat.dev"

function configuredOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_ORIGIN?.trim()
  if (!configured) return DEFAULT_PUBLIC_ORIGIN

  try {
    return new URL(configured).origin
  } catch {
    return DEFAULT_PUBLIC_ORIGIN
  }
}

export const PUBLIC_APP_ORIGIN = configuredOrigin()

export function inviteUrl(token: string): string {
  return `${PUBLIC_APP_ORIGIN}/#/join/${encodeURIComponent(token)}`
}
