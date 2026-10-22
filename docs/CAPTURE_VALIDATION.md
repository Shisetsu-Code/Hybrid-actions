# Screenshot readiness before GPT

All capture, OCR and image tests run on GitHub-hosted runners. The local collector remains disabled.

Every new catalogue JPEG passes an image gate before classification ingest. OCR runs on the runner, without sending rejected images to GPT. Loading, geographical restrictions, explicit errors, age/cookie overlays and supported stake-selection overlays are rejected. Empty or unrecognized images remain uncertain.

Without a reference, a base screenshot needs at least two distinct core instruments (balance, bet, spin). A clearly actionable start/continue screen is recorded as INTRO rather than BASE. This bootstrap check is conservative and does not prove that every possible overlay has been detected.

Approved profiles belong to the exact provider/gameId. They use previously classified images that also pass the image check; profile source hashes and approval are rechecked by the backend. Instrument crops are compared with perceptual hashes. A central-scene comparison prevents accepting a covering dialog solely because balance/bet labels remain visible. Small idle changes have regression coverage; a substantially different valid scene can still require review. Never reuse another game's profile or silently replace a valid reference.

For loading or uncertain screenshots, captures get at most two additional screenshots eight seconds apart within the same browser context. Blocked screens and overlays stop immediately. The upload client and Cloudflare backend both guard the classification queue. The backend requires the private validation report to approve the exact JPEG hash.

Comparison JPEGs and reports live privately in existing R2, outside D1 classification items. No existing decisions are changed. Use MCP `audit_capture_validations` to list reasons and `capture_validation_preview` to see the annotated current image alongside its reference. Without an approved reference, the preview explicitly says so.

Manual workflow `audit-capture-readiness.yml` audits a bounded sample of stored catalogue images, without opening demos or changing classifications. It can seed an initial reference only from the exact already-classified image, after its core instruments pass. Missing captures are reported as missing.

Legacy captures are preserved and are not retroactively claimed to be valid. Run the audit to inspect their quality. Provider HTTP access blocks and geographical restrictions require resolving the official access; the validator does not bypass them.
