"""Kenari (kenari.id) is a first-class BYOK provider, end to end.

Adding a provider name to a platform like this one is a five-place change and
the failure mode is that only some of the places move: the console offers a
value the API rejects, or the API stores it and the status panel calls it
"custom", or the probe has no default base URL and reports "no default for it"
on a key that is fine. Each assertion below fails on exactly one of those.

The last case is a real call: the tenant's stored key must be the bearer that
reaches Kenari, and a smoke prompt must come back with text. It is skipped
unless ``KENARI_API_KEY`` is set in the environment, because CI holds no
credential and a skipped case is honest about that.

Run from ``services/api``:

    python -m pytest tests/test_kenari_provider.py
    KENARI_API_KEY=kn-... python -m pytest tests/test_kenari_provider.py
"""

from __future__ import annotations

import os
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.v1.endpoints.llm_credentials import (
    LlmCredentialUpsert,
    _enforce_provider_invariants,
)
from app.api.v1.endpoints.llm_status import _classify_provider
from app.services import llm_credential_probe
from fastapi import HTTPException

KENARI_BASE = "https://kenari.id/v1"
KENARI_KEY = "kn-test-key"
KENARI_MODEL = "deepseek-v4-flash"


def _user() -> SimpleNamespace:
    return SimpleNamespace(
        tenant_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        role="tenant_admin",
        email="analyst@example.com",
        api_key_prefix=None,
    )


# --------------------------------------------------------------- the enum


def test_the_upsert_model_accepts_kenari():
    payload = LlmCredentialUpsert(provider="kenari", base_url=KENARI_BASE, model=KENARI_MODEL, api_key=KENARI_KEY)
    assert payload.provider == "kenari"


def test_kenari_requires_a_base_url():
    payload = LlmCredentialUpsert(provider="kenari", api_key=KENARI_KEY)
    with pytest.raises(HTTPException) as exc:
        _enforce_provider_invariants(payload, existing=None)
    assert exc.value.status_code == 422
    assert "base_url" in str(exc.value.detail)


def test_kenari_requires_a_key_on_first_write():
    payload = LlmCredentialUpsert(provider="kenari", base_url=KENARI_BASE)
    with pytest.raises(HTTPException) as exc:
        _enforce_provider_invariants(payload, existing=None)
    assert exc.value.status_code == 422
    assert "api_key" in str(exc.value.detail)


def test_a_rotation_only_put_keeps_the_existing_kenari_key():
    # api_key=None on an existing row is the "change the model, not the key"
    # path; it must not be refused for a missing key.
    payload = LlmCredentialUpsert(provider="kenari", base_url=KENARI_BASE, model="claude-sonnet-5")
    existing = SimpleNamespace(provider="kenari", api_key_vault="vault:v1:abc")
    _enforce_provider_invariants(payload, existing=existing)


# --------------------------------------------------------------- the classifier


@pytest.mark.parametrize(
    "url",
    [
        "https://kenari.id/v1",
        "https://kenari.id",
        "https://kenari.id/v1/chat/completions",
    ],
)
def test_status_names_kenari_rather_than_custom(url: str):
    assert _classify_provider(url) == "kenari"


def test_an_unrelated_gateway_stays_custom():
    # The negative control: substring matching must not swallow everything.
    assert _classify_provider("https://gateway.example.com/v1") == "custom"


# --------------------------------------------------------------- the probe


def test_the_probe_knows_where_kenari_answers_without_a_base_url():
    assert llm_credential_probe._base_url_for("kenari", None) == KENARI_BASE
    assert llm_credential_probe._FALLBACK_MODEL["kenari"] == KENARI_MODEL


@pytest.mark.asyncio
async def test_a_kenari_probe_posts_to_chat_completions_with_the_bearer():
    """The probe's URL and auth shape, without dialling anything.

    Kenari serves the OpenAI `/chat/completions` shape, so the only thing that
    can be wrong here is the URL we build and the key we send. Both are
    captured from the real ``safe_chat_completions_request`` call site.
    """
    seen: dict[str, object] = {}

    async def fake_request(**kwargs):
        seen.update(kwargs)

    with (
        patch.object(llm_credential_probe, "safe_chat_completions_request", fake_request),
        patch.object(llm_credential_probe, "validate_outbound_url"),
        patch.object(llm_credential_probe, "enforce_airgap_for_url"),
    ):
        result = await llm_credential_probe.probe_credential(
            provider="kenari",
            base_url=KENARI_BASE,
            model=KENARI_MODEL,
            api_key=KENARI_KEY,
        )

    assert result.outcome == "ok", result.detail
    assert seen["url"] == f"{KENARI_BASE}/chat/completions"
    assert seen["api_key"] == KENARI_KEY
    assert seen["model"] == KENARI_MODEL


# --------------------------------------------------------------- stored models


@pytest.mark.asyncio
async def test_stored_models_dials_the_saved_endpoint_with_the_saved_key():
    """The read-only listing uses what is stored, not what a caller sends."""
    from app.api.v1.endpoints import llm_credentials as endpoints
    from app.services.llm_model_discovery import DiscoveredModel, Discovery

    vault = SimpleNamespace(decrypt=lambda token: "kn-stored")
    row = SimpleNamespace(provider="kenari", base_url=KENARI_BASE, api_key_vault="vault:v1:stored")

    db = MagicMock()
    db.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: row))

    seen: dict[str, object] = {}

    async def fake_discover(*, base_url, api_key, transport=None):
        seen["base_url"] = base_url
        seen["api_key"] = api_key
        return Discovery(outcome="ok", detail="d", models=[DiscoveredModel(id=KENARI_MODEL)], listed=1, excluded=0)

    with (
        patch.object(endpoints, "get_vault", return_value=vault),
        patch.object(endpoints, "discover_chat_models", fake_discover),
    ):
        result = await endpoints.discover_stored_llm_models(current_user=_user(), db=db)

    assert [m.id for m in result.models] == [KENARI_MODEL]
    assert seen == {"base_url": KENARI_BASE, "api_key": "kn-stored"}


@pytest.mark.asyncio
async def test_stored_models_is_a_404_without_a_credential():
    from app.api.v1.endpoints import llm_credentials as endpoints

    db = MagicMock()
    db.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None))

    with pytest.raises(HTTPException) as exc:
        await endpoints.discover_stored_llm_models(current_user=_user(), db=db)
    assert exc.value.status_code == 404


# --------------------------------------------------------------- a real call

LIVE_KEY = os.environ.get("KENARI_API_KEY", "").strip()


@pytest.mark.skipif(not LIVE_KEY, reason="KENARI_API_KEY is not set; no live credential to test with")
@pytest.mark.asyncio
async def test_a_real_key_completes_against_kenari():
    result = await llm_credential_probe.probe_credential(
        provider="kenari",
        base_url=KENARI_BASE,
        model=os.environ.get("KENARI_MODEL", KENARI_MODEL),
        api_key=LIVE_KEY,
    )
    assert result.outcome == "ok", result.detail


# --------------------------------------------------------------- model discovery

# A trimmed copy of the payload kenari.id/v1/models returned when this was
# written: one chat model with OpenAI-compatible metadata, one image model,
# and one row that declares nothing. The discovery heuristic must offer the
# first, hide the second, and offer the third (an undeclared id is assumed to
# be chat unless its name says otherwise).
KENARI_MODELS_PAYLOAD = {
    "data": [
        {
            "id": "deepseek-v4-flash",
            "name": "DeepSeek V4 Flash",
            "object": "model",
            "endpoints": ["chat"],
            "modalities": {"input": ["text", "image"], "output": ["text"]},
        },
        {
            "id": "imagegen-2-pro",
            "name": "ImageGen 2 Pro",
            "object": "model",
            "endpoints": ["images"],
            "modalities": {"input": ["text"], "output": ["image"]},
        },
        {"id": "kimi-k3", "object": "model"},
    ]
}


@pytest.mark.asyncio
async def test_kenari_model_discovery_offers_the_chat_models():
    import json

    import httpx
    from app.services.llm_model_discovery import discover_chat_models

    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=json.dumps(KENARI_MODELS_PAYLOAD))

    result = await discover_chat_models(
        base_url=KENARI_BASE,
        api_key=KENARI_KEY,
        transport=httpx.MockTransport(handler),
    )

    ids = {m.id for m in result.models}
    assert "deepseek-v4-flash" in ids
    assert "kimi-k3" in ids
    assert "imagegen-2-pro" not in ids
    assert result.outcome == "ok", result.detail
    [request] = seen
    assert str(request.url) == f"{KENARI_BASE}/models"
    assert request.headers["authorization"] == f"Bearer {KENARI_KEY}"
