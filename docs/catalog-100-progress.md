# Catalogue expansion authorized 2026-10-22

- Keep runId `catalog-300-20261021`, shot `base`, all existing captures and decisions.
- Workflow `catalog-100.yml`, manual dispatch from main only, GitHub-hosted ubuntu-latest. Same concurrency group as catalog-300, no overlapping runs.
- Configuration `config/batches/catalog-100-20261022.json`: 966 identities. Nine providers have 100 each; RubyPlay has only 66 configured games. Existing 25-game ordering is preserved before appending identities.
- Eligible: pragmatic, 1spin4win, ka_gaming, bgaming, rubyplay, 3oaks, yggdrasil, nolimit_city, playtech, playngo.
- Excluded: redtiger (repeated HTTP403), amusnet (10 unusable unresolved captures). Preserve their data. Exclude additional providers with confirmed errors from subsequent dispatches.
- Pacing remains 20000ms, maxActive1 per provider. Engine pin unchanged a41ceed63900a6a778c6e864e0ec8e7fe44a9e9d. Each runner timeout120minutes. No local browser/collector execution.
- Initial state: 69 classified, 26 cleanup commands, 15 unresolved quality reviews, 10 RedTiger uncaptured. Expanded eligible denominator966 excludes the two providers but retains existing accepted identities.
- Every30minutes heartbeat `completar-cat-logo-remoto-de-966-juegos` may review progress, activate three existing normal ChatGPT classifiers with disjoint providers, and dispatch the next continuation only after current capture workflow finishes and CI is green. This recurrence is explicitly authorized by the user; the old repository updater remains disabled.
- Async review: capture runners stop without waiting for GPT. Review exact image/session/revision/hash; approve ready images then classify controls. Save only introductory cleanup click/wait instructions, no spins, wagers or purchases. Do not copy coordinates between games.
- Stop individual cleanup after3 attempts without improvement; record unresolved reason. Stop automation when all or at least90% eligible games are classified with no useful progress remaining, or remaining providers are excluded with evidence. Report short final summary and disable heartbeat.
- Classifier1 6ad7f06e-9364-83e8-bdde-f4845647792f: pragmatic,bgaming,playngo,playtech.
- Classifier2 6ad7f07c-a634-83e9-af99-93b67a80ca53: ka_gaming,rubyplay,nolimit_city.
- Classifier3 6ad7f083-4a1c-83e9-b847-e1dae47a09da: 3oaks,yggdrasil,1spin4win. Do not restart active chats or overlap provider ownership.
- Bootstrap: merge the catalog-100-remote PR after remote CI, then dispatch catalog-100.yml with default explicit eligible list, same run_id, games_per_provider100, confirm_adult=true, confirm_age_21=false. No deletes or secret changes.
