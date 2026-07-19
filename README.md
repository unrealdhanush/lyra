# LYRA

**L**itigate **Y**our **R**iskiest **A**ssumptions.

Four models with conflicting mandates put a startup idea on trial, rank each
other's arguments blind, and a chairman rules — grounded in sourced market
data, with unverifiable numbers struck from the record.

Built on the LLM-council pattern (Karpathy), via OpenRouter.

## Architecture

```
frontend/   React + Vite on Vercel. Talks ONLY to the backend API.
            Polls GET /api/runs/{slug} every 2.5s during a live session —
            no supabase-js in the client, the slug is the access capability.

backend/    FastAPI on Railway/Render/Fly (long-lived process, NOT
            serverless — a council run is a 30-90s background job).
            · council/prompts.py      the actual product: 4 advisor mandates,
                                      blind review, chairman synthesis
            · council/orchestrator.py 3-stage async pipeline over OpenRouter
            · council/models.py       Pydantic; figures can't exist without
                                      a source (or an explicit UNAVAILABLE)
            · app.py                  submit / poll / publish / gallery
            Dependencies via uv (pyproject.toml + uv.lock, no Docker).

schema.sql  Supabase. The same sourced-or-unavailable rule enforced as a
            CHECK constraint. RLS: nothing readable publicly except
            completed runs their author chose to publish.
```

Two lanes, strictly separated: **facts** are fetched and cited (or honestly
UNAVAILABLE); **judgment** comes from the council. The council never invents a
number — stage 2 reviewers flag any figure not in the dossier, and claims
flagged by 2+ reviewers are discarded by the chairman outright.

## Setup

### 1. Supabase
Create a project, open the SQL editor, paste `schema.sql`, run it.
Then Settings > API Keys: copy the **Project URL** and a **Secret key**
(`sb_secret_...`) into `backend/.env`. New projects no longer ship the
legacy `service_role` key; the secret key replaces it and bypasses RLS the
same way. The frontend never touches Supabase, so you do not need the
publishable key at all.

### 2. OpenRouter — do not skip the cap
Create a **dedicated** key at openrouter.ai/settings/keys. Set a credit limit
on it and `limit_reset = daily`. This cap is the actual spend protection for
the free tier — the per-visitor gate is bypassable by design. Size it to what
you're fine losing in a day. Note: the per-request check can slightly overshoot
under a burst, so set it below your real pain threshold.

### 3. Backend
Managed with [uv](https://docs.astral.sh/uv/). Install it once:
```
curl -LsSf https://astral.sh/uv/install.sh | sh     # macOS / Linux
```
Then, from `backend/`:
```
uv init --bare --python 3.12
uv add fastapi "uvicorn[standard]" httpx pydantic supabase
uv add --dev ruff
uv python pin 3.12                      # optional: writes .python-version

cp .env.example .env                    # fill it in
uv run uvicorn app:app --reload
```
`--bare` writes only a `pyproject.toml` — no sample `main.py`, no README, no
git init — which is what you want when adding uv to a directory that already
has code. Each `uv add` resolves, updates `pyproject.toml`, writes `uv.lock`,
and installs into `.venv` in one step.

No `[build-system]` means uv treats LYRA as a virtual project: dependencies get
installed, the project itself doesn't, and `app.py` / `council/` resolve via the
working directory.

**Commit `uv.lock`.** Don't `pip install` into `.venv` — it desyncs the lockfile
from the environment.

Deploy: Railway/Render/Fly. Point it at `backend/`, let the platform's Python
builder pick up `pyproject.toml` + `uv.lock`, and set the start command to
`uvicorn app:app --host 0.0.0.0 --port $PORT`. Use an always-on tier — a cold
start ruins a product whose whole UX is "watch it happen live".

### 4. Frontend
```
cd frontend
cp .env.example .env        # VITE_API_URL = your backend URL
npm install && npm run dev
```
Deploy to Vercel; set `VITE_API_URL`. `vercel.json` handles SPA routing.

## Before you post it

1. **Verify model IDs** in `backend/council/orchestrator.py` (`MODELS`)
   against openrouter.ai/models — they drift. Keep advisors spread across
   different providers: same-family panels produce correlated errors and a
   peer review that rubber-stamps itself.
2. **Run 3-5 real ideas end-to-end** and read `cost_micro_usd` on the runs
   table. That number sizes your daily cap. Expect stage 2 (peer review) to
   dominate — it scales with the square of council size.
3. **Try to break your own free gate** (incognito). It should fail against
   the key cap, not the gate.
4. The council currently runs on an **empty dossier** — the facts lane
   (competitor discovery, EDGAR for public comps, sourced journey arcs) is
   the next module; its interface (`pf.search_terms`,
   `pf.implied_competitors` → `_research_then_council` in `app.py`) is
   already wired.

## Env reference

Backend: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `HOST_OPENROUTER_KEY`,
`GATE_SALT`, `FRONTEND_ORIGINS` (comma-separated), `PUBLIC_URL`.
Frontend: `VITE_API_URL`.
