# Ripple AI

Ripple AI is an evidence-first, local static code analysis platform that maps multi-tier web application architecture and surfaces dependency and configuration issues. It parses JavaScript and TypeScript codebases entirely offline into interactive dependency graphs and deterministic findings without executing code or calling cloud AI APIs.

## What Phase 1 does

- **ZIP upload**: Accepts project source code uploaded as a ZIP archive, unpacks files with ZIP slip protection, and computes language distributions.
- **Static analysis only**: All analysis is performed using deterministic AST parsers (Babel parser for JavaScript and TypeScript) without running or executing any user code.
- **Three-level dependency graph**:
  - **Level 1**: Subsystem and module architecture overview with coarse clustering.
  - **Level 2**: Module-level internal relationships (services, controllers, configuration).
  - **Level 3**: File and symbol neighborhood dependency view around a focus node with configurable depth (1 to 3 hops).
- **Six automated checks**:
  1. `broken_import`: Detects static `import` and `require` statements pointing to non-existent local files or missing modules.
  2. `circular_dependency`: Detects cycles in module and file import graphs using depth-first cycle detection.
  3. `env_undeclared`: Flags references to `process.env.*` variables in source files that are absent from `.env.example`.
  4. `isolated_file`: Identifies files that neither import nor are imported by any other project file.
  5. `api_unmatched_call`: Identifies client-side API calls (e.g. `fetch('/api/...')` or `axios`) that do not match any registered Express server route.
  6. `test_coverage_gap`: Identifies source modules that lack corresponding test files.
- **Findings with three distinct dimensions**: Every finding maintains three separate, uncoupled classifications:
  - **Severity**: `critical`, `high`, `medium`, `low`, `unknown`.
  - **Confidence**: `confirmed` (direct AST evidence), `likely` (strong heuristic), `hypothesis` (tentative correlation).
  - **Verification status**: `not_tested` (default), `reproduced`, `fix_proposed`, `fix_verified`.
- **Template-based fix suggestions**: Fix generation is rule-specific and purely deterministic:
  - Only `env_undeclared` (appends variable placeholder to `.env.example`) and `api_unmatched_call` (scaffolds Express endpoint handler stub) provide fix templates.
  - Fixes are never applied automatically to source files; they are generated as unified diffs (`.patch` files), stored in a separate directory (`backend/storage/patches/`), and must be explicitly approved or rejected by the user.
- **Markdown analysis reports**: Generates comprehensive audit summaries in Markdown containing project statistics, findings tables, and notes.
- **Template-based plain-language guidance**: Explanations and remediation tips are generated from static predefined templates in English and Hinglish; no large language models or external AI services are invoked.

## What Phase 1 does NOT do

- **No code execution**: Uploaded code is never run, invoked, imported, or executed.
- **No tests are run**: Test runner commands are never triggered by the scanner; tests are strictly catalogued and marked `not_run`. Nothing is ever marked "verified" by Phase 1.
- **No GitHub or VCS integration**: There is no live repository sync, webhook, or pull-request bot.
- **No CI/CD pipeline analysis**: GitHub Actions, GitLab CI, or Jenkins pipelines are not parsed.
- **No AI explanations or LLM generation**: All explanations and remediation guidance are deterministic templates.
- **No timeline or project memory**: The platform does not track change history across git revisions or remember past project iterations.
- **JavaScript and TypeScript only**: Only `.js`, `.jsx`, `.ts`, `.tsx`, and `.mjs` files are parsed; Python, Go, Java, Rust, and other languages are not analyzed in Phase 1.

## Quick start for non-developers

1. Double-click `start-dev.bat` in the project root directory. This launches the backend server on port 4000 and the frontend application on port 3000, and opens http://localhost:3000 in your default web browser.
2. Navigate to the **Projects** page.
3. Click **Upload Project** and select `samples/demo-erp-sample.zip`.
4. Once extraction completes, explore the application through the navigation bar:
   - **Overview**: System KPI cards, severity distribution, and module summary.
   - **Graph**: Interactive multi-level dependency graph (Level 1, 2, and 3) with search and filters.
   - **Investigations**: Detailed findings table with evidence lines, confidence, and severity tags.
   - **Fixes**: Suggested code modifications for supported rules with unified diff previews.
   - **Tests**: Inventory of catalogued test files (explicitly marked "not run").
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

## Safety design

Ripple AI enforces 10 core safety principles across all analysis workflows:

1. **Deterministic analysis**: Static AST inspection with Babel; identical code produces identical findings. Zero stochastic AI hallucinations.
2. **Never execute user code**: Analyzed projects are parsed as static data strings; no modules are imported or run into the Node.js runtime.
3. **No file contents in database**: The SQLite database stores structural nodes, edges, finding metadata, and file paths; source file contents are never stored in or returned from database queries.
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
│   │   ├── analyzer/         # AST parser, symbol extractor, automated rules
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

- **Print layout & screen design**: While print CSS media queries (`@media print`) and responsive layouts are implemented, visual design and browser print layout have not been verified with an automated end-to-end browser test.
- **Graph page bundle size**: The `elkjs` layout engine is currently bundled in the vendor chunk, resulting in a large lazy-loaded bundle (`~1.68 MB` uncompressed, `~515 KB` gzip) for the Graph page route.
- **Routerless fixtures**: In architectures without a centralized router file (such as the included `demo-erp` sample), some standalone utility and helper files may be flagged as `isolated_file`.
- **Local single-user scope**: No authentication or multi-tenant authorization is implemented; the application is designed for local workstation analysis.
- **Browser-built patch download**: Patch download links and text exports are constructed using browser Blob URLs.

## Status

- **Phase 1**: Complete. Static analysis, three-level graph visualization, six automated rule engines, deterministic fix scaffolding, markdown reporting, and contract-validated REST APIs.
- **Phase 2**: Not built.
- **Verified test coverage**: 401 tests passing across 36 test files (85 backend tests, 316 frontend tests, 0 failures).
