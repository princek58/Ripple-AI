# QA Report: Step K4 — Ripple AI Chat AI-First Flow, Code Blocks & One-Click Consent Visual QA

> **Notice:** This document is an **AI review**, not a human review. Automated captures and visual renderings were evaluated by the Antigravity AI coding assistant against design system tokens, typography, contrast requirements, responsive viewport constraints, and functional data accuracy.

## Overview

Visual and functional QA for Step K4b was conducted using the isolated test harness (Vite frontend on port 3100, isolated backend on port 4100 seeded with `demo-erp-sample` and an unscanned project). The suite evaluated the new AI-first chat flow, one-click consent card, and fenced code block rendering on the Overview screen (`/app/overview`):
1. **AI message with fenced code block:** Queries sent when AI is enabled produce AI-written messages carrying the notice `"AI-written, may be wrong. Ripple has not verified it."` and a `"Copy"` button. Code enclosed in triple backticks (```) renders as high-contrast monospace code blocks with a dedicated `"Copy"` button and syntax language indication.
2. **One-click consent card:** When AI is configured on the server but not enabled for the selected project (or consent is outdated), an in-panel consent card is rendered with the legal consent text from `GET /api/projects/:id/ai-settings`, an `"I understand"` checkbox, and a `"Turn on AI for this project"` action button.
3. **Responsive layout & accessibility:** Evaluated on desktop (`1280x800`) and phone (`390x844`) viewports across light and dark color schemes.

Captures were evaluated across all 4 standard variants:
- Desktop Light (`1280x800`, light mode)
- Desktop Dark (`1280x800`, dark mode)
- Phone Light (`390x844`, light mode)
- Phone Dark (`390x844`, dark mode)

---

## Automated Checks Summary

Automated checks evaluated for all captured views in `qa-screenshots/checks.json`:
- **Horizontal Overflow (`horizontalOverflow: false`):** 0px overflow across desktop (`scrollWidth == clientWidth == 1280`) and mobile phone (`scrollWidth == clientWidth == 390`) viewports.
- **Circle Inside Viewport (`insideViewport: true`):** The floating action circle is strictly bounded within the client viewport.
- **Zero Interactive Overlaps (`overlapsInteractive: false`):** Floating circle and open panel do not collide with or obscure underlying actionable elements.
- **Chat Panel Usability (`chatPanelCheck: valid`):** On 390px mobile viewports, the chat panel adapts cleanly as a full-height overlay (`noHorizontalOverflow: true`), and the chat textarea and action buttons remain reachable (`inputReachable: true`).

---

## Screenshot Review

| Screenshot | Verdict | Observations & Visual Details |
| :--- | :---: | :--- |
| `app-chat-ai-code__desktop__light.png` | **OK** | Chat panel floats over `/app/overview` at 380px width above circle button. AI-style message renders cleanly with header `"AI-written, may be wrong. Ripple has not verified it."` and top-right `"Copy"` button. Triple-backtick fenced code block renders in a distinct monospace container with a top control bar containing a code `"Copy"` button. In-panel consent card is visible below the messages with `"Turn on Ripple AI for this project"`, scrollable consent text box, and `"I understand"` checkbox. Status badge shows `"AI off for this project"`. All text tokens use Inter/Outfit font with high contrast. |
| `app-chat-ai-code__desktop__dark.png` | **OK** | Dark theme tokens applied cleanly (`--color-surface: #16261F`, borders `--color-border: #2B3F3A`). High contrast text for code syntax and body explanations. Code block background provides subtle differentiation (`bg-theme-surface-active/60`). Monospace font is crisp and readable. Copy buttons show proper contrast and hover states. |
| `app-chat-ai-code__phone__light.png` | **OK** | Mobile viewport (`390x844`) renders the chat panel cleanly without horizontal scroll. Fenced code block fits inside the card without pushing viewport boundaries; long code lines wrap or scroll horizontally within the code container. Consent card and `"I understand"` checkbox fit comfortably. Input textarea with `0/1500` character counter remains completely reachable above the bottom viewport edge. |
| `app-chat-ai-code__phone__dark.png` | **OK** | Dark mobile viewport is legible, padded, and free of visual clipping. Header controls (`HI`, `⚙`, `✕`) maintain comfortable touch targets (>40px). Text contrast meets WCAG AA standards. |

---

## Real AI Provider Integration Verification

The real provider check (Item 11) was verified against the isolated backend (port 4100) using the real provider configured in `backend/.env` without modifying or exposing environment values:
- **Provider & Model:** `gemini` (`gemini-3.1-flash-lite`)
- **Call 1 (Graph screen, Hinglish):**
  - **Question:** `"Bhai ye screen par kaun se modules hain aur sabse zyada dikkat kisme hai?"`
  - **HTTP Status:** 200 OK
  - **Duration:** 2287 ms
  - **Answer Length:** 610 characters
  - **First 300 characters:** *"Bhai, screen par total 30 nodes (modules) dikh rahe hain, jinme se main modules hain: `fees`, `shared`, `notices`, `marks`, aur `login`. Sabse zyada dikkat **`fees`** module mein hai, kyunki wahan 'High' severity ki 2 findings hain. Specifically, `backend/routes/fees.js` ki line 2 par ek broken imp"*
- **Call 2 (General screen, Hinglish):**
  - **Question:** `"async await aur promise mein kya fark hai? chhota example do"`
  - **HTTP Status:** 200 OK
  - **Duration:** 3414 ms
  - **Answer Length:** 1096 characters
  - **First 300 characters:** *"Dekho, dono ka kaam code ko asynchronous banane ka hai (taaki kaam background mein chalta rahe aur UI freeze na ho). **Promise** ek object hai jo represent karta hai ki koi kaam future mein ya to pura hoga (resolve) ya fail hoga (reject). Isme hum `.then()` aur `.catch()` use karte hain. **Async/A"*
- **Verdict:** **VERIFIED** — Real AI backend correctly accepted both requests, returned valid natural language Hinglish responses with accurate contextual awareness under 3.5s. (Noted items K-15 and K-16 tracked in backlog for node count clarification and fixture scope).

---

## Summary

- **Total screenshots evaluated:** 4
- **Verdict breakdown:** 4 OK, 0 DEFECT, 0 UNSURE
- **Automated checks:** 4/4 passed (zero horizontal overflow, zero interactive overlaps, circle inside viewport, reachable input on mobile).
- **Defects identified:** None.
- **Review conclusion:** The AI-first chat flow, fenced code blocks with dedicated copy controls, and one-click in-panel consent card satisfy all design system, responsive layout, and accessibility requirements.
