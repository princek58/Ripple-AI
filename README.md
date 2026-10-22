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
