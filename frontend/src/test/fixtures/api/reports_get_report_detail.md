# Ripple AI Analysis Report: demo_erp_12c_1792825823458

## Summary
- **Project Name**: demo_erp_12c_1792825823458
- **Last Scan Time**: 2026-10-24T07:10:23.880Z
- **Files Analyzed**: 17
- **Graph Nodes**: 30
- **Graph Edges**: 25 (3 unresolved)
- **Total Findings**: 9

## Findings by Severity
- **Critical**: 0
- **High**: 1
- **Medium**: 2
- **Low**: 6
- **Unknown**: 0

## Verification Coverage
9 findings: 0 verified, 0 reproduced, 4 likely or confirmed, 5 hypothesis

## Findings Table

| Title | Rule | Severity | Confidence | Verification | File:Line |
| --- | --- | --- | --- | --- | --- |
| Circular dependency between format.js and helpers.js | circular_dependency | low | confirmed | not_tested | backend/utils/format.js:1 |
| Broken import "../services/feeService" in fees.js | broken_import | high | confirmed | not_tested | backend/routes/fees.js:2 |
| Isolated file "fees.js" is never imported or tested | isolated_file | low | hypothesis | not_tested | backend/routes/fees.js:1 |
| Isolated file "legacyReport.js" is never imported or tested | isolated_file | low | hypothesis | not_tested | backend/services/legacyReport.js:1 |
| Isolated file "MarksTable.tsx" is never imported or tested | isolated_file | low | hypothesis | not_tested | frontend/src/components/MarksTable.tsx:1 |
| Isolated file "Dynamic.tsx" is never imported or tested | isolated_file | low | hypothesis | not_tested | frontend/src/pages/Dynamic.tsx:1 |
| Isolated file "NoticePage.tsx" is never imported or tested | isolated_file | low | hypothesis | not_tested | frontend/src/pages/NoticePage.tsx:1 |
| Undeclared environment variable "JWT_SECRET" | env_undeclared | medium | likely | not_tested | backend/config/db.js:2 |
| Unmatched API call "GET /api/notice/list" in NoticePage.tsx | api_unmatched_call | medium | likely | not_tested | frontend/src/pages/NoticePage.tsx:13 |

## Evidence List

### Circular dependency between format.js and helpers.js
- **Rule**: circular_dependency
- Location: `backend/utils/format.js:1`
- Location: `backend/utils/helpers.js:1`

### Broken import "../services/feeService" in fees.js
- **Rule**: broken_import
- Location: `backend/routes/fees.js:2`

### Isolated file "fees.js" is never imported or tested
- **Rule**: isolated_file
- Location: `backend/routes/fees.js:1`

### Isolated file "legacyReport.js" is never imported or tested
- **Rule**: isolated_file
- Location: `backend/services/legacyReport.js:1`

### Isolated file "MarksTable.tsx" is never imported or tested
- **Rule**: isolated_file
- Location: `frontend/src/components/MarksTable.tsx:1`

### Isolated file "Dynamic.tsx" is never imported or tested
- **Rule**: isolated_file
- Location: `frontend/src/pages/Dynamic.tsx:1`

### Isolated file "NoticePage.tsx" is never imported or tested
- **Rule**: isolated_file
- Location: `frontend/src/pages/NoticePage.tsx:1`

### Undeclared environment variable "JWT_SECRET"
- **Rule**: env_undeclared
- Location: `backend/config/db.js:2`

### Unmatched API call "GET /api/notice/list" in NoticePage.tsx
- **Rule**: api_unmatched_call
- Location: `frontend/src/pages/NoticePage.tsx:13`

## Fixes and Status

No fixes have been proposed or approved for this project.

## What was not checked
- Code was not executed (Phase 1 executes no uploaded code).
- No tests were run (1 test files catalogued, none executed in Phase 1).
- Response-shape comparison not done (frontend API calls were checked for route existence only, not JSON payload schemas).
- Dynamic and unresolved references: 3 unresolved references detected (dynamic imports, runtime-constructed URLs).
