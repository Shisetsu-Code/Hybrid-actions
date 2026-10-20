# Codex deployment instructions for this repository

Primary handoff: **[docs/CODEX_DEPLOY_RUNBOOK.md](docs/CODEX_DEPLOY_RUNBOOK.md)**. Read it in full *before* modifying code, configuring providers, or starting GitHub Actions.

- This repo is the **GitHub Actions catalogue fleet**, not the Cloudflare backend. The Cloudflare Worker, migrations and API contracts are in **Shisetsu-Code/hybrid-cloud-fuzzer**; that repository's AGENTS.md and docs/CODEX_HANDOFF.md are also required.
- Work from main, preserve config/providers.json runId and the pinned engine SHA until a deliberate, tested change is authorized. The historical hybrid-pragmatic-20261019 run is separate from hybrid-actions-20261020.
- Confirm Cloudflare D1 schema >=4, workforceReady=true and pacingReady=true **before** seeding tickets or launching browsers. An older /health 200 and CI success are NOT sufficient.
- Validate provider public-DEMO URLs, explicit operator approval, allowlist, minStartIntervalMs and maxActive independently. Config currently starts with providers=[] intentionally. Never fabricate URLs, widen scopes, auto-confirm age or interact with real-money accounts.
- Use authorized secret stores for HYBRID_REVIEW_TOKEN and HYBRID_INGEST_TOKEN; never show or commit values. Enable recurring schedule (ENABLE_RECURRING_CATALOG=true) only after a successful pilot.
- CI must pass Node 22, Node 24 and browser-smoke on a mocked local demo. If Codex can access GitHub Actions, capture run links and verify outcomes. No upload-artifact for screenshots.
- Changes with uncertain network/cookie/lease side effects should be isolated by game/provider. Do not interpret the catalogue job as buying, spinning, or a complete visual classification.
- If a secret, Cloudflare account permission, approved provider or workflow action is unavailable, stop at that phase, clearly report the missing capability and request a concrete UI action. Do not claim the deploy occurred.

Output: SHA of both main branches; CI evidence; D1 migrations and health; source of Worker deploy; provider policies; Actions run IDs; queue and R2 evidence; visual-review backlog; exact blockers and recurrence status.
