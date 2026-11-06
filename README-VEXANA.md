# Vexana (SOCAI)

An AI Security Operations Center console, built on the open-source
[AiSOC](https://github.com/beenuar/AiSOC) project (MIT).

This repository is a focused customisation of AiSOC: the product is branded
**Vexana**, the console exposes **fourteen** surfaces and nothing else, and the
AI Estate can connect to **[Kenari.id](https://kenari.id)** as a first-class
LLM provider.

---

## The console

| # | Menu | Route | What it is |
|---|------|-------|------------|
| 1 | Dashboard | `/dashboard` | SOC overview: alert volume, severity mix, first-paint metrics |
| 2 | SOC Insights | `/soc-insights` | Rolling-window MTTA, MTTR, FP rate, cases/day, analyst time saved |
| 3 | SOC Operations | `/soc-ops` | Pipeline health: connector staleness, rejected events, alert posture, pending actions |
| 4 | Alerts | `/alerts` | Alert list and alert detail with the investigation rail |
| 5 | Cases | `/cases` | Case list and the case workspace |
| 6 | MITRE ATT&CK Coverage | `/mitre-coverage` | Technique coverage matrix across the detection library, by tier |
| 7 | AI Copilot | `/copilot` | Conversational triage and investigation |
| 8 | Coverage Advisor | `/coverage-advisor` | Per-technique gap analysis: enabled vs disabled rules |
| 9 | AI Estate | `/ai-estate` | Observed AI assets, and the **Kenari connection** (see below) |
| 10 | Connectors | `/connectors` | Telemetry sources feeding the pipeline |
| 11 | Users | `/settings/users` | Members and roles (admin only) |
| 12 | Roles & Permissions | `/settings/rbac` | Role catalogue and permission matrix |
| 13 | Audit Log | `/audit` | Who changed what, and when |
| 14 | Settings | `/settings` | Workspace, integrations, deployment & AI, appearance |

Every other AiSOC surface (Investigation Queue, Hunt, Detection Rules,
Threat Intel, Attack Graph, Playbooks, Marketplace, FIM, Honeytokens, Purple
Team, MSSP, Team Analytics, SLA, Executive Digest, Compliance, Get started,
Two-factor auth, Cost Dashboard, Explore, Evaluate, Federated Search, Access
Review, Identity) has been **removed from this build** — routes and components,
not just the sidebar. Old links to `/queue` and `/investigate` redirect instead
of 404-ing.

---

## Artificial intelligence: Kenari.id

Two places can hold an LLM credential:

### 1. AI Estate → AI provider (per tenant, recommended)

Open **AI Estate** and use the *AI provider* card:

- Provider: **Kenari (kenari.id)**
- Base URL: `https://kenari.id/v1` (pre-filled)
- Model: pick from the list fetched live from Kenari `GET /v1/models`, or type
  an id (e.g. `deepseek-v4-flash`, `claude-sonnet-5`, `kimi-k3`)
- API key: your `kn-…` key from <https://kenari.id/keys>

**Fetch models** lists the chat-capable models the key can reach. **Test
connection** places one real one-token completion and reports latency, the
model that answered, or the provider's exact refusal. The key is encrypted by
the platform credential vault before it touches the database and is never
returned to the browser.

The same card is also available under **Settings → Deployment & AI**.

### 2. Environment (whole deployment)

Set these before `docker compose up` and the bundled LiteLLM gateway routes
every alias (triage, summary, copilot, hunt, detection, …) to Kenari:

```env
OPENAI_BASE_URL=https://kenari.id/v1
OPENAI_API_KEY=kn-your-key-here
OPENAI_MODEL=deepseek-v4-flash
```

A tenant credential saved in AI Estate overrides the environment for that
tenant only.

### How the provider is wired

Adding Kenari is a four-way change, all of it in `services/api`:

| File | Change |
|------|--------|
| `app/api/v1/endpoints/llm_credentials.py` | `kenari` in the `LlmProvider` literal; requires a base URL and an API key |
| `app/api/v1/endpoints/llm_status.py` | `kenari.id` → `kenari` classifier, so the status panel names it |
| `app/services/llm_credential_probe.py` | default base URL + fallback model for the Test button |
| `migrations/160_kenari_llm_provider.sql` | widens the `tenant_llm_credentials` provider `CHECK` constraint |

Kenari serves the OpenAI `/chat/completions` shape, so no transport change was
needed — the existing OpenAI-compatible client calls it unchanged.

---

## Build and run

Requirements: Docker with Compose v2 (**8 GB RAM, 20 GB free disk**), plus
`bash` and `python3` for the `make` bootstrap.

```bash
git clone https://github.com/Kuray12/SOCAI.git && cd SOCAI
make up            # generates .env, builds the images, prints the console URL
make doctor        # what is up, what is not, and what to do about it
```

`make up` creates an administrator and prints its password **once**. Sign in
at the address it prints.

### Rebuilding after a code change

```bash
# web console only
docker compose build web && docker compose up -d web

# API (Kenari provider changes)
docker compose build api && docker compose up -d api
```

Or rebuild everything locally:

```bash
AISOC_VERSION=local docker compose build web api
AISOC_VERSION=local docker compose up -d
```

`docker-compose.yml` tags the services `ghcr.io/beenuar/aisoc-*` and builds
from this tree by default, so a plain `docker compose build` produces images
that carry this repository's code under the upstream image name.

### First run without Kenari credentials

The stack starts a local model (Ollama) behind the gateway and polls the public
CISA Known Exploited Vulnerabilities feed, so triage and threat intelligence
work before any key is configured. Point AI Estate at Kenari when you want
frontier models.

---

## Development

```bash
pnpm install
cd apps/web
pnpm dev          # console on :3000
pnpm type-check   # tsc --noEmit
pnpm test         # vitest
pnpm build        # production build
```

The API lives in `services/api` (FastAPI). Its tests:

```bash
cd services/api
python -m pytest tests/test_llm_credentials_endpoint.py tests/test_kenari_provider.py
```

---

## Upstream, licence and attribution

Vexana is a derivative of [AiSOC](https://github.com/beenuar/AiSOC) by Beenu
Arora and contributors, used and redistributed under the **MIT License**. The
original copyright notice is retained in [LICENSE](LICENSE) as the licence
requires. Detection content, connectors, services and the console all originate
in that project; this repository changes the console surface, its branding and
the LLM provider list.

If you want the full AiSOC feature set (purple team, playbooks, marketplace,
federated search, MSSP, and more), use upstream.
