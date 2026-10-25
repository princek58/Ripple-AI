# Ripple AI — Master Spec (single source of truth)

Read this file before every task. Do only the step you are asked to do.

## 1. Product
Ripple AI is a web-only project-analysis and debugging assistant. User uploads a ZIP; Ripple AI builds an evidence-based dependency graph by STATIC ANALYSIS, runs checks, creates findings, explains them, and proposes fixes as diffs.

Non-negotiable principles:
1. Evidence-first: facts, hypotheses, unknowns are separate.
2. Read-only by default. Never modify the uploaded project. Fixes are previews/diffs; applying needs explicit approval and writes a patch copy, never the original.
3. Uploaded code is NEVER executed (Phase 1 executes nothing at all).
4. Graph is built by static analysis only. AI never creates nodes or edges; AI only explains and suggests.
5. Never expose secrets: report variable NAMES and file paths, never values.
6. No false guarantees: "verified" only with real evidence. No single health score; show verification coverage as counts.
7. Severity, confidence and verification are three SEPARATE fields everywhere.
8. Sample data must carry a visible "Sample data" tag.

## 2. Stack (fixed)
- Monorepo: frontend/, backend/, shared/ (shared TypeScript types), docs/.
- Frontend: React + TypeScript + Vite, Tailwind, React Router, React Flow (graph) with elkjs for auto-layout, Framer Motion (or CSS) for animation, Lucide icons, vitest + @testing-library/react + jsdom for tests.
- Backend: Node.js + TypeScript + Express, zod validation, better-sqlite3, multer (upload), yauzl (safe ZIP read), ts-morph (JS/TS parsing), vitest + supertest for tests.
- DB: SQLite file in backend/data/. Uploaded ZIPs and extracted files in backend/storage/ (git-ignored).
- Phase 1 languages: JavaScript, TypeScript, JSON, env files, package.json. Python later.

## 3. Folder layout
RippleAI/
  frontend/src/{app,components,features,pages,styles,lib}
  backend/src/{server.ts,routes,services,db,analysis,checks,utils}
  backend/src/analysis/{zip, scanner, parser, graphBuilder}
  backend/src/checks/{circularDeps, brokenImports, isolatedFiles, envVars, apiMismatch, secrets}
  shared/types.ts
  docs/RIPPLE_AI_MASTER_SPEC.md

## 4. Data model (SQLite)
- projects(id, name, created_at, size_bytes, file_count, languages, last_scan_at)
- scans(id, project_id, started_at, finished_at, status, files_total, files_skipped, notes)
- project_files(id, project_id, scan_id, path, size, language, sensitive)
- nodes(id, project_id, scan_id, type, level, parent_id, label, path, line_start, line_end, language, meta_json)
  - type: project | module | frontend | backend | api | database | config | test
  - level: 1 (project/module), 2 (module internals), 3 (file/function/route)
- edges(id, project_id, scan_id, source_id, target_id, relation, status, confidence, evidence_json)
  - relation: imports | calls | serves | reads | writes | configures | tests
  - status: resolved | possible | unresolved (dynamic imports / runtime-built URLs = unresolved, shown in graph, never hidden)
  - evidence_json: file, line range, code snippet reference
- findings(id, project_id, scan_id, rule_id, title, summary, severity, confidence, verification, evidence_json, node_ids_json, likely_cause, not_confirmed, created_at)
  - severity: critical | high | medium | low | unknown
  - confidence: confirmed | likely | hypothesis
  - verification: not_tested | reproduced | fix_proposed | fix_verified
- fixes(id, finding_id, diff_text, files_json, status, approved_at) status: proposed | approved | rejected
- test_runs(id, project_id, scan_id, name, status, created_at) status: pass | fail | skipped | not_run (Phase 1: everything not_run)
- reports(id, project_id, created_at, markdown)

## 5. Backend API (Phase 1)
- GET /api/health
- POST /api/projects (multipart ZIP) · GET /api/projects · GET /api/projects/:id · DELETE /api/projects/:id · GET /api/projects/:id/files?page=1&pageSize=50&q= -> { items: [{ id, path, size, language, sensitive }], page, pageSize, total }
- POST /api/projects/:id/scan -> { data: Scan, error } · GET /api/projects/:id/scans -> { data: Scan[], error } (newest first)
- GET /api/projects/:id/graph?level=1|2|3&focus=<nodeId>&depth=<1-3>&maxNodes=<n> -> { data: { nodes, edges, clusters, shown, total, level, focus }, error } (for level 2, the focused module node itself is included in nodes with focused: true, counts in shown/total, and is never clustered)
- GET /api/projects/:id/graph/search?q=&type=&severity=&verification=&limit=&offset= -> { data: { items, total }, error }
- GET /api/projects/:id/graph/nodes/:nodeId -> { data: { node, parentModule, incomingEdges, outgoingEdges, lineRange, relatedFindings }, error }
- GET /api/projects/:id/summary -> { data: { lastScan: { finished_at, status }, counts: { nodes, edges, unresolvedEdges, files }, kpi: { openFindings, criticalPlusHigh, fixesPendingApproval, verifiedFixes }, bySeverity, byConfidence, byVerification, affectedModules: [{ moduleId, label, findingCount, maxSeverity }] }, error }
- GET /api/projects/:id/findings?severity=&confidence=&verification=&rule_id=&q=&page=&pageSize= -> { data: { items, page, pageSize, total }, error } · GET /api/findings/:id -> { data: { ...finding, nodes: [{ id, label, type, path }] }, error }
- GET/POST /api/findings/:id/fixes · GET /api/projects/:id/fixes?status=&page=&pageSize= · POST /api/fixes/:id/approve · POST /api/fixes/:id/reject
- GET /api/projects/:id/tests -> { data: { items: [{ id, name, status }], counts: { pass, fail, skipped, not_run }, note }, error }
- POST /api/projects/:id/reports -> { data: Report, error } (fails with 409 SCAN_REQUIRED if project has no analysis scan; scanned project with 0 findings still produces a report) · GET /api/projects/:id/reports?page=1&pageSize=25 -> { data: { items: [{ id, project_id, created_at }], total, page, pageSize }, error } (newest first, without markdown, zod validated, bad values return 400) · GET /api/reports/:id?format=md -> JSON or raw Markdown
- GET /api/projects/:id/impact?node=<nodeId>&depth=<n>&maxNodes=<n> -> { data: ImpactResult, error } (zod validated; depth 1-10 default 10, maxNodes default 300 hard max 500; unknown project or node gives 404; foreign project node gives 404; module node gives 400 IMPACT_NODE_UNSUPPORTED; never-scanned project gives 409 SCAN_REQUIRED; returns start, affected, counts, by_module, tests_to_review, truncated, unresolved_nearby, notes)
Every response uses { data, error } shape. Validate all input with zod.

## 6. ZIP safety (implement in the upload step)
Max ZIP 50 MB, max 5,000 files, max total uncompressed 200 MB, max single file 5 MB, compression-ratio limit (zip-bomb), reject zip-slip paths (.., absolute paths, symlinks), skip node_modules, .git, dist, build, .next, __pycache__, venv. Extract with streams, never execute anything, never require/import uploaded files.

## 7. Parser and graph builder
- Walk extracted files; for JS/TS use ts-morph to read imports/exports, Express routes (app.get/post/..., router.*), fetch/axios calls with string URLs, process.env.X names.
- Level 1: one project node plus module nodes (derived from top-level feature folders / route groups, e.g. Notices, Marks, Fees, Login).
- Level 2: for a module, its frontend files, API routes, backend services, database models/queries, config.
- Level 3: files, functions, imports, routes, callers.
- Every edge stores relation, status, confidence and evidence. Unresolvable references become unresolved edges.
- Graph API never returns the whole project at once: lazy expansion, shown/total counts, clustering for large groups.

### Edge direction and change impact dependencies
For an edge `(source, target)`, the default rule is that `source` depends on `target` (e.g., consumer depends on provider), EXCEPT for `serves` and `configures` where `target` depends on `source`. When node X changes, its dependents are:

| Relation | Edge Source | Edge Target | Who Depends on Whom | Traversal Rule (If X changes, next dependent is) |
| :--- | :--- | :--- | :--- | :--- |
| `imports` | Importing file | Imported file | Source depends on Target | If `target === X`, then `source` is affected |
| `tests` | Test file | Tested file | Source depends on Target | If `target === X`, then `source` is affected |
| `calls` | Caller file | API endpoint | Source depends on Target | If `target === X`, then `source` is affected |
| `serves` | Route file | API endpoint | **Target depends on Source** | If `source === X`, then `target` is affected |
| `reads` | Code file | Config node | Source depends on Target | If `target === X`, then `source` is affected |
| `writes` | Code file | Database / model | Source depends on Target | If `target === X`, then `source` is affected |
| `configures` | Config file | Configured module/service | **Target depends on Source** | If `source === X`, then `target` is affected |

## 8. Phase 1 checks and fixes (each creates findings with evidence)
- circular_dependency: strongly connected components over resolved import edges. Severity low, confidence confirmed. not_confirmed: runtime failure.
- broken_import: relative imports pointing to nonexistent files. Severity high, confidence confirmed. not_confirmed: whether code runs in production.
- isolated_file: files with 0 incoming import/call/test edges (excluding entry files, configs, tests). Severity low, confidence hypothesis. not_confirmed: dynamic or framework loading.
- env_undeclared: process.env names missing from .env.example. Severity medium, confidence likely (or hypothesis if no .env file). not_confirmed: deployment config. Names only.
- api_unmatched_call: frontend fetch/axios URL with no matching route; includes closest route in likely_cause. Severity medium, confidence likely. not_confirmed: proxy or dynamic routes. (Note: response-shape comparison is NOT done in this step).
- secret_pattern: private key headers, AWS access keys, or credential assignments. Severity high, confidence likely (or low + hypothesis if placeholder). Never critical or confirmed in Phase 1. Evidence = file, line, pattern name only. Never store or print secret values.
New findings start with verification = not_tested; never confirmed unless the evidence itself proves it.

Fix generation rules:
- Deterministic templates only for env_undeclared (appends NAME= to .env.example), api_unmatched_call (changes URL to closest route with <=2 context lines), and broken_import (changes specifier only if exactly 1 matching file exists).
- All other rules, secret patterns, and ambiguous cases return 422 NO_AUTOMATIC_FIX with a generic manual-fix hint.
- Uploaded original files under backend/storage/<id>/files/ are immutable and NEVER modified. Approving a fix writes a standalone .patch file under backend/storage/<id>/patches/<fixId>.patch. Approval sets status approved; finding verification remains fix_proposed (approval is not verification). Rejecting reverts verification to not_tested if no other active fix exists. Approving or rejecting twice returns 409.
- env_undeclared fixes are generated against the sanitized .env.example (comments removed at upload), so the patch may need manual merging.

## 9. Graph UI rules (Rule 31)
Four levels L1 Project, L2 Module, L3 Code, L4 Evidence/Investigation. Breadcrumb: Project > Module > Node > Function. Always show "Showing X of Y nodes". Filters: module, filename, type, severity, verification. Node details panel on the right.
- Node TYPE = fill colour + shape. Severity = badge with text label. Confidence and verification = small icons, details on hover/panel. Colour never carries meaning alone.
- Edges: solid = code-supported, dashed = possible/unverified, dotted + "?" = unresolved, red/orange highlighted = investigation path, grey = ordinary.
- Hover highlights connected nodes and dims others. Animation only when it has meaning; off with reduced motion; reduced for large graphs.

## 10. Design tokens (frontend/src/styles/tokens.css + Tailwind theme)
UI colours (brand, never used for graph types or severity):
- cream #F6F6F1, forest #0B3B2C, lime #E3F57A, slate-green #2B3F3A, near-black green #0F1B18
- Dark theme: bg #0F1B18, surface #16261F, text soft white, same lime accent.
Graph node types (distinct from brand green): project/module blue #2563EB, frontend indigo-teal #0E7490 (rounded rectangle), backend purple #7C3AED, api cyan #06B6D4 (hexagon), database slate #64748B (cylinder), config amber #D97706 (diamond), test grey outline (dashed rectangle).
Severity: critical #DC2626, high #EA580C, medium #CA8A04, low #64748B (label + icon), unknown #9CA3AF.
Fonts: Space Grotesk (headings), Inter (body), JetBrains Mono (code, paths, line numbers).
"Fix verified" always uses check icon + text, never green alone.

## 11. Landing (hero) page — component map
Light-first. Reference mood only (cream, forest green, lime, grid lines); no copied text/images.
- Navbar: logo, Features, How it works, Safety, Docs, Log in, Start analysis; blur + shrink on scroll.
- Hero (Hero, HeroGraph, NodeChip): badge "Evidence-first debugging"; headline "Understand why it breaks, with evidence" (lime underline draws on one word); buttons Upload a project / See how it works; background grid; floating node chips (Notice Page, Notice API, Storage) with cursor arrows; one node pulses red and a ripple spreads to neighbours.
- TechStrip: real logos only: React, Node.js, Express, TypeScript, Python, MongoDB, MySQL, GitHub.
- BentoGrid, 4 cards: Layered graph (L1-L4 mini mockup) · Evidence & confidence report · Fix preview with diff + approval · Safe by default (read-only, no code executed). Each mockup tagged "Sample data".
- StickyGraphZoom: sticky section, scroll zooms graph L1 -> L2 -> L3 -> L4.
- HowItWorks (dark slate-green): Upload, Understand, Investigate, Fix and verify + tiles: frontend, APIs, database, config, tests, CI/CD.
- SafetyStatement: big text "Suspected is not confirmed." + statuses hypothesis, likely, confirmed, verified.
- StatsBand: 4 graph levels · 6 automated checks (circular dependency, broken import, isolated file, undeclared env variable, unmatched API call, secret pattern) · 0 lines of uploaded code executed · Read-only by default (count-up once). Only claim what Phase 1 does; update the numbers when capabilities are added.
- CtaBand, Footer: no fake testimonials, users or logos.
Animations: fade-up on scroll, underline draw, grid parallax, count-up once; all disabled under prefers-reduced-motion.

## 12. Dashboard — component map
Shell: TopPillNav with 7 items (Overview, Projects, Graph, Investigations, Fixes, Tests, Reports) + ProjectSwitcher, search, notifications, avatar/initials, theme toggle. On small screens: menu button / scrollable strip.
- Overview: LastScanLabel; big ProjectGraphCard (L1, problem module highlighted); 4 KpiTile (Open findings, Critical + High, Fixes pending approval, Verified fixes; labels always shown); AffectedModulesStrip (severity badge + status); 3 bottom cards: FindingsBySeverityBar (horizontal bars with counts), VerificationCoverage (two separate stacked bars for verification and confidence, because verification status and confidence are independent dimensions), ExplanationCard (template-based in Phase 1, simple Hindi/English). Empty state: "Upload your first project".
- Projects: Upload button + search; ProjectCard (name, date, size, languages, last scan, severity badges, Open / Re-scan / menu with confirm-delete); UploadFlow (drop ZIP, progress "Reading files, mapping dependencies...", note "Code is not executed", review then import).
- Graph: full-screen GraphCanvas, GraphSearchFilters, Breadcrumb, ShownCounter, right NodeDetailsPanel, legend (type shapes, severity labels, edge styles).
- Investigations: left FindingList + filters; right FindingDetail (title/summary, three separate badges: severity / confidence / verification, evidence block in monospace, mini L4 graph, likely cause, "What is not confirmed", Suggested fix button, beginner-explanation toggle); top TimelineStrip with note "timing is a hint, not proof".
- Fixes: FixList (pending approval), DiffViewer (before/after, affected files), Approve / Reject; approval never edits the original project.
- Tests: TestList with pass / fail / skipped / not_run (Phase 1 shows not_run with explanation).
- Reports: Generate + export (Markdown, PDF); preview; sections: summary, findings table, evidence, fixes + verification status, "What was not checked"; two charts only (severity bar, verification stacked bar).
Charts: bar and stacked bar only, no pie. Animate once.

## 13. Build order (one step per prompt)
1 Setup: repo, folders, rules, tokens, hello world
2 Backend skeleton: server, SQLite, schema, health, tests
3 Safe ZIP upload + file listing
4 Parser: imports, routes, env names -> nodes/edges
5 Graph API (levels, search, details, shown/total)
6 Findings model + first checks + summary endpoint
7 Fixes, tests, reports endpoints
8 Frontend shell + design system + theme
9 Hero page
10 Dashboard Overview + Projects
11 Graph screen
12 Investigations, Fixes, Tests, Reports
Phase 2 later: code execution sandbox, GitHub, CI/CD, timeline, memory.
