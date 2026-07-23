"""Council orchestrator.

Runs as a background task in a long-lived process (Railway/Render/Fly) — not
serverless, because a run takes 30-90s. Each stage writes to Supabase as it
completes and the client subscribes via Realtime, so the run survives a page
refresh and the live trickle of advisors landing one by one comes for free.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel
from supabase import Client, create_client

from .models import (
    ADVISOR_ROLES,
    AdvisorRole,
    Dossier,
    OpinionPayload,
    PreflightPayload,
    ReviewPayload,
    VerdictPayload,
)
from .prompts import (
    PREFLIGHT_SYSTEM,
    ROLES,
    advisor_prompt,
    chairman_prompt,
    review_prompt,
)

# ---------------------------------------------------------------------------
# Model config
# ---------------------------------------------------------------------------

# Cost shape of one run: stage 2 is the expensive part, because every advisor
# reads every other advisor's full output — token volume there scales with the
# square of council size. So advisors are kept on fast, current-gen BUDGET
# models; the chairman, which does the one genuinely hard job (synthesis across
# conflicting arguments), gets a strong model. This two-tier split is what
# keeps a run near single-digit cents instead of ~35c.
#
# Advisors deliberately span providers: four checkpoints of one family produce
# correlated errors and a peer review that rubber-stamps itself.
#
# VERIFY these IDs and prices against openrouter.ai/models before launch —
# model names and rates drift, and some of these may be stale.
# Every chain ENDS in a model known to work. A stale or renamed ID then
# degrades that seat's quality instead of deleting the seat from the panel —
# which is what happened when the Gravedigger's chain contained only
# unverified IDs and it dropped out of a live run entirely.
SAFETY_NET = "anthropic/claude-haiku-4.5"

# Code defaults. The LIVE roster is MODELS below, which merges any admin
# override stored in Supabase (app_config / 'model_roster') at the start of
# every run — the bench can be re-seated without a redeploy.
DEFAULT_MODELS: dict[str, list[str]] = {
    "operator":    ["openai/gpt-5.1-mini", "google/gemini-3-flash", SAFETY_NET],
    "gravedigger": ["google/gemini-3-flash", "openai/gpt-5.1-mini", SAFETY_NET],
    "distributor": ["anthropic/claude-haiku-4.5", "google/gemini-3-flash", SAFETY_NET],
    "why_now":     ["deepseek/deepseek-chat-v3.1", "openai/gpt-5.1-mini", SAFETY_NET],
    "chairman":    ["anthropic/claude-sonnet-4.6", "openai/gpt-5.1", "anthropic/claude-sonnet-4.5"],
    "preflight":   ["google/gemini-3-flash-lite", "openai/gpt-4.1-nano", SAFETY_NET],
}

# Active roster. Mutated IN PLACE by refresh_roster() so every existing call
# site (MODELS[role]) sees overrides without threading a parameter through.
MODELS: dict[str, list[str]] = {k: list(v) for k, v in DEFAULT_MODELS.items()}


def refresh_roster(db) -> None:
    """Merge the admin override (if any) over code defaults. Unknown seats
    and malformed chains are ignored rather than fatal — a bad override must
    degrade to defaults, never take the council down."""
    merged = {k: list(v) for k, v in DEFAULT_MODELS.items()}
    try:
        res = db.table("app_config").select("value").eq("key", "model_roster").execute()
        if res.data:
            override = res.data[0].get("value") or {}
            for seat, chain in override.items():
                if seat in merged and isinstance(chain, list):
                    clean = [m.strip() for m in chain if isinstance(m, str) and m.strip()]
                    if clean:
                        merged[seat] = clean
    except Exception as err:  # noqa: BLE001
        print(f"[roster] override load failed, using defaults: {err}", flush=True)
    MODELS.clear()
    MODELS.update(merged)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

T = TypeVar("T", bound=BaseModel)


class SpendCapError(Exception):
    """OpenRouter returned 402: the key's spend cap was hit. This is the
    circuit breaker doing its job — don't retry, don't fall back, surface it."""


@dataclass
class CallResult:
    data: BaseModel
    model: str
    tokens_in: int
    tokens_out: int
    cost_micro_usd: int
    latency_ms: int


def _parse_json(raw: str, schema: type[T]) -> T:
    """Models sometimes fence JSON despite instructions. Strip and parse."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    cleaned = cleaned.removesuffix("```").strip()
    try:
        return schema.model_validate_json(cleaned)
    except Exception:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            return schema.model_validate_json(cleaned[start : end + 1])
        raise ValueError(f"unparseable model output: {cleaned[:200]}")


async def call_json(
    client: httpx.AsyncClient,
    api_key: str,
    models: list[str],
    system: str,
    user: str,
    schema: type[T],
    max_tokens: int = 1200,
) -> CallResult:
    """Call OpenRouter with fallback down the model list. Free variants and
    busy providers 429 regularly, so fallback isn't optional."""
    last_err: Exception | None = None

    for model in models:
        started = time.monotonic()
        try:
            res = await client.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": os.environ.get("PUBLIC_URL", ""),
                    "X-Title": "LYRA",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "response_format": {"type": "json_object"},
                    "usage": {"include": True},
                },
                timeout=120.0,
            )

            if res.status_code == 402:
                raise SpendCapError(res.text)
            res.raise_for_status()

            body = res.json()
            content: str = body["choices"][0]["message"]["content"]
            usage = body.get("usage") or {}

            return CallResult(
                data=_parse_json(content, schema),
                model=model,
                tokens_in=usage.get("prompt_tokens", 0),
                tokens_out=usage.get("completion_tokens", 0),
                cost_micro_usd=round((usage.get("cost") or 0) * 1_000_000),
                latency_ms=int((time.monotonic() - started) * 1000),
            )
        except SpendCapError:
            raise
        except Exception as err:  # noqa: BLE001 — fall through to next model
            # Printed, not swallowed: a silently-failing primary model looks
            # identical to a working one until a whole seat disappears.
            print(f"[council] {model} failed: {type(err).__name__}: {err}", flush=True)
            last_err = err

    raise last_err or RuntimeError("all models failed")


# ---------------------------------------------------------------------------
# Supabase helpers
#
# supabase-py's sync client wrapped in to_thread: version-tolerant and keeps
# the orchestrator's own concurrency (gather over advisors) fully intact.
# ---------------------------------------------------------------------------

def _db() -> Client:
    # Trailing slash / embedded path here surfaces as PostgREST PGRST125.
    return create_client(
        os.environ["SUPABASE_URL"].strip().rstrip("/"),
        os.environ["SUPABASE_SECRET_KEY"].strip(),
    )


async def _insert(db: Client, table: str, row: dict[str, Any]) -> None:
    await asyncio.to_thread(lambda: db.table(table).insert(row).execute())


async def _update_run(db: Client, run_id: str, patch: dict[str, Any]) -> None:
    await asyncio.to_thread(
        lambda: db.table("runs").update(patch).eq("id", run_id).execute()
    )


async def _set_status(db: Client, run_id: str, status: str, detail: str) -> None:
    await _update_run(db, run_id, {"status": status, "status_detail": detail})


async def _add_cost(db: Client, run_id: str, r: CallResult) -> None:
    await asyncio.to_thread(
        lambda: db.rpc(
            "add_run_cost",
            {
                "p_run_id": run_id,
                "p_tokens_in": r.tokens_in,
                "p_tokens_out": r.tokens_out,
                "p_cost": r.cost_micro_usd,
            },
        ).execute()
    )


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

@dataclass
class Opinion:
    role: AdvisorRole
    payload: OpinionPayload


@dataclass
class Review:
    reviewer: AdvisorRole
    payload: ReviewPayload
    label_map: dict[str, AdvisorRole]


async def preflight(api_key: str, idea_raw: str) -> tuple[PreflightPayload, CallResult]:
    async with httpx.AsyncClient() as client:
        out = await call_json(
            client, api_key, MODELS["preflight"],
            PREFLIGHT_SYSTEM, idea_raw, PreflightPayload, max_tokens=600,
        )
    return out.data, out  # type: ignore[return-value]


async def _deliberate(
    client: httpx.AsyncClient, db: Client, run_id: str,
    idea: str, dossier: Dossier, api_key: str,
) -> list[Opinion]:
    """Stage 1 — advisors in parallel. One failure must not kill the run."""
    await _set_status(db, run_id, "deliberating", "The council is reading the dossier")

    async def one(role: AdvisorRole) -> Opinion:
        system, user = advisor_prompt(role, idea, dossier)
        out = await call_json(client, api_key, MODELS[role], system, user, OpinionPayload)
        payload: OpinionPayload = out.data  # type: ignore[assignment]

        # Write immediately — this row landing is what the client is watching for.
        await _insert(db, "opinions", {
            "run_id": run_id,
            "role": role,
            "model": out.model,
            "verdict": payload.verdict,
            "confidence": payload.confidence,
            "headline": payload.headline,
            "body": payload.model_dump(),
            "latency_ms": out.latency_ms,
            "tokens_in": out.tokens_in,
            "tokens_out": out.tokens_out,
        })
        await _add_cost(db, run_id, out)
        return Opinion(role=role, payload=payload)

    results = await asyncio.gather(
        *(one(r) for r in ADVISOR_ROLES), return_exceptions=True
    )

    ok: list[Opinion] = []
    for role, res in zip(ADVISOR_ROLES, results):
        if isinstance(res, SpendCapError):
            raise res
        if isinstance(res, Exception):
            await _insert(db, "opinions", {
                "run_id": run_id, "role": role, "model": "none",
                "failed": True, "body": {"error": str(res)},
            })
        else:
            ok.append(res)

    # The quorum rule: fewer than three advisors isn't a tribunal. Fail
    # loudly rather than ship a "verdict" that was one model talking to itself.
    if len(ok) < 3:
        raise RuntimeError(f"only {len(ok)}/4 advisors responded")
    return ok


def _anonymize(opinions: list[Opinion]) -> tuple[str, dict[str, AdvisorRole]]:
    """Fresh shuffle per reviewer; role titles stripped — argument only."""
    shuffled = random.sample(opinions, k=len(opinions))
    labels = ["A", "B", "C", "D"]
    label_map: dict[str, AdvisorRole] = {}
    blocks: list[str] = []

    for label, o in zip(labels, shuffled):
        label_map[label] = o.role
        p = o.payload
        blocks.append("\n".join([
            f"### Assessment {label}",
            f"Verdict: {p.verdict} (confidence: {p.confidence})",
            p.headline,
            "",
            p.argument,
            "",
            f"Counter-argument they acknowledged: {p.strongest_counter_to_my_own_view}",
            f"Unknowns they flagged: {'; '.join(p.unknowns_that_would_change_my_mind)}",
        ]))

    return "\n\n".join(blocks), label_map


async def _review(
    client: httpx.AsyncClient, db: Client, run_id: str,
    idea: str, dossier: Dossier, api_key: str, opinions: list[Opinion],
) -> list[Review]:
    """Stage 2 — blind peer review. Own opinion included, unmarked."""
    await _set_status(db, run_id, "reviewing", "Advisors are ranking each other, blind")

    async def one(reviewer: AdvisorRole) -> Review:
        block, label_map = _anonymize(opinions)
        system, user = review_prompt(idea, dossier, block)
        out = await call_json(
            client, api_key, MODELS[reviewer], system, user, ReviewPayload, max_tokens=900,
        )
        payload: ReviewPayload = out.data  # type: ignore[assignment]

        await _insert(db, "reviews", {
            "run_id": run_id,
            "reviewer_role": reviewer,
            "ranking": payload.ranking,
            "label_map": label_map,
            "reasoning": payload.reasoning,
            "unsupported_claims": [c.model_dump() for c in payload.unsupported_claims],
            "crux": payload.crux,
        })
        await _add_cost(db, run_id, out)
        return Review(reviewer=reviewer, payload=payload, label_map=label_map)

    results = await asyncio.gather(
        *(one(o.role) for o in opinions), return_exceptions=True
    )
    for res in results:
        if isinstance(res, SpendCapError):
            raise res
    return [r for r in results if isinstance(r, Review)]


def _aggregate_rankings(reviews: list[Review]) -> list[tuple[AdvisorRole, int]]:
    """Borda count across blind rankings, resolved per-reviewer since the
    shuffle differs for each."""
    points: dict[AdvisorRole, int] = {}
    for r in reviews:
        n = len(r.payload.ranking)
        for idx, label in enumerate(r.payload.ranking):
            role = r.label_map.get(label)
            if role:
                points[role] = points.get(role, 0) + (n - idx)
    return sorted(points.items(), key=lambda kv: kv[1], reverse=True)


def _consensus_flags(reviews: list[Review]) -> list[tuple[AdvisorRole, str, int]]:
    """Claims flagged by 2+ reviewers get discarded, not softened."""
    counts: dict[str, tuple[AdvisorRole, str, int]] = {}
    for r in reviews:
        for f in r.payload.unsupported_claims:
            role = r.label_map.get(f.label)
            if not role:
                continue
            key = f"{role}:{f.claim[:60].lower()}"
            prev = counts.get(key)
            counts[key] = (role, f.claim, (prev[2] if prev else 0) + 1)
    return [v for v in counts.values() if v[2] >= 2]


async def _synthesize(
    client: httpx.AsyncClient, db: Client, run_id: str,
    idea: str, dossier: Dossier, api_key: str,
    opinions: list[Opinion], reviews: list[Review],
) -> VerdictPayload:
    """Stage 3 — chairman. The one place worth a strong model."""
    await _set_status(db, run_id, "synthesizing", "The chair is writing the verdict")

    opinions_block = "\n\n".join(
        "\n".join([
            f"### {ROLES[o.role].title}",
            f"Verdict: {o.payload.verdict} (confidence: {o.payload.confidence})",
            o.payload.headline,
            "",
            o.payload.argument,
            "",
            f"They conceded: {o.payload.strongest_counter_to_my_own_view}",
            f"Would change their mind: {'; '.join(o.payload.unknowns_that_would_change_my_mind)}",
        ])
        for o in opinions
    )

    standings = _aggregate_rankings(reviews)
    flagged = _consensus_flags(reviews)

    reviews_block = "\n".join([
        "### Aggregate standing (Borda, from blind rankings)",
        "\n".join(
            f"{i + 1}. {ROLES[role].title} — {pts} pts"
            for i, (role, pts) in enumerate(standings)
        ),
        "",
        "### Cruxes identified by reviewers",
        "\n".join(f"- {r.payload.crux}" for r in reviews),
        "",
        "### Claims flagged as unsupported by 2+ reviewers — discard these entirely",
        "\n".join(
            f"- [{ROLES[role].title}] {claim} (flagged {n}x)"
            for role, claim, n in flagged
        ) or "- none",
    ])

    system, user = chairman_prompt(idea, dossier, opinions_block, reviews_block)
    out = await call_json(
        client, api_key, MODELS["chairman"], system, user, VerdictPayload, max_tokens=2000,
    )
    payload: VerdictPayload = out.data  # type: ignore[assignment]

    spread = {o.role: o.payload.dimension_score.model_dump() for o in opinions}

    await _insert(db, "verdicts", {
        "run_id": run_id,
        "model": out.model,
        "headline": payload.headline,
        "conviction": payload.conviction,
        "council_split": payload.council_split,
        "crux": payload.crux,
        "body": payload.model_dump(),
        "score_spread": {
            "scores": spread,
            "standings": [{"role": r, "score": s} for r, s in standings],
        },
    })
    await _add_cost(db, run_id, out)
    return payload


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def run_council(run_id: str, idea: str, dossier: Dossier, api_key: str) -> None:
    db = _db()
    await asyncio.to_thread(refresh_roster, db)  # bench changes apply per-run
    try:
        async with httpx.AsyncClient() as client:
            opinions = await _deliberate(client, db, run_id, idea, dossier, api_key)
            reviews = await _review(client, db, run_id, idea, dossier, api_key, opinions)
            await _synthesize(client, db, run_id, idea, dossier, api_key, opinions, reviews)

        await _update_run(db, run_id, {
            "status": "complete",
            "status_detail": None,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
    except SpendCapError:
        await _update_run(db, run_id, {
            "status": "failed",
            "error": (
                "Today's free evaluations are used up. Add your own OpenRouter "
                "key to run now, or try tomorrow."
            ),
        })
        raise
    except Exception as err:
        await _update_run(db, run_id, {"status": "failed", "error": str(err)})
        raise
