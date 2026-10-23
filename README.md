# Ripple AI

AI-assisted project analysis and debugging platform.

## Monorepo Layout

- `frontend/` - React, TypeScript, Vite, Tailwind CSS
- `backend/` - Node.js, TypeScript, Express
- `shared/` - Shared TypeScript interfaces and data model definitions
- `docs/` - Project specifications (`RIPPLE_AI_MASTER_SPEC.md`)

## Prerequisites

- Node.js (v20 or newer)
- npm

## Installation

Install all workspace dependencies from the root:

```bash
npm install
```

## Quick start for non-developers

1. Double-click `start-dev.bat` in the repository root. This starts both backend and frontend development servers in separate windows and automatically opens http://localhost:3000 in your browser.
2. Open the **Projects** page.
3. Upload `samples/demo-erp-sample.zip`.
4. Open **Overview** and **Graph** to explore the project architecture, dependencies, and findings.
5. Close the two server terminal windows when you wish to stop.

## Running the Applications

### Frontend Development Server

```bash
npm run dev:frontend
```

Runs the frontend at http://localhost:3000.

### Backend Development Server

```bash
npm run dev:backend
```

Runs the backend on port 4000.

### Health Check

Verify backend is healthy:

```bash
curl http://localhost:4000/api/health
```

### Running Tests

```bash
npm run test
```

Executes backend tests with Vitest.

### Production Build

```bash
npm run build
```
