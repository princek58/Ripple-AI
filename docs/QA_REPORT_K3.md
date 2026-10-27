# QA Report: Step K3 — Ripple AI Chatbox Demo-Ready Visual QA

> **Notice:** This document is an **AI review**, not a human review. Automated captures and visual renderings were evaluated by the Antigravity AI coding assistant against design system tokens, typography, contrast requirements, responsive viewport constraints, and functional data accuracy.

## Overview

Visual and functional QA for Step K3 was conducted using the isolated test harness (Vite frontend on port 3100, isolated backend on port 4100 seeded with `demo-erp-sample` and an unscanned project). The suite evaluated the new deterministic offline data answers computed directly from Ripple's own analysis results on the Overview screen (`/app/overview`):
1. **Finding counts by severity and rule:** Query `"kitni findings hain"` (Hindi/Hinglish) returns total count (9), breakdown by severity (High: 1, Medium: 2, Low: 6), breakdown by rule (Isolated file: 5, Broken import: 1, Unmatched API call: 1, Undeclared environment variable: 1, Circular dependency: 1), and ends with `"Offline help from Ripple's own data. Not AI-written."`.
2. **Prioritized fix recommendations:** Query `"pehle kya theek karun"` (Hindi/Hinglish) computes the top 3 findings ordered by severity then confidence, formatted with finding title and `file:line` location, the disclaimer `"This order comes from severity and confidence, it is not a guarantee."`, and the label `"Offline help from Ripple's own data. Not AI-written."`.

Captures were taken across all 4 standard variants:
- Desktop Light (`1280x800`, light mode)
- Desktop Dark (`1280x800`, dark mode)
- Phone Light (`390x844`, light mode)
- Phone Dark (`390x844`, dark mode)

---

## Automated Checks Summary

Automated checks evaluated for all 8 captured views:
- **Horizontal Overflow (`horizontalOverflow: false`):** 0px overflow across desktop and mobile phone viewports.
- **Circle Inside Viewport (`insideViewport: true`):** The floating action circle is strictly bounded within the client viewport.
- **Zero Interactive Overlaps (`overlapsInteractive: false`):** Floating circle and open panel do not collide with or obscure underlying actionable elements.
- **Chat Panel Usability (`chatPanelCheck: valid`):** On 390px mobile viewports, the chat panel adapts cleanly as a full-height overlay (`noHorizontalOverflow: true`), and the chat textarea and action buttons remain reachable (`inputReachable: true`).

---

## Screenshot Review

| Screenshot | Verdict | Observations & Visual Details |
| :--- | :---: | :--- |
| `app-chat-data-findings__desktop__light.png` | **OK** | Chat panel floats over `/app/overview` at 380px width above circle button. Query `"kitni findings hain"` generates deterministic offline answer matching the project's exact findings: 9 total (1 High, 2 Medium, 6 Low), breakdown across all 5 active rules. Ending banner clearly reads: `"Offline help from Ripple's own data. Not AI-written."`. All text tokens use Inter/Outfit font with high contrast. |
| `app-chat-data-findings__desktop__dark.png` | **OK** | Dark theme tokens applied cleanly (`--color-surface: #16261F`, borders `--color-border: #2B3F3A`). High contrast text for labels and bullet points. Status badge shows `"AI off for this project"`. No clipping or bleeding. |
| `app-chat-data-findings__phone__light.png` | **OK** | Mobile full-screen sheet overlay fits within 390px width without horizontal scroll. List of findings by severity and rule wraps naturally within message card. Textarea is positioned above bottom viewport margin and input counter `0/1500` is clear. |
| `app-chat-data-findings__phone__dark.png` | **OK** | Dark mobile viewport is legible and well-padded. Close button `✕`, language toggle `HI`, and settings cog `⚙` in top header have comfortable touch targets (>40px). |
| `app-chat-data-fix-first__desktop__light.png` | **OK** | Question `"pehle kya theek karun"` returns the top 3 findings strictly ordered: 1. `Broken import "../services/feeService" in fees.js (backend/routes/fees.js:2)` [High], 2. `Unmatched API call "GET /api/notice/list" in NoticePage.tsx (frontend/src/pages/NoticePage.tsx:13)` [Medium], 3. `Undeclared environment variable "JWT_SECRET" (backend/config/db.js:2)` [Medium]. Mandatory disclaimer is present: `"This order comes from severity and confidence, it is not a guarantee."`. Clear offline provenance label. |
| `app-chat-data-fix-first__desktop__dark.png` | **OK** | Dark mode contrast is crisp. The 3 findings with file paths and line numbers are cleanly distinguishable. Disclaimer and footer text are distinct. |
| `app-chat-data-fix-first__phone__light.png` | **OK** | On mobile 390px viewport, long file paths (`frontend/src/pages/NoticePage.tsx:13`) wrap properly without breaking the panel layout or causing horizontal scrollbar. |
| `app-chat-data-fix-first__phone__dark.png` | **OK** | Dark theme mobile presentation renders all 3 findings with excellent readability. Message cards have consistent borders and background colors. |

---

## Real AI Provider Integration Verification

A single live verification call was executed against the isolated backend (port 4100) using the real provider configured in `backend/.env` without modifying or exposing environment values:
- **HTTP status:** 200 OK
- **Source:** `gemini`
- **Provider:** `gemini`
- **Model:** `gemini-3.1-flash-lite`
- **Duration:** 2432ms
- **Answer length:** 798 characters
- **Question asked:** `"Ye broken import wali finding kya hai aur kaise theek karun?"` (Screen: `investigations`, Finding: `broken_import` in `fees.js`, Language: `hi`)
- **Answer excerpt:** *"Iska matlab hai ki aapke `fees.js` file mein `../services/feeService` ka path sahi nahi hai. Static analysis ke mutabiq, aapka computer us file ko waha dhoond nahi pa raha hai jahan aapne point kiya h..."*
- **Verdict:** **VERIFIED** — Real AI backend correctly accepted the request, constructed context from the scan finding, generated a coherent and contextually accurate Hindi remediation guide, and returned HTTP 200 within 2.5 seconds.

---

## Summary

- **Total screenshots evaluated:** 8
- **Verdict breakdown:** 8 OK, 0 DEFECT, 0 UNSURE
- **Automated checks:** 8/8 passed (zero horizontal overflow, zero interactive overlaps, circle inside viewport, reachable input on mobile).
- **Defects identified:** None.
- **Review conclusion:** The chat panel offline data answers and responsive presentation meet all quality, accessibility, and design token requirements.
