# Deploying Ripple AI

This guide explains how to deploy Ripple AI as a single unified service on any hosting platform (such as Railway, Render, Fly.io, DigitalOcean, AWS, GCP, or a self-hosted VPS).

---

## What to Deploy

Ripple AI is designed to run as **one service**:
1. **One Node.js service**: The compiled backend serves both the REST API and the built single-page frontend application from a single process and port.
2. **One persistent volume**: A mounted disk or directory path for:
   - The SQLite database file (`DB_PATH`).
   - Project uploads and extracted analysis files (`STORAGE_PATH` and `TEMP_STORAGE_PATH`).

---

## Environment Variables

Configure the following environment variables in your hosting provider's dashboard or container environment.

> **Important Security Rule**: Secrets belong strictly in your host's secure environment settings. Never commit secrets, API keys, or access codes into git, and never commit a `.env` file to version control.

| Variable Name | Purpose | Example / Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | Set to `production` |
| `PORT` | Listening port for the service | Set by the host (e.g. `4000`, `8080`, `3000`) |
| `APP_ACCESS_CODE` | Shared passphrase protecting the application gate | Any strong secret code string |
| `APP_SESSION_SECRET` | Secret key used to sign session cookies | High-entropy random secret (e.g. 32+ characters) |
| `PUBLIC_DEMO_MODE` | Optional flag for public demonstration instances | Set to `1` or `true` (forces code sharing OFF) |
| `GEMINI_API_KEY` | Google Gemini API key(s) (supports comma-separated `key1,key2`) | Required for external Gemini AI explanations |
| `GEMINI_MODEL` | Primary Gemini model name | E.g. `gemini-3.1-flash-lite` |
| `GROQ_API_KEY` | Groq API key(s) (supports comma-separated `key1,key2`) | Enables ultra-fast Groq / LLaMA failover |
| `GROQ_MODEL` | Groq model identifier | Defaults to `llama-3.3-70b-versatile` |
| `GROQ_BASE_URL` | Optional base URL for Groq/OpenAI-compatible endpoints | Defaults to `https://api.groq.com/openai/v1` |
| `AI_FALLBACK_MODEL` | Optional fallback model if the primary model is busy | E.g. `gemini-1.5-flash` |
| `AI_TIMEOUT_MS` | Upstream AI timeout budget in milliseconds | Defaults to `45000` (45s) |
| `DB_PATH` | Absolute path to the SQLite database file on persistent disk | E.g. `/data/ripple.db` |
| `STORAGE_PATH` | Absolute path to project storage on persistent disk | E.g. `/data/storage` |
| `TEMP_STORAGE_PATH` | Absolute path for extraction temp files | E.g. `/data/storage/tmp` |
| `TRUST_PROXY` | Proxy trust setting when behind a reverse proxy/load balancer | E.g. `1` or `true` |
| `CORS_ORIGIN` | Allowed cross-origin domain | Leave unset for same-origin in production |

> **Multi-Key & Multi-Provider Auto-Failover**: Both `GEMINI_API_KEY` and `GROQ_API_KEY` (or `AI_API_KEY`) support comma-separated lists of keys (e.g. `key1,key2`). When configured, Ripple AI automatically fails over across keys and providers (Gemini <-> Groq) within the request timeout budget if any candidate is rate-limited (HTTP 429), unavailable (HTTP 5xx), or rejected.


---

## Persistent Disks & Free Hosts Note

- **Ephemeral vs Persistent Storage**: SQLite and uploaded project files live on the filesystem. If you deploy on a free or serverless platform with an ephemeral disk (such as default Heroku or Render free web services without an attached disk), data will reset whenever the container restarts or re-deploys.
- **Sleep Cycles**: On free hosting tiers that sleep after inactivity, the first request may experience a cold start delay. Check your host's specifications to ensure a persistent disk volume is attached if you want scan history and uploaded projects to persist.

---

## Go-Live Checklist

Complete this checklist before sharing your deployment:

1. [ ] **Build passes**: Run `npm run build:all` locally or confirm container build step succeeds without errors.
2. [ ] **Access code set**: Ensure `APP_ACCESS_CODE` and `APP_SESSION_SECRET` are configured in the host environment settings.
3. [ ] **Public demo mode**: If sharing a public link where users should not transmit source code lines, confirm `PUBLIC_DEMO_MODE=1` is set.
4. [ ] **API key configured**: Set `GEMINI_API_KEY` and `GEMINI_MODEL` in the host environment.
5. [ ] **Health check verified**: Confirm `GET /api/health` returns HTTP 200 with `{ data: { status: "ok" } }`.
6. [ ] **Upload test**: Log in with the access code and upload a sample ZIP (e.g. `samples/demo-erp-sample.zip`) to verify disk write permissions.
7. [ ] **AI chat test**: Open the chat assistant and ask a question to verify external AI or offline fallback connectivity.
8. [ ] **Key rotation check**: If your API key or access code was ever exposed in a log, terminal screen, or commit, rotate it immediately in the Google AI Studio / provider console.

---

## Rollback Note

If a deployment encounters issues:
- Revert to the previous container image tag or git release tag (e.g. `chat-self-aware`).
- Because SQLite migrations in Ripple AI are additive and preserve backward compatibility, rollbacks do not destroy existing database tables.
- Keep a backup copy of your database file (`ripple.db`) before performing major schema updates.
