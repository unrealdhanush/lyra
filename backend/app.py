"""API service. Deploy on Railway/Render/Fly — anywhere with a long-lived
process, because council runs are 30-90s background jobs and serverless is the
wrong shape for that.

The frontend talks ONLY to this API. It polls GET /api/runs/{slug} for live
runs; possession of the slug is the access capability (slugs are unguessable,
runs are anonymous). All Supabase access happens here with the service key.

The host OpenRouter key lives HERE, server-side, and never reaches the client.
The real spend protection is the key itself: a dedicated OpenRouter key with a
daily limit (limit_reset=daily), sized to what you're genuinely fine losing.
The gate below only stops casual double-dipping.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import Client, create_client

from council.models import Dossier
from council.orchestrator import SpendCapError, preflight, run_council

# Resolved relative to this file, so it works no matter which directory you
# launch from. Must run before the CORS config below reads FRONTEND_ORIGINS.
# In deployment the platform injects real env vars; load_dotenv doesn't
# override anything already set, so this is a no-op there.
ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(ENV_PATH)

REQUIRED_ENV = (
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "HOST_OPENROUTER_KEY",
    "GATE_SALT",
)


def supabase_url() -> str:
    """supabase-py builds {url}/rest/v1/<table>. A trailing slash yields
    //rest/v1 and an embedded path yields /rest/v1/rest/v1 — both make
    PostgREST return PGRST125 'Invalid path specified in request URL',
    which points nowhere near the actual cause. Normalise defensively."""
    return os.environ.get("SUPABASE_URL", "").strip().rstrip("/")

# Background tasks need a strong reference or the GC can cancel them mid-run.
_TASKS: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            f"Missing environment variables: {', '.join(missing)}. "
            f"Expected in {ENV_PATH} (copy .env.example) or the process environment."
        )

    url = supabase_url()
    if not url.startswith("https://") or "/rest" in url or ".supabase.co" not in url:
        raise RuntimeError(
            f"SUPABASE_URL looks malformed: {url!r}\n"
            "Expected exactly https://<project-ref>.supabase.co — no trailing "
            "slash, no /rest/v1 suffix. Copy it from Settings > API > Project URL."
        )

    key = os.environ["SUPABASE_SECRET_KEY"].strip()
    if key.startswith("sb_publishable_"):
        raise RuntimeError(
            "SUPABASE_SECRET_KEY holds a publishable key. The backend needs a "
            "secret key (sb_secret_...), which bypasses RLS; the publishable "
            "key would be blocked by the read-only policies."
        )
    yield
    for t in _TASKS:
        t.cancel()


app = FastAPI(title="LYRA", lifespan=lifespan)

# FRONTEND_ORIGINS pins the production origin. FRONTEND_ORIGIN_REGEX is
# optional and exists for Vercel preview deploys, whose URLs change every
# push — e.g. https://lyra-.*\.vercel\.app
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip().rstrip("/")
        for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ],
    allow_origin_regex=os.environ.get("FRONTEND_ORIGIN_REGEX") or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _db() -> Client:
    return create_client(supabase_url(), os.environ["SUPABASE_SECRET_KEY"].strip())


def _gate_hash(request: Request) -> str:
    """Best-effort identity for one-free-run gating. Salted so raw IPs are
    never stored. This is theater by design — incognito beats it in seconds —
    and that's fine, because the key's spend cap is the actual defense."""
    ip = request.headers.get("x-forwarded-for", request.client.host or "unknown")
    ip = ip.split(",")[0].strip()
    return hashlib.sha256(f"{os.environ['GATE_SALT']}:{ip}".encode()).hexdigest()


def _is_admin(request: Request) -> bool:
    """True when the request carries the admin token. Constant-time compare;
    admin mode simply doesn't exist unless ADMIN_TOKEN is set in the env."""
    expected = os.environ.get("ADMIN_TOKEN", "")
    supplied = request.headers.get("x-admin-token", "")
    return bool(expected) and bool(supplied) and hmac.compare_digest(supplied, expected)


def _resolve_key(byok: Optional[str]) -> tuple[str, str]:
    """Returns (api_key, paid_by). BYOK requests bypass the free-run gate —
    they're spending their own money. The key is used for this run's calls
    and never persisted."""
    if byok:
        if not byok.startswith("sk-or-"):
            raise HTTPException(400, "That doesn't look like an OpenRouter key.")
        return byok, "byok"
    return os.environ["HOST_OPENROUTER_KEY"], "host"


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------

class SubmitBody(BaseModel):
    idea: str = Field(min_length=10, max_length=4000)
    clarifications: list[dict] = []
    byok_key: Optional[str] = None


@app.post("/api/ideas")
async def submit_idea(body: SubmitBody, request: Request):
    db = _db()
    api_key, paid_by = _resolve_key(body.byok_key)
    gate = _gate_hash(request)

    # Admin runs use the host key but skip the free-run gate entirely.
    # paid_by='admin' also keeps them out of the partial unique index
    # (which only covers 'host' rows), so the DB agrees with this bypass.
    if paid_by == "host" and _is_admin(request):
        paid_by = "admin"

    # One free host-funded run per gate hash. The unique partial index in the
    # schema enforces this at the DB level too; checking here just gives a
    # nicer error than a constraint violation.
    if paid_by == "host":
        existing = (
            db.table("runs")
            .select("id", count="exact")
            .eq("gate_hash", gate)
            .eq("paid_by", "host")
            .execute()
        )
        if (existing.count or 0) >= 1:
            raise HTTPException(
                429,
                "You've used your free evaluation. Bring your own OpenRouter "
                "key to run more — it's pay-as-you-go and a run costs cents.",
            )

    idea_text = body.idea
    if body.clarifications:
        qa = "\n".join(
            f"Q: {c.get('question', '')}\nA: {c.get('answer', '')}"
            for c in body.clarifications
        )
        idea_text = f"{body.idea}\n\nClarifications:\n{qa}"

    # Pre-flight: cheap gate guarding the one shot. If the idea is too thin,
    # return questions instead of spending a council run on mush.
    try:
        pf, _ = await preflight(api_key, idea_text)
    except SpendCapError:
        raise HTTPException(
            503,
            "Today's free evaluations are used up. Bring your own key or try tomorrow.",
        )

    if not pf.ready:
        return {"status": "needs_clarification", "questions": pf.questions[:3]}

    slug = secrets.token_urlsafe(8)
    run = (
        db.table("runs")
        .insert({
            "share_slug": slug,
            "idea_raw": body.idea,
            "idea_refined": pf.refined,
            "clarifications": body.clarifications,
            "status": "researching",
            "status_detail": "Building the market dossier",
            "gate_hash": gate if paid_by == "host" else None,  # admin/byok rows carry no gate
            "paid_by": paid_by,
            "is_public": False,  # publishing is opt-in, after seeing the result
        })
        .execute()
    )
    run_id = run.data[0]["id"]

    _spawn(_research_then_council(run_id, pf.refined or body.idea, pf, api_key))
    return {"status": "started", "run_id": run_id, "share_slug": slug}


async def _research_then_council(run_id: str, idea: str, pf, api_key: str) -> None:
    """Facts lane, then judgment lane. The facts lane (competitor discovery +
    dossier assembly from pf.search_terms / pf.implied_competitors) is the next
    module to build — until then the council runs on an empty dossier, which
    the prompts explicitly know how to handle."""
    from datetime import datetime, timezone

    dossier = Dossier(
        competitors=[],
        gathered_at=datetime.now(timezone.utc).isoformat(),
        notes=["Facts lane not yet implemented — council ran without a dossier."],
    )
    await run_council(run_id, idea, dossier, api_key)


# ---------------------------------------------------------------------------
# Read — the polling endpoint the whole frontend hangs off
# ---------------------------------------------------------------------------

RUN_FIELDS = (
    "id, share_slug, status, status_detail, error, idea_raw, idea_refined, "
    "is_public, paid_by, tokens_in, tokens_out, cost_micro_usd, created_at, completed_at"
)


@app.get("/api/runs/{slug}")
async def get_run(slug: str):
    db = _db()
    runs = db.table("runs").select(RUN_FIELDS).eq("share_slug", slug).execute()
    if not runs.data:
        raise HTTPException(404, "No such session.")
    run = runs.data[0]
    run_id = run.pop("id")

    opinions = (
        db.table("opinions")
        .select("role, model, verdict, confidence, headline, body, failed, latency_ms, created_at")
        .eq("run_id", run_id)
        .order("created_at")
        .execute()
    ).data

    # Redacted: label_map de-anonymizes the blind review and stays server-side.
    reviews = (
        db.table("reviews")
        .select("reviewer_role, reasoning, crux, unsupported_claims, created_at")
        .eq("run_id", run_id)
        .order("created_at")
        .execute()
    ).data

    verdicts = (
        db.table("verdicts")
        .select("model, headline, council_split, crux, body, score_spread, created_at")
        .eq("run_id", run_id)
        .execute()
    ).data

    return {
        "run": run,
        "opinions": opinions,
        "reviews": reviews,
        "verdict": verdicts[0] if verdicts else None,
    }


class PublishBody(BaseModel):
    public: bool


@app.post("/api/runs/{slug}/publish")
async def publish_run(slug: str, body: PublishBody):
    db = _db()
    runs = db.table("runs").select("id, status").eq("share_slug", slug).execute()
    if not runs.data:
        raise HTTPException(404, "No such session.")
    if runs.data[0]["status"] != "complete":
        raise HTTPException(409, "Only completed sessions can be published.")
    db.table("runs").update({"is_public": body.public}).eq("share_slug", slug).execute()
    return {"is_public": body.public}


@app.get("/api/gallery")
async def gallery():
    db = _db()
    rows = (
        db.table("runs")
        .select("share_slug, idea_refined, idea_raw, created_at, verdicts(headline, conviction)")
        .eq("is_public", True)
        .eq("status", "complete")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    ).data
    return {"runs": rows}


@app.get("/api/health")
async def health():
    """Verifies the Supabase link, not just that the process is alive.
    Hit this first after any deploy — it catches a bad URL or key before a
    user does."""
    try:
        _db().table("runs").select("id").limit(1).execute()
        db_ok = True
        detail = None
    except Exception as err:
        db_ok = False
        detail = str(err)[:200]

    return {
        "ok": db_ok,
        "database": "connected" if db_ok else "unreachable",
        "detail": detail,
        "admin_enabled": bool(os.environ.get("ADMIN_TOKEN")),
    }
