# Vapor — UI/UX Audit & Recommendations

> Read-only audit. No code changed. Findings are grounded in the actual source; every item cites `file:line`. Where I could not verify something at runtime, I say so. Contrast ratios were computed from the token hex values in `src/index.css`.

---

## 1. Executive Summary

Vapor is a genuinely well-crafted product. The visual language (fog/signal/ember token system, hairline lists, mono eyebrows, Clash Display headers) is consistent and distinctive, the motion work is disciplined with real `prefers-reduced-motion` branches throughout, and the ephemeral-chat ethos is carried all the way into the microcopy. This is top-10% front-end craft.

The problems are not aesthetic — they are **functional reachability** issues that mostly bite on touch devices and for low-vision users, plus a few broken/leaky links that quietly contradict the product's privacy promise.

**Overall score: 8 / 10.** Design maturity is a 9; the point docked is for touch-reachability and contrast bugs that make real tasks (reply, read microcopy, read button labels) fail for a slice of users.

### Top 5 improvements (highest impact first)

1. **Reply is unreachable on touch.** The per-message reply button is `opacity-0` until `group-hover`/focus (`MessageList.tsx`). Touch devices have no hover and the button is `p-1` (~24px). On a phone you effectively cannot reply. — *Critical*
2. **`xs:` breakpoint doesn't exist**, so button labels that are meant to appear on slightly-wider phones never show. `Room.tsx:417,425,463` use `hidden xs:inline`, but no `--breakpoint-xs` is defined and Tailwind v4 has no default `xs`. Labels are permanently hidden. — *Critical*
3. **`fog-dim` body/mono text fails WCAG AA.** `#565c66` on `#08090b` ≈ **2.96:1** (dark), `#7f8a96` on `#e8edf0` ≈ **2.98:1** (light). AA needs 4.5:1 for the small 10–11px mono text this token is used for everywhere. — *High*
4. **Privacy/Terms links are broken and leak you out of the gate.** `PreChatNotice.tsx:138,145` link to `#/privacy` and `#/terms`; `App.tsx` only routes `#/chat` and `#/join/`, so both drop you onto the marketing landing page. There is no Terms page at all. — *High*
5. **External QR + font calls contradict the "nothing leaves this session" promise.** `AndroidDownloadModal.tsx` hits `api.qrserver.com`; `index.html` pulls fonts from a CDN. Both send a request (incl. IP) to a third party from inside a zero-logging product. — *High (trust)*

---

## 2. What's Working Well

- **Token-first theming.** `src/index.css` defines the whole palette and type scale in one `@theme` block; dark/light resolved pre-paint via the inline script in `index.html:15-31`. No flash of wrong theme. Genuinely clean.
- **Motion discipline.** Nearly every animated component branches on `gsap.matchMedia()` with an explicit `(prefers-reduced-motion: reduce)` fallback (`EvaporatingConfession.tsx:59`, `IncomingCallModal.tsx:29`, `useReveal.ts:18`, and the CSS block at `index.css` ~660-682). This is the exception, not the rule, in real codebases.
- **Form a11y on the Gate.** `Gate.tsx` name field uses `aria-invalid`, `role="alert"` on errors, required semantics. Textbook.
- **Live-region correctness.** `MessageList.tsx` transcript is `role="log"` / `aria-live="polite"`; `TypingLine` is `role="status"`. Screen readers will announce new messages without being spammed.
- **Toggle semantics.** `ThemeToggle.tsx` and the SoundToggle use `role="switch"` + `aria-checked` + state-carrying `aria-label`. Correct pattern.
- **Modal basics.** All dialogs set `role="dialog"`, `aria-modal`, auto-focus a sensible control, handle `Escape`, and lock body scroll. (Focus *trapping* is inconsistent — see §6.)
- **Primary/destructive color contrast is strong.** void-on-signal ≈ 14.5:1, ember text ≈ 10:1 on void. Buttons are readable.
- **Touch targets on the call dock are correct.** `CallDock.tsx` round controls are `h-11 w-11` (44px). Composer send + emoji are `h-11`.
- **Microcopy is the product.** "nothing recorded", "voice only, and only while you're here", "closing the tab ends everything, always" — the voice is consistent and reinforces trust at exactly the right moments.

---

## 3. Prioritized Recommendations

### CRITICAL

#### C1 — Reply action is unreachable on touch devices
- **Where:** `src/chat/MessageList.tsx` (reply button, revealed via `group-hover`/`focus`, sized `p-1`).
- **Problem:** No `hover` on touch; `opacity-0`→visible only on hover/focus means the primary per-message action is invisible and unlabeled on phones. The hit area (~24px) is also below the 44px minimum even when shown.
- **Recommendation:** Make reply always visible on coarse pointers and enlarge the target. Either `@media (hover: none) { reply stays visible }` or render it visible by default and only fade-on-hover under `@media (hover: hover)`. Bump to a 44px tap area (`p-2.5` + larger icon, or an absolutely-positioned 44px hit zone). Alternatively add long-press / swipe-to-reply on touch.
- **Impact:** High (core feature unusable on mobile) · **Effort:** Low.

#### C2 — `xs:` breakpoint is undefined; labels permanently hidden
- **Where:** `src/chat/Room.tsx:417` (`hidden xs:inline` "invite"), `:425` ("in call"), `:463` (call label).
- **Problem:** Tailwind v4 has no default `xs`, and no `--breakpoint-xs` is defined in `index.css`. `xs:inline` never matches, so these labels are hidden at *every* width — the header is icon-only even on large phones/tablets where there's room.
- **Recommendation:** Either define the breakpoint in the `@theme` block — `--breakpoint-xs: 25rem;` — or replace `xs:` with the existing `sm:`. Verify the header still fits at 320px after.
- **Impact:** High (clarity of core nav actions) · **Effort:** Trivial (one token or find/replace).

### HIGH

#### H1 — `fog-dim` text fails WCAG AA contrast
- **Where:** `src/index.css` token `--color-fog-dim` (dark `#565c66`, light `#7f8a96`); consumed by nearly all mono eyebrows, timestamps, hints, placeholders (e.g. `PreChatNotice.tsx:93,114,136`, `IncomingCallModal.tsx:105,134`, and throughout).
- **Problem (computed):** dark `#565c66` on `#08090b` ≈ **2.96:1**; light `#7f8a96` on `#e8edf0` ≈ **2.98:1**. AA requires 4.5:1 for normal text and 3:1 for large (≥24px / ≥18.66px bold). This token is mostly used at `text-[10px]`/`text-[11px]` — the worst case — so it fails for essentially all its uses.
- **Recommendation:** Lighten/darken the token to hit ≥4.5:1. Targets: dark ≈ `#7b828d` (~4.6:1), light ≈ `#5c6572` (~4.6:1). Keep `fog` (`#878e9a`, ≈6:1 — already passing) for secondary text and reserve the new `fog-dim` strictly for truly decorative, non-essential marks. Re-verify after change.
- **Impact:** High (legibility for low-vision + anyone on a dim phone outdoors) · **Effort:** Low (two token values + a visual pass).

#### H2 — Privacy / Terms links are broken and eject you from the gate
- **Where:** `src/chat/PreChatNotice.tsx:138` (`#/privacy`), `:145` (`#/terms`); routing in `src/App.tsx` (`inChat = hash.startsWith("#/chat") || "#/join/"`).
- **Problem:** Neither hash routes to a legal page. `#/privacy` ≠ the landing `id="privacy"` anchor (hash is `/privacy`), so it doesn't even scroll there — it just flips `inChat` to false and dumps the user on the marketing page, abandoning the pre-chat gate. There is no Terms page anywhere in the app.
- **Recommendation:** Add real `#/privacy` and `#/terms` routes (or render the existing privacy section as a routed view) and author a Terms page. If legal copy isn't ready, make the links open a small in-place modal/sheet rather than navigating away — a legal notice that 404s-to-marketing is worse than no link.
- **Impact:** High (legal/trust; broken from the exact screen that promises transparency) · **Effort:** Medium.

#### H3 — Third-party requests from a zero-logging product
- **Where:** `src/components/AndroidDownloadModal.tsx` (QR via `https://api.qrserver.com/...`); `index.html` font CDN preconnect/stylesheet.
- **Problem:** Both send a request — including the user's IP and (for the QR) the target URL — to a third party. In a product whose entire pitch is "nothing is stored, nothing leaves this session," any silent external call is a credibility risk, and QR services can log.
- **Recommendation:** Generate the QR locally (e.g. a tiny client-side QR lib, or precompute an SVG at build time since the install URL is static) so no request leaves the browser. Self-host the fonts (`/public`) to drop the CDN dependency. If you keep either external call, disclose it in the privacy copy.
- **Impact:** High (trust is the product) · **Effort:** Low–Medium.

### MEDIUM

#### M1 — Focus is not trapped in most modals
- **Where:** `ConfirmVaporize` (`Room.tsx`), `SharePanel.tsx`, `IncomingCallModal.tsx`, `RoomBrowser.tsx`. Only `AndroidDownloadModal.tsx` attempts a trap — and its selector `[tabindex]:not([-1])` (≈line 27) is malformed (should be `:not([tabindex="-1"])`), so even that trap is broken.
- **Problem:** `aria-modal` is set but Tab can move focus to the content behind the dialog, so keyboard/SR users can "escape" the modal without closing it.
- **Recommendation:** Add one shared focus-trap helper (wrap-around on Tab/Shift+Tab over focusable children) and use it in every dialog. Fix the malformed selector while you're there.
- **Impact:** Medium (keyboard/SR usability) · **Effort:** Low (one helper, reused).

#### M2 — Hardcoded colors bypass the token system
- **Where:** `CallDock.tsx` (`rgba(169,232,220,…)` and `shadow-[…rgba(255,107,107,0.25)]` ~line 457), `IncomingCallModal.tsx:91,118,147` (`rgba(169,232,220,…)`).
- **Problem:** `169,232,220` is the signal mint hardcoded; `255,107,107` is a red that is **not** the ember token (`#e8a9a9` = `232,169,169`), so the destructive accent is inconsistent and won't follow light-theme overrides.
- **Recommendation:** Use the existing `tokenRGBA()` reader from `src/lib/theme.ts` (already used elsewhere for GSAP) or Tailwind token classes. Replace `255,107,107` with the ember token.
- **Impact:** Medium (theme consistency, light-mode correctness) · **Effort:** Low.

#### M3 — Several interactive targets are below 44px on touch
- **Where:** per-message reply `p-1` (see C1); modal close "esc ✕" (`p-1.5`/`p-2`); small `sm` buttons `h-9` (36px).
- **Problem:** Below the 44px guideline; fiddly on phones.
- **Recommendation:** Give icon-only controls a minimum 44×44 hit area (padding or an invisible expanded tap zone). `h-9` text buttons are borderline-acceptable but prefer `h-11` for anything frequently tapped.
- **Impact:** Medium · **Effort:** Low.

#### M4 — Room header may crowd at 320px
- **Where:** `Room.tsx` ChatHeader (presence + invite + call + "unrecorded" + vaporize).
- **Problem:** With C2 fixed, labels reappear; combined with the vaporize button this is a lot of header for a 320px screen. Couldn't verify at runtime — flag to test.
- **Recommendation:** After fixing C2, test at 320/360px. Consider collapsing invite/call into an overflow "⋯" on the smallest widths.
- **Impact:** Medium · **Effort:** Low (after C2).

### NICE-TO-HAVE

- **N1 — Char-counter warning uses `signal` (positive) mint** (`Composer.tsx`) to signal "running low." Consider `fog`/`ember` so the semantic reads correctly. *Low/Trivial.*
- **N2 — No skip-to-content link.** Landing has a fixed `Nav`; keyboard users tab through it on every view. Add a visually-hidden "skip to content" anchor. *Low.*
- **N3 — Canvas visualizers aren't DPR-scaled** (`AudioWaveform.tsx` fixed 36×22) — slightly blurry on retina; and the active-speaking rAF loop runs continuously per tile. Minor polish/perf. *Low.*
- **N4 — Reveal-on-scroll FOUC risk** (`useReveal.ts`): `gsap.from` hides `[data-reveal]` until ScrollTrigger fires; fine with JS, but any trigger miss leaves content faded. Low risk. *Low.*

---

## 4. Screen-by-Screen Notes

- **Landing** (`components/*`, `Nav.tsx`, `EvaporatingConfession.tsx`): Strong first impression; reduced-motion fallback renders a static confession line (good). Nav is intentionally minimal — acceptable, but see N2 (skip link).
- **Pre-chat Notice** (`PreChatNotice.tsx`): Excellent pattern and tone. Undermined by the broken legal links (H2). `fog-dim` eyebrow/footer text fails contrast (H1).
- **Gate** (`Gate.tsx`): Best-in-app form a11y. Channel hairline list is clear.
- **Room Browser** (`RoomBrowser.tsx`): Good dialog + freshness labels. Tapping a room with no name set closes the board and surfaces the name error back at the gate — functional but a slightly jarring context switch; consider inlining the prompt. No focus trap (M1).
- **Matching** (`Matching.tsx`): Consent handshake + draining clock reads well. Verify the "timed out" state is visible when the clock empties (couldn't confirm at runtime).
- **Room / Composer / MessageList** (`Room.tsx`, `Composer.tsx`, `MessageList.tsx`): The core. Hurt by C1 (reply), C2 (hidden labels), H1 (microcopy contrast), M4 (header density). Everything else — grouping, jump-to-latest, quoted replies, typing signals — is well done.
- **Call UI** (`CallDock.tsx`, `IncomingCallModal.tsx`): Great touch targets and motion; let down only by hardcoded colors (M2) and the non-token red.
- **Share / Join / Android modal** (`SharePanel.tsx`, `JoinGate.tsx`, `AndroidDownloadModal.tsx`): Solid; H3 (external QR) and M1 (trap) apply.

---

## 5. User Flow Analysis

- **First-time → chatting:** Landing → notice → gate → room. Clean and fast. Only snag: a curious user who taps "privacy policy"/"terms" on the notice is ejected to marketing (H2) and must re-enter.
- **Reply to a message on mobile:** **Broken.** No reliable way to reveal the reply control on touch (C1). This is the most important flow failure.
- **Start/join a voice call:** Smooth; incoming modal has clear accept/decline, chime, keyboard shortcuts. Good.
- **Create/join private room by key:** Clear via Gate + JoinGate; deep links documented and handled.
- **Leaving / vaporize:** `ConfirmVaporize` guards the destructive exit with proper dialog semantics. Good — just add the focus trap (M1).

---

## 6. Accessibility Checklist

| Check | Status | Evidence |
|---|---|---|
| Semantic headings per view | ✅ Pass | each view owns an `h1` (e.g. `Gate.tsx`) |
| Live regions for dynamic content | ✅ Pass | `MessageList.tsx` `role=log aria-live=polite`; `TypingLine` `role=status` |
| Form labels / error semantics | ✅ Pass | `Gate.tsx` `aria-invalid` + `role=alert` |
| Toggle semantics | ✅ Pass | `ThemeToggle.tsx` / SoundToggle `role=switch`+`aria-checked` |
| Dialog roles | ✅ Pass | all modals `role=dialog aria-modal` |
| Focus trap in dialogs | ❌ Fail | only `AndroidDownloadModal.tsx` attempts it, selector malformed (~line 27); others don't trap |
| Reduced-motion support | ✅ Pass | `matchMedia` branches + `index.css` ~660-682 |
| Text contrast ≥ AA | ❌ Fail | `fog-dim` ≈ 2.96:1 dark / 2.98:1 light (H1); `fog` ≈ 6:1 passes |
| Touch targets ≥ 44px | ⚠️ Partial | call dock/composer pass; reply `p-1`, close buttons, `h-9` fail |
| Hover-only actions have touch path | ❌ Fail | reply button hover-only (C1) |
| Keyboard operability of core flows | ⚠️ Partial | send/toggles/modals OK; reply not reachable without hover/tab discovery |
| Skip-to-content link | ❌ Fail | none present (N2) |
| Visible focus indicators | ✅ Pass | `button.tsx` focus-visible rings |

---

## 7. Design System Suggestions

**Tokens**
- Fix `--color-fog-dim` to meet AA (H1) and document its intended role (decorative only).
- Add `--breakpoint-xs: 25rem;` to the `@theme` block so `xs:` means something (C2) — or ban it.
- Add a semantic destructive token alias so no component hardcodes red (M2).

**Components**
- `useFocusTrap(ref)` hook — one implementation, used by every dialog (M1).
- `<IconButton>` wrapper enforcing a 44px min hit area + required `aria-label` (C1/M3).
- `<Modal>` shell that bundles role/aria-modal + scroll-lock + Escape + focus-trap + focus-restore so each modal stops re-implementing them (and can't drift).
- `<Microcopy>`/eyebrow component bound to the AA-safe token so no future 10px text slips below contrast.

---

## 8. Quick Wins (< 30 min each)

- [ ] Replace `xs:` with `sm:` (or define `--breakpoint-xs`) in `Room.tsx:417,425,463`. (C2)
- [ ] Bump `--color-fog-dim` to the AA-safe values in §H1. (H1)
- [ ] Fix the malformed focus-trap selector in `AndroidDownloadModal.tsx` (~line 27). (M1)
- [ ] Swap `rgba(255,107,107,…)` for the ember token in `CallDock.tsx`. (M2)
- [ ] Make the per-message reply button visible under `@media (hover: none)`. (C1, first pass)
- [ ] Point `#/privacy`/`#/terms` at a modal or disable them until pages exist. (H2, stopgap)
- [ ] Change the char-counter warning color off `signal`. (N1)

---

## 9. Suggested Roadmap

**Phase 1 — Reachability & correctness (this week).** C1 (reply on touch), C2 (`xs:` labels), H1 (contrast). These are small diffs with the largest real-user payoff.

**Phase 2 — Trust & legal (next).** H2 (real privacy/terms routes), H3 (local QR + self-hosted fonts). Protects the product's core promise.

**Phase 3 — A11y hardening.** M1 (shared focus trap + `<Modal>`), M3 (44px targets), N2 (skip link). Ship the reusable `useFocusTrap`/`<IconButton>`/`<Modal>` so the gains stick.

**Phase 4 — Polish.** M2/M4 (token cleanup + header density), N1/N3/N4 (semantics, DPR, FOUC). Low urgency, high craft.

---

*Audited read-only against the source on 2026-10-10. Runtime-unverified items (M4 header density, Matching timeout state) are flagged inline. Contrast figures computed from `src/index.css` token hex values.*
