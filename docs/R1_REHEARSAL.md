# Ripple AI — Step R1 Rehearsal Report

Rehearsal performed on 2026-10-25 using isolated QA setup (backend port 4100, frontend port 3100).

## Part 1: Automated Pipeline & Metrics per Project

### Project: `EduZone-master`

- **Archive**: `EduZone-master.zip`
- **Upload**: HTTP 201 in 2632 ms 
- **Scan**: HTTP 200 in 2768 ms 
- **File Count**: 221
- **Files Skipped Notes**: Analyzed 221 files: 289 nodes, 447 edges (6 unresolved). Findings: 5 high, 3 medium, 10 low.
- **Languages**: CSS, EJS, Environment, HTML, JPEG, JPG, JSON, JavaScript, JavaScript (JSX), Markdown, PNG, Unknown, WEBP, XML
- **Graph Architecture**:
  - Total Nodes: 289
  - Total Edges: 447
  - Unresolved Edges: 6
  - Level 1 Modules Count: 3
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 29 ms
- **Findings Summary (Total: 18)**:
  - **By Rule**:
    - `broken_import`: 5
    - `env_undeclared`: 3
    - `isolated_file`: 10
  - **By Severity**:
    - `high`: 5
    - `medium`: 3
    - `low`: 10
  - **By Confidence**:
    - `confirmed`: 5
    - `likely`: 3
    - `hypothesis`: 10

---

### Project: `School-Management-System_Rad_Project-master`

- **Archive**: `School-Management-System_Rad_Project-master.zip`
- **Upload**: HTTP 201 in 547 ms 
- **Scan**: HTTP 200 in 682 ms 
- **File Count**: 100
- **Files Skipped Notes**: Analyzed 100 files: 133 nodes, 216 edges (5 unresolved). Findings: 1 high, 1 medium, 7 low.
- **Languages**: CSS, HTML, ICO, JPG, JSON, JavaScript, JavaScript (JSX), Markdown, TXT, Unknown
- **Graph Architecture**:
  - Total Nodes: 133
  - Total Edges: 216
  - Unresolved Edges: 5
  - Level 1 Modules Count: 2
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 14 ms
- **Findings Summary (Total: 9)**:
  - **By Rule**:
    - `broken_import`: 1
    - `env_undeclared`: 1
    - `isolated_file`: 6
    - `circular_dependency`: 1
  - **By Severity**:
    - `high`: 1
    - `medium`: 1
    - `low`: 7
  - **By Confidence**:
    - `confirmed`: 2
    - `hypothesis`: 7

---

### Project: `conduit-realworld-example-app-main`

- **Archive**: `conduit-realworld-example-app-main.zip`
- **Upload**: HTTP 201 in 957 ms 
- **Scan**: HTTP 200 in 486 ms 
- **File Count**: 154
- **Files Skipped Notes**: Analyzed 154 files: 203 nodes, 273 edges (2 unresolved). Findings: 4 medium, 13 low.
- **Languages**: CSS, Environment, HTML, ICO, JPEG, JSON, JavaScript, JavaScript (JSX), Markdown, PNG, TXT, Unknown
- **Graph Architecture**:
  - Total Nodes: 203
  - Total Edges: 273
  - Unresolved Edges: 2
  - Level 1 Modules Count: 3
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 15 ms
- **Findings Summary (Total: 17)**:
  - **By Rule**:
    - `env_undeclared`: 4
    - `isolated_file`: 13
  - **By Severity**:
    - `medium`: 4
    - `low`: 13
  - **By Confidence**:
    - `likely`: 4
    - `hypothesis`: 13

---

### Project: `vite-mern-template-main`

- **Archive**: `vite-mern-template-main.zip`
- **Upload**: HTTP 201 in 180 ms 
- **Scan**: HTTP 200 in 117 ms 
- **File Count**: 36
- **Files Skipped Notes**: Analyzed 36 files: 38 nodes, 3 edges (0 unresolved). Findings: 5 low.
- **Languages**: CSS, HTML, JSON, JavaScript, Markdown, TypeScript, TypeScript (TSX), Unknown, XML
- **Graph Architecture**:
  - Total Nodes: 38
  - Total Edges: 3
  - Unresolved Edges: 0
  - Level 1 Modules Count: 1
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 14 ms
- **Findings Summary (Total: 5)**:
  - **By Rule**:
    - `isolated_file`: 5
  - **By Severity**:
    - `low`: 5
  - **By Confidence**:
    - `hypothesis`: 5

---

## Part 2: False Positive Review (Read-Only Analysis)

Review conducted on sampled findings (up to 5 per rule per project, highest severity first, distributed across files) by inspecting extracted files in isolated temporary storage.

### 1. `EduZone-master`

#### Rule: `broken_import` (5 findings sampled)
- `client/src/pages/instructor/StudentProfile.jsx:3` (`../../../hooks/useCustomHooks`): **TRUE** — Path traversal error with one `../` too many; target file is located at `client/src/hooks/useCustomHooks.jsx`.
- `client/src/pages/instructor/StudentProfile.jsx:5` (`../../components/UserProfileView`): **TRUE** — Target component is located inside subdirectory `client/src/components/admin/UserProfileView.jsx`.
- `client/src/pages/instructor/StudentsList.jsx:4` (`../../../utils/constants`): **TRUE** — Relative path ascends too high past the `src` folder; target is at `client/src/utils/constants.jsx`.
- `client/src/pages/instructor/StudentsList.jsx:3` (`../../../hooks/useCustomHooks`): **TRUE** — Relative import specifies three parent traversals instead of two; target is at `client/src/hooks/useCustomHooks.jsx`.
- `client/src/pages/instructor/StudentProfile.jsx:4` (`../../../utils/constants`): **TRUE** — Relative import fails to resolve because it bypasses the `src` folder; target is at `client/src/utils/constants.jsx`.

#### Rule: `env_undeclared` (3 findings sampled)
- `server/src/config/env.js:25` (`SECRET_KEY`): **TRUE** — Variable is referenced as a fallback secret in token configuration but is omitted from `server/.env.example`.
- `server/src/config/env.js:16` (`MONGO_URI`): **TRUE** — Variable is referenced as a fallback database URI in server config but is omitted from `server/.env.example`.
- `server/index.js:81` (`npm_package_version`): **FALSE** — Standard environment variable automatically populated by the npm runtime rather than user configuration.

#### Rule: `isolated_file` (5 findings sampled)
- `client/src/components/settings/shared/ProfileForm.jsx:1`: **TRUE** — Component is never imported, mounted, or tested anywhere in the client codebase.
- `client/src/pages/instructor/StudentProfile.jsx:1`: **TRUE** — Instructor student profile page component is never registered in router tables or imported by any parent view.
- `client/eslint.config.js:1`: **FALSE** — Linter configuration file invoked by external tooling CLI, not by source code imports.
- `client/src/components/settings/shared/TabData.jsx:1`: **TRUE** — Tab navigation descriptor array is never imported by any active settings view.
- `server/src/utils/api_error.js:1`: **TRUE** — Custom error subclass is defined but never imported or instantiated across server controllers or middlewares.

---

### 2. `School-Management-System_Rad_Project-master`

#### Rule: `broken_import` (1 finding sampled)
- `Backend/routes/parent/signUp.js:1` (`../../models/parent/signUp.js`): **TRUE** — Target directory and file `Backend/models/parent/signUp.js` do not exist in the project repository.

#### Rule: `env_undeclared` (1 finding sampled)
- `Backend/routes/admin/signUp.js:32` (`BASE_URL`): **TRUE** — Backend accesses `process.env.BASE_URL` without providing any `.env.example` template in the project.

#### Rule: `isolated_file` (5 findings sampled)
- `Backend/routes/teacher/logout.js:1`: **TRUE** — Express router is implemented in the routes directory but is never mounted in `Backend/server.js`.
- `Frontend/src/setupTests.js:1`: **FALSE** — Test initialization file automatically discovered and loaded by Create React App / Jest test runner.
- `Backend/routes/teacher/tokenUpdate.js:1`: **TRUE** — Router file is isolated because `server.js` duplicates the user token route instead of requiring this handler.
- `Frontend/src/Components/Student/StuUpdate.jsx:1`: **TRUE** — Student update page component is never imported by React Router or any navigation component.
- `Backend/routes/admin/showUnVerifiedUsers.js:1`: **TRUE** — Route handler was never mounted in `server.js` due to a duplicate copy-paste error.

#### Rule: `circular_dependency` (1 finding sampled)
- `Frontend/src/Components/Utils/Login.jsx:3`: **TRUE** — Genuine circular import cycle between `Login.jsx` importing `Navbar.js` and `Navbar.js` importing `Login.jsx`.

---

### 3. `conduit-realworld-example-app-main`

#### Rule: `env_undeclared` (4 findings sampled)
- `backend/config/config.js:9` (`DEV_DB_LOGGING`): **TRUE** — Variable is missing from `.env.example` due to a typo in the template where it was misspelled as `DEV_DB_LOGGGIN`.
- `backend/config/config.js:25` (`PROD_DB_LOGGING`): **TRUE** — Variable is missing from `.env.example` due to a typo in the template where it was misspelled as `PROD_DB_LOGGGIN`.
- `backend/index.js:2` (`NODE_ENV`): **FALSE** — Universal Node.js execution environment variable conventionally provided by hosting environments rather than local environment files.
- `backend/config/config.js:17` (`TEST_DB_LOGGING`): **TRUE** — Variable is missing from `.env.example` due to a typo in the template where it was misspelled as `TEST_DB_LOGGGIN`.

#### Rule: `isolated_file` (5 findings sampled)
- `backend/migrations/20220129140956-create-user.js:1`: **FALSE** — Database migration script loaded dynamically by Sequelize CLI, not through static module imports.
- `backend/models/Article.js:1`: **FALSE** — Sequelize ORM model discovered and registered dynamically at runtime via `fs.readdirSync` in `backend/models/index.js`.
- `backend/seeders/20220427123222-create-articles.js:1`: **FALSE** — Database seeder script loaded dynamically by Sequelize CLI, not through application imports.
- `backend/migrations/20220129140808-create-article.js:1`: **FALSE** — Database migration script loaded dynamically by Sequelize CLI.
- `frontend/src/setupTests.js:1`: **FALSE** — Standard Create React App / Jest test runner setup script not imported by application code.

---

### 4. `vite-mern-template-main`

#### Rule: `isolated_file` (5 findings sampled)
- `frontend/src/vite-env.d.ts:1`: **FALSE** — TypeScript ambient type declaration file providing client types; loaded by TypeScript compiler, not runtime import.
- `frontend/postcss.config.cjs:1`: **FALSE** — PostCSS build tool configuration file loaded by Vite / PostCSS runner.
- `frontend/src/test/setup.ts:1`: **FALSE** — Vitest test setup file specified in test runner configuration `vite.config.ts`, not imported by app code.
- `frontend/vite.config.ts:1`: **FALSE** — Project build tool configuration file executed by Vite CLI.
- `frontend/tailwind.config.cjs:1`: **FALSE** — Tailwind CSS design system configuration file loaded by Tailwind compiler.

---

### Rule Accuracy & False Positive Counts (Sampled Findings)

| Rule ID | Sampled | True | False | Unsure | True Positive Rate | False Positive Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `broken_import` | 6 | 6 | 0 | 0 | **100%** | **0%** |
| `circular_dependency` | 1 | 1 | 0 | 0 | **100%** | **0%** |
| `env_undeclared` | 8 | 6 | 2 | 0 | **75%** | **25%** |
| `isolated_file` | 20 | 8 | 12 | 0 | **40%** | **60%** |
| `api_unmatched_call` | 0 | 0 | 0 | 0 | N/A | N/A |
| `secret_pattern` | 0 | 0 | 0 | 0 | N/A | N/A |
| **Total** | **35** | **21** | **14** | **0** | **60%** | **40%** |

### Patterns Causing False Positives & Recommended Fixes

1. **Build Tool and Linter Configuration Files**:
   - *Pattern*: Configuration files (`vite.config.ts`, `postcss.config.cjs`, `tailwind.config.cjs`, `eslint.config.js`) are flagged as `isolated_file` because build systems evaluate them directly without static application imports.
   - *Fix*: Extend scanner exemptions to ignore known config file patterns (`*.config.{js,cjs,mjs,ts}`, `.*rc.{js,json}`).
2. **Dynamic Framework Model / Migration Loaders**:
   - *Pattern*: ORMs such as Sequelize use dynamic filesystem scanning (`fs.readdirSync`) to import models and execute migrations, causing static analysis to flag active models (`Article.js`) and migration scripts as `isolated_file`.
   - *Fix*: Exempt files within standard ORM directories (`migrations/`, `seeders/`, `models/`) when a dynamic loader file (`models/index.js`) is present.
3. **Test Framework Setup Scripts & TypeScript Ambient Declarations**:
   - *Pattern*: Test setup files (`setupTests.js`, `setup.ts`) and TypeScript ambient declarations (`vite-env.d.ts`, `*.d.ts`) are flagged as `isolated_file`.
   - *Fix*: Exempt files matching `setupTests.*`, `test/setup.*`, and `*.d.ts`.
4. **Standard Runtime Environment Variables**:
   - *Pattern*: Universally supplied runtime variables (`NODE_ENV`, `npm_package_version`) are flagged as `env_undeclared` when not explicitly present in `.env.example`.
   - *Fix*: Maintain a small built-in whitelist of standard runtime variables (`NODE_ENV`, `npm_*`, `CI`) that are exempted from undeclared checking.
