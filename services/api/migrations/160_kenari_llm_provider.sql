-- Migration 160: Kenari (kenari.id) as a selectable BYOK LLM provider.
--
-- Kenari is an OpenAI-compatible gateway (base URL https://kenari.id/v1,
-- bearer keys prefixed `kn-`) that fronts Claude, GPT, Gemini, DeepSeek, Kimi,
-- GLM, Qwen and others. It needed no transport work: the existing
-- OpenAI-compatible caller in `app.services.llm_credential_probe` and the
-- `custom` discovery path both already speak its shape. What it needed was a
-- name, in two places that had to agree:
--
--   * `tenant_llm_credentials_provider_check` (migration 038) -- otherwise the
--     first save fails at the write, with a constraint error rather than a
--     readable message;
--   * the Pydantic `LlmProvider` literal and the classifier in
--     `app.api.v1.endpoints.llm_status` -- otherwise the console refuses the
--     value before it reaches the database, and the status panel labels the
--     provider "custom" even after a successful save.
--
-- The constraint is dropped and re-added rather than widened in place:
-- PostgreSQL cannot `ALTER` a CHECK expression. Re-creating it from the full
-- list (rather than appending to whatever is there) keeps this file readable
-- as the authoritative list; a later migration appends the same way.
--
-- No data migration: every existing row already satisfies the wider
-- constraint, so this is metadata-only for the table.

BEGIN;

ALTER TABLE tenant_llm_credentials
    DROP CONSTRAINT IF EXISTS tenant_llm_credentials_provider_check;

ALTER TABLE tenant_llm_credentials
    ADD CONSTRAINT tenant_llm_credentials_provider_check CHECK (
        provider IN (
            'openai',
            'anthropic',
            'azure-openai',
            'kenari',
            'local-ollama',
            'local-vllm',
            'local-litellm',
            'custom'
        )
    );

COMMIT;
