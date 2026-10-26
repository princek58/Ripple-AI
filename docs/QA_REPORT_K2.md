# QA Report: Step K2 — Ripple AI Chatbox UI

> **Notice:** This document is an **AI review**, not a human review. Automated captures were evaluated by the Antigravity AI coding agent against design tokens, accessibility constraints, and responsive viewport specifications.

## Overview
Automated visual QA was conducted using the isolated test harness (Vite frontend on port 3100, isolated backend on port 4100 seeded with `demo-erp-sample` and an unscanned project). The suite evaluated the Ripple AI chat button across landing and all core app routes, the open chat panel with screen-specific welcome cards, offline dictionary answer flows ("circular dependency kya hai"), and the chat settings consent flow across desktop (1280x800) and phone (390x844) viewports in both light and dark themes (32 total screenshots).

All automated assertions passed:
- **Circle button inside viewport:** Verified on every route and viewport.
- **Zero interactive control overlaps:** Chat button does not overlap ReactFlow zoom controls, header links, action buttons, or modal controls.
- **Mobile phone integrity:** With the panel open on phone viewports (390px), horizontal overflow is strictly zero (`scrollWidth <= clientWidth`), and the chat textarea is fully reachable and touch-operable.
- **Self-test defect verification:** Automated checks in `frontend/e2e/checks.selftest.spec.ts` prove defect injection detection (circle out of viewport, circle overlapping other interactive elements, mobile panel horizontal overflow, unreachable/hidden input).

---

## Screenshot Review

| Screenshot | Verdict | Notes |
| :--- | :---: | :--- |
| `landing__desktop__light.png` | **OK** | 56px original circular button at bottom right with "Ask Ripple AI" pill label. Speech bubble and 3 ripple wave arcs icon rendered cleanly. Clear of landing footer and CTA. Contrast exceeds 3:1. |
| `landing__desktop__dark.png` | **OK** | Dark theme tokens applied (`--chat-circle-bg: #E3F57A`, `--chat-circle-fg: #1B382B`). High contrast icon against circle and circle against dark background. |
| `landing__phone__light.png` | **OK** | 390px phone viewport hides pill text and displays round 56px icon-only circle at bottom right. No horizontal scrolling. |
| `landing__phone__dark.png` | **OK** | Phone dark mode renders circle button with visible focus ring capabilities and clear contrast against dark background. |
| `app-overview__desktop__light.png` | **OK** | Pill button "Ask Ripple AI" is positioned at bottom right, fully inside viewport. No overlap with Overview level-1 graph card or module chips. |
| `app-overview__desktop__dark.png` | **OK** | Dark mode tokens crisp. High visibility against dark background. Clean focus outline token. |
| `app-overview__phone__light.png` | **OK** | Mobile layout shows compact 56px circle with speech bubble ripple waves. Does not obscure KPI stats or cards. |
| `app-overview__phone__dark.png` | **OK** | High contrast dark mode icon. Clear touch target (>48px). |
| `app-graph__desktop__light.png` | **OK** | Graph zoom controls positioned at bottom-left; chat pill button fixed at bottom-right. Zero overlap with canvas controls or legend panel. |
| `app-graph__desktop__dark.png` | **OK** | Dark mode canvas graph with distinct lime/forest chat pill button. |
| `app-graph__phone__light.png` | **OK** | Compact circle at bottom-right is completely clear of bottom-left zoom controls (+/- buttons). |
| `app-graph__phone__dark.png` | **OK** | Phone dark graph view maintains clean separation between zoom controls and floating chat circle. |
| `app-investigations__desktop__light.png` | **OK** | Chat button positioned at bottom-right; clear of pagination buttons and finding detail panel. |
| `app-investigations__desktop__dark.png` | **OK** | Dark theme findings view with high contrast chat button. |
| `app-investigations__phone__light.png` | **OK** | Mobile findings list scroll area maintains safe margins. Floating circle remains accessible without covering primary tabs. |
| `app-investigations__phone__dark.png` | **OK** | Sharp contrast and legible touch target on mobile dark view. |
| `app-reports__desktop__light.png` | **OK** | Report preview panel remains fully legible; chat button sits fixed at bottom-right without obscuring export buttons. |
| `app-reports__desktop__dark.png` | **OK** | Dark mode report markdown rendering with high-contrast floating button. |
| `app-reports__phone__light.png` | **OK** | Mobile report view remains single-column without horizontal clipping. Round circle floats cleanly. |
| `app-reports__phone__dark.png` | **OK** | Dark theme phone report view is legible and comfortable to read. |
| `app-chat-welcome__desktop__light.png` | **OK** | Floating 380px panel mounted above circle button. Header shows "Ripple AI", status badge "AI off for this project", language toggle "HI", settings cog, close button. Welcome card presents 3 clickable suggestions. Input area shows 0/1500 counter and disabled Send button. Circle button transforms to downward chevron. |
| `app-chat-welcome__desktop__dark.png` | **OK** | Dark surface tokens (`#16261F`) with crisp borders (`#2B3F3A`). Welcome card text is legible and well-spaced. |
| `app-chat-welcome__phone__light.png` | **OK** | Full-screen phone overlay with top header, close button, welcome questions, and bottom input area. No horizontal overflow. |
| `app-chat-welcome__phone__dark.png` | **OK** | Full-screen phone overlay in dark theme with high contrast borders and input field. |
| `app-chat-answer__desktop__light.png` | **OK** | Query "circular dependency kya hai" returns instant offline glossary answer. Distinct "OFFLINE HELP" badge. Explicit disclaimer: "Offline help — this answer is not from AI". Plain-text explanation and example rendered without HTML injection. |
| `app-chat-answer__desktop__dark.png` | **OK** | Dark theme message bubble with clear text contrast and prominent offline badge. |
| `app-chat-answer__phone__light.png` | **OK** | Full-screen phone overlay displays offline answer cleanly. Text wraps within bounds without horizontal scrolling. |
| `app-chat-answer__phone__dark.png` | **OK** | Mobile dark mode chat answer is legible and easy to read. |
| `app-chat-settings__desktop__light.png` | **OK** | Settings view displays "<- Back Chat settings", "AI off for this project" badge, project AI toggle switch, and disabled 7-line code snippet toggle with safety warning. |
| `app-chat-settings__desktop__dark.png` | **OK** | Dark theme settings toggle controls and warning text ("Only for code you own or may share") are sharp and high-contrast. |
| `app-chat-settings__phone__light.png` | **OK** | Settings section in mobile full-screen overlay fits comfortably with readable touch switches and labels. |
| `app-chat-settings__phone__dark.png` | **OK** | Dark mode mobile settings view conforms to all spacing and contrast requirements. |

---

## Summary
- **Total screenshots evaluated:** 32
- **Verdict breakdown:** 32 OK, 0 DEFECT, 0 UNSURE
- **Automated check results:** All 32 passed; circle button inside viewport; zero overlap with primary controls; zero horizontal overflow on mobile viewports; input reachable.
- **Reviewer notice:** Evaluated by AI review against design tokens and automated visual check rules.
