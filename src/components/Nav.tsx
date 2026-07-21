export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"
      >
        <a
          href="#"
          className="font-display text-lg font-semibold tracking-wide text-breath"
        >
          vapor
          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />
        </a>
        <a
          href="#cta"
          className="font-mono text-xs text-fog transition-colors duration-300 hover:text-breath"
        >
          start →
        </a>
      </nav>
    </header>
  )
}
