# Continue GPT's reviewed image batches in the cloud

Use **Actions → Continue GPT-reviewed DEMO branches → Run workflow**.

1. Enter the existing Hybrid `run_id` whose images GPT classified.
2. Select the providers as a JSON array, for example `["pragmatic","bgaming"]`.
3. Choose the time budget and up to eight concurrent games. Existing per-provider
   start intervals remain in force. `provider_capacity` temporarily chooses the
   parallel limit for this run (1/2/4/8) and is restored afterwards.
   `games` optionally restricts the run to up to 16 `provider/game` IDs.
4. Enable adult confirmation only with the operator's authorization. Providers
   with a 21+ gate additionally require `confirm_age_21`.
5. Optionally select `preflight_only` to verify authentication, production engine
   compatibility and batch counts without starting a browser or changing policies.

The runner replays reviewed menus and purchase branches and uploads the next
screens to the **same batch**. Known semantic confirmations, bonus starts and
result collection are handled by the engine. Unknown choices or changed screens
return to GPT for the next classification batch. When every ready game is waiting
for classification, the execution ends instead of keeping idle browsers alive.
After reviewing that batch, run the same workflow with the same run ID again.
Set `wait_for_review=true` to poll for the next GPT classification every five
seconds within the same bounded job; otherwise it exits as soon as review is needed.

This workflow is separate from the capture-only catalogue fleet. It uses the
existing REVIEW and INGEST repository secrets and pins its updated engine to an
immutable main commit. Screenshots and sanitized traces remain in private R2;
GitHub artifacts contain the summary only. No new catalogue tickets are seeded
and historical captures/classifications are not replaced.

The runner accepts only games found in the approved frozen catalogue and uses its
existing provider launchers, including fresh contexts and navigation guards. It
refuses to start when a selected provider is already enabled by another fleet.
Normal completion restores provider policies and releases permits. A forced
termination may require operator cleanup of an enabled policy; interrupted
actions remain uncertain and are never silently bought again.

Supported launchers: Pragmatic, BGaming, 1Spin4Win, KA Gaming, 3 Oaks, RubyPlay,
Yggdrasil, Red Tiger, Nolimit City and Playtech. Launcher availability does not
imply that every provider's bonus screens have a semantic adapter: opaque or
unrecognized bonus states still require GPT's next image classification.

The engine's behavior and verification are documented in
[hybrid-cloud-fuzzer: BRANCH_TRANSITIONS](https://github.com/Shisetsu-Code/hybrid-cloud-fuzzer/blob/main/docs/BRANCH_TRANSITIONS.md).

## Browser and completion evidence

The Ubuntu 24.04 job uses its preinstalled Google Chrome through Playwright. It
does not reinstall Chromium or its system packages before every continuation.
The runner installs the 4x DEMO animation clock before the game boots; server
responses and session clocks are not accelerated. The active-transition budget
is ten minutes, so a long bonus is not cut off by the local three-minute default.
The overall start budget stops new games; an active branch drains before exit.

An awarded free-spin start, an intermediate big win and a final bonus result are
different states. A terminal record requires the final result, collection,
stable idle, and the wager trace covering the entire reviewed path. Every new
branch keeps its JPEG even when structured controls are available.

A green GitHub job can also mean it had zero scheduled actions while waiting
for classification. Verify the summary and `metadata.terminal`; a green job
alone is not a completed purchase. Cancellation can take time. Do not start a
replacement while a branch is running, and preserve interrupted work as uncertain.
