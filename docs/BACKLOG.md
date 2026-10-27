# Ripple AI — Project Backlog

## Overview

This document tracks known limitations, technical debt, security advisories, and planned improvements across the Ripple AI platform.

### How to Use
- **Minor items** discovered during development, automated QA audits, or architectural reviews are appended to this backlog table.
- **Major items** affecting security boundaries, data safety, or correctness are addressed immediately rather than deferred.
- Items are resolved in order of priority during planned enhancement cycles.

---

## Open Backlog Items

| ID | Source | Description | Severity | Status |
| :---: | :--- | :--- | :---: | :---: |
| **B-01** | Dependency Audit | `zod` 3.25.76 npm audit advisory GHSA-mrhx-c7xc-m3w5 (memory exhaustion risk on oversized payloads); remediation requires a major version upgrade with breaking API changes; app is currently single-user local use. | Minor | Open |
| **B-02** | Bundle Size Analysis | Graph page bundle chunk is approximately 1.6 MB because the `elkjs` layout engine is bundled whole without fine-grained tree-shaking. | Minor | Open |
| **B-03** | QA Methodology | Visual QA is automated via Playwright plus an AI inspection of captured screenshots; it has not undergone an independent human design review. | Minor | Open |
| **B-04** | QA Methodology | Print layout for audit reports is validated by CSS print stylesheet unit tests, rather than physically printed paper verification. | Minor | Open |
| **B-05** | Storage Audit | An earlier real database lists 27 projects whose storage directories in `backend/storage` are missing (cause unknown); re-upload of those project archives is required. | Minor | Open |
| **B-06** | Check Accuracy | The `isolated_file` check produces false alarms for utility or helper files when analyzed projects lack a centralized router or entry point (to be measured in rehearsal R1). | Minor | Open |
| **B-07** | Scan Architecture | Re-scanning an existing project deletes previous findings so there is no cross-scan history or regression tracking yet (planned in Phase 2 Feature C). | Minor | Open |
| **B-08** | Export Mechanism | Suggested fix patch download is built exclusively in the browser using Blob URLs; no server-side patch download endpoint exists. | Minor | Open |
| **B-09** | Security & Auth | No authentication or authorization is implemented; the application is strictly designed for local, single-user workstation use. | Minor | Open |
| **B-10** | Feature Scope | Private GitHub repositories are not supported; repository import is planned strictly for public repositories over HTTPS. | Minor | Open |
| **B-11** | Git Maintenance | Stale local branches (`step-3`, `step11-wip`, `step12`, `step13`, `phase1-fixes`, `step14`) can be safely deleted in a future maintenance pass after creating an archival backup. | Minor | Open |
| **B-12** | Test Hygiene | Some Step 14 UI and pure helper tests were not individually mutation-checked (Part 5 of Step 14 covered the 12 most critical ones). | Minor | Open |
| **B-13** | QA Check Tuning | QA clipping check reports 149 warnings, 136 of them intentional `.sr-only` elements, so the check is noisy and must exempt `.sr-only`. | Minor | Open |
| **B-14** | QA Check Tuning | QA forbidden-text check reported 2 hits for the word "undefined", probably the real how-to-fix guidance text, to be confirmed and exempted. | Minor | Open |
| **B-15** | Performance Audit | Verify that opening Investigations does not download the 1.6 MB graphTransform chunk before the Evidence path card is opened. | Minor | Open |
| **B-16** | Test Hygiene | 31 Step 14 tests were not mutation-checked (important ones: Open in Graph click, highlighted investigation path, reduced motion). | Minor | Open |
| **B-17** | Feature Enhancement | The mini graph shows finding-level evidence only; module-level impact comes with Feature A. | Minor | Open |
| **B-18** | Architecture & Types | Impact types are mirrored in `shared/types.ts` and `backend/src/types.ts` and can drift (add a test that compares the key names of the two copies if easy, else leave open). | Minor | Open |
| **B-19** | Backend Architecture | `backend/src/routes/projects.ts` keeps growing; move the graph and impact routes to their own router file later. | Minor | Open |
| **B-20** | Benchmarking & Scale | Impact analysis was checked only on the small `demo-erp` fixture; bigger real projects are measured in rehearsal R1. | Minor | Open |
| **B-21** | Localization | Impact text has no Hinglish version yet (the chatbox will explain in Hinglish). | Minor | Open |
| **B-22** | QA Methodology | Overview L1 card: the earlier AI QA marked it OK; the overlap check did not cover SVG cards; fixed in UI-1; keep the SVG check in QA | Minor | Open |
| **B-23** | QA Methodology | AI review of screenshots misses small overlaps; human screenshots remain necessary | Minor | Open |
| **K-01** | AI Chat | Chat history is not saved on the server; client maintains ephemeral session context up to 6 messages. | Minor | Open |
| **K-02** | Rate Limiting | The rate limit is in memory and resets on restart; single-process deployment assumption. | Minor | Open |
| **K-03** | AI Providers | Only Gemini and OpenAI-compatible providers are supported; additional LLM backends require custom adapters. | Minor | Open |
| **K-04** | AI Reliability | Answers come from a model and may be wrong; static analysis evidence remains authoritative source of truth. | Minor | Open |
| **K-05** | Database Schema | Old global ai_settings table is unused, remove later in a future migration cleanup. | Minor | Open |
| **K-06** | AI Model Discovery | Google retires model ids for new accounts; the configured model id must be re-checked (see K1c script idea) when chat returns AI_MODEL_NOT_FOUND | Minor | Open |
| **K-07** | Code Snippets | snippets with any secret-like assignment are dropped completely, accepting false positives | Minor | Open |
| **K-08** | AI Chat | Chat history is not saved; client session is ephemeral and clears on refresh or project switch. | Minor | Open |
| **K-09** | Demo Quality | Demo saved answers for offline walkthrough are planned in K3. | Minor | Open |
| **K-10** | AI Reliability | AI answers depend on a free preview model that may be unavailable or rate limited. | Minor | Open |
| **K-11** | AI Chat | Chat history is not saved on the server; client maintains ephemeral in-memory session only and clears on project switch or page reload. | Minor | Open |
| **K-12** | Offline Chat | Offline keyword matching is simple substring matching and can miss paraphrased questions or complex multi-clause sentences. | Minor | Open |
| **K-13** | AI Reliability | answers depend on a free preview model that may be unavailable or change; a fallback model can be set | Minor | Open |
| **K-14** | AI Chat | no streaming of answers yet | Minor | Open |
| **K-15** | AI Context | In the first real graph answer the AI mixed up nodes and modules (said 30 nodes (modules) when there are 5 modules) and said fees has 2 High findings when it has 1 High and 1 Low; the screen context needs explicit per-module severity counts and clear nodes versus modules labels | Minor | Open |
| **K-16** | AI Verification | real AI answers are only verified on the small demo-erp fixture | Minor | Open |
| **L-01** | Landing Page | Docs link on the landing page is disabled until a real Docs page exists. | Minor | Open |
| **L-02** | Git Maintenance | landing-wip branch holds unreviewed edits, not merged. | Minor | Open |
