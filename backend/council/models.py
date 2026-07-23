"""Shared models. The FinancialFact union is the point: Pydantic will refuse
to construct a figure that has a value but no source. Same guarantee as the
DB CHECK constraint, enforced one layer earlier."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

AdvisorRole = Literal["operator", "gravedigger", "distributor", "why_now"]

ADVISOR_ROLES: list[AdvisorRole] = ["operator", "gravedigger", "distributor", "why_now"]

Provenance = Literal[
    "sec_filing", "company_ir", "press", "funding_db", "company_site", "estimate"
]


class UnavailableFact(BaseModel):
    """A figure we looked for and could not verify. First-class state, not a gap."""
    status: Literal["unavailable"]
    metric: str
    period_label: Optional[str] = None
    note: str  # e.g. "private company, no public reporting" — required


class SourcedFact(BaseModel):
    """A figure that exists only because a source exists."""
    status: Literal["reported", "estimated"]
    metric: str
    period_label: Optional[str] = None
    value: float
    display: str  # human form: "$1.2B", "48,000 employees"
    source_url: str
    provenance: Provenance
    as_of: Optional[date] = None
    note: Optional[str] = None


FinancialFact = Annotated[
    Union[UnavailableFact, SourcedFact],
    Field(discriminator="status"),
]


class ArcBeat(BaseModel):
    year: int
    event: str
    source_url: str  # every beat of the journey carries a source


class Competitor(BaseModel):
    name: str
    status: Literal["public", "private", "acquired", "dead", "unknown"] = "unknown"
    ticker: Optional[str] = None
    one_liner: Optional[str] = None
    homepage: Optional[str] = None
    arc: list[ArcBeat] = []
    facts: list[FinancialFact] = []
    outcome_note: Optional[str] = None


class Dossier(BaseModel):
    competitors: list[Competitor] = []
    gathered_at: str
    notes: list[str] = []


# ---------------------------------------------------------------------------
# Council payloads (what the models must return)
# ---------------------------------------------------------------------------

class DimensionScore(BaseModel):
    score: int = Field(ge=1, le=10)
    dimension: str


class OpinionPayload(BaseModel):
    verdict: Literal["strong_yes", "yes", "mixed", "no", "strong_no"]
    confidence: Literal["low", "medium", "high"]
    headline: str
    argument: str
    strongest_counter_to_my_own_view: str
    unknowns_that_would_change_my_mind: list[str]
    dimension_score: DimensionScore


class UnsupportedClaim(BaseModel):
    label: str
    claim: str
    why: str


class ReviewPayload(BaseModel):
    ranking: list[str]
    reasoning: str
    unsupported_claims: list[UnsupportedClaim] = []
    crux: str


class FalsifiableTest(BaseModel):
    test: str
    timebox: str
    cost: str
    kills_idea_if: str


class DiscardedClaim(BaseModel):
    claim: str
    note: Optional[str] = None


class VerdictPayload(BaseModel):
    headline: str
    conviction: Literal["build", "test_first", "reshape", "walk_away"]
    council_split: str
    crux: str
    strongest_case_for: str
    strongest_case_against: str
    falsifiable_tests: list[FalsifiableTest]
    data_gaps: list[str] = []
    discarded_claims: list[DiscardedClaim] = []

    @field_validator("discarded_claims", mode="before")
    @classmethod
    def _coerce_claims(cls, v):
        # Older chairman outputs returned bare strings; accept both shapes.
        return [{"claim": x} if isinstance(x, str) else x for x in (v or [])]


class PreflightPayload(BaseModel):
    ready: bool
    questions: list[str] = []
    refined: Optional[str] = None
    search_terms: list[str] = []
    implied_competitors: list[str] = []
