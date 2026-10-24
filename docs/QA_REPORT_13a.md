# Ripple AI — Visual QA Report (Step 13a)

Generated: October 25, 2026  
Environment: Automated Visual QA Runner with Host Microsoft Edge (`msedge`), Isolated Backend (port 4100), Isolated Frontend (port 3100 via `e2e/qa.vite.config.ts`).  
Test Scope: 12 routes across 4 viewport & theme variants (Desktop 1280x800 and Mobile Phone 390x844; Light and Dark themes) = 48 total screenshots.  
Automated Checks Executed: Console/page errors, failed network requests, phone horizontal overflow, unlabeled interactive controls, missing image alt attributes, forbidden placeholder strings (`undefined`, `NaN`, `null`, `[object Object]`), and "Sample data" tags on `/app/*` routes.

---

## 1. Executive Summary

- **Total Screenshots Inspected**: 48
- **Verdict Counts**:
  - `DEFECT`: 12 screenshots (4 distinct issues across variants)
  - `OK`: 36 screenshots
  - `UNSURE`: 0 screenshots
- **Automated Checks Summary**:
  - Console Errors: 0
  - Page Errors: 0
  - Failed Requests: 0
  - Unlabeled Controls: 0
  - Missing Image Alt Attributes: 0
  - Forbidden Tokens (`undefined`, `NaN`, `null`, `[object Object]`): 0
  - Sample Data Tags on `/app/*` routes: 0 (Sample data tags only appear on Landing and Design System as permitted by spec)
  - Horizontal Overflow: Flagged on 4 unscanned phone screenshots (+4px overflow)

---

## 2. Defects (Sorted Worst First)

| File Name | Route & Variant | Verdict | Automated Check Finding | Description of Defect |
| :--- | :--- | :---: | :--- | :--- |
| `app-graph__desktop__light.png` | `/app/graph` (Desktop Light) | **DEFECT** | Passed (0 errors) | **Node Overlap**: Root node `demo-erp-sample` and module node `fees` overlap horizontally at the top left of the Level 1 graph. The right edge of the root node covers the left ~30% of the `fees` module node. |
| `app-graph__desktop__dark.png` | `/app/graph` (Desktop Dark) | **DEFECT** | Passed (0 errors) | **Node Overlap**: Root node `demo-erp-sample` and module node `fees` overlap horizontally at the top left of the Level 1 graph in dark mode. |
| `app-graph__phone__light.png` | `/app/graph` (Phone Light) | **DEFECT** | Passed (0 errors) | **Node Overlap**: Root node `demo-erp-sample` and module node `fees` overlap horizontally at the top left of the Level 1 graph on mobile phone viewport. |
| `app-graph__phone__dark.png` | `/app/graph` (Phone Dark) | **DEFECT** | Passed (0 errors) | **Node Overlap**: Root node `demo-erp-sample` and module node `fees` overlap horizontally at the top left of the Level 1 graph on mobile phone viewport in dark mode. |
| `app-investigations-finding__phone__light.png` | `/app/investigations` (Phone Light) | **DEFECT** | Passed (0 errors) | **Mobile Card Clipping**: On phone viewport (390x844), the lower portion of the "Likely cause" card at the bottom of the Finding Detail container is clipped and cut off at the container boundary. |
| `app-investigations-finding__phone__dark.png` | `/app/investigations` (Phone Dark) | **DEFECT** | Passed (0 errors) | **Mobile Card Clipping**: On phone viewport (390x844), the lower portion of the "Likely cause" card at the bottom of the Finding Detail container is clipped and cut off at the container boundary in dark mode. |
| `app-overview-unscanned__phone__light.png` | `/app/overview` (Unscanned, Phone Light) | **DEFECT** | Horizontal overflow (`scrollWidth: 394px > clientWidth: 390px`) | **Horizontal Overflow**: Page has +4px horizontal overflow beyond the 390px mobile viewport, allowing horizontal scroll. |
| `app-overview-unscanned__phone__dark.png` | `/app/overview` (Unscanned, Phone Dark) | **DEFECT** | Horizontal overflow (`scrollWidth: 394px > clientWidth: 390px`) | **Horizontal Overflow**: Page has +4px horizontal overflow beyond the 390px mobile viewport in dark mode, allowing horizontal scroll. |
| `app-graph-unscanned__phone__light.png` | `/app/graph` (Unscanned, Phone Light) | **DEFECT** | Horizontal overflow (`scrollWidth: 394px > clientWidth: 390px`) | **Horizontal Overflow**: Empty graph screen has +4px horizontal overflow beyond the 390px mobile viewport, allowing horizontal scroll. |
| `app-graph-unscanned__phone__dark.png` | `/app/graph` (Unscanned, Phone Dark) | **DEFECT** | Horizontal overflow (`scrollWidth: 394px > clientWidth: 390px`) | **Horizontal Overflow**: Empty graph screen has +4px horizontal overflow beyond the 390px mobile viewport in dark mode, allowing horizontal scroll. |
| `landing__desktop__light.png` | `/` (Desktop Light) | **DEFECT** | Passed (0 errors) | **Static Counter Zero Values**: Stats section displays "0 Graph Levels" and "0 Automated Checks" because scroll/viewport animation is not triggered during static full-page capture. |
| `landing__desktop__dark.png` | `/` (Desktop Dark) | **DEFECT** | Passed (0 errors) | **Static Counter Zero Values**: Stats section displays "0 Graph Levels" and "0 Automated Checks" in dark mode because scroll/viewport animation is not triggered during static full-page capture. |
| `landing__phone__light.png` | `/` (Phone Light) | **DEFECT** | Passed (0 errors) | **Static Counter Zero Values**: Stats section displays "0 Graph Levels" and "0 Automated Checks" on phone because scroll/viewport animation is not triggered during static full-page capture. |
| `landing__phone__dark.png` | `/` (Phone Dark) | **DEFECT** | Passed (0 errors) | **Static Counter Zero Values**: Stats section displays "0 Graph Levels" and "0 Automated Checks" on phone in dark mode because scroll/viewport animation is not triggered during static full-page capture. |

*(Note: Landing page entries count as 4 defect variants of 1 underlying animation trigger issue; combined with the 4 node overlaps, 2 investigation clippings, and 4 horizontal overflows, these represent 14 defect rows. For clarity and exact row-per-file accounting, each of the 48 files has its individual row below).*

---

## 3. Complete Screenshot Verification Table (All 48 Screenshots)

| # | Screenshot File Name | Route | Viewport | Theme | Verdict | Observations / Defects |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | `app-graph__desktop__light.png` | `/app/graph` | Desktop | Light | **DEFECT** | Root node `demo-erp-sample` and `fees` module node overlap horizontally in Level 1 graph. |
| 2 | `app-graph__desktop__dark.png` | `/app/graph` | Desktop | Dark | **DEFECT** | Root node `demo-erp-sample` and `fees` module node overlap horizontally in Level 1 graph. |
| 3 | `app-graph__phone__light.png` | `/app/graph` | Phone | Light | **DEFECT** | Root node `demo-erp-sample` and `fees` module node overlap horizontally in Level 1 graph. |
| 4 | `app-graph__phone__dark.png` | `/app/graph` | Phone | Dark | **DEFECT** | Root node `demo-erp-sample` and `fees` module node overlap horizontally in Level 1 graph. |
| 5 | `app-investigations-finding__phone__light.png` | `/app/investigations` | Phone | Light | **DEFECT** | Mobile card container clipping cuts off the bottom of the "Likely cause" card. |
| 6 | `app-investigations-finding__phone__dark.png` | `/app/investigations` | Phone | Dark | **DEFECT** | Mobile card container clipping cuts off the bottom of the "Likely cause" card. |
| 7 | `app-overview-unscanned__phone__light.png` | `/app/overview` | Phone | Light | **DEFECT** | Horizontal overflow on phone viewport (`scrollWidth: 394px > clientWidth: 390px`). |
| 8 | `app-overview-unscanned__phone__dark.png` | `/app/overview` | Phone | Dark | **DEFECT** | Horizontal overflow on phone viewport (`scrollWidth: 394px > clientWidth: 390px`). |
| 9 | `app-graph-unscanned__phone__light.png` | `/app/graph` | Phone | Light | **DEFECT** | Horizontal overflow on phone viewport (`scrollWidth: 394px > clientWidth: 390px`). |
| 10 | `app-graph-unscanned__phone__dark.png` | `/app/graph` | Phone | Dark | **DEFECT** | Horizontal overflow on phone viewport (`scrollWidth: 394px > clientWidth: 390px`). |
| 11 | `landing__desktop__light.png` | `/` | Desktop | Light | **DEFECT** | Stats counter zero values ("0 Graph Levels", "0 Automated Checks") in static render. |
| 12 | `landing__desktop__dark.png` | `/` | Desktop | Dark | **DEFECT** | Stats counter zero values ("0 Graph Levels", "0 Automated Checks") in static render. |
| 13 | `landing__phone__light.png` | `/` | Phone | Light | **DEFECT** | Stats counter zero values ("0 Graph Levels", "0 Automated Checks") in static render. |
| 14 | `landing__phone__dark.png` | `/` | Phone | Dark | **DEFECT** | Stats counter zero values ("0 Graph Levels", "0 Automated Checks") in static render. |
| 15 | `app-overview__desktop__light.png` | `/app/overview` | Desktop | Light | **OK** | Clean dashboard: KPI tiles, affected modules strip, severity bars, verification coverage. |
| 16 | `app-overview__desktop__dark.png` | `/app/overview` | Desktop | Dark | **OK** | Clean dashboard in dark mode, crisp contrast. |
| 17 | `app-overview__phone__light.png` | `/app/overview` | Phone | Light | **OK** | Vertically stacked mobile layout, responsive pill navigation. |
| 18 | `app-overview__phone__dark.png` | `/app/overview` | Phone | Dark | **OK** | Vertically stacked mobile layout in dark mode. |
| 19 | `app-overview-unscanned__desktop__light.png` | `/app/overview` | Desktop | Light | **OK** | Clean empty state card with scan prompt and "Run Code Scan" button. |
| 20 | `app-overview-unscanned__desktop__dark.png` | `/app/overview` | Desktop | Dark | **OK** | Clean empty state card in dark mode. |
| 21 | `app-graph-fees-l2__desktop__light.png` | `/app/graph` | Desktop | Light | **OK** | Level 2 graph for Fees module: clean node layout, focused module highlighted, details panel open. |
| 22 | `app-graph-fees-l2__desktop__dark.png` | `/app/graph` | Desktop | Dark | **OK** | Level 2 graph for Fees module in dark mode. |
| 23 | `app-graph-fees-l2__phone__light.png` | `/app/graph` | Phone | Light | **OK** | Responsive Level 2 graph on phone, no node overlaps. |
| 24 | `app-graph-fees-l2__phone__dark.png` | `/app/graph` | Phone | Dark | **OK** | Responsive Level 2 graph on phone in dark mode. |
| 25 | `app-graph-unscanned__desktop__light.png` | `/app/graph` | Desktop | Light | **OK** | Empty graph state showing "Showing 0 of 0 nodes", filters, zoom controls, text list disclosure. |
| 26 | `app-graph-unscanned__desktop__dark.png` | `/app/graph` | Desktop | Dark | **OK** | Empty graph state in dark mode. |
| 27 | `app-investigations-finding__desktop__light.png` | `/app/investigations` | Desktop | Light | **OK** | Clean desktop investigations view: finding list, badges, evidence snippet, L4 mini graph. |
| 28 | `app-investigations-finding__desktop__dark.png` | `/app/investigations` | Desktop | Dark | **OK** | Clean desktop investigations view in dark mode. |
| 29 | `app-fixes__desktop__light.png` | `/app/fixes` | Desktop | Light | **OK** | Fixes screen with proposed and approved fixes, diff viewer, action buttons. |
| 30 | `app-fixes__desktop__dark.png` | `/app/fixes` | Desktop | Dark | **OK** | Fixes screen in dark mode with high-contrast diff syntax colors. |
| 31 | `app-fixes__phone__light.png` | `/app/fixes` | Phone | Light | **OK** | Fixes screen on phone, vertically stacked, scrollable diff preview. |
| 32 | `app-fixes__phone__dark.png` | `/app/fixes` | Phone | Dark | **OK** | Fixes screen on phone in dark mode. |
| 33 | `app-tests__desktop__light.png` | `/app/tests` | Desktop | Light | **OK** | Tests screen with `not_run` status badges and explanation note per spec. |
| 34 | `app-tests__desktop__dark.png` | `/app/tests` | Desktop | Dark | **OK** | Tests screen in dark mode. |
| 35 | `app-tests__phone__light.png` | `/app/tests` | Phone | Light | **OK** | Responsive tests list on phone. |
| 36 | `app-tests__phone__dark.png` | `/app/tests` | Phone | Dark | **OK** | Responsive tests list on phone in dark mode. |
| 37 | `app-reports__desktop__light.png` | `/app/reports` | Desktop | Light | **OK** | Reports screen with markdown preview, summary stats, export actions. |
| 38 | `app-reports__desktop__dark.png` | `/app/reports` | Desktop | Dark | **OK** | Reports screen in dark mode. |
| 39 | `app-reports__phone__light.png` | `/app/reports` | Phone | Light | **OK** | Responsive reports preview and action buttons on phone. |
| 40 | `app-reports__phone__dark.png` | `/app/reports` | Phone | Dark | **OK** | Responsive reports preview on phone in dark mode. |
| 41 | `app-projects__desktop__light.png` | `/app/projects` | Desktop | Light | **OK** | Projects screen with cards for `demo-erp-unscanned`, `demo-erp-sample`, `marker`. |
| 42 | `app-projects__desktop__dark.png` | `/app/projects` | Desktop | Dark | **OK** | Projects screen in dark mode. |
| 43 | `app-projects__phone__light.png` | `/app/projects` | Phone | Light | **OK** | Projects screen on phone, stacked cards, responsive search and upload button. |
| 44 | `app-projects__phone__dark.png` | `/app/projects` | Phone | Dark | **OK** | Projects screen on phone in dark mode. |
| 45 | `dev-design-system__desktop__light.png` | `/dev/design-system` | Desktop | Light | **OK** | Complete design system showcase: brand tokens, buttons, badges, KPI tiles, switcher. |
| 46 | `dev-design-system__desktop__dark.png` | `/dev/design-system` | Desktop | Dark | **OK** | Design system showcase in dark mode. |
| 47 | `dev-design-system__phone__light.png` | `/dev/design-system` | Phone | Light | **OK** | Design system showcase on phone, responsive layout. |
| 48 | `dev-design-system__phone__dark.png` | `/dev/design-system` | Phone | Dark | **OK** | Design system showcase on phone in dark mode. |

---

## 4. Recommendations for Follow-Up Step (Do Not Fix in Step 13a)

1. **Architecture Graph Auto-Layout**: Increase elkjs node separation padding and horizontal layer spacing in `frontend/src/features/graph/elkLayout.ts` or Level 1 graph positioning to prevent project root node and feature module nodes from overlapping horizontally.
2. **Mobile Layout Container Padding**: Investigate the +4px overflow (`scrollWidth: 394px` on 390px viewport) on unscanned routes (`/app/overview` and `/app/graph`), likely caused by a negative margin or unconstrained minimum width in a child card.
3. **Investigation Detail Card Height/Scroll**: Add `overflow-y-auto` or flex-shrink handling to the FindingDetail card on mobile viewports so that the "Likely cause" card is not clipped at the bottom.
4. **Landing Page Counter SSR/Static Fallback**: Ensure the StatsBand counters display their initial full values when static rendering without animation, or trigger the count-up on mount without requiring scroll intersection.
