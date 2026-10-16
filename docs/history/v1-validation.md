# Release 1.0 validation · October 12, 2026

This is validation of a fictional local demo. No real minors' data was used, no cloud database was connected or migrated, and no deployment was performed.

## Executed checks

| Check | Result |
|---|---|
| `pnpm build` | Passed: optimized Next.js build, eight static pages generated; staff/API routes dynamic |
| `pnpm typecheck` | Passed: strict TypeScript check |
| `pnpm lint` | Passed: no errors or warnings |
| `pnpm test` | 14 tests passed |
| `pnpm test:e2e` | 9 browser workflows passed against the optimized build in installed Microsoft Edge/Chromium |

Domain/auth/persistence tests cover unique fictional records/codes, signed cookie tampering and expiry, origin protection with the actual browser host, repeat in/out events, missing students, pending observations after departure and the next day, reviewer attribution, assistant denial, homework forward transitions, invalid/oversized notes, timezone boundaries, old open visits, arrival histogram coverage, 30 simultaneous serialized writes, persisted records and fail-closed damaged data.

Browser workflows cover:

1. Failed note save retains the draft and displays the error within the open student dialog.
2. Service worker serves a generic offline document without cached student data.
3. Real ZXing QR decoding from a synthetic canvas camera stream reaches the attendance API and stops the media tracks.
4. Two independent staff browsers observe shared saved data; desktop/dark and portrait-tablet layouts render without horizontal overflow.
5. Instructor note and follow-up survive checkout/reload, can be reviewed, and remain in history.
6. Kiosk manual in/out, repeated arrivals, unknown-code error and denied staff-state access.
7. Assistant observation APIs/backup denied, notes hidden, and assigned/prepared/handed-off homework survives reload.
8. Tablet/phone layout, staff controls fitting the landscape sidebar, keyboard dialog close, camera permission-denial fallback and manual entry remaining usable.
9. Unauthenticated staff/export access denied, kiosk requires pairing, and foreign-origin mutation denied.

Tests use a separate fictional data file, `data/e2e-v1.json`, and port 3100. They append their own test notes and packets rather than resetting records. Local demo data remains separate at `data/demo-v1.json`. Synthetic media is test-only; it grants no physical camera access. Screenshots were visually inspected at 1024×768 landscape, 768×1024 portrait, 1440×1000 desktop and 390×844 phone dimensions. The live in-app browser was also inspected. Readability and sidebar fit were refined during validation.

## Corrections made during debugging

Compatible TypeScript and ESLint versions are pinned for Next's current lint plugins. TypeScript 7 was incompatible with typescript-eslint; ESLint 10 exceeded the current React/accessibility/import plugins' peer ranges. ESLint 9.39.5 is a development-only compatibility pin with an upstream deprecation notice; update it when those plugins support ESLint 10.

The origin check now compares the browser Host (or configured exact APP_ORIGIN) rather than Next's normalized internal localhost URL. It retains foreign-origin rejection. The QR cleanup captures the video element and handles delayed camera startup. Save errors remain visible inside the dialog. Histogram buckets cover all recorded daily arrivals rather than assuming an unverified class schedule. Small text and touch targets were enlarged, contrast improved, and the landscape sidebar was compacted to keep account controls accessible. Build tracing is scoped explicitly for the intentional runtime data path.

## Not validated here

- Physical iPad Safari camera behavior, autofocus, rear-camera selection, lighting, printed QR codes, home-screen standalone installation and microphone dictation/provider privacy.
- Physical barcode/QR scanner hardware: none was available and no hardware compatibility is claimed.
- Safari/WebKit browser engine. Tablet screenshots are Chromium viewport checks, not an iPad device test.
- Supabase migrations, live RLS/tenant isolation, kiosk provisioning/revocation, database concurrency, cloud auth or a cloud repository adapter. The included pgTAP privilege/index checks are unexecuted scaffolding and do not constitute full policy validation.
- Corporate attendance compliance/report format or integrations; real-data privacy/corporate authorization remains unresolved.
- Multi-process/file adapter concurrency, power-loss durability, serverless deployment and unattended operational recovery. The file adapter is intentionally one persistent server process only.
- Real browser speech recognition: optional typed/keyboard fallback is available, but no audio was recorded or sent during testing.

Before real use, resolve these gates and add real-device and complete cloud/role/restore tests. No success in this demo establishes corporate compliance or production readiness.
