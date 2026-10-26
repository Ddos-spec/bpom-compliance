# TERA — Evidence-based progress / V3 -> V4
Date: 26 October 2026 (Asia/Jakarta)
Repository verified: https://github.com/Ddos-spec/bpom-compliance
**Base for this patch: `master` at commit `32f52cda9a0c6abcef87e937321c0dff14c26eb9`.**
The `main` branch is behind at `b8f692958e16a2bcbcdf7ae14c0e386a490b5084` (22 Oct). V3 was already applied to `master` on 25 Oct; V4 is an incremental patch on top of that work, not a fresh unrelated rewrite.

| Workstream | Initial legacy `main` | Verified `master` V3 | V4 mega patch adds | After V4 |
| --- | --- | --- | --- | --- |
| Business flow | Internal govt audit workflow | Public paid per-product intake | Preserved | Functional pilot |
| Landing UI | Internal-first SPA | Editorial marketing site | Preserved latest logo | Functional UI |
| Customer dashboard | Govt work queue | Private order/payment/report | Linked original label attachment, recovery journeys | Improved |
| Payment | No public gateway | Midtrans server checkout, signed webhook, GET Status recovery | Regression coverage preserved | Sandbox UAT pending |
| File uploads | Incomplete/legacy images | Text-only | Authenticated private JPEG/PNG/WebP, ≤2 MB, validated header | Pilot ready; OCR not present |
| Account recovery | No method | Private link only | Email-proof one-time recovery for all orders on email; revoke prior tokens | Conditional on verified email delivery |
| Staff tools | Demo officers, synthetic data | Protected API only | Real responsive console, list/detail/update | Pilot-ready staff UI |
| Backups | No public deployment runbook | Persistent SQLite recommended | Node SQLite online backup + image copy + SHA-256 manifest | Backup tool tested; restore drill needed |
| Deployment | Old Docker & exposed proxy | Node app, insecure `vercel.json` to HTTP IP | Node 24 container + non-root + Caddy TLS + neutralized Vercel rewrites | Docker execution on actual VPS untested |
| Tests | Legacy E2E | Mock API and isolated Chromium | New authorization/image/recovery tests, staff browser QA | Tests pass in local sandbox |
| Legal/rules | Gov BA, incomplete heuristics | No gov claims; preliminary 9-point checklist | Correct limitations preserved | Product-category regulatory review still required |

## Current engineering readiness
- **V4 supports an end-to-end pilot flow in a mocked gateway environment:** application → checkout URL → signed callback → report → staff follow-up; image and recovery added.
- **Not live-production-ready.** Payment not exercised against a real Midtrans sandbox account; email not exercised against a verified sender; Docker on VPS, HTTPS, backup restore and legal/security penetration tests have not been completed.
- **No real production activity or user data was inspected**; only repo source and generated tests were analyzed.
- The quoted Rp25,000 is an example configuration, not an approved market price or BPOM fee.

## Key manual release blockers, prioritized
1. Verify deployed origin, point DNS to VPS, TLS via Caddy; test webhook and callback URLs.
2. Sandbox Midtrans payment-method journeys: pending, settlement/capture, expire, cancel, refund, duplicate/reordered notification, untrusted signature. Confirm settlement webhook from actual provider.
3. Verify Resend domain and sender, test lost-link recovery and email delivery; then configure production sending, anti-abuse monitoring and bounce handling.
4. Compliance/security sign-off: privacy notice, terms, refund policy, data deletion/retention SOP, staff access, backup restore and pentest.
5. Audit rules & product-specific BPOM obligations with human subject expert; optional OCR and photo-to-text feature if required by scope.
6. Add persistent distributed rate limits, audit log, monitoring/alerts and multi-replica-safe status polling when scaling beyond one pilot VPS.

## Evidence commands
```bash
npm test
python tests/ui_isolated.py
python tests/ui_v4_isolated.py
TERA_DATA_DIR=/path/to/persistent/data TERA_BACKUP_DIR=/path/to/offsite/snapshots npm run backup
```
- All local tests use mocks where provider credentials or browser network restrictions prevent genuine external UAT.
- Actual Chromium localhost navigation was blocked (`ERR_BLOCKED_BY_ADMINISTRATOR`) in the build environment; isolated browser source tests passed instead.

## Regulatory/payment references
- JDIH BPOM 31/2018, 20/2021, 6/2024: https://jdih.pom.go.id/view/slide/1560/6/2024/312351bff07989769097660a56395065
- Midtrans notification & signature: https://docs.midtrans.com/docs/https-notification-webhooks
- Midtrans GET Status: https://docs.midtrans.com/reference/get-transaction-status
- Node SQLite backup: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html

**Progress rule:** no invented percent of completion; each area is marked by evidence and remaining release gates.
