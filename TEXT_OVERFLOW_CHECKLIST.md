# Text-overflow checklist — Vapor

Run before shipping any change that renders **user-generated strings**
(names ≤24, room titles ≤32, messages ≤500, search queries = unbounded).
The failure mode is always the same: a long **no-space** string at a large
font size with no wrapping.

## Rules of thumb
- Any element printing user text needs a wrapping strategy:
  - Prose / names / titles → `break-words` (`overflow-wrap: break-word`).
  - Arbitrary tokens (URLs, IDs, raw search input) → also `break-all`.
  - One-line rows where cutting is fine → `truncate` + `min-w-0`.
- Every flex/grid **child** that holds text and should shrink → `min-w-0`.
  (Flex/grid default `min-width:auto` stops `break-words` from engaging.)
- Text containers: fluid width (`w-full` / `max-w-*` / `max-w-full`),
  **never** a fixed pixel width, and **no fixed height** — let them grow down.
- Big headlines that show user content → `clamp()` (or `text-Nxl sm:text-Mxl`
  stepping *up*), never a single large fixed size.

## Test matrix (DevTools device mode + one real phone)
- [ ] No horizontal scroll at 320 / 360 / 390 / 768px. Drag-resize 320→1440
      and watch for any element pushing the page wider than the viewport.
- [ ] Send a 500-char message **with no spaces** — bubble wraps, page doesn't scroll.
- [ ] Send a long URL — it breaks inside the bubble.
- [ ] Create a room named 32 chars with no spaces → open its invite link:
      the JoinGate headline wraps and stays on-screen.
- [ ] Use a 24-char no-space display name → check it wraps on the Matching
      "signal found" screen and in incoming message name labels.
- [ ] In the room browser, type a long no-space query → the "Nothing at …"
      line stays inside the panel.
- [ ] Sidebar/header room titles still truncate to one line with an ellipsis
      (they should NOT wrap).
- [ ] Body text stays ≥14px and readable on mobile; headlines don't jump to a
      giant fixed size on small screens.
- [ ] Re-check in both day and night themes.

## Where wrapping lives (don't regress these)
- Wrap: chat message `<p>` (MessageList), JoinGate title, Matching candidate,
  SharePanel title, notice bodies.
- Shrink guard (`min-w-0`): message bubble box, in-room header title group,
  room-browser rows, share URL/hint rows.
- Truncate (intentional one-line): Room header title, RoomBrowser row title,
  Gate create-option hint, SharePanel URL.
