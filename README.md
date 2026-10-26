# Ripple AI

Ripple AI is a web-only project-analysis and debugging assistant. User uploads a ZIP; Ripple AI builds an evidence-based dependency graph by STATIC ANALYSIS, runs checks, creates findings, explains them, and proposes fixes as diffs.

## What Phase 1 does

- **ZIP upload**: Accepts project source code uploaded as a ZIP archive, unpacks files with ZIP slip protection, and computes language distributions.
- **Static analysis only**: All analysis is performed using deterministic AST parsers (ts-morph and Babel parser for JavaScript and TypeScript) without running or executing any user code.
- **Multi-level dependency graph and evidence path**:
  - **Level 1 (project)**: High-level subsystem and module architecture overview with coarse clustering.
  - **Level 2 (module)**: Module-level internal relationships (services, controllers, configuration).
  - **Level 3 (code)**: File and symbol neighborhood dependency view around a focus node with configurable depth (1 to 3 hops).
  - **Level 4 (evidence path)**: Exists in the finding detail as an interactive, read-only mini graph highlighting the matched investigation path and unresolved stubs with a text alternative.
- **Scan history strip**: The Investigations screen features a scan history strip displaying the latest 5 scans with timestamps, status, and backend notes.
- **Six automated checks**:
  1. `circular_dependency`: Detects circular import dependencies between files or modules.
  2. `broken_import`: Detects static import and require statements pointing to non-existent local files or missing modules.
  3. `isolated_file`: Identifies files that neither import nor are imported by any other project file.
  4. `env_undeclared`: Flags references to `process.env.*` variables in source files that are absent from `.env.example`.
  5. `api_unmatched_call`: Identifies client-side API calls (e.g. `fetch('/api/...')` or `axios`) that do not match any registered server route.
  6. `secret_pattern`: Scans files for hardcoded secrets, private keys, and credential tokens using regex pattern matching.
- **Change Impact analysis ("Ripple view")**:
  - In the Graph screen (via the "Show impact" button in node details) and Investigations screen (via "Show impact" links on affected nodes), computes deterministic static dependency paths to show which files, API endpoints, config items, and tests may be affected if an item changes.
  - Groups affected nodes by distance into rounds (Round 1 = direct dependents, Round 2 = transitive dependents) and displays them on concentric rings ("Ripple view") around the start node with progressive playback controls, count tiles, and a grouped text alternative.
- **Findings with three separate fields**: Every finding maintains three distinct classifications:
  - **Severity**: Potential impact of the issue on the system (`critical`, `high`, `medium`, `low`, `unknown`).
  - **Confidence**: Certainty of the static analysis finding (`confirmed`, `likely`, `hypothesis`).
  - **Verification**: Empirical testing status of the finding; in Phase 1 all findings start as `not_tested` because no code is executed.
- **Automatic fix suggestions**: Fix generation is rule-specific, deterministic, and template-based:
  - `broken_import`: Generates a fix only when exactly one file in the project has the same base name.
  - `api_unmatched_call`: Generates a fix only with a clear single closest route where the closest route differs from the unmatched URL.
  - `env_undeclared`: Generates a fix by appending `<NAME>=` to `.env.example` (or creating `.env.example` if missing), recording variable names only and never values.
  - Other rules (`circular_dependency`, `isolated_file`, etc.) return `NO_AUTOMATIC_FIX` because automated remediation is unsafe or requires architectural restructuring.
  - Secrets (`secret_pattern`) never get an automatic fix; secrets must be revoked and rotated manually.
  - Fix suggestions are never applied automatically to source files; approving a fix only writes a `.patch` file to `backend/storage/patches/`.
- **Markdown analysis reports**: Generates comprehensive audit summaries in Markdown containing project statistics, findings tables, and notes.
- **Template-based plain-language guidance**: Explanations and remediation tips in English and Hinglish are generated from static predefined templates; no AI or external large language models are used.
- **Public GitHub repository import**:
  - Direct URL import for public repositories (`https://github.com/<owner>/<repo>` with optional `.git` suffix, trailing slash, and `/tree/<branch>`).
  - Downloads a ZIP archive copy directly to local storage via GitHub codeload without executing any code.
  - Limits: 50 MB archive limit and 5,000 files limit.
  - Public repositories only: private repositories are NOT supported (no tokens or credentials stored).
  - Requires internet access; GitHub may refuse or throttle (HTTP 429).
  - Offline fallback: if you have no internet or GitHub throttles the connection, download the ZIP archive from GitHub and use the "Upload ZIP" tab.
  - Do not claim: private repositories are supported.

## What Phase 1 does NOT do

- **No code execution**: Uploaded code is never executed, imported, or run in any runtime environment.
- **No tests are run**: Test files are catalogued by the scanner but never executed. Nothing is ever marked "verified" by Phase 1.
- **No test generation**: Phase 1 does not generate test suites or test files.
- **No private GitHub repositories, webhooks, or CI/CD connection**: Only public GitHub repository URLs are supported. No private repositories, repository webhooks, pull-request bots, GitHub Actions, or CI/CD pipeline integrations exist. No personal access tokens or credentials are requested or stored. Do not claim: private repositories are supported.
- **No AI explanations or LLM generation**: All explanations and remediation guidance are deterministic templates.
- **No timeline or project memory**: The platform does not track revision history across git commits or remember past project scans.
- **Language support**: Only JavaScript and TypeScript files are parsed for imports, calls, and AST structure; other files appear as plain file nodes. Python and other languages are not analyzed in Phase 1.

## Ripple AI chat (backend)

The chat backend provides interactive, conversational assistance powered by external AI services (Gemini or OpenAI-compatible models):

- **Off by default and per project**: Every project starts with AI disabled (`ai_enabled: false`). Enabling it requires explicit user consent per project.
- **What is sent**: Only the user question and structured metadata about the active screen and selected entities (rule identifier, severity, relative file path, line numbers). Code lines (up to a 7-line window around the cited line) are sent only when the project's code-sharing switch (`share_code`) is explicitly turned on.
- **What is never sent**: The whole file, environment values (`.env` contents), secret tokens or credential patterns, and project names are never sent to external AI providers.
- **Free-tier privacy warning**: Free tiers of third-party AI services may use submitted text to train models and human reviewers may read it. Never enable AI for sensitive, proprietary, or unowned source code.
- **Requires your own API key in `backend/.env`**: Supported variable names (names only, never commit keys): `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_API_BASE`, or the fallbacks `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_API_BASE`.
- **Offline fallback**: If AI is unconfigured or unreachable, the system falls back to offline template explanations without failure.
- **Not visible in the screens yet**: The chat interface UI is developed in Step K2; the backend endpoints (`/api/projects/:id/ai-settings` and `/api/projects/:id/chat`) are fully tested and functional.

## Quick start for non-developers

For a 5-minute guided presentation script, see the [Demo Walkthrough](docs/DEMO_WALKTHROUGH.md).

1. Double-click `start-dev.bat` in the project root directory. This launches the backend server on port 4000 and the frontend application on port 3000, and opens http://localhost:3000 in your default web browser.
2. Navigate to the **Projects** page.
3. Click **Upload Project** and select `samples/demo-erp-sample.zip`.
4. Once extraction completes, explore the application through the navigation bar:
   - **Overview**: System KPI cards, severity distribution, and module summary.
   - **Graph**: Interactive multi-level dependency graph (Level 1, 2, and 3) with search and filters.
   - **Investigations**: Detailed findings table with evidence lines, confidence, and severity tags.
   - **Fixes**: Suggested code modifications for supported rules with unified diff previews.
   - **Tests**: Inventory of catalogued test files found in the project (all marked "Not run").
   - **Reports**: Markdown audit report generator with browser-based print export.

## Quick start for developers

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher

### Installation

Install all monorepo workspace dependencies:

```bash
npm install
```

### Running Locally

Run both frontend and backend development servers:

```bash
# Start backend server (port 4000)
npm run dev:backend

# Start frontend development server (port 3000)
npm run dev:frontend
```

Alternatively, run both from root using `start-dev.bat` on Windows.

### Running Tests

Execute unit, integration, and UI component test suites:

```bash
# Run all tests across backend and frontend workspaces
npm test

# Run backend tests only
npm run test:backend

# Run frontend tests only
npm run test:frontend
```

### Running Contract Tests

Run extended schema and key-comparison contract verification between backend endpoints and frontend fixtures:

```bash
# Backend contract tests
RIPPLE_CONTRACT=1 npm --workspace=@ripple-ai/backend test

# Frontend contract tests
RIPPLE_CONTRACT=1 npm --workspace=@ripple-ai/frontend test
```

### Building for Production

Compile TypeScript and build frontend bundles:

```bash
# Build both workspaces
npm run build

# Or individually
npm --workspace=@ripple-ai/backend run build
npm --workspace=@ripple-ai/frontend run build
```

### Visual QA

Run full automated browser visual regression and quality verification:

- **Single-click launcher (Windows)**: Double-click `run-qa.bat` in the project root.
- **Command line**: `npm --prefix frontend run qa`
- **What it checks**:
  - Console and uncaught page errors
  - Failed network requests
  - Mobile phone horizontal viewport overflow
  - Dependency graph node overlaps
  - Container clipping warnings
  - Interactive controls without accessible names
  - Images missing alt attributes
  - Forbidden placeholder text (`undefined`, `NaN`, `null`, `[object Object]`)
  - "Sample data" tags on `/app/*` routes
  - Landing page dynamic counter animation and final values
- **Isolation**: Uses the installed Microsoft Edge or Google Chrome, an isolated temporary database fixture, and dedicated ports 3100 (frontend) and 4100 (backend). It never touches production data or dev ports 3000/4000.
- **Contact sheet**: An HTML contact sheet displaying all captured desktop and phone screenshots with automated check results is generated at `frontend/qa-screenshots/index.html`.

## Safety design

Ripple AI enforces 10 core safety principles across all analysis workflows:

1. **Deterministic analysis**: Static AST inspection; identical code produces identical findings. Zero stochastic AI hallucinations.
2. **Never execute user code**: Analyzed projects are parsed as static data strings; no user modules are imported or run into the Node.js runtime.
3. **No file contents in database responses**: The SQLite database stores structural nodes, edges, finding metadata, and file paths; source file contents are never returned in API responses.
4. **Automatic secret stripping**: All `.env` and environment file values are redacted upon ZIP extraction; only key names are retained for undeclared variable checking.
5. **Original source code is immutable**: Source files inside unpacked projects are never edited, patched, or overwritten by the engine.
6. **Patches isolated to dedicated storage**: Approved suggested fixes are written as patch files to `backend/storage/patches/` and are never applied directly into working trees.
7. **Strict local boundary**: All operations run locally on `localhost:3000` and `localhost:4000`. No telemetry, analytics, or outbound internet calls are made.
8. **Explicit verification integrity**: Test statuses are marked `not_run`. The platform never displays false green "passed" indicators or claims code is verified when no test execution took place.
9. **ZIP slip protection**: Extraction validates canonical destination paths to reject archives with relative traversal sequences (`../`).
10. **Resource containment**: Upload sizes, extracted file counts, node expansion limits, and pagination caps prevent resource exhaustion.

## Project layout

```
RippleAI/
├── backend/                  # Node.js + Express backend service
│   ├── src/
│   │   ├── analysis/         # AST parser, zip extractor, graph builder
│   │   ├── checks/           # Six automated rule checks
│   │   ├── db/               # SQLite database, schema migrations, repositories
│   │   ├── routes/           # REST endpoints (/projects, /graph, /findings, /fixes, /tests, /reports)
│   │   ├── services/         # Diff patch generator, report generator
│   │   └── types.ts          # Backend-specific TypeScript interfaces
│   ├── tests/                # Backend test suite (Vitest)
│   └── tsconfig.json
├── frontend/                 # React 19 + TypeScript + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── components/       # Reusable UI primitives (Badges, Buttons, Cards, Dialogs)
│   │   ├── features/         # Screen modules (projects, overview, graph, investigations, fixes, tests, reports)
│   │   ├── lib/              # API client, scanState helper, formatters, theme provider
│   │   ├── styles/           # tokens.css design system variables
│   │   └── test/             # Frontend Vitest test suite and real API fixture captures
│   ├── vite.config.ts
│   └── package.json
├── shared/                   # Shared types and data contracts
│   └── types.ts              # Canonical contract interfaces across client and server
├── docs/                     # Specifications and architectural documentation
│   └── RIPPLE_AI_MASTER_SPEC.md
├── samples/                  # Sample project archives for demonstration
│   └── demo-erp-sample.zip
├── package.json              # Monorepo workspace configuration
├── start-dev.bat             # Single-click launcher for Windows
└── README.md
```

## Known limitations

- **Change Impact is a static estimate**: The change impact analysis is a static estimate from code connections. It is not a guarantee, and no code was run. Unresolved dynamic references can hide additional dependents.
- **Backend dependency advisory (Zod)**: The backend dependency `zod` (3.25.76) has an open npm audit advisory (GHSA-mrhx-c7xc-m3w5, memory use while validating oversized collections); the suggested fix is a major upgrade that has not been applied; the app is for single-user local use.
- **Visual QA review**: Visual QA is automated plus an AI review of screenshots and has not been checked by a human designer.
- **Print layout verification**: Print layout is only checked by the stylesheet test, not by a printed page.
- **Graph page bundle size**: The `elkjs` layout engine is bundled whole, so the Graph page chunk is about 1.6 MB (uncompressed).
- **Routerless fixtures**: In architectures without a centralized router file (such as the included `demo-erp` sample), some standalone utility and helper files may be flagged as `isolated_file`.
- **Local use only**: There is no authentication (local use only); the application is designed for single-user local workstation use.
- **Browser-built patch download**: Patch download is built in the browser using Blob URLs.

## Status

- **Phase 1**: Complete.
- **Phase 2A (Change Impact)**: Complete.
- **Step K1b (Chat Backend)**: Complete.
- **Test suite**: 706 tests passing across 55 test files (227 backend tests, 479 frontend tests, 0 failures, 5 skipped) as of 2026-10-26.

