# Ripple AI — Agent Rules

1. Before any task, read `docs/RIPPLE_AI_MASTER_SPEC.md` (or RIPPLE_AI_MASTER_SPEC.md if not yet moved). It is the single source of truth. Do not ask me to paste it again.
2. One prompt = one step. Do only what the prompt asks. Do not touch files outside the ones listed or implied by the step. If you think something else needs changing, tell me instead of changing it.
3. Never execute uploaded or analysed project code. Never require, import, eval or run anything from an uploaded ZIP.
4. Static analysis builds the graph. AI never invents nodes or edges.
5. Never print or store secret values; names and paths only.
6. Stack is fixed: Node + TypeScript + Express + SQLite backend; React + TypeScript + Vite + Tailwind frontend. Do not add new major libraries without asking.
7. Colours and fonts come only from frontend/src/styles/tokens.css and the Tailwind theme. Never hard-code colours in components. Brand green/lime are UI-only; graph type and severity colours are separate.
8. Severity, confidence and verification are always three separate fields. Status is never shown by colour alone: use icon + text label.
9. Mark any placeholder or demo data with a visible "Sample data" tag. No fake testimonials, user counts or logos.
10. Respect prefers-reduced-motion. Animate only where it has meaning.
11. Commit-friendly: small changes, clear file names, no unrelated reformatting.
12. At the end of every step, report honestly: what you built, what you ran (tests, build), results (pass / fail / not run), and anything unfinished. Do not claim something works unless you ran it.
13. Never commit .env, API keys, uploaded ZIPs, backend/storage/ or backend/data/.
14. This is a fresh project. Never read, list or open any folder outside this workspace, and never use old project folders or earlier builds as reference unless I explicitly ask.
