# Continue GPT's reviewed image batches in the cloud

Use **Actions → Continue GPT-reviewed DEMO branches → Run workflow**.

1. Enter the existing Hybrid `run_id` whose images GPT classified.
2. Select the providers as a JSON array, for example `["pragmatic","bgaming"]`.
3. Choose the time budget and up to eight concurrent games. Existing per-provider
   capacity and start intervals remain in force.
4. Enable adult confirmation only with the operator's authorization.
5. Optionally select `preflight_only` to verify authentication, production engine
   compatibility and batch counts without starting a browser or changing policies.

The runner replays reviewed menus and purchase branches and uploads the next
screens to the **same batch**. Known semantic confirmations, bonus starts and
result collection are handled by the engine. Unknown choices or changed screens
return to GPT for the next classification batch. When every ready game is waiting
for classification, the execution ends instead of keeping idle browsers alive.
After reviewing that batch, run the same workflow with the same run ID again.

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
