# Ripple AI — 5-Minute Non-Developer Demo Walkthrough

This guide is designed for a non-technical presenter or product specialist demonstrating Ripple AI in approximately 5 minutes. Every number, screen element, and behavior in this walkthrough reflects real, measured data from the included `demo-erp` sample project.

---

## What to Open

1. **Launch the Application**:
   - On Windows, double-click `start-dev.bat` in the project root folder.
   - Alternatively, open a terminal in the project directory and run `npm run dev:backend` and `npm run dev:frontend`.
2. **Open the Web Browser**:
   - Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)
   - Ensure the backend service is running locally on port 4000.

---

## 5-Step Demonstration Script

### Step 1: Upload the Project (`demo-erp-sample.zip` or Public GitHub URL)
- **Exact Action (ZIP Upload)**:
  - In the top navigation bar, click **Projects**.
  - Click the **Upload project** button.
  - In the file dialog, choose `samples/demo-erp-sample.zip` from the repository root.
  - Wait 2–3 seconds while Ripple AI extracts the ZIP archive (with ZIP-slip protection and secret redaction) and automatically initiates deterministic static AST parsing.
- **Alternative Action (GitHub URL Import)**:
  - In the Upload dialog, switch to the **From GitHub URL** tab.
  - Enter a public GitHub repository URL (e.g. `https://github.com/octocat/Hello-World`).
  - Click **Import and scan**.
  - Ripple AI downloads a ZIP copy from GitHub directly to local storage, runs safe ZIP extraction, and scans it statically without executing code.
  - *Note*: Public repositories only. Needs internet connection. Subject to 50 MB archive and 5,000 files limits. GitHub may refuse or throttle requests. No private repositories are supported; no tokens or credentials are stored. Offline fallback: if you have no internet, download the ZIP from GitHub in your browser and use the Upload ZIP tab.
- **What to Say**:
  > *"Ripple AI ingests project source code locally—either from a local ZIP or by importing any public GitHub repository URL—safely unpacks files without running any code, and builds an evidence-based architectural graph using static analysis."*

### Step 2: Overview Dashboard & System KPIs
- **Exact Action**:
  - Click **Overview** in the top navigation bar.
  - Point to the four KPI tiles at the top: **9 Open findings**, **1 Critical + High**, **0 Fixes pending approval**, and **0 Verified fixes**.
  - Point to the Level 1 Architecture Graph showing project modules (`fees`, `notices`, `shared`, `login`, `marks`), highlighting the `fees` module card tagged as **MOST AFFECTED**.
  - Point to the severity breakdown bar chart below: 0 Critical, 1 High, 2 Medium, 6 Low, 0 Unknown.
- **What to Say**:
  > *"At a glance, the dashboard surfaces 9 findings across 30 graph nodes and 25 dependency edges, instantly highlighting the fees module as the most affected area of the system."*

### Step 3: Interactive Architecture Graph (Fees Module)
- **Exact Action**:
  - Click **Graph** in the top navigation bar.
  - In the Level 1 graph view, click on the **fees** module node (or use the breadcrumb navigation).
  - Observe the transition to the Level 2 module internal view.
  - Point to the `fees.js` backend route node and the connected dotted-line target labeled `Unresolved: feeService` with a `?` symbol (one of 3 unresolved edges in the project).
- **What to Say**:
  > *"Drilling into the fees module reveals internal relationships between API routes, backend services, and unresolvable dependencies that would otherwise fail silently at runtime."*

### Step 4: Change Impact ("Ripple View")
- **Exact Action**:
  - Open the Graph, click noticeService.js, press Show impact, press Play.
- **What to Say**:
  > *"Ripple view traces deterministic static dependency paths round-by-round to show which files, API endpoints, config items, and tests may be affected if noticeService.js changes."*
- **Important**:
  - Do not claim: that the impact list is complete or guaranteed.

### Step 5: Investigations & Level 4 Evidence Path
- **Exact Action**:
  - Click **Investigations** in the top navigation bar.
  - Select the high-severity finding: **Broken import "../services/feeService" in fees.js**.
  - Point out the three separate badges: **High** severity, **Confirmed** confidence, and **Not tested** verification.
  - Click on the **Evidence path** expandable card.
  - Watch the Level 4 interactive mini graph open, displaying the investigation path in high-contrast orange, toolbar controls ("Open in Graph"), and readable text alternatives.
  - Scroll down to show the **Likely cause** (*"The target file was moved, deleted, renamed, or the relative import path was misspelled"*) and the **Remediation guidance** card with language toggles.
- **What to Say**:
  > *"Ripple AI isolates the exact evidence line in fees.js and maps the complete investigation path in a dedicated mini graph, keeping severity, confidence, and testing verification strictly separate."*

### Step 6: Suggested Fixes & Report Transparency
- **Exact Action**:
  - Click **Fixes** in the top navigation bar.
  - Select the proposed change for `JWT_SECRET` in `.env.example`.
  - Show the before/after unified diff preview with line additions (`+ JWT_SECRET=`).
  - Emphasize to the audience that suggested fixes are **never applied automatically** to the source code; approving a fix only creates a `.patch` file in storage for the developer to inspect.
  - Click **Reports** in the top navigation bar and select the generated report (`6a60eb5a`).
  - Scroll down through the markdown summary to the section titled **"What was not checked"**.
- **What to Say**:
  > *"Ripple AI proposes safe, deterministic diffs that are never applied automatically, and every generated audit report includes a mandatory 'What was not checked' section for absolute honesty."*

### Step 7: Ripple AI Chat (Circle Button, Offline Help & Per-Project AI)
- **Exact Action**:
  - Open the circle, ask 'circular dependency kya hai', then turn on AI only for the demo project.
  - Notice the instant welcome card with clickable architectural questions.
  - Observe the instant offline glossary explanation with the clear "Offline help" badge.
  - Open the in-panel Chat settings (gear icon) and review the consent text before enabling external AI.
- **What to Say**:
  > *"The Ripple AI chat is accessible on every screen. Offline architectural help works immediately without any external services or API keys. External AI is strictly opt-in per project, requiring explicit user consent."*
- **Important**:
  - Do not claim: the chat is always AI-powered or always correct.

---

## What NOT to Claim ("Do Not Claim")

To maintain complete credibility, never make any of the following claims during a demo:

1. **No Code Execution**:
   - Uploaded source code is **never executed, imported, or run**. Ripple AI performs deterministic AST parsing only.
2. **No Empirical Verification in Phase 1**:
   - Nothing is verified at runtime in Phase 1. Test files are catalogued but never run; all verification statuses start as `not_tested`.
3. **No Generative AI or Stochastic LLMs**:
   - Phase 1 does not use large language models or external AI APIs. Explanations and remediation steps are deterministic, template-based rules.
4. **JavaScript and TypeScript Only**:
   - AST parsing is implemented for JS and TS files. Other file formats (Python, SQL, HTML) appear only as generic nodes without deep syntactic inspection.
5. **No Authentication or Multi-Tenancy**:
   - Ripple AI is built strictly for single-user local use on `localhost`. There is no login, user database, or cloud sync.
6. **Tested on Sample Scenarios**:
   - The platform has been tested on small-to-medium demo repositories (`demo-erp`, 17 files, 30 nodes); do not claim real-time enterprise repository indexing.
7. **Change Impact is Not Guaranteed**:
   - Do not claim: that the impact list is complete or guaranteed. Impact is a static estimate from code connections, and unresolved dynamic references or runtime reflection can hide more.
8. **Public Repositories Only**:
   - Do not claim: private repositories are supported. Ripple AI only imports public repositories by URL without authentication tokens or stored credentials.
9. **Chat Accuracy and AI Claims**:
   - Do not claim: the chat is always AI-powered or always correct. Offline help answers are rule-based glossary explanations, and external AI responses are unverified by Ripple and may contain errors.

---

## Questions You May Get (Honest Answers)

### Q: "Where is the AI?"
> **Answer**: *"Phase 1 focuses on building a solid, reliable foundation using deterministic static AST analysis, multi-level dependency graphs, and rule-based checks with template-based guidance. Machine learning and generative AI explanations are planned for Phase 2, where they will build upon this verified evidence graph rather than hallucinating answers from scratch."*

### Q: "Is it safe to upload my proprietary code?"
> **Answer**: *"Yes. Ripple AI runs entirely on your local computer. Files are stored on your local drive, no data is sent to external servers or cloud services, uploaded code is never executed, and secret values in `.env` files are automatically redacted upon upload."*

### Q: "Can Ripple AI automatically fix my code bugs?"
> **Answer**: *"No. Ripple AI generates suggested diffs for simple, deterministic issues like undeclared environment keys or unambiguous missing file paths. However, suggested fixes are never applied automatically to your source files. Approving a fix only writes a `.patch` file that developers can review and apply at their own discretion."*

### Q: "Why does the Tests screen show 0 tests passed?"
> **Answer**: *"Phase 1 does not run your test suite, because executing untrusted code poses security risks. It inventories test files found in the project and marks them 'Not run' so users never get a false sense of security."*

### Q: "Why do some findings say 'hypothesis' while others say 'confirmed'?"
> **Answer**: *"Ripple AI treats confidence and severity as separate dimensions. A broken relative import is 'confirmed' because the static file system proves the target is missing. An isolated file is marked 'hypothesis' because it might be dynamically imported or invoked by an external framework that static analysis cannot see."*

---

## Measured Sample Reference Numbers (`demo-erp-sample`)

For presenter reference, here are the exact measurements from `demo-erp-sample`:

| Metric | Measured Value | Notes |
| :--- | :---: | :--- |
| **Files Analyzed** | 17 | Unpacked JavaScript and TypeScript files |
| **Graph Nodes** | 30 | Project, modules, frontend/backend files, APIs |
| **Graph Edges** | 25 | Import and call relationships |
| **Unresolved Edges** | 3 | Dotted lines with `?` (e.g. missing `feeService`) |
| **Total Findings** | 9 | Across 4 active rules |
| **Critical Findings** | 0 | None present in sample |
| **High Findings** | 1 | `broken_import` (`fees.js` -> `./feeService`) |
| **Medium Findings** | 2 | `env_undeclared` (`JWT_SECRET`), `api_unmatched_call` (`GET /api/notice/list`) |
| **Low Findings** | 6 | 1 `circular_dependency` (`format.js` <-> `helpers.js`), 5 `isolated_file` |
| **Verification Coverage** | 0 Verified | All 9 findings start as `not_tested` |
