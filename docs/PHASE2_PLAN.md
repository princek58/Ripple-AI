# Ripple AI — Phase 2 Plan

## Introduction

Phase 1 established the core foundation of Ripple AI: deterministic static AST analysis, multi-level dependency graphs (L1–L4), automated rule checks, scan history strip, template-based plain-language explanations, and visual QA testing across desktop and mobile viewports. In Phase 1, analysis is strictly static, read-only, and executes zero lines of uploaded user code.

Phase 2 builds upon this foundation by introducing incremental capabilities one feature at a time. Every Phase 2 feature must be accompanied by thorough unit and integration test coverage, explicit boundary checks, and automated QA verification. Non-negotiable principles—evidence-first architecture, read-only guarantees, secret redaction, and deterministic static analysis—remain strictly enforced.

---

## Phase 2 Feature Roadmap

| Feature ID | Feature Name | Description | Status | What It Never Does |
| :---: | :--- | :--- | :---: | :--- |
| **A** | **Change Impact Analysis** | Computes the ripple effect of modifying a file, API route, or configuration variable by traversing dependent nodes in the architectural dependency graph using deterministic breadth-first search. | Not started | Never executes user code; never guesses impacts through stochastic AI models; never mutates graph state; never inspects runtime memory. |
| **B** | **API Response-Shape Mismatch** | Compares frontend consumer expectations (e.g. accessed response properties in fetch/axios callers) against backend route return payloads or schema definitions to flag incompatible API contracts. | Not started | Never invokes live API endpoints or sends network requests; never executes backend route handlers; never modifies route controllers or client calls. |
| **C** | **Scan History and Memory** | Tracks revision progression across subsequent scans of a project, identifying newly introduced, resolved (fixed), and regressed findings between scans. | Not started | Never discards past scan audit logs silently; never executes diff patches automatically; never alters historical findings records. |
| **D** | **GitHub Import of Public Repositories** | Clones or fetches public GitHub repositories over HTTPS for analysis within Ripple AI. | Not started | Never accesses private repositories; never requests or stores user GitHub credentials or personal access tokens; never commits or pushes to remote repositories. |
| **E** | **Gemini Explanations** | Optional AI-assisted explanations using the Google Gemini free-tier API, disabled by default. Generates contextual summaries of static findings. | Complete (backend) | Never sends source code snippets, secrets, or file contents to Gemini API without explicit user consent toggle; only transmits finding rule ID, severity, confidence, file path, and line numbers (code window up to 7 lines strictly optional); never active unless explicitly toggled on by user; never invents graph nodes or findings. |
| **F** | **Requirement-to-Code, Docs Generation & CI/CD Analysis** | Architectural documentation generation from dependency graphs, specification-to-code tracing, and CI/CD workflow linting (planned for later in Phase 2). | Not started | Never modifies CI/CD pipeline definitions directly; never deploys builds to cloud providers; never executes deployment scripts. |
| **G** | **Code Execution Sandbox** | Isolated execution environment for safely executing tests and validating candidate fixes (reserved for Phase 3; strictly not before the project finale). | Not started | Never runs in Phase 1 or Phase 2; never runs untrusted code directly on host machine; never bypasses container isolation boundaries. |
