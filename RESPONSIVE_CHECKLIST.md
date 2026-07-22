# Responsive / mobile checklist — Vapor

Verify these before shipping any UI change. Vapor is **mobile-first**: the
unprefixed Tailwind class is the phone; `sm:`/`lg:` only enhance upward.

## Global
- [ ] Viewport meta includes `interactive-widget=resizes-content` and
      `viewport-fit=cover` (keyboard resizes layout; content clears notches).
- [ ] No horizontal scroll at 320px, 360px, 390px, 768px, 1024px, 1440px.
      (`body` has `overflow-x:hidden` — treat any need for it as a bug to fix,
      not rely on.)
- [ ] Bottom-anchored UI uses `env(safe-area-inset-bottom)` so nothing hides
      under the home indicator.

## The room (main chat)
- [ ] Room column is `flex-1 min-h-0` — never a fixed `svh`/`calc()` height.
- [ ] Opening the keyboard keeps the composer and latest message visible.
- [ ] Only the transcript scrolls; the page itself does not (no double
      scrollbar). Header + composer stay put.
- [ ] Jump-to-latest pill and typing line stay above the composer.

## Touch & pointers
- [ ] Every interactive control is ≥44×44px (or ≥24px with clear spacing):
      Send, emoji, reply `↩`, invite pill, vaporize, theme/sound toggles,
      modal close `✕`, room rows.
- [ ] No action is hover-only. Affordances are visible by default and may hide
      only behind `[@media(hover:hover)]` for mouse users.
- [ ] Focus-visible ring shows on keyboard tab for all of the above.

## Screens
- [ ] **Pre-chat notice**: `SIG·` list readable at 320px; buttons wrap, don't clip.
- [ ] **Gate**: name field full-width; create/key panels not deep-indented on
      mobile; radio hints truncate gracefully.
- [ ] **Matching / JoinGate / Ended**: centered column, buttons wrap, no overflow.
- [ ] **RoomBrowser**: bottom-sheet on mobile, centered dialog on `sm+`; tuner
      input and room rows tappable.
- [ ] **Share / Vaporize modals**: `max-w-sm`, padded off the edges, close by
      tapping the veil and by Escape.

## Type & spacing
- [ ] Body text ≥14px; primary reading text 15px (`text-[15px]`).
- [ ] Headings use `clamp()` or `text-Nxl sm:text-Mxl`, never a single huge
      fixed size that overflows narrow screens.
- [ ] Horizontal padding steps down on mobile (`px-4 sm:px-6`).

## Motion & a11y
- [ ] All GSAP is wrapped in `gsap.matchMedia("(prefers-reduced-motion: no-preference)")`.
- [ ] Reduced-motion path still conveys state (locked dial, found message, etc.).
- [ ] Color contrast holds in **both** day and night themes (check `fog-dim`
      on `void`/`smoke` — the lowest-contrast pair).

## How to test
1. Chrome DevTools → device toolbar → iPhone SE (375), Pixel 7, iPad mini,
   plus a **responsive** drag from 320→1440 watching for reflow/overflow.
2. In device mode, focus the composer and confirm DevTools shows the keyboard
   inset shrinking the viewport (or test on a real phone — emulation can't
   fully model the on-screen keyboard).
3. Two real phones (one iOS Safari, one Android Chrome): open a room, send,
   reply to a message by tapping `↩`, open the invite sheet, rotate to
   landscape, reopen the keyboard.
4. Toggle OS reduced-motion and dark/light; re-walk the same flow.
5. Keyboard-only pass: Tab through gate → room → modals; nothing is a trap.
