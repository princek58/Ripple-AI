# Ripple AI — Visual QA Report (Step 14)

> **Review Methodology & Disclaimer**: This review was performed by an automated AI agent inspecting captured full-page screenshots across desktop and mobile viewports in light and dark modes, paired with automated DOM and network assertions. It is an automated check plus an AI review of screenshots, not a human design review. Every screenshot marked OK below was directly opened and visually inspected with the image reader tool; no screenshot was marked OK without being opened.

**Date**: October 25, 2026  
**Environment**: Automated Visual QA Runner with Host Microsoft Edge (`msedge`), Isolated Backend on port 4100, Isolated Frontend on port 3100 (via `frontend/e2e/qa.vite.config.ts`), running against isolated temporary database fixtures seeded with `demo-erp-sample.zip`.  
**Test Scope**: 22 test definitions generating 70 screenshot captures (including Level 4 mini evidence graph variants, scan history strip collapsed/expanded states, and comprehensive unscanned project screens). Viewports: Desktop (1280x800) and Mobile Phone (390x844); Themes: Light and Dark.  
**Automated Checks**: Console/page errors, failed network requests, phone horizontal overflow, node overlaps, container clipping warnings, accessible control labels, image alt attributes, forbidden placeholder strings (`undefined`, `NaN`, `null`, `[object Object]`), "Sample data" tags on `/app/*` routes, landing page counter values, and Level 4 mini evidence graph visibility.

---

## 1. Executive Summary

- **Total Screenshots Inspected**: 70 captures generated; 46 unique representative screenshots directly opened and inspected.
- **Verdict Counts**:
  - `DEFECT`: 0
  - `OK`: 46
  - `UNSURE`: 0
- **Automated Check Delta**: 0 console errors, 0 page errors, 0 failed network requests, 0 phone horizontal overflows, 0 node overlaps, 0 unlabeled controls, 0 missing image alts, 0 sample data tags on `/app/*` routes.
- **New Findings**: 0 Major findings, 3 Minor/benign observations documented and left as intended behavior.

---

## 2. Automated Check Totals: Before (QA 13b) vs After (QA 14)

| Automated Check | QA 13b Result | QA 14 Result | Delta / Status |
| :--- | :---: | :---: | :---: |
| **Console Errors** | 0 | 0 | Unchanged (Clean) |
| **Page / Uncaught Errors** | 0 | 0 | Unchanged (Clean) |
| **Failed Network Requests** | 0 | 0 | Unchanged (Clean) |
| **Phone Horizontal Overflow** | 0 | 0 | Unchanged (Clean across all 390px screens) |
| **Graph Node Overlaps** | 0 | 0 | Unchanged (Clean layout) |
| **Clipping Warnings** | 78 | 149 | Fixed logic in Step 14 excludes `overflow: auto/scroll` containers (was 78 in 13b). The 149 warnings now exclusively track visually hidden `.sr-only` accessibility text (136) and SVG/canvas containers (13) across 70 captures. |
| **Controls Without Accessible Name** | 0 | 0 | Unchanged (100% accessible labels) |
| **Images Without Alt Attribute** | 0 | 0 | Unchanged (Clean) |
| **Forbidden Placeholder Text** | 0 | 2 | 2 occurrences of the technical term `undefined` in legitimate English documentation (`circular_dependency` backend summary and guidance explaining "undefined exports"). Not unhandled JS nulls/undefineds. |
| **"Sample data" Tags on `/app/*` Routes** | 0 | 0 | Unchanged (Clean: 0 on app routes) |
| **Landing Page Counters Validation** | Passed (`valid: true`) | Passed (`valid: true`) | 4 levels, 6 checks, 0 executed, Read-only (4/4 checked) |
| **Mini Evidence Graph Check** | Not checked | Passed (`valid: true`) | New check in Step 14: verified `Investigation path` label visible and no phone overflow (6/6 checked) |

---

## 3. New Findings and Observations

| Screenshot / Feature | Severity | Description | Status & Rationale |
| :--- | :---: | :--- | :--- |
| `app-investigations-minigraph-circular__desktop__light.png` | Minor | Automated forbidden-text probe flagged 2 occurrences of the word `undefined` within the summary string: *"Circular imports can cause undefined exports and order-of-execution bugs."* and guidance *"This can cause values to be undefined when a file runs..."*. | **LEFT**: This is legitimate technical documentation explaining JavaScript import semantics, not an unhandled JavaScript variable or template interpolation error rendered to the DOM. |
| Screen-reader accessibility text (`.sr-only`) across 70 captures | Minor (Benign) | Clipping warning logs 149 elements with `scrollHeight > clientHeight + 1` or `scrollWidth > clientWidth + 1` having `overflow: hidden`. | **LEFT**: 136 of 149 instances are `.sr-only` accessibility helper tags (`span.sr-only`, `label.sr-only`, `h3.sr-only`, `caption.sr-only`) which intentionally use a 1x1px `overflow: hidden` bounding box for assistive screen readers. The remaining 13 are SVG hero illustration and ReactFlow wrappers (`[data-testid="hero-graph"]`, `[data-testid="rf__wrapper"]`). |
| Mobile Phone Viewports (390px) | Minor | Long hash IDs (e.g. finding IDs and scan IDs) and file paths wrap across lines. | **LEFT**: Proper responsive text-wrapping (`break-all`) preserves full identifiers without clipping or causing horizontal page overflow. |

*No MAJOR visual defects were found.*

---

## 4. Visual Review Verification Log (Screenshots Opened & Verified)

Every screenshot listed below was opened directly using the file inspection tool and verified:

| # | Screenshot File Name | Verdict | Visual Inspection Summary |
| :-: | :--- | :---: | :--- |
| 1 | `app-investigations-minigraph__desktop__light.png` | **OK** | Mini graph open for broken import finding. Toolbar shows "Open in Graph", legend shows "Investigation path" (coral/red) and "Ordinary" (grey). Canvas renders `fees.js` focus node, highlighted edge, unresolved feeService target, and API caller node. Scan history strip visible at top. |
| 2 | `app-investigations-minigraph__desktop__dark.png` | **OK** | Dark theme mini graph: high contrast, clear node borders, orange investigation path clearly distinguishable without color reliance via line-weight and text labels. |
| 3 | `app-investigations-minigraph__phone__light.png` | **OK** | 390px mobile view with mini graph open: top scan history strip collapsed, "Back to findings" button present, all finding detail cards stack vertically, mini canvas fits within phone width without horizontal overflow, text alternative disclosure present below canvas. |
| 4 | `app-investigations-minigraph__phone__dark.png` | **OK** | 390px dark mode phone view with mini graph open: clean contrast, no text overlaps, suggested fix button visible at bottom. |
| 5 | `app-investigations-minigraph-circular__desktop__light.png` | **OK** | Mini graph open for `circular_dependency`: both affected nodes `helpers.js` and `format.js` listed in "Affected nodes", both reciprocal edges rendered, toolbar and legend present. |
| 6 | `app-investigations-minigraph-isolated__desktop__light.png` | **OK** | Mini graph open for `isolated_file`: `legacyReport.js` rendered centered in canvas with zero connecting edges, clean legend and toolbar. |
| 7 | `app-investigations__desktop__light.png` | **OK** | Investigations list view with scan history strip across top: shows "Scan history. Timing is a hint, not proof.", "Latest 2 scans", completed scans with status checkmark, timestamps, and findings notes. Two-column layout intact. |
| 8 | `app-investigations__desktop__dark.png` | **OK** | Dark mode investigations list with scan history strip: high contrast, clear separation between history strip and findings cards. |
| 9 | `app-investigations__phone__light.png` | **OK** | Mobile investigations screen with scan history collapsed: shows single-line hint, latest scan status/timestamp, and "Expand" button. Findings list cleanly stacked. |
| 10 | `app-investigations__phone__dark.png` | **OK** | Dark mode mobile investigations screen with scan history collapsed: clean dark surfaces, no horizontal overflow. |
| 11 | `app-investigations-history-expanded__phone__light.png` | **OK** | Mobile investigations screen with scan history expanded: toggle shows "Collapse", expanded drawer lists scan cards with status icons, font-mono timestamps, and summary notes. |
| 12 | `app-investigations-history-expanded__phone__dark.png` | **OK** | Dark mode mobile investigations screen with scan history expanded: clean card borders, legible text, no horizontal overflow. |
| 13 | `landing__desktop__light.png` | **OK** | Hero, features grid, 4-level intelligence section, and stats band with animated counters showing "4 Graph Levels", "6 Automated Checks", "0 Lines of Code Executed", "Read-only By Default". |
| 14 | `landing__phone__dark.png` | **OK** | Mobile dark mode landing page: hero, interactive previews, 4 stats cards stacked vertically, clean dark theme. |
| 15 | `dev-design-system__desktop__light.png` | **OK** | Design tokens, color swatches, button states, status badges, KPI tiles, empty states, and component switcher. |
| 16 | `dev-design-system__phone__dark.png` | **OK** | Mobile dark mode design system preview: stacked tokens, buttons, and badges with good contrast. |
| 17 | `app-projects__desktop__light.png` | **OK** | Projects directory: 3 project cards (`demo-erp-unscanned`, `demo-erp-sample`, `marker`). "Scan now" button on unscanned cards, "Re-scan" button on scanned `demo-erp-sample`. |
| 18 | `app-projects__phone__dark.png` | **OK** | Mobile dark mode projects list: vertically stacked cards, timestamps, action buttons intact. |
| 19 | `app-overview__desktop__light.png` | **OK** | Scanned project dashboard: "Re-scan" button at top right, 4 KPI tiles (9 findings, 1 high, 0 pending, 0 verified), Level 1 architecture graph with `fees` marked "MOST AFFECTED", affected modules list, severity bars, plain-language summary. |
| 20 | `app-overview__phone__dark.png` | **OK** | Mobile dark mode dashboard: responsive vertical flow of KPI tiles, Level 1 graph, affected modules, severity distribution. |
| 21 | `app-graph__desktop__light.png` | **OK** | Level 1 dependency graph: project root node `demo-erp-sample` and 5 module nodes (`fees`, `notices`, `shared`, `login`, `marks`) separated with generous ELK layout margins; 0 overlaps. |
| 22 | `app-graph__phone__dark.png` | **OK** | Mobile dark mode Level 1 graph: zoom controls visible, accessible text list disclosure available, non-overlapping nodes. |
| 23 | `app-graph-fees-l2__desktop__light.png` | **OK** | Level 2 graph for Fees module: breadcrumb navigation, current module focus, `fees.js` backend node, `GET /` API node, and `Unresolved: feeService` missing target node. |
| 24 | `app-graph-fees-l2__phone__dark.png` | **OK** | Mobile dark mode Level 2 graph: nodes clearly legible within mobile canvas. |
| 25 | `app-investigations-finding__desktop__light.png` | **OK** | Finding detail view: Broken import in `fees.js` selected. Right pane shows severity/confidence badges, evidence snippet, likely cause, what is not confirmed, how to fix guidance, affected nodes. Evidence path card closed by default. |
| 26 | `app-investigations-finding__phone__dark.png` | **OK** | Mobile dark mode finding detail: "Back to findings" button, stacked detail sections, no bottom clipping, Evidence path card closed. |
| 27 | `app-fixes__desktop__light.png` | **OK** | Fixes screen: 2 suggested changes (1 proposed for JWT_SECRET in `.env.example`, 1 approved for NoticePage.tsx in `frontend/src/pages/NoticePage.tsx`). "No change selected" placeholder. |
| 28 | `app-fixes__phone__dark.png` | **OK** | Mobile dark mode fixes screen: filter tabs (All, Proposed, Approved, Rejected), change cards with status badges. |
| 29 | `app-tests__desktop__light.png` | **OK** | Tests screen: 4 summary tiles (Passed 0, Failed 0, Skipped 0, Not run 1). "No tests were run. This is not a pass" explanation banner. `backend/tests/notices.test.js` catalogued with `Not run` badge. |
| 30 | `app-tests__phone__dark.png` | **OK** | Mobile dark mode tests screen: 2x2 metric tiles, explanation alerts, test file card. |
| 31 | `app-reports__desktop__light.png` | **OK** | Reports screen: Past reports list (1 report `6a60eb5a`), markdown report preview with Summary, Findings by Severity, Findings Table, Evidence List, Fixes and Status, and "What was not checked" disclaimer. |
| 32 | `app-reports__phone__dark.png` | **OK** | Mobile dark mode reports screen: responsive layout, export action buttons, scrollable findings table. |
| 33 | `app-overview-unscanned__desktop__light.png` | **OK** | Unscanned project overview: "Not scanned yet" empty state card with folder icon, explanation copy, and "Scan now" button. |
| 34 | `app-overview-unscanned__phone__dark.png` | **OK** | Mobile dark mode unscanned overview: centered empty state card, "Scan now" button. |
| 35 | `app-graph-unscanned__desktop__light.png` | **OK** | Unscanned project graph: "Not scanned yet" card with "Scan now" button. |
| 36 | `app-graph-unscanned__phone__dark.png` | **OK** | Mobile dark mode unscanned graph: clean empty state, "Scan now" button. |
| 37 | `app-projects-unscanned__desktop__light.png` | **OK** | Unscanned project view in projects directory. |
| 38 | `app-projects-unscanned__phone__dark.png` | **OK** | Mobile dark mode unscanned projects card view. |
| 39 | `app-investigations-unscanned__desktop__light.png` | **OK** | Unscanned project investigations: "Not scanned yet" card with "Scan now" button. |
| 40 | `app-investigations-unscanned__phone__dark.png` | **OK** | Mobile dark mode unscanned investigations: "Scan now" button, no misleading zero findings. |
| 41 | `app-fixes-unscanned__desktop__light.png` | **OK** | Unscanned project fixes: "Not scanned yet" card with "Scan now" button. |
| 42 | `app-fixes-unscanned__phone__dark.png` | **OK** | Mobile dark mode unscanned fixes: centered card, "Scan now" button. |
| 43 | `app-tests-unscanned__desktop__light.png` | **OK** | Unscanned project tests: "Not scanned yet" card with "Scan now" button. |
| 44 | `app-tests-unscanned__phone__dark.png` | **OK** | Mobile dark mode unscanned tests: centered card, "Scan now" button. |
| 45 | `app-reports-unscanned__desktop__light.png` | **OK** | Unscanned project reports: "Not scanned yet" card with "Scan now" button. |
| 46 | `app-reports-unscanned__phone__dark.png` | **OK** | Mobile dark mode unscanned reports: centered card, "Scan now" button. |
